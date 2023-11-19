const MINERAL_AMOUNT_TO_KEEP = 3600
const MINERAL_AMOUNT_TO_SELL = 100000
const MINERAL_AMOUNT_BUFFER = 30000
const BOOST_RCL_ENERGY_LEVEL_GOAL = 3
const ENERGY_LEVEL_TO_BE_HELPED = -5
const TERMINAL_ENERGY_THRESHOLD_TO_HELP = 20000

StructureTerminal.prototype.run = function () {
    if (Memory.abandon && Memory.abandon.includes(this.room.name)) {
        return
    }

    if (this.cooldown) {
        return
    }

    this.manageMinerals()

    for (const resourceType of Object.keys(this.store)) {
        if (COMMODITIES_TO_SELL.includes(resourceType)) {
            Business.sell(resourceType, this.store[resourceType], this.room.name)
        }
    }

    // if (data.isEnoughCredit && this.room.structures.powerSpawn.length && this.store[RESOURCE_POWER] < 500) {
    //     Business.buy('power', 1000, this.room.name)
    // }

    if (this.room.controller.level < 8) {
        if (this.store['XGH2O'] < 1000) {
            this.gatherResource('XGH2O', 1000, { threshold: 1000, RCLthreshold: 8 })
        }

        if (this.room.storage && this.room.energyLevel >= BOOST_RCL_ENERGY_LEVEL_GOAL) {
            return
        }
        for (const room of Object.values(Game.rooms)) {
            if (room.name === this.room.name) {
                continue
            }
            if (!room.isMy || room.controller.level < 8) {
                continue
            }
            if (room.savingMode) {
                continue
            }
            if (!room.terminal || room.terminal.cooldown || room.terminal.store[RESOURCE_ENERGY] < TERMINAL_ENERGY_THRESHOLD_TO_HELP) {
                continue
            }
            const amount = Math.floor(TERMINAL_ENERGY_THRESHOLD_TO_HELP / 2)
            if (room.terminal.send(RESOURCE_ENERGY, amount, this.room.name) === OK) {
                return
            }
        }
        return
    }

    if (this.room.storage && this.room.energyLevel < ENERGY_LEVEL_TO_BE_HELPED) {
        for (const room of Overlord.myRooms) {
            if (room.name === this.room.name) {
                continue
            }
            if (room.controller.level < 8) {
                continue
            }
            if (room.savingMode) {
                continue
            }
            if (!room.terminal || room.terminal.cooldown || room.terminal.store[RESOURCE_ENERGY] < TERMINAL_ENERGY_THRESHOLD_TO_HELP) {
                continue
            }
            const amount = Math.floor(TERMINAL_ENERGY_THRESHOLD_TO_HELP / 2)
            if (room.terminal.send(RESOURCE_ENERGY, amount, this.room.name) === OK) {
                break
            }
        }
    }
}

StructureTerminal.prototype.gatherResource = function (resourceType, amount, options = {}) {
    const defaultOptions = { threshold: 1000, RCLthreshold: 6 }
    const { threshold, RCLthreshold } = { ...defaultOptions, ...options }

    if (this.store[resourceType] >= amount) {
        return OK
    }

    const terminals = Overlord.structures.terminal.sort((a, b) => b.store[resourceType] - a.store[resourceType])
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
        if (terminal.store[resourceType] < threshold) {
            break
        }
        const amountToSend = Math.min(terminal.store[resourceType], amount - this.store[resourceType])

        if (terminal.send(resourceType, amountToSend, this.room.name) === OK) {
            Overlord.structures.terminal.filter(element => element.id !== terminal.id)
            if (amountToSend + this.store[resourceType] >= amount) {
                return OK
            }
        }
    }
    return ERR_NOT_ENOUGH_RESOURCES
}

StructureTerminal.prototype.manageMinerals = function () {
    const resourceTypes = [...BASIC_MINERALS].sort((a, b) => this.store[a] - this.store[b])
    for (const resourceType of resourceTypes) {
        const roomName = this.room.name
        const storeAmount = this.store[resourceType]
        const energyAmount = this.store[RESOURCE_ENERGY]
        // sell if amount excess threshold

        if (!this.room.memory[`sell${resourceType}`] && storeAmount > MINERAL_AMOUNT_TO_SELL) {
            this.room.memory[`sell${resourceType}`] = true
        } else if (this.room.memory[`sell${resourceType}`] && storeAmount <= MINERAL_AMOUNT_TO_SELL - MINERAL_AMOUNT_BUFFER) {
            this.room.memory[`sell${resourceType}`] = false
        }

        if (this.room.memory[`sell${resourceType}`]) {
            const amount = Math.min(energyAmount, storeAmount - MINERAL_AMOUNT_TO_SELL + MINERAL_AMOUNT_BUFFER)
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

        //try buy
        Business.buy(resourceType, amountNeeded, roomName)
    }
}