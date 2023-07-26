Room.prototype.runRoomManager = function () {
    if (!data.rooms[this.name]) {
        data.rooms[this.name] = {}
    }

    if (this.abondon) {
        this.abondonRoom()
    }

    if (!this.isMy) {
        this.checkTombstone()
        return
    }

    if (data.visualize) {
        this.visualizeBasePlan()
    }

    this.heap.needResearcher = false

    this.manageConstruction()

    this.manageDefense()
    this.defenseNuke()
    if (!this.memory.defenseNuke || this.memory.defenseNuke.state !== 'repair' || this.memory.militaryThreat) {
        this.manageWork()
    }

    this.manageEnergy()

    this.manageInfo()
    this.manageLink()

    this.manageLab()

    // 여기서부터는 전시에는 안함
    if (!this.memory.militaryThreat) {
        this.manageExtractor()
        this.manageColony()
        this.manageHighWay()
        this.manageFactory()
        this.managePowerSpawn()
        this.manageScout()
        this.manageSource()
        this.manageClaim()
    }

    this.manageSpawn()
    this.manageVisual()
    // this.getDefenseCostMatrix(254, { checkResult: true })
}

Room.prototype.checkTombstone = function () {
    // 내 creep의 tombstone 찾자. 자연적으로 죽은 건 제외
    const myTombstones = this.find(FIND_TOMBSTONES).filter(tombstone => tombstone.creep.my && tombstone.creep.ticksToLive > 1)
    const myDefenderTombstones = myTombstones.filter(tombstone => tombstone.creep.name.split(' ')[1] === 'colonyDefender')
    // 없으면 return
    if (myTombstones.length === 0) {
        return
    }
    const map = OVERLORD.map

    map[this.name] = map[this.name] || {}

    // 있으면 여러가지 확인
    const hostileStructures = this.structures.tower
    // tower 있다는건 다른 사람 방이거나 InvaderCore 있다는 뜻.
    if (hostileStructures.length) {
        map[this.name].inaccessible = Game.time + 20000
        map[this.name].lastScout = Game.time
        return
    }

    const deadCreepsId = myTombstones.map(tombstone => tombstone.creep.id)
    const deadDefendersId = myDefenderTombstones.map(tombstone => tombstone.creep.id)
    const attackEvents = this.getEventLog().filter(eventLog => eventLog.event === EVENT_ATTACK)
    isMurdered = false
    isDefenderMurdered = false
    for (const attackEvent of attackEvents) {
        const targetId = attackEvent.data.targetId
        const targetTombstone = myTombstones.find(tombstone => tombstone.creep.id === targetId)
        if (!targetTombstone) {
            continue
        }
        const deadCreep = targetTombstone.creep
        const attacker = Game.getObjectById(attackEvent.objectId)
        const owner = attacker ? attacker.owner : undefined
        const username = owner ? owner.username : undefined

        data.recordLog(`${deadCreep.name} is murdered at ${this.name} by ${username}`)

        if (username && username === 'Invader') {
            return
        }

        if (deadDefendersId.includes(targetId)) {
            isDefenderMurdered = true
            isMurdered = true
            continue
        }
        if (deadCreepsId.includes(targetId)) {
            isMurdered = true
        }

    }

    if (isMurdered) {
        map[this.name].inaccessible = Game.time + 1500
        map[this.name].lastScout = Game.time
    }

    if (isDefenderMurdered) {
        map[this.name].inaccessible = Game.time + 1500
        map[this.name].lastScout = Game.time
        map[this.name].threat = true
        if (OVERLORD.colonies.includes(this.name) && this.memory.host) {
            const hostRoom = Game.rooms[this.memory.host]
            if (!hostRoom) {
                return
            }
            hostRoom.abandonColony(this.name)
        }
    }
}

Room.prototype.manageSource = function () {
    this.heap.sourceUtilizationRate = 0

    for (const source of this.sources) {
        // RoomVisual
        this.visual.text(`⛏️${source.info.numWork}/6`, source.pos.x + 0.5, source.pos.y - 0.25, { font: 0.5, align: 'left' })
        this.visual.text(`🚚${source.info.numCarry}/${source.info.maxCarry}`, source.pos.x + 0.5, source.pos.y + 0.5, { font: 0.5, align: 'left' })

        // source 근처 energy 저장량 (container + dropped energy)
        this.visual.text(` 🔋${source.energyAmountNear}/2000`, source.pos.x + 0.5, source.pos.y + 1.25, { font: 0.5, align: 'left' })

        // miner 비율 : 5 넘으면 1로 고정
        const minerRatio = Math.min(1, source.info.numWork / 5)
        this.heap.sourceUtilizationRate += minerRatio

        if (source.linked) {
            // miner가 부족한 경우
            if (source.info.numMiner === 0) {
                this.requestMiner(source, 2)
                continue
            }

            if (source.info.numMiner < source.available && source.info.numWork < 5) {
                this.requestMiner(source, 3)
                continue
            }

            // hauler는 miner에 비레해서 생산
            if (source.info.numCarry < Math.ceil(minerRatio * source.info.maxCarry) && source.info.numHauler < source.info.maxNumHauler) {
                this.requestHauler(source.info.maxCarry - source.info.numCarry, { isUrgent: false, isManager: false, office: source })
                continue
            }
        } else {
            if (source.info.numWork === 0) {
                this.requestMiner(source, 2)
                continue
            }
            if (source.info.numCarry === 0) {
                this.requestHauler(source.info.maxCarry, { isUrgent: true, isManager: false, office: source })
                continue
            }
            if (source.info.numMiner < source.available && source.info.numWork < 5) {
                this.requestMiner(source, 3)
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
        if (controllerLink && sourceLink.store.getUsedCapacity(RESOURCE_ENERGY) > 700 && controllerLink.store.getFreeCapacity(RESOURCE_ENERGY) >= 400) {
            sourceLink.transferEnergy(controllerLink)
            continue;
        }

        if (storageLink && sourceLink.store.getUsedCapacity(RESOURCE_ENERGY) > 700 && storageLink.store.getFreeCapacity(RESOURCE_ENERGY) >= 400) {

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

    const terminal = this.terminal
    if (!terminal) {
        return
    }

    if (this.controller.level < 8 && this.operateBoostLaborer() !== ERR_NOT_ENOUGH_RESOURCES) {
        return
    }

    if (!data.okCPU) {
        return
    }

    if (!this.labs) {
        return
    }

    if (this.memory.boost) {
        return this.operateBoost()
    }

    const labTargetCompound = this.getLabTargetCompound()
    if (labTargetCompound) {
        const formula = COMPOUNDS_FORMULA[labTargetCompound]
        return this.operateLab(formula.resourceType0, formula.resourceType1)
    }
}

Room.prototype.manageFactory = function () {
    const factory = this.structures.factory[0]

    if (!factory || !this.terminal || !this.closeHighways.length) {
        return
    }

    this.factoryDistribution()

    const factoryTarget = this.getFactoryTarget()

    if (factoryTarget) {
        this.operateFactory(factoryTarget)
    }
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
        const i = OVERLORD.myRooms.indexOf(this)
        this.visual.rect(0, 1.75 + i, 37, 1, { fill: 'transparent', opacity: 1, stroke: 'white' })
    }

    const controller = this.controller
    this.visual.text(`🛠️${this.laborer.numWork}/${this.maxWork}`, controller.pos.x + 0.75, controller.pos.y - 0.5, { align: 'left' })
    this.visual.text(`🔄${Math.round(100 * controller.progress / controller.progressTotal)}%`, controller.pos.x + 0.75, controller.pos.y + 0.5, { align: 'left' })

    if (this.storage) {
        this.visual.text(` 🔋${Math.floor(this.storage.store.getUsedCapacity(RESOURCE_ENERGY) / 1000)}K`, this.storage.pos.x - 2.9, this.storage.pos.y, { font: 0.5, align: 'left' })
    }
}