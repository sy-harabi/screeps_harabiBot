const MAX_DISTANCE = 130
const TICKS_TO_CHECK_EFFICIENCY = 14000
const HAULER_RATIO = 0.45 // 0.4 is ideal.

Room.prototype.ruleColony = function (colonyName) {
    const map = Overlord.map

    const colony = Game.rooms[colonyName]
    if (colony) {
        colony.memory.host = this.name
    }
    const status = this.memory.colony[colonyName]
    status.state = status.state || 'init'

    // RoomVisual 관리
    const visualPos = new RoomPosition(25, 25, colonyName)

    // status 나타내기
    new RoomVisual(colonyName).text(`📶${status.state.toUpperCase()}`, visualPos.x, visualPos.y)

    // visual 및 check efficiency
    if (map[colonyName]) {
        Game.map.visual.text(`⚡${map[colonyName].numSource}/2`, new RoomPosition(25 + 12, 25 - 15, colonyName), { fontSize: 7, })
    }

    if (status.state === 'extraction') {
        if (!status.tick || (Game.time - status.tick > TICKS_TO_CHECK_EFFICIENCY)) {
            status.lastProfit = status.profit
            status.lastCost = status.cost
            status.lastTick = status.tick
            this.checkColonyEfficiency(colonyName)
            if (!status) {
                return
            }
        }

        const efficiencyRate = Math.floor(100 * (status.profit - status.cost) / (Game.time - status.tick)) / 100

        // roomVisual
        new RoomVisual(colonyName).text(`🏭${efficiencyRate}e/tick for ${Game.time - status.tick} ticks`, visualPos.x, visualPos.y + 2)

        // mapVisual
        Game.map.visual.text(`🏭${efficiencyRate}e/tick`, visualPos, { fontSize: 7 })
    } else {
        Game.map.visual.text(`📶${status.state}`, visualPos, { fontSize: 10 })
    }

    // reservation
    if (colony && colony.controller.reservation) {
        colony.visual.text(`⏱️${colony.controller.reservation.ticksToEnd}`, colony.controller.pos.x + 1, colony.controller.pos.y + 1, { align: 'left' })
    }

    // evacuate
    if (map[colonyName] && map[colonyName].threat && Game.time < map[colonyName].threat) {
        if (status.state !== 'evacuate') {
            status.state = 'evacuate'
            data.recordLog(`COLONY: Evacuate from ${colony ? colony.hyperLink : colonyName}.`, colonyName)
        }
        new RoomVisual(colonyName).text(`⏱️${map[colonyName].threat - Game.time}`, visualPos.x + 6, visualPos.y, { align: 'left' })
    }

    if (Memory.rooms[colonyName] && Memory.rooms[colonyName].intermediate && this.memory.colony[Memory.rooms[colonyName].intermediate] && this.memory.colony[Memory.rooms[colonyName].intermediate].state === 'evacuate') {
        status.state = 'evacuate'
    }

    // 다른 사람이 claim한 방이면 포기하자
    if (colony && colony.controller.owner && !['Invader'].includes(colony.controller.owner.username)) {
        data.recordLog(`COLONY: Abandon ${colony ? colony.hyperLink : colonyName} room is claimed by other user`, colonyName)
        return this.abandonColony(colonyName)
    }

    // invader 혹은 invaderCore 처리 (evacuate 일때는 예외)
    if (this.checkColonyInvader(colonyName) && status.state !== 'evacuate') {
        new RoomVisual(colonyName).text(`👿Invader`, visualPos.x + 1, visualPos.y - 1)
        if (!Overlord.getNumCreepsByRole(colonyName, 'colonyDefender')) {
            this.requestColonyDefender(colonyName)
        }
        return
    }

    if (this.checkRemoteInvaderCore(colonyName) && status.state !== 'evacuate') {
        new RoomVisual(colonyName).text(`👿InvaderCore`, visualPos.x + 1, visualPos.y - 1)
        if (!Overlord.getNumCreepsByRole(colonyName, 'colonyCoreDefender')) {
            return this.requestColonyCoreDefender(colonyName)
        }
    }

    // state machine

    if (status.state === 'init') {
        if (!(this.storage && this.energyCapacityAvailable >= 1300)) {
            return
        }
        for (const roomName of Object.keys(this.memory.colony)) {
            if (roomName === colonyName) {
                continue
            }
            if (!['extraction', 'init'].includes(this.memory.colony[roomName].state)) {
                return
            }
        }
        status.state = 'reservation'
        status.profit = status.profit || 0
        status.cost = status.cost || 0
        return
    }

    if (status.state === 'reservation') {
        if (colony && colony.controller.reservation && colony.controller.reservation.username === MY_NAME) {
            status.state = 'build'
        } else if (!Overlord.getNumCreepsByRole(colonyName, 'reserver')) {
            this.requestReserver(colonyName)
        }
        return
    }

    if (status.state === 'build') {
        if (!(colony && colony.controller.reservation && colony.controller.reservation.username === MY_NAME)) {
            status.state = 'reservation'
            return ERR_NOT_FOUND
        }
        const infraPlan = this.getColonyInfraPlan(colonyName)
        if (infraPlan === ERR_NOT_FOUND) {
            data.recordLog(`COLONY: Abandon ${colony ? colony.hyperLink : colonyName}. cannot find infraPlan`, colonyName)
            return this.abandonColony(colonyName)
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

            if ((numConstructionSites[roomName] || 0) >= 5) {
                continue
            }

            const constructionSite = infraPos.pos.lookFor(LOOK_CONSTRUCTION_SITES)
            if (constructionSite[0]) {
                end = false
                numConstructionSites[roomName] = numConstructionSites[roomName] || 0
                numConstructionSites[roomName]++
                continue
            }

            if ((numConstructionSites[roomName] || 0) + (numNewConstructionSites[roomName] || 0) >= 5) {
                continue
            }

            if (infraPos.pos.createConstructionSite(infraPos.structureType) === OK) {
                end = false
                numNewConstructionSites[roomName] = numNewConstructionSites[roomName] || 0
                numNewConstructionSites[roomName]++
            }
        }

        if (colony && colony.constructionSites.length === 0 && end && Object.keys(Game.constructionSites).length < 90) {
            this.resetColonyEfficiency(colonyName)
            status.state = 'extraction'
            return
        }

        const sources = Object.keys(status.infraPlan).map(id => Game.getObjectById(id))
        for (const source of sources) {
            if (!source) {
                data.recordLog(`COLONY: Abandon ${colony ? colony.hyperLink : colonyName}. cannot find source`, colonyName)
                this.abandonColony(colonyName)
                return
            }
            const laborers = Overlord.getCreepsByRole(colonyName, 'colonyLaborer').filter(creep => creep.memory.sourceId === source.id)
            let numWork = 0;
            for (const laborer of laborers) {
                numWork += laborer.getNumParts('work')
            }
            this.spawnCapacity += 20 * 3
            if (laborers.length < source.available && numWork < 20) {
                this.requestColonyLaborer(colonyName, source.id)
            }
        }
        return
    }

    if (status.state === 'extraction') {
        // 가끔 전부 지어졌는지 다시 확인
        if (colony && Game.time % 1000 === 0) {
            const infraPlan = this.getColonyInfraPlan(colonyName)
            if (!infraPlan) {
                data.recordLog(`COLONY: Abandon ${colony ? colony.hyperLink : colonyName}. cannot find infraPlan`, colonyName)
                return this.abandonColony(colonyName)
            }
            let numNewConstructionSites = 0
            for (const infraPos of infraPlan) {
                if (!Game.rooms[infraPos.pos.roomName]) {
                    continue
                }
                if (infraPos.pos.createConstructionSite(infraPos.structureType) === OK && infraPos.pos.roomName === colonyName) {
                    numNewConstructionSites++
                }
            }
        }

        if (colony && colony.constructionSites.length) {
            status.state = 'build'
            return
        }

        // reservation 잘 되고 있는지 확인. 필요하면 reserver 부르기
        if (!colony || !colony.controller.reservation || colony.controller.reservation.username === 'Invader' || colony.controller.reservation.ticksToEnd < 500) {
            if (!Overlord.getNumCreepsByRole(colonyName, 'reserver')) {
                this.requestReserver(colonyName)
            }
        }

        // colony 안보이면 return
        if (!colony) {
            return
        }

        // 각 source마다 확인
        if (!status.infraPlan || Object.keys(status.infraPlan).length === 0) {
            status.state = 'build'
            return
        }
        const sources = Object.keys(status.infraPlan).map(id => Game.getObjectById(id))
        const colonyMiners = Overlord.getCreepsByRole(colonyName, 'colonyMiner')
        const colonyHaulers = Overlord.getCreepsByRole(colonyName, 'colonyHauler')
        const visualOption = { font: 0.5, align: 'left' }
        for (const source of sources) {
            // 문제있으면 전 단계로 돌아가기
            if (!source) {
                delete status.infraPlan
                status.state = 'init'
                return
            }
            if (!source.container) {
                status.state = 'build'
                return
            }

            // miner 확인
            const miners = colonyMiners.filter(creep =>
                creep.memory.sourceId === source.id &&
                (creep.ticksToLive || 1500) > (3 * creep.body.length + status.infraPlan[source.id].pathLength)
            )
            let numWork = 0;
            for (const miner of miners) {
                numWork += miner.getActiveBodyparts(WORK)
            }

            this.spawnCapacity += 13


            // numCarry 및 maxCarry 계산 및 visual
            let numCarry = 0;
            const haulers = colonyHaulers.filter(creep => creep.memory.sourceId === source.id
                && (creep.ticksToLive || 1500) > 3 * creep.body.length)
            for (const haluer of haulers) {
                numCarry += haluer.getActiveBodyparts(CARRY)
            }

            const maxCarry = Math.ceil(status.infraPlan[source.id].pathLength * HAULER_RATIO)
            const maxNumHauler = Math.ceil(maxCarry / (2 * Math.min(Math.floor(this.energyCapacityAvailable / 150), 16)))

            this.spawnCapacity += Math.ceil(maxCarry * 1.5)

            colony.visual.text(`⛏️${numWork} / 6`, source.pos.x + 0.5, source.pos.y - 0.25, visualOption)
            colony.visual.text(`🚚${numCarry} / ${maxCarry}`, source.pos.x + 0.5, source.pos.y + 0.5, visualOption)

            // 주변 떨어진 energy 계산 및 visual
            const droppedEnergies = source.droppedEnergies
            let energyAmount = 0
            for (const droppedEnergy of droppedEnergies) {
                energyAmount += droppedEnergy.amount
            }
            const container = source.container
            if (container) {
                energyAmount += (container.store[RESOURCE_ENERGY] || 0)
                colony.visual.text(` 🔋${energyAmount}/2000`, source.pos.x + 0.5, source.pos.y + 1.25, { font: 0.5, align: 'left' })
            }

            // miner 또는 hauler 필요하면 요청

            if (numWork < 6 && miners.length < source.available) {
                this.requestColonyMiner(colonyName, source.id)
                continue;
            }


            const spawnCarry = Math.min(2 * Math.ceil(maxCarry / 2 / maxNumHauler), maxCarry - numCarry)

            if (numCarry < maxCarry && haulers.length < maxNumHauler && source.container.hits >= 180000) {
                this.requestColonyHauler(colonyName, source.id, spawnCarry, status.infraPlan[source.id].pathLength)
                continue;
            }
        }
        return
    }

    if (status.state === 'evacuate') {
        for (const creep of Overlord.getCreepsByAssignedRoom(colonyName)) {
            creep.getRecycled()
        }

        const intermediate = Memory.rooms[colonyName] ? Memory.rooms[colonyName].intermediate : undefined

        if (intermediate && this.memory.colony[intermediate] && this.memory.colony[intermediate].state === 'evacuate') {
            return
        }

        if (!map[colonyName] || !map[colonyName].threat || Game.time >= map[colonyName].threat) {
            status.state = 'reservation'
            status.isInvader = false
            if (Memory.rooms[colonyName]) {
                Memory.rooms[colonyName].isInvader = false
                Memory.rooms[colonyName].isKiller = false
            }
            data.recordLog(`COLONY: ${colony ? colony.hyperLink : colonyName} Reactivated.`, colonyName)
            return
        }
    }
}

Room.prototype.manageColony = function () {
    if (!this.memory.colony) {
        return
    }

    for (const colonyName in this.memory.colony) {
        this.ruleColony(colonyName)
    }
    return
}

Room.prototype.abandonColony = function (colonyName) {
    const colony = Game.rooms[colonyName]
    if (colony) {
        for (const constructionSite of colony.constructionSites) {
            constructionSite.remove()
        }
    }
    delete Memory.rooms[colonyName]
    if (this.memory.colony) {
        return delete this.memory.colony[colonyName]
    }
}

Room.prototype.checkColonyInvader = function (colonyName) {
    const colony = Game.rooms[colonyName]
    const status = this.memory.colony[colonyName]
    if (!status) {
        return false
    }

    if (!colony) {
        return status.isInvader
    }

    const hostileCreeps = colony.find(FIND_HOSTILE_CREEPS).filter(creep => creep.checkBodyParts(['work', 'attack', 'ranged_attack', 'heal', 'claim']))
    const killerCreeps = hostileCreeps.filter(creep => creep.checkBodyParts(['attack', 'ranged_attack', 'heal']))

    if (!status.isInvader && hostileCreeps.length > 0) {
        status.isInvader = true
        colony.memory.isInvader = true

    } else if (status.isInvader && hostileCreeps.length === 0) {
        status.isInvader = false
        colony.memory.isInvader = false
    }

    if (!colony.memory.isKiller && killerCreeps.length > 0) {
        colony.memory.isKiller = true
    } else if (colony.memory.isKiller && killerCreeps.length === 0) {
        colony.memory.isKiller = false
        const roomInfo = Overlord.map[colonyName]
        if (roomInfo) {
            delete roomInfo.inaccessible
            delete roomInfo.threat
        }
    }
    return status.isInvader
}

Room.prototype.checkColonyInvaderCore = function (colonyName) {
    const colony = Game.rooms[colonyName]
    const status = this.memory.colony[colonyName]

    if (!status) {
        return false
    }

    if (!colony) {
        return status.isInvaderCore
    }
    const hostileStructures = colony.find(FIND_HOSTILE_STRUCTURES).filter(structure => structure.structureType === STRUCTURE_INVADER_CORE)
    if (!status.isInvaderCore && hostileStructures.length) {
        status.isInvaderCore = true
    } else if (status.isInvaderCore && !hostileStructures.length) {
        status.isInvaderCore = false
    }
    return status.isInvaderCore
}

Room.prototype.addColonyCost = function (colonyName, amount) {
    const status = this.memory.colony ? this.memory.colony[colonyName] : undefined
    if (!status) {
        return
    }
    status.cost = status.cost || 0
    status.cost += amount
}

Room.prototype.addColonyProfit = function (colonyName, amount) {
    const status = this.memory.colony ? this.memory.colony[colonyName] : undefined
    if (!status) {
        return
    }
    status.profit = status.profit || 0
    status.profit += amount
}

Room.prototype.resetColonyEfficiency = function (colonyName) {
    const status = this.memory.colony ? this.memory.colony[colonyName] : undefined
    if (!status) {
        return
    }
    status.tick = Game.time
    status.profit = 0
    status.cost = 0
}

Room.prototype.checkColonyEfficiency = function (colonyName) {
    const status = this.memory.colony ? this.memory.colony[colonyName] : undefined
    const colony = Game.rooms[colonyName]
    if (!status) {
        return
    }
    if (status.tick && status.infraPlan) {
        const numSource = Object.keys(status.infraPlan).length
        const efficiency = Math.floor(10 * (status.profit - status.cost) / (Game.time - status.tick) / numSource) / 100
        status.lastEfficiency = efficiency
        if (efficiency < 0.3) {
            this.abandonColony(colonyName)
            data.recordLog(`COLONY: Abandon ${colony ? colony.hyperLink : colonyName} for low efficiency ${efficiency * 100}%`, colonyName)
            return
        }
    }

    status.tick = Game.time
    status.profit = 0
    status.cost = 0
}

/**
 * get positions for containers and roads for remotes
 * @param {String} colonyName - roomName of colony
 * @param {Boolean} reconstruction - if true, ignore past plan and make a new one
 * @returns {Object} infraPlan - 
 */
Room.prototype.getColonyInfraPlan = function (colonyName, reconstruction = false) {
    // set status in memory of base room
    this.memory.colony = this.memory.colony || {}
    this.memory.colony[colonyName] = this.memory.colony[colonyName] || {}
    const status = this.memory.colony[colonyName]

    // if there is infra plan already, unpack and use that
    if (!reconstruction && status.infraPlan && Object.keys(status.infraPlan).length) {
        return this.unpackInfraPlan(status.infraPlan)
    }

    // if we cannot see remote, wait until it has vision
    const colony = Game.rooms[colonyName]
    if (!colony) {
        return ERR_NOT_FOUND
    }

    // set host
    colony.memory.host = this.name
    console.log(`Get infraPlan for ${colonyName}`)

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
    spawnCapacity += 4 //claimer

    const anchor = this.storage || this.structures.spawn[0]

    if (!anchor) {
        data.recordLog(`FAIL: Cannot colonize ${colony.hyperLink}. cannot find storage or spawn.`, this.name)
        console.log(`no infra. this room is not adequate for colonize`)
        return ERR_NOT_FOUND
    }

    // find path from source to storage of base
    for (const source of colony.sources) {
        const search = PathFinder.search(source.pos, { pos: anchor.pos, range: 1 }, {
            plainCost: 2,
            swampCost: 2,
            roomCallback: function (roomName) {
                const colonies = thisRoom.memory.colony ? Object.keys(thisRoom.memory.colony) : []
                // if room is not target room and not base room and not one of my remote, do not use that room.
                if (roomName !== colonyName && roomName !== thisRoom.name && !colonies.includes(roomName)) {
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
                    }
                    if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType) || structure.structureType === STRUCTURE_CONTAINER) {
                        costs.set(structure.pos.x, structure.pos.y, 255)
                    }
                })

                for (const source of room.sources) {
                    for (const pos of source.pos.getInRange(1)) {
                        if (!pos.isWall && costs.get(pos) < 30) {
                            costs.set(pos.x, pos.y, 30)
                        }
                    }
                }

                return costs;
            }
        })
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

        if ((spawnCapacity / this.memory.spawnCapacityAvailable) > 0.8) {
            data.recordLog(`FAIL: Cannot colonize source ${source.id} in ${colony.hyperLink}. spawn capacity is full.`, this.name)
            continue
        }

        const structures = []
        structures.push(path.shift().packInfraPos('container'))
        for (const pos of path) {
            const roomName = pos.roomName
            if (roomName !== this.name && roomName !== colonyName) {
                colony.memory.intermediate = roomName
            }
            roadPositions.push(pos)
            structures.push(pos.packInfraPos('road'))
            new RoomVisual(pos.roomName).structure(pos.x, pos.y, 'road')
        }
        status.infraPlan[source.id] = { pathLength: pathLength, structures: structures }
    }

    if (!Object.keys(status.infraPlan).length) {
        data.recordLog(`FAIL: Cannot colonize ${colony.hyperLink}. cannot find infra plan.`, this.name)
        console.log(`no infra. this room is not adequate for colonize`)
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