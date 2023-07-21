Object.defineProperties(StructureTerminal.prototype, {
    notEnoughBasicMinerals: {
        get() {
            const notEnoughBasicMinerals = []
            for (const resourceType of Object.keys(BASIC_MINERALS)) {
                if ((this.store[resourceType] / BASIC_MINERALS[resourceType]['ratio']) < 1000) {
                    notEnoughBasicMinerals.push({ resourceType: resourceType, amount: this.store[resourceType] })
                }
            }
            return notEnoughBasicMinerals
        }
    },
    lowestBaseCompound: {
        get() {
            this._lowestBaseCompound = {}
            for (const resourceType of Object.keys(BASE_COMPOUNDS)) {
                if (!this._lowestBaseCompound.resourceType || (this._lowestBaseCompound.amount / BASE_COMPOUNDS[this._lowestBaseCompound.resourceType]['ratio']) > (this.store[resourceType] / BASE_COMPOUNDS[resourceType]['ratio'])) {
                    this._lowestBaseCompound = { resourceType: resourceType, amount: this.store[resourceType] }
                }
            }
            return this._lowestBaseCompound
        }
    },
    hasNotEnoughBaseCompounds: {
        get() {
            if ((this.lowestBaseCompound.amount / BASE_COMPOUNDS[this.lowestBaseCompound.resourceType]['ratio']) < 1000) {
                return true
            }
            return false
        }
    },
    lowestTier2Compound: {
        get() {
            this._lowestTier2Compound = {}
            for (const resourceType of Object.keys(TIER2_COMPOUNDS)) {
                if (!this._lowestTier2Compound.resourceType || (this._lowestTier2Compound.amount / TIER2_COMPOUNDS[this._lowestTier2Compound.resourceType]['ratio']) > (this.store[resourceType] / TIER2_COMPOUNDS[resourceType]['ratio'])) {
                    this._lowestTier2Compound = { resourceType: resourceType, amount: this.store[resourceType] }
                }
            }
            return this._lowestTier2Compound
        }
    },
    hasNotEnoughTier2Compounds: {
        get() {
            if ((this.lowestTier2Compound.amount / TIER2_COMPOUNDS[this.lowestTier2Compound.resourceType]['ratio']) < 1000) {
                return true
            }
            return false
        }
    },
    lowestTier3Compound: {
        get() {
            this._lowestTier3Compound = {}
            for (const resourceType of Object.keys(TIER3_COMPOUNDS)) {
                if (!this._lowestTier3Compound.resourceType || (this._lowestTier3Compound.amount / TIER3_COMPOUNDS[this._lowestTier3Compound.resourceType]['ratio']) > (this.store[resourceType] / TIER3_COMPOUNDS[resourceType]['ratio'])) {
                    this._lowestTier3Compound = { resourceType: resourceType, amount: this.store[resourceType] }
                }
            }
            return this._lowestTier3Compound
        }
    },
    hasNotEnoughTier3Compounds: {
        get() {
            if ((this.lowestTier3Compound.amount / TIER3_COMPOUNDS[this.lowestTier3Compound.resourceType]['ratio']) < 1000) {
                return true
            }
            return false
        }
    },
    RegionalCommodity: {
        get() {
            for (const resourceType of Object.keys(BASIC_REGIONAL_COMMODITIES)) {
                if (this.store[resourceType] >= 500) {
                    return resourceType
                }
            }
            return false
        }
    }
})


StructureTerminal.prototype.run = function () {
    if (Memory.abondon && Memory.abondon.includes(this.room.name)) {
        return
    }

    if (this.store[this.room.mineral.mineralType] > 100000) {
        this.room.heap.extract = false
        business.sell(this.room.mineral.mineralType, this.store[this.room.mineral.mineralType] - 70000, this.room.name)
    } else {
        this.room.heap.extract = true
    }

    if (Memory.boostRCL && this.room.controller.level < 8) {
        let received = false
        if (this.store['XGH2O'] < 1000) {
            for (const room of Object.values(Game.rooms)) {
                if (room.name === this.room.name) {
                    continue
                }
                if (!room.isMy || room.controller.level < 8) {
                    continue
                }
                if (!room.terminal || room.terminal.cooldown) {
                    continue
                }
                if (room.terminal.store['XGH2O'] < 1000) {
                    continue
                }
                if (room.terminal.send('XGH2O', 1000, this.room.name) === OK) {
                    received = true
                    data.recordLog(`${room.name} sends 1000 of XGH2O to ${this.room.name}`)
                    break
                }
            }
            if (!received) {
                business.buy('XGH2O', 1000, this.room.name)
            }
        }

        if (this.room.storage && this.room.storage.store.getUsedCapacity(RESOURCE_ENERGY) >= 500000) {
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
            if (!room.terminal || room.terminal.cooldown || room.terminal.store[RESOURCE_ENERGY] < 40000) {
                continue
            }
            const amount = Math.floor(room.terminal.store[RESOURCE_ENERGY] / 2)
            if (room.terminal.send(RESOURCE_ENERGY, amount, this.room.name) === OK) {
                data.recordLog(`${room.name} sends ${amount} of energy to ${this.room.name}`)
            }
        }
    } else if (this.room.storage && this.room.storage.store[RESOURCE_ENERGY] < 300000) {
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
            if (!room.terminal || room.terminal.cooldown || room.terminal.store[RESOURCE_ENERGY] < 40000) {
                continue
            }
            const amount = Math.floor(room.terminal.store[RESOURCE_ENERGY] / 2)
            if (room.terminal.send(RESOURCE_ENERGY, amount, this.room.name) === OK) {
                data.recordLog(`${room.name} sends ${amount} of energy to ${this.room.name}`)
            }
        }
    }

    const notEnoughBasicMinerals = this.notEnoughBasicMinerals
    if (notEnoughBasicMinerals.length) {
        for (const notEnoughBasicMineral of notEnoughBasicMinerals) {
            business.buy(notEnoughBasicMineral.resourceType, BASIC_MINERALS[notEnoughBasicMineral.resourceType].ratio * 1000 - notEnoughBasicMineral.amount, this.room.name)
        }
    }

    if (data.isEnoughCredit && this.room.structures.powerSpawn.length && this.store[RESOURCE_POWER] < 500) {
        business.buy('power', 1000, this.room.name)
    }

    if (!this.hasNotEnoughTier3Compounds) {
        for (const resourceType of business.profitableCompounds) {
            business.sell(resourceType, this.store[resourceType] / 2, this.room.name)
        }
    }

    for (const resourceType of Object.keys(this.store)) {
        if (COMMODITIES_TO_SELL.includes(resourceType)) {
            business.sell(resourceType, this.store[resourceType], this.room.name)
        }
    }
}