const RAMPART_HITS_MAX = 100000000 //100M
const WALLMAKER_NUM_MAX = 10

global.SPAWN_PRIORITY = {
    'roomDefender': 1,
    'attacker': 2,
    'healer': 2,
    'hauler': 3,
    'manager': 4,
    'laborer': 5,
    'colonyDefender': 6,
    'researcher': 7,
    'extractor': 8,
    'reserver': 9,
    'colonyMiner': 10,
    'colonyHauler': 11,
    'colonyLaborer': 12,
    'wallMaker': 13,
    'dismantler': 14,
    'claimer': 15,
    'pioneer': 16,
    'depositWorker': 17,
    'scouter': 18,
}

Room.prototype.manageSpawn = function () {
    if (!this.structures.spawn.find(s => !s.spawining)) {
        return ERR_BUSY
    }

    if (!this.structures.tower.length && this.find(FIND_HOSTILE_CREEPS).length && !this.creeps.colonyDefender.length) {
        this.requestColonyDefender(this.name)
    }

    const level = this.controller.level

    // manager 생산. 전시에는 무조건 생산
    if (this.storage) {
        const managers = this.creeps.manager.filter(creep => (creep.ticksToLive || 1500) > 3 * creep.body.length)
        const researchers = this.creeps.researcher.filter(creep => (creep.ticksToLive || 1500) > 3 * creep.body.length)
        const MAX_CARRY = 24
        const MAX_NUM = Math.max(1, this.structures.link.length - 1)
        this.spawnCapacity += Math.ceil(MAX_CARRY * MAX_NUM * 1.5)
        if (managers.length + researchers.length < MAX_NUM) {
            this.requestManager(MAX_CARRY, { isUrgent: (managers.length <= 0) })
        } else {
            this.enoughManager = true
        }
        this.visual.text(`📤${managers.length + researchers.length}/${MAX_NUM}`, this.storage.pos.x - 2.9, this.storage.pos.y + 0.75, { font: 0.5, align: 'left' })
    }

    // laborer 생산
    const EMERGENCY_WORK_MAX = 60

    let maxWork = 0
    if (this.memory.defenseNuke && this.memory.defenseNuke.state === 'repair' && this.storage && this.storage.store['energy'] > 20000) {
        maxWork = EMERGENCY_WORK_MAX
    } else {
        maxWork = (this.storage ? 1 : Math.ceil((this.heap.sourceUtilizationRate || 0))) * this.maxWork
    }
    this.spawnCapacity += maxWork * 3
    const maxLaborer = Math.min(this.controller.available, Math.ceil(maxWork / this.laborer.numWorkEach)) // source 가동률만큼만 생산 
    if (this.laborer.numWork < maxWork && this.creeps.laborer.filter(creep => (creep.ticksToLive || 1500) > 3 * creep.body.length).length < maxLaborer) {
        this.requestLaborer(Math.min((maxWork - this.laborer.numWork), this.laborer.numWorkEach))
    }

    this.visual.text(`🛠️${this.laborer.numWork}/${maxWork}`, this.controller.pos.x + 0.75, this.controller.pos.y - 0.5, { align: 'left' })

    // 여기서부터는 전시에는 생산 안함
    if (!this.memory.militaryThreat) {
        // extractor 생산
        if (this.terminal && this.structures.extractor.length && this.mineral.mineralAmount > 0 && this.terminal.store.getFreeCapacity() > 50000) {
            this.spawnCapacity += Math.min(10, Math.floor(this.energyAvailable / 450)) * 5
            if (this.creeps.extractor.filter(creep => (creep.ticksToLive || 1500 > 3) * creep.body.length).length === 0) {
                this.requestExtractor()
            }
        }

        // wallMaker 생산
        if (this.controller.level === 8 && this.structures.rampart.length > 0 && this.weakestRampart.hits < RAMPART_HITS_MAX) {
            // 2buffer만큼 storageEnergy 많아질때마다 wallMaker 하나씩 추가. 최대 WALLMAKER_NUM_MAX 마리
            const maxNumWallMaker = Math.min(WALLMAKER_NUM_MAX, Math.max(0, Math.ceil(this.energyLevel / 2)))
            this.spawnCapacity += Math.min(16, Math.floor(this.energyAvailable / 200)) * maxNumWallMaker
            if (this.creeps.wallMaker.filter(creep => (creep.ticksToLive || 1500 > 3) * creep.body.length).length < maxNumWallMaker) {
                this.requestWallMaker()
            }
        }
    }

    // researcher 생산
    if (this.heap.needResearcher) {
        if (this.creeps.researcher.filter(creep => (creep.ticksToLive || 1500 > 3) * creep.body.length).length < 1) {
            if (this.enoughManager === true) {
                const candidate = this.creeps.manager.sort((a, b) => (b.ticksToLive || 0) - (a.ticksToLive || 0))[0]
                candidate.say(`📤➡️🧪`, true)
                candidate.memory.role = 'researcher'
            } else {
                this.requestResearcher()
            }
        }
    }

    // manage spawn
    const queue = this.spawnQueue.sort((a, b) => (a.priority - b.priority))
    const spawns = new Array(...this.structures.spawn)

    this.memory.spawnCapacity = this.spawnCapacity
    this.memory.spawnCapacityAvailable = spawns.length * 500
    this.visual.text(`🐣${this.spawnCapacity}/${500 * spawns.length}`, spawns[0].pos.x, spawns[0].pos.y - 1, { font: 0.5, })
    let j = 0
    for (let i = 0; i < spawns.length;) {
        const spawn = spawns[i]
        const spawning = spawn.spawning
        if (!spawning) {
            i++
            continue
        }
        const name = spawning.name
        const role = name.split(' ')[1]
        this.visual.text(`🐣${role}`, spawn.pos.x + 0.75, spawn.pos.y + j, { font: 0.5, align: 'left' })
        j++
        spawns.splice(i, 1)
    }

    while (spawns.length && queue.length) {
        const request = queue.shift()
        const spawn = spawns[0]
        if (spawn.spawnRequest(request) === OK) {
            spawns.shift()
            continue
        }
    }
    this.heap.spawnQueue = []
}

Room.prototype.getManagerCarryTotal = function () {
    let result = 0
    const managers = this.creep.manager.filter(creep => (creep.ticksToLive || 1500) > 3 * creep.body.length)
    for (const creep of managers) {
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

global.RequestSpawn = function (body, name, memory, options = {}) {
    const defaultOptions = { priority: Infinity, cost: 0 }
    const mergedOptions = { ...defaultOptions, ...options }
    const { priority, cost, boostResources } = mergedOptions
    this.body = body
    this.name = name
    this.memory = memory
    this.priority = priority
    this.cost = cost
    if (boostResources !== undefined) {
        const boostRequest = new BoostRequest(this.name, this.body, boostResources)
        this.boostRequest = boostRequest
    }
}

/**
 * boost request to be handled by room
 * @param {Creep} creepName - The target creep name
 * @param {Array} resourceTypes - The array of resourceTypes
 * @param {Object} options 
 */
function BoostRequest(creepName, body, resourceTypes) {
    this.time = Game.time
    this.creepName = creepName
    this.requiredResources = {}
    for (resourceType of resourceTypes) {
        const bodyType = BOOSTS_EFFECT[resourceType].type
        const numBodyType = body.filter(part => part === bodyType).length
        const mineralAmount = 30 * numBodyType
        const energyAmount = 20 * numBodyType
        this.requiredResources[resourceType] = { mineralAmount, energyAmount }
    }
}

Spawn.prototype.spawnRequest = function (request) {
    const result = this.spawnCreep(request.body, request.name, { memory: request.memory })
    if (result !== OK) {
        return result
    }

    if (request.cost) {
        const colonyName = request.memory.colony
        if (colonyName) {
            this.room.addRemoteCost(colonyName, request.cost)
        }
    }

    if (request.boostRequest) {
        this.room.boostQueue[request.name] = request.boostRequest
    }

    return result
}

Room.prototype.requestMiner = function (source, priority) {
    if (this.memory.militaryThreat) {
        priority = 6
    }
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

Room.prototype.requestManager = function (numCarry, option = { isUrgent: false }) {
    const { isUrgent } = option
    let body = []
    const maxEnergy = isUrgent ? this.energyAvailable : this.energyCapacityAvailable
    for (let i = 0; i < Math.min(Math.ceil(numCarry / 2), Math.floor(maxEnergy / 150), 16); i++) {
        body.push(CARRY, CARRY, MOVE)
    }

    const name = `${this.name} manager ${Game.time}_${this.spawnQueue.length}`

    const memory = { role: 'manager' }

    let priority = SPAWN_PRIORITY['manager']
    if (isUrgent) {
        priority -= 2
    }

    const request = new RequestSpawn(body, name, memory, { priority: priority })

    this.spawnQueue.push(request)
}

Room.prototype.requestHauler = function (numCarry, option = { isUrgent: false, office: undefined }) {
    const { isUrgent, office } = option
    let body = []
    const maxEnergy = isUrgent ? this.energyAvailable : this.energyCapacityAvailable
    for (let i = 0; i < Math.min(Math.ceil(numCarry / 2), Math.floor(maxEnergy / 150), 16); i++) {
        body.push(CARRY, CARRY, MOVE)
    }

    const name = `${this.name} hauler ${Game.time}_${this.spawnQueue.length}`

    const memory = { role: 'hauler', sourceId: office.id }

    let priority = SPAWN_PRIORITY['hauler']
    if (isUrgent) {
        priority -= 2
    }

    const request = new RequestSpawn(body, name, memory, { priority: priority })

    this.spawnQueue.push(request)
}

Room.prototype.requestLaborer = function (numWork) {
    let body = []
    for (let i = 0; i < numWork; i++) {
        body.push(MOVE, CARRY, WORK)
    }

    const name = `${this.name} laborer ${Game.time}_${this.spawnQueue.length}`

    const memory = {
        role: 'laborer',
        controller: this.controller.id,
        working: false
    }

    let boostResources = undefined

    if (this.controller.level < 8 && !this.heap.constructing && this.getResourceTotalAmount('XGH2O') >= LAB_BOOST_MINERAL * numWork) {
        boostResources = ['XGH2O']
        memory.boosted = false
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['laborer'], boostResources })
    this.spawnQueue.push(request)
}

Room.prototype.requestWallMaker = function () {
    let body = []
    for (let i = 0; i < Math.min(16, Math.floor(this.energyAvailable / 200)); i++) {
        body.push(MOVE, CARRY, WORK)
    }

    const name = `${this.name} wallMaker ${Game.time}_${this.spawnQueue.length}`

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

    const name = `${this.name} extractor ${Game.time}_${this.spawnQueue.length}`

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

    const name = `${this.name} researcher ${Game.time}_${this.spawnQueue.length}`

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
        colony: colonyName,
        ignoreMap: 1
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['reserver'] })
    this.spawnQueue.push(request)
}

Room.prototype.requestColonyLaborer = function (colonyName, sourceId) {
    let body = []
    let cost = 0
    for (let i = 0; i < Math.min(Math.floor(this.energyCapacityAvailable / 250), 10); i++) {
        body.push(WORK, MOVE, CARRY, MOVE)
        cost += 250
    }

    const name = `${colonyName} colonyLaborer ${Game.time}_${this.spawnQueue.length}`
    const memory = {
        role: 'colonyLaborer',
        base: this.name,
        colony: colonyName,
        sourceId: sourceId,
        ignoreMap: 1
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

    const name = `${colonyName} colonyMiner ${Game.time}_${this.spawnQueue.length}`
    const memory = {
        role: 'colonyMiner',
        base: this.name,
        colony: colonyName,
        sourceId: sourceId,
        ignoreMap: 1
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['colonyMiner'], cost: cost })
    this.spawnQueue.push(request)
}

Room.prototype.requestColonyDefender = function (colonyName, options = {}) {
    const defaultOptions = { doCost: true, bodyLengthMax: 5 }
    const mergedOptions = { ...defaultOptions, ...options }
    const { doCost, bodyLengthMax } = mergedOptions

    let body = []
    let cost = 0
    const bodyLength = Math.min(Math.floor((this.energyCapacityAvailable) / 1100), bodyLengthMax, 5)

    for (let i = 0; i < 5 * bodyLength - 1; i++) {
        body.push(MOVE)
        cost += 50
    }
    for (let i = 0; i < bodyLength * 4; i++) {
        body.push(RANGED_ATTACK)
        cost += 150
    }
    for (let i = 0; i < bodyLength - 1; i++) {
        body.push(HEAL)
        cost += 250
    }

    body.push(MOVE, HEAL)
    cost += 300

    const name = `${colonyName} colonyDefender ${Game.time}_${this.spawnQueue.length}`
    const memory = {
        role: 'colonyDefender',
        base: this.name,
        colony: colonyName
    }
    if (!doCost) {
        cost = 0
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

    const name = `${colonyName} colonyCoreDefender ${Game.time}_${this.spawnQueue.length}`
    const memory = {
        role: 'colonyCoreDefender',
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

    const name = `${colonyName} colonyHauler ${Game.time}_${this.spawnQueue.length}`
    const memory = {
        role: 'colonyHauler',
        base: this.name,
        colony: colonyName,
        sourceId: sourceId,
        sourcePathLength: sourcePathLength,
        ignoreMap: 1
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['colonyHauler'], cost: cost })
    this.spawnQueue.push(request)
}

Room.prototype.requestClaimer = function (targetRoomName) {
    let body = [CLAIM, MOVE, MOVE, MOVE, MOVE, MOVE,]

    const name = `${targetRoomName} claimer ${Game.time}_${this.spawnQueue.length}`

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

Room.prototype.requestPioneer = function (targetRoomName, number = 0) {
    let body = []
    for (j = 0; j < Math.min(10, Math.floor(this.energyAvailable / 200)); j++) {
        body.push(WORK, MOVE, CARRY)
    }

    const name = `${targetRoomName} pioneer ${Game.time}_${number}`

    const memory = {
        role: 'pioneer',
        targetRoom: targetRoomName,
        working: false,
        number: number
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['pioneer'] })
    this.spawnQueue.push(request)
}

Room.prototype.requestScouter = function () {
    let body = [MOVE]

    const name = `${this.name} scouter ${Game.time}_${this.spawnQueue.length}`

    const memory = {
        role: 'scouter'
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['scouter'] })
    this.spawnQueue.push(request)
}