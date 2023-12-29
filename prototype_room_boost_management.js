const BOOST_DEADLINE_RATIO = 0.7
const BOOST_WAIT_RATIO = 0.99

Object.defineProperties(Room.prototype, {
    boostQueue: {
        get() {
            if (this.memory.boostQueue) {
                return this.memory.boostQueue
            }
            return this.memory.boostQueue = {}
        }
    }
})

Room.prototype.manageBoost = function (requests) {
    for (const request of requests) {
        const targetCreep = Game.creeps[request.creepName]
        if (!targetCreep || targetCreep.spawning) {
            continue
        }
        if (!targetCreep.memory.wait) {
            continue
        }
        if (targetCreep.ticksToLive < CREEP_LIFE_TIME * BOOST_WAIT_RATIO) {
            targetCreep.say('♻️', true)
            targetCreep.getRenew()
        }
    }
    const targetRequest = getMinObject(requests, (request) => request.time)
    this.operateBoost(targetRequest)
}

Creep.prototype.getRenew = function () {
    const closestSpawn = this.pos.findClosestByRange(this.room.structures.spawn.filter(s => !s.spawning))

    if (closestSpawn) {
        if (this.pos.getRangeTo(closestSpawn) > 1) {
            this.moveMy({ pos: closestSpawn.pos, range: 1 })
            return
        }
        closestSpawn.renewCreep(this)
        return
    }

    const anySpawn = this.room.structures.spawn[0]
    if (anySpawn) {
        if (this.pos.getRangeTo(anySpawn) > 2) {
            this.moveMy({ pos: anySpawn.pos, range: 2 })
        }
        return
    }
}

Room.prototype.prepareBoostResources = function () {
    const requiredResourcesTotal = this.getRequiredResourcesTotal()
    const resourceTypes = Object.keys(requiredResourcesTotal)

    const researcher = this.creeps.researcher[0]

    const terminal = this.terminal

    if (!researcher) {
        this.heap.needResearcher = true
        return ERR_BUSY
    }

    for (const resourceType of resourceTypes) {
        const amount = requiredResourcesTotal[resourceType]

        const targetLab = this.getTargetLabForBoost(resourceType, requiredResourcesTotal)
        targetLab._used = true
        if (targetLab === ERR_NOT_FOUND) {
            return ERR_NOT_FOUND
        }

        if (targetLab.mineralType && targetLab.mineralType !== resourceType && targetLab.store.getUsedCapacity(targetLab.mineralType) > 0) {
            researcher.getDeliveryRequest(targetLab, terminal, targetLab.mineralType)
            return ERR_BUSY
        }

        if (targetLab.store[resourceType] < amount) {
            if (targetLab.store.getFreeCapacity(resourceType) === 0) {
                continue
            }
            if (this.getResourceTotalAmount(resourceType) < amount) {
                return ERR_NOT_ENOUGH_RESOURCES
            }
            if (terminal.store[resourceType] > 0) {
                researcher.getDeliveryRequest(terminal, targetLab, resourceType)
                return ERR_BUSY
            }
            for (const otherLab of this.structures.lab) {
                if (otherLab.id === targetLab.id) {
                    continue
                }
                if (otherLab.store[resourceType] === 0) {
                    continue
                }
                researcher.getDeliveryRequest(otherLab, targetLab, resourceType)
                return ERR_BUSY
            }
        }
    }
    return OK
}

/**
 * 
 * @param {string} resourceType - target resourceType
 * @param {array} resourceTypes - an array of resourceTypes to use
 * @returns 
 */
Room.prototype.getTargetLabForBoost = function (resourceType) {
    const labs = this.labs.reactionLab.map(id => Game.getObjectById(id))

    let maxLab = undefined
    let maxAmount = 0
    for (const lab of labs) {
        const amount = lab.store[resourceType]
        if (amount > maxAmount) {
            maxLab = lab
            maxAmount = amount
        }
    }

    if (maxLab) {
        return maxLab
    }

    const availableLab = labs.find(lab => lab.store.getFreeCapacity(resourceType))

    if (availableLab) {
        return availableLab
    }

    const notBeingUsedLab = labs.find(lab => !lab._used)

    if (notBeingUsedLab) {
        return notBeingUsedLab
    }

    return ERR_NOT_FOUND
}

Room.prototype.gatherBoostResources = function () {
    const requiredResourcesTotal = this.getRequiredResourcesTotal()
    const resourceTypes = Object.keys(requiredResourcesTotal)

    const terminal = this.terminal
    for (const resourceType of resourceTypes) {
        const amount = requiredResourcesTotal[resourceType]
        const totalAmount = this.getResourceTotalAmount(resourceType)
        if (totalAmount >= amount) {
            continue
        }
        const result = terminal.gatherResource(resourceType, amount, { threshold: 0 })
        if (result !== OK) {
            return ERR_NOT_ENOUGH_ENERGY
        }
    }
    return OK
}

Room.prototype.getRequiredResourcesTotal = function () {
    if (this._requiredResourcesTotal !== undefined) {
        return this._requiredResourcesTotal
    }
    const requests = Object.values(this.boostQueue)
    const requiredResourcesTotal = {}
    for (const request of requests) {
        const requiredResources = request.requiredResources
        const resourceTypes = Object.keys(requiredResources)
        for (const resourceType of resourceTypes) {
            const amount = requiredResources[resourceType].mineralAmount
            requiredResourcesTotal[resourceType] = requiredResourcesTotal[resourceType] || 0
            requiredResourcesTotal[resourceType] += amount
        }
    }
    return this._requiredResourcesTotal = requiredResourcesTotal
}

Room.prototype.operateBoost = function (boostRequest) {
    const requiredResources = boostRequest.requiredResources
    const researcher = this.creeps.researcher[0]
    const terminal = (this.terminal && this.terminal.RCLActionable) ? this.terminal : undefined
    const reactionLabs = this.labs.reactionLab.map(id => Game.getObjectById(id))
    const targetCreep = Game.creeps[boostRequest.creepName]
    const resourceTypes = Object.keys(requiredResources)

    if (!targetCreep) {
        delete this.boostQueue[boostRequest.creepName]
        delete this.memory.boostState
        return ERR_INVALID_ARGS
    }

    if (!terminal || reactionLabs.length < resourceTypes.length) {
        data.recordLog(`ERROR: boosting ${targetCreep.name} failed. no terminal or lab`, this.name)
        delete targetCreep.memory.boosted
        delete this.memory.boostState
        delete this.boostQueue[boostRequest.creepName]
        ERR_RCL_NOT_ENOUGH
        return
    }

    if ((targetCreep.ticksToLive || 1500) < CREEP_LIFE_TIME * BOOST_DEADLINE_RATIO) {
        data.recordLog(`ERROR: boosting ${targetCreep.name} failed. TTL low`, this.name)
        delete targetCreep.memory.boosted
        delete this.memory.boostState
        delete this.boostQueue[boostRequest.creepName]
        return ERR_INVALID_ARGS
    }

    if (!researcher) {
        this.heap.needResearcher = true
        return
    }

    this.memory.boostState = this.memory.boostState || 'gather'

    if (this.memory.boostState === 'gather') {
        const result = this.gatherBoostResources()
        if (result !== OK) {
            return result
        }
        this.memory.boostState = 'prepare'
        return
    }

    if (this.memory.boostState === 'prepare') {
        const result = this.prepareBoostResources()

        if (result === ERR_NOT_ENOUGH_RESOURCES) {
            this.memory.boostState = 'gather'
            return
        }

        if (result !== OK) {
            return result
        }

        if (!targetCreep.spawning) {
            if (targetCreep.memory.wait === true) {
                return 'wait'
            }
            this.memory.boostState = 'boost'
        }
        return
    }

    if (this.memory.boostState === 'boost') {
        if (targetCreep.spawning) {
            this.memory.boostState = 'prepare'
            return ERR_BUSY
        }

        const body = targetCreep.body

        for (let i = 0; i < resourceTypes.length; i++) {

            const resourceType = resourceTypes[i]

            const bodyType = BOOSTS_EFFECT[resourceType].type
            const boosted = body.find(part => part.type === bodyType && !part.boost) ? false : true

            if (boosted) {
                continue
            }

            const lab = this.structures.lab.find(lab => lab.store[resourceType] >= requiredResources[resourceType].mineralAmount)

            if (!lab) {
                this.memory.boostState = 'prepare'
                return ERR_NOT_ENOUGH_RESOURCES
            }

            if (targetCreep.pos.getRangeTo(lab) > 1) {
                return targetCreep.moveMy({ pos: lab.pos, range: 1 })
            }

            const result = lab.boostCreep(targetCreep)

            if (result === OK) {
                continue
            }

            if (result === -6) {
                this.memory.boostState = 'prepare'
                return
            }
        }
        targetCreep.memory.boosted = true
        delete this.boostQueue[boostRequest.creepName]
        delete this.memory.boostState
        return
    }
}

Room.prototype.getResourceTotalAmount = function (resourceType) {
    let result = 0

    const storage = this.storage
    const terminal = this.terminal
    const labs = this.structures.lab
    const researchers = this.creeps.researcher

    if (storage) {
        result += storage.store[resourceType]
    }

    if (terminal) {
        result += terminal.store[resourceType]
    }

    for (const lab of labs) {
        result += lab.store[resourceType]
    }

    for (const researcher of researchers) {
        result += researcher.store[resourceType]
    }

    return result
}