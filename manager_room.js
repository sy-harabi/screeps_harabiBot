Room.prototype.runRoomManager = function () {
    if (!data.rooms[this.name]) {
        data.rooms[this.name] = {}
    }

    if (this.abondon) {
        this.abondonRoom()
    }

    if (!this.isMy) {
        return
    }

    // this.visualizeBasePlan()

    this.heap.needResearcher = false

    this.manageConstruction()

    this.manageWork()

    this.manageEnergy()

    this.manageInfo()
    this.manageLink()
    this.manageDefense()

    this.manageExtractor()
    this.manageLab()
    this.manageFactory()
    this.managePowerSpawn()

    this.manageColony()

    // this.manageHighWay()

    this.manageSource()
    this.manageSpawn()
    this.manageVisual()
}

Room.prototype.manageSource = function () {

    this.heap.sourceUtilizationRate = 0
    for (const source of this.sources) {
        // RoomVisual
        this.visual.text(`⛏️${source.info.numWork}/6`, source.pos.x + 0.5, source.pos.y - 0.25, { font: 0.5, align: 'left' })
        this.visual.text(`🚚${source.info.numCarry}/${source.info.maxCarry}`, source.pos.x + 0.5, source.pos.y + 0.5, { font: 0.5, align: 'left' })

        // source 근처 energy 저장량 (container + dropped energy)
        const droppedEnergies = source.droppedEnergies
        let energyAmount = 0
        for (const droppedEnergy of droppedEnergies) {
            energyAmount += droppedEnergy.amount
        }
        const container = source.container
        if (container) {
            energyAmount += (container.store[RESOURCE_ENERGY] || 0)
        }
        this.visual.text(` 🔋${energyAmount}/2000`, source.pos.x + 0.5, source.pos.y + 1.25, { font: 0.5, align: 'left' })

        // miner 비율 : 5 넘으면 1로 고정
        const minerRatio = Math.min(1, source.info.numWork / 5)
        this.heap.sourceUtilizationRate += minerRatio

        if (source.linked) {
            // miner가 부족한 경우
            if (source.info.numMiner === 0) {
                this.requestMiner(source, 0)
                continue
            }

            if (source.info.numMiner < source.available && source.info.numWork < 5) {
                this.requestMiner(source, 2)
                continue
            }

            // source container에 에너지가 넘치는 경우
            if (energyAmount > 2000 && source.info.numCarry === 0) {
                this.requestHauler(10, { isUrgent: true, isManager: false, office: source })
                continue
            }
        } else {
            if (source.info.numWork === 0) {
                this.requestMiner(source, 0)
                continue
            }
            if (source.info.numCarry === 0) {
                this.requestHauler(source.info.maxCarry, { isUrgent: true, isManager: false, office: source })
                continue
            }
            if (source.info.numMiner < source.available && source.info.numWork < 5) {
                this.requestMiner(source, 2)
                continue
            }

            // hauler는 miner에 비레해서 생산
            if (source.info.numCarry < Math.ceil(minerRatio * source.info.maxCarry) && source.info.numHauler < source.info.maxNumHauler) {
                this.requestHauler(source.info.maxCarry - source.info.numCarry, { isUrgent: false, isManager: false, office: source })
                continue
            }
        }

    }
    this.heap.sourceUtilizationRate = this.heap.sourceUtilizationRate / (this.sources.length || 1) // 가동률 평균
}

Room.prototype.manageExtractor = function () {
    const mineralContainer = this.mineral.pos.findInRange(this.structures.container, 1)[0]
    const terminal = this.terminal
    if (!mineralContainer || !terminal) {
        return
    }
    if (mineralContainer.store.getUsedCapacity() > 1000) {
        const researcher = this.creeps.researcher[0]
        if (!researcher) {
            this.heap.needResearcher = true
            return
        }
        researcher.getDeliveryRequest(mineralContainer, terminal, this.mineral.mineralType)
    }
}

Room.prototype.abondonRoom = function () {
    const terminal = this.terminal
    if (this.isMy) {
        if (terminal && terminal.cooldown < 1) {
            if (terminal.store.getUsedCapacity() < 10000 && this.storage.store.getUsedCapacity() < 10000) {
                data.recordLog(`${this.name} depleted`)
                terminal.pos.createFlag(`${this.name} clearAll`, COLOR_PURPLE)
                return
            }
            let onlyEnergy = true
            for (const resourceType of Object.keys(terminal.store)) {
                if (resourceType !== RESOURCE_ENERGY) {
                    if (terminal.store[RESOURCE_ENERGY] > 15000) {
                        business.dump(resourceType, terminal.store[resourceType], this.name)
                    }
                    onlyEnergy = false
                    break
                }
            }
            if (onlyEnergy === true && terminal.store[RESOURCE_ENERGY] > 10000) {
                business.dump(RESOURCE_ENERGY, terminal.store[RESOURCE_ENERGY] / 2 - 100, this.name)
            }
        }
    } else {
        Memory.abondon = Memory.abondon.filter(roomName => roomName !== this.name)
    }
}

Object.defineProperties(Room.prototype, {
    abondon: {
        get() {
            if (!Memory.abondon) {
                Memory.abondon = []
                return false
            }

            return Memory.abondon.includes(this.name)
        }
    },
    totalProgress: {
        get() {
            if (!data.rooms[this.name]) {
                data.rooms[this.name] = {}
            }
            data.rooms[this.name].totalProgress = this.controller.totalProgress
            return
        }
    }
})

Room.prototype.manageInfo = function () {
    if (!this.memory.info || !this.memory.info.length || !this.memory.info[this.memory.info.length - 1].tick) {
        this.memory.info = []
        this.memory.info.push({ progress: this.controller.totalProgress, tick: Game.time, time: new Date().getTime() })
        return
    }

    if (Game.time - this.memory.info[this.memory.info.length - 1].tick >= 1000) {
        this.memory.info.push({ progress: this.controller.totalProgress, tick: Game.time, time: new Date().getTime() })
        this.memory.info.splice(0, this.memory.info.length - 2)
    }
}

Room.prototype.manageLink = function () {
    const storageLink = this.storage ? this.storage.link : false
    if (!storageLink) {
        return
    }
    const controllerLink = this.controller.link

    for (const source of this.sources) {
        const sourceLink = source.link
        if (!sourceLink) {
            continue
        }

        if (controllerLink && sourceLink.store.getUsedCapacity(RESOURCE_ENERGY) > 700 && controllerLink.store.getFreeCapacity(RESOURCE_ENERGY) > 400) {
            sourceLink.transferEnergy(controllerLink)
            continue;
        }

        if (storageLink && sourceLink.store.getUsedCapacity(RESOURCE_ENERGY) > 700 && storageLink.store.getFreeCapacity(RESOURCE_ENERGY) > 400) {
            sourceLink.transferEnergy(storageLink)
            continue;
        }
    }

    if (!controllerLink) {
        return
    }

    if (storageLink.store.getUsedCapacity(RESOURCE_ENERGY) > 700 && controllerLink.store.getFreeCapacity(RESOURCE_ENERGY) > 400) {
        storageLink.transferEnergy(controllerLink)
    }
}

Room.prototype.manageLab = function () {
    if (this.structures.lab.length < 3) {
        return
    }

    if (this.controller.level < 8) {
        this.operateBoostLaborer()
        return
    }

    if (!data.okCPU) {
        return
    }

    const terminal = this.terminal
    if (!terminal) {
        return
    }

    if (!this.labs) {
        return
    }

    if (this.memory.boost) {
        return this.operateBoost()
    }

    if (this.labObjective) {
        return this.operateLab(this.labObjective['resourceType0'], this.labObjective['resourceType1'])
    }
}

Room.prototype.manageFactory = function () {
    const factory = this.structures.factory[0]

    if (!factory || !this.terminal || !this.closeHighways.length) {
        return
    }

    this.factoryDistribution()

    if (!this.memory.factoryObjective && this.memory.factoryObjectiveChecked && Game.time - this.memory.factoryObjectiveChecked < 1000) {
        return
    }

    this.operateFactory(this.factoryObjective)

}

Room.prototype.managePowerSpawn = function () {
    const powerSpawn = this.structures.powerSpawn[0]
    if (!this.savingMode && powerSpawn && this.terminal && this.storage) {
        return this.operatePowerSpawn()
    }
}

Room.prototype.manageHighWay = function () {
    if (!this.closeHighways.length) {
        return
    }

    const rawCommodity = this.specialtyCommodities ? this.specialtyCommodities[6] : undefined

    if (!rawCommodity) {
        return
    }

    const observer = this.structures.observer[0]
    if (observer && Game.time % 20 < 2 && data.enoughCPU && this.terminal.store[rawCommodity] < 8000) {
        const depositCheckOrder = Math.floor(Game.time / 20) % this.closeHighways.length
        observer.depositCheck(this.closeHighways[depositCheckOrder])
    }

    if (this.memory.depositRequests) {
        for (const depositRequest of Object.values(this.memory.depositRequests)) {
            Game.map.visual.text('deposit', new RoomPosition(25, 25, depositRequest.roomName))
            this.runDepositWork(depositRequest)
        }
    }
}

Room.prototype.manageVisual = function () {
    if (data.info) {
        const i = MY_ROOMS.indexOf(this)
        this.visual.rect(0, 1.75 + i, 37, 1, { fill: 'transparent', opacity: 1, stroke: 'white' })
    }

    const controller = this.controller
    this.visual.text(`🛠️${this.laborer.numWork}/${this.maxWork}`, controller.pos.x + 0.75, controller.pos.y - 0.5, { align: 'left' })
    this.visual.text(`🔄${Math.round(100 * controller.progress / controller.progressTotal)}%`, controller.pos.x + 0.75, controller.pos.y + 0.5, { align: 'left' })

    if (this.storage) {
        this.visual.text(` 🔋${Math.floor(this.storage.store.getUsedCapacity(RESOURCE_ENERGY) / 1000)}K`, this.storage.pos.x - 2.9, this.storage.pos.y, { font: 0.5, align: 'left' })
    }

    if (this.structures.lab.length > 2 && this.memory.labObjective) {
        this.visual.text('lab: ' + ((this.memory.labState + ' ') || '') + (this.memory.labObjective ? this.memory.labObjective.resourceType : ''), 0, 43, { align: 'left' })
        this.visual.text(this.memory.boost ? this.memory.boostState : '', this.structures.lab[0].pos)
    }

    if (this.memory.factoryObjective) {
        this.visual.text('factory: ' + this.memory.factoryObjective, 0, 44, { align: 'left' })
    }

    this.visual.text(`savingMode: ${this.savingMod || false}`, 0, 45, { align: 'left' })
}