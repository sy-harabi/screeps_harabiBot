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

Creep.prototype.attackSpawn = function (roomName) {

    const healer = Game.creeps[this.memory.healer]

    if (this.spawning) {
        return
    }

    if (this.room.name !== roomName) {
        if (this.hits / this.hitsMax > 0.9) {
            this.moveToRoom(roomName, 2);
            this.say('⚔️', true)
            return
        }
        this.retreat()
        this.say('🏃‍♂️', true)
        return
    }

    if (this.hits / this.hitsMax < 0.9) {
        this.retreat()
        this.say('🏃‍♂️', true)
        return
    }

    const spawn = this.pos.findClosestByRange(this.room.structures.spawn)

    const hostileCreeps = this.room.find(FIND_HOSTILE_CREEPS)
    const hostileCreep = this.pos.findClosestByRange(hostileCreeps)

    const hostileStructures = this.room.find(FIND_HOSTILE_STRUCTURES)
    const hostileStructure = this.pos.findClosestByRange(hostileStructures)

    const towers = hostileStructures.filter(structure => structure.structureType === 'tower')
    const activeTowers = towers.filter(structure => structure.store[RESOURCE_ENERGY] > 0)
    const activeTower = this.pos.findClosestByRange(activeTowers)
    const tower = this.pos.findClosestByRange(towers)

    const target = hostileCreep || activeTower || tower || spawn || hostileStructure

    if (!target) {
        const controller = this.room.controller
        if (controller && (!controller.sign || controller.sign.username !== this.owner.username)) {
            if (this.signController(controller, "I will come back and take this room") === -9) {
                this.moveMy(controller, { range: 1 })
            }
            return
        }
        else {
            if (this.pos.getRangeTo(controller) > 1) {
                this.moveMy(controller, { range: 1 })
            }
            this.memory.role = 'colonyDefender'
            this.memory.colony = this.room.name
            for (const flag of this.room.find(FIND_FLAGS)) {
                flag.remove()
            }
            return
        }
    }

    if (!spawn && !activeTower) {
        for (const flag of this.room.find(FIND_FLAGS)) {
            if (flag.name.toLowerCase().includes('attack')) {
                flag.memory.end = true
            }
        }
        if (healer.fatigue === 0) {
            this.moveMy(target, { range: 1 })
        }
        this.attack(target)
        this.attackNear()
        return
    }

    if (!spawn) {
        if (healer.fatigue === 0) {
            this.moveMy(activeTower, { range: 1 })
        }
        this.attack(activeTower)
        this.attackNear()
        return
    }

    const path = PathFinder.search(this.pos, { pos: spawn.pos, range: 1 }, {
        plainCost: 2,
        swampCost: 10,
        maxRooms: 1,
        roomCallback: (roomName) => Game.rooms[roomName].costmatrixForBattle
    }).path

    const visualPath = [this.pos, ...path, spawn.pos]
    this.room.visual.poly(visualPath, { strokeWidth: 0.2, stroke: 'magenta', lineStyle: 'dashed' })

    if (path.length) {
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
    } else {
        if (this.attack(spawn) === -9) {
            if (healer.fatigue === 0) {
                this.moveMy(spawn, { range: 1 })
            }
        } else {
            this.rangedAttack(spawn)
        }
    }
}

Creep.prototype.retreat = function () {
    const base = new RoomPosition(25, 25, this.memory.base)
    const healer = Game.creeps[this.memory.healer]
    if (healer && this.room.name === healer.room.name && this.pos.getRangeTo(healer) > 1) {
        this.moveMy(healer, { range: 1 })
        this.attackNear()
        return
    }
    this.moveMy(base, { range: 20 })
    this.attackNear()
}

Creep.prototype.attackRoom = function (roomName) {
    const healer = Game.creeps[this.memory.healer]
    const status = this.hits / this.hitsMax
    const healerStauts = (healer && !healer.spawning) ? healer.hits / healer.hitsMax : 0

    if (!(status > 0.8 && healerStauts > 0.8)) {
        this.retreat()
        this.say('🏃‍♂️', true)
        return
    }
    if (healer && !healer.spawning && this.room.name === healer.room.name && this.pos.getRangeTo(healer) > 1) {
        this.attackNear()
        return
    }
    if (this.room.name = roomName) {
        this.say('⚔️', true)
        this.attackSpawn(roomName)
        return
    } else {
        if (status > 0.9 && healerStauts > 0.9) {
            this.say('⚔️', true)
            this.attackSpawn(roomName)
            return
        }
        this.retreat()
        this.say('🏃‍♂️', true)
        return
    }
}

Creep.prototype.care = function (target) {
    if (!target) {
        return
    }
    if (this.room.name === target.room.name && this.pos.getRangeTo(target) <= 1 && !isValidCoord(this.pos.x, this.pos.y)) {
        const nearTarget = target.pos.getAtRange(1).filter(pos => isValidCoord(pos.x, pos.y))
        this.say('🏃‍♂️', true)
        this.moveTo(this.pos.findClosestByRange(nearTarget))
    } else {
        this.say('🏃‍♂️', true)
        this.moveTo(target)
    }

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