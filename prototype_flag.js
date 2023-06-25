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
                if (ROOMNAMES_TO_AVOID.includes(roomName)) {
                    return Infinity;
                }
                return 1;
            }
        })
    }

    const closestRoomName = Object.keys(Game.rooms).filter(roomName => roomName !== this.pos.roomName && Game.rooms[roomName].isMy && Game.rooms[roomName].controller.level >= level).sort((a, b) => {
        return route(this.pos.roomName, a).length - route(this.pos.roomName, b).length
    })[0]
    this.memory.closestRoom = closestRoomName
    return Game.rooms[closestRoomName]
}