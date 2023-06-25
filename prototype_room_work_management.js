Object.defineProperties(Creep.prototype, {
    working: {
        get() {
            if (this.memory.working && this.store[RESOURCE_ENERGY] === 0) {
                this.memory.working = false
            }
            if (!this.memory.working && this.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
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
    }
})

Creep.prototype.isWorkable = function (pos) {
    if (this.pos.isEqualTo(pos) && !pos.isRoad) {
        return true
    }
    if (pos.workable) {
        return true
    }
    return false
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
        return this.moveMy(controller, 3)
    }

    if (!this.isWorkable(this.pos)) {
        const workingSpot = this.pos.findClosestByRange(this.getWorkingSpots(controller.pos))
        if (workingSpot) {
            this.heap.workingSpot = { id: controller.id, pos: workingSpot }
            this.moveMy(workingSpot, 0)
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
            return this.moveMy(this.heap.workingSpot.pos)
        }
    }

    if (this.pos.getRangeTo(constructionSite) > 3) {
        return this.moveMy(constructionSite, 3)
    }

    if (this.pos.isEqualTo(constructionSite.pos)) {
        const direction = Math.ceil(Math.random() * 8) + 1
        this.move(direction)
    }

    if (!this.isWorkable(this.pos)) {
        const workingSpot = this.pos.findClosestByRange(this.getWorkingSpots(constructionSite.pos))
        if (workingSpot) {
            this.heap.workingSpot = { id: this.memory.task, pos: workingSpot }
            this.moveMy(workingSpot, 0)
        }
    }



    this.build(constructionSite)
}

Room.prototype.manageWork = function () {
    // laborer 동작 및 이용가능한 laborer 찾기
    let laborers = this.creeps.laborer
    this.heap.laborersNeedDelivery = false

    let controllerLink = undefined
    if (this.controller.link && this.controller.link.isActive()) {
        controllerLink = this.controller.link
    }

    this.heap.laborersNeedDelivery = false

    if (!this.controller.linked) {
        this.heap.laborersNeedDelivery = true
    }

    for (const laborer of laborers) {
        if (laborer.memory.boosting) {
            continue
        }

        if (!laborer.working && !laborer.memory.task && this.controller.linked) {
            laborer.getEnergyFrom(controllerLink.id)
            continue
        }

        if (laborer.memory.task) {
            this.heap.laborersNeedDelivery = true
            laborer.buildTask()
            continue
        } else {
            laborer.upgradeRCL()
            continue
        }

    }

    // construction site 목록 작성
    let tasks = this.constructionSites
    if (this.controller.ticksToDowngrade < 1000) {
        for (const laborer of this.creeps.laborer) {
            delete laborer.memory.task
        }
    } else if (tasks.length && laborers.length) {
        // 업무 배치 시작
        const tasksByPriority = new Array(10)
        for (let i = 0; i < tasksByPriority.length; i++) {
            tasksByPriority[i] = []
        }
        for (const task of tasks) {
            tasksByPriority[BUILD_PRIORITY[task.structureType]].push(task)
        }
        const priorityTasks = tasksByPriority.find(tasks => tasks.length)
        for (const laborer of laborers) {
            laborer.memory.task = laborer.pos.findClosestByRange(priorityTasks).id
        }
    }
}