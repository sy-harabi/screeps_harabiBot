PowerCreep.prototype.actRoomOperator = function () {
    if (this.ticksToLive < 50) {
        this.getRenew()
        return
    }

    if (!this.room.controller.isPowerEnabled) {
        this.enableMyRoom()
        return
    }

    if (this.store.getFreeCapacity() && this.powers[1].cooldown < 1) {
        this.usePower(PWR_GENERATE_OPS)
    }

    if (this.room.memory.needOperateFactory) {
        this.useOperateFactory()
    }

    if (this.room.energyAvailable < (this.room.energyCapacityAvailable - 900) * 0.8) {
        return this.useOperateExtension()
    }

    const target = this.room.storage || this
    if (this.pos.lookFor(LOOK_STRUCTURES).filter(structure => structure.structureType === STRUCTURE_ROAD).length) {
        const spot = this.pos.getClosestByPath(target.pos.workingSpot)
        if (!spot) {
            return
        }
        this.moveMy(spot)
    }
}

PowerCreep.prototype.searchPath = function (target, range = 0, maxRooms = 1, ignoreCreeps = true) {
    const thisCreep = this
    const result = PathFinder.search(this.pos, { pos: (target.pos || target), range: range }, {
        plainCost: 2,
        swampCost: 10,
        roomCallback: function (roomName) {
            if (Game.rooms[roomName]) {
                const costs = Game.rooms[roomName].basicCostmatrix
                if (!ignoreCreeps && thisCreep.room.name === roomName) {
                    for (const creep of Game.rooms[roomName].find(FIND_CREEPS)) {
                        costs.set(creep.pos.x, creep.pos.y, 255)
                    }
                }
                return costs
            }
            return
        },
        maxRooms: maxRooms
    })
    if (!data.creeps[this.name]) {
        data.creeps[this.name] = {}
    }
    data.creeps[this.name].path = result.path
    data.creeps[this.name].target = target.pos || target
    return result
}

PowerCreep.prototype.moveMy = function (target, range = 0) {
    targetPos = target.pos || target

    if (!data.creeps[this.name]) {
        data.creeps[this.name] = {}
    }

    if (!data.creeps[this.name].path) {
        data.creeps[this.name].path = []
    }

    if (this.pos.getRangeTo(targetPos) <= range) {
        delete data.creeps[this.name].path
        delete data.creeps[this.name].target
        return true
    }

    if (data.creeps[this.name].lastPos && data.creeps[this.name].lastPos.isEqualTo(this.pos)) {
        this.say('🚧', true)
        if (!data.creeps[this.name].stuck) {
            data.creeps[this.name].stuck = 0
        }
        data.creeps[this.name].stuck++
    } else {
        data.creeps[this.name].stuck = 0
    }

    data.creeps[this.name].lastPos = this.pos

    if (data.creeps[this.name].stuck > 4 && Math.random() > 0.5) {
        const maxRooms = this.room.name === targetPos.roomName ? 1 : 16
        this.searchPath(targetPos, range, maxRooms, true)
        const annoyingCreep = data.creeps[this.name].path[0] ? data.creeps[this.name].path[0].lookFor(LOOK_CREEPS)[0] : false
        if (annoyingCreep) {
            this.say('🙏', true)
            this.move(this.pos.getDirectionTo(annoyingCreep))
            annoyingCreep.say('👌', true)
            annoyingCreep.move(annoyingCreep.pos.getDirectionTo(this))
            return
        }
    }

    if (data.creeps[this.name].stuck > 0 && Math.random() > 0.5) {
        const maxRooms = this.room.name === targetPos.roomName ? 1 : 16
        this.searchPath(targetPos, range, maxRooms, false)
    }

    if ((data.creeps[this.name].target && !data.creeps[this.name].target.isEqualTo(targetPos)) || !data.creeps[this.name].path.length) {
        const maxRooms = this.room.name === targetPos.roomName ? 1 : 16
        this.searchPath(targetPos, range, maxRooms)
    }

    if (data.creeps[this.name].path[0] && data.creeps[this.name].path[0].isEqualTo(this.pos)) {
        data.creeps[this.name].path.shift()
        if (data.creeps[this.name].path[0] && isEdgeCoord(data.creeps[this.name].path[0].x, data.creeps[this.name].path[0].y)) {
            data.creeps[this.name].path.shift()
        }
    }
    const nextPos = data.creeps[this.name].path[0]
    this.move(this.pos.getDirectionTo(nextPos))
}

PowerCreep.prototype.getRenew = function () {
    const powerSpawn = this.room.structures.powerSpawn[0]
    if (!powerSpawn) {
        return
    }
    this.say('🔄', true)
    if (this.renew(powerSpawn) === -9) {
        this.moveMy(powerSpawn, 1)
        return
    }
}

PowerCreep.prototype.useOperateExtension = function () {
    if (this.store['ops'] < 2) {
        return -6
    }

    const storage = this.room.storage

    if (!storage) {
        return -7
    }

    if (!Object.keys(this.powers).includes('6')) {
        return
    }

    if (this.powers['6'].cooldown > 0) {
        return
    }

    if (this.pos.getRangeTo(storage) > 3) {
        this.moveMy(storage, 3)
        return -9
    }

    this.usePower(PWR_OPERATE_EXTENSION, storage)
    return this.say('💧', true)
}

PowerCreep.prototype.enableMyRoom = function () {
    if (!this.room.isMy) {
        return
    }

    if (this.pos.getRangeTo(this.room.controller) > 1) {
        this.moveMy(this.room.controller, 1)
    }

    this.enableRoom(this.room.controller)
}

PowerCreep.prototype.useOperateFactory = function () {

    if (!Object.keys(this.powers).includes('19')) {
        return
    }

    const factory = this.room.structures.factory[0]

    if (!factory) {
        return
    }

    if (this.pos.getRangeTo(factory) > 3) {
        this.moveMy(factory, 3)
    }
    this.usePower(PWR_OPERATE_FACTORY, factory)
}

