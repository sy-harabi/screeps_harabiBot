/**
 * find closest my room
 * @param {number} level - RCL threshold
 * @returns
 */
Flag.prototype.findClosestMyRoom = function (level = 0) {
    if (this.memory.closestRoom) {
        return Game.rooms[this.memory.closestRoom]
    }
    const closestRoomName = Object.keys(Game.rooms).filter(roomName => roomName !== this.pos.roomName && Game.rooms[roomName].isMy && Game.rooms[roomName].controller.level >= level).sort((a, b) => {
        return Game.map.findRoute(this.pos.roomName, a, {
            routeCallback(roomName, fromRoomName) {
                if (ROOMNAMES_TO_AVOID.includes(roomName)) {
                    return Infinity;
                }
                return 1;
            }
        }).length - Game.map.findRoute(this.pos.roomName, b, {
            routeCallback(roomName, fromRoomName) {
                if (ROOMNAMES_TO_AVOID.includes(roomName)) {
                    return Infinity;
                }
                return 1;
            }
        }).length
    })[0]
    this.memory.closestRoom = closestRoomName
    return Game.rooms[closestRoomName]
}

Flag.prototype.findClosestMyRoomAvoidEnemy = function (level = 0) {
    if (this.memory.closestRoom) {
        return Game.rooms[this.memory.closestRoom]
    }

    const route = function (startRoomName, goalRoomName) {
        return Game.map.findRoute(startRoomName, goalRoomName, {
            routeCallback(roomName, fromRoomName) {
                // inaccessible로 기록된 방은 쓰지말자
                if (Memory.map[roomName] && Memory.map[roomName].inaccessible > Game.time) {
                    return Infinity
                }

                // 막혀있거나, novice zone이거나, respawn zone 이면 쓰지말자
                if (Game.map.getRoomStatus(roomName).status !== 'normal') {
                    return Infinity
                }
                const roomCoord = roomName.match(/[a-zA-Z]+|[0-9]+/g)
                roomCoord[1] = Number(roomCoord[1])
                roomCoord[3] = Number(roomCoord[3])
                const x = roomCoord[1]
                const y = roomCoord[3]
                if (x % 10 === 0 || y % 10 === 0) {
                    return 1
                }
                const isMy = Game.rooms[roomName] && (Game.rooms[roomName].isMy || Game.rooms[roomName].isMyRemote)
                if (isMy) {
                    return 1
                }
                return 2.5;
            }
        })
    }
    const flag = this
    const roomNamesAvailable = Object.keys(Game.rooms).filter(function (roomName) {
        if (roomName === flag.pos.roomName) {
            return false
        }
        const room = Game.rooms[roomName]
        if (!room.isMy) {
            return false
        }
        if (room.controller.level < level) {
            return false
        }
        if (!room.structures.spawn.length) {
            return false
        }
        if (!room.storage) {
            return false
        }
        if (room.energyCapacityAvailable < 1300) {
            return false
        }
        return true
    })

    if (!roomNamesAvailable.length) {
        return undefined
    }

    const closestRoomName = roomNamesAvailable.sort((a, b) => {
        return route(this.pos.roomName, a).length - route(this.pos.roomName, b).length
    })[0]
    this.memory.closestRoom = closestRoomName
    this.memory.distanceToClosestRoom = route(this.pos.roomName, closestRoomName).length
    return Game.rooms[closestRoomName]
}