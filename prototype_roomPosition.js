Object.defineProperties(RoomPosition.prototype, {
    available: {
        get() {
            if (this._available) {
                return this._available
            }
            this._available = 9 - Game.rooms[this.roomName].lookForAtArea(LOOK_TERRAIN, this.y - 1, this.x - 1, this.y + 1, this.x + 1, true).filter(position => position.terrain === 'wall').length
            return this._available
        }
    },
    terrain: {
        get() {
            if (!this._terrain) {
                this._terrain = Game.rooms[this.roomName].terrain.get(this.x, this.y)
            }
            return this._terrain
        }
    },
    isWall: {
        get() {
            return this.terrain === 1
        }
    },
    isRampart: {
        get() {
            if (this._isRampart !== undefined) {
                return this._isRampart
            }
            return this._isRampart = this.lookFor(LOOK_STRUCTURES).filter(structure => structure.structureType === 'rampart').length > 0
        }
    },
    workable: {
        get() {
            if (!this._workable) {
                this._workable = true
                for (const lookObject of this.look()) {
                    if (lookObject.type === LOOK_TERRAIN && lookObject[LOOK_TERRAIN] === 'wall') {
                        this._workable = false
                        break
                    }
                    if (!isValidCoord(this.x, this.y)) {
                        this._workable = false
                        break
                    }
                    if (lookObject.type === LOOK_STRUCTURES && OBSTACLE_OBJECT_TYPES.includes(lookObject[LOOK_STRUCTURES].structureType)) {
                        this._workable = false
                        break
                    }
                    if (lookObject.type === LOOK_STRUCTURES && lookObject[LOOK_STRUCTURES].structureType === STRUCTURE_ROAD) {
                        this._workable = false
                        break
                    }
                    if (lookObject.type === LOOK_CONSTRUCTION_SITES) {
                        this._workable = false
                        break
                    }
                }
            }
            return this._workable
        }
    },
    walkable: {
        get() {
            if (!isValidCoord(this.x, this.y)) {
                return false
            }
            this._walkable = true
            for (const lookObject of this.look()) {
                if (lookObject.type === LOOK_TERRAIN && lookObject[LOOK_TERRAIN] === 'wall') {
                    this._walkable = false
                    break
                }
                if (lookObject.type === LOOK_STRUCTURES && OBSTACLE_OBJECT_TYPES.includes(lookObject[LOOK_STRUCTURES].structureType)) {
                    this._walkable = false
                    break
                }
                if (lookObject.type === LOOK_CONSTRUCTION_SITES) {
                    this._walkable = false
                    break
                }
            }
            return this._walkable
        }
    },
    constructible: {
        get() {
            if (this.lookFor(LOOK_TERRAIN)[0] === 'wall') {
                return false
            }
            if (this.x < 2 || this.x > 47 || this.y < 2 || this.y > 47) {
                return false
            }
            if (this.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) {
                return false
            }
            for (const structure of this.lookFor(LOOK_STRUCTURES)) {
                if (structure.structureType !== STRUCTURE_RAMPART) {
                    return false
                }
            }
            return true
        }
    },
    crossConstructible: {
        get() {
            const cross = this.getCross()
            if (cross.length < 5) {
                return false
            }
            for (const pos of cross) {
                if (!pos.constructible) {
                    return false
                }
            }
            return true
        }
    },
    closestMyRoom: {
        get() {
            if (!Memory.rooms[this.roomName].closestMyRoom) {
                const closestMyRoom = Game.rooms.filter(room => room.isMy).sort((a, b) => (Game.map.findRoute(this.name, a.name) - Game.map.findRoute(this.name, b.name)))[0]
                Memory.rooms[this.roomName].closestMyRoom = closestMyRoom.name
            }
            return Game.rooms[Memory.rooms[this.roomName].closestMyRoom]
        }
    }
})

RoomPosition.prototype.lookForConstructible = function (vectorArray) {
    for (const vector of vectorArray) {
        if (!isValidCoord(this.x + vector.x, this.y + vector.y)) {
            return false
        }
        const pos = new RoomPosition(this.x + vector.x, this.y + vector.y, this.roomName)
        if (!pos.constructible) {
            return false
        }
    }
    return true
}

RoomPosition.prototype.pack = function () {
    return this.y * 50 + this.x
}

Room.prototype.parsePos = function (packed) {
    const y = packed % 50
    const x = (packeed - y) / 50
    return new RoomPosition(x, y, this.name)
}

RoomPosition.prototype.isEqualTo = function (target) {
    const pos = target.pos || target
    return this.x === pos.x && this.y === pos.y && this.roomName === pos.roomName
}

RoomPosition.prototype.getAtRange = function (range) {
    const result = []
    for (let i = -range; i <= range; i++) {
        if (isValidCoord(this.x + i, this.y + range)) {
            result.push(new RoomPosition(this.x + i, this.y + range, this.roomName))
        }
        if (isValidCoord(this.x + i, this.y - range)) {
            result.push(new RoomPosition(this.x + i, this.y - range, this.roomName))
        }
    }
    for (let i = -range + 1; i < range; i++) {
        if (isValidCoord(this.x + range, this.y + i)) {
            result.push(new RoomPosition(this.x + range, this.y + i, this.roomName))
        }
        if (isValidCoord(this.x - range, this.y + i)) {
            result.push(new RoomPosition(this.x - range, this.y + i, this.roomName))
        }
    }
    return result
}

RoomPosition.prototype.getInRange = function (range) {
    const result = [this]
    for (let i = 1; i <= range; i++) {
        result.push(...this.getAtRange(i))
    }
    return result
}

RoomPosition.prototype.getAverageRange = function (array) {
    if (!array.length) {
        return false
    }
    let result = 0;
    for (const object of array) {
        result += this.getRangeTo((object.pos || object))
    }
    return result / (array.length)
}

RoomPosition.prototype.getClosestPathLength = function (array) {
    const goals = array.map(obj => obj.pos || obj)
    return PathFinder.search(this, goals).path.length
}

RoomPosition.prototype.getClosestRange = function (array) {
    let result = Infinity
    for (const obj of array) {
        const newResult = this.getRangeTo(obj)
        if (newResult < result) {
            result = newResult
        }
    }
    return result
}