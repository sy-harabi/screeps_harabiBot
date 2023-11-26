const IMPORTANT_STRUCTURE_TYPES = ['spawn', 'tower']
const VISUALIZE = false

Creep.prototype.attackRoom = function (roomName) {
    const healer = Game.creeps[this.memory.healer]
    const status = this.hits / this.hitsMax
    const healerStatus = (healer && !healer.spawning) ? healer.hits / healer.hitsMax : 0

    //this.attackNear()

    // check status. action only if status is good
    if (!(status > 0.9 && healerStatus > 0.9)) {
        this.retreat()
        healer.follow(this)
        this.say('🏃‍♂️', true)
        return
    }

    // check healer position. action only if healer is near
    if (this.room.name === healer.room.name) {
        const range = this.pos.getRangeTo(healer)
        if (range > 2) {
            this.moveMy({ pos: healer.pos, range: 1 })
            healer.moveMy({ pos: this.pos, range: 1 })
            return
        }

        if (range > 1) {
            this.moveMy({ pos: healer.pos, range: 1 })
            return
        }
    } else {
        this.moveMy(healer)
    }

    // move to target room
    if (this.room.name !== roomName) {
        if (this.fatigue === 0) {
            healer.moveToRoom(roomName, 2)
        }
        this.follow(healer)
        return
    }

    if (!isValidCoord(this.pos.x, this.pos.y)) {
        const nextPos = healer.pos.getAtRange(1).find(pos => this.pos.isNearTo(pos) && isValidCoord(pos.x, pos.y))
        this.moveMy(nextPos)
        return
    }

    healer.follow(this)

    //check safeMode
    if (this.room.controller.safeMode > 0) {
        this.retreat()
        healer.follow(this)
        this.say('🏃‍♂️', true)
        return
    }

    // attack important structures
    const path = this.getPathToAttackImportantStructures()

    if (path === ERR_NOT_FOUND) {
        this.retreat()
        healer.follow(this)
        this.say('🏃‍♂️', true)
        return
    }

    if (path[0]) {
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
            this.setNextPos(path[0])
        }

        return
    }

    // attack is almost over.
    for (const flag of this.room.find(FIND_FLAGS)) {
        if (flag.name.toLowerCase().includes('attack') && !flag.memory.end) {
            flag.memory.end = true
            data.recordLog(`ATTACK: Mission complted.`, roomName, 0)
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
        this.moveMy({ pos: hostile.pos, range: 1 })
    }

    this.attack(hostile)
}

Creep.prototype.getPathToAttackImportantStructures = function () {
    if (this._pathToAttackImportantStructures) {
        return this._pathToAttackImportantStructures
    }

    const hostileStructures = this.room.find(FIND_HOSTILE_STRUCTURES)
    const importantStructureTypes = this.room.controller && this.room.controller.level < 8
        ? ['spawn']
        : IMPORTANT_STRUCTURE_TYPES
    const importantStructures = hostileStructures.filter(structure => importantStructureTypes.includes(structure.structureType))

    const goals = importantStructures.map(structure => {
        return { pos: structure.pos, range: 0 }
    })

    const power = this.attackPower + this.dismantlePower

    if (power === 0) {
        return
    }

    const costArray = this.room.getCostArrayForBulldoze(power)

    const damageArray = this.room.getDamageArray()

    for (let i = 0; i < damageArray.length; i++) {
        const netHeal = this.totalHealPower - this.getNetDamage(damageArray[i])
        if (netHeal < 0) {
            costArray[i] = 0
        }
    }

    const dijkstra = this.room.dijkstra(this.pos, goals, costArray)
    return this._pathToAttackImportantStructures = dijkstra
}

/**
 * 
 * @returns Uint32Array with packed coord as keys and costs as values. 0 means cannot be passed
 */
Room.prototype.getCostArrayForBulldoze = function (attackPower) {
    const result = new Uint32Array(2500)
    const terrain = new Room.Terrain(this.name)

    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {

            const packed = packCoord(x, y)
            const pos = new RoomPosition(x, y, this.name)
            const structures = pos.lookFor(LOOK_STRUCTURES)

            const road = structures.find(structure => structure.structureType === 'road')
            if (road) {
                result[packed] = 1
            } else if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                continue
            } else if (terrain.get(x, y) === TERRAIN_MASK_SWAMP) {
                result[packed] = 5
            } else {
                result[packed] = 1
            }

            if (!isValidCoord(x, y)) {
                result[packed] = 100
                continue
            }

            result[packed] += Math.ceil(pos.getTotalHits() / attackPower)
        }
    }

    return result
}

Room.prototype.getDamageArray = function () {
    if (this._damageArray) {
        return this._damageArray
    }
    const costArray = new Uint16Array(2500)
    const roomName = this.name
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            const pos = new RoomPosition(x, y, roomName)
            if (pos.isWall) {
                continue
            }
            const packed = packCoord(x, y)
            costArray[packed] = pos.getTowerDamageAt()
        }
    }

    const hostileCreeps = this.find(FIND_HOSTILE_CREEPS)
    for (const creep of hostileCreeps) {
        if (creep.attackPower > 0) {
            for (const pos of creep.pos.getInRange(2)) {
                const packed = packCoord(pos.x, pos.y)
                costArray[packed] += creep.attackPower
            }
        }
        if (creep.rangedAttackPower > 0) {
            for (const pos of creep.pos.getAtRange(3)) {
                const packed = packCoord(pos.x, pos.y)
                costArray[packed] += creep.rangedAttackPower
            }
            for (const pos of creep.pos.getAtRange(4)) {
                const packed = packCoord(pos.x, pos.y)
                costArray[packed] += creep.rangedAttackPower
            }
        }
    }
    return this._damageArray = costArray
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

Creep.prototype.harasserRangedAttack = function () {

    let rangedMassAttackTotalDamage = 0

    const positions = this.pos.getInRange(3)
    const rangedAttackPower = this.rangedAttackPower

    let rangedAttackTarget = undefined

    for (const pos of positions) {
        const priorityTarget = pos.lookFor(LOOK_CREEPS).find(creep => !creep.my)

        if (!priorityTarget) {
            continue
        }

        if (rangedAttackTarget === undefined || priorityTarget.hits < rangedAttackTarget.hits) {
            rangedAttackTarget = priorityTarget
        }

        if (priorityTarget.my === false) {
            const range = this.pos.getRangeTo(pos)

            if (range <= 1) {
                this.rangedMassAttack()
                return
            }

            const rangeConstant = range <= 1 ? 1 : range <= 2 ? 0.4 : 0.1
            const damage = rangedAttackPower * rangeConstant

            rangedMassAttackTotalDamage += damage
            continue
        }
    }

    if (rangedMassAttackTotalDamage >= rangedAttackPower) {
        this.rangedMassAttack()
        return
    }

    if (rangedAttackTarget) {
        this.rangedAttack(rangedAttackTarget)
    }
}

Creep.prototype.retreat = function () {
    const base = new RoomPosition(25, 25, this.memory.base)
    const healer = Game.creeps[this.memory.healer]
    if (healer && this.room.name === healer.room.name && this.pos.getRangeTo(healer) > 1) {
        this.moveMy({ pos: healer.pos, range: 1 })
        this.attackNear()
        return
    }
    if (healer.fatigue > 0) {
        return
    }
    this.moveMy({ pos: base, range: 20 }, { ignoreMap: 2 })
    this.attackNear()
}

Creep.prototype.follow = function (target) {
    if (!target) {
        return
    }

    if (this.room.name !== target.room.name) {
        this.moveMy({ pos: target.pos, range: 0 }, { ignoreMap: 2 })
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
    if (!target) {
        this.heal(this)
        return
    }

    if (this.room.name !== target.room.name) {
        this.heal(this)
        return
    }

    const targetToheal = (this.hits / this.hitsMax) >= (target.hits / target.hitsMax) ? target : this

    const range = this.pos.getRangeTo(targetToheal)

    if (range > 3) {
        this.heal(this)
        return
    }

    if (range > 1) {
        this.rangedHeal(targetToheal)
        return
    }

    if (this.heal(targetToheal) !== OK) {
        this.heal(this)
    }
}

Creep.prototype.fleeFrom = function (target, range = 10) {
    const room = this.room
    const thisCreep = this
    const mobility = this.getMobility()
    const map = Overlord.map
    const search = PathFinder.search(this.pos, { pos: target.pos, range }, {
        plainCost: Math.max(1, Math.ceil(2 * mobility)),
        swampCost: Math.max(1, Math.ceil(10 * mobility)),
        maxRooms: 2,
        flee: true,
        roomCallback: function (roomName) {
            if (map[roomName] && map[roomName].numTower) {
                return false
            }
            const costs = room.basicCostmatrix.clone()
            for (const creep of room.find(FIND_HOSTILE_CREEPS)) {
                if (thisCreep.pos.getRangeTo(creep.pos) <= 3) {
                    for (const pos of creep.pos.getInRange(2)) {
                        if (!pos.isWall) {
                            costs.set(pos.x, pos.y, 254)
                        }
                    }
                }
            }

            return costs
        }
    })
    const path = search.path
    if (!path) {
        return
    }
    visualizePath(path)
    const nextPos = path[0]

    if (nextPos) {
        this.setNextPos(nextPos)
    }
}

Creep.prototype.activeHeal = function () {
    const myCreepsInRange = this.pos.findInRange(FIND_MY_CREEPS, 1)
    const weakest = getMinObject(myCreepsInRange, creep => creep.hits / creep.hitsMax)
    this.heal(weakest)
}