Creep.prototype.giveCompoundTo = function (target, resourceType) {
    if (this.pos.getRangeTo(target) > 1) {
        this.moveMy(target, { range: 1 })
        return ERR_NOT_IN_RANGE
    }
    return this.transfer(target, resourceType)
}

Creep.prototype.getCompoundFrom = function (target, resourceType) {
    if (this.pos.getRangeTo(target) > 1) {
        this.moveMy(target, { range: 1 })
        return ERR_NOT_IN_RANGE
    }
    return this.withdraw(target, resourceType)
}

global.DeliveryRequest = function (from, to, resourceType) {
    if (Array.isArray(from)) {
        this.from = []
        for (const deposit of from) {
            this.from.push(deposit.id)
        }
    } else {
        this.from = from.id
    }
    this.to = to.id
    this.resourceType = resourceType
    this.deadline = Game.time + 150
    return
}

Creep.prototype.getDeliveryRequest = function (from, to, resourceType) {
    if (this.spawning) {
        return
    }
    const deliveryRequest = new DeliveryRequest(from, to, resourceType)

    if (this.heap.deliveryRequest !== undefined || this.spawning) {
        return
    }

    this.memory.delivering = false
    this.heap.deliveryRequest = deliveryRequest
}

Object.defineProperties(Creep.prototype, {
    isFree: {
        get() {
            if (this._isFree !== undefined) {
                return this._isFree
            }
            if (this.heap.deliveryRequest) {
                return this._isFree = false
            }
            return this._isFree = true
        }
    }
})

Creep.prototype.returnAll = function () {
    for (const resourceType of Object.keys(this.store)) {
        const terminal = this.room.terminal
        if (Object.values(RESOURCES_TO_TERMINAL).includes(resourceType) && terminal) {
            this.giveCompoundTo(terminal, resourceType)
            return
        }

        const factory = this.room.structures.factory[0]
        if (Object.values(RESOURCES_TO_FACTORY).includes(resourceType) && factory) {
            this.giveCompoundTo(factory, resourceType)
            return
        }

        const storage = this.room.storage
        if (storage) {
            this.giveCompoundTo(storage, resourceType)
            return
        }
    }
}

Creep.prototype.delivery = function () {

    if (this.ticksToLive < 50) {
        if (this.store.getUsedCapacity()) {
            this.returnAll()
            return
        }

        this.getRecycled()
        return
    }

    if (this.isFree) {

        for (const resourceType in this.store) {
            if (resourceType !== RESOURCE_ENERGY) {
                return this.returnAll()
            }
        }
        return this.beHauler = true

        // if (this.room.structures.lab.length < 3) {
        //     return
        // }

        // if (!this.heap.researcherPos) {
        //     let xSum = 0
        //     let ySum = 0
        //     for (i = 0; i < 3; i++) {
        //         const lab = this.room.structures.lab[i]
        //         if (!lab) {
        //             break
        //         }
        //         xSum += lab.pos.x
        //         ySum += lab.pos.y
        //     }
        //     const x = xSum / 3
        //     const y = ySum / 3 + 1
        //     if (isValidCoord(x, y)) {
        //         this.heap.researcherPos = new RoomPosition(x, y, this.room.name)
        //     }
        //     return
        // }
        // if (this.pos.getRangeTo(this.heap.researcherPos) <= 1) {
        //     return
        // }
        // return this.moveMy(this.heap.researcherPos, { range: 1 })
    }

    const deliveryRequest = this.heap.deliveryRequest
    const target = Game.getObjectById(deliveryRequest.to)

    let deposits = []
    let deposit = false
    if (Array.isArray(deliveryRequest.from)) {
        deposits = deliveryRequest.from.map((id) => { return Game.getObjectById(id) }).sort((depositA, depositB) => this.pos.getRangeTo(depositA.pos) - this.pos.getRangeTo(depositB.pos))
    } else {
        deposit = Game.getObjectById(deliveryRequest.from)
    }


    if (Game.time > deliveryRequest.deadline) {
        data.recordLog(`FAIL: ${this.name} deliver to ${deliveryRequest.to}`, this.room.name)
        delete this.heap.deliveryRequest
        this.say('deadline', true)
        return
    }

    for (const resourceType of Object.keys(this.store)) {
        if (resourceType === deliveryRequest.resourceType) {
            continue
        } else {
            this.returnAll()
            return
        }
    }

    if (this.memory.delivering === true) {
        if (this.giveCompoundTo(target, deliveryRequest.resourceType) === OK) {
            delete this.heap.deliveryRequest
        }
        return
    }

    if (Array.isArray(deliveryRequest.from)) {
        for (const deposit of deposits) {
            if (this.store.getFreeCapacity() === 0) {
                this.memory.delivering = true
                return
            }

            if (!Object.keys(deposit.store).includes(deliveryRequest.resourceType)) {
                continue
            }
            this.getCompoundFrom(deposit, deliveryRequest.resourceType)
            return
        }
        this.memory.delivering = true
        return
    } else {
        if (!Object.keys(deposit.store).includes(deliveryRequest.resourceType)) {
            delete this.heap.deliveryRequest
            return
        }

        if (this.store.getFreeCapacity() === 0 || this.getCompoundFrom(deposit, deliveryRequest.resourceType) === OK) {
            this.memory.delivering = true
            return
        }
    }
}