const STRUCTURE_COSTS = {
    "spawn": 1,
    "extension": 2,
    "road": 100,
    "constructedWall": 3,
    "rampart": 4,
    "link": 5,
    "storage": 6,
    "tower": 7,
    "observer": 8,
    "powerSpawn": 9,
    "extractor": 10,
    "lab": 11,
    "terminal": 12,
    "container": 13,
    "nuker": 14,
    "factory": 15
}

Room.prototype.getBasePlanCostMatrix = function () {
    const basePlan = this.basePlan
    if (!basePlan) {
        return undefined
    }
    const costs = new PathFinder.CostMatrix
    for (let i = 1; i <= 8; i++) {
        for (const unpacked of basePlan[`lv${i}`]) {
            const cost = costs.get(unpacked.pos.x, unpacked.pos.y)
            if (unpacked.structureType === 'road') {
                if (cost < 100) {
                    costs.set(unpacked.pos.x, unpacked.pos.y, cost + 100)
                }
                continue
            }
            if (cost < 100) {
                costs.set(unpacked.pos.x, unpacked.pos.y, STRUCTURE_COSTS[unpacked.structureType])
                continue
            } else if (cost === 100) {
                costs.set(unpacked.pos.x, unpacked.pos.y, 100 + STRUCTURE_COSTS[unpacked.structureType])
            }
        }
    }
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            if (costs.get(x, y) > 0) {
                this.visual.text(costs.get(x, y), x, y)
            }
        }
    }
    return costs
}

Flag.prototype.manageReconstruction = function () {
    const roomName = this.pos.roomName
    const thisRoom = Game.rooms[roomName]
    const closestMyRoom = this.findClosestMyRoom(5)

    if (!thisRoom || !thisRoom.isMy) {
        return this.remove()
    }

    if (!this.memory.stage) {
        this.memory.stage = 1
    }

    switch (this.memory.stage) {
        case 1:
            if (!thisRoom.basePlan) {
                return this.remove()
            }
            return this.memory.stage++
        case 2:
            const costs = thisRoom.getBasePlanCostMatrix()
            if (!costs) {
                return 'no basePlan CostMatrix'
            }

            const structureRemain = []
            const structureDestroy = []
            for (const structure of thisRoom.find(FIND_STRUCTURES)) {
                const pos = structure.pos
                const structureType = structure.structureType
                if (structureType === 'road') {
                    if (costs.get(pos.x, pos.y) >= 100) {
                        structureRemain.push(structure)
                    } else {
                        structureDestroy.push(structure)
                    }
                } else {
                    if (costs.get(pos.x, pos.y) % 100 === STRUCTURE_COSTS[structureType]) {
                        structureRemain.push(structure)
                    } else {
                        structureDestroy.push(structure)
                    }
                }
            }

            if (structureRemain.filter(structure => structure.structureType === 'spawn').length === 0) {
                this.memory.lastSpawnId = thisRoom.structures.spawn[0].id
            }

            if (structureRemain.filter(structure => structure.structureType === 'tower').length === 0) {
                this.memory.lastTowerId = thisRoom.structures.tower[0].id
            }

            if (structureRemain.filter(structure => structure.structureType === 'storage').length === 0) {
                this.memory.storageId = thisRoom.storage.id
            }

            const structureIdsToKeep = [this.memory.lastSpawnId, this.memory.lastTowerId, this.memory.storageId]

            for (const structure of structureDestroy) {
                const id = structure.id
                if (structureIdsToKeep.includes(id)) {
                    continue
                }
                structure.destroy()
            }

            for (const cs of thisRoom.constructionSites) {
                cs.remove()
            }
            delete Memory.rooms[this.room.name].colony
            delete Memory.rooms[this.room.name].level
            return this.memory.stage++
        case 3:
            if (!this.memory.lastSpawnId && !this.memory.storageId && !this.memory.lastTowerId) {
                return this.memory.stage++
            }
            const defenders = Overlord.getCreepsByRole(this.room.name, 'colonyDefender')
            if (defenders.length < 2) {
                if (closestMyRoom) {
                    closestMyRoom.requestColonyDefender(roomName)
                }
            }

            const maxWork = 60
            this.room.buildersGetEnergyFromStorage = true
            const maxLaborer = Math.ceil(maxWork / (thisRoom.laborer.numWorkEach)) + 2
            if (thisRoom.laborer.numWork < maxWork && thisRoom.creeps.laborer.filter(creep => (creep.ticksToLive || 1500) > 3 * creep.body.length).length < maxLaborer) {
                thisRoom.requestLaborer(Math.min((maxWork - thisRoom.laborer.numWork), thisRoom.laborer.numWorkEach))
                if (closestMyRoom) {
                    this.room.requestRemoteLaborer(closestMyRoom.name, 10)
                }
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
    if (!this.hasAvailableSpawn()) {
        return
    }

    const myRoom = Game.rooms[roomName]
    if (!myRoom) {
        return false
    }

    const creeps = Overlord.getCreepsByRole(this.name, 'laborer')

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
