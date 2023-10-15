const MAX_DISTANCE = 130
const TICKS_TO_CHECK_EFFICIENCY = 14000
const HAULER_RATIO = 0.45 // 0.4 is ideal.
const TICKS_TO_CHECK_INFRA = 3000

Room.prototype.operateRemote = function (remoteName) {
    const map = Overlord.map

    const remote = Game.rooms[remoteName]
    const status = this.memory.remotes[remoteName]

    if (status.state === undefined) {
        // wait until storage and extensions are built (at RCL4)
        if (!(this.storage && this.energyCapacityAvailable >= 1300)) {
            return
        }

        // wait if there is another remote such that construction is on going
        for (const roomName of Object.keys(this.memory.remotes)) {
            if (roomName === remoteName) {
                continue
            }
            if (!this.memory.remotes[roomName].state) {
                continue
            }
            if (this.memory.remotes[roomName].state === 'extract') {
                continue
            }
            return ERR_BUSY
        }

        // set state as construct
        status.state = 'construct'

        //set profit    
        status.profit = status.profit || 0
        status.cost = status.cost || 0
    }

    // room Visual
    const visualPos = new RoomPosition(25, 25, remoteName)
    new RoomVisual(remoteName).text(`📶${status.state.toUpperCase()}`, visualPos.x, visualPos.y) // status

    // map visual
    if (map[remoteName]) {
        Game.map.visual.text(`⚡${map[remoteName].numSource}/2`, new RoomPosition(25 + 12, 25 - 15, remoteName), { fontSize: 7, })
    }

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

            data.recordLog(`REMOTE: Evacuate from ${remoteName}.`, this.name)
        }
        new RoomVisual(remoteName).text(`⏱️${map[remoteName].threat - Game.time}`, visualPos.x + 6, visualPos.y, { align: 'left' })
    }

    // check intermediate
    let intermediateEvacuate = false
    const intermediate = status.intermediate
    if (intermediate) {
        const intermediateStatus = this.memory.remotes[intermediate]

        // abandon when intermediate room is abandoned
        if (!intermediateStatus) {
            data.recordLog(`REMOTE: abandon ${remoteName} since intermediate room is gone`, this.name)
            return this.abandonRemote(remoteName)
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

                data.recordLog(`REMOTE: Evacuate from ${remoteName}.`, this.name)
            }
        }
    }

    // abandon remote if room is claimed
    if (remote && remote.controller.owner) {
        data.recordLog(`REMOTE: Abandon ${remoteName}. room is claimed by ${remote.controller.owner.username}`, this.name)
        return this.abandonRemote(remoteName)
    }

    // evacuate state
    if (status.state === 'evacuate') {
        if (intermediateEvacuate) {
            return
        }

        if (isThreat) {
            return
        }

        // disable evacuate
        status.state = 'construct'
        status.isInvader = false
        if (Memory.rooms[remoteName]) {
            Memory.rooms[remoteName].isInvader = false
            Memory.rooms[remoteName].isKiller = false
        }
        data.recordLog(`REMOTE: ${remoteName} Reactivated.`, this.name)
        return
    }

    // check invader of invaderCore
    const bodyLengthTotal = this.checkRemoteInvader(remoteName)
    const bodyLengthMax = Math.min(Math.ceil(bodyLengthTotal / 10) + 1, 5)
    if (bodyLengthTotal) {
        new RoomVisual(remoteName).text(`👿Invader`, visualPos.x, visualPos.y - 1)
        if (!Overlord.getNumCreepsByRole(remoteName, 'colonyDefender')) {
            this.requestColonyDefender(remoteName, { bodyLengthMax })
        }
        return
    }

    if (this.checkRemoteInvaderCore(remoteName)) {
        new RoomVisual(remoteName).text(`👿InvaderCore`, visualPos.x, visualPos.y - 1)
        if (!Overlord.getNumCreepsByRole(remoteName, 'colonyCoreDefender')) {
            return this.requestColonyCoreDefender(remoteName)
        }
    }

    // reserve department
    reserve: {
        if (remote && remote.controller.reservation && remote.controller.reservation.username === MY_NAME) {
            // reservation visual
            const controller = remote.controller
            remote.visual.text(`⏱️${controller.reservation.ticksToEnd}`, controller.pos.x + 1, controller.pos.y + 1, { align: 'left' })

            // if reservation ticksToEnd in enough, break
            if (remote.controller.reservation.ticksToEnd > 500) {
                break reserve
            }
        }

        // if there is a reserver spawning or reserving, break
        if (Overlord.getNumCreepsByRole(remoteName, 'reserver')) break reserve

        // request reserver
        this.requestReserver(remoteName)
    }

    // construct state
    if (status.state === 'construct') {
        Game.map.visual.text(`🏗️`, visualPos, { fontSize: 7 })
        // if don't have vision, wait
        if (!remote) return ERR_NOT_FOUND

        if (remote && remote.controller.reservation && remote.controller.reservation.username !== MY_NAME) {
            return
        }

        if (Math.random() < 0.9) {
            return
        }

        // get infraPlan
        const infraPlan = this.getRemoteInfraPlan(remoteName)
        if (infraPlan === ERR_NOT_FOUND) {
            // abandon if not found
            data.recordLog(`REMOTE: Abandon ${remoteName}. cannot find infraPlan`, this.name)
            return this.abandonRemote(remoteName)
        }


        let end = true
        let numConstructionSites = {}
        let numNewConstructionSites = {}

        for (const infraPos of infraPlan) {

            const roomName = infraPos.pos.roomName

            const room = Game.rooms[roomName]
            if (!room) {
                continue
            }

            numConstructionSites[roomName] = numConstructionSites[roomName] || 0
            numNewConstructionSites[roomName] = numNewConstructionSites[roomName] || 0

            if ((numConstructionSites[roomName]) >= 5) {
                continue
            }

            const constructionSite = infraPos.pos.lookFor(LOOK_CONSTRUCTION_SITES)
            if (constructionSite[0]) {
                end = false
                numConstructionSites[roomName]++
                continue
            }

            if ((numConstructionSites[roomName]) + (numNewConstructionSites[roomName]) >= 5) {
                continue
            }

            if (infraPos.pos.createConstructionSite(infraPos.structureType) === OK) {
                end = false
                numNewConstructionSites[roomName]++
            }
        }

        if (remote && remote.constructionSites.length === 0 && end && Object.keys(Game.constructionSites).length < 90) {
            this.resetRemoteEfficiency(remoteName)
            status.state = 'extract'
            return
        }

        const sources = Object.keys(status.infraPlan).map(id => Game.getObjectById(id))
        for (const source of sources) {
            if (!source) {
                data.recordLog(`REMOTE: Abandon ${remoteName}. cannot find source`, this.name)
                this.abandonRemote(remoteName)
                return
            }
            const laborers = Overlord.getCreepsByRole(remoteName, 'colonyLaborer').filter(creep => creep.memory.sourceId === source.id)
            let numWork = 0;
            for (const laborer of laborers) {
                numWork += laborer.getNumParts('work')
            }
            this.spawnCapacity += 20 * 3
            if (numWork < 20) {
                this.requestColonyLaborer(remoteName, source.id)
            }
        }
        return
    }

    // extract state
    if (status.state === 'extract') {
        // check infra
        if (remote && (Game.time % TICKS_TO_CHECK_INFRA === 0)) {
            const infraPlan = this.getRemoteInfraPlan(remoteName)
            if (infraPlan === ERR_NOT_FOUND) {
                data.recordLog(`REMOTE: Abandon ${remoteName}. cannot find infraPlan`, this.name)
                return this.abandonRemote(remoteName)
            }

            let numNewConstructionSites = 0
            for (const infraPos of infraPlan) {
                if (!Game.rooms[infraPos.pos.roomName]) {
                    continue
                }
                if (infraPos.pos.createConstructionSite(infraPos.structureType) === OK && infraPos.pos.roomName === remoteName) {
                    numNewConstructionSites++
                    status.state = 'construct'
                    return
                }
            }
        }

        // if there is construction site, change state to construct
        if (remote && remote.constructionSites.length) {
            status.state = 'construct'
            return
        }

        // if there is no infraPlan, change state to construct
        if (!status.infraPlan || Object.keys(status.infraPlan).length === 0) {
            delete status.infraPlan
            status.state = 'construct'
            return
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

        const efficiencyRate = Math.floor(100 * (status.profit - status.cost) / (Game.time - status.tick)) / 100

        new RoomVisual(remoteName).text(`🏭${efficiencyRate}e/tick for ${Game.time - status.tick} ticks`, visualPos.x, visualPos.y + 2)
        Game.map.visual.text(`🏭${efficiencyRate}e/tick`, visualPos, { fontSize: 7 })

        // wait if no vision. reserver will come and vision will be available
        if (!remote) {
            return
        }

        const sources = Object.keys(status.infraPlan).map(id => Game.getObjectById(id))
        const colonyMiners = Overlord.getCreepsByRole(remoteName, 'colonyMiner')
        const colonyHaulers = Overlord.getCreepsByRole(remoteName, 'colonyHauler')
        const visualOption = { font: 0.5, align: 'left' }
        for (const source of sources) {
            // if there is no source or source container, change state to construct
            if (!source) {
                delete status.infraPlan
                status.state = 'construct'
                return
            }
            if (!source.container) {
                status.state = 'construct'
                return
            }

            // check miners
            const miners = colonyMiners.filter(creep =>
                creep.memory.sourceId === source.id &&
                (creep.ticksToLive || 1500) > (3 * creep.body.length + status.infraPlan[source.id].pathLength)
            )
            let numWork = 0;
            for (const miner of miners) {
                numWork += miner.getActiveBodyparts(WORK)
            }

            // add spawnCapacity. colonyMiners have 13 body parts(6W6M1C)
            this.spawnCapacity += 13


            // calculate numCarry and maxCarry. visualize them.
            let numCarry = 0;
            const activeHaulers = colonyHaulers.filter(creep => creep.memory.sourceId === source.id
                && (creep.ticksToLive || 1500) > 3 * creep.body.length)
            for (const haluer of activeHaulers) {
                numCarry += haluer.getActiveBodyparts(CARRY)
            }

            const maxCarry = Math.ceil(status.infraPlan[source.id].pathLength * HAULER_RATIO)
            const maxNumHauler = Math.ceil(maxCarry / (2 * Math.min(Math.floor(this.energyCapacityAvailable / 150), 16)))

            this.spawnCapacity += Math.ceil(maxCarry * 1.5)

            remote.visual.text(`⛏️${numWork} / 6`, source.pos.x + 0.5, source.pos.y - 0.25, visualOption)
            remote.visual.text(`🚚${numCarry} / ${maxCarry}`, source.pos.x + 0.5, source.pos.y + 0.5, visualOption)

            // calculate energy near source and visualize
            const droppedEnergies = source.droppedEnergies
            let energyAmount = 0
            for (const droppedEnergy of droppedEnergies) {
                energyAmount += droppedEnergy.amount
            }
            const container = source.container
            if (container) {
                energyAmount += (container.store[RESOURCE_ENERGY] || 0)
                remote.visual.text(` 🔋${energyAmount}/2000`, source.pos.x + 0.5, source.pos.y + 1.25, { font: 0.5, align: 'left' })
            }

            // request a miner or a hauler if needed
            if (numWork < 6 && miners.length < source.available) {
                this.requestColonyMiner(remoteName, source.id)
                continue;
            }

            const spawnCarry = Math.min(2 * Math.ceil(maxCarry / 2 / maxNumHauler), maxCarry - numCarry)

            if (numCarry < maxCarry && activeHaulers.length < maxNumHauler && source.container.hits >= 180000) {
                this.requestColonyHauler(remoteName, source.id, spawnCarry, status.infraPlan[source.id].pathLength)
                continue;
            }
        }
        return
    }
}

Room.prototype.manageRemotes = function () {
    if (!this.memory.remotes) {
        return
    }

    const basePos = new RoomPosition(25, 25, this.name)

    for (const remoteName in this.memory.remotes) {
        const remotePos = new RoomPosition(25, 25, remoteName)
        Game.map.visual.line(basePos, remotePos, { width: 2, color: '#00ff00' })
        this.operateRemote(remoteName)
    }
    return
}

Room.prototype.abandonRemote = function (remoteName) {
    const remote = Game.rooms[remoteName]
    if (remote) {
        for (const constructionSite of remote.constructionSites) {
            constructionSite.remove()
        }
    }
    delete Memory.rooms[remoteName]
    if (this.memory.remotes && this.memory.remotes[remoteName]) {
        return delete this.memory.remotes[remoteName]
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
    const status = this.memory.remotes ? this.memory.remotes[remoteName] : undefined
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
    const status = this.memory.remotes[remoteName]

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
    const status = this.memory.remotes ? this.memory.remotes[remoteName] : undefined
    if (!status) {
        return
    }
    status.cost = status.cost || 0
    status.cost += amount
}

Room.prototype.addRemoteProfit = function (remoteName, amount) {
    const status = this.memory.remotes ? this.memory.remotes[remoteName] : undefined
    if (!status) {
        return
    }
    status.profit = status.profit || 0
    status.profit += amount
}

Room.prototype.resetRemoteEfficiency = function (remoteName) {
    const status = this.memory.remotes ? this.memory.remotes[remoteName] : undefined
    if (!status) {
        return
    }
    status.tick = Game.time
    status.profit = 0
    status.cost = 0
}

Room.prototype.checkRemoteEfficiency = function (remoteName) {
    const status = this.memory.remotes ? this.memory.remotes[remoteName] : undefined

    if (!status) {
        return
    }
    if (status.tick && status.infraPlan) {
        const numSource = Object.keys(status.infraPlan).length
        const efficiency = Math.floor(10 * (status.profit - status.cost) / (Game.time - status.tick) / numSource) / 100
        status.lastEfficiency = efficiency
        if (efficiency < 0.3) {
            this.abandonRemote(remoteName)
            data.recordLog(`REMOTE: Abandon ${remoteName} for low efficiency ${efficiency * 100}%`, this.name)
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

    let spawnCapacity = this.memory.spawnCapacity
    spawnCapacity += 4 //reserver

    const anchor = this.storage || this.structures.spawn[0]

    if (!anchor || !anchor.RCLActionable) {
        data.recordLog(`FAIL: Cannot colonize ${remoteName}. cannot find storage or spawn.`, this.name)
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
            swampCost: 2,
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

                return costs;
            }
        })

        // if there's no path, continue to next source
        if (search.incomplete) {
            continue
        }

        const path = search.path
        const pathLength = path.length

        if (pathLength > MAX_DISTANCE) {
            continue
        }

        spawnCapacity += Math.ceil(MAX_DISTANCE * HAULER_RATIO * 1.5) // hauler
        spawnCapacity += 13 // miner

        if ((spawnCapacity / this.memory.spawnCapacityAvailable) > 0.9) {
            continue
        }

        const structures = []

        // push containePos in the end
        const containerPos = path.shift()
        for (const pos of path) {
            const roomName = pos.roomName
            if (roomName !== this.name && roomName !== remoteName) {
                status.intermediate = roomName
            }
            roadPositions.push(pos)
            structures.push(pos.packInfraPos('road'))
            new RoomVisual(pos.roomName).structure(pos.x, pos.y, 'road')
        }

        // containerPos should be in the end since we want to build container last
        structures.push(containerPos.packInfraPos('container'))

        // store infraPlan at status
        status.infraPlan[source.id] = { pathLength: pathLength, structures: structures }
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
    for (const plan of Object.values(infraPlan)) {
        const structures = plan.structures
        for (const packed of structures) {
            result.push(parseInfraPos(packed))
        }
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