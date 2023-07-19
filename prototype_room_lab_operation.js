Room.prototype.operateLab = function (resource0, resource1) {
    const researcher = this.creeps.researcher[0]
    const sourceLabs = this.labs.sourceLab.map(id => Game.getObjectById(id))
    const reactionLabs = this.labs.reactionLab.map(id => Game.getObjectById(id))
    const terminal = this.terminal

    this.visual.text(`🧪${this.memory.labTargetCompound} ${this.labState}`, sourceLabs[0].pos.x, sourceLabs[0].pos.y - 1, { align: 'left' })
    if (this.labState === 'producing') {
        if (sourceLabs[0].store[resource0] && sourceLabs[1].store[resource1]) {
            for (const lab of reactionLabs) {
                if (lab.runReaction(sourceLabs[0], sourceLabs[1]) === -10) { // reaction lab에 이상한 거 들어있으면 terminal에 반납해라
                    if (!researcher) {
                        this.heap.needResearcher = true
                        return
                    }
                    researcher.getDeliveryRequest(lab, terminal, lab.mineralType)
                }
            }
            return
        }
        this.memory.labState = 'transfering'
        return
    }

    if (!researcher) {
        this.heap.needResearcher = true
        return
    }

    if (this.labState === 'preparing') {
        if ((sourceLabs[0].mineralType && sourceLabs[0].mineralType !== resource0) || (sourceLabs[1].mineralType && sourceLabs[1].mineralType !== resource1)) {
            this.memory.labState = 'transfering'
            return
        }
        if (sourceLabs[0].store[resource0] < 1000) {
            if (researcher.isFree && terminal.store[resource0] >= 1000 - sourceLabs[0].store[resource0]) {
                researcher.getDeliveryRequest(terminal, sourceLabs[0], resource0)
            }
            return
        }
        if (sourceLabs[1].store[resource1] < 1000) {
            if (researcher.isFree && terminal.store[resource1] >= 1000 - sourceLabs[1].store[resource1]) {
                researcher.getDeliveryRequest(terminal, sourceLabs[1], resource1)
            }
            return
        }
        this.memory.labState = 'producing'
        return
    }

    if (this.labState === 'transfering') {
        if (researcher.store.getFreeCapacity() === 0) {
            researcher.returnAll()
            return
        }

        for (const lab of reactionLabs) {
            if (lab.mineralType && lab.store.getUsedCapacity(lab.mineralType)) {
                researcher.getDeliveryRequest(reactionLabs, terminal, lab.mineralType)
                return
            }
        }

        for (const lab of sourceLabs) {
            if (lab.mineralType && lab.store.getUsedCapacity(lab.mineralType)) {
                researcher.getDeliveryRequest(sourceLabs, terminal, lab.mineralType)
                return
            }
        }

        if (researcher.store.getUsedCapacity()) {
            researcher.returnAll()
            return
        }
        delete this.memory.labTargetCompound
        delete this.memory.labState
        return
    }
    delete this.memory.labState
}

Room.prototype.operateBoost = function () {
    const researcher = this.creeps.researcher[0]
    const terminal = this.terminal

    if (!researcher) {
        this.heap.needResearcher = true
        return
    }

    const reactionLabs = this.labs.reactionLab.map(id => Game.getObjectById(id))
    const attacker = Game.getObjectById(this.memory.boost.attacker)
    const healer = Game.getObjectById(this.memory.boost.healer)

    if (reactionLabs.length < 5) {
        return false
    }

    if (!this.memory.boostState) {
        this.memory.boostState = 'preparing'
    }

    if (this.memory.boostState === 'preparing') {
        for (let i = 0; i < Object.keys(ATTACK_BOOST_COMPOUNDS_TIER3).length; i++) {
            const mineralType = Object.keys(ATTACK_BOOST_COMPOUNDS_TIER3)[i]
            const reactionLab = reactionLabs[i]
            if (reactionLab.mineralType && reactionLab.mineralType !== mineralType) {
                this.memory.boostState = 'retrieving'
                return
            }
        }
        for (let i = 0; i < Object.keys(ATTACK_BOOST_COMPOUNDS_TIER3).length; i++) {
            const mineralType = Object.keys(ATTACK_BOOST_COMPOUNDS_TIER3)[i]
            const reactionLab = reactionLabs[i]
            if (reactionLab.store[mineralType] < 600) {
                researcher.getDeliveryRequest(terminal, reactionLab, mineralType)
                return
            }
            if (reactionLab.store[RESOURCE_ENERGY] < 600) {
                researcher.getDeliveryRequest(terminal, reactionLab, RESOURCE_ENERGY)
                return
            }
        }
        this.memory.boostState = 'boosting'
        return
    } else {
        researcher.moveTo(terminal, { range: 1 })
    }

    if (this.memory.boostState === 'boosting') {
        if (attacker && !attacker.spawning) {
            for (let i = 0; i < Object.keys(ATTACK_BOOST_COMPOUNDS_TIER3).length; i++) {
                const reactionLab = reactionLabs[i]
                if (attacker.memory.boosted && attacker.memory.boosted.includes(i)) {
                    continue
                }
                if (reactionLab.boostCreep(attacker) === -9) {
                    attacker.moveTo(reactionLab, { range: 1 })
                    return
                } else if (reactionLab.boostCreep(attacker) === -5) {
                    if (!attacker.memory.boosted) {
                        attacker.memory.boosted = []
                    }
                    attacker.memory.boosted.push(i)
                    continue
                } else if (reactionLab.boostCreep(attacker) === OK) {
                    if (!attacker.memory.boosted) {
                        attacker.memory.boosted = []
                    }
                    attacker.memory.boosted.push(i)
                    continue
                }
            }
            attacker.moveTo(terminal)
        } else {
            return
        }
        if (healer && !healer.spawning) {
            for (let i = 0; i < Object.keys(ATTACK_BOOST_COMPOUNDS_TIER3).length; i++) {
                const reactionLab = reactionLabs[i]
                if (healer.memory.boosted && healer.memory.boosted.includes(i)) {
                    continue
                }
                if (reactionLab.boostCreep(healer) === -9) {
                    healer.moveTo(reactionLab, { range: 1 })
                    return
                } else if (reactionLab.boostCreep(healer) === -5) {
                    if (!healer.memory.boosted) {
                        healer.memory.boosted = []
                    }
                    healer.memory.boosted.push(i)
                    continue
                } else if (reactionLab.boostCreep(healer) === OK) {
                    if (!healer.memory.boosted) {
                        healer.memory.boosted = []
                    }
                    healer.memory.boosted.push(i)
                    continue
                }
            }
        } else {
            return
        }
        this.memory.boostState = 'retrieving'
        return
    }
    if (this.memory.boostState === 'retrieving') {
        if (researcher.store.getFreeCapacity() === 0) {
            researcher.returnAll()
            return
        }

        for (const lab of reactionLabs) {
            if (lab.mineralType && lab.store.getUsedCapacity(lab.mineralType)) {
                return researcher.getDeliveryRequest(reactionLabs, terminal, lab.mineralType)
            }
        }

        if (researcher.store.getUsedCapacity()) {
            return researcher.returnAll()
        }

        delete this.memory.boostState
        delete this.memory.boost
    }
}

Room.prototype.prepareBoostLaborer = function () {
    const researcher = this.creeps.researcher[0]
    const terminal = this.terminal

    const reactionLab = Game.getObjectById(this.labs.reactionLab[0])

    if (!reactionLab) {
        return false
    }

    if (reactionLab.mineralType && reactionLab.mineralType !== 'XGH2O') {
        if (!researcher) {
            this.heap.needResearcher = true
            return true
        }
        if (reactionLab.store.getUsedCapacity(reactionLab.mineralType)) {
            researcher.getDeliveryRequest(reactionLab, terminal, reactionLab.mineralType)
            return true
        }
    }

    if (reactionLab.store['XGH2O'] < 2000) {
        if (terminal.store['XGH2O'] < 1000) {
            return false
        }
        if (!researcher) {
            this.heap.needResearcher = true
            return true
        }
        researcher.getDeliveryRequest(terminal, reactionLab, 'XGH2O')
        return true
    }

    if (reactionLab.store[RESOURCE_ENERGY] < 1000 && terminal.store[RESOURCE_ENERGY] > 1000) {

        if (!researcher) {
            this.heap.needResearcher = true
            return true
        }
        researcher.getDeliveryRequest(terminal, reactionLab, RESOURCE_ENERGY)
        return true
    }

}

Room.prototype.operateBoostLaborer = function () {
    const reactionLab = Game.getObjectById(this.labs.reactionLab[0])
    const terminal = this.terminal
    if (!reactionLab) {
        return false
    }

    if (reactionLab.store['XGH2O'] + terminal.store['XGH2O'] < 1000) {
        return ERR_NOT_ENOUGH_RESOURCES
    }

    this.prepareBoostLaborer()

    if (reactionLab.store['XGH2O'] < 500 || reactionLab.store[RESOURCE_ENERGY] < 500) {
        return false
    }

    const laborer = this.creeps.laborer.filter(creep => creep.ticksToLive > 1000 && !creep.memory.boosted && !creep.memory.task)[0]
    if (!laborer) {
        return false
    }
    laborer.memory.boosting = true
    if (reactionLab.boostCreep(laborer) === OK) {
        laborer.memory.boosted = true
        laborer.memory.boosting = false
        return
    }
    if (reactionLab.boostCreep(laborer) === -9) {
        laborer.moveMy(reactionLab, { range: 1 })
        return
    }
    if (reactionLab.boostCreep(laborer) === -5) {
        laborer.memory.boosted = true
        laborer.memory.boosting = false
        return
    }
}


Object.defineProperties(Room.prototype, {
    labs: {
        get() {
            if (this.memory.labs && this.memory.labs.sourceLab.length === 2 && (this.memory.labs.sourceLab.length + this.memory.labs.reactionLab.length) === this.structures.lab.length) {
                return this.memory.labs
            }
            const structureLabs = this.structures.lab
            labs = {}
            labs['sourceLab'] = []
            labs['reactionLab'] = []
            labs['centerLab'] = []
            const maxSourceLab = this.controller.level > 7 ? 3 : 2
            for (const lab of structureLabs) {
                if (lab.isSourceLab && labs['sourceLab'].length < maxSourceLab) {
                    labs['sourceLab'].push(lab.id)
                    if (lab.pos.getRangeTo(this.terminal) === 2) {
                        labs['centerLab'].push(lab.id)
                    }
                } else {
                    labs['reactionLab'].push(lab.id)
                }
            }
            if (labs['sourceLab'].length !== 2) {
                delete this.memory.labs
                return false
            }
            this.memory.labs = labs
            return this.memory.labs
        }
    },
    sourceLabAmount: {
        get() {
            this._sourceLabAmount = 0
            for (const sourceLabId of this.labs.sourceLab) {
                const lab = Game.getObjectById(sourceLabId)
                this._sourceLabAmount += lab.store.getUsedCapacity(lab.mineralType)
            }
            return this._sourceLabAmount
        }
    },
    reactionLabAmount: {
        get() {
            this._reactionLabAmount = 0
            for (const sourceLabId of this.labs.reactionLab) {
                const lab = Game.getObjectById(sourceLabId)
                this._reactionLabAmount += lab.mineralType ? lab.store.getUsedCapacity(lab.mineralType) : 0
            }
            return this._reactionLabAmount
        }
    },
    labState: {
        get() {
            if (!this.memory.labState) {
                this.memory.labState = this.getLabState()
            }
            return this.memory.labState
        }
    },
})

Room.prototype.getLabTargetCompound = function () {
    if (this.memory.labTargetCompound !== undefined) {
        return this.memory.labTargetCompound
    }

    const queue = [...Object.keys(USEFULL_COMPOUNDS), ...business.profitableCompounds]
    const checked = {}
    for (const compound of queue) {
        if (this.isReadyToProduce(compound)) {
            return this.memory.labTargetCompound = compound
        }
        checked[compound] = true
    }

    while (queue.length > 0) {
        const node = queue.shift()
        const formula = COMPOUNDS_FORMULA[node]
        if (!formula) {
            continue
        }
        if (!checked[formula.resourceType0]) {
            if (this.isReadyToProduce(formula.resourceType0)) {
                return this.memory.labTargetCompound = formula.resourceType0
            }
            queue.push(formula.resourceType0)
            checked[formula.resourceType0] = true
        }
        if (!checked[formula.resourceType1]) {
            if (this.isReadyToProduce(formula.resourceType1)) {
                return this.memory.labTargetCompound = formula.resourceType1
            }
            queue.push(formula.resourceType1)
            checked[formula.resourceType1] = true
        }
    }

    return null
}

Room.prototype.isReadyToProduce = function (compound) {
    if (!this.isMy) {
        return false
    }
    if (this.controller.level < 6) {
        return false
    }

    const terminal = this.terminal
    if (!terminal) {
        return false
    }
    if (this.structures.lab.length < 3) {
        return false
    }

    const formula = COMPOUNDS_FORMULA[compound]
    if (!formula) {
        return false
    }
    if (terminal.store[compound] >= formula.ratio * 1000) {
        return false
    }
    if (terminal.store[formula.resourceType0] < 1000 || terminal.store[formula.resourceType1] < 1000) {
        return false
    }
    return true
}

Room.prototype.getLabState = function () {
    const terminal = this.terminal
    const labs = this.labs

    if (!terminal) {
        return false
    }

    if (!labs.sourceLab.length || !labs.reactionLab.length) {
        return false
    }

    if (this.sourceLabAmount) {
        return 'producing'
    }
    if (this.reactionLabAmount) {
        return 'transfering'
    }
    return 'preparing'
}