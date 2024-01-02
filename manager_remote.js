const MAX_DISTANCE = 120
const TICKS_TO_SQUASH_EFFICIENCY = 10000
const TICKS_TO_CHECK_INFRA = 3000
const TICKS_TO_CHECK_EFFICIENCY = 9000

const DEFENDER_LOST_ENERGY_LIMIT_PER_RCL = 1000

const RESERVE_TICK_THRESHOLD = 1000

global.HAULER_RATIO = 0.43 // 0.4 is ideal.

const NUM_WORK_TO_CONSTRUCT = 6

const NUM_CONSTRUCTION_SITES_PER_ROOM = 6

const VISUAL_OPTION = { font: 0.5, align: 'left' }

Room.prototype.manageRemotes = function () {
    if (!this.memory.remotes) {
        return
    }

    const remoteNames = this.getRemoteNamesSortedByRange()

    if (remoteNames.length === 0) {
        return
    }

    if (!this.memory.activeRemotes || Game.time % 17 === 0) {

        const spawnCapacityAvailable = this.structures.spawn.length * 500

        const basicSpawnCapacity = this.getBasicSpawnCapacity()

        const spawnCapacityForRemotes = spawnCapacityAvailable - basicSpawnCapacity

        let remotesSpawnCapacity = 0

        let i = 1

        this.memory.activeRemotes = []
        this.memory.coreRemotes = []

        for (const remoteName of remoteNames) {

            const status = this.getRemoteStatus(remoteName)

            if (Memory.rooms[remoteName].forbidden) {
                continue
            }

            if (status.abandon) {
                if (status.abandon > Game.time) {
                    const abandonTimerPos = new RoomPosition(25, 5, remoteName)

                    const ramainingTIcks = status.abandon - Game.time

                    Game.map.visual.text(`⏳${ramainingTIcks}`, abandonTimerPos, { fontSize: 5, opacity: 1 })
                    continue
                }
                this.resetRemoteInvaderStatus(remoteName)
                this.resetRemoteThreatLevel(remoteName)
                this.resetRemoteNetIncome(remoteName)
                delete status.abandon
                data.recordLog(`REMOTE: reactivate ${remoteName}`, remoteName)
            }

            const pos = new RoomPosition(45, 5, remoteName)
            Game.map.visual.text(i, pos, { align: 'left', fontSize: 5, opacity: 1 })
            i++
            remotesSpawnCapacity += this.getRemoteSpawnCapacity(remoteName)

            if (remotesSpawnCapacity > spawnCapacityForRemotes) {
                break
            }

            if (((remotesSpawnCapacity + basicSpawnCapacity) / spawnCapacityAvailable) < SPAWN_CAPACITY_THRESHOLD) {
                this.memory.coreRemotes.push(remoteName)
            }
            this.memory.activeRemotes.push(remoteName)
        }
    }

    for (const remoteName of this.memory.activeRemotes) {
        const status = this.getRemoteStatus(remoteName)
        if (status.abandon && status.abandon > Game.time) {
            continue
        }

        if (!this.operateRemote(remoteName)) {
            this._remoteSpawnRequested = true
        }
    }

    if (this.controller.level < 3) {
        return
    }

    if (Game.time % 13 !== 0) {
        return
    }

    for (const remoteName of this.memory.coreRemotes) {
        const status = this.getRemoteStatus(remoteName)

        if (!status || status.state !== 'normal') {
            continue
        }

        if (this.constructRemote(remoteName)) {
            continue
        }

        return
    }
    return
}

Room.prototype.getRemoteNamesSortedByRange = function () {
    if (Game.time % 37 === 0) {
        delete this.heap.remoteNamesSortedByRange
    }

    if (this.heap.remoteNamesSortedByRange) {
        return this.heap.remoteNamesSortedByRange
    }

    const remoteNames = Object.keys(this.memory.remotes).sort((a, b) => {
        let resultA = this.getRemotePathLengthAverage(a)
        let resultB = this.getRemotePathLengthAverage(b)
        if (this.getRemoteStatus(a).intermediate) {
            resultA += 100
        }
        if (this.getRemoteStatus(b).intermediate) {
            resultB += 100
        }
        return resultA - resultB
    })

    return this.heap.remoteNamesSortedByRange = remoteNames
}

Room.prototype.operateRemote = function (remoteName) {
    const remote = Game.rooms[remoteName]
    const status = this.getRemoteStatus(remoteName)

    if (!status) {
        return
    }

    if (status.state === undefined) {
        status.state = 'normal'
        this.resetRemoteNetIncome(remoteName)
    }

    // pos to visual
    const visualPos = new RoomPosition(25, 25, remoteName)

    // state viual
    new RoomVisual(remoteName).text(status.state.toUpperCase(), visualPos)

    // defense department

    // check intermediate
    const intermediateName = status.intermediate
    if (intermediateName) {
        const intermediateStatus = this.memory.remotes[intermediateName]

        // abandon when intermediate room is abandoned
        if (!intermediateStatus || (intermediateStatus.abandon && intermediateStatus.abandon > Game.time)) {
            data.recordLog(`REMOTE: abandon ${remoteName} since intermediate room is gone`, this.name)
            this.abandonRemote(remoteName)
            return true
        }
    }

    // abandon when threatLevel is high (defenders keep dying by users)
    const threatLevel = this.getRemoteThreatLevel(remoteName)
    const threshold = this.controller.level * DEFENDER_LOST_ENERGY_LIMIT_PER_RCL

    if (threatLevel > 0) {
        new RoomVisual(remoteName).text(`⚠️${threatLevel}/${threshold}`, visualPos.x, visualPos.y - 2)
    }

    if (threatLevel > threshold) {
        data.recordLog(`REMOTE: abandon ${remoteName} since defense faild.`, this.name)
        this.abandonRemote(remoteName)
        return
    }

    // abandon remote if room is claimed
    if (remote && remote.controller.owner) {
        data.recordLog(`REMOTE: Abandon ${remoteName}. room is claimed by ${remote.controller.owner.username}`, remoteName)
        this.deleteRemote(remoteName)
        return true
    }

    // check invader or invaderCore
    if (this.checkRemoteInvader(remoteName)) {
        const invaderVisualPos = new RoomPosition(25, 5, remoteName)
        new RoomVisual(remoteName).text(`👿Invader`, visualPos.x, visualPos.y - 1)
        Game.map.visual.text(`👿`, invaderVisualPos, { backgroundColor: '#000000', align: 'left', fontSize: 5, opacity: 1 })
        const defenderTotalCost = (status.enemyTotalCost || 0) * 1.2

        if (defenderTotalCost > threshold) {
            this.abandonRemote(remoteName)
        }

        return this.sendTroops(remoteName, defenderTotalCost)
    } else {
        this.addRemoteThreatLevel(remoteName, -1)
    }

    if (this.checkRemoteInvaderCore(remoteName)) {
        new RoomVisual(remoteName).text(`👿InvaderCore`, visualPos.x, visualPos.y - 1)
        if (!Overlord.getNumCreepsByRole(remoteName, 'colonyCoreDefender')) {
            this.requestColonyCoreDefender(remoteName)
            return false
        }
    }

    // reserve && extract
    // true means next remote can request spawn creep
    // false means next remote cannot request spawn creep
    const reserveRemoteResult = this.reserveRemote(remoteName)
    const extractRemoteResult = this.extractRemote(remoteName)
    return reserveRemoteResult && extractRemoteResult
}

Room.prototype.getEnemyCombatants = function () {
    if (this._enemyCombatants !== undefined) {
        return this._enemyCombatants
    }
    const enemyCreeps = this.findHostileCreeps()
    const enemyCombatants = enemyCreeps.filter(creep => creep.checkBodyParts(['attack', 'ranged_attack']))
    return this._enemyCombatants = enemyCombatants
}

Room.prototype.getIsDefender = function () {
    if (this._isDefender !== undefined) {
        return this._isDefender
    }
    const myCreeps = this.find(FIND_MY_CREEPS)
    for (const creep of myCreeps) {
        if (creep.memory.role === 'colonyDefender' && creep.memory.colony === this.name) {
            return this._isDefender = true
        }
    }
    return this._isDefender = false
}

Room.prototype.getRemoteThreatLevel = function (remoteName) {
    const status = this.getRemoteStatus(remoteName)

    if (!status) {
        return 0
    }

    return status.threatLevel || 0
}

Room.prototype.addRemoteThreatLevel = function (remoteName, amount) {
    const status = this.getRemoteStatus(remoteName)

    if (!status) {
        return
    }

    status.threatLevel = status.threatLevel || 0

    status.threatLevel = Math.max(status.threatLevel + amount, 0)
}

Room.prototype.resetRemoteThreatLevel = function (remoteName) {
    const status = this.getRemoteStatus(remoteName)

    if (!status) {
        return
    }

    delete status.threatLevel
}

/**
 * 
 * @param {string} roomName - roomName to send troops
 * @param {*} cost - total cost to be used to spawn troops
 * @returns whether there are enough troops or not
 */
Room.prototype.sendTroops = function (roomName, cost, options) {
    const defaultOptions = { distance: 0, task: undefined }
    const mergedOptions = { ...defaultOptions, ...options }
    const { distance, task } = mergedOptions

    const buffer = 100

    let colonyDefenders = Overlord.getCreepsByRole(roomName, 'colonyDefender')

    if (distance > 0) {
        colonyDefenders = colonyDefenders.filter(creep => (creep.ticksToLive || 1500) > (distance + creep.body.length * CREEP_SPAWN_TIME + buffer))
    }

    const requestedCost = cost

    if (requestedCost === 0) {
        if (colonyDefenders.length === 0) {
            this.requestColonyDefender(roomName, { bodyLengthMax: 3, task })
            return false
        }
        for (const colonyDefender of colonyDefenders) {
            colonyDefender.memory.waitForTroops = false
        }
        return true
    }

    let totalCost = 0

    for (const colonyDefender of colonyDefenders) {
        const multiplier = colonyDefender.memory.boosted !== undefined ? 4 : 1
        totalCost += colonyDefender.getCost() * multiplier
    }

    if (totalCost >= requestedCost) {
        if (colonyDefenders.find(colonyDefender => colonyDefender.spawning)) {
            return true
        }
        for (const colonyDefender of colonyDefenders) {
            colonyDefender.memory.waitForTroops = false
        }
        return true
    }

    const bodyLengthMax = Math.max(3, Math.ceil(requestedCost / 1100))
    this.requestColonyDefender(roomName, { bodyLengthMax, waitForTroops: true, task })

    return false
}

Room.prototype.reserveRemote = function (remoteName) {
    const remote = Game.rooms[remoteName]

    const status = this.getRemoteStatus(remoteName)
    if (!status) {
        return true
    }

    if (this.energyCapacityAvailable < 650) {
        return true
    }

    const reservationTicksToEnd = this.getRemoteReserveTick(remoteName)

    if (reservationTicksToEnd > 0) {
        // reservation visual
        const controller = remote.controller

        const reservationPos = new RoomPosition(25, 35, remoteName)

        remote.visual.text(`⏱️${controller.reservation.ticksToEnd}`, controller.pos.x + 1, controller.pos.y + 1, { align: 'left' })

        Game.map.visual.text(`⏱️${controller.reservation.ticksToEnd}`, reservationPos, { fontSize: 3, opacity: 1 })

        // if reservation ticksToEnd in enough, break
        if (reservationTicksToEnd > RESERVE_TICK_THRESHOLD) {
            return true
        }
    }

    const reservers = Overlord.getCreepsByRole(remoteName, 'reserver')

    const numClaimParts = reservers.map(creep => creep.getActiveBodyparts('claim')).reduce((a, b) => a + b, 0)

    // if there is a reserver spawning or reserving, break
    if (numClaimParts >= 3) {
        return true
    }

    if (reservers.length < (status.controllerAvailable || 1)) {
        // request reserver
        if (this._remoteSpawnRequested !== true) {
            this.requestReserver(remoteName)
        }
        return false
    }

    return true
}


Room.prototype.extractRemote = function (remoteName) {
    const remote = Game.rooms[remoteName]
    const status = this.getRemoteStatus(remoteName)
    const spawnPos = this.structures.spawn[0] ? this.structures.spawn[0].pos : new RoomPosition(25, 25, this.name)

    if (!status || !status.infraPlan) {
        return true
    }

    const reservationTicksToEnd = this.getRemoteReserveTick(remoteName)
    const reserving = reservationTicksToEnd > 0

    if (reservationTicksToEnd < 0) {
        return true
    }

    // check efficiency and visualize
    const efficiency = this.getRemoteEfficiency(remoteName)
    if (efficiency !== undefined) {
        if (efficiency < 0) {
            data.recordLog(`REMOTE: abandon remote ${remoteName} for low efficiency ${Math.floor(100 * efficiency) / 100}`, this.name)
            this.abandonRemote(remoteName)
            return
        }

    }

    const sourceIds = Object.keys(status.infraPlan)

    let enoughMiner = true
    let enoughHauler = true

    const remoteExtractStat = this.getRemoteExtractStat(remoteName)

    let i = 0
    for (const id of sourceIds) {
        const stat = remoteExtractStat[id]

        // request a miner or a hauler if needed 
        if (stat.numMinerWork < stat.maxMinerWork && stat.numMiner < status.infraPlan[id].available) {
            enoughMiner = false
            if (this._remoteSpawnRequested !== true) {
                let containerId = undefined
                if (remote) {
                    const structures = status.infraPlan[id].structures
                    const containerPacked = structures.find(packed => {
                        const parsed = parseInfraPos(packed)
                        return parsed.structureType === 'container'
                    })
                    const containerParsed = parseInfraPos(containerPacked)
                    const containerPos = containerParsed.pos
                    const container = containerPos.lookFor(LOOK_STRUCTURES).find(structure => structure.structureType === 'container')
                    if (container) {
                        containerId = container.id
                    }
                }

                this.requestColonyMiner(remoteName, id, containerId)
            }
        }

        //check haulers
        const constructionSites = remote ? remote.constructionSites : []

        if (stat.numHaulerCarry < stat.maxHaulerCarry) {
            if (this._remoteSpawnRequested !== true) {
                const pathLength = status.infraPlan[id].pathLength

                const spawnCarryLimit = (status.construction === 'complete')
                    ? 2 * Math.min(Math.floor((this.energyCapacityAvailable - 150) / 150), 16)
                    : 2 * Math.min(Math.floor(this.energyCapacityAvailable / 200), 16)

                const maxNumHauler = Math.ceil(stat.maxHaulerCarry / spawnCarryLimit)

                const spawnCarryEach = 2 * Math.ceil(stat.maxHaulerCarry / 2 / maxNumHauler)

                const haulers = Overlord.getCreepsByRole(remoteName, 'colonyHauler').filter(creep => creep.memory.sourceId === id)

                let numWork = 0;
                for (const hauler of haulers) {
                    numWork += hauler.getNumParts('work')
                }

                if (status.construction === 'proceed' && constructionSites.length > 0) {
                    const maxWork = Math.ceil(NUM_WORK_TO_CONSTRUCT * (reserving ? 1 : 0.5))
                    if (numWork < maxWork) {
                        enoughHauler = false
                        const pathLength = status.infraPlan[id].pathLength
                        this.requestColonyHaulerForConstruct(remoteName, id, pathLength)
                    }
                } else if (status.construction === 'complete') {
                    enoughHauler = false
                    const needRepairer = (numWork === 0)
                    if (TRAFFIC_TEST) {
                        this.requestColonyHauler(remoteName, id, 1, pathLength, false)
                    } else {
                        this.requestColonyHauler(remoteName, id, spawnCarryEach, pathLength, needRepairer)
                    }
                } else {
                    enoughHauler = false
                    this.requestFastColonyHauler(remoteName, id, spawnCarryEach, pathLength)
                }
            }
        }

        // calculate energy near source and visualize
        if (remote) {
            const source = Game.getObjectById(id)

            Game.map.visual.line(spawnPos, source.pos, { color: '#ffe700', width: 0.3 })

            status.infraPlan[id].available = status.infraPlan[id].available || source.available

            const droppedEnergies = source.droppedEnergies

            let energyAmount = 0
            for (const droppedEnergy of droppedEnergies) {
                energyAmount += droppedEnergy.amount
            }

            const container = source.container
            if (container) {
                energyAmount += (container.store[RESOURCE_ENERGY] || 0)
            }

            remote.visual.text(`⛏️${stat.numMinerWork} / ${stat.maxMinerWork}`, source.pos.x + 0.5, source.pos.y - 0.25, VISUAL_OPTION)
            remote.visual.text(`🚚${stat.numHaulerCarry} / ${stat.maxHaulerCarry}`, source.pos.x + 0.5, source.pos.y + 0.5, VISUAL_OPTION)
            remote.visual.text(` 🔋${energyAmount}/2000`, source.pos.x + 0.5, source.pos.y + 1.25, VISUAL_OPTION)

            const color = (stat.numMinerWork < stat.maxMinerWork || stat.numHaulerCarry < stat.maxHaulerCarry || energyAmount > 2000) ? '#740001' : '#000000'
            const visualPos = new RoomPosition(20 + 10 * i, 25, remoteName)
            const align = i === 0 ? 'right' : 'left'

            Game.map.visual.text(`⛏️${stat.numMinerWork} / ${stat.maxMinerWork}\n🚚${stat.numHaulerCarry} / ${stat.maxHaulerCarry}\n🔋${energyAmount}/2000`, visualPos, { align, fontSize: 3, backgroundColor: color, opacity: 1 })


        }
        i++
    }

    return enoughMiner && enoughHauler
}

Room.prototype.getRemoteExtractStat = function (remoteName) {
    this._remoteExtractStatus = this._remoteExtractStatus || {}

    if (this._remoteExtractStatus[remoteName]) {
        return this._remoteExtractStatus[remoteName]
    }

    const status = this.getRemoteStatus(remoteName)
    if (!status) {
        return undefined
    }
    const infraPlan = status.infraPlan
    if (!infraPlan) {
        return undefined
    }

    const result = {}

    const isReserved = this.getRemoteReserveTick(remoteName) > 0
    result.isReserved = isReserved

    const sourceIds = Object.keys(infraPlan)

    const colonyMiners = Overlord.getCreepsByRole(remoteName, 'colonyMiner')
    const colonyHaulers = Overlord.getCreepsByRole(remoteName, 'colonyHauler')

    for (const id of sourceIds) {
        result[id] = {}

        const reservedRatio = isReserved ? 1 : 0.5

        // check miners
        const miners = colonyMiners.filter(creep =>
            creep.memory.sourceId === id &&
            (creep.ticksToLive || 1500) > (3 * creep.body.length + infraPlan[id].pathLength)
        )

        let numWork = 0;
        for (const miner of miners) {
            numWork += miner.getActiveBodyparts(WORK)
        }

        result[id].numMinerWork = numWork
        result[id].maxMinerWork = 5 * reservedRatio
        result[id].numMiner = miners.length

        //check haulers

        // calculate maxCarry, maxNumHauler, numCarry

        const maxCarry = Math.ceil(infraPlan[id].pathLength * HAULER_RATIO * reservedRatio)

        let numCarry = 0;
        const activeHaulers = colonyHaulers.filter(creep => creep.memory.sourceId === id
            && (creep.ticksToLive || 1500) > 3 * creep.body.length)
        for (const haluer of activeHaulers) {
            numCarry += haluer.getActiveBodyparts(CARRY)
        }

        result[id].numHaulerCarry = numCarry
        result[id].maxHaulerCarry = maxCarry
    }

    return this._remoteExtractStatus[remoteName] = result
}

Room.prototype.constructRemote = function (remoteName) {
    const remote = Game.rooms[remoteName]
    const status = this.getRemoteStatus(remoteName)

    if (!status) {
        return true
    }

    const reservationTicksToEnd = this.getRemoteReserveTick(remoteName)

    status.constructionStartTick = status.constructionStartTick || Game.time

    if (Game.time - status.constructionStartTick > TICKS_TO_CHECK_INFRA) {
        status.constructionStartTick = Game.time
        status.construction = 'proceed'
    }

    status.construction = status.construction || 'proceed'

    if (status.construction === 'complete') {
        return true
    }

    // if don't have vision, wait
    if (!remote) {
        return true
    }

    if (reservationTicksToEnd < 0) {
        return true
    }

    // get infraPlan
    const infraPlan = this.getRemoteInfraPlan(remoteName)
    if (infraPlan === ERR_NOT_FOUND) {
        // abandon if not found
        data.recordLog(`REMOTE: Abandon ${remoteName}. cannot find infraPlan`, remoteName)
        this.deleteRemote(remoteName)
        return true
    }


    let end = true
    let numConstructionSites = {}
    let numNewConstructionSites = {}

    while (infraPlan.length > 0) {
        const infraPos = infraPlan.shift()

        const roomName = infraPos.pos.roomName

        if (roomName === this.name) {
            break
        }

        const room = Game.rooms[roomName]

        if (!room) {
            continue
        }

        numConstructionSites[roomName] = numConstructionSites[roomName] || 0
        numNewConstructionSites[roomName] = numNewConstructionSites[roomName] || 0

        if ((numConstructionSites[roomName]) >= NUM_CONSTRUCTION_SITES_PER_ROOM) {
            continue
        }

        const constructionSite = infraPos.pos.lookFor(LOOK_CONSTRUCTION_SITES)
        if (constructionSite[0]) {
            end = false
            numConstructionSites[roomName]++
            continue
        }

        if ((numConstructionSites[roomName]) + (numNewConstructionSites[roomName]) >= NUM_CONSTRUCTION_SITES_PER_ROOM) {
            continue
        }

        if (infraPos.pos.createConstructionSite(infraPos.structureType) === OK) {
            end = false
            numNewConstructionSites[roomName]++
        }
    }

    while (infraPlan.length > 0) {
        const infraPos = infraPlan.pop()

        const roomName = infraPos.pos.roomName

        const room = Game.rooms[roomName]

        if (!room) {
            continue
        }

        numConstructionSites[roomName] = numConstructionSites[roomName] || 0

        const constructionSite = infraPos.pos.lookFor(LOOK_CONSTRUCTION_SITES)
        if (constructionSite[0]) {
            end = false
            numConstructionSites[roomName]++
        } else if (infraPos.pos.createConstructionSite(infraPos.structureType) === OK) {
            end = false
            numConstructionSites[roomName]++
        }

        if (numConstructionSites[roomName] >= NUM_CONSTRUCTION_SITES_PER_ROOM) {
            break
        }
    }


    if (remote && remote.constructionSites.length === 0 && end && Object.keys(Game.constructionSites).length < 90) {
        status.construction = 'complete'
        return true
    }

    return false
}

Room.prototype.getRemoteIdealNetIncomePerTick = function (remoteName) {
    this.heap.remoteIdealNetIncome = this.heap.remoteIdealNetIncome || {}

    if (Game.time % 13 === 0) {
        delete this.heap.remoteIdealNetIncome[remoteName]
    }

    if (this.heap.remoteIdealNetIncome[remoteName]) {
        return this.heap.remoteIdealNetIncome[remoteName]
    }

    const status = this.getRemoteStatus(remoteName)
    if (!status) {
        return undefined
    }
    const infraPlan = status.infraPlan
    if (!infraPlan) {
        return undefined
    }
    const extractStatus = this.getRemoteExtractStat(remoteName)
    if (!extractStatus) {
        return undefined
    }

    const isReserved = extractStatus.isReserved
    const isRoad = status.construction === 'complete'

    let result = 0

    for (const id of Object.keys(infraPlan)) {
        const income = 10 * (isReserved ? 1 : 0.5)
        const distance = infraPlan[id].pathLength

        const minerCost = (800 / (1500 - distance)) * (isReserved ? 1 : 0.5)
        const haluerCost = ((distance * HAULER_RATIO * (isRoad ? 75 : 100) + 100) / 1500) * (isReserved ? 1 : 0.5)
        const containerCost = isRoad ? 0.5 : 0
        const roadCost = isRoad ? (1.6 * distance + 10 * distance / (1500 - distance) + 1.5 * distance / (600 - distance)) * 0.001 : 0

        const totalCost = minerCost + haluerCost + containerCost + roadCost

        const netIncome = income - totalCost

        const stat = extractStatus[id]

        const utilizationRate = Math.min(1, stat.numMinerWork / stat.maxMinerWork, stat.numHaulerCarry / stat.maxHaulerCarry)

        result += netIncome * utilizationRate
    }


    const guardCost = 0.2

    const controllerDistance = this.getRemoteControllerDistance(remoteName)

    const reserverCost = isReserved ? 650 / (600 - controllerDistance) : 0

    result -= guardCost
    result -= reserverCost

    return this.heap.remoteIdealNetIncome[remoteName] = result
}

Room.prototype.getRemoteControllerDistance = function (remoteName) {
    const status = this.getRemoteStatus(remoteName)
    if (!status) {
        return undefined
    }
    if (status.controllerDistance !== undefined) {
        return status.controllerDistance
    }
    const remote = Game.rooms[remoteName]
    if (!remote) {
        return undefined
    }
    const spawnPos = this.structures.spawn[0].pos
    const controllerPos = remote.controller.pos

    const thisRoom = this

    const search = PathFinder.search(spawnPos, { pos: controllerPos, range: 1 }, {
        plainCost: 1,
        swampCost: 5,
        maxOps: 5000,
        roomCallback: function (roomName) {
            const remoteNames = Overlord.remotes
            // if room is not target room and not base room and not one of my remote, do not use that room.
            if (roomName !== remoteName && roomName !== thisRoom.name && !remoteNames.includes(roomName)) {
                return false
            }
        }
    })

    if (search.incomplete) {
        return undefined
    }

    const pathLength = search.path.length

    return status.controllerDistance = pathLength
}

Room.prototype.getRemoteNumSource = function (remoteName) {
    const status = this.getRemoteStatus(remoteName)
    if (!status) {
        return undefined
    }
    const infraPlan = status.infraPlan
    if (!infraPlan) {
        return undefined
    }
    return Object.keys(infraPlan).length
}

Room.prototype.getRemotePathLengthAverage = function (remoteName) {
    const status = this.getRemoteStatus(remoteName)
    if (status.pathLengthAverage !== undefined) {
        return status.pathLengthAverage
    }

    let pathLengthTotal = 0
    let num = 0

    for (const infraPlan of Object.values(status.infraPlan)) {
        pathLengthTotal += infraPlan.pathLength
        num++
    }

    return status.pathLengthAverage = pathLengthTotal / num
}

Room.prototype.getRemoteReserveTick = function (remoteName) {
    if (this._remotesReserveTick && this._remotesReserveTick[remoteName] !== undefined) {
        return this._remotesReserveTick[remoteName]
    }

    const remote = Game.rooms[remoteName]
    if (!remote) {
        return 0
    }

    if (!remote.controller) {
        return 0
    }

    if (!remote.controller.reservation) {
        return 0
    }

    const reservation = remote.controller.reservation

    const sign = reservation.username === MY_NAME ? 1 : -1

    this._remotesReserveTick = this._remotesReserveTick || {}

    return this._remotesReserveTick[remoteName] = reservation.ticksToEnd * sign
}

Room.prototype.getRemoteStatus = function (remoteName) {
    if (!this.memory.remotes) {
        return undefined
    }
    if (!this.memory.remotes[remoteName]) {
        return undefined
    }
    return this.memory.remotes[remoteName]
}

Room.prototype.deleteRemote = function (remoteName) {
    if (this.memory.remotes !== undefined) {
        delete this.memory.remotes[remoteName]
        return
    }
}

Room.prototype.abandonRemote = function (remoteName) {
    const remote = Game.rooms[remoteName]
    if (remote) {
        for (const constructionSite of remote.constructionSites) {
            constructionSite.remove()
        }
    }

    for (const creep of Overlord.getCreepsByAssignedRoom(remoteName)) {
        creep.memory.getRecycled = true
    }

    const status = this.getRemoteStatus(remoteName)
    if (!status) {
        return
    }

    status.lastAbandonDuration = (status.lastAbandonDuration || 1000)
    status.lastAbandonDuration = 2 * status.lastAbandonDuration
    status.abandon = Game.time + status.lastAbandonDuration
    data.recordLog(`REMOTE: abandon remote ${remoteName} for ${status.lastAbandonDuration} ticks.`, this.name)
}

Room.prototype.resetRemoteInvaderStatus = function (remoteName) {
    const status = this.getRemoteStatus(remoteName)

    if (!status) {
        return false
    }

    delete status.isInvader
    delete status.isKiller
    delete status.enemyTotalCost

    if (Memory.rooms[remoteName]) {
        delete Memory.rooms[remoteName].isInvader
        delete Memory.rooms[remoteName].isKiller
    }

}

/**
 * check if there is hostile creeps
 * and return the number of total body parts of hostile creeps
 * 
 * @param {string} remoteName - roomName of remote
 * @returns {number} - number of total body parts of invaders
 */
Room.prototype.checkRemoteInvader = function (remoteName) {
    const remote = Game.rooms[remoteName]
    const status = this.getRemoteStatus(remoteName)
    if (!status) {
        return false
    }

    if (!remote) {
        return status.isInvader
    }

    const hostileCreeps = remote.findHostileCreeps().filter(creep => creep.checkBodyParts(['work', 'attack', 'ranged_attack', 'heal', 'claim']))
    const hostileAttackers = []
    const hostileCombatants = []

    for (const creep of hostileCreeps) {
        if (creep.checkBodyParts(['attack', 'ranged_attack', 'heal'])) {
            hostileCombatants.push(creep)
        }
        if (creep.checkBodyParts(['attack', 'ranged_attack'])) {
            hostileAttackers.push(creep)
        }
    }

    if (!status.isInvader && hostileCreeps.length > 0) {
        status.isInvader = true
        remote.memory.isInvader = true
    } else if (status.isInvader && hostileCreeps.length === 0) {
        status.isInvader = false
        remote.memory.isInvader = false
    }

    if (!remote.memory.isKiller && hostileAttackers.length > 0) {
        remote.memory.isKiller = true
        status.isKiller = true
    } else if (remote.memory.isKiller && hostileAttackers.length === 0) {
        status.isKiller = false
        remote.memory.isKiller = false

        const roomInfo = Overlord.map[remoteName]
        if (roomInfo) {
            delete roomInfo.inaccessible
            delete roomInfo.threat
        }
    }

    let totalCost = 0

    for (const combatant of hostileCombatants) {
        totalCost += combatant.getCost()
    }

    status.enemyTotalCost = totalCost

    return status.isInvader
}

Room.prototype.checkRemoteInvaderCore = function (remoteName) {
    const remote = Game.rooms[remoteName]
    const status = this.getRemoteStatus(remoteName)

    if (!status) {
        return false
    }

    if (!remote) {
        return status.isInvaderCore
    }
    const invaderCores = remote.find(FIND_HOSTILE_STRUCTURES).filter(structure => structure.structureType === STRUCTURE_INVADER_CORE)
    if (!status.isInvaderCore && invaderCores.length) {
        status.isInvaderCore = true
    } else if (status.isInvaderCore && !invaderCores.length) {
        status.isInvaderCore = false
    }
    return status.isInvaderCore
}

Room.prototype.addRemoteCost = function (remoteName, amount) {
    const status = this.getRemoteStatus(remoteName)
    if (!status) {
        return
    }
    status.netIncome = status.netIncome || 0
    status.netIncome -= amount
}

Room.prototype.addRemoteProfit = function (remoteName, amount) {
    const status = this.getRemoteStatus(remoteName)
    if (!status) {
        return
    }
    status.netIncome = status.netIncome || 0
    status.netIncome += amount
}

Room.prototype.resetRemoteNetIncome = function (remoteName, resetAbandon = false) {
    const status = this.getRemoteStatus(remoteName)
    if (!status) {
        return
    }

    status.startTick = Game.time
    status.netIncome = 0
    if (resetAbandon) {
        delete status.abandon
        delete status.lastAbandonDuration
    }
}

Room.prototype.getRemoteEfficiency = function (remoteName) {
    const status = this.getRemoteStatus(remoteName)
    if (!status) {
        return
    }

    if (!status.infraPlan) {
        return
    }

    status.startTick = status.startTick || Game.time
    status.netIncome = status.netIncome || 0

    const ticksPassed = Game.time - status.startTick

    const netIncomePerTick = status.netIncome / ticksPassed

    const numSource = Object.keys(status.infraPlan).length

    const efficiency = netIncomePerTick / numSource / 10

    const visualPos = new RoomPosition(25, 5, remoteName)

    const color = efficiency > 0.5 ? '#000000' : '#740001'
    Game.map.visual.text(`(${Math.floor(efficiency * 100)}%)`, visualPos, { align: 'left', fontSize: 5, backgroundColor: color, opacity: 1 })

    if (ticksPassed < TICKS_TO_CHECK_EFFICIENCY) {
        return
    }

    if (ticksPassed > TICKS_TO_SQUASH_EFFICIENCY) {
        const squashFactor = 2
        status.startTick = Game.time - Math.floor(ticksPassed / squashFactor)
        status.netIncome = status.netIncome || 0
        status.netIncome = status.netIncome / squashFactor
    }


    return efficiency
}

/**
 * get positions for containers and roads for remotes
 * @param {String} remoteName - roomName of remote
 * @param {Boolean} reconstruction - if true, ignore past plan and make a new one
 * @returns 
 */
Room.prototype.getRemoteInfraPlan = function (remoteName, reconstruction = false) {
    const NEAR_SOURCE_COST = 30

    // set mapInfo
    Overlord.map[remoteName] = Overlord.map[remoteName] || {}
    const mapInfo = Overlord.map[remoteName]

    // set status in memory of base room
    this.memory.remotes = this.memory.remotes || {}
    this.memory.remotes[remoteName] = this.memory.remotes[remoteName] || {}
    const status = this.memory.remotes[remoteName]

    // if there is infra plan already, unpack and use that
    if (!reconstruction && status.infraPlan && Object.keys(status.infraPlan).length) {
        return this.unpackInfraPlan(status.infraPlan)
    }

    // if we cannot see remote, wait until it has vision
    const remote = Game.rooms[remoteName]
    if (!remote) {
        return ERR_NOT_IN_RANGE
    }

    // set a place to store plan
    status.infraPlan = {}

    // check controller available
    const controllerAvailable = remote.controller.pos.available
    status.controllerAvailable = controllerAvailable

    // set roadPositions. it's used to find a path preferring road or future road.
    const roadPositions = []
    const basePlan = this.basePlan
    if (basePlan) {
        for (let i = 1; i <= 8; i++) {
            for (const structure of basePlan[`lv${i}`]) {
                if (structure.structureType === STRUCTURE_ROAD) {
                    roadPositions.push(structure.pos)
                }
            }
        }
    }

    const thisRoom = this

    const anchor = this.storage || this.structures.spawn[0]

    if (!anchor || !anchor.RCLActionable) {
        return ERR_NOT_FOUND
    }

    // sort sources by travel distance
    const sources = [...remote.sources]
    if (sources.length > 1) {
        sources.sort((a, b) => a.pos.findPathTo(anchor.pos).length - b.pos.findPathTo(anchor.pos).length)
    }

    // check for each source
    for (const source of sources) {
        // find path from source to storage of base
        const search = PathFinder.search(source.pos, { pos: anchor.pos, range: 1 }, {
            plainCost: 2,
            swampCost: 4, // swampCost higher since road is more expensive on swamp
            roomCallback: function (roomName) {
                const remoteNames = thisRoom.memory.activeRemotes ? thisRoom.memory.activeRemotes : []
                // if room is not target room and not base room and not one of my active remote, do not use that room.
                if (roomName !== remoteName && roomName !== thisRoom.name && !remoteNames.includes(roomName)) {
                    return false
                }

                const room = Game.rooms[roomName];
                if (!room) {
                    return true;
                }

                const costs = new PathFinder.CostMatrix;
                for (const pos of roadPositions) {
                    if (pos.roomName === roomName) {
                        costs.set(pos.x, pos.y, 1)
                    }
                }

                room.find(FIND_STRUCTURES).forEach(function (structure) {
                    if (structure.structureType === STRUCTURE_ROAD) {
                        costs.set(structure.pos.x, structure.pos.y, 1)
                        return
                    }

                    if (structure.structureType === STRUCTURE_CONTAINER) {
                        if (structure.room.name === remoteName && structure.pos.getRangeTo(source.pos) === 1) {
                            return
                        }
                        costs.set(structure.pos.x, structure.pos.y, 255)
                        return
                    }

                    if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
                        costs.set(structure.pos.x, structure.pos.y, 255)
                        return
                    }

                })

                for (const sourceInner of room.sources) {
                    if (source.id === sourceInner.id) {
                        continue
                    }
                    for (const pos of sourceInner.pos.getInRange(1)) {
                        if (!pos.isWall && costs.get(pos.x, pos.y) < NEAR_SOURCE_COST) {
                            costs.set(pos.x, pos.y, NEAR_SOURCE_COST)
                        }
                    }
                }

                if (roomName === thisRoom.name && basePlan) {
                    for (let i = 1; i <= 8; i++) {
                        for (const structure of basePlan[`lv${i}`]) {
                            if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
                                costs.set(structure.pos.x, structure.pos.y, 255)
                            }
                        }
                    }
                }

                return costs;
            }
        })

        // if there's no path, continue to next source
        if (search.incomplete) {
            continue
        }

        const path = search.path
        const pathLength = path.length
        const available = source.available

        if (pathLength > MAX_DISTANCE) {
            continue
        }

        const structures = []

        // containerPos should be first since we want to build container first

        const containerPos = path.shift()
        structures.push(containerPos.packInfraPos('container'))

        for (const pos of path) {
            const roomName = pos.roomName
            if (roomName !== this.name && roomName !== remoteName) {
                status.intermediate = roomName
            }
            roadPositions.push(pos)
            structures.push(pos.packInfraPos('road'))
            new RoomVisual(pos.roomName).structure(pos.x, pos.y, 'road')
        }

        // store infraPlan at status
        status.infraPlan[source.id] = { pathLength, available, structures: structures }
    }

    if (Object.keys(status.infraPlan).length === 0) {
        mapInfo.notForRemote = true
        return ERR_NOT_FOUND
    }

    return this.unpackInfraPlan(status.infraPlan)
}

Room.prototype.unpackInfraPlan = function (infraPlan) {
    const result = []

    let arrayOfStructures = []
    for (const plan of Object.values(infraPlan)) {
        const structures = [...plan.structures]
        arrayOfStructures.push(structures)
    }

    arrayOfStructures.sort((a, b) => a.length - b.length)

    while (arrayOfStructures.length > 0) {
        for (const structures of arrayOfStructures) {
            const packed = structures.shift()
            result.push(parseInfraPos(packed))
        }
        arrayOfStructures = arrayOfStructures.filter(structures => structures.length > 0)
    }
    return result
}

RoomPosition.prototype.packInfraPos = function (structureType) {
    const coord = this.y * 50 + this.x
    const roomName = this.roomName
    return `${roomName} ${coord} ${structureType}`
}

function parseInfraPos(packed) {
    const splited = packed.split(' ')
    const roomName = splited[0]
    const coord = splited[1]
    const x = coord % 50
    const y = (coord - x) / 50
    return { pos: new RoomPosition(x, y, roomName), structureType: splited[2] }
}