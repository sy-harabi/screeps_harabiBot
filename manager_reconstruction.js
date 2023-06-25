Flag.prototype.manageReconstruction = function () {
    const roomName = this.pos.roomName
    const thisRoom = Game.rooms[roomName]

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

            const maxWork = 60
            const maxLaborer = Math.ceil(maxWork / (thisRoom.laborer.numWorkEach)) + 2
            if (thisRoom.laborer.numWork < maxWork && thisRoom.creeps.laborer.filter(creep => (creep.ticksToLive || 1500) > 3 * creep.body.length).length < maxLaborer) {
                thisRoom.spawnLaborer(Math.min((maxWork - thisRoom.laborer.numWork), thisRoom.laborer.numWorkEach))
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
