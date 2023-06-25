StructureObserver.prototype.depositCheck = function (roomName) {
    const targetRoom = Game.rooms[roomName]
    if (!targetRoom) {
        this.observeRoom(roomName)
        return
    }

    if (!this.room.memory.depositRequests) {
        this.room.memory.depositRequests = {}
    }

    const deposits = targetRoom.find(FIND_DEPOSITS)
    for (const deposit of deposits) {
        if (this.room.memory.depositRequests[deposit.id]) {
            continue
        }
        const depositRequest = new DepositRequest(this.room, deposit)
        const workSize = 15
        const returnRatio = 2.5
        const workerEnergyCost = 3250
        const maxCooldown = workSize * (1500 - depositRequest.distance * 2.4) * business.getSellPrice(deposit.depositType) / (returnRatio * workerEnergyCost * business.getSellPrice(RESOURCE_ENERGY)) - 10
        if (depositRequest.lastCooldown < maxCooldown) {
            depositRequest.maxCooldown = maxCooldown
            this.room.memory.depositRequests[depositRequest.depositId] = depositRequest
            data.recordLog(`${this.room.name} find deposit in ${roomName} with lastCooldown ${depositRequest.lastCooldown} and maxCooldown ${depositRequest.maxCooldown}`)
        }
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
}

Room.prototype.runDepositWork = function (depositRequest) {

    let numWorker = 0
    for (let i = 0; i < depositRequest.available; i++) {
        const depositWorker = Game.creeps[`deposit ${depositRequest.depositId} worker ${i}`]

        if (depositWorker || depositRequest.lastCooldown <= depositRequest.maxCooldown) {
            numWorker++
        }

        if (!depositWorker && depositRequest.lastCooldown <= depositRequest.maxCooldown) {
            this.spawnDepositWorker(depositRequest, i)
            continue
        }

        if (depositWorker) {
            depositWorker.depositWork(depositRequest)
        }
    }

    const deposit = Game.getObjectById(depositRequest.depositId)

    if (deposit) {
        depositRequest.lastCooldown = deposit.lastCooldown
    }

    if (depositRequest.lastCooldown > depositRequest.maxCooldown && numWorker === 0) {
        delete this.memory.depositRequests[depositRequest.depositId]
        return
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

    if (this.ticksToLive < depositRequest.distance * 1.2) {
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
        this.moveMy(targetPos, 1)
        return
    }

    const deposit = Game.getObjectById(depositRequest.depositId)

    if (!deposit) {
        delete Game.rooms[this.memory.base].memory.depositRequests[depositRequest.depositId]
    }

    if (this.harvest(deposit) === -9) {
        this.moveMy(deposit, 1)
        return
    }
}