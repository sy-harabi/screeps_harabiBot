Room.prototype.manageSpawn = function () {
    if (!this.structures.spawn.find(s => !s.spawining)) {
        return ERR_BUSY
    }

    if (!this.structures.tower.length && this.find(FIND_HOSTILE_CREEPS).length && !this.creeps.colonyDefender.length) {
        this.requestColonyDefender(this.name)
    }

    // manager 생산
    if (this.sources[0].linked || (this.sources[1] ? this.sources[1].linked : false) || this.controller.linked) {
        const manageCarryTotal = this.getManagerCarryTotal()
        if (manageCarryTotal < 24) {
            this.requestHauler(24, { isUrgent: (manageCarryTotal <= 0), isManager: true, office: this.storage.link })
        }
        this.visual.text(`📤${manageCarryTotal}`, this.storage.pos.x - 2.9, this.storage.pos.y + 0.75, { font: 0.5, align: 'left' })
    }

    // laborer 생산
    const maxWork = this.maxWork
    const maxLaborer = Math.ceil((this.heap.sourceUtilizationRate || 0) * maxWork / this.laborer.numWorkEach) // source 가동률만큼만 생산 
    if (this.laborer.numWork < maxWork && this.creeps.laborer.filter(creep => (creep.ticksToLive || 1500) > 3 * creep.body.length).length < maxLaborer) {
        this.requestLaborer(Math.min((maxWork - this.laborer.numWork), this.laborer.numWorkEach))
    }

    // extractor 생산
    if (this.terminal && this.structures.extractor.length && this.mineral.mineralAmount > 0 && this.heap.extract) {
        if (this.creeps.extractor.filter(creep => (creep.ticksToLive || 1500 > 3) * creep.body.length).length === 0) {
            this.requestExtractor()
        }
    }

    // wallMaker 생산
    if (this.controller.level === 8 && !this.savingMode && this.structures.weakProtection.length) {
        if (this.creeps.wallMaker.filter(creep => (creep.ticksToLive || 1500 > 3) * creep.body.length).length < 1) {
            this.requestWallMaker()
        }
    }

    // researcher 생산
    if (this.heap.needResearcher) {
        if (this.creeps.researcher.filter(creep => (creep.ticksToLive || 1500 > 3) * creep.body.length).length < 1) {
            this.requestResearcher()
        }
    }
    const queue = this.spawnQueue.sort((a, b) => (a.priority - b.priority))
    const spawns = new Array(...this.structures.spawn)
    for (let i = 0; i < spawns.length;) {
        const spawn = spawns[i]
        const spawning = spawn.spawning
        if (!spawning) {
            i++
            continue
        }
        const name = spawning.name
        const role = name.split(' ')[1]
        this.visual.text(`🐣${role}`, spawn.pos.x + 0.75, spawn.pos.y, { font: 0.5, align: 'left' })
        spawns.splice(i, 1)
    }

    let i = 0

    i++
    while (spawns.length && queue.length) {
        const request = queue.shift()
        const spawn = spawns[0]
        if (spawn.spawnRequest(request) === OK) {
            spawns.shift()
        }
    }
    this.heap.spawnQueue = []
}

Room.prototype.getManagerCarryTotal = function () {
    let result = 0
    for (const creep of this.creeps.manager) {
        result += creep.getNumParts('carry')
    }
    return result
}

Object.defineProperties(Room.prototype, {
    spawnQueue: {
        get() {
            this.heap.spawnQueue = this.heap.spawnQueue || []
            return this.heap.spawnQueue
        },
    }
})

global.RequestSpawn = function (body, name, memory, option = { priority: 0, cost: 0 }) {
    this.body = body
    this.name = name
    this.memory = memory
    this.priority = option.priority
    this.cost = option.cost
}

Spawn.prototype.spawnRequest = function (request) {
    const result = this.spawnCreep(request.body, request.name, { memory: request.memory })
    if (request.cost && result === OK) {
        const colonyName = request.memory.colonyName
        if (colonyName) {
            this.room.addColonyCost(request.memory.colonyName, cost)
        }
    }
    return result
}

Room.prototype.requestMiner = function (source, priority) {
    const maxEnergy = this.energyAvailable
    let body = []
    if (source.linked) {
        if (maxEnergy >= 800) {
            body = [WORK, WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, CARRY]
        } else if (maxEnergy >= 700) { //여력이 되면
            body = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, CARRY]
        } else if (maxEnergy >= 550) {
            body = [WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE]
        } else {
            body = [WORK, WORK, CARRY, MOVE]
        }
    } else {
        if (maxEnergy >= 750) {
            body = [WORK, WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE]
        } else if (maxEnergy >= 650) { //여력이 되면
            body = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE]
        } else if (maxEnergy >= 550) {
            body = [WORK, WORK, WORK, WORK, WORK, MOVE]
        } else {
            body = [WORK, WORK, MOVE, MOVE]
        }
    }

    const name = `${this.name} miner ${Game.time}${this.spawnQueue.length}`
    const memory = { role: 'miner', sourceId: source.id }
    const request = new RequestSpawn(body, name, memory, { priority: priority })

    this.spawnQueue.push(request)
}

Room.prototype.requestHauler = function (numCarry, option = { isUrgent: false, isManager: true, office: undefined }) {
    const { isUrgent, isManager, office } = option
    let body = []
    const maxEnergy = isUrgent ? this.energyAvailable : this.energyCapacityAvailable
    for (let i = 0; i < Math.min(Math.ceil(numCarry / 2), Math.floor(maxEnergy / 150), 16); i++) {
        body.push(CARRY, CARRY, MOVE)
    }

    const name = `${this.name} hauler ${Game.time}${this.spawnQueue.length}`

    const memory = isManager ? { role: 'manager', storageLinkId: office.id } : { role: 'hauler', sourceId: office.id }

    const priority = isUrgent ? 1 : 3

    const request = new RequestSpawn(body, name, memory, { priority: priority })

    this.spawnQueue.push(request)
}

global.SPAWN_PRIORITY = {
    'colonyDefender': 0,
    'laborer': 5,
    'researcher': 6,
    'extractor': 7,
    'reserver': 8,
    'colonyMiner': 9,
    'colonyHauler': 10,
    'colonyLaborer': 11,
    'wallMaker': 12,
    'claimer': 13,
    'pioneer': 14,
    'depositWorker': 15
}

Room.prototype.requestLaborer = function (numWork) {
    let body = []
    for (let i = 0; i < numWork; i++) {
        body.push(MOVE, CARRY, WORK)
    }

    const name = `${this.name} laborer ${Game.time}${this.spawnQueue.length}`

    const memory = {
        role: 'laborer',
        controller: this.controller.id,
        working: false
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['laborer'] })
    this.spawnQueue.push(request)
}

Room.prototype.requestWallMaker = function () {
    let body = []
    for (let i = 0; i < Math.min(16, Math.floor(this.energyAvailable / 200)); i++) {
        body.push(MOVE, CARRY, WORK)
    }

    const name = `${this.name} wallMaker ${Game.time}${this.spawnQueue.length}`

    const memory = {
        role: 'wallMaker',
        working: false
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['wallMaker'] })
    this.spawnQueue.push(request)
}

Room.prototype.requestExtractor = function () {
    const body = []
    for (i = 0; i < Math.min(10, Math.floor(this.energyAvailable / 450)); i++) {
        body.push(WORK, WORK, WORK, WORK, MOVE)
    }

    const name = `${this.name} extractor ${Game.time}${this.spawnQueue.length}`

    const memory = {
        role: 'extractor',
        terminal: this.terminal.id,
        extractor: this.structures.extractor[0].id,
        mineral: this.mineral.id,
        resourceType: this.mineralType
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['extractor'] })
    this.spawnQueue.push(request)
}

Room.prototype.requestResearcher = function () {
    const body = []
    for (i = 0; i < Math.min(10, Math.floor(this.energyAvailable / 150)); i++) {
        body.push(MOVE, CARRY, CARRY)
    }

    const name = `${this.name} researcher ${Game.time}${this.spawnQueue.length}`

    const memory = {
        role: 'researcher'
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['researcher'] })
    this.spawnQueue.push(request)
}

Room.prototype.requestReserver = function (colonyName) {
    let body = []
    for (i = 0; i < Math.min(5, Math.floor(this.energyAvailable / 650)); i++) {
        body.push(CLAIM, MOVE)
    }

    const name = `${colonyName} reserver`

    const memory = {
        role: 'reserver',
        base: this.name,
        colony: colonyName
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['reserver'] })
    this.spawnQueue.push(request)
}

Room.prototype.requestColonyLaborer = function (colonyName, sourceId) {
    let body = []
    let cost = 0
    for (let i = 0; i < Math.min(Math.floor(this.energyCapacityAvailable / 250), 5); i++) {
        body.push(WORK, MOVE, CARRY, MOVE)
        cost += 250
    }

    const name = `${colonyName} colonyLaborer ${Game.time}${this.spawnQueue.length}`
    const memory = {
        role: 'colonyLaborer',
        base: this.name,
        colony: colonyName,
        sourceId: sourceId
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['colonyLaborer'], cost: cost })
    this.spawnQueue.push(request)
}

Room.prototype.requestColonyMiner = function (colonyName, sourceId) {
    let body = [CARRY]
    let cost = 0
    for (let i = 0; i < Math.min(Math.floor((this.energyCapacityAvailable - 50) / 150), 6); i++) {
        body.push(WORK, MOVE)
        cost += 150
    }

    const name = `${colonyName} colonyMiner ${Game.time}${this.spawnQueue.length}`
    const memory = {
        role: 'colonyMiner',
        base: this.name,
        colony: colonyName,
        sourceId: sourceId
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['colonyMiner'], cost: cost })
    this.spawnQueue.push(request)
}

Room.prototype.requestColonyDefender = function (colonyName) {
    let body = []
    let cost = 0
    const bodyLength = Math.min(Math.floor((this.energyCapacityAvailable) / 200), 10)
    for (let i = 0; i < bodyLength; i++) {
        body.push(MOVE)
        cost += 50
    }
    for (let i = 0; i < Math.floor(bodyLength / 2); i++) {
        body.push(RANGED_ATTACK, RANGED_ATTACK)
        cost += 230
    }

    const name = `${colonyName} colonyDefender`
    const memory = {
        role: 'colonyDefender',
        base: this.name,
        colony: colonyName
    }
    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['colonyDefender'], cost: cost })
    this.spawnQueue.push(request)
}

Room.prototype.requestColonyCoreDefender = function (colonyName) {
    let body = []
    let cost = 0
    const bodyLength = Math.min(Math.floor((this.energyCapacityAvailable) / 130), 25)
    for (let i = 0; i < bodyLength; i++) {
        body.push(MOVE)
        cost += 50
    }
    for (let i = 0; i < bodyLength; i++) {
        body.push(ATTACK)
        cost += 80
    }

    const name = `${colonyName} colonyCoreDefender`
    const memory = {
        role: 'colonyDefender',
        base: this.name,
        colony: colonyName
    }
    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['colonyDefender'], cost: cost })
    this.spawnQueue.push(request)
}

Room.prototype.requestColonyHauler = function (colonyName, sourceId, maxCarry, sourcePathLength) {
    let body = [WORK, MOVE]
    let cost = 0
    for (let i = 0; i < Math.min(Math.floor((this.energyCapacityAvailable - 150) / 150), 16, Math.ceil(maxCarry / 2)); i++) {
        body.push(CARRY, CARRY, MOVE)
        cost += 150
    }

    const name = `${colonyName} colonyHauler ${Game.time}${this.spawnQueue.length}`
    const memory = {
        role: 'colonyHauler',
        base: this.name,
        colony: colonyName,
        sourceId: sourceId,
        sourcePathLength: sourcePathLength
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['colonyHauler'], cost: cost })
    this.spawnQueue.push(request)
}

Room.prototype.requestClaimer = function (targetRoomName) {
    let body = [CLAIM, MOVE, MOVE, MOVE, MOVE, MOVE,]

    const name = `${targetRoomName} claimer ${Game.time}${this.spawnQueue.length}`

    const memory = {
        role: 'claimer',
        base: this.name,
        targetRoom: targetRoomName
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['claimer'] })
    this.spawnQueue.push(request)
}

Room.prototype.requestDepositWorker = function (depositRequest) {
    let body = []
    for (let i = 0; i < 5; i++) {
        body.push(MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, WORK, WORK, WORK)
    }

    const name = `${depositRequest.depositId} depositWorker ${Game.time}${this.spawnQueue.length}`
    const memory = {
        role: 'depositWorker',
        base: this.name,
        targetRoom: depositRequest.roomName
    }
    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['depositWorker'] })
    this.spawnQueue.push(request)
}

Room.prototype.requestPioneer = function (targetRoomName, number) {
    let body = []
    for (j = 0; j < Math.min(10, Math.floor(this.energyAvailable / 200)); j++) {
        body.push(WORK, MOVE, CARRY)
    }

    const name = `${targetRoomName} pioneer ${Game.time}${number}`

    const memory = {
        role: 'pioneer',
        targetRoom: targetRoomName,
        working: false,
        number: number
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['pioneer'] })
    this.spawnQueue.push(request)
}