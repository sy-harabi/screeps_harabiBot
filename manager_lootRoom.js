Flag.prototype.lootRoom = function () {
    const closestMyRoom = this.findClosestMyRoom()
    const targetRoomName = this.pos.roomName
    const targetRoom = Game.rooms[targetRoomName]

    //logistics
    if (targetRoom && targetRoom.memory.depleted) {
        this.remove()
    }

    if (!this.memory.routeLength) {
        const route = Game.map.findRoute(closestMyRoom, targetRoomName, {
            routeCallback(roomName, fromRoomName) {
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
                const isMy = Game.rooms[roomName] && Game.rooms[roomName].isMy
                if (isMy) {
                    return 1
                }
                return 2.5;
            }
        })
        this.memory.routeLength = route.length
    }
    const routeLength = this.memory.routeLength

    const looters = Overlord.getCreepsByRole(targetRoomName, 'looter')

    for (const looter of looters) {
        looter.lootRoom()
    }

    if (looters.length < 10) {
        closestMyRoom.requestLooter(targetRoomName, routeLength)
    }
}

Room.prototype.requestLooter = function (targetRoomName, routeLength) {
    if (!this.hasAvailableSpawn()) {
        return
    }

    let body = []
    for (let i = 0; i < Math.min(Math.floor(this.energyCapacityAvailable / 100), 25); i++) {
        body.push(CARRY, MOVE)
    }

    const name = `${targetRoomName} looter ${Game.time}_${this.spawnQueue.length}`
    const memory = {
        role: 'looter',
        base: this.name,
        targetRoom: targetRoomName,
        routeLength: routeLength
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['looter'] })
    this.spawnQueue.push(request)
}

Creep.prototype.lootRoom = function () {
    if (this.memory.supplying && this.store.getUsedCapacity() === 0) {
        if (this.room.name === this.memory.base && this.ticksToLive < (50 + 100 * (this.memory.routeLength || 1))) {
            this.getRecycled()
            return
        }
        this.memory.supplying = false
    } else if (!this.memory.supplying && ((this.ticksToLive < 50 * (this.memory.routeLength || 1)) || this.store.getFreeCapacity(RESOURCE_ENERGY) === 0)) {
        this.memory.supplying = true
    }

    // 행동
    if (this.memory.supplying) {
        const storage = Game.rooms[this.memory.base].storage
        if (!storage) {
            return
        }

        if (this.room.name !== this.memory.base) {
            this.moveMy({ pos: storage.pos, range: 1 }, { ignoreMap: 1 })
            return
        }

        this.returnAll()
        return
    }


    if (this.room.name !== this.memory.targetRoom) {
        return this.moveToRoom(this.memory.targetRoom, 1)
    }

    const targetRoom = Game.rooms[this.memory.targetRoom]

    const targetCached = Game.getObjectById(this.memory.targetId)

    if (targetCached && targetCached.store && (targetCached.store.getUsedCapacity() || targetCached.store.getUsedCapacity(RESOURCE_ENERGY))) {
        for (const resourceType of Object.keys(targetCached.store)) {
            return this.getCompoundFrom(targetCached, resourceType)
        }
    }

    const remainStructures = targetRoom.find(FIND_STRUCTURES).filter(structure => structure.store && (structure.store.getUsedCapacity() >= 300 || structure.store.getUsedCapacity(RESOURCE_ENERGY) >= 100))
    remainStructures.push(...targetRoom.find(FIND_RUINS).filter(ruin => ruin.store.getUsedCapacity()))
    if (remainStructures.length > 0) {
        const target = this.pos.findClosestByRange(remainStructures) || remainStructures[0]
        this.memory.targetId = target.id
        for (const resourceType of Object.keys(target.store)) {
            return this.getCompoundFrom(target, resourceType)
        }
    } else {
        targetRoom.memory.depleted = true
        return ERR_NOT_FOUND
    }
}