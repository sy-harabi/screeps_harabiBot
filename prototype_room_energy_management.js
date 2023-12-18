const TERMINAL_ENERGY_THRESHOLD_MAX_RCL = 60000
const TERMINAL_ENERGY_THRESHOLD_LOW_RCL = 10000
const TERMINAL_ENERGY_BUFFER = 3000

const CONTROLLER_LINK_ENERGY_THRESHOLD = 100

let MinHeap = require('./util_min_heap')

const ENERGY_PRIORITY = {
    extension: 1,
    spawn: 1,
    tower: 1,
    link: 1,
    container: 2,
    terminal: 7,
    lab: 8,
    factory: 9,
    nuker: 10,
    storage: 11,
}

global.ENERGY_DEPOT_PRIORITY = {
    link: 3,
    container: 2,
    storage: 4,
    terminal: 3,
}

Room.prototype.manageEnergy = function () {
    let suppliers = []
    let fetchers = []
    const haulers = this.creeps.hauler.concat(this.creeps.manager)
    const researcher = this.creeps.researcher[0]
    const colonyHaulers = this.getSupplyingColonyHaulers()

    if (researcher && researcher.beHauler === true) {
        haulers.push(researcher)
    }

    for (const colonyHauler of colonyHaulers) {
        haulers.push(colonyHauler)
    }

    for (const creep of haulers) {
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
    this.manageHub()
}

Room.prototype.manageHub = function () {
    const distributor = this.creeps.distributor[0]

    if (!distributor) {
        return
    }

    const hubCenterPos = this.getHubCenterPos()
    if (!hubCenterPos) {
        return
    }

    if (distributor.pos.getRangeTo(hubCenterPos) > 0) {
        distributor.moveMy(hubCenterPos)
        return
    }

    if (distributor.ticksToLive < 1000) {
        const freeSpawn = this.structures.spawn.find(spawn => !spawn.spawning)
        if (freeSpawn) {
            freeSpawn.renewCreep(distributor)
        }
    }

    if (distributor.supplying) {
        this.supplyHub(distributor)
        return
    }

    this.fetchHub(distributor)
}

Room.prototype.getHubCenterPos = function () {
    if (Game.time % 131 === 0) {
        delete this.heap.hubCenterPos
    }

    if (this.heap.hubCenterPos !== undefined) {
        return this.heap.hubCenterPos
    }

    const storage = this.storage
    const storageLink = storage ? storage.link : undefined
    const spawns = this.structures.spawn
    if (!storage || !storageLink) {
        return this.heap.hubCenterPos = null
    }

    const positions = storage.pos.getAtRange(1)
    const hubCenterPos = positions.find(pos => {
        if (pos.getRangeTo(storageLink) !== 1) {
            return false
        }
        for (const spawn of spawns) {
            if (pos.getRangeTo(spawn) !== 1) {
                return false
            }
        }
        return true
    })

    return this.heap.hubCenterPos = hubCenterPos
}

Creep.prototype.getTargetId = function () {
    return this.heap.targetId
}

Creep.prototype.resetTargetId = function () {
    delete this.heap.targetId
}

Room.prototype.fetchHub = function (distributor) {
    const storageLink = this.storage ? this.storage.link : undefined
    if (storageLink && storageLink.store.getUsedCapacity(RESOURCE_ENERGY) > 400 && !this.heap.emptyControllerLink) {
        distributor.getEnergyFrom(storageLink.id)
        return
    }

    const level = this.controller ? this.controller.level : undefined
    const terminal = this.terminal
    if (terminal && terminal.store[RESOURCE_ENERGY] > ((level === 8 ? TERMINAL_ENERGY_THRESHOLD_MAX_RCL : TERMINAL_ENERGY_THRESHOLD_LOW_RCL) + TERMINAL_ENERGY_BUFFER)) {
        distributor.getEnergyFrom(terminal.id)
        return
    }

    const storage = this.storage

    const hubEnergyRequestId = this.getHubEnergyRequestId()

    if (storage && hubEnergyRequestId) {
        distributor.getEnergyFrom(storage.id)
        distributor.setTargetId(hubEnergyRequestId)
    }
}

Room.prototype.supplyHub = function (distributor) {
    const targetId = distributor.getTargetId() || this.getHubEnergyRequestId()

    if (targetId) {
        distributor.giveEnergyTo(targetId)
        distributor.resetTargetId()
        return
    }

    const storage = this.storage

    if (storage) {
        distributor.giveEnergyTo(storage.id)
        return
    }
}

Room.prototype.getHubEnergyRequestId = function () {
    const spawnNotFull = this.structures.spawn.find(spawn => spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
    if (spawnNotFull) {
        return spawnNotFull.id
    }

    const storage = this.storage

    const storageLink = storage ? storage.link : undefined
    const controllerLink = this.controller.link

    if (controllerLink && storageLink && controllerLink.store.getUsedCapacity(RESOURCE_ENERGY) < CONTROLLER_LINK_ENERGY_THRESHOLD) {
        this.heap.emptyControllerLink = true
        if (storageLink.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            return storageLink.id
        }
    } else {
        this.heap.emptyControllerLink = false
    }

    const terminal = this.terminal

    if (terminal && terminal.store.getFreeCapacity(RESOURCE_ENERGY) && terminal.store[RESOURCE_ENERGY] < (this.controller.level > 7 ? TERMINAL_ENERGY_THRESHOLD_MAX_RCL : TERMINAL_ENERGY_THRESHOLD_LOW_RCL)) {
        return terminal.id
    }

    const powerSpawn = this.structures.powerSpawn[0]
    if (powerSpawn && powerSpawn.store[RESOURCE_POWER] > 0 && powerSpawn.store[RESOURCE_ENERGY] < powerSpawn.store[RESOURCE_POWER] * 50) {
        return powerSpawn.id
    }

    return undefined
}

Creep.prototype.setTargetId = function (targetId) {
    this.heap.targetId = targetId
}

Room.prototype.manageEnergySupply = function (arrayOfCreeps) {
    const requests = this.getEnergyRequests(arrayOfCreeps.length)
    if (requests.size === 0) {
        const spawn = this.structures.spawn[0]
        if (!spawn) {
            return
        }
        for (const creep of arrayOfCreeps) {
            creep.moveMy({ pos: spawn.pos, range: 3 })
        }
        return
    }
    const applicants = []
    for (const creep of arrayOfCreeps) {
        if (creep.heap.engaged) {
            const client = Game.getObjectById(creep.heap.engaged.id)
            if (!client || client.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                delete creep.heap.engaged
                applicants.push(new Applicant(creep))
                continue
            }
            // if energy supply is suceeded, creep is free again
            if (creep.giveEnergyTo(client.id) === OK) {
                if (creep.store[RESOURCE_ENERGY] - creep.heap.engaged.amount > 0) {
                    const applicant = new Applicant(creep)
                    applicant.giveEnergy = true
                    applicants.push(applicant)
                }
                delete creep.heap.engaged

            }
            const request = requests.get(client.id)
            if (request) {
                request.amount -= creep.store.getUsedCapacity(RESOURCE_ENERGY)
            }
        } else {
            applicants.push(new Applicant(creep))
        }
    }

    const requestsArray = Array.from(requests.values())

    for (const request of requestsArray) {
        request.applicants = new MinHeap(a => a.pos.getRangeTo(request.pos))
        for (const applicant of applicants) {
            if (request.priority === 1 && applicant.creep.memory.role === 'colonyHauler' && applicant.pos.getRangeTo(request.pos) > 5) {
                continue
            }
            request.applicants.insert(applicant)
        }
    }

    while (true) {
        const freeRequests = requestsArray.filter(request => request.amount > 0 && request.applicants.getSize())
        if (!freeRequests.length) {
            break
        }
        for (const request of freeRequests) {
            const bestApplicant = request.applicants.remove()
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
    const spawn = this.structures.spawn[0]
    for (const applicant of applicants) {
        const creep = applicant.creep
        if (applicant.engaged) {
            if (applicant.giveEnergy && applicant.pos.getRangeTo(applicant.engaged.pos) === 1) {
                creep.heap.engaged = applicant.engaged
                continue
            }

            if (creep.giveEnergyTo(applicant.engaged.id) !== OK) {
                creep.heap.engaged = applicant.engaged
            }
            continue
        }
        if (spawn) {
            creep.setWorkingInfo(spawn.pos, 3)
            creep.moveMy({ pos: spawn.pos, range: 3 })
        }
    }
}

Room.prototype.getEnergyRequests = function (numApplicants) {
    const controllerContainer = this.controller.container
    const storage = this.storage
    const factory = this.structures.factory[0]
    const nuker = this.structures.nuker[0]

    const requests = new Map()

    if (this.energyAvailable || 0 < this.energyCapacityAvailable) {
        for (const client of this.structures.extension) {
            if (client.store.getFreeCapacity(RESOURCE_ENERGY)) {
                requests.set(client.id, new Request(client))
            }
        }

        if (!this.getHubCenterPos()) {
            for (const client of this.structures.spawn) {
                if (client.store.getFreeCapacity(RESOURCE_ENERGY)) {
                    requests.set(client.id, new Request(client))
                }
            }
        }
    }

    for (const client of this.structures.lab) {
        if (client.store.getUsedCapacity(RESOURCE_ENERGY) < 1000) {
            requests.set(client.id, new Request(client))
        }
    }

    for (const client of this.structures.tower) {
        if (client.store.getFreeCapacity(RESOURCE_ENERGY) > 400) {
            requests.set(client.id, new Request(client))
        }
    }

    if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY)) {
        requests.set(storage.id, new Request(storage))
    }

    if (factory && factory.store.getFreeCapacity(RESOURCE_ENERGY) && factory.store.getUsedCapacity(RESOURCE_ENERGY) < 2000) {
        requests.set(factory.id, new Request(factory))
    }

    for (const creep of this.creeps.laborer) {
        if (creep.spawning) {
            continue
        }
        if (creep.needDelivery && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            requests.set(creep.id, new Request(creep))
        }
    }


    if (controllerContainer) {
        const amount = controllerContainer.store[RESOURCE_ENERGY]
        if (this.heap.refillControllerContainer && amount > 1900) {
            this.heap.refillControllerContainer = false
        } else if (!this.heap.refillControllerContainer && amount < 1500) {
            this.heap.refillControllerContainer = true
        }

        if (this.heap.refillControllerContainer) {
            requests.set(controllerContainer.id, new Request(controllerContainer))
        }
    }

    if (nuker) {
        if (!this.memory.fillNuker && this.energyLevel >= 160) {
            this.memory.fillNuker = true
        } else if (this.memory.fillNuker && this.energyLevel < 150) {
            this.memory.fillNuker = false
        }

        if (this.memory.fillNuker && nuker.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            requests.set(nuker.id, new Request(nuker))
        }
    }

    this.heap.storageUse = requests.size - numApplicants - 1

    return requests
}

function Applicant(creep) {
    this.id = creep.id
    this.creep = creep
    this.pos = creep.pos
    this.amount = creep.store.getUsedCapacity(RESOURCE_ENERGY)
    this.isManager = creep.memory.role === 'manager' ? true : false
    this.engaged = null
    this.giveEnergy = false
}

function Request(client) {
    this.id = client.id
    this.pos = client.pos
    this.priority = ENERGY_PRIORITY[client.structureType] || (!client.working ? 3 : ((client.store.getUsedCapacity() / client.store.getCapacity()) > 0.5 ? 5 : 4))
    this.amount = client.store.getFreeCapacity(RESOURCE_ENERGY)
    // new RoomVisual(this.pos.roomName).text(this.priority, this.pos) // for debug
}



function EnergyRequest(creep) {
    this.id = creep.id
    this.creep = creep
    this.pos = creep.pos
    this.amount = creep.store.getFreeCapacity()
    this.reserved = undefined
}

function EnergyDepot(depot) {
    this.id = depot.id
    this.pos = depot.pos
    this.priority = ENERGY_DEPOT_PRIORITY[depot.structureType] || (depot.destroyTime ? 2 : 1)
    this.amount = depot.amount || depot.store[RESOURCE_ENERGY]
}

Room.prototype.getEnergyDepots = function () {
    const energyDepots = {}

    if (!this.memory.militaryThreat) {
        const tombstones = this.find(FIND_TOMBSTONES).filter(tombstone => tombstone.store[RESOURCE_ENERGY] > 50)
        for (const tombstone of tombstones) {
            energyDepots[tombstone.id] = new EnergyDepot(tombstone)
            energyDepots[tombstone.id].threshold = 50
        }

        const droppedResources = this.find(FIND_DROPPED_RESOURCES).filter(droppedResource => droppedResource.resourceType === RESOURCE_ENERGY && droppedResource.amount > 100)
        const filteredDroppedResources = droppedResources.filter(droppedResource => droppedResource.pos.getClosestRange(this.sources) > 1)
        for (const droppedResource of filteredDroppedResources) {
            energyDepots[droppedResource.id] = new EnergyDepot(droppedResource)
            energyDepots[droppedResource.id].threshold = 100
        }

        const ruins = this.find(FIND_RUINS).filter(ruin => ruin.store[RESOURCE_ENERGY] > 50)
        for (const ruin of ruins) {
            energyDepots[ruin.id] = new EnergyDepot(ruin)
            energyDepots[ruin.id].threshold = 50
        }

        for (const source of this.sources) {
            const droppedEnergies = source.droppedEnergies
            for (const droppedEnergy of droppedEnergies) {
                energyDepots[droppedEnergy.id] = new EnergyDepot(droppedEnergy)
                energyDepots[droppedEnergy.id].threshold = 10
                energyDepots[droppedEnergy.id].sourceId = source.id
            }

            const container = source.container
            if (container) {
                energyDepots[container.id] = new EnergyDepot(container)
                energyDepots[container.id].sourceId = source.id
            }
        }
    }

    if (this.storage && this.heap.storageUse > 0) {
        energyDepots[this.storage.id] = new EnergyDepot(this.storage)
        energyDepots[this.storage.id].forManager = true
    }

    return energyDepots
}

Room.prototype.manageEnergyFetch = function (arrayOfCreeps) {
    if (!arrayOfCreeps.length) {
        return
    }
    const requests = this.getEnergyDepots()

    if (!Object.keys(requests).length) {
        return
    }

    const applicants = []
    const sourceApplicants = {}
    for (const source of this.sources) {
        sourceApplicants[source.id] = []
    }
    const managerApplicants = []

    for (const creep of arrayOfCreeps) {
        if (creep.heap.reserved) {
            const id = creep.heap.reserved.id
            const result = creep.getEnergyFrom(id)
            if (result !== ERR_INVALID_TARGET) {
                if (result === OK) {
                    delete creep.heap.reserved
                }
                if (requests[id]) {
                    requests[id].amount -= creep.store.getFreeCapacity()
                } else {
                    delete creep.heap.reserved
                }
                continue
            }
            delete creep.heap.reserved
        }
        const applicant = new EnergyRequest(creep)
        applicants.push(applicant)
        if (creep.memory.role === 'manager' || creep.memory.role === 'researcher' || this.memory.militaryThreat) {
            managerApplicants.push(applicant)
            continue
        }
        if (creep.memory.sourceId && sourceApplicants[creep.memory.sourceId]) {
            sourceApplicants[creep.memory.sourceId].push(applicant)
        }
    }


    const requestsArray = Object.values(requests)

    for (const request of requestsArray) {
        request.applicants = new MinHeap(a => a.pos.getRangeTo(request.pos))

        if (request.amount <= (request.threshold || 0)) {
            continue
        }

        if (request.sourceId !== undefined) {
            for (const applicant of sourceApplicants[request.sourceId]) {
                request.applicants.insert(applicant)
            }
            continue
        }

        if (request.forManager) {
            for (const applicant of managerApplicants) {
                request.applicants.insert(applicant)
            }
            continue
        }

        for (const applicant of applicants) {
            request.applicants.insert(applicant)
        }
    }

    while (true) {
        const freeRequests = requestsArray.filter(request => (request.amount > (request.threshold || 0) && request.applicants.getSize()))
        if (!freeRequests.length) {
            break
        }
        for (const request of freeRequests) {
            const bestApplicant = request.applicants.remove()
            if (!request.threshold && bestApplicant.amount > request.amount) {
                continue
            }
            if (!bestApplicant.reserved) {
                request.amount -= bestApplicant.amount
                bestApplicant.reserved = request
                continue
            }
            const existingRequest = bestApplicant.reserved
            if (existingRequest.priority < request.priority) {
                continue
            }
            if (existingRequest.priority === request.priority && bestApplicant.pos.getRangeTo(existingRequest.pos) <= bestApplicant.pos.getRangeTo(request.pos)) {
                continue
            }
            request.amount -= bestApplicant.amount
            bestApplicant.reserved = request
        }
    }

    for (const applicant of applicants) {
        const creep = applicant.creep
        if (applicant.reserved) {
            if (creep.getEnergyFrom(applicant.reserved.id) !== OK) {
                creep.heap.reserved = applicant.reserved
            }
            continue
        }

        if (creep.memory.role === 'hauler' && !this.memory.militaryThreat) {
            const source = Game.getObjectById(creep.memory.sourceId)
            if (source) {
                if (creep.heap.waitingPos) {
                    if (creep.pos.isEqualTo(creep.heap.waitingPos)) {
                        delete creep.heap.waitingPos
                        continue
                    }
                    creep.moveMy(creep.heap.waitingPos)
                    continue
                }
                const waitingPos = creep.pos.findClosestByRange(source.waitingArea.filter(pos => { return pos.walkable && (creep.checkEmpty(pos) === OK) }))
                if (waitingPos) {
                    creep.heap.waitingPos = waitingPos
                    creep.moveMy(waitingPos)
                    continue
                }
            }
        }

    }
}

Room.prototype.getSupplyingColonyHaulers = function () {
    const result = []
    if (!this.memory.remotes) {
        return result
    }
    const remoteNames = Object.keys(this.memory.remotes)
    for (const remoteName of remoteNames) {
        const colonyHaulers = Overlord.getCreepsByRole(remoteName, 'colonyHauler')
        for (const colonyHauler of colonyHaulers) {
            if (colonyHauler.memory.supplying && colonyHauler.room.name === this.name) {
                result.push(colonyHauler)
            }
        }
    }
    return result
}