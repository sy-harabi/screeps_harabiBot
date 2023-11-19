Flag.prototype.lootRoom = function () {
    const closestMyRoom = this.findClosestMyRoom()
    const targetRoomName = this.pos.roomName
    const targetRoom = Game.rooms[targetRoomName]

    if (targetRoom && targetRoom.memory.depleted) {
        this.remove()
    }
    //logistics

    if (!this.memory.state) {
        this.memory.state = 'init'
    }

    if (this.memory.state === 'init' && this.memory.findRouteLength && targetRoom) {
        this.memory.state = 'loot'
    }

    if (this.memory.state === 'loot' && (!data.enoughCPU || !closestMyRoom.storage || closestMyRoom.storage.store.getUsedCapacity() >= 800000)) {
        this.memory.state = 'standBy'
    }

    if (this.memory.state === 'standBy' && data.enoughCPU && closestMyRoom.storage && closestMyRoom.storage.store.getUsedCapacity() < 600000) {
        this.memory.state = 'loot'
    }

    if (targetRoom && targetRoom.memory.depleted) {
        this.remove()
    }

    //check state

    const state = this.memory.state

    // init

    const scouterName = `${targetRoomName} scouter`
    const scouter = Game.creeps[scouterName]

    if (state === 'init') {
        if (!this.memory.findRouteLength) {
            const route = Game.map.findRoute(closestMyRoom, targetRoomName, {
                routeCallback(roomName, fromRoomName) {
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
            this.memory.findRouteLength = route.length
        }
        if (!scouter) {
            return closestMyRoom.spawnScouter(targetRoomName, scouterName)
        }
        return scouter.moveMy({ pos: new RoomPosition(25, 25, targetRoomName), range: 20 })
    }

    // prepare

    const findRouteLength = this.memory.findRouteLength

    const looterNames = [
        `${targetRoomName} looter1`,
        `${targetRoomName} looter2`,
        `${targetRoomName} looter3`,
    ]

    // loot

    if (state === 'loot') {
        if (!scouter) {
            closestMyRoom.spawnScouter(targetRoomName, scouterName)
        } else {
            scouter.moveToRoom(targetRoomName, 1)
        }

        for (const name of looterNames) {
            const creep = Game.creeps[name]
            if (!creep) {
                closestMyRoom.spawnLooter(targetRoomName, name, findRouteLength)
                continue
            }
            creep.lootRoom()
        }
        return
    }

    // standBy

    if (state === 'standBy') {
        for (const name of looterNames) {
            const creep = Game.creeps[name]
            if (!creep) {
                continue
            }
            creep.lootRoom()
        }
        return
    }

}

Room.prototype.spawnLooter = function (targetRoomName, name, findRouteLength) {
    const spawn = this.structures.spawn.find(s => !s.spawning)
    if (!spawn) {
        return false
    }
    let body = []
    for (let i = 0; i < 25; i++) {
        body.push(CARRY, MOVE)
    }
    spawn.spawnCreep(body, name, {
        memory: {
            role: 'looter',
            base: this.name,
            targetRoom: targetRoomName,
            findRouteLength: findRouteLength
        }
    })
}

Room.prototype.spawnScouter = function (targetRoomName, name, findRouteLength) {
    const spawn = this.structures.spawn.find(s => !s.spawning)
    if (!spawn) {
        return false
    }
    let body = [MOVE]
    spawn.spawnCreep(body, name, {
        memory: {
            role: 'scouter',
            base: this.name,
            targetRoom: targetRoomName,
        }
    })
}

Creep.prototype.lootRoom = function () {
    if (this.memory.supplying && this.store.getUsedCapacity() === 0) {
        if (this.room.name === this.memory.base && this.ticksToLive < 100 * (this.memory.findRouteLength || 1)) {
            return this.getRecycled()
        }
        this.memory.supplying = false
    } else if (!this.memory.supplying && ((this.ticksToLive < 50 * (this.memory.findRouteLength || 1)) || this.store.getFreeCapacity(RESOURCE_ENERGY) === 0)) {
        this.memory.supplying = true
    }

    // 행동
    if (this.memory.supplying) {
        const storage = Game.rooms[this.memory.base].storage
        if (!storage) {
            return ERR_NOT_FOUND
        }

        if (this.room.name !== this.memory.base) {
            return this.moveMy({ pos: storage.pos, range: 1 }, { ignoreMap: 1 })
        }

        return this.returnAll()
    }

    const targetRoom = Game.rooms[this.memory.targetRoom]

    if (!targetRoom) {
        return this.moveToRoom(this.memory.targetRoom, 1)
    }

    const remainStructures = targetRoom.find(FIND_STRUCTURES).filter(structure => !structure.my && structure.store && (structure.store.getUsedCapacity() >= 300 || structure.store.getUsedCapacity(RESOURCE_ENERGY) >= 300))
    remainStructures.push(...targetRoom.find(FIND_RUINS).filter(ruin => ruin.store.getUsedCapacity()))
    if (remainStructures.length) {
        const target = this.pos.findClosestByRange(remainStructures) || remainStructures[0]
        for (const resourceType of Object.keys(target.store)) {
            if (this.room.name !== this.memory.targetRoom || this.pos.getRangeTo(target) > 1) {
                return this.moveMy({ pos: target.pos, range: 1 }, { ignoreMap: 1 })
            }
            return this.getCompoundFrom(target, resourceType)
        }
    } else {
        targetRoom.memory.depleted = true
        return ERR_NOT_FOUND
    }
}