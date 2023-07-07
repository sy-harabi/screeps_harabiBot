Creep.prototype.giveCompoundTo = function (target, resourceType) {
    const result = this.transfer(target, resourceType)
    if (result === -9) {
        this.moveMy(target, { range: 1 })
    }
    return result
}

Creep.prototype.getCompoundFrom = function (target, resourceType) {
    const result = this.withdraw(target, resourceType)
    if (result === -9) {
        this.moveMy(target, { range: 1 })
    }
    return result
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
    if (!data.creeps[this.name]) {
        data.creeps[this.name] = {}
    }

    if (data.creeps[this.name].deliveryRequest || this.spawning) {
        return
    }

    this.memory.delivering = false
    data.creeps[this.name].deliveryRequest = deliveryRequest
}

Object.defineProperties(Creep.prototype, {
    isFree: {
        get() {
            if (this._isFree !== undefined) {
                return this._isFree
            }
            if (data.creeps[this.name] && data.creeps[this.name].deliveryRequest) {
                this._isFree = false
                return this._isFree
            }
            this._isFree = true
            return this._isFree
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

    if (this.ticksToLive < 30) {
        if (this.store.getUsedCapacity()) {
            this.returnAll()
            return
        }

        this.getRecycled()
        return
    }

    if (!data.creeps[this.name]) {
        data.creeps[this.name] = {}
    }

    if (this.isFree) {
        if (!this.store.getUsedCapacity()) {
            return
        }
        if (!this.room.labs) {
            return
        }

        if (!this.room.labs.centerLab.length) {
            return
        }

        const centerLab = Game.getObjectById(this.room.labs.centerLab[0])

        if (this.pos.getRangeTo(centerLab) < 2) {
            return
        }
        return this.moveMy(centerLab, { range: 1 })
    }

    const deliveryRequest = data.creeps[this.name].deliveryRequest
    const target = Game.getObjectById(deliveryRequest.to)

    let deposits = []
    let deposit = false
    if (Array.isArray(deliveryRequest.from)) {
        deposits = deliveryRequest.from.map((id) => { return Game.getObjectById(id) }).sort((depositA, depositB) => this.pos.getRangeTo(depositA.pos) - this.pos.getRangeTo(depositB.pos))
    } else {
        deposit = Game.getObjectById(deliveryRequest.from)
    }


    if (Game.time > deliveryRequest.deadline) {
        data.recordLog(`${this.name} couldn't finished request for ${deliveryRequest.to} until deadline`)
        delete data.creeps[this.name].deliveryRequest
        this.say('deadline', true)
        return
    }

    for (const resourceType of Object.keys(this.store)) {
        if (resourceType === deliveryRequest.resourceType) {
            continue
        }
        this.returnAll()
        return
    }

    if (this.memory.delivering === true) {
        if (this.giveCompoundTo(target, deliveryRequest.resourceType) === OK) {
            delete data.creeps[this.name].deliveryRequest
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
            delete data.creeps[this.name].deliveryRequest
            return
        }

        if (this.store.getFreeCapacity() === 0 || this.getCompoundFrom(deposit, deliveryRequest.resourceType) === OK) {
            this.memory.delivering = true
            return
        }
    }
}