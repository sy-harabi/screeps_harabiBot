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
        const targetPos = source.pos.getAtRange(1).find(pos => pos.walkable && (!pos.creep || (pos.creep.my && pos.creep.memory.role !== creep.memory.role)))
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

    if (creep.memory.working && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
        delete creep.memory.task
        creep.memory.working = false
    } else if (!creep.memory.working && creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        creep.memory.working = true;
    }

    if (!creep.memory.working) {
        if (room.storage) {
            if (creep.pos.getRangeTo(room.storage) > 1) {
                creep.moveMy({ pos: room.storage.pos, range: 1 })
                return
            }
            creep.withdraw(room.storage, RESOURCE_ENERGY)
        }
        return
    }

    let target = Game.getObjectById(creep.memory.task)
    if (target) {
        creep.setWorkingInfo(target.pos, 3)
    }

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
        return
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

function avoidEnemy(creep) {
    if (!creep.memory.runAway && creep.room.memory.isKiller) {
        creep.memory.runAway = true
        creep.memory.killerRoom = creep.room.name
    } else if (creep.memory.runAway && Game.rooms[creep.memory.killerRoom] && !Game.rooms[creep.memory.killerRoom].memory.isKiller) {
        creep.memory.runAway = false
    }

    if (creep.memory.runAway) {
        if (creep.room.memory.isKiller) {

            const enemyCombatants = creep.room.getEnemyCombatants()
            for (const enemy of enemyCombatants) {
                if (creep.pos.getRangeTo(enemy.pos) < 10) {
                    creep.fleeFrom(enemy, 15)
                    return OK
                }
            }

            const isDefender = creep.room.getIsDefender()
            if (isDefender) {
                return ERR_NOT_IN_RANGE
            }

            creep.moveToRoom(creep.memory.base, 2)
            return OK
        }
        const center = new RoomPosition(25, 25, creep.room.name)
        if (creep.pos.getRangeTo(center) > 20) {
            creep.moveMy({ pos: center, range: 20 })
        }
        return OK
    }
    return ERR_NOT_FOUND
}

function reserver(creep) {
    if (creep.memory.getRecycled === true) {
        creep.getRecycled()
        return
    }

    if (avoidEnemy(creep) === OK) {
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
        const targetPos = controller.pos.getAtRange(1).find(pos => pos.walkable && (!pos.creep || (pos.creep.my && pos.creep.memory.role !== creep.memory.role)))
        if (!targetPos) {
            if (creep.pos.getRangeTo(controller.pos) > 3) {
                creep.moveMy({ pos: controller.pos, range: 3 })
            }
            return
        }
        creep.moveMy({ pos: targetPos, range: 0 })
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

    creep.setWorkingInfo(controller.pos, 1)
    creep.reserveController(controller)
    return
}

function colonyLaborer(creep) {
    if (creep.memory.getRecycled === true) {
        if (creep.room.name === creep.memory.base) {
            creep.getRecycled()
            return
        }
        const room = Game.rooms[creep.memory.base]
        if (!room) {
            creep.suicide()
            return
        }
        creep.moveToRoom(creep.memory.base)
        return
    }

    if (avoidEnemy(creep) === OK) {
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
            creep.getRecycled()
            return
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
        if (creep.room.name === creep.memory.base) {
            creep.getRecycled()
            return
        }
        const room = Game.rooms[creep.memory.base]
        if (!room) {
            creep.suicide()
            return
        }
        creep.moveToRoom(creep.memory.base)
        return
    }

    if (avoidEnemy(creep) === OK) {
        return
    }

    const source = Game.getObjectById(creep.memory.sourceId)

    const container = (function () {
        const containerId = creep.memory.containerId
        if (containerId) {
            const containerById = Game.getObjectById(containerId)
            if (containerById) {
                return containerById
            }
        }

        if (source) {
            return source.container
        }

        return undefined
    })()

    if (!source && creep.room.name !== creep.memory.colony) {
        creep.moveToRoom(creep.memory.colony)
        return
    }

    if (container && !creep.pos.isEqualTo(container.pos)) {
        if (!container.pos.creep || (container.pos.creep.my && container.pos.creep.memory.role !== creep.memory.role)) {
            return creep.moveMy({ pos: container.pos, range: 0 })
        }
    }

    if (creep.pos.getRangeTo(source) > 1) {
        const targetPos = source.pos.getAtRange(1).find(pos => pos.walkable && (!pos.creep || (pos.creep.my && pos.creep.memory.role !== creep.memory.role)))
        if (!targetPos) {
            creep.moveMy({ pos: source.pos, range: 3 })
            return
        }
        return creep.moveMy({ pos: targetPos, range: 0 })
    }

    creep.setWorkingInfo(source.pos, 1)

    creep.harvest(source)

    if (container && container.hits < 200000) {
        creep.repair(container)
    }
}

function colonyHauler(creep) {
    if (avoidEnemy(creep) === OK) {
        return
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
        creep.moveToRoom(creep.memory.base)
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
        const base = Game.rooms[creep.memory.base]
        const amount = creep.store.getUsedCapacity(RESOURCE_ENERGY)
        if (base) {
            base.addRemoteProfit(creep.memory.colony, amount)
        }
        creep.say('addP', true)
        creep.memory.supplying = true
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
            creep.setWorkingInfo(target.pos, 3)
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
        creep.memory.getRecycled = true
        const base = Game.rooms[creep.memory.base]
        const amount = creep.store.getUsedCapacity(RESOURCE_ENERGY)
        if (base) {
            base.addRemoteProfit(creep.memory.colony, amount)
        }
        creep.say('addP', true)
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
    if (creep.pos.getRangeTo(source.pos) > 3) {
        creep.moveMy({ pos: source.pos, range: 1 })
    }
    return
}

function colonyDefender(creep) {
    creep.activeHeal()

    creep.harasserRangedAttack()

    if (!creep.memory.flee && (creep.hits / creep.hitsMax) <= 0.7) {
        creep.memory.flee = true
    } else if (creep.memory.flee && (creep.hits / creep.hitsMax) === 1) {
        creep.memory.flee = false
    }

    if (creep.room.name !== creep.memory.colony) {
        if (creep.memory.wait) {
            return
        }

        if (creep.memory.flee) {
            const enemyCombatants = creep.room.getEnemyCombatants()
            for (const enemy of enemyCombatants) {
                if (creep.pos.getRangeTo(enemy.pos) < 10) {
                    creep.fleeFrom(enemy, 15)
                    return
                }
            }
            const center = new RoomPosition(25, 25, creep.room.name)
            if (creep.pos.getRangeTo(center) > 20) {
                creep.moveMy({ pos: center, range: 20 })
            }
            return
        }

        creep.moveToRoom(creep.memory.colony, 1)
        return
    }

    const hostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS)
    const killerCreeps = hostileCreeps.filter(creep => creep.checkBodyParts(['attack', 'ranged_attack', 'heal']))

    const closestKillerCreep = creep.pos.findClosestByPath(killerCreeps)

    if (closestKillerCreep) {
        const myNetAttack = creep.attackPower - closestKillerCreep.healPower

        const hostileNetAttack = closestKillerCreep.attackPower - creep.healPower

        const idealRange = (myNetAttack > hostileNetAttack) > 0.9 ? 2 : 3

        creep.memory.lastEnemy = Game.time
        const range = creep.pos.getRangeTo(closestKillerCreep)

        if (creep.memory.flee && myNetAttack < hostileNetAttack) {
            creep.fleeFrom(closestKillerCreep)
            return
        }

        if (range > idealRange) {
            creep.moveMy({ pos: closestKillerCreep.pos, range: idealRange }, { ignoreCreeps: false, staySafe: false, ignoreMap: 1 })
        } else if (range < idealRange) {
            creep.fleeFrom(closestKillerCreep)
        }
        return
    }

    const closestHostileCreep = creep.pos.findClosestByPath(hostileCreeps)

    if (closestHostileCreep) {
        const range = creep.pos.getRangeTo(closestHostileCreep)

        if (range <= 1) {
            creep.rangedMassAttack(closestHostileCreep)
        } else if (range <= 3) {
            creep.rangedAttack(closestHostileCreep)
        }

        if (range > 1) {
            creep.moveMy({ pos: closestHostileCreep.pos, range: 1 }, { staySafe: false, ignoreMap: 1 })
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

    const hostileStructure = creep.pos.findClosestByPath(creep.room.find(FIND_HOSTILE_STRUCTURES).filter(structure => {
        const structureType = structure.structureType
        if (structureType === 'controller') {
            return false
        }
        if (structureType === 'powerBank') {
            return false
        }
        return true
    }))
    if (hostileStructure) {
        if (creep.pos.getRangeTo(hostileStructure) > 1) {
            creep.moveMy({ pos: hostileStructure.pos, range: 1 }, { staySafe: false, ignoreMap: 1 })
            return
        }
        creep.rangedMassAttack(hostileStructure)
        return
    }

    const center = new RoomPosition(25, 25, creep.memory.colony)
    if (creep.pos.getRangeTo(center) > 20) {
        creep.moveMy({ pos: center, range: 20 }, { staySafe: false, ignoreMap: 1 })
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
        if (target) {
            const range = creep.pos.getRangeTo(target)
            if (range <= 1) {
                creep.attack(target)
            } else {
                creep.moveMy({ pos: target.pos, range: 1 })
            }
            return
        }
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