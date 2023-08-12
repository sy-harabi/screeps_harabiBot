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
    new RoomVisual(colonyName).text(`📶${status.state.toUpperCase()}`, visualPos.x + 1, visualPos.y, { align: 'left' })

    // efficiency 나타내기
    if (!status.tick || (Game.time - status.tick > 10000)) {
        status.lastProfit = status.profit
        status.lastCost = status.cost
        status.lastTick = status.tick
        this.resetColonyEfficiency(colonyName)
    }

    const efficiencyRate = Math.floor(100 * (status.profit - status.cost) / (Game.time - status.tick)) / 100

    // roomVisual
    new RoomVisual(colonyName).text(`🏭${efficiencyRate}e/tick`, visualPos.x + 1, visualPos.y + 2, { align: 'left' })

    // mapVisual
    if (map[colonyName]) {
        Game.map.visual.text(`⚡${map[colonyName].numSource}/2`, new RoomPosition(25 + 12, 25 - 15, colonyName), { fontSize: 7, })
    }
    Game.map.visual.text(`🏭${efficiencyRate}e/tick`, visualPos, { fontSize: 7 })

    // reservation
    if (colony && colony.controller.reservation) {
        colony.visual.text(`⏱️${colony.controller.reservation.ticksToEnd}`, colony.controller.pos.x + 1, colony.controller.pos.y + 1, { align: 'left' })
    }

    // evacuate
    if (map[colonyName] && map[colonyName].threat && Game.time < map[colonyName].threat) {
        if (status.state !== 'evacuate') {
            status.state = 'evacuate'
            data.recordLog(`COLONY: Evacuate.`, colonyName)
        }
        new RoomVisual(colonyName).text(`⏱️${map[colonyName].threat - Game.time}`, visualPos.x + 6, visualPos.y, { align: 'left' })
    }

    // 다른 사람이 claim한 방이면 포기하자
    if (colony && colony.controller.owner && !['Invader'].includes(colony.controller.owner.username)) {
        data.recordLog(`COLONY: Abandon ${colonyName} room is claime by other user`, colonyName)
        return this.abandonColony(colonyName)
    }

    // invader 혹은 invaderCore 처리 (evacuate 일때는 예외)
    if (this.checkColonyInvader(colonyName) && status.state !== 'evacuate') {
        new RoomVisual(colonyName).text(`👿Invader`, visualPos.x + 1, visualPos.y - 1, { align: 'left' })
        if (!Overlord.getNumCreepsByRole(colonyName, 'colonyDefender')) {
            this.requestColonyDefender(colonyName)
        }
        return
    }

    if (this.checkColonyInvaderCore(colonyName) && status.state !== 'evacuate') {
        new RoomVisual(colonyName).text(`👿InvaderCore`, visualPos.x + 1, visualPos.y - 1, { align: 'left' })
        if (!Overlord.getNumCreepsByRole(colonyName, 'colonyCoreDefender')) {
            return this.requestColonyCoreDefender(colonyName)
        }
    }

    // state machine
    if (status.state === 'extraction') {
        // 가끔 전부 지어졌는지 다시 확인
        if (colony && Game.time % 1000 === 0) {
            const infraPlan = this.getColonyInfraPlan(colonyName, status)
            if (!infraPlan) {
                data.recordLog(`COLONY: Abandon ${colonyName}. cannot find infraPlan`, colonyName)
                return this.abandonColony(colonyName)
            }
            let numNewConstructionSites = 0
            for (const infraPos of infraPlan) {
                if (infraPos.pos.createConstructionSite(infraPos.structureType) === OK && infraPos.pos.roomName === colonyName) {
                    numNewConstructionSites++
                }
            }
            if (colony.constructionSites.length || numNewConstructionSites > 0) {
                status.state = 'build'
                return
            }
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
        const sources = colony.sources
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


            // numCarry 및 maxCarry 계산 및 visual
            let numCarry = 0;
            const haulers = colonyHaulers.filter(creep => creep.memory.sourceId === source.id
                && (creep.ticksToLive || 1500) > 3 * creep.body.length)
            for (const haluer of haulers) {
                numCarry += haluer.getActiveBodyparts(CARRY)
            }

            const maxCarry = Math.floor(status.infraPlan[source.id].pathLength * 0.5)
            const maxNumHauler = Math.ceil(maxCarry / (2 * Math.min(Math.floor(this.energyCapacityAvailable / 150), 16)))

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

            if (numCarry < maxCarry && haulers.length < maxNumHauler && source.container.hits >= 180000) {
                this.requestColonyHauler(colonyName, source.id, maxCarry - numCarry, status.infraPlan[source.id].pathLength)
                continue;
            }
        }
        return
    }

    if (status.state === 'build') {
        if (!(colony && colony.controller.reservation && colony.controller.reservation.username === MY_NAME)) {
            status.state = 'reservation'
            return ERR_NOT_FOUND
        }
        const infraPlan = this.getColonyInfraPlan(colonyName, status)
        if (!infraPlan) {
            data.recordLog(`COLONY: Abandon ${colonyName}. cannot find infraPlan`, colonyName)
            return this.abandonColony(colonyName)
        }
        let numConstructionSites = colony.constructionSites.length
        let numNewConstructionSites = 0
        for (const infraPos of infraPlan) {
            if (numConstructionSites >= 5) {
                break
            }
            if (infraPos.pos.createConstructionSite(infraPos.structureType) === OK) {
                numNewConstructionSites++
                numConstructionSites++
            }
        }
        if (numConstructionSites === 0 && numNewConstructionSites === 0 && Object.keys(Game.constructionSites).length < 90) {
            status.state = 'extraction'
            return
        }

        const sources = Object.keys(status.infraPlan).map(id => Game.getObjectById(id))
        for (const source of sources) {
            if (!source) {
                data.recordLog(`COLONY: Abandon ${colonyName}. cannot find source`, colonyName)
                this.abandonColony(colonyName)
            }
            const laborers = Overlord.getCreepsByRole(colonyName, 'colonyLaborer').filter(creep => creep.memory.sourceId === source.id)
            let numWork = 0;
            for (const laborer of laborers) {
                numWork += laborer.getNumParts('work')
            }
            if (laborers.length < source.available && numWork < 20) {
                this.requestColonyLaborer(colonyName, source.id)
            }
        }
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

    if (status.state === 'init') {
        if (!(this.storage && this.energyCapacityAvailable >= 1300)) {
            return
        }
        status.state = 'reservation'
        status.profit = status.profit || 0
        status.cost = status.cost || 0
        return
    }

    if (status.state === 'evacuate') {
        for (const creep of Overlord.getCreepsByAssignedRoom(colonyName)) {
            creep.getRecycled()
        }
        if (!map[colonyName] || !map[colonyName].threat || Game.time >= map[colonyName].threat) {
            status.state = 'reservation'
            status.isInvader = false
            if (Memory.rooms[colonyName]) {
                Memory.rooms[colonyName].isInvader = false
                Memory.rooms[colonyName].isKiller = false
            }
            data.recordLog(`COLONY: Reactivated.`, colonyName)
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
    if (!colony) {
        return status.isInvader
    }

    if (!status) {
        return
    }
    const hostileCreeps = colony.find(FIND_HOSTILE_CREEPS).filter(creep => creep.checkBodyParts(['work', 'attack', 'ranged_attack', 'heal', 'claim']))
    const killerCreeps = hostileCreeps.filter(creep => creep.checkBodyParts(['attack', 'ranged_attack', 'heal']))

    if (!status.isInvader && hostileCreeps.length) {
        status.isInvader = true
        colony.memory.isInvader = true

    } else if (status.isInvader && !hostileCreeps.length) {
        status.isInvader = false
        colony.memory.isInvader = false
    }

    if (!colony.memory.isKiller && killerCreeps.length) {
        colony.memory.isKiller = true

    } else if (colony.memory.isKiller && !killerCreeps.length) {
        colony.memory.isKiller = false
    }
    return status.isInvader
}

Room.prototype.checkColonyInvaderCore = function (colonyName) {
    const colony = Game.rooms[colonyName]
    const status = this.memory.colony[colonyName]
    if (!colony) {
        return status.isInvaderCore
    }
    const hostileStructures = colony.find(FIND_HOSTILE_STRUCTURES)
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
    if (status.tick && status.infraPlan) {
        const numSource = Object.keys(status.infraPlan).length
        const efficiency = Math.floor(10 * (status.profit - status.cost) / (Game.time - status.tick) / numSource) / 100
        status.lastEfficiency = efficiency
        if (efficiency < 0.3) {
            this.abandonColony(colonyName)
            data.recordLog(`COLONY: Abandon ${colonyName} for low efficiency ${efficiency * 100}%`, colonyName)
            return
        }
        if (efficiency < 0.5) {
            data.recordLog(`COLONY: Efficiency ${efficiency * 100}%`, colonyName)
        }
    }

    status.tick = Game.time
    status.profit = 0
    status.cost = 0
}

Room.prototype.getColonyInfraPlan = function (colonyName, status) {
    if (status.infraPlan && Object.keys(status.infraPlan).length) {
        return this.unpackInfraPlan(status.infraPlan)
    }
    const colony = Game.rooms[colonyName]
    colony.memory.host = this.name
    console.log(`Get infraPlan for ${colonyName}`)
    status.infraPlan = {}
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
    outer:
    for (const source of colony.sources) {
        const path = PathFinder.search(source.pos, { pos: this.storage.pos, range: 1 }, {
            plainCost: 2,
            swampCost: 2,
            roomCallback: function (roomName) {
                const room = Game.rooms[roomName];
                if (!room) return;
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
        }).path
        const pathLength = path.length

        if (pathLength > 100) {
            continue
        }

        const structures = []
        structures.push(path.shift().packInfraPos('container'))
        for (const pos of path) {
            roadPositions.push(pos)
            if (pos.roomName !== this.name && pos.roomName !== colonyName) {
                continue outer
            }
            structures.push(pos.packInfraPos('road'))
            new RoomVisual(pos.roomName).structure(pos.x, pos.y, 'road')
        }
        status.infraPlan[source.id] = { pathLength: pathLength, structures: structures }
    }

    if (!Object.keys(status.infraPlan).length) {
        console.log(`no infra. this room is not adequate for colonize`)
        return false
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