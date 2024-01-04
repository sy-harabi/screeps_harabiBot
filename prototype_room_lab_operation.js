global.AMOUNT_TO_ACCUMULATE_BOOSTS = 10000

const AMOUNT_REQUIRED_TO_MAKE_BOOSTS = 1000

const emoji = {
    produce: '🧪',
    transfer: '🚚',
    prepare: '📦'
}

Room.prototype.operateLab = function (resource0, resource1) {
    const researcher = this.creeps.researcher[0]
    const sourceLabs = this.labs.sourceLab.map(id => Game.getObjectById(id))
    const reactionLabs = this.labs.reactionLab.map(id => Game.getObjectById(id))
    const terminal = this.terminal

    this.visual.text(`${emoji[this.labState]}${this.memory.labTarget}`, sourceLabs[0].pos.x, sourceLabs[0].pos.y,)

    if (this.labState === 'produce') {
        if (sourceLabs[0].store[resource0] >= LAB_REACTION_AMOUNT && sourceLabs[1].store[resource1] >= LAB_REACTION_AMOUNT) {
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
        this.memory.labState = 'transfer'
        return
    }

    if (!researcher) {
        this.heap.needResearcher = true
        return
    }

    if (this.labState === 'prepare') {
        if ((sourceLabs[0].mineralType && sourceLabs[0].mineralType !== resource0) || (sourceLabs[1].mineralType && sourceLabs[1].mineralType !== resource1)) {
            this.memory.labState = 'transfer'
            return
        }
        if (sourceLabs[0].store[resource0] < AMOUNT_REQUIRED_TO_MAKE_BOOSTS) {

            if (researcher.isFree && terminal.store[resource0] >= AMOUNT_REQUIRED_TO_MAKE_BOOSTS - sourceLabs[0].store[resource0]) {
                researcher.getDeliveryRequest(terminal, sourceLabs[0], resource0)
            }
            return
        }
        if (sourceLabs[1].store[resource1] < AMOUNT_REQUIRED_TO_MAKE_BOOSTS) {
            if (researcher.isFree && terminal.store[resource1] >= AMOUNT_REQUIRED_TO_MAKE_BOOSTS - sourceLabs[1].store[resource1]) {
                researcher.getDeliveryRequest(terminal, sourceLabs[1], resource1)
            }
            return
        }
        this.memory.labState = 'produce'
        return
    }

    if (this.labState === 'transfer') {
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

        delete this.memory.labTarget
        delete this.memory.labState
        return
    }
    delete this.memory.labState
}

Object.defineProperties(Room.prototype, {
    labs: {
        get() {
            if (this.memory.labs && this.memory.labs.sourceLab.length === 2 && (this.memory.labs.sourceLab.length + this.memory.labs.reactionLab.length) === this.structures.lab.length) {
                return this.memory.labs
            }
            const structureLabs = this.structures.lab
            const terminal = this.terminal
            if (terminal) {
                structureLabs.sort((a, b) => a.pos.getRangeTo(terminal.pos) - b.pos.getRangeTo(terminal.pos))
            }
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

    const targetCompounds = USEFULL_COMPOUNDS.sort((a, b) => this.terminal.store[a] - this.terminal.store[b])

    const checked = {}
    //target 확인
    for (const target of targetCompounds) {

        // 충분히 있으면 넘어가자
        if (terminal.store[target] >= AMOUNT_TO_ACCUMULATE_BOOSTS) {
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
                if (terminal.store[adjacent] >= AMOUNT_REQUIRED_TO_MAKE_BOOSTS) {
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
    if (terminal.store[formula.resourceType0] < AMOUNT_REQUIRED_TO_MAKE_BOOSTS || terminal.store[formula.resourceType1] < AMOUNT_REQUIRED_TO_MAKE_BOOSTS) {
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
        return 'produce'
    }
    if (this.reactionLabAmount > 0) {
        return 'transfer'
    }
    return 'prepare'
}