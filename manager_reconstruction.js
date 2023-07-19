Flag.prototype.manageReconstruction = function () {
    const roomName = this.pos.roomName
    const thisRoom = Game.rooms[roomName]
    const closestMyRoom = this.findClosestMyRoom(7)

    if (!thisRoom || !thisRoom.isMy) {
        return this.remove()
    }

    if (!this.memory.stage) {
        this.memory.stage = 1
    }

    switch (this.memory.stage) {
        case 1:
            if (thisRoom.optimizeBasePlan() !== OK) {
                return this.remove()
            }
            return this.memory.stage++
        case 2:
            const lastSpawnId = thisRoom.structures.spawn[0].id
            const storageId = thisRoom.storage.id
            const lastTowerId = thisRoom.structures.tower[0].id
            this.memory.lastSpawnId = lastSpawnId
            this.memory.storageId = storageId
            this.memory.lastTowerId = lastTowerId

            for (const structure of thisRoom.find(FIND_STRUCTURES)) {
                const id = structure.id
                if ([lastSpawnId, storageId, lastTowerId].includes(id)) {
                    continue
                }
                structure.destroy()
            }
            thisRoom.memory.level = 0
            return this.memory.stage++
        case 3:
            if (!this.memory.lastSpawnId && !this.memory.storageId && !this.memory.lastTowerId) {
                return this.memory.stage++
            }
            const defenders = getCreepsByRole(this.room.name, 'colonyDefender')
            if (defenders.length < 2) {
                closestMyRoom.requestColonyDefender(roomName)
            }

            const maxWork = 60
            this.room.buildersGetEnergyFromStorage = true
            const maxLaborer = Math.ceil(maxWork / (thisRoom.laborer.numWorkEach)) + 2
            if (thisRoom.laborer.numWork < maxWork && thisRoom.creeps.laborer.filter(creep => (creep.ticksToLive || 1500) > 3 * creep.body.length).length < maxLaborer) {
                thisRoom.requestLaborer(Math.min((maxWork - thisRoom.laborer.numWork), thisRoom.laborer.numWorkEach))
                this.room.requestRemoteLaborer(closestMyRoom.name, 10)
            }
            if (this.memory.lastSpawnId && thisRoom.structures.spawn.length > 1) {
                Game.getObjectById(this.memory.lastSpawnId).destroy()
                thisRoom.memory.level = 0
                delete this.memory.lastSpawnId
            }
            if (this.memory.lastTowerId && thisRoom.structures.tower.length > 1) {
                Game.getObjectById(this.memory.lastTowerId).destroy()
                thisRoom.memory.level = 0
                delete this.memory.lastTowerId
            }
            if (this.memory.storageId && thisRoom.storage.store[RESOURCE_ENERGY] < 1000) {
                Game.getObjectById(this.memory.storageId).destroy()
                thisRoom.memory.level = 0
                delete this.memory.storageId
            }
            break;
        case 4:
            return this.remove()
    }
}

Room.prototype.requestRemoteLaborer = function (roomName, number = 1) {
    const myRoom = Game.rooms[roomName]
    if (!myRoom) {
        return false
    }

    const creeps = getCreepsByRole(this.name, 'laborer')

    for (const creep of creeps) {
        if (creep.room.name !== this.name) {
            creep.moveToRoom(this.name)
        }
    }

    if (creeps.length < number) {
        let body = []
        for (let i = 0; i < 10; i++) {
            body.push(MOVE, CARRY, WORK)
        }

        const name = `${this.name} laborer ${Game.time}_${myRoom.spawnQueue.length}`

        const memory = {
            role: 'laborer',
            controller: this.controller.id,
            working: false
        }

        const request = new RequestSpawn(body, name, memory, { priority: 5 })
        myRoom.spawnQueue.push(request)
    }

}
