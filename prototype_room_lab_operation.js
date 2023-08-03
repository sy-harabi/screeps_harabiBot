Room.prototype.operateLab = function (resource0, resource1) {
    const researcher = this.creeps.researcher[0]
    const sourceLabs = this.labs.sourceLab.map(id => Game.getObjectById(id))
    const reactionLabs = this.labs.reactionLab.map(id => Game.getObjectById(id))
    const terminal = this.terminal

    this.visual.text(`🧪${this.memory.labTarget} ${this.labState}`, sourceLabs[0].pos.x, sourceLabs[0].pos.y - 1, { align: 'left' })
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

        for (const lab of this.structures.lab) {
            if (lab.mineralType && lab.store.getUsedCapacity(lab.mineralType) > 0) {
                researcher.getDeliveryRequest(this.structures.lab, terminal, lab.mineralType)
                return
            }
        }

        if (researcher.store.getUsedCapacity() > 0) {
            researcher.returnAll()
            return
        }
        delete this.memory.labTarget
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
    const boostLab = this.structures.lab[0]

    if (!boostLab) {
        return false
    }

    if (boostLab.mineralType && boostLab.mineralType !== 'XGH2O') {
        if (!researcher) {
            this.heap.needResearcher = true
            return true
        }
        if (boostLab.store.getUsedCapacity(boostLab.mineralType)) {
            researcher.getDeliveryRequest(boostLab, terminal, boostLab.mineralType)
            return true
        }
    }

    if (boostLab.store[RESOURCE_ENERGY] < 1000 && terminal.store[RESOURCE_ENERGY] > 1000) {

        if (!researcher) {
            this.heap.needResearcher = true
            return true
        }
        researcher.getDeliveryRequest(terminal, boostLab, RESOURCE_ENERGY)
        return true
    }

    if (boostLab.store['XGH2O'] < 1000) {
        if (terminal.store['XGH2O'] < 1000 - boostLab.store['XGH2O']) {
            return false
        }
        if (!researcher) {
            this.heap.needResearcher = true
            return true
        }
        researcher.getDeliveryRequest(terminal, boostLab, 'XGH2O')
        return true
    }


}

Room.prototype.operateBoostLaborer = function () {
    const boostLab = this.structures.lab[0]
    const terminal = this.terminal
    if (!boostLab) {
        return false
    }
    const researcher = this.creeps.researcher[0]
    const researcherCarry = researcher ? researcher.store['XGH2O'] : 0

    if (boostLab.store['XGH2O'] + terminal.store['XGH2O'] + researcherCarry < 1000) {
        return ERR_NOT_ENOUGH_RESOURCES
    }

    const laborer = this.creeps.laborer.filter(creep => creep.ticksToLive > 1000 && !creep.memory.boosted && !creep.memory.task)[0]
    if (!laborer) {
        return false
    }

    this.prepareBoostLaborer()

    if (boostLab.store['XGH2O'] < 500 || boostLab.store[RESOURCE_ENERGY] < 500) {
        return false
    }

    laborer.memory.boosting = true
    if (boostLab.boostCreep(laborer) === OK) {
        laborer.memory.boosted = true
        laborer.memory.boosting = false
        return
    }
    if (boostLab.boostCreep(laborer) === -9) {
        laborer.moveMy(boostLab, { range: 1 })
        return
    }
    if (boostLab.boostCreep(laborer) === -5) {
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
            for (const lab of structureLabs) {
                if (lab.isSourceLab && labs['sourceLab'].length < 2) {
                    labs['sourceLab'].push(lab.id)
                } else {
                    labs['reactionLab'].push(lab.id)
                }
            }
            if (labs['sourceLab'].length !== 2) {
                delete this.memory.labs
                return false
            }
            return this.memory.labs = labs
        }
    },
    sourceLabAmount: {
        get() {
            this._sourceLabAmount = 0
            for (const sourceLabId of this.labs.sourceLab) {
                const lab = Game.getObjectById(sourceLabId)
                if (lab.mineralType) {
                    this._sourceLabAmount += lab.store.getUsedCapacity(lab.mineralType)
                }
            }
            return this._sourceLabAmount
        }
    },
    reactionLabAmount: {
        get() {
            this._reactionLabAmount = 0
            for (const sourceLabId of this.labs.reactionLab) {
                const lab = Game.getObjectById(sourceLabId)
                if (lab.mineralType) {
                    this._reactionLabAmount += lab.store.getUsedCapacity(lab.mineralType)
                }
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

Room.prototype.getLabTarget = function () {
    // 방이 내 방이 아니면 오류
    if (!this.isMy) {
        return undefined
    }
    // RCL이 6보다 낮으면 오류
    if (this.controller.level < 6) {
        return undefined
    }

    // terminal 없으면 오류
    const terminal = this.terminal
    if (!terminal) {
        return undefined
    }

    // lab이 3개보다 적으면 오류
    if (this.structures.lab.length < 3) {
        return undefined
    }

    if (this.memory.labTarget !== undefined) {
        return this.memory.labTarget
    }

    const targetCompounds = [...Object.keys(USEFULL_COMPOUNDS), ...business.profitableCompounds]

    const checked = {}
    //target 확인
    for (const target of targetCompounds) {

        // 충분히 있으면 넘어가자
        if (terminal.store[targetCompounds] >= 3000) {
            continue
        }

        // 만들 수 있으면 만들자
        if (this.checkCompound(target) === OK) {
            return this.memory.labTarget = target
        }

        // 둘 다 아니면 queue에 넣고 BFS 시작
        const queue = [target]
        checked[target] = true

        // BFS
        while (queue.length > 0) {
            // queue에서 하나 빼옴
            const node = queue.shift()

            // formula 확인
            const formula = COMPOUNDS_FORMULA[node]
            if (!formula) {
                continue
            }

            // node를 만드는 재료들이 adjacents
            const adjacents = [formula.resourceType0, formula.resourceType1]

            // 각 adjacent마다 확인
            for (const adjacent of adjacents) {

                // 이미 확인한 녀석이면 넘어가자
                if (checked[adjacent]) {
                    continue
                }

                // adjacent가 충분히 있으면 다음으로 넘어가자
                if (terminal.store[adjacent] >= 1000) {
                    continue
                }

                // 확인 진행하자
                const result = this.checkCompound(adjacent)

                // 만들 수 있으면 요놈을 만들자
                if (result === OK) {
                    return this.memory.labTarget = adjacent
                }

                // 아니면 queue에 넣고 다음으로 넘어가자
                queue.push(adjacent)
                checked[adjacent] = true
            }

            // 만들만한 게 아무것도 없었으면 다음 target으로 넘어가자
        }
    }

    return this.memory.labTarget = undefined
}

Room.prototype.checkCompound = function (compound) {

    // formula 없으면 오류
    const formula = COMPOUNDS_FORMULA[compound]
    if (!formula) {
        return ERR_NOT_FOUND
    }

    const terminal = this.terminal

    // 만들 resource가 없으면 오류. (queue에 삽입)
    if (terminal.store[formula.resourceType0] < 1000 || terminal.store[formula.resourceType1] < 1000) {
        return ERR_NOT_ENOUGH_RESOURCES
    }

    // 모두 통과했으면 만들자
    return OK
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

    if (this.sourceLabAmount > 0) {
        return 'producing'
    }
    if (this.reactionLabAmount > 0) {
        return 'transfering'
    }
    return 'preparing'
}