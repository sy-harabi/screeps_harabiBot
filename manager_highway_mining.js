const WORKER_SIZE = 15
const RETURN_RATIO = 2
const WORKER_ENERGY_COST = 3250 //15w10c25m
const THREAT_LEVEL_THRESHOLD = 10

Room.prototype.depositCheck = function (roomName) {
    const targetRoom = Game.rooms[roomName]
    if (!targetRoom) {
        return
    }

    if (this.structures.factory.length === 0 || !this.terminal || this.controller.level < 7) {
        return
    }

    if (!this.memory.depositRequests) {
        this.memory.depositRequests = {}
    }

    const deposits = targetRoom.find(FIND_DEPOSITS)
    for (const deposit of deposits) {
        if (this.memory.depositRequests[deposit.id]) {
            continue
        }
        if (this.terminal && this.terminal.store[deposit.depositType] > 10000) {
            continue
        }

        const depositRequest = new DepositRequest(this, deposit)

        const maxCooldown = WORKER_SIZE * (1500 - depositRequest.distance * 2.2) * Business.getMaxBuyOrder(deposit.depositType, this.name).finalPrice / (RETURN_RATIO * WORKER_ENERGY_COST * Business.energyPrice)

        // check spawnCapacity
        let spawnCapacity = this.memory.spawnCapacity
        spawnCapacity += depositRequest.available * 50 * 3
        if (spawnCapacity / this.memory.spawnCapacityAvailable > 0.9) {
            continue
        }

        // check cooldown
        if (depositRequest.lastCooldown >= maxCooldown) {
            continue
        }

        depositRequest.maxCooldown = maxCooldown
        this.memory.depositRequests[depositRequest.depositId] = depositRequest
        data.recordLog(`DEPOSIT: ${deposit.depositType}(lastCooldown ${depositRequest.lastCooldown}, maxCooldown ${depositRequest.maxCooldown}) in ${roomName}`, this.name)
    }
}

global.DepositRequest = function (room, deposit) {
    const factory = room.structures.factory[0]

    if (!factory) {
        return
    }

    const path = PathFinder.search(deposit.pos, { pos: factory.pos, range: 1 }, {
        plainCost: 1,
        swampCost: 5,
        roomCallback: function (roomName) {
            if (ROOMNAMES_TO_AVOID.includes(roomName)) {
                return false
            }
            if (Game.rooms[roomName]) {
                return Game.rooms[roomName].basicCostmatrix
            }
            return
        },
        maxOps: 5000
    })

    const distance = path.cost
    this.pos = deposit.pos
    this.roomName = deposit.pos.roomName
    this.available = Math.min(deposit.pos.available, 3)
    this.distance = distance
    this.depositId = deposit.id
    this.factoryId = factory.id
    this.lastCooldown = deposit.lastCooldown
    this.threatLevel = 0
}

Room.prototype.runDepositWork = function (depositRequest) {
    const depositWorkers = Overlord.getCreepsByRole(depositRequest.depositId, 'depositWorker')
    const numDepositWorker = depositWorkers.length

    if (depositRequest.lastCooldown > depositRequest.maxCooldown && numDepositWorker === 0) {
        data.recordLog(`DEPOSIT: retreat from deposit ${depositRequest.depositId}. cooldown exceeded max cooldown`, depositRequest.roomName)
        delete this.memory.depositRequests[depositRequest.depositId]
        return
    }

    if (depositRequest.threatLevel > THREAT_LEVEL_THRESHOLD) {
        data.recordLog(`DEPOSIT: retreat from deposit ${depositRequest.depositId} because of threat.`, depositRequest.roomName)
        delete this.memory.depositRequests[depositRequest.depositId]
        return
    }

    if (depositRequest.lastCooldown <= depositRequest.maxCooldown) {
        this.spawnCapacity += depositRequest.available * 50 * 3
    }

    for (const worker of depositWorkers) {
        worker.depositWork(depositRequest)
    }

    const deposit = Game.getObjectById(depositRequest.depositId)

    if (deposit) {
        depositRequest.lastCooldown = deposit.lastCooldown
        new RoomVisual(depositRequest.roomName).text(depositRequest.maxCooldown, depositRequest.pos)
    }

    if (numDepositWorker < depositRequest.available && depositRequest.lastCooldown <= depositRequest.maxCooldown) {
        this.requestDepositWorker(depositRequest)
    }
}

Creep.prototype.depositWork = function (depositRequest) {
    if (!Game.rooms[this.memory.base]) {
        return
    }

    if (this.memory.supplying && this.store.getUsedCapacity() === 0) {
        this.memory.supplying = false
    } else if (!this.memory.supplying && this.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        this.memory.supplying = true
    }

    if (this.ticksToLive < depositRequest.distance * 1.1) {
        this.memory.supplying = true
    }

    if (this.memory.supplying) {
        const factory = Game.getObjectById(depositRequest.factoryId)
        if (!factory) {
            return
        }

        for (const resourceType of Object.keys(this.store)) {
            this.giveCompoundTo(factory, resourceType)
            return
        }
    }

    if (this.room.name !== depositRequest.roomName) {
        const targetPos = new RoomPosition(depositRequest.pos.x, depositRequest.pos.y, depositRequest.pos.roomName)
        if (this.moveMy({ pos: targetPos, range: 1 }) === ERR_NO_PATH) {
            depositRequest.threatLevel++
        }
        return
    }

    const deposit = Game.getObjectById(depositRequest.depositId)

    if (!deposit) {
        delete Game.rooms[this.memory.base].memory.depositRequests[depositRequest.depositId]
    }

    if (this.pos.getRangeTo(deposit) > 1) {
        this.moveMy({ pos: deposit.pos, range: 1 })
        return
    }

    this.harvest(deposit)
}