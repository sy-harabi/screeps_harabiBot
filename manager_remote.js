const MAX_DISTANCE = 120
const TICKS_TO_CHECK_EFFICIENCY = 14000
const HAULER_RATIO = 0.43 // 0.4 is ideal.
const TICKS_TO_CHECK_INFRA = 3000
const NUM_WORK_TO_CONSTRUCT = 4
const RESERVE_TICK_THRESHOLD = 1000
const NUM_CONSTRUCTION_SITES_PER_ROOM = 6

const VISUAL_OPTION = { font: 0.5, align: 'left' }

Room.prototype.manageRemotes = function () {
    if (!this.memory.remotes) {
        return
    }

    const spawnCapacityAvailable = this.structures.spawn.length * 500

    const basicSpawnCapacity = this.getBasicSpawnCapacity()

    const spawnCapacityForRemotes = spawnCapacityAvailable - basicSpawnCapacity

    const remoteNames = Object.keys(this.memory.remotes).sort((a, b) => this.getRemotePathLengthAverage(a) - this.getRemotePathLengthAverage(b))

    let remotesSpawnCapacity = 0

    for (const remoteName of remoteNames) {
        remotesSpawnCapacity += this.getRemoteSpawnCapacity(remoteName)
        if (remotesSpawnCapacity > spawnCapacityForRemotes) {
            data.recordLog(`REMOTE: spawn capacity is full. abandon remote ${remoteName}`, remoteName)
            this.abandonRemote(remoteName)
        }
    }


    for (const remoteName of remoteNames) {
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

    for (const remoteName of remoteNames) {
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

Room.prototype.operateRemote = function (remoteName) {
    const map = Overlord.map

    const remote = Game.rooms[remoteName]
    const status = this.getRemoteStatus(remoteName)

    if (!status) {
        return
    }

    if (status.state === undefined) {
        status.state = 'normal'
        //set profit    
        status.profit = status.profit || 0
        status.cost = status.cost || 0
    }

    // pos to visual
    const visualPos = new RoomPosition(25, 25, remoteName)

    // state viual
    new RoomVisual(remoteName).text(status.state.toUpperCase(), visualPos)

    // defense department

    // evacuate when there is threat(defender died)
    let isThreat = false
    if (map[remoteName] && map[remoteName].threat && Game.time < map[remoteName].threat) {
        isThreat = true
        if (status.state !== 'evacuate') {
            status.state = 'evacuate'

            // get recycled all the creeps
            for (const creep of Overlord.getCreepsByAssignedRoom(remoteName)) {
                creep.memory.getRecycled = true
            }

            data.recordLog(`REMOTE: Evacuate from ${remoteName}.`, remoteName)
        }
        new RoomVisual(remoteName).text(`⏱️${map[remoteName].threat - Game.time}`, visualPos.x, visualPos.y + 5)
    }

    // check intermediate
    let intermediateEvacuate = false
    const intermediateName = status.intermediate
    if (intermediateName) {
        const intermediateStatus = this.memory.remotes[intermediateName]

        // abandon when intermediate room is abandoned
        if (!intermediateStatus) {
            data.recordLog(`REMOTE: abandon ${remoteName} since intermediate room is gone`, remoteName)
            this.abandonRemote(remoteName)
            return true
        }

        // evacuate when intermediate room is in threat
        if (intermediateStatus.state === 'evacuate') {
            intermediateEvacuate = true
            if (status.state !== 'evacuate') {
                status.state = 'evacuate'

                // get recycled all the creeps
                for (const creep of Overlord.getCreepsByAssignedRoom(remoteName)) {
                    creep.memory.getRecycled = true
                }

                data.recordLog(`REMOTE: Evacuate from ${remoteName}.`, remoteName)
            }
        }
    }

    // abandon remote if room is claimed
    if (remote && remote.controller.owner) {
        data.recordLog(`REMOTE: Abandon ${remoteName}. room is claimed by ${remote.controller.owner.username}`, remoteName)
        this.abandonRemote(remoteName)
        return true
    }

    // evacuate state
    if (status.state === 'evacuate') {
        if (intermediateEvacuate) {
            return true
        }

        if (isThreat) {
            return true
        }

        // disable evacuate
        status.state = 'normal'
        status.isInvader = false
        if (Memory.rooms[remoteName]) {
            Memory.rooms[remoteName].isInvader = false
            Memory.rooms[remoteName].isKiller = false
        }
        data.recordLog(`REMOTE: ${remoteName} Reactivated.`, remoteName)
        return true
    }

    // check invader or invaderCore
    const bodyLengthTotal = this.checkRemoteInvader(remoteName)
    const bodyLengthMax = Math.min(Math.ceil(bodyLengthTotal / 10) + 1, 5)
    if (bodyLengthTotal) {
        new RoomVisual(remoteName).text(`👿Invader`, visualPos.x, visualPos.y - 1)
        if (!Overlord.getNumCreepsByRole(remoteName, 'colonyDefender')) {
            this.requestColonyDefender(remoteName, { bodyLengthMax })
            return false
        }
        return true
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

Room.prototype.reserveRemote = function (remoteName) {
    const remote = Game.rooms[remoteName]

    const status = this.getRemoteStatus(remoteName)
    if (!status) {
        return
    }

    if (this.energyCapacityAvailable < 650) {
        return true
    }

    const reservationTicksToEnd = this.getRemoteReserveTick(remoteName)
    if (reservationTicksToEnd > 0) {
        // reservation visual
        const controller = remote.controller

        remote.visual.text(`⏱️${controller.reservation.ticksToEnd}`, controller.pos.x + 1, controller.pos.y + 1, { align: 'left' })

        Game.map.visual.text(`⏱️${controller.reservation.ticksToEnd}`, controller.pos, { fontSize: 3, opacity: 1 })

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
        return
    }

    const reservationTicksToEnd = this.getRemoteReserveTick(remoteName)
    const reserving = reservationTicksToEnd > 0

    if (reservationTicksToEnd < 0) {
        return true
    }

    // check efficiency and visualize
    if (!status.tick || (Game.time - status.tick > TICKS_TO_CHECK_EFFICIENCY)) {
        status.lastProfit = status.profit
        status.lastCost = status.cost
        status.lastTick = status.tick
        this.checkRemoteEfficiency(remoteName)
        if (!status) {
            return
        }
    }

    const sourceIds = Object.keys(status.infraPlan)
    const colonyMiners = Overlord.getCreepsByRole(remoteName, 'colonyMiner')
    const colonyHaulers = Overlord.getCreepsByRole(remoteName, 'colonyHauler')

    let enoughMiner = true
    let enoughHauler = true


    for (const id of sourceIds) {

        const reservingRatio = reserving ? 1 : 0.5

        // check miners
        const miners = colonyMiners.filter(creep =>
            creep.memory.sourceId === id &&
            (creep.ticksToLive || 1500) > (3 * creep.body.length + status.infraPlan[id].pathLength)
        )

        let numWork = 0;
        for (const miner of miners) {
            numWork += miner.getActiveBodyparts(WORK)
        }

        const maxWork = 5 * reservingRatio

        // request a miner or a hauler if needed 
        if (numWork < maxWork && miners.length < status.infraPlan[id].available) {
            enoughMiner = false
            if (this._remoteSpawnRequested !== true) {
                this.requestColonyMiner(remoteName, id)
            }
        }

        //check haulers

        // calculate maxCarry, maxNumHauler, numCarry

        const maxCarry = Math.ceil(status.infraPlan[id].pathLength * HAULER_RATIO * reservingRatio)

        let numCarry = 0;
        const activeHaulers = colonyHaulers.filter(creep => creep.memory.sourceId === id
            && (creep.ticksToLive || 1500) > 3 * creep.body.length)
        for (const haluer of activeHaulers) {
            numCarry += haluer.getActiveBodyparts(CARRY)
        }

        const constructionSites = remote ? remote.constructionSites : []

        if (numCarry < maxCarry) {
            if (this._remoteSpawnRequested !== true) {
                const pathLength = status.infraPlan[id].pathLength

                const spawnCarryLimit = (status.construction === 'complete')
                    ? 2 * Math.min(Math.floor((this.energyCapacityAvailable - 150) / 150), 16)
                    : 2 * Math.min(Math.floor(this.energyCapacityAvailable / 200), 16)

                const maxNumHauler = Math.ceil(maxCarry / spawnCarryLimit)

                const spawnCarryEach = 2 * Math.ceil(maxCarry / 2 / maxNumHauler)

                if (status.construction === 'proceed' && constructionSites.length > 0) {

                    const haulers = Overlord.getCreepsByRole(remoteName, 'colonyHauler').filter(creep => creep.memory.sourceId === id)

                    let numWork = 0;
                    for (const hauler of haulers) {
                        numWork += hauler.getNumParts('work')
                    }

                    const maxWork = Math.ceil(NUM_WORK_TO_CONSTRUCT * (reserving ? 1 : 0.5))
                    if (numWork < maxWork) {
                        enoughHauler = false
                        const pathLength = status.infraPlan[id].pathLength
                        this.requestColonyHaulerForConstruct(remoteName, id, pathLength)
                    }
                } else if (status.construction === 'complete') {
                    enoughHauler = false
                    this.requestColonyHauler(remoteName, id, spawnCarryEach, pathLength)
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

            remote.visual.text(`⛏️${numWork} / ${maxWork}`, source.pos.x + 0.5, source.pos.y - 0.25, VISUAL_OPTION)
            remote.visual.text(`🚚${numCarry} / ${maxCarry}`, source.pos.x + 0.5, source.pos.y + 0.5, VISUAL_OPTION)
            remote.visual.text(` 🔋${energyAmount}/2000`, source.pos.x + 0.5, source.pos.y + 1.25, VISUAL_OPTION)
            const color = (!reserving || numWork < maxWork || numCarry < maxCarry || energyAmount > 1500) ? '#740001' : '#000000'
            Game.map.visual.text(`⛏️${numWork} / ${maxWork}\n🚚${numCarry} / ${maxCarry}\n🔋${energyAmount}/2000`, new RoomPosition(source.pos.x, source.pos.y, remoteName), { fontSize: 3, backgroundColor: color, opacity: 1 })
        }

    }

    return enoughMiner && enoughHauler
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
        this.abandonRemote(remoteName)
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
        this.resetRemoteEfficiency(remoteName)
        status.construction = 'complete'
        return true
    }

    return false
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

    delete Memory.rooms[remoteName]
    if (this.memory.remotes !== undefined) {
        delete this.memory.remotes[remoteName]
        return
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

    const hostileCreeps = remote.find(FIND_HOSTILE_CREEPS).filter(creep => creep.checkBodyParts(['work', 'attack', 'ranged_attack', 'heal', 'claim']))
    const killerCreeps = hostileCreeps.filter(creep => creep.checkBodyParts(['attack', 'ranged_attack', 'heal']))

    let bodyLengthTotal = 0
    for (const hostileCreep of hostileCreeps) {
        if (hostileCreep.owner.username !== 'Invader') {
            bodyLengthTotal += 50
            continue
        }
        bodyLengthTotal += hostileCreep.body.length
    }

    if (!status.isInvader && hostileCreeps.length > 0) {
        status.isInvader = bodyLengthTotal
        remote.memory.isInvader = bodyLengthTotal
    } else if (status.isInvader && hostileCreeps.length === 0) {
        status.isInvader = false
        remote.memory.isInvader = false
    }

    if (!remote.memory.isKiller && killerCreeps.length > 0) {
        remote.memory.isKiller = bodyLengthTotal
        status.isKiller = bodyLengthTotal
    } else if (remote.memory.isKiller && killerCreeps.length === 0) {
        status.isKiller = false
        remote.memory.isKiller = false

        const roomInfo = Overlord.map[remoteName]
        if (roomInfo) {
            delete roomInfo.inaccessible
            delete roomInfo.threat
        }
    }
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
    status.cost = status.cost || 0
    status.cost += amount
}

Room.prototype.addRemoteProfit = function (remoteName, amount) {
    const status = this.getRemoteStatus(remoteName)
    if (!status) {
        return
    }
    status.profit = status.profit || 0
    status.profit += amount
}

Room.prototype.resetRemoteEfficiency = function (remoteName) {
    const status = this.getRemoteStatus(remoteName)
    if (!status) {
        return
    }
    status.lastProfit = 0
    status.lastCost = 0
    status.lastTick = 0
    status.tick = Game.time
    status.profit = 0
    status.cost = 0
}

Room.prototype.checkRemoteEfficiency = function (remoteName) {
    const status = this.getRemoteStatus(remoteName)

    if (!status) {
        return
    }
    if (status.tick && status.infraPlan) {
        const numSource = Object.keys(status.infraPlan).length
        const efficiency = Math.floor(10 * (status.profit - status.cost) / (Game.time - status.tick) / numSource) / 100
        status.lastEfficiency = efficiency
        if (efficiency < 0.3) {
            this.abandonRemote(remoteName)
            data.recordLog(`REMOTE: Abandon ${remoteName} for low efficiency ${efficiency * 100}%`, remoteName)
            return
        }
    }

    status.tick = Game.time
    status.profit = 0
    status.cost = 0
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

    console.log(`Get infraPlan for ${remoteName}`)

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
        console.log(`cannot find storage or spawn in ${this.name}`)
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
                const remoteNames = thisRoom.memory.remotes ? Object.keys(thisRoom.memory.remotes) : []
                // if room is not target room and not base room and not one of my remote, do not use that room.
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
        console.log(`no infra. this room is not adequate for colonize`)
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