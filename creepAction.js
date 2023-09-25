function miner(creep) {
    // 캐러 갈 곳
    const room = creep.room //지금 크립이 있는 방
    const source = Game.getObjectById(creep.memory.sourceId)
    const container = sourceContainer()
    const link = sourceLink(source)

    if (container && !room.lookAt(sourceContainer()).filter(obj => obj.type === LOOK_CREEPS).length) {
        if (creep.pos.getRangeTo(container) > 0) {
            return creep.moveMy(container)
        }
    }

    if (creep.pos.getRangeTo(source) > 1) {
        return creep.moveMy(source, { range: 1 })
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

    function sourceContainer() {
        let _sourceContainer = Game.getObjectById(creep.memory.sourceContainer)
        if (_sourceContainer) {
            return _sourceContainer
        }
        _sourceContainer = source.container
        if (_sourceContainer) {
            creep.memory.sourceContainer = _sourceContainer.id
            return _sourceContainer
        }
        return false
    }

    function sourceLink(source) {
        let _sourceLink = Game.getObjectById(creep.memory.sourceLink)
        if (_sourceLink) {
            return _sourceLink
        }
        _sourceLink = source.link
        if (_sourceLink) {
            creep.memory.sourceLink = _sourceLink.id
            return _sourceLink
        }
        return false
    }
}

function wallMaker(creep) { //스폰을 대입하는 함수 (이름 아님)
    const room = creep.room

    if (creep.ticksToLive < 20) {
        creep.getRecycled()
        return
    }

    if (creep.memory.working && creep.store.getUsedCapacity(RESOURCE_ENERGY) < 1) {
        creep.memory.working = false
    } else if (!creep.memory.working && creep.store.getFreeCapacity(RESOURCE_ENERGY) < 1) {
        creep.memory.working = true;
        creep.memory.task = target().id
    }

    if (!creep.memory.working) {
        if (room.storage) {
            if (creep.withdraw(room.storage, RESOURCE_ENERGY) === -9) {
                creep.moveMy(room.storage, { range: 1 })
            }
        }
        return
    }
    if (Game.getObjectById(creep.memory.task)) {
        if (creep.repair(Game.getObjectById(creep.memory.task)) === -9) {
            creep.moveMy(Game.getObjectById(creep.memory.task).pos, { range: 3 })
        }
        return
    }
    creep.memory.task = target().id
    return

    function target() {
        if (room.structures.constructedWall.length || room.structures.rampart.length) {
            return room.structures.constructedWall.concat(room.structures.rampart).sort((a, b) => { return a.hits - b.hits })[0]
        }
        return false
    }
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
            creep.moveMy(center, { range: 20, maxRooms: 1 })
            return
        }
        return
    }

    const colony = Game.rooms[creep.memory.colony]
    const controller = colony ? colony.controller : undefined
    const base = Game.rooms[creep.memory.base]
    if (creep.room.name !== creep.memory.colony) {
        if (controller) {
            if (creep.moveMy(controller, { range: 1 }) !== ERR_NO_PATH) {
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
        if (creep.moveMy(controller, { range: 1 }) === ERR_NO_PATH) {
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
            creep.moveMy(center, { range: 20, maxRooms: 1 })
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
            return creep.moveMy(target, { range: 3 })
        }

        return creep.build(target)
    }

    const colony = Game.rooms[creep.memory.colony]

    if (colony) {
        const source = Game.getObjectById(creep.memory.sourceId)
        if (creep.harvest(source) === -9) {
            creep.moveMy(source, { range: 1 })
        }
        return
    } else {
        creep.moveToRoom(creep.memory.colony)
        return
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
        if (creep.room.memory.isKiller === true) {
            creep.moveToRoom(creep.memory.base, 2)
            return
        }
        const center = new RoomPosition(25, 25, creep.room.name)
        if (creep.pos.getRangeTo(center) > 20) {
            creep.moveMy(center, { range: 20, maxRooms: 1 })
            return
        }
        return
    }


    const source = Game.getObjectById(creep.memory.sourceId)

    if (!source && creep.room.name !== creep.memory.colony) {
        creep.moveToRoom(creep.memory.colony)
        return
    }

    if (!source || !source.container) {
        return false
    }

    if (creep.pos.getRangeTo(source.container) > 0) {
        return creep.moveMy(source.container)
    }

    creep.harvest(source)

    if (source.container.hits < 200000) {
        creep.repair(source.container)
    }
    creep.room.visual.line(creep.pos, source.container.pos, { color: 'orange' })
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
            creep.moveMy(center, { range: 20, maxRooms: 1 })
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
        const storage = room.storage
        if (!storage) {
            data.recordLog(`COLONY: Abandon ${creep.memory.colony} since storage is gone`, creep.memory.base)
            room.abandonColony(creep.memory.colony)
            creep.suicide()
            return
        }
        creep.moveMy(storage, { range: 1 })
        return
    }

    // 행동
    if (creep.memory.supplying) {
        const room = Game.rooms[creep.memory.base]
        if (!room) {
            creep.suicide()
        }
        const storage = room.storage
        if (!storage) {
            data.recordLog(`COLONY: Abandon ${creep.memory.colony} since storage is gone`, creep.memory.base)
            room.abandonColony(creep.memory.colony)
            creep.suicide()
            return
        }

        if (creep.room.name !== creep.memory.base) {
            const closeBrokenThings = creep.pos.findInRange(creep.room.structures.damaged, 3).filter(structure => structure.structureType === STRUCTURE_ROAD)
            if (closeBrokenThings.length) {
                creep.repair(closeBrokenThings[0])
            }
            creep.moveMy(storage.pos, { range: 1 })
            return
        }
        if (creep.pos.getRangeTo(storage) > 1) {
            return creep.moveMy(storage, { range: 1 })
        }
        if (creep.transfer(creep.room.storage, RESOURCE_ENERGY) === OK) {
            creep.room.addRemoteProfit(creep.memory.colony, creep.store[RESOURCE_ENERGY])
        }
        return
    }

    if (creep.ticksToLive < 1.1 * creep.memory.sourcePathLength) {
        creep.suicide()
        return
    }

    const source = Game.getObjectById(creep.memory.sourceId)
    if (!source || !source.container) {
        return
    }

    if (creep.room.name !== creep.memory.colony) {
        creep.moveMy(source.container.pos, { range: 1 })
        return
    }

    if (creep.pos.findInRange(creep.room.find(FIND_DROPPED_RESOURCES), 1).length) {
        if (creep.pickup(creep.pos.findInRange(creep.room.find(FIND_DROPPED_RESOURCES), 1)[0]) === -9) {
            creep.moveMy(source.container.pos, { range: 1 })
        }
        return
    }

    if (creep.pos.getRangeTo(source.container.pos) > 1) {
        creep.moveMy(source.container.pos, { range: 1 })
        return
    }

    if (source.container.store[RESOURCE_ENERGY] >= creep.store.getFreeCapacity(RESOURCE_ENERGY)) {
        creep.withdraw(source.container, RESOURCE_ENERGY)
    }
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
    const target = creep.pos.findClosestByPath(hostileCreeps)
    if (hostileCreeps.length) {
        creep.memory.lastEnemy = Game.time
        creep.heal(creep)
        const range = creep.pos.getRangeTo(target)
        if (range <= 1) {
            creep.rangedMassAttack(target)
        } else if (range <= 3) {
            creep.rangedAttack(target)
        }

        if ((creep.hits / creep.hitsMax) <= 0.6) {
            creep.fleeFrom(target)
            return
        }

        if (range > 3) {
            creep.moveMy(target, { range: 1, avoidRampart: false, ignoreMap: 1 })
        } else if (creep.pos.getRangeTo(target) < 3) {
            creep.fleeFrom(target)
        }
        return
    }

    const wounded = creep.room.find(FIND_MY_CREEPS).filter(creep => creep.hitsMax - creep.hits > 0)
    if (wounded.length) {
        const target = creep.pos.findClosestByRange(wounded)
        if (creep.pos.getRangeTo(target) > 1) {
            creep.moveMy(target, { range: 1, avoidRampart: false, ignoreMap: 1 })
        }
        creep.heal(target)
        return
    }

    const constructionSites = creep.room.find(FIND_CONSTRUCTION_SITES).sort((a, b) => a.pos.getRangeTo(creep) - b.pos.getRangeTo(creep))
    for (const constructionSite of constructionSites) {
        if (!constructionSite.my) {
            if (constructionSite.pos.isWall) {
                continue
            }
            return creep.moveMy(constructionSite)
        }
    }

    const hostileStructure = creep.pos.findClosestByPath(creep.room.find(FIND_HOSTILE_STRUCTURES).filter(structure => structure.structureType !== 'controller'))
    if (hostileStructure) {
        if (creep.pos.getRangeTo(hostileStructure) > 1) {
            creep.moveMy(hostileStructure, { range: 1, avoidRampart: false, ignoreMap: 1 })
            return
        }
        creep.rangedMassAttack(hostileStructure)
        return
    }

    if (creep.room.constructionSites.length) {
        const targetProtect = creep.room.constructionSites.sort((a, b) => b.progress - a.progress)[0]
        if (creep.pos.getRangeTo(targetProtect) > 3) {
            return creep.moveMy(targetProtect, { range: 3, avoidRampart: false, ignoreMap: 1 })
        }
    }



    const center = new RoomPosition(25, 25, creep.memory.colony)
    if (creep.pos.getRangeTo(center) > 23) {
        creep.moveMy(center, { range: 23, avoidRampart: false, ignoreMap: 1 })
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
            creep.moveMy(target, { range: 1 })
        }
        return
    }

    const constructedWalls = creep.room.find(FIND_STRUCTURES).filter(structure => structure.structureType === STRUCTURE_WALL)
    const targetCore = creep.pos.findClosestByPath(creep.room.find(FIND_HOSTILE_STRUCTURES).concat(constructedWalls))
    if (targetCore) {
        if (creep.pos.getRangeTo(targetCore) > 1) {
            creep.moveMy(targetCore, { range: 1 })
            return
        }
        creep.attack(targetCore)
        return
    }

    const center = new RoomPosition(25, 25, creep.memory.colony)
    if (creep.pos.getRangeTo(center) > 23) {
        creep.moveMy(center, { range: 23 })
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
            return creep.moveMy(controller, { range: 1 })
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
        return creep.moveMy(controller, { range: 1 });
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
                    return creep.moveMy(workshop, { range: 3 })
                }
            } else {
                if (creep.upgradeController(creep.room.controller) === -9) {
                    return creep.moveMy(creep.room.controller, { range: 3 })
                }
            }
        } else {
            const remainStructures = creep.room.find(FIND_STRUCTURES).filter(structure => structure.store && structure.store[RESOURCE_ENERGY] > 100)
            remainStructures.push(...creep.room.find(FIND_RUINS).filter(ruin => ruin.store[RESOURCE_ENERGY] > 0))
            if (remainStructures.length) {
                creep.memory.withdrawFrom = creep.pos.findClosestByRange(remainStructures).id
                if (creep.withdraw(Game.getObjectById(creep.memory.withdrawFrom), RESOURCE_ENERGY) === -9) {
                    return creep.moveMy(Game.getObjectById(creep.memory.withdrawFrom), { range: 1 })
                }
            }
            const droppedEnergies = creep.room.find(FIND_DROPPED_RESOURCES).filter(resource => resource.resourceType === 'energy')
            const closestDroppedEnergy = creep.pos.findClosestByRange(droppedEnergies)
            if (creep.pos.getRangeTo(closestDroppedEnergy) <= 3) {
                if (creep.pos.getRangeTo(closestDroppedEnergy) > 1) {
                    return creep.moveMy(closestDroppedEnergy, { range: 1 })
                }
                return creep.pickup(closestDroppedEnergy)
            }
            const sources = creep.room.sources
            if (sources.length === 0) {
                return
            }
            const source = sources[(creep.memory.number || 0) % 2]
            if (creep.pos.getRangeTo(source) > 1) {
                return creep.moveMy(source, { range: 1 })
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
        return creep.moveMy(target, { range: 20 });
    }
}

function researcher(creep) {
    creep.delivery()
}

module.exports = { miner, extractor, reserver, claimer, pioneer, colonyLaborer, colonyMiner, colonyHauler, colonyDefender, colonyCoreDefender, wallMaker, researcher }