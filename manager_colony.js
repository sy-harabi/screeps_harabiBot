Room.prototype.ruleColony = function (colonyName) {
    const colony = Game.rooms[colonyName]
    if (colony) {
        colony.memory.host = this.name
    }
    const status = this.memory.colony[colonyName]
    status.state = status.state || 'init'

    const visualPos = new RoomPosition(25, 25, colonyName)
    new RoomVisual(colonyName).text(`📶${status.state.toUpperCase()}`, visualPos.x + 1, visualPos.y, { align: 'left' })
    if (!status.tick || (Game.time - status.tick > 10000)) {
        this.resetColonyEfficiency(colonyName)
    }
    new RoomVisual(colonyName).text(`🏭${Math.floor(100 * (status.profit - status.cost) / (Game.time - status.tick)) / 100}e/tick`, visualPos.x + 1, visualPos.y + 2, { align: 'left' })
    Game.map.visual.text(`🏭${Math.floor(100 * (status.profit - status.cost) / (Game.time - status.tick)) / 100}e/tick`, visualPos, { fontSize: 7 })

    if (colony && colony.controller.owner && !['Invader'].includes(colony.controller.owner.username)) {
        return this.abandonColony(colonyName)
    }

    if (this.checkColonyInvader(colonyName)) {
        new RoomVisual(colonyName).text(`👿Invader`, visualPos.x + 1, visualPos.y - 1, { align: 'left' })
        if (!getNumCreepsByRole(colonyName, 'colonyDefender')) {
            return this.requestColonyDefender(colonyName)
        }
    }

    if (this.checkColonyInvaderCore(colonyName)) {
        new RoomVisual(colonyName).text(`👿InvaderCore`, visualPos.x + 1, visualPos.y - 1, { align: 'left' })
        if (!getNumCreepsByRole(colonyName, 'colonyCoreDefender')) {
            return this.requestColonyCoreDefender(colonyName)
        }
    }

    if (status.state === 'init') {
        if (!(this.storage && this.energyCapacityAvailable >= 1300)) {
            return
        }
        status.state = 'reservation'
        return
    }

    if (status.state === 'reservation') {
        if (colony && colony.controller.reservation && colony.controller.reservation.username === MY_NAME) {
            status.state = 'build'
        } else if (!getNumCreepsByRole(colonyName, 'reserver')) {
            this.requestReserver(colonyName)
        }
        return
    }

    if (!colony || !colony.controller.reservation || colony.controller.reservation.username === 'Invader' || colony.controller.reservation.ticksToEnd < 500) {
        if (!getNumCreepsByRole(colonyName, 'reserver')) {
            this.requestReserver(colonyName)
        }
    }

    if (!colony) {
        return
    } else {
        if (colony.controller.reservation) {
            colony.visual.text(`⏱️${colony.controller.reservation.ticksToEnd}`, colony.controller.pos.x + 1, colony.controller.pos.y + 1, { align: 'left' })
        }
    }

    if (status.state === 'build') {
        if (!(colony && colony.controller.reservation && colony.controller.reservation.username === MY_NAME)) {
            status.state = 'reservation'
            return ERR_NOT_FOUND
        }
        const infraPlan = this.getColonyInfraPlan(colonyName, status)
        if (!infraPlan) {
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
            const laborers = getCreepsByRole(colonyName, 'colonyLaborer').filter(creep => creep.memory.sourceId === source.id)
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

    if (status.state === 'extraction') {
        if (Game.time % 1000 === 0) {
            const infraPlan = this.getColonyInfraPlan(colonyName, status)
            if (!infraPlan) {
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

        const sources = colony.sources
        for (const source of sources) {
            if (!source) {
                delete status.infraPlan
                status.state = 'init'
            }
            if (!source.container) {
                status.state = 'build'
                return
            }

            const colonyMiners = Object.values(Game.creeps).filter(creep => creep.memory.role === 'colonyMiner' && creep.memory.sourceId === source.id && (creep.ticksToLive || 1500) > (3 * creep.body.length + status.infraPlan[source.id].pathLength))
            let numWork = 0;
            for (const colonyMiner of colonyMiners) {
                numWork += colonyMiner.body.filter(part => part.type === WORK && part.hits >= 100).length
            }

            const colonyHaulers = Object.values(Game.creeps).filter(creep => creep.memory.role === 'colonyHauler' && creep.memory.sourceId === source.id && (creep.ticksToLive || 1500) > 3 * creep.body.length)
            let numCarry = 0;
            const maxCarry = Math.floor(status.infraPlan[source.id].pathLength * 0.5)
            const maxNumHauler = Math.ceil(maxCarry / (2 * Math.min(Math.floor(this.energyCapacityAvailable / 150), 16)))
            for (const colonyHaluer of colonyHaulers) {
                numCarry += colonyHaluer.body.filter(part => part.type === CARRY && part.hits >= 100).length
            }

            if (colony) {

                const visualOption = { font: 0.5, align: 'left' }
                colony.visual.text(`⛏️${numWork} / 6`, source.pos.x + 0.5, source.pos.y - 0.25, visualOption)
                colony.visual.text(`🚚${numCarry} / ${maxCarry}`, source.pos.x + 0.5, source.pos.y + 0.5, visualOption)

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
            }

            if (colonyMiners.length < source.available && numWork < 6) {
                this.requestColonyMiner(colonyName, source.id)
                continue;
            }

            if (colonyHaulers.length < maxNumHauler && numCarry < maxCarry && source.container.hits >= 180000) {
                this.requestColonyHauler(colonyName, source.id, maxCarry - numCarry, status.infraPlan[source.id].pathLength)
                continue;
            }
        }
    }
}

Object.defineProperties(Flag.prototype, {
    isInvader: {
        get() {
            if (!this.room) {
                return this.memory.isInvader
            }
            const hostileCreeps = this.room.find(FIND_HOSTILE_CREEPS).filter(creep => creep.checkBodyParts(['work', 'attack', 'ranged_attack']))
            if (!this.memory.isInvader && hostileCreeps.length) {
                this.memory.isInvader = true
                this.room.memory.isInvader = true
            } else if (this.memory.isInvader && !hostileCreeps.length) {
                this.memory.isInvader = false
                this.room.memory.isInvader = false
            }
            return this.memory.isInvader
        }
    },
    isInvaderCore: {
        get() {
            if (!this.room) {
                return this.memory.isInvaderCore
            }
            if (!this.memory.isInvaderCore && this.room.find(FIND_HOSTILE_STRUCTURES).length) {
                this.memory.isInvaderCore = true
            } else if (this.memory.isInvaderCore && !this.room.find(FIND_HOSTILE_STRUCTURES).length) {
                this.memory.isInvaderCore = false
            }
            return this.memory.isInvaderCore
        }
    },
})

Room.prototype.manageColony = function () {
    if (!this.memory.colony) {
        return
    }

    for (const colonyName of Object.keys(this.memory.colony)) {
        this.ruleColony(colonyName)
    }
    return
}

Room.prototype.abandonColony = function (colonyName) {
    if (this.memory.colony && this.memory.colony) {
        return delete this.memory.colony[colonyName]
    }
}

Room.prototype.checkColonyInvader = function (colonyName) {
    const colony = Game.rooms[colonyName]
    const status = this.memory.colony[colonyName]
    if (!colony) {
        return status.isInvader
    }
    const hostileCreeps = colony.find(FIND_HOSTILE_CREEPS).filter(creep => creep.checkBodyParts(['work', 'attack', 'ranged_attack', 'heal', 'claim']))
    const killerCreeps = hostileCreeps.filter(creep => creep.checkBodyParts(['attack', 'ranged_attack', 'heal']))

    let attackPower = 0
    let healPower = 0
    for (const killerCreep of killerCreeps) {
        attackPower += killerCreep.calcAttackPower()
        healPower += killerCreep.calcHealPower()
    }
    if (healPower > 100) {
        this.abandonColony(colonyName)
    }
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
        data.recordLog(`InvaderCore have appeared in ${colonyName}`)
        status.isInvaderCore = true
    } else if (status.isInvaderCore && !hostileStructures.length) {
        data.recordLog(`InvaderCore has been destroyed in ${colonyName}`)
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
        data.recordLog(`${colonyName} has efficiency ${efficiency * 100}%`)
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