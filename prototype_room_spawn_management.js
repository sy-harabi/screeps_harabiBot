const RAMPART_HITS_THRESHOLD = 50000000 //50M

const WALLMAKER_NUM_WORK_BASIC = 10
const WALLMAKER_NUM_WORK_MAX = 120

const ENERGY_TO_SPAWN_WALLMAKER = 50000

const MANAGER_MAX_CARRY = 24

const ENERGY_LEVEL_TO_REPAIR_RAMPARTS = 10

global.EMERGENCY_WORK_MAX = 100
global.WALL_HITS_PER_RCL = 200000

global.SPAWN_PRIORITY = {
    'hauler': 2,

    'roomDefender': 2,

    'attacker': 2,
    'healer': 2,

    'manager': 3,
    'scouter': 3,
    'laborer': 3,
    'wallMaker': 3,
    'distributor': 3,

    'powerBankAttacker': 4,
    'powerBankHealer': 4,

    'highwayHauler': 5,
    'colonyDefender': 5,

    'reserver': 6,
    'colonyMiner': 6,

    'colonyHauler': 7,


    'researcher': 8,
    'extractor': 8,

    'claimer': 9,
    'dismantler': 9,
    'pioneer': 9,
    'depositWorker': 9,
    'looter': 9
}

Room.prototype.manageSpawn = function () {
    if (!this.hasAvailableSpawn()) {
        return ERR_BUSY
    }

    if (!this.structures.tower.length && this.find(FIND_HOSTILE_CREEPS).length && !this.creeps.colonyDefender.length) {
        this.requestColonyDefender(this.name)
    }

    // manager 생산. 전시에는 무조건 생산
    const maxNumManager = this.getMaxNumManager()
    if (maxNumManager > 0) {
        const managers = this.creeps.manager.filter(creep => (creep.ticksToLive || 1500) > 3 * creep.body.length)
        const researchers = this.creeps.researcher.filter(creep => (creep.ticksToLive || 1500) > 3 * creep.body.length)

        if (managers.length + researchers.length < maxNumManager) {
            this.requestManager(MANAGER_MAX_CARRY, { isUrgent: (managers.length <= 0) })
        } else {
            this.enoughManager = true
        }

        this.visual.text(`📤${managers.length + researchers.length}/${maxNumManager}`, this.storage.pos.x - 2.9, this.storage.pos.y + 1.75, { font: 0.5, align: 'left' })
    }

    // distributor
    if (this.controller.level >= 5 && this.getHubCenterPos()) {
        const numDistributor = this.creeps.distributor.filter(creep => (creep.ticksToLive || 1500) > (3 * creep.body.length - 2)).length
        if (numDistributor === 0) {
            this.requestDistributor()
        }
    }

    // laborer 생산

    let maxWork = 0
    const repairingForNuke = this.memory.defenseNuke && ['build', 'repair'].includes(this.memory.defenseNuke.state) && this.energyLevel > 50
    if (repairingForNuke) {
        maxWork = EMERGENCY_WORK_MAX
    } else {
        maxWork = this.maxWork
    }

    const maxNumLaborer = Math.min(this.controller.available, Math.ceil(maxWork / this.laborer.numWorkEach))
    const numLaborer = this.creeps.laborer.filter(creep => (creep.ticksToLive || 1500) > 3 * creep.body.length).length
    // source 가동률만큼만 생산 

    if (TRAFFIC_TEST) {
        if (numLaborer < this.controller.available && this.laborer.numWork < maxWork) {
            this.requestLaborer(1)
        }
    } else {
        if (numLaborer < maxNumLaborer && this.laborer.numWork < maxWork) {
            if (repairingForNuke) {
                this.requestLaborer(Math.min(maxWork - this.laborer.numWork, this.laborer.numWorkEach), 'XLH2O')
            } else if (this.getIsNeedBoostedUpgrader()) {
                this.requestLaborer(Math.min(maxWork - this.laborer.numWork, this.laborer.numWorkEach), 'XGH2O')
            } else {
                this.requestLaborer(Math.min(maxWork - this.laborer.numWork, this.laborer.numWorkEach), false)
            }
        }
    }

    this.visual.text(`🛠️${this.laborer.numWork}/${maxWork}`, this.controller.pos.x + 0.75, this.controller.pos.y - 0.5, { align: 'left' })

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

    // 여기서부터는 전시에는 생산 안함
    if (!this.memory.militaryThreat) {
        // extractor 생산
        if (this.terminal && this.structures.extractor.length && this.mineral.mineralAmount > 0 && this.terminal.store.getFreeCapacity() > 10000) {
            if (this.creeps.extractor.filter(creep => (creep.ticksToLive || 1500 > 3) * creep.body.length).length === 0) {
                this.requestExtractor()
            }
        }

        // wallMaker 생산
        if (this.creeps.wallMaker.length === 0 && this.getNeedWallMaker()) {
            this.requestWallMaker()
        }
    }


    // manage spawn
    const queue = this.spawnQueue.sort((a, b) => a.priority - b.priority)

    const spawns = new Array(...this.structures.spawn)

    let j = 0

    for (let i = 0; i < spawns.length;) {
        const spawn = spawns[i]
        const spawning = spawn.spawning
        if (!spawning) {
            i++
            continue
        }
        if (spawning.remainingTime === 0) {
            const adjacentCreeps = spawn.pos.findInRange(FIND_MY_CREEPS, 1)
            for (const creep of adjacentCreeps) {
                if (creep.getNextPos()) {
                    continue
                }
                const posToMove = creep.pos.getAtRange(1).find(pos => pos.getRangeTo(spawn.pos) > 1 && pos.walkable && creep.checkEmpty(pos))
                if (posToMove) {
                    if (creep.moveMy(posToMove) === OK) {
                        break
                    }
                }
            }
        }
        const name = spawning.name
        const role = name.split(' ')[1]
        this.visual.text(`🐣${role}`, spawn.pos.x, spawn.pos.y - 0.5 + 0.5 * j, { font: 0.5 })
        j++
        spawns.splice(i, 1)
    }

    if (this.needNotSpawningSpawn) {
        const index = spawns.findIndex((spawn) => !spawn.spawning)
        if (index !== -1) {
            spawns.splice(index, 1)
        }
    }

    while (spawns.length > 0 && queue.length > 0) {
        const request = queue.shift()
        const spawn = spawns.shift()
        if (spawn.spawnRequest(request) === OK) {
            continue
        } else {
            if (queue[0] && request.priority === queue[0].priority) {
                continue
            }
            break
        }
    }
    this.heap.spawnQueue = []
}

Room.prototype.getIsNeedBoostedUpgrader = function () {
    if (this.heap.constructing) {
        return false
    }
    if (this.controller.level === 8) {
        return false
    }
    const numMaxRclRoom = Overlord.myRooms.filter(room => room.controller.level === 8).length
    const boostThreshold = numMaxRclRoom * AMOUNT_TO_ACCUMULATE_BOOSTS / 2
    return Memory.stats.resources['XGH2O'] > boostThreshold
}

Room.prototype.hasAvailableSpawn = function () {
    if (this._hasAvailableSpawn) {
        return this._hasAvailableSpawn
    }

    return this._hasAvailableSpawn = this.structures.spawn.some(s => !s.spawining)
}

Room.prototype.getMaxNumManager = function () {
    if (this.controller.level < 4) {
        return 0
    }
    if (!this.storage) {
        return 0
    }
    return Math.max(1, this.structures.link.length - 1)
}


Room.prototype.getNeedWallMaker = function () {
    if (this.structures.rampart.length === 0) {
        return false
    }

    const weakestRampart = this.weakestRampart

    const maxHits = RAMPART_HITS_MAX[this.controller.level]

    if (weakestRampart.hits > maxHits - 10000) {
        return false
    }

    if (weakestRampart.hits > RAMPART_HITS_THRESHOLD) {
        return this.energyLevel >= 210
    }

    if (this.controller.level === 8) {
        return this.energyLevel >= 180
    }

    const threshold = (this.controller.level - 3) * WALL_HITS_PER_RCL

    // 넘으면 멈춤
    if (weakestRampart.hits > threshold) {
        return false
    }

    return this.energyLevel >= 90
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
        const mineralAmount = Math.min(LAB_MINERAL_CAPACITY, 30 * numBodyType)
        const energyAmount = Math.min(LAB_ENERGY_CAPACITY, 20 * numBodyType)
        this.requiredResources[resourceType] = { mineralAmount, energyAmount }
    }
}

Spawn.prototype.spawnRequest = function (request) {
    const directions = []
    const hubCenterPos = this.room.getHubCenterPos()
    if (request.memory.role === 'distributor' && hubCenterPos) {
        directions.push(this.pos.getDirectionTo(hubCenterPos))
    }
    directions.push(1, 2, 3, 4, 5, 6, 7, 8)

    const result = this.spawnCreep(request.body, request.name, { memory: request.memory, directions })
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

Room.prototype.requestDistributor = function () {
    if (!this.hasAvailableSpawn()) {
        return
    }

    let body = [MOVE]
    const maxEnergy = this.energyCapacityAvailable - 50


    for (let i = 0; i < Math.min(Math.floor(maxEnergy / 50), 16); i++) {
        body.push(CARRY)
    }

    const name = `${this.name} distributor ${Game.time}_${this.spawnQueue.length}`

    const memory = { role: 'distributor' }

    let priority = SPAWN_PRIORITY['distributor']

    const request = new RequestSpawn(body, name, memory, { priority: priority })

    this.spawnQueue.push(request)
}

Room.prototype.requestMiner = function (source, priority) {
    if (!this.hasAvailableSpawn()) {
        return
    }

    if (this.memory.militaryThreat) {
        priority = 6
    }
    const maxEnergy = this.heap.sourceUtilizationRate > 0 ? this.energyCapacityAvailable : this.energyAvailable
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
    if (!this.hasAvailableSpawn()) {
        return
    }

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
    if (!this.hasAvailableSpawn()) {
        return
    }

    const { isUrgent, office } = option
    let body = []
    const maxEnergy = isUrgent ? this.energyAvailable : this.energyCapacityAvailable
    if (this.memory.level >= 3) {
        for (let i = 0; i < Math.min(Math.ceil(numCarry / 2), Math.floor(maxEnergy / 150), 16); i++) {
            body.push(CARRY, CARRY, MOVE)
        }
    } else {
        for (let i = 0; i < Math.min(numCarry, Math.floor(maxEnergy / 100), 25); i++) {
            body.push(CARRY, MOVE)
        }
    }

    const name = `${this.name} hauler ${Game.time}_${this.spawnQueue.length}`

    const memory = { role: 'hauler', sourceId: office.id }

    let priority = SPAWN_PRIORITY['hauler']
    if (isUrgent) {
        priority -= 1
    }

    const request = new RequestSpawn(body, name, memory, { priority: priority })

    this.spawnQueue.push(request)
}

/**
 * 
 * @param {number} numWork - number of work parts
 * @param {string} boost - name of resource used to be boost
 * @returns 
 */
Room.prototype.requestLaborer = function (numWork, boost = false) {
    if (!this.hasAvailableSpawn()) {
        return
    }

    let body = []
    const maxWork = Math.min(2 * Math.ceil(numWork / 2), this.laborer.numWorkEach)
    for (let i = 0; i < maxWork / 2; i++) {
        body.push(MOVE, CARRY, WORK, WORK)
    }

    const name = `${this.name} laborer ${Game.time}_${this.spawnQueue.length}`

    const memory = {
        role: 'laborer',
        controller: this.controller.id,
        working: false
    }

    const options = { priority: SPAWN_PRIORITY['laborer'] }

    if (boost) {
        memory.boosted = false
        options.boostResources = [boost]
    }

    const request = new RequestSpawn(body, name, memory, options)
    this.spawnQueue.push(request)
}

Room.prototype.requestWallMaker = function () {
    if (!this.hasAvailableSpawn()) {
        return
    }

    const maxWork = Math.min(16, Math.floor(this.energyCapacityAvailable / 200))

    let body = []
    for (let i = 0; i < maxWork; i++) {
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
    if (!this.hasAvailableSpawn()) {
        return
    }

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
    if (!this.hasAvailableSpawn()) {
        return
    }

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
    if (!this.hasAvailableSpawn()) {
        return
    }

    const body = []
    let cost = 0
    for (i = 0; i < Math.min(5, Math.floor(this.energyAvailable / 650)); i++) {
        body.push(CLAIM, MOVE)
        cost += 650
    }

    const name = `${colonyName} reserver ${Game.time}`

    const memory = {
        role: 'reserver',
        base: this.name,
        colony: colonyName,
        ignoreMap: 1
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['reserver'], cost })
    this.spawnQueue.push(request)
}

Room.prototype.requestColonyHaulerForConstruct = function (colonyName, sourceId, sourcePathLength) {
    if (!this.hasAvailableSpawn()) {
        return
    }

    let body = []
    let cost = 0
    for (let i = 0; i < Math.min(Math.floor(this.energyCapacityAvailable / 550), 3); i++) {
        body.push(WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE)
        cost += 550
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

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['colonyHauler'] - 1, cost })
    this.spawnQueue.push(request)
}

Room.prototype.requestColonyMiner = function (colonyName, sourceId, containerId) {
    if (!this.hasAvailableSpawn()) {
        return
    }

    let cost = 0
    const body = []
    for (let i = 0; i < Math.min(Math.floor((this.energyCapacityAvailable) / 150), 6); i++) {
        body.push(WORK, MOVE)
        cost += 150
    }

    if (this.energyCapacityAvailable - cost >= 50) {
        body.push(CARRY)
        cost += 50
    }

    const name = `${colonyName} colonyMiner ${Game.time}_${this.spawnQueue.length}`
    const memory = {
        role: 'colonyMiner',
        base: this.name,
        colony: colonyName,
        sourceId: sourceId,
        containerId: containerId,
        ignoreMap: 1
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['colonyMiner'], cost: cost })
    this.spawnQueue.push(request)
}

Room.prototype.requestColonyDefender = function (colonyName, options = {}) {
    if (!this.hasAvailableSpawn()) {
        return
    }

    const defaultOptions = { doCost: true, bodyLengthMax: 5, waitForTroops: false, task: undefined }
    const mergedOptions = { ...defaultOptions, ...options }
    const { doCost, bodyLengthMax, waitForTroops, task } = mergedOptions

    let body = []
    let cost = 0
    const bodyLength = Math.min(Math.floor((this.energyCapacityAvailable) / 1100), bodyLengthMax, 5)

    for (let i = 0; i < bodyLength * 1; i++) {
        body.push(RANGED_ATTACK)
        cost += 150
    }
    for (let i = 0; i < 5 * bodyLength - 1; i++) {
        body.push(MOVE)
        cost += 50
    }
    for (let i = 0; i < bodyLength * 3; i++) {
        body.push(RANGED_ATTACK)
        cost += 150
    }
    for (let i = 0; i < bodyLength - 1; i++) {
        body.push(HEAL)
        cost += 250
    }

    body.push(MOVE, HEAL)
    cost += 300

    if (bodyLength < 1) {
        if (this.energyCapacityAvailable >= 800) {
            body = [RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE, MOVE, MOVE]
            cost = 800
        } else if (this.energyCapacityAvailable >= 520) {
            body = [TOUGH, TOUGH, RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE, MOVE, MOVE]
            cost = 520
        } else {
            body = [TOUGH, RANGED_ATTACK, MOVE, MOVE]
            cost = 260
        }
    }

    const name = `${colonyName} colonyDefender ${Game.time}_${this.spawnQueue.length}`
    const memory = {
        role: 'colonyDefender',
        base: this.name,
        colony: colonyName,
        waitForTroops: waitForTroops
    }

    if (task) {
        memory.task = { category: task.category, id: task.id }
    }

    if (!doCost) {
        cost = 0
    }
    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['colonyDefender'], cost: cost })
    this.spawnQueue.push(request)
}

Room.prototype.requestColonyCoreDefender = function (colonyName) {
    if (!this.hasAvailableSpawn()) {
        return
    }

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

Room.prototype.requestColonyHauler = function (colonyName, sourceId, maxCarry, sourcePathLength, isRepairer = false) {
    if (!this.hasAvailableSpawn()) {
        return
    }

    const body = []
    let cost = 0

    if (isRepairer) {
        body.push(WORK, MOVE)
        cost += 150
    }

    const energyCapacity = this.energyCapacityAvailable - (isRepairer ? 150 : 0)

    for (let i = 0; i < Math.min(Math.floor(energyCapacity / 150), 16, Math.ceil(maxCarry / 2)); i++) {
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
        ignoreMap: 1,
        isRepairer: isRepairer
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['colonyHauler'], cost: cost })
    this.spawnQueue.push(request)
}

Room.prototype.requestFastColonyHauler = function (colonyName, sourceId, maxCarry, sourcePathLength) {
    if (!this.hasAvailableSpawn()) {
        return
    }

    const body = []
    let cost = 0
    for (let i = 0; i < Math.min(Math.floor((this.energyCapacityAvailable) / 100), 25, Math.ceil(maxCarry)); i++) {
        body.push(CARRY, MOVE)
        cost += 100
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
    if (!this.hasAvailableSpawn()) {
        return
    }

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
    if (!this.hasAvailableSpawn()) {
        return
    }

    let body = []
    for (let i = 0; i < 5; i++) {
        body.push(MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, WORK, WORK, WORK)
    }

    const name = `${depositRequest.depositId} depositWorker ${Game.time}_${this.spawnQueue.length}`
    const memory = {
        role: 'depositWorker',
        base: this.name,
        targetRoom: depositRequest.roomName,
        task: { category: depositRequest.category, id: depositRequest.id }
    }
    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['depositWorker'] })
    this.spawnQueue.push(request)
}

Room.prototype.requestPioneer = function (targetRoomName, number = 0) {
    if (!this.hasAvailableSpawn()) {
        return
    }

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
    if (!this.hasAvailableSpawn()) {
        return
    }

    let body = [MOVE]

    const name = `${this.name} scouter ${Game.time}_${this.spawnQueue.length}`

    const memory = {
        role: 'scouter'
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['scouter'] })
    this.spawnQueue.push(request)
}