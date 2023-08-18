Room.prototype.manageWork = function () {
    // 위협이 있으면 일단 막자
    if (this.memory.militaryThreat) {
        return this.manageReinforce()
    }

    // downgrade가 너무 임박한 상태면 일단 upgrade부터
    if (!this.heap.upgradeFirst && this.controller.ticksToDowngrade < 1000) {
        this.heap.upgradeFirst = true
    } else if (this.heap.upgradeFirst && this.controller.ticksToDowngrade > 5000) {
        this.heap.upgradeFirst = false
    }

    // 건설할 곳이 있고 downgrade가 급하지 않으면 build부터
    if (this.constructionSites.length && !this.heap.upgradeFirst) {
        this.heap.constructing = true
        return this.manageBuild()
    } else {
        this.heap.constructing = false
    }

    // 아니면 upgrade부터
    return this.manageUpgrade()
}

Room.prototype.manageReinforce = function () {
    const REPAIR_RANGE = 4
    const costs = this.defenseCostMatrix
    const spawn = this.structures.spawn[0]
    const rampartAnchorsStatus = this.getRampartAnchorsStatus()
    for (const laborer of this.creeps.laborer) {
        // 위험한 곳에 있으면 즉시 탈출해라
        if (costs.get(laborer.pos.x, laborer.pos.y) >= 254 && spawn) {
            laborer.moveMy(spawn, { range: 1, avoidRampart: false })
        }
        const status = rampartAnchorsStatus[laborer.memory.assign]
        if (!status) {
            continue
        }
        const target = status.closestIntruder
        if (!target) {
            continue
        }

        laborer.needDelivery = true
        if (!laborer.working) {
            //storage가 가까우면 storage에서 energy 받자
            if (this.storage) {
                laborer.getEnergyFrom(this.storage.id)
                continue
            }
        }

        // 한번 repair 시작하면 10 tick 동안은 그거 수리하자
        const rampartBefore = Game.getObjectById(laborer.memory.rampartLowestId)
        if (rampartBefore && laborer.memory.rampartLowestTime && (Game.time - laborer.memory.rampartLowestTime) < 10) {
            laborer.repairMy(rampartBefore)
            continue
        }


        let rampartsInRange = this.structures.rampart.filter(rampart => rampart.pos.getRangeTo(target) <= REPAIR_RANGE)
        if (rampartsInRange.length === 0) {
            rampartsInRange = this.structures.rampart.filter(rampart => rampart.pos.getRangeTo(status.pos) <= REPAIR_RANGE)
        }
        const rampartLowest = rampartsInRange.sort((a, b) => a.hits - b.hits)[0]
        if (!rampartLowest) {
            continue
        }
        laborer.memory.rampartLowestId = rampartLowest.id
        laborer.memory.rampartLowestTime = Game.time
        laborer.repairMy(rampartLowest)
    }
}

Room.prototype.manageBuild = function () {
    // laborer 찾기
    let laborers = Overlord.getCreepsByRole(this.name, 'laborer')

    // construction site 목록 작성
    let tasks = this.constructionSites
    if (tasks.length && laborers.length) {
        // 업무 배치 시작
        const tasksByPriority = new Array(10)
        for (let i = 0; i < tasksByPriority.length; i++) {
            tasksByPriority[i] = []
        }
        for (const task of tasks) {
            tasksByPriority[BUILD_PRIORITY[task.structureType]].push(task)
        }
        const priorityTasks = tasksByPriority.find(tasks => tasks.length > 0)
        for (const laborer of laborers) {
            if (laborer.room.name !== this.name) {
                continue
            }
            if (laborer.memory.task !== undefined) {
                continue
            }
            laborer.memory.task = laborer.pos.findClosestByRange(priorityTasks).id
        }
    }

    for (const laborer of laborers) {
        //storage가 가까우면 storage에서 energy 받자
        const workPlace = Game.getObjectById(laborer.memory.task)
        if (this.storage && (this.storage.pos.getRangeTo(workPlace) <= 5 || this.buildersGetEnergyFromStorage)) {
            laborer.needDelivery = false
        } else {
            // 그게 아니면 배달받자
            laborer.needDelivery = true
        }
        // energy 없으면 energy 받아라
        if (!laborer.working) {
            if (!laborer.needDelivery) {
                laborer.getEnergyFrom(this.storage.id)
                continue
            }
        }
        // energy 있으면 일해라
        laborer.buildTask()
    }

}

Room.prototype.manageUpgrade = function () {
    // laborer 동작 및 이용가능한 laborer 찾기
    let laborers = this.creeps.laborer
    let controllerLink = undefined
    if (this.controller.link && this.controller.link.RCLActionable) {
        controllerLink = this.controller.link
    }
    const container = this.controller.container

    const tombstones = this.controller.pos.findInRange(FIND_TOMBSTONES, 3).filter(tombstone => tombstone.store[RESOURCE_ENERGY] > 0)
    const droppedEnergies = this.controller.pos.findInRange(FIND_DROPPED_RESOURCES, 3).filter(droppedResource => droppedResource.resourceType === RESOURCE_ENERGY)
    const droppedEnergy = droppedEnergies[0]

    for (const laborer of laborers) {
        if (laborer.memory.boosted === false && laborer.ticksToLive > 0.8 * CREEP_LIFE_TIME) { // boost 예약이 안되어있으면 undefined. boost 되었으면 true
            continue
        }
        if (!laborer.working) {
            if (tombstones.length) {
                laborer.getEnergyFrom(tombstones[0].id)
                continue
            }
            if (droppedEnergy && droppedEnergy.amount > 100) {
                laborer.getEnergyFrom(droppedEnergy.id)
                continue
            }
            if (container) {
                if (container.store[RESOURCE_ENERGY] > 0) {
                    laborer.getEnergyFrom(container.id)
                }
                continue
            }
            if (this.controller.linked) {
                if (controllerLink.store[RESOURCE_ENERGY] > 0) {
                    laborer.getEnergyFrom(controllerLink.id)
                }
                continue
            }
            laborer.needDelivery = true
        }
        laborer.upgradeRCL()
    }
}

Object.defineProperties(Creep.prototype, {
    working: {
        get() {
            if (this.memory.working && this.store[RESOURCE_ENERGY] === 0) {
                this.memory.working = false
            } else if (!this.memory.working && this.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                this.memory.working = true;
            }
            return this.memory.working
        }
    }
})

Object.defineProperties(RoomPosition.prototype, {
    workingSpot: {
        get() {
            if (!this._workingSpot) {
                const candidatePositions = this.getInRange(3).filter(pos => !this.isEqualTo(pos))
                this._workingSpot = candidatePositions.filter(pos => pos.workable)
            }
            return this._workingSpot
        }
    },
    isRoad: {
        get() {
            const road = this.lookFor(LOOK_STRUCTURES).find(structure => structure.structureType === STRUCTURE_ROAD)
            if (road !== undefined) {
                return true
            }
            return false
        }
    },
    creep: {
        // don't cache this like this._creep since roomPosition Object can be stored at heap.
        get() {
            const creeps = this.lookFor(LOOK_CREEPS)
            const powerCreeps = this.lookFor(LOOK_POWER_CREEPS)
            return creeps[0] || powerCreeps[0]
        }
    }
})

Creep.prototype.isWorkable = function (pos) {
    if (!pos.workable) {
        return false
    }
    if (pos.creep && pos.creep.id !== this.id) {
        return false
    }
    return true
}

Creep.prototype.getWorkingSpots = function (pos, range = 3) {
    return pos.getInRange(range).filter(pos => this.isWorkable(pos))
}

Room.prototype.packPos = function (pos) {
    return 50 * pos.y + pos.x
}

Room.prototype.parsePos = function (packedPos) {
    const x = packedPos % 50
    const y = Math.round((packedPos - x) / 50)
    return new RoomPosition(x, y, this.name)
}

Creep.prototype.repairMy = function (target) {
    const costs = this.room.memory.militaryThreat ? this.room.defenseCostMatrix : this.room.basicCostmatrix
    if (costs.get(this.pos.x, this.pos.y) >= 255) {
        this.heap.run = 3
    } else {
        delete this.heap.run
    }

    if (this.heap.run > 0) {
        const spawn = this.room.structures.spawn[0]
        this.heap.run--
        if (spawn && costs.get(this.pos.x, this.pos.y) >= 255) {
            return this.moveMy(spawn, { range: 1 })
        }
    }

    if (this.heap.workingSpot) {
        if (this.heap.workingSpot.targetId !== target.id || this.pos.isEqualTo(this.heap.workingSpot.pos)) {
            delete this.heap.workingSpot
        } else {
            return this.moveMy(this.heap.workingSpot.pos)
        }
    }

    if (this.pos.getRangeTo(target) > 3) {
        const workingSpot = this.pos.findClosestByRange(target.pos.getInRange(3).filter(pos => !pos.isWall && costs.get(pos.x, pos.y) < 255 && (this.checkEmpty(pos) === OK)))
        if (workingSpot) {
            this.heap.workingSpot = {}
            this.heap.workingSpot.targetId = target.id
            this.heap.workingSpot.pos = workingSpot
            return this.moveMy(workingSpot)
        }
        return this.say('no spot')
    }

    this.repair(target)
}

Creep.prototype.upgradeRCL = function () {
    const controller = Game.getObjectById(this.memory.controller) || this.room.controller

    if (this.heap.workingSpot) {
        if (this.heap.workingSpot.id !== controller.id || this.pos.isEqualTo(this.heap.workingSpot.pos)) {
            delete this.heap.workingSpot
        } else {
            this.upgradeController(controller)
            return this.moveMy(this.heap.workingSpot.pos)
        }
    }

    if (this.pos.getRangeTo(controller) > 3) {
        const workingSpot = this.pos.findClosestByRange(this.getWorkingSpots(controller.pos))
        if (workingSpot) {
            this.heap.workingSpot = { id: controller.id, pos: workingSpot }
            return this.moveMy(workingSpot)
        }
        return this.moveMy(controller, { range: 3 })
    }

    if (!this.isWorkable(this.pos)) {
        const workingSpot = this.pos.getClosestByPath(this.getWorkingSpots(controller.pos))
        if (workingSpot !== undefined) {
            this.heap.workingSpot = { id: controller.id, pos: workingSpot }
            this.moveMy(workingSpot)
        }
    }

    this.upgradeController(controller)
}

Creep.prototype.buildTask = function () {
    const constructionSite = Game.getObjectById(this.memory.task)

    if (!constructionSite) {
        delete this.memory.task
        return
    }

    if (this.heap.workingSpot) {
        if (this.heap.workingSpot.id !== this.memory.task || this.pos.isEqualTo(this.heap.workingSpot.pos)) {
            delete this.heap.workingSpot
        } else {
            this.build(constructionSite)
            this.moveMy(this.heap.workingSpot.pos)
            return
        }
    }

    if (this.pos.getRangeTo(constructionSite) > 3) {
        const workingSpot = this.pos.getClosestByPath(this.getWorkingSpots(constructionSite.pos))
        if (workingSpot) {
            this.heap.workingSpot = { id: this.memory.task, pos: workingSpot }
            return this.moveMy(workingSpot)
        }
        return this.moveMy(constructionSite, { range: 3 })
    }

    if (!this.isWorkable(this.pos)) {
        const workingSpot = this.pos.findClosestByRange(this.getWorkingSpots(constructionSite.pos))
        if (workingSpot) {
            this.heap.workingSpot = { id: this.memory.task, pos: workingSpot }
            this.moveMy(workingSpot)
        }
    }

    this.build(constructionSite)
}