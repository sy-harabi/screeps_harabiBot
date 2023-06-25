const ENERGY_PRIORITY = {
    extension: 1,
    spawn: 1,
    link: 2,
    tower: 1,
    terminal: 4,
    storage: 10,
    factory: 5,
    nuker: 6
}

global.ENERGY_DEPOT_PRIORITY = {
    link: 3,
    container: 2,
    storage: 4,
    terminal: 3,
}

function Applicant(creep) {
    this.creep = creep
    this.pos = creep.pos
    this.amount = creep.store.getUsedCapacity(RESOURCE_ENERGY)
    this.isManager = creep.memory.manager
    this.engaged = null
}

function Request(client) {
    this.client = client
    this.pos = client.pos
    this.priority = ENERGY_PRIORITY[client.structureType] || (!client.working ? 5 : ((client.store.getUsedCapacity() / client.store.getCapacity()) > 0.5 ? 7 : 6))
    this.amount = client.store.getFreeCapacity(RESOURCE_ENERGY)
}

Room.prototype.getEnergyRequests = function (numApplicants) {
    const storageLink = this.storage ? this.storage.link : null
    const controllerLink = this.controller.link
    const terminal = this.terminal
    const storage = this.storage
    const factory = this.structures.factory[0]
    const nuker = this.structures.nuker[0]

    const requests = []
    const energyLevelThreshold = this.memory.hasOperator ? 0.5 : 1
    if (this.energyAvailable < energyLevelThreshold * this.energyCapacityAvailable) {
        for (const client of this.structures.extension) {
            if (client.store.getFreeCapacity(RESOURCE_ENERGY)) {
                requests.push(new Request(client))
            }
        }

        for (const client of this.structures.spawn) {
            if (client.store.getFreeCapacity(RESOURCE_ENERGY)) {
                requests.push(new Request(client))
            }
        }
    }

    for (const client of this.structures.tower) {
        if (client.store.getFreeCapacity(RESOURCE_ENERGY) > 400) {
            requests.push(new Request(client))
        }
    }

    if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY)) {
        requests.push(new Request(storage))
    }

    if (terminal && terminal.store[RESOURCE_ENERGY] < (this.controller.level > 7 ? 60000 : 3000)) {
        requests.push(new Request(terminal))
    }

    if (factory && factory.store.getUsedCapacity(RESOURCE_ENERGY) < 2000) {
        requests.push(new Request(factory))
    }

    if (this.heap.laborersNeedDelivery) {
        for (const creep of this.creeps.laborer) {
            if (creep.store.getFreeCapacity(RESOURCE_ENERGY)) {
                requests.push(new Request(creep))
            }
        }
    }

    this.heap.emptyControllerLink = false
    if (controllerLink && storageLink && controllerLink.store.getFreeCapacity(RESOURCE_ENERGY) > 400) {
        this.heap.emptyControllerLink = true
        requests.push(new Request(storageLink))
    }
    this.heap.storageUse = requests.length - numApplicants - 1

    return requests
}

Room.prototype.manageEnergySupply = function (arrayOfCreeps) {
    const requests = this.getEnergyRequests(arrayOfCreeps.length)
    if (!requests.length) {
        return
    }
    const applicants = arrayOfCreeps.map(hauler => new Applicant(hauler))

    for (const request of requests) {
        request.applicants = new Array(...applicants).sort((a, b) => a.pos.getRangeTo(request.pos) - b.pos.getRangeTo(request.pos))
    }

    while (true) {
        const freeRequests = requests.filter(request => request.amount > 0 && request.applicants.length)
        if (!freeRequests.length) {
            break
        }
        for (const request of freeRequests) {
            const bestApplicant = request.applicants.shift()
            if (!bestApplicant.engaged) {
                request.amount -= bestApplicant.amount
                bestApplicant.engaged = request
                continue
            }
            const existingRequest = bestApplicant.engaged
            if (existingRequest.priority < request.priority) {
                continue
            }
            if (existingRequest.priority === request.priority && bestApplicant.pos.getRangeTo(existingRequest.pos) <= bestApplicant.pos.getRangeTo(request.pos)) {
                continue
            }
            request.amount -= bestApplicant.amount
            existingRequest.amount += bestApplicant.amount
            bestApplicant.engaged = request
        }
    }

    for (const applicant of applicants) {
        if (applicant.engaged) {
            applicant.creep.giveEnergyTo(applicant.engaged.client.id)
        }
    }
}

function EnergyRequest(creep) {
    this.creep = creep
    this.pos = creep.pos
    this.amount = creep.store.getFreeCapacity()
    this.engaged = null
}

function EnergyDepot(depot, threshold) {
    this.depot = depot
    this.pos = depot.pos
    this.priority = ENERGY_DEPOT_PRIORITY[depot.structureType] || (depot.destroyTime ? 2 : 1)
    this.amount = depot.amount || depot.store[RESOURCE_ENERGY]
    this.threshold = threshold ? threshold : 0
}

Room.prototype.getGeneralEnergyDepots = function () {
    const energyDepots = []
    const level = this.controller.level

    const tombstones = this.find(FIND_TOMBSTONES).filter(tombstone => tombstone.store[RESOURCE_ENERGY])
    for (const tombstone of tombstones) {
        energyDepots.push(new EnergyDepot(tombstone, 50))
    }

    const droppedResources = this.find(FIND_DROPPED_RESOURCES).filter(droppedResource => droppedResource.resourceType === RESOURCE_ENERGY && droppedResource.amount > 200)
    const filteredDroppedResources = droppedResources.filter(droppedResource => droppedResource.pos.getClosestRange(this.sources) > 1)
    for (const droppedResource of filteredDroppedResources) {
        energyDepots.push(new EnergyDepot(droppedResource, 100))
    }

    const ruins = this.find(FIND_RUINS).filter(ruin => ruin.store[RESOURCE_ENERGY] > 0)
    for (const ruin of ruins) {
        energyDepots.push(new EnergyDepot(ruin, 50))
    }

    if (this.terminal && this.terminal.store[RESOURCE_ENERGY] > (level === 8 ? 63000 : 5000)) {
        energyDepots.push(new EnergyDepot(this.terminal))
    }

    if (this.storage) {
        if (this.heap.storageUse > 0) {
            energyDepots.push(new EnergyDepot(this.storage))
        }

        if (this.storage.link && this.storage.link.store.getUsedCapacity(RESOURCE_ENERGY) > 400 && !this.heap.emptyControllerLink) {
            energyDepots.push(new EnergyDepot(this.storage.link, 400))
        }
    }

    return energyDepots
}

Room.prototype.getSourceEnergyDepots = function (source) {
    const result = []
    const droppedEnergies = source.droppedEnergies
    for (const droppedEnergy of droppedEnergies) {
        result.push(new EnergyDepot(droppedEnergy, 100))
    }

    const container = source.container
    if (container) {
        result.push(new EnergyDepot(container))
    }

    return result
}

Room.prototype.manageEnergyFetch = function (arrayOfCreeps) {
    if (!arrayOfCreeps.length) {
        return
    }
    const requests = this.getGeneralEnergyDepots()
    const applicants = arrayOfCreeps.map(creep => new EnergyRequest(creep))

    for (const request of requests) {
        request.applicants = new Array(...applicants).sort((a, b) => a.pos.getRangeTo(request.pos) - b.pos.getRangeTo(request.pos))
    }
    for (const source of this.sources) {
        const sourceRequests = this.getSourceEnergyDepots(source)
        const sourceApplicants = applicants.filter(applicant => applicant.creep.memory.sourceId === source.id)
        for (const request of sourceRequests) {
            request.applicants = new Array(...sourceApplicants).sort((a, b) => a.pos.getRangeTo(request.pos) - b.pos.getRangeTo(request.pos))
        }
        requests.push(...sourceRequests)
    }

    while (true) {
        const freeRequests = requests.filter(request => (request.amount >= request.threshold && request.applicants.length))
        if (!freeRequests.length) {
            break
        }
        for (const request of freeRequests) {
            const bestApplicant = request.applicants.shift()
            if (!request.threshold && bestApplicant.amount > request.amount) {
                continue
            }

            if (!bestApplicant.engaged) {
                request.amount -= bestApplicant.amount
                bestApplicant.engaged = request
                continue
            }
            const existingRequest = bestApplicant.engaged
            if (existingRequest.priority < request.priority) {
                continue
            }
            if (existingRequest.priority === request.priority && bestApplicant.pos.getRangeTo(existingRequest.pos) <= bestApplicant.pos.getRangeTo(request.pos)) {
                continue
            }
            request.amount -= bestApplicant.amount
            existingRequest.amount += bestApplicant.amount
            bestApplicant.engaged = request
        }
    }

    for (const applicant of applicants) {
        if (applicant.engaged) {
            applicant.creep.getEnergyFrom(applicant.engaged.depot.id)
        }
    }
}

Room.prototype.manageEnergy = function () {
    let suppliers = []
    let fetchers = []
    for (const creep of this.creeps.hauler) {
        if (creep.ticksToLive < 15) {
            creep.getRecycled()
            continue
        }
        if (creep.supplying) {
            suppliers.push(creep)
            continue
        }
        fetchers.push(creep)
    }

    this.manageEnergySupply(suppliers)
    this.manageEnergyFetch(fetchers)
}