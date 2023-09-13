const BOOST_DEADLINE_RATIO = 0.9

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

Room.prototype.manageBoost = function () {
    const requests = Object.values(this.boostQueue)
    const targetRequest = getMinObject(requests, (request) => request.time)
    this.operateBoost(targetRequest)
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
        for (let i = 0; i < resourceTypes.length; i++) {
            const resourceType = resourceTypes[i]

            const info = requiredResources[resourceType]
            const amount = info.mineralAmount

            const totalAmount = this.getResourceTotalAmount(resourceType)
            if (totalAmount >= amount) {
                continue
            }

            const needAmount = amount - totalAmount

            const result = terminal.gatherResource(resourceType, needAmount)

            if (result !== OK) {
                if (!targetCreep.spawning) {
                    delete targetCreep.memory.boosted
                    delete this.memory.boostState
                    delete this.boostQueue[boostRequest.creepName]
                }
                return ERR_NOT_ENOUGH_RESOURCES
            }
        }
        this.memory.boostState = 'prepare'
        return
    }

    if (this.memory.boostState === 'prepare') {
        for (let i = 0; i < resourceTypes.length; i++) {
            const resourceType = resourceTypes[i]
            const amountInfo = requiredResources[resourceType]
            const lab = reactionLabs[i]
            if (lab.mineralType && lab.mineralType !== resourceType && lab.store.getUsedCapacity(lab.mineralType) > 0) {
                researcher.getDeliveryRequest(lab, terminal, lab.mineralType)
                return
            }
            if (amountInfo.mineralAmount < 30) {
                data.recordLog(`ERROR: boosting ${targetCreep.name} failed. request weird.`, this.name)
                delete targetCreep.memory.boosted
                delete this.boostQueue[boostRequest.creepName]
                delete this.memory.boostState
                return
            }
            if (lab.store[resourceType] < amountInfo.mineralAmount) {
                if (this.getResourceTotalAmount(resourceType) < amountInfo.mineralAmount) {
                    this.memory.boostState = 'gather'
                    return
                }
                if (terminal.store[resourceType] > 0) {
                    researcher.getDeliveryRequest(terminal, lab, resourceType)
                    return
                }
                for (const otherLab of this.structures.lab) {
                    if (otherLab.id === lab.id) {
                        continue
                    }
                    if (otherLab.store[resourceType] === 0) {
                        continue
                    }
                    researcher.getDeliveryRequest(otherLab, lab, resourceType)
                    return
                }
            }

            if (lab.store[RESOURCE_ENERGY] < amountInfo.energyAmount) {
                const amountNeeded = amountInfo.energyAmount - lab.store[RESOURCE_ENERGY]
                if (terminal.store[RESOURCE_ENERGY] + researcher.store[RESOURCE_ENERGY] < amountNeeded) {
                    return ERR_NOT_ENOUGH_ENERGY
                }
                researcher.getDeliveryRequest(terminal, lab, RESOURCE_ENERGY)
                return
            }
        }
        if (!targetCreep.spawning) {
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

            const lab = reactionLabs[i]

            if (lab.mineralType !== resourceType && lab.store.getUsedCapacity(lab.mineralType) > 0) {
                this.memory.boostState = 'prepare'
                return
            }

            if (lab.store[resourceType] < requiredResources[resourceType].mineralAmount) {
                this.memory.boostState = 'prepare'
                return ERR_NOT_ENOUGH_RESOURCES
            }

            if (lab.store[RESOURCE_ENERGY] < requiredResources[resourceType].energyAmount) {
                this.memory.boostState = 'prepare'
                return ERR_NOT_ENOUGH_ENERGY
            }

            if (targetCreep.pos.getRangeTo(lab) > 1) {
                return targetCreep.moveMy(lab, { range: 1 })
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