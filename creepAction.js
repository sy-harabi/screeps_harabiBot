function miner(creep) {
    // 캐러 갈 곳
    const source = Game.getObjectById(creep.memory.sourceId)
    const container = source.container
    const link = source.link

    if (container && !creep.pos.isEqualTo(container.pos)) {
        if (!container.pos.creep || container.pos.creep.memory.role !== creep.memory.role) {
            return creep.moveMy(source.container)
        }
    }

    if (creep.pos.getRangeTo(source) > 1) {
        const targetPos = source.pos.getAtRange(1).filter(pos => pos.walkable && (!pos.creep || (pos.creep.my && pos.creep.memory.role !== creep.memory.role)))[0]
        if (!targetPos) {
            creep.moveMy({ pos: source.pos, range: 3 })
            return
        }
        return creep.moveMy({ pos: targetPos, range: 0 })
    }

    creep.harvest(source)

    if (!creep.store.getCapacity()) {
        return
    }

    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) && container && container.hits < 248000) {
        return creep.repair(container)
    }

    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 40) {
        return creep.transfer(link, RESOURCE_ENERGY)
    }

    if (container && container.store[RESOURCE_ENERGY]) {
        return creep.withdraw(container, RESOURCE_ENERGY)
    }
}

function wallMaker(creep) { //스폰을 대입하는 함수 (이름 아님)
    const room = creep.room

    if (creep.ticksToLive < 20) {
        creep.getRecycled()
        return
    }

    if (creep.memory.working && creep.store.getUsedCapacity(RESOURCE_ENERGY) < 1) {
        delete creep.memory.task
        creep.memory.working = false
    } else if (!creep.memory.working && creep.store.getFreeCapacity(RESOURCE_ENERGY) < 1) {
        creep.memory.working = true;
    }

    if (!creep.memory.working) {
        if (room.storage) {
            if (creep.withdraw(room.storage, RESOURCE_ENERGY) === -9) {
                creep.moveMy({ pos: room.storage.pos, range: 1 })
            }
        }
        return
    }

    let target = Game.getObjectById(creep.memory.task)

    if (!target) {
        target = creep.room.weakestRampart
        if (target) {
            creep.memory.task = target.id
        }
    }

    if (creep.pos.getRangeTo(target) > 3) {
        creep.moveMy({ pos: target.pos, range: 3 })
        return
    }

    target = getMinObject(creep.pos.findInRange(creep.room.structures.rampart, 3), rampart => rampart.hits)
    creep.repair(target)
}

function extractor(creep) { //스폰을 대입하는 함수 (이름 아님)
    const terminal = Game.getObjectById(creep.memory.terminal)
    const mineral = Game.getObjectById(creep.memory.mineral)
    const extractor = creep.room.structures.extractor[0]
    if (!extractor) {
        this.getRecycled()
    }
    const container = extractor.pos.findInRange(creep.room.structures.container, 1)[0]
    if (!terminal || !container) {
        data.recordLog(`FAIL: ${creep.name} can't harvest mineral`, creep.room.name)
        return
    }

    //행동

    if (!creep.pos.isEqualTo(container.pos)) {
        return creep.moveMy(container.pos)
    }

    if (extractor.cooldown === 0) {
        return creep.harvest(mineral)
    }
}

function reserver(creep) {
    if (creep.memory.getRecycled === true) {
        creep.getRecycled()
    }

    if (!creep.memory.runAway && creep.room.memory.isKiller) {
        creep.memory.runAway = true
        creep.memory.killerRoom = creep.room.name
    } else if (creep.memory.runAway && Game.rooms[creep.memory.killerRoom] && !Game.rooms[creep.memory.killerRoom].memory.isKiller) {
        creep.memory.runAway = false
    }

    if (creep.memory.runAway) {
        if (creep.room.memory.isKiller) {
            creep.moveToRoom(creep.memory.base, 2)
            return
        }
        const center = new RoomPosition(25, 25, creep.room.name)
        if (creep.pos.getRangeTo(center) > 20) {
            creep.moveMy({ pos: center, range: 20 })
            return
        }
        return
    }

    const colony = Game.rooms[creep.memory.colony]
    const controller = colony ? colony.controller : undefined
    const base = Game.rooms[creep.memory.base]
    if (creep.room.name !== creep.memory.colony) {
        if (controller) {
            if (creep.moveMy({ pos: controller.pos, range: 1 }) !== ERR_NO_PATH) {
                return
            }
            if (colony && !colony.getAccessibleToController()) {
                data.recordLog(`COLONY: Abandon ${colony.hyperLink} since controller is blocked`, creep.memory.colony)
                base.abandonColony(creep.memory.colony)
                creep.suicide()
            }
            return
        }
        creep.moveToRoom(creep.memory.colony)
        return
    }

    if (creep.pos.getRangeTo(controller.pos) > 1) {
        if (creep.moveMy({ pos: controller.pos, range: 1 }) === ERR_NO_PATH) {
            if (colony && !colony.getAccessibleToController()) {
                data.recordLog(`COLONY: Abandon ${colony.hyperLink} since controller is blocked`, creep.memory.colony)
                base.abandonColony(creep.memory.colony)
                creep.suicide()
            }
        }
        return
    }

    if (!controller.sign || controller.sign.username !== creep.owner.username) {
        creep.signController(controller, "A creep can do what he wants, but not want what he wants.")
    }

    // if reserved, attack controller
    if (controller.reservation && controller.reservation.username !== MY_NAME) {
        creep.attackController(controller)
        return
    }

    creep.reserveController(controller)
    return
}

function colonyLaborer(creep) {
    if (creep.memory.getRecycled === true) {
        creep.getRecycled()
    }

    if (!creep.memory.runAway && creep.room.memory.isKiller) {
        creep.memory.runAway = true
        creep.memory.killerRoom = creep.room.name
    } else if (creep.memory.runAway && Game.rooms[creep.memory.killerRoom] && !Game.rooms[creep.memory.killerRoom].memory.isKiller) {
        creep.memory.runAway = false
    }

    if (creep.memory.runAway) {
        if (creep.room.memory.isKiller) {
            creep.moveToRoom(creep.memory.base, 2)
            return
        }
        const center = new RoomPosition(25, 25, creep.room.name)
        if (creep.pos.getRangeTo(center) > 20) {
            creep.moveMy({ pos: center, range: 20 })
            return
        }
        return
    }

    // 논리회로
    if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.working = false
    } else if (!creep.memory.working && creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        creep.memory.working = true
    }

    // 행동
    if (creep.memory.working) {
        if (!creep.memory.task) {
            if (creep.room.constructionSites.length) {
                creep.memory.task = creep.pos.findClosestByRange(creep.room.constructionSites).id
            } else {
                creep.memory.task = undefined
            }
        }

        const target = creep.memory.task ? Game.getObjectById(creep.memory.task) : undefined

        if (!target) {
            delete creep.memory.task
            if (creep.room.name !== creep.memory.base) {
                return creep.moveToRoom(creep.memory.base)
            }
            return creep.getRecycled()
        }

        if (creep.pos.getRangeTo(target) > 3) {
            return creep.moveMy({ pos: target.pos, range: 3 })
        }

        return creep.build(target)
    }

    if (creep.room.name !== creep.memory.colony) {
        creep.moveToRoom(creep.memory.colony)
        return
    }

    const source = Game.getObjectById(creep.memory.sourceId)
    const droppedEnergy = source.pos.findInRange(FIND_DROPPED_RESOURCES, 2)[0]

    if (droppedEnergy) {
        creep.getEnergyFrom(droppedEnergy.id)
        return
    }

    if (source.container) {
        creep.getEnergyFrom(source.container.id)
        return
    }

    if (source) {
        creep.moveMy({ pos: source.pos, range: 3 })
    }
}

function colonyMiner(creep) {
    if (creep.memory.getRecycled === true) {
        creep.getRecycled()
    }

    if (!creep.memory.runAway && creep.room.memory.isKiller) {
        creep.memory.runAway = true
        creep.memory.killerRoom = creep.room.name
    } else if (creep.memory.runAway && Game.rooms[creep.memory.killerRoom] && !Game.rooms[creep.memory.killerRoom].memory.isKiller) {
        creep.memory.runAway = false
    }

    if (creep.memory.runAway) {
        if (creep.room.memory.isKiller) {
            creep.moveToRoom(creep.memory.base, 2)
            return
        }
        const center = new RoomPosition(25, 25, creep.room.name)
        if (creep.pos.getRangeTo(center) > 20) {
            creep.moveMy({ pos: center, range: 20 })
            return
        }
        return
    }


    const source = Game.getObjectById(creep.memory.sourceId)
    const container = source ? source.container : undefined

    if (!source && creep.room.name !== creep.memory.colony) {
        creep.moveToRoom(creep.memory.colony)
        return
    }

    if (container && !creep.pos.isEqualTo(container.pos)) {
        if (!container.pos.creep || (container.pos.creep.my && container.pos.creep.memory.role !== creep.memory.role)) {
            return creep.moveMy(source.container)
        }
    }

    if (creep.pos.getRangeTo(source) > 1) {
        const targetPos = source.pos.getAtRange(1).filter(pos => pos.walkable && (!pos.creep || (pos.creep.my && pos.creep.memory.role !== creep.memory.role)))[0]
        if (!targetPos) {
            creep.moveMy({ pos: source.pos, range: 3 })
            return
        }
        return creep.moveMy({ pos: targetPos, range: 0 })
    }

    if (creep.harvest(source) === OK) {
        const base = Game.rooms[creep.memory.base]
        creep.memory.harvestPower = creep.memory.harvestPower || creep.getActiveBodyparts('work') * HARVEST_POWER
        if (base) {
            base.addRemoteProfit(creep.memory.colony, creep.memory.harvestPower)
        }
    }

    if (source.container && source.container.hits < 200000) {
        creep.repair(source.container)
    }
}

function colonyHauler(creep) {
    if (creep.memory.getRecycled === true) {
        creep.getRecycled()
    }

    if (!creep.memory.runAway && creep.room.memory.isKiller) {
        creep.memory.runAway = true
        creep.memory.killerRoom = creep.room.name
    } else if (creep.memory.runAway && Game.rooms[creep.memory.killerRoom] && !Game.rooms[creep.memory.killerRoom].memory.isKiller) {
        creep.memory.runAway = false
    }

    if (creep.memory.runAway) {
        if (creep.room.memory.isKiller) {
            creep.moveToRoom(creep.memory.base, 2)
            return
        }
        const center = new RoomPosition(25, 25, creep.room.name)
        if (creep.pos.getRangeTo(center) > 20) {
            creep.moveMy({ pos: center, range: 20 })
            return
        }
        return
    }

    // 논리회로
    if (creep.memory.supplying && creep.store[RESOURCE_ENERGY] === 0) {
        if (creep.room.name === creep.memory.base && creep.ticksToLive < 2.2 * creep.memory.sourcePathLength) {
            creep.memory.getRecycled = true
            return
        }
        creep.memory.supplying = false
    } else if (!creep.memory.supplying && creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        creep.memory.supplying = true
    }

    if (creep.memory.getRecycled) {
        if (creep.room.name === creep.memory.base) {
            creep.getRecycled()
            return
        }
        const room = Game.rooms[creep.memory.base]
        if (!room) {
            creep.suicide()
            return
        }
        return
    }

    // 행동
    if (creep.memory.supplying) {
        const colony = Game.rooms[creep.memory.colony]
        const constructionSites = colony ? colony.constructionSites : []
        if (constructionSites.length > 0 && creep.getActiveBodyparts(WORK) > 0) {
            if (creep.room.name !== creep.memory.colony || !isValidCoord(creep.pos.x, creep.pos.y)) {
                creep.moveToRoom(creep.memory.colony)
                return
            }

            if (!creep.memory.task) {
                creep.memory.task = creep.pos.findClosestByRange(constructionSites).id
            }

            const target = creep.memory.task ? Game.getObjectById(creep.memory.task) : undefined

            if (!target) {
                delete creep.memory.task
                return
            }

            if (creep.pos.getRangeTo(target) > 3) {
                creep.moveMy({ pos: target.pos, range: 3 })
                return
            }
            creep.build(target)
            return
        }


        const room = Game.rooms[creep.memory.base]
        if (!room) {
            creep.suicide()
        }

        if (creep.room.name === creep.memory.base) {
            return
        }

        const closeBrokenThings = creep.pos.findInRange(creep.room.structures.damaged, 3).filter(structure => structure.structureType === STRUCTURE_ROAD)
        if (closeBrokenThings.length) {
            creep.repair(closeBrokenThings[0])
        }

        const spawn = room.structures.spawn[0]
        creep.moveMy({ pos: spawn.pos, range: 3 })
        return
    }

    if (creep.ticksToLive < 1.1 * creep.memory.sourcePathLength) {
        creep.suicide()
        return
    }

    const source = Game.getObjectById(creep.memory.sourceId)

    if (!source && creep.room.name !== creep.memory.colony) {
        creep.moveToRoom(creep.memory.colony)
        return
    }

    const droppedEnergy = source.pos.findInRange(FIND_DROPPED_RESOURCES, 2)[0]

    if (droppedEnergy) {
        creep.getEnergyFrom(droppedEnergy.id)
        return
    }

    if (source.container && source.container.store[RESOURCE_ENERGY] > 0) {
        creep.getEnergyFrom(source.container.id)
        return
    }
    creep.moveMy({ pos: source.pos, range: 3 })
    return
}

function colonyDefender(creep) {
    if (creep.room.name !== creep.memory.colony) {
        if (creep.hits < creep.hitsMax) {
            creep.heal(creep)
        }
        creep.moveToRoom(creep.memory.colony, 1)
        return
    }

    const hostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS)
    const closestHostileCreep = creep.pos.findClosestByPath(hostileCreeps)

    if (closestHostileCreep !== null) {
        creep.memory.lastEnemy = Game.time
        creep.heal(creep)
        const range = creep.pos.getRangeTo(closestHostileCreep)
        if (range <= 1) {
            creep.rangedMassAttack(closestHostileCreep)
        } else if (range <= 3) {
            creep.rangedAttack(closestHostileCreep)
        }

        if ((creep.hits / creep.hitsMax) <= 0.6) {
            creep.fleeFrom(closestHostileCreep)
            return
        }

        if (range > 3) {
            creep.moveMy({ pos: closestHostileCreep.pos, range: 1 }, { staySafe: false, ignoreMap: 1 })
        } else if (creep.pos.getRangeTo(closestHostileCreep) < 3) {
            creep.fleeFrom(closestHostileCreep)
        }
        return
    }

    const wounded = creep.room.find(FIND_MY_CREEPS).filter(creep => creep.hitsMax - creep.hits > 0)
    if (wounded.length) {
        const target = creep.pos.findClosestByRange(wounded)
        if (creep.pos.getRangeTo(target) > 1) {
            creep.moveMy({ pos: target.pos, range: 1 }, { staySafe: false, ignoreMap: 1 })
        }
        creep.heal(target)
        return
    }

    const constructionSites = creep.room.find(FIND_CONSTRUCTION_SITES).filter(constructionSite => !constructionSite.my && !constructionSite.pos.isWall)
    const closestConstructionSite = creep.pos.findClosestByPath(constructionSites)
    if (closestConstructionSite) {
        return creep.moveMy(closestConstructionSite)
    }

    const hostileStructure = creep.pos.findClosestByPath(creep.room.find(FIND_HOSTILE_STRUCTURES).filter(structure => structure.structureType !== 'controller'))
    if (hostileStructure) {
        if (creep.pos.getRangeTo(hostileStructure) > 1) {
            creep.moveMy({ pos: hostileStructure.pos, range: 1 }, { staySafe: false, ignoreMap: 1 })
            return
        }
        creep.rangedMassAttack(hostileStructure)
        return
    }

    if (creep.room.constructionSites.length) {
        const targetProtect = creep.room.constructionSites.sort((a, b) => b.progress - a.progress)[0]
        if (creep.pos.getRangeTo(targetProtect) > 3) {
            return creep.moveMy({ pos: targetProtect.pos, range: 3 }, { staySafe: false, ignoreMap: 1 })
        }
    }

    const center = new RoomPosition(25, 25, creep.memory.colony)
    if (creep.pos.getRangeTo(center) > 23) {
        creep.moveMy({ pos: center.pos, range: 23 }, { staySafe: false, ignoreMap: 1 })
    }
}

function colonyCoreDefender(creep) {
    if (creep.room.name !== creep.memory.colony) {
        creep.moveToRoom(creep.memory.colony, 1)
        return
    }

    const hostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS).filter(creep => creep.checkBodyParts(['attack', 'ranged_attack', 'heal']))
    if (hostileCreeps.length) {
        const target = creep.pos.findClosestByPath(hostileCreeps)
        const range = creep.pos.getRangeTo(target)
        if (range <= 1) {
            creep.attack(target)
        } else {
            creep.moveMy({ pos: target.pos, range: 1 })
        }
        return
    }

    const constructedWalls = creep.room.find(FIND_STRUCTURES).filter(structure => structure.structureType === STRUCTURE_WALL)
    const targetCore = creep.pos.findClosestByPath(creep.room.find(FIND_HOSTILE_STRUCTURES).concat(constructedWalls))
    if (targetCore) {
        if (creep.pos.getRangeTo(targetCore) > 1) {
            creep.moveMy({ pos: targetCore.pos, range: 1 })
            return
        }
        creep.attack(targetCore)
        return
    }

    const center = new RoomPosition(25, 25, creep.memory.colony)
    if (creep.pos.getRangeTo(center) > 23) {
        creep.moveMy({ pos: center, range: 23 })
    }
}

function claimer(creep) { //스폰을 대입하는 함수 (이름 아님)
    // 캐러 갈 곳
    if (creep.room.name !== creep.memory.targetRoom && creep.room.find(FIND_FLAGS)[0]) {
        const flag = creep.room.find(FIND_FLAGS)[0]
        if (creep.pos.isEqualTo(flag.pos)) {
            return flag.remove()
        }
        return creep.moveMy(flag.pos)
    }

    if (creep.room.name !== creep.memory.targetRoom) {
        const controller = Game.rooms[creep.memory.targetRoom] ? Game.rooms[creep.memory.targetRoom].controller : false
        if (controller) {
            return creep.moveMy({ pos: controller.pos, range: 1 })
        }
        creep.moveToRoom(creep.memory.targetRoom)
        return
    }

    const controller = creep.room.controller

    if (!controller) {
        return
    }

    // approach
    if (creep.pos.getRangeTo(controller.pos) > 1) {
        return creep.moveMy({ pos: controller.pos, range: 1 });
    }

    // if reserved, attack controller
    if (controller.reservation && controller.reservation.username !== MY_NAME) {
        // spawn core defender
        if (!Overlord.getNumCreepsByRole(creep.memory.targetRoom, 'colonyCoreDefender')) {
            const room = Game.rooms[creep.memory.base]
            if (room) {
                room.requestColonyCoreDefender(creep.memory.targetRoom)
            }
        }
        return creep.attackController(controller)
    }

    // claim
    creep.claimController(controller)

    // sign
    if (!controller.sign || controller.sign.username !== creep.owner.username) {
        creep.signController(controller, "A creep can do what he wants, but not want what he wants.")
    }
}

function pioneer(creep) {
    if (creep.room.name === creep.memory.targetRoom) {
        // 논리회로
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false
        } else if (!creep.memory.working && creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            creep.memory.working = true
        }

        // 행동
        if (creep.memory.working) {
            const spawn = creep.room.structures.spawn[0]
            if (spawn && spawn.store[RESOURCE_ENERGY] < spawn.store.getCapacity(RESOURCE_ENERGY)) {
                return creep.giveEnergyTo(spawn.id)
            }

            if (!Game.getObjectById(creep.memory.task)) {
                if (creep.room.constructionSites.length) {
                    creep.memory.task = creep.room.constructionSites.sort((a, b) => { return BUILD_PRIORITY[a.structureType] - BUILD_PRIORITY[b.structureType] })[0].id
                } else {
                    creep.memory.task = false
                }
            }
            if (creep.room.controller.ticksToDowngrade > 1000 && creep.memory.task) {
                const workshop = Game.getObjectById(creep.memory.task)
                if (creep.build(workshop) === -9) {
                    return creep.moveMy({ pos: workshop.pos, range: 3 })
                }
            } else {
                if (creep.upgradeController(creep.room.controller) === -9) {
                    return creep.moveMy({ pos: creep.room.controller.pos, range: 3 })
                }
            }
        } else {
            const remainStructures = creep.room.find(FIND_STRUCTURES).filter(structure => structure.store && structure.store[RESOURCE_ENERGY] > 100)
            remainStructures.push(...creep.room.find(FIND_RUINS).filter(ruin => ruin.store[RESOURCE_ENERGY] > 0))
            if (remainStructures.length) {
                creep.memory.withdrawFrom = creep.pos.findClosestByRange(remainStructures).id
                if (creep.withdraw(Game.getObjectById(creep.memory.withdrawFrom), RESOURCE_ENERGY) === -9) {
                    return creep.moveMy({ pos: Game.getObjectById(creep.memory.withdrawFrom).pos, range: 1 })
                }
            }
            const droppedEnergies = creep.room.find(FIND_DROPPED_RESOURCES).filter(resource => resource.resourceType === 'energy')
            const closestDroppedEnergy = creep.pos.findClosestByRange(droppedEnergies)
            if (creep.pos.getRangeTo(closestDroppedEnergy) <= 3) {
                if (creep.pos.getRangeTo(closestDroppedEnergy) > 1) {
                    return creep.moveMy({ pos: closestDroppedEnergy.pos, range: 1 })
                }
                return creep.pickup(closestDroppedEnergy)
            }
            const sources = creep.room.sources
            if (sources.length === 0) {
                return
            }
            const source = sources[(creep.memory.number || 0) % 2]
            if (creep.pos.getRangeTo(source) > 1) {
                return creep.moveMy({ pos: source.pos, range: 1 })
            }
            return creep.harvest(source)
        }
    } else {
        if (creep.room.name !== creep.memory.targetRoom && creep.room.find(FIND_FLAGS).length) {
            const flag = creep.room.find(FIND_FLAGS)[0]
            if (creep.pos.isEqualTo(flag.pos)) {
                return flag.remove()
            }
            return creep.moveMy(flag.pos)
        }
        const target = new RoomPosition(25, 25, creep.memory.targetRoom)
        return creep.moveMy({ pos: target, range: 20 });
    }
}

function researcher(creep) {
    creep.delivery()
}

module.exports = { miner, extractor, reserver, claimer, pioneer, colonyLaborer, colonyMiner, colonyHauler, colonyDefender, colonyCoreDefender, wallMaker, researcher }