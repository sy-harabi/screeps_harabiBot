const IMPORTANT_STRUCTURE_TYPES = ['spawn', 'tower']
const INFINITY = 65535

Creep.prototype.attackNear = function () {
    const hostileCreeps = this.room.find(FIND_HOSTILE_CREEPS)

    const nearHostileCreep = this.pos.findInRange(hostileCreeps, 1).sort((a, b) => a.hits - b.hits)[0]
    if (nearHostileCreep) {
        this.attack(nearHostileCreep)
        this.rangedMassAttack()
        return
    }

    const rangedHostileCreep = this.pos.findInRange(hostileCreeps, 3).sort((a, b) => a.hits - b.hits)[0]
    if (rangedHostileCreep) {
        this.rangedAttack(rangedHostileCreep)
        return
    }

    const hostileStructure = this.room.find(FIND_HOSTILE_STRUCTURES)

    const nearHostileStructure = this.pos.findInRange(hostileStructure, 1).sort((a, b) => a.hits - b.hits)[0]
    if (nearHostileStructure) {
        this.attack(nearHostileStructure)
        this.rangedMassAttack()
        return
    }

    const rangedHostileStructure = this.pos.findInRange(hostileStructure, 3).sort((a, b) => a.hits - b.hits)[0]
    if (rangedHostileStructure) {
        this.rangedAttack(rangedHostileStructure)
        return
    }
}

Creep.prototype.attackTarget = function (target) {
    const path = PathFinder.search(this.pos, { pos: target.pos, range: 1 }, {
        plainCost: 2,
        swampCost: 10,
        maxRooms: 1,
        roomCallback: (roomName) => Game.rooms[roomName].costmatrixForBattle
    }).path

    const visualPath = [this.pos, ...path, target.pos]
    this.room.visual.poly(visualPath, { strokeWidth: 0.2, stroke: 'magenta', lineStyle: 'dashed' })

    if (path.length > 0) {
        let structureOnPath = path[0].lookFor(LOOK_STRUCTURES).filter(obj => OBSTACLE_OBJECT_TYPES.includes(obj.structureType))[0]
        let rampartOnPath = path[0].lookFor(LOOK_STRUCTURES).filter(obj => obj.structureType === 'rampart')[0]
        if (rampartOnPath) {
            this.attack(rampartOnPath)
            this.rangedAttack(rampartOnPath)
            return
        }
        if (structureOnPath) {
            this.attack(structureOnPath)
            this.rangedAttack(structureOnPath)
            return
        }
        if (healer.fatigue === 0) {
            this.move(this.pos.getDirectionTo(path[0]))
        }
        this.attackNear()
        return
    }

    if (this.pos.getRangeTo(target) > 1 && healer.fatigue === 0) {
        this.moveMy(target, { range: 1 })
    }

    this.attack(target)
    this.rangedAttack(target)
}

Creep.prototype.retreat = function () {
    const base = new RoomPosition(25, 25, this.memory.base)
    const healer = Game.creeps[this.memory.healer]
    if (healer && this.room.name === healer.room.name && this.pos.getRangeTo(healer) > 1) {
        this.moveMy(healer, { range: 1 })
        this.attackNear()
        return
    }
    if (healer.fatigue > 0) {
        return
    }
    this.moveMy(base, { range: 20, ignoreMap: 2 })
    this.attackNear()
}

Creep.prototype.attackRoom = function (roomName) {
    const healer = Game.creeps[this.memory.healer]
    const status = this.hits / this.hitsMax
    const healerStatus = (healer && !healer.spawning) ? healer.hits / healer.hitsMax : 0

    this.attackNear()

    // check status. action only if status is good
    if (!(status > 0.9 && healerStatus > 0.9)) {
        this.retreat()
        this.say('🏃‍♂️', true)
        return
    }

    // check healer position. action only if healer is near
    if (this.room.name === healer.room.name) {
        if (this.pos.getRangeTo(healer) > 2) {
            this.moveMy(healer, { range: 1 })
        }

        if (this.pos.getRangeTo(healer) > 1) {
            return
        }
    } else if (!isValidCoord(this.pos.x, this.pos.y)) {
        this.moveMy(new RoomPosition(25, 25, this.room.name), { range: 23 })
        return
    }

    // move to target room
    if (this.room.name !== roomName) {
        this.moveToRoom(roomName, 2)
        this.say('⚔️', true)
        return
    }

    //check safeMode
    if (this.room.controller.safeMode > 0) {
        this.retreat()
        return
    }

    // check near creeps
    const nearCreeps = this.pos.findInRange(FIND_HOSTILE_CREEPS, 2).filter(creep => {
        if (creep.pos.getTotalHits() === 0) {
            return true
        }
        return false
    })

    //check defender
    const enemyDefender = this.pos.findInRange(FIND_HOSTILE_CREEPS, 2).find(creep => creep.attackPower > 0)
    if (enemyDefender) {
        this.retreat()
        this.say('🏃‍♂️', true)
        return
    }

    if (nearCreeps.length > 0) {
        const closestCreep = this.pos.findClosestByPath(nearCreeps)

        if (this.attack(closestCreep) === OK) {
            return
        }

        if (this.pos.getRangeTo(closestCreep) > 1 && healer.fatigue === 0) {
            this.moveMy(closestCreep, { range: 1 })
        }
    }

    // attack important structures
    const path = this.getPathToAttackImportantStructures()

    if (path !== ERR_NOT_FOUND && path[0]) {
        this.room.visual.poly(path, { stroke: 'red', strokeWidth: 0.3 })
        const rampartOnPath = path[0].lookFor(LOOK_STRUCTURES).filter(obj => obj.structureType === 'rampart')[0]

        if (rampartOnPath) {
            this.attack(rampartOnPath)
            this.rangedAttack(rampartOnPath)
            return
        }

        const structureOnPath = path[0].lookFor(LOOK_STRUCTURES).filter(obj => OBSTACLE_OBJECT_TYPES.includes(obj.structureType))[0]

        if (structureOnPath) {
            this.attack(structureOnPath)
            this.rangedAttack(structureOnPath)
            return
        }

        if (healer.fatigue === 0) {
            this.move(this.pos.getDirectionTo(path[0]))
        }

        return
    }

    // attack is almost over.
    for (const flag of this.room.find(FIND_FLAGS)) {
        if (flag.name.toLowerCase().includes('attack')) {
            flag.memory.end = true
        }
    }

    // attack anything else
    const hostileCreeps = this.room.find(FIND_HOSTILE_CREEPS)
    const hostileStructures = this.room.find(FIND_HOSTILE_STRUCTURES).filter(structure => {
        if (structure.structureType === 'controller') {
            return false
        }
        if (!structure.store) {
            return true
        }
        if (structure.store.getUsedCapacity() > 10000) {
            return false
        }
        return true
    })
    const hostiles = [...hostileCreeps, ...hostileStructures]
    const hostile = this.pos.findClosestByRange(hostiles)

    if (this.pos.getRangeTo(hostile) > 1) {
        this.moveMy(hostile, { range: 1 })
    }

    this.attack(hostile)
}

Creep.prototype.getPathToAttackImportantStructures = function () {
    if (Game.time % 10 === 0) {
        delete this.heap.pathToAttackImportantStructures
    }

    const cachedPath = this.heap.pathToAttackImportantStructures
    if (cachedPath && cachedPath[0]) {
        if (this.pos.isEqualTo(cachedPath[0])) {
            cachedPath.shift()
            return cachedPath
        }

        if (this.pos.getRangeTo(cachedPath[0]) <= 1) {
            return cachedPath
        }
    }

    const hostileStructures = this.room.find(FIND_HOSTILE_STRUCTURES)
    const importantStructures = hostileStructures.filter(structure => IMPORTANT_STRUCTURE_TYPES.includes(structure.structureType))
    const importantStructuresPacked = importantStructures.map(structure => packCoord(structure.pos.x, structure.pos.y))

    if (importantStructures.length === 0) {
        return ERR_NOT_FOUND
    }

    const power = this.attackPower + this.dismantlePower

    if (power === 0) {
        return
    }

    const roomName = this.room.name

    const costs = new Uint16Array(2500)
    const previous = new Uint16Array(2500)
    const queue = new Set()
    const packedPath = []

    const terrain = new Room.Terrain(roomName)
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                continue
            }
            const packed = packCoord(x, y)
            costs[packed] = INFINITY
            queue.add(packed)
        }
    }

    const creepPos = this.pos
    const creepPosPacked = packCoord(creepPos.x, creepPos.y)
    costs[creepPosPacked] = 0

    while (queue.size > 0) {
        const currentPacked = getMinObject([...queue], packed => costs[packed])
        const parsed = parseCoord(currentPacked)
        const currentPos = new RoomPosition(parsed.x, parsed.y, roomName)
        const currentCost = costs[currentPacked]

        for (const pos of currentPos.getAtRange(1)) {
            if (pos.isWall) {
                continue
            }

            const packed = packCoord(pos.x, pos.y)

            const isSwamp = terrain.get(pos.x, pos.y) === TERRAIN_MASK_SWAMP
            const isRoad = pos.lookFor(LOOK_STRUCTURES).find(structure => structure.structureType === 'road') ? true : false

            const basicCost = isRoad ? 1 : isSwamp ? 5 : 1

            const afterCost = currentCost + basicCost + Math.ceil(pos.getTotalHits() / power)
            const beforeCost = costs[packed]

            if (afterCost < beforeCost) {
                costs[packed] = afterCost
                previous[packed] = currentPacked
                new RoomVisual(roomName).text(afterCost, pos, { font: 0.3 })
            }
        }
        if (importantStructuresPacked.includes(currentPacked)) {
            packedPath.unshift(currentPacked)
            break
        }
        queue.delete(currentPacked)
    }

    if (packedPath.length === 0) {
        return ERR_NOT_FOUND
    }

    while (packedPath[0] !== creepPosPacked) {
        packedPath.unshift(previous[packedPath[0]])
    }

    const path = packedPath.map(packed => {
        const parsed = parseCoord(packed)
        const pos = new RoomPosition(parsed.x, parsed.y, roomName)
        new RoomVisual(roomName).circle(pos)
        return pos
    })

    path.shift()
    return this.heap.pathToAttackImportantStructures = path
}

RoomPosition.prototype.getTotalHits = function () {
    let result = 0

    const structures = this.lookFor(LOOK_STRUCTURES)
    for (const structure of structures) {
        if (structure.structureType === 'road') {
            continue
        }
        result += structure.hits
    }

    return result
}

Creep.prototype.follow = function (target) {
    if (!target) {
        return
    }

    this.say('🏃‍♂️', true)

    if (this.room.name !== target.room.name) {
        this.moveMy(target, { ignoreMap: 2 })
        return
    }

    if (this.pos.getRangeTo(target) <= 1 && !isValidCoord(this.pos.x, this.pos.y)) {
        const nearTarget = target.pos.getAtRange(1).filter(pos => isValidCoord(pos.x, pos.y))
        this.moveMy(this.pos.findClosestByRange(nearTarget))
        return
    }

    if (this.pos.getRangeTo(target) > 1) {
        this.moveMy(target)
        return
    }

    this.moveTo(target)
    return
}

Creep.prototype.care = function (target) {
    this.follow(target)

    const targetToheal = (this.hits / this.hitsMax) >= (target.hits / target.hitsMax) ? target : this
    if (this.pos.getRangeTo(targetToheal) > 1) {
        this.rangedHeal(targetToheal)
    }
    this.heal(targetToheal)
}

Creep.prototype.fleeFrom = function (target) {
    const path = PathFinder.search(this.pos, { pos: target.pos, range: 10 }, { maxRooms: 1, flee: true }).path
    if (!path) {
        return
    }
    this.moveByPath(path)
}