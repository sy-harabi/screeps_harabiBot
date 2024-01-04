const { simpleAllies } = require("./simpleAllies")

const MINERAL_AMOUNT_TO_KEEP = 3600
const MINERAL_AMOUNT_TO_SELL = 50000
const MINERAL_AMOUNT_BUFFER = 10000
const TERMINAL_ENERGY_THRESHOLD_TO_HELP = 20000

StructureTerminal.prototype.run = function () {
    const roomName = this.room.name
    simpleAllies.initRun(roomName)

    if (Memory.abandon && Memory.abandon.includes(roomName)) {
        simpleAllies.endRun()
        return
    }

    if (this.cooldown) {
        simpleAllies.endRun()
        return
    }

    this.manageMinerals()

    for (const resourceType of Object.keys(this.store)) {
        if (COMMODITIES_TO_SELL.includes(resourceType)) {
            Business.sell(resourceType, this.store[resourceType], roomName)
        }
    }

    if (this.store[RESOURCE_POWER] > 10000) {
        Business.sell('power', 1000, roomName)
    }

    const neeedsHelp = this.room.getNeedsHelp()

    if (neeedsHelp) {
        const rooms = [...Overlord.myRooms].sort((a, b) => Game.map.getRoomLinearDistance(roomName, a.name) - Game.map.getRoomLinearDistance(roomName, b.name))
        for (const room of rooms) {
            if (room.name === roomName) {
                continue
            }
            if (room.controller.level < 8) {
                continue
            }
            if (room.energyLevel < 150) {
                continue
            }
            if (!room.terminal || room.terminal.cooldown || room.terminal.store[RESOURCE_ENERGY] < TERMINAL_ENERGY_THRESHOLD_TO_HELP) {
                continue
            }
            const amount = Math.floor(TERMINAL_ENERGY_THRESHOLD_TO_HELP / 2)
            if (room.terminal.send(RESOURCE_ENERGY, amount, roomName) === OK) {
                simpleAllies.endRun()
                return
            }
        }
        Business.buy(RESOURCE_ENERGY, 20000, roomName)
    }

    simpleAllies.endRun()
}

Room.prototype.getNeedsHelp = function () {
    if (!this.terminal || !this.storage) {
        return false
    }

    if (this.controller.level === 8) {
        return this.energyLevel < 110
    }

    return this.energyLevel < 160
}

/**
 * 
 * @param {string} resourceType - resourceType to gather
 * @param {number} amount - goal amount to gather
 * @param {*} options 
 * @returns 
 */
StructureTerminal.prototype.gatherResource = function (resourceType, amount, options = {}) {
    const defaultOptions = { threshold: 2 * amount - this.store[resourceType], RCLthreshold: 6, rooms: undefined }
    const { threshold, RCLthreshold, rooms } = { ...defaultOptions, ...options }

    if (this.store[resourceType] >= amount) {
        return OK
    }

    const terminals = rooms
        ? rooms.map(room => room.terminal).filter(terminal => terminal !== undefined)
        : Overlord.structures.terminal.sort((a, b) => b.store[resourceType] - a.store[resourceType])
    for (const terminal of terminals) {
        if (terminal.room.name === this.room.name) {
            continue
        }

        if (terminal.room.controller.level < RCLthreshold) {
            continue
        }

        if (terminal.cooldown) {
            continue
        }
        if (terminal.store[resourceType] <= threshold) {
            continue
        }

        const amountToSend = Math.min(terminal.store[resourceType], amount - this.store[resourceType])

        if (terminal.send(resourceType, amountToSend, this.room.name) === OK) {
            Overlord.structures.terminal.filter(element => element.id !== terminal.id)
            if (amountToSend + this.store[resourceType] >= amount) {
                return OK
            } else {
                amount -= amountToSend
            }
        }
    }
    return ERR_NOT_ENOUGH_RESOURCES
}

StructureTerminal.prototype.manageMinerals = function () {
    const roomName = this.room.name
    const resourceTypes = [...BASIC_MINERALS].sort((a, b) => this.store[a] - this.store[b])
    const mineralAmountToSell = Math.min(MINERAL_AMOUNT_TO_SELL, 7200 + Overlord.myRooms.length * 2000)
    const mineralAmountToSend = 7200 + Overlord.myRooms.length * 1000

    const requests = simpleAllies.allySegmentData ? simpleAllies.allySegmentData.requests : undefined
    const resourceRequests = requests ? requests.resource : undefined
    const resourceRequestsSorted = resourceRequests ? resourceRequests.sort((a, b) => b.priority - a.priority) : undefined

    for (const resourceType of resourceTypes) {
        const storeAmount = this.store[resourceType]
        const energyAmount = this.store[RESOURCE_ENERGY]
        // sell if amount excess threshold

        if (storeAmount > mineralAmountToSend) {
            if (resourceRequestsSorted) {
                const priorityRequest = resourceRequestsSorted.find(request => request.resourceType === resourceType && request.terminal)
                if (priorityRequest) {
                    const amount = Math.min(1000, priorityRequest.amount)
                    if (this.send(resourceType, amount, priorityRequest.roomName, 'my gift for ally')) {
                        continue
                    }
                }
            }
        }

        if (!this.room.memory[`sell${resourceType}`] && storeAmount > mineralAmountToSell) {
            this.room.memory[`sell${resourceType}`] = true
        } else if (this.room.memory[`sell${resourceType}`] && storeAmount <= mineralAmountToSell - MINERAL_AMOUNT_BUFFER) {
            this.room.memory[`sell${resourceType}`] = false
        }

        if (this.room.memory[`sell${resourceType}`] && (SHARD !== 'swc' || resourceType !== 'X')) {
            const amount = Math.min(energyAmount, storeAmount - mineralAmountToSell + 1000)
            Business.sell(resourceType, amount, roomName)
            continue
        }

        // continue if sufficient
        if (storeAmount >= MINERAL_AMOUNT_TO_KEEP) {
            Business.cancelAllOrder(resourceType, roomName, ORDER_BUY)
            continue
        }

        const amountNeeded = Math.min(1000, MINERAL_AMOUNT_TO_KEEP - storeAmount)

        //try gather. continue if success
        if (this.gatherResource(resourceType, MINERAL_AMOUNT_TO_KEEP, { threshold: MINERAL_AMOUNT_TO_KEEP + amountNeeded }) === OK) {
            Business.cancelAllOrder(resourceType, roomName, ORDER_BUY)
            continue
        }

        const request = {
            priority: 0.5,
            roomName: roomName,
            resourceType: resourceType,
            amount: amountNeeded,
            terminal: true
        }

        simpleAllies.requestResource(request)

        //try buy
        if (SHARD !== 'swc' || resourceType !== 'X') {
            Business.buy(resourceType, amountNeeded, roomName)
        }
    }
}