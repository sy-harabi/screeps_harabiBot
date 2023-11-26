const WORKER_SIZE = 15
const RETURN_RATIO = 2
const WORKER_ENERGY_COST = 3250 //15w10c25m
const THREAT_LEVEL_THRESHOLD = 10

Room.prototype.checkHighway = function (roomName) {
    const targetRoom = Game.rooms[roomName]
    if (!targetRoom) {
        return
    }

    if (this.savingMode || !this.terminal || this.controller.level < 7) {
        return
    }

    this.checkDeposits(targetRoom)

    this.checkPowerBanks(targetRoom)

}

Room.prototype.checkPowerBanks = function (targetRoom) {
    if (!this.memory.powerBankRequests) {
        this.memory.powerBankRequests = {}
    }

    const powerBanks = targetRoom.find(FIND_STRUCTURES).filter(structure => structure.structureType === 'powerBank')

    for (const powerBank of powerBanks) {

        if (this.memory.powerBankRequests[powerBank.id]) {
            continue
        }

        const powerBankRequest = new PowerBankRequest(this, powerBank)

        const requiredAttackPower = this.getRequiredAttackPowerForPowerBank(powerBankRequest)

        if (requiredAttackPower > 1000) {
            continue
        }

        this.registerPowerBank(powerBankRequest)
    }
}

Room.prototype.registerPowerBank = function (powerBankRequest) {
    const id = powerBankRequest.powerBankId
    if (Overlord.powerBanks[id] !== undefined) {
        return
    }
    Overlord.powerBanks[id] = this.name
    this.memory.powerBankRequests[id] = powerBankRequest
}

Room.prototype.deletePowerBank = function (powerBankRequest) {
    const id = powerBankRequest.powerBankId
    delete Overlord.powerBanks[id]
    delete this.memory.powerBankRequests[id]
    return
}


Room.prototype.getRequiredAttackPowerForPowerBank = function (powerBankRequest) {
    const ticksLeft = powerBankRequest.decayTime - Game.time
    const ticksToTravel = powerBankRequest.distance
    const ticksToSpawn = CREEP_SPAWN_TIME * MAX_CREEP_SIZE
    const buffer = 100

    const ticksToAttack = ticksLeft - ticksToTravel - ticksToSpawn - buffer

    if (ticksToAttack <= 0) {
        return undefined
    }

    const requiredAttackPower = Math.ceil(powerBankRequest.hits / ticksToAttack)

    return requiredAttackPower
}

const PowerBankRequest = function (room, powerBank) {
    const terminal = room.terminal

    if (!terminal) {
        return
    }

    const search = PathFinder.search(powerBank.pos, { pos: terminal.pos, range: 1 }, {
        plainCost: 1,
        swampCost: 5,
        roomCallback: function (roomName) {
            if (Game.rooms[roomName]) {
                return Game.rooms[roomName].basicCostmatrix
            }
            return
        },
        maxOps: 5000
    })

    const pos = powerBank.pos
    this.packedCoord = packCoord(pos.x, pos.y)
    this.roomName = pos.roomName
    this.available = Math.min(pos.available, 3)
    this.distance = search.cost
    this.powerBankId = powerBank.id
    this.terminalId = terminal.id
    this.decayTime = Game.time + powerBank.ticksToDecay
    this.hits = powerBank.hits
    this.amount = powerBank.power
    this.threatLevel = 0
}

Room.prototype.checkDeposits = function (targetRoom) {
    if (this.structures.factory.length === 0) {
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

        const maxCooldown = Math.ceil(WORKER_SIZE * (1500 - depositRequest.distance * 2.2) * Business.getMaxBuyOrder(deposit.depositType, this.name).finalPrice / (RETURN_RATIO * WORKER_ENERGY_COST * Business.energyPrice))

        // check cooldown
        if (depositRequest.lastCooldown >= maxCooldown) {
            continue
        }

        const spawnCapacityAvailable = this.structures.spawn.length * 500
        const spawnCapacity = this.getSpawnCapacity()
        const depositSpawnCapacity = this.getDepositSpawnCapacity(depositRequest)
        if (spawnCapacity + depositSpawnCapacity > spawnCapacityAvailable) {
            break
        }

        depositRequest.maxCooldown = maxCooldown
        this.registerDeposit(depositRequest)

        data.recordLog(`DEPOSIT: start deposit mining at ${targetRoom.name} with max cooldown ${maxCooldown}`, this.name)
    }
}

Room.prototype.registerDeposit = function (depositRequest) {
    if (Overlord.deposits[depositRequest.depositId] !== undefined) {
        return
    }
    Overlord.deposits[depositRequest.depositId] = this.name
    this.memory.depositRequests[depositRequest.depositId] = depositRequest
}

Room.prototype.deleteDeposit = function (depositRequest) {
    delete Overlord.deposits[depositRequest.depositId]
    delete this.memory.depositRequests[depositRequest.depositId]
    return
}

const DepositRequest = function (room, deposit) {
    const factory = room.structures.factory[0]

    if (!factory) {
        return
    }

    const search = PathFinder.search(deposit.pos, { pos: factory.pos, range: 1 }, {
        plainCost: 1,
        swampCost: 5,
        roomCallback: function (roomName) {
            if (Game.rooms[roomName]) {
                return Game.rooms[roomName].basicCostmatrix
            }
            return
        },
        maxOps: 5000
    })

    const distance = search.cost
    this.packedCoord = packCoord(deposit.pos.x, deposit.pos.y)
    this.roomName = deposit.pos.roomName
    this.available = Math.min(deposit.pos.available, 3)
    this.distance = distance
    this.depositId = deposit.id
    this.factoryId = factory.id
    this.lastCooldown = deposit.lastCooldown
    this.threatLevel = 0
}

Room.prototype.runPowerBankWork = function (powerBankRequest) {
    const powerBankId = powerBankRequest.powerBankId
    const powerBankAttacker = Game.creeps[`${powerBankId} powerBankAttacker`]
    const powerBankHealer = Game.creeps[`${powerBankId} powerBankHealer`]

    if (!powerBankAttacker) {
        this.requestPowerBankAttacker(powerBankRequest)
        return
    }

    if (!powerBankHealer) {
        this.requestPowerBankHealer(powerBankRequest)
    }

    if (!powerBankAttacker || powerBankAttacker.spawning || powerBankAttacker.memory.boosted !== true) {
        return
    }

    if (!powerBankHealer || powerBankHealer.spawning) {
        return
    }

    powerBankAttacker.attackPowerBank(powerBankRequest)
}

Room.prototype.requestPowerBankAttacker = function (powerBankRequest, boost = true) {

    let body = []

    for (let i = 0; i < 3; i++) {
        body.push(TOUGH)
    }

    for (let i = 0; i < 18; i++) {
        body.push(MOVE)
    }

    for (let i = 0; i < 15; i++) {
        body.push(ATTACK)
    }

    const powerBankId = powerBankRequest.powerBankId

    const name = `${powerBankId} powerBankAttacker`

    const memory = {
        role: 'attacker',
        healer: `${powerBankId} powerBankHealer`,
        base: this.name
    }

    const options = { priority: SPAWN_PRIORITY['powerBankAttacker'] }
    if (boost) {
        options.boostResources = ['XZHO2', 'XGHO2', 'XUH2O']
        memory.boosted = false
    }

    const request = new RequestSpawn(body, name, memory, options)
    this.spawnQueue.push(request)
}

Room.prototype.requestPowerBankHealer = function (powerBankRequest) {

    let body = []

    for (let i = 0; i < 15; i++) {
        body.push(HEAL)
    }
    for (let i = 0; i < 15; i++) {
        body.push(MOVE)
    }
    for (let i = 0; i < 10; i++) {
        body.push(HEAL)
    }
    for (let i = 0; i < 10; i++) {
        body.push(MOVE)
    }

    const powerBankId = powerBankRequest.powerBankId

    const name = `${powerBankId} powerBankHealer`

    const memory = {
        role: 'powerBankHealer',
        attacker: `${powerBankId} powerBankAttacker`,
        base: this.name
    }

    const options = { priority: SPAWN_PRIORITY['powerBankHealer'] }

    const request = new RequestSpawn(body, name, memory, options)
    this.spawnQueue.push(request)
}

Creep.prototype.attackPowerBank = function (powerBankRequest) {
    const base = Game.rooms[this.memory.base]
    if (!base) {
        return
    }

    const healer = Game.creeps[this.memory.healer]

    if (!healer) {
        return
    }

    healer.follow(this)

    if ((this.room.name === healer.room.name && this.pos.getRangeTo(healer) > 1 && Game.time % 3 === 0)) {
        return
    }

    if (this.room.name !== powerBankRequest.roomName) {
        const parsed = parseCoord(powerBankRequest.packedCoord)
        const targetPos = new RoomPosition(parsed.x, parsed.y, powerBankRequest.roomName)
        this.moveMy({ pos: targetPos, range: 1 })
        return
    }

    const powerBank = Game.getObjectById(powerBankRequest.powerBankId)

    if (!powerBank) {
        base.deletePowerBank(powerBankRequest)
    }

    if (this.pos.getRangeTo(powerBank) > 1) {
        this.moveMy({ pos: powerBank.pos, range: 1 })
        return
    }

    healer.care(this)

    if (this.hits / this.hitsMax < 0.5) {
        return
    }

    this.setWorkingInfo(powerBank.pos, 1)
    this.attack(powerBank)
}

Room.prototype.runDepositWork = function (depositRequest) {
    const depositWorkers = Overlord.getCreepsByRole(depositRequest.depositId, 'depositWorker')
    const numDepositWorker = depositWorkers.length

    const isThreat = Overlord.map[depositRequest.roomName] && ((Overlord.map[depositRequest.roomName].threat || 0) > Game.time)

    const shouldEnd = depositRequest.lastCooldown > depositRequest.maxCooldown || isThreat

    if (shouldEnd && numDepositWorker === 0) {
        if (isThreat) {
            data.recordLog(`DEPOSIT: retreat from deposit in ${depositRequest.roomName} because of threat.`, this.name)
        }
        this.deleteDeposit(depositRequest)
        return
    }

    for (const worker of depositWorkers) {
        worker.depositWork(depositRequest)
    }

    const deposit = Game.getObjectById(depositRequest.depositId)

    if (deposit) {
        depositRequest.lastCooldown = deposit.lastCooldown
        new RoomVisual(depositRequest.roomName).text(`⏳${depositRequest.lastCooldown}/${depositRequest.maxCooldown}`, deposit.pos.x, deposit.pos.y - 1)
    }

    const roomName = depositRequest.roomName

    if (!shouldEnd && this.sendTroops(roomName, 10000) === false) {
        return
    }

    if (!shouldEnd && numDepositWorker < depositRequest.available) {
        this.requestDepositWorker(depositRequest)
    }
}

Creep.prototype.depositWork = function (depositRequest) {
    if (!Game.rooms[this.memory.base]) {
        return
    }

    if (this.memory.supplying && this.store.getUsedCapacity() === 0) {
        this.memory.supplying = false
    } else if (!this.memory.supplying && this.store.getFreeCapacity() === 0) {
        this.memory.supplying = true
    }

    const enemyCombatants = this.room.getEnemyCombatants()

    if (enemyCombatants.length > 0) {
        for (const combatant of enemyCombatants) {
            if (this.pos.getRangeTo(combatant.pos) < 10) {
                this.memory.supplying = true
                this.fleeFrom(combatant, 15)
                return
            }
        }
        const isDefender = this.room.getIsDefender()
        if (!isDefender && this.store.getUsedCapacity() > 0) {
            this.memory.supplying = true
        }
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
        return
    }

    if (this.ticksToLive < depositRequest.distance * 1.3) {
        if (this.store.getUsedCapacity() > 0) {
            this.memory.supplying = true
            return
        } else {
            if (this.room.name !== this.memory.base) {
                this.moveToRoom(this.memory.base, 2)
                return
            }
            this.getRecycled()
            return
        }
    }

    if (this.room.name !== depositRequest.roomName) {
        const parsed = parseCoord(depositRequest.packedCoord)
        const targetPos = new RoomPosition(parsed.x, parsed.y, depositRequest.roomName)
        if (this.moveMy({ pos: targetPos, range: 1 }) === ERR_NO_PATH) {
            depositRequest.threatLevel++
        }
        return
    }

    const deposit = Game.getObjectById(depositRequest.depositId)

    if (!deposit) {
        this.deleteDeposit(depositRequest)
    }

    const resourceType = deposit.depositType

    const tombstone = deposit.pos.findInRange(FIND_TOMBSTONES, 3).find(tombstone => tombstone.store[resourceType] > 0)

    if (tombstone) {
        if (this.pos.getRangeTo(tombstone) > 1) {
            this.moveMy({ pos: tombstone.pos, range: 1 })
            return
        }
        this.withdraw(tombstone, resourceType)
        return
    }

    const droppedResource = deposit.pos.findInRange(FIND_DROPPED_RESOURCES, 3).find(droppedResource => droppedResource.resourceType === resourceType)

    if (droppedResource) {
        if (this.pos.getRangeTo(droppedResource) > 1) {
            this.moveMy({ pos: droppedResource.pos, range: 1 })
            return
        }
        this.pickup(droppedResource)
        return
    }

    const range = this.pos.getRangeTo(deposit)
    if (range > 1) {
        const targetPos = deposit.pos.getAtRange(1).find(pos => pos.walkable && (!pos.creep || (pos.creep.my && pos.creep.memory.role !== this.memory.role)))
        if (!targetPos) {
            this.moveMy({ pos: deposit.pos, range: 3 })
            return
        }
        this.moveMy({ pos: targetPos, range: 0 })
        return
    }

    this.setWorkingInfo(deposit.pos, 1)
    this.harvest(deposit)
}