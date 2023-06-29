Object.defineProperties(Creep.prototype, {
    assignedRoom: {
        get() {
            const splitedName = this.name.split(' ')
            return splitedName[0]
        }
    }
})

Creep.prototype.getMobility = function () {
    let burden = 0
    let move = 0
    let usedCapacity = this.store.getUsedCapacity()
    for (const part of this.body) {
        if (part.type === MOVE) {
            move += (part.boost === 'XZHO2' ? 8 : part.boost === 'ZHO2' ? 6 : part.boost === 'ZO' ? 4 : 2)
            continue
        }
        if (part.type === CARRY) {
            if (usedCapacity > 0) {
                burden += 1
                usedCapacity -= 50
                continue
            }
            continue
        }
        burden += 1
        continue
    }
    return burden / move
}

Creep.prototype.moveToRoom = function (goalRoomName) {
    const target = new RoomPosition(25, 25, goalRoomName)
    this.moveMy(target, { range: 20 })
}

Creep.prototype.travelTo = function (goalRoomName) {

}

Creep.prototype.getEnergyFrom = function (id) {
    const target = Game.getObjectById(id)
    if (target) {
        if (this.withdraw(target, RESOURCE_ENERGY) === -9 || this.pickup(target) === -9) {
            this.moveMy(target, { range: 1 })
        }
    }
}

Creep.prototype.searchPath = function (target, range = 0, maxRooms = 1, option = { ignoreCreeps: true, avoidPortal: false, flee: false }) {
    const { ignoreCreeps, avoidPortal, flee } = option
    const thisCreep = this
    const mobility = this.getMobility()
    const targetPos = target.pos || target
    let route = false
    if (maxRooms > 1) {
        route = Game.map.findRoute(this.room, targetPos.roomName, {
            routeCallback(roomName, fromRoomName) {
                if (ROOMNAMES_TO_AVOID.includes(roomName)) {
                    return Infinity;
                }
                const roomCoord = roomName.match(/[a-zA-Z]+|[0-9]+/g)
                roomCoord[1] = Number(roomCoord[1])
                roomCoord[3] = Number(roomCoord[3])
                const x = roomCoord[1]
                const y = roomCoord[3]
                if (x % 10 === 0 || y % 10 === 0) {
                    return 1
                }
                const isMy = Game.rooms[roomName] && Game.rooms[roomName].isMy
                if (isMy) {
                    return 1
                }
                return 2.5;
            }
        })
        if (route === ERR_NO_PATH) {
            route = []
        }
        route = route.map(routeValue => routeValue.room)
        route.push(thisCreep.room.name)
    }
    const result = PathFinder.search(this.pos, { pos: targetPos, range: range }, {
        plainCost: Math.ceil(2 * mobility),
        swampCost: Math.ceil(10 * mobility),
        flee: flee,
        roomCallback: function (roomName) {
            if (route && !route.includes(roomName)) {
                return false
            }
            if (Game.rooms[roomName]) {
                const costs = Game.rooms[roomName].basicCostmatrix
                if (!ignoreCreeps && thisCreep.room.name === roomName) {
                    for (const creep of Game.rooms[roomName].find(FIND_CREEPS)) {
                        costs.set(creep.pos.x, creep.pos.y, 255)
                    }
                    for (const powerCreep of Game.rooms[roomName].find(FIND_POWER_CREEPS)) {
                        costs.set(powerCreep.pos.x, powerCreep.pos.y, 255)
                    }
                }
                return costs
            }
            return true
        },
        maxRooms: maxRooms,
        maxOps: maxRooms > 1 ? (500 * route.length) : 500
    })
    if (result.incomplete) {
        return ERR_NO_PATH
    }
    for (let i = 0; i < result.path.length - 1; i++) {
        const posNow = result.path[i]
        const posNext = result.path[i + 1]
        if (posNow.roomName === posNext.roomName) {
            new RoomVisual(posNow.roomName).line(posNow, posNext, {
                color: 'aqua', width: .15,
                opacity: .2, lineStyle: 'dashed'
            })
        }
    }
    this.heap.path = result.path
    this.heap.target = targetPos
    this.heap.lastPos = undefined

    return result
}

Creep.prototype.searchBattlePath = function (target, range = 1, maxRooms = 16) {
    const result = PathFinder.search(this.pos, { pos: (target.pos || target), range: range }, {
        plainCost: 2,
        swampCost: 10,
        roomCallback: function (roomName) {
            if (roomName === (target.roomName || target.room.name))
                return Game.rooms[roomName].costmatrixForBattle
        },
        maxRooms: maxRooms
    })
    this.memory.path = result.path
    return result
}

Creep.prototype.moveMy = function (target, option = { range: 0, avoidPortal: false, flee: false }) {
    const { range, avoidPortal, flee } = option
    const targetPos = target.pos || target
    if (this.pos.roomName === targetPos.roomName) {
        this.room.visual.line(this.pos, targetPos, { color: 'yellow', lineStyle: 'dashed' })
    }
    if (this.spawning) {
        return
    }

    if (this.fatigue) {
        return
    }

    if (this.pos.roomName === targetPos.roomName && this.pos.getRangeTo(targetPos) <= range) {
        delete this.heap.path
        delete this.heap.target
        delete this.heap.stuck
        return true
    }

    const maxRooms = this.room.name === targetPos.roomName ? 1 : 16
    if ((this.heap.target && !targetPos.isEqualTo(this.heap.target)) || !this.heap.path || !this.heap.path.length) {
        if (this.searchPath(targetPos, range, maxRooms, { ignoreCreeps: true, avoidPortal: avoidPortal, flee: flee }) === ERR_NO_PATH) {
            delete this.heap.path
            delete this.heap.target
            delete this.heap.stuck
            return
        }
    }

    if (this.heap.lastPos && this.pos.isEqualTo(this.heap.lastPos)) {
        this.say('🚧')
        this.heap.stuck = this.heap.stuck || 0
        this.heap.stuck++
    } else {
        this.heap.stuck = 0
    }

    this.heap.lastPos = this.pos

    if (this.heap.stuck > 1) {
        if (this.pos.roomName !== this.heap.path[0].roomName) {

        } else if (Math.random() < 0.9 && this.heap.path.length < 5) {
            const maxRooms = this.room.name === targetPos.roomName ? 1 : 16
            this.searchPath(targetPos, range, maxRooms, { ignoreCreeps: false, avoidPortal: avoidPortal, flee: flee })
        } else {
            const annoyingCreep = this.heap.path[0] ? this.heap.path[0].lookFor(LOOK_CREEPS)[0] : false
            if (annoyingCreep) {
                this.say('🙏')
                this.move(this.pos.getDirectionTo(annoyingCreep))
                annoyingCreep.say('👌')
                annoyingCreep.move(annoyingCreep.pos.getDirectionTo(this))
                return
            }
            const annoyingPowerCreep = this.heap.path[0] ? this.heap.path[0].lookFor(LOOK_POWER_CREEPS)[0] : false
            if (annoyingPowerCreep) {
                this.say('🙏')
                this.move(this.pos.getDirectionTo(annoyingPowerCreep))
                annoyingPowerCreep.say('👌')
                annoyingPowerCreep.move(annoyingPowerCreep.pos.getDirectionTo(this))
                return
            }
        }
    }

    if (this.pos.isEqualTo(this.heap.path[0])) {
        this.heap.path.shift()
    }

    const nextPos = this.heap.path[0]
    this.move(this.pos.getDirectionTo(nextPos))

    if (!isValidCoord(nextPos.x, nextPos.y)) {
        this.heap.path.shift()
    }
}

Creep.prototype.getRecycled = function () {
    const closestSpawn = this.pos.findClosestByRange(this.room.structures.spawn.filter(s => !s.spawning))
    if (!closestSpawn) {
        const anySpawn = this.room.structures.spawn[0]
        if (!this.pos.isNearTo(anySpawn)) {
            this.moveMy(anySpawn, { range: 1 })
        }
        return false
    }
    if (closestSpawn.recycleCreep(this) === -9) {
        this.moveMy(closestSpawn, { range: 1 })
    }
}

Creep.prototype.getNumParts = function (partsName) {
    return this.body.filter(part => part.type === partsName).length
}