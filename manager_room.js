global.SPAWN_CAPACITY_THRESHOLD = 0.9
const SHOW_RCL_HISTORY = false

Room.prototype.runRoomManager = function () {
    if (this.abandon) {
        this.abandonRoom()
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

    this.manageInfo()
    this.manageLink()

    this.manageDefense()

    if (!this.memory.defenseNuke || this.memory.defenseNuke.state !== 'repair' || this.memory.militaryThreat) {
        this.manageWork()
    }

    // 여기서부터는 전시에는 안함
    this.heap.powerProcessing = false
    if (!this.memory.militaryThreat) {
        this.manageExtractor()
        this.manageRemotes()
        this.manageFactory()
        this.managePowerSpawn()
        this.manageScout()
        this.manageClaim()
        this.fillNuker()
        this.defenseNuke()
    }

    this.manageEnergy()
    this.manageLab() // boosting이 우선이라 밑에 둠

    this.manageSource()
    this.manageSpawn()
    this.manageVisual()
}

Room.prototype.fillNuker = function () {
    const nuker = this.structures.nuker[0]
    const terminal = this.terminal

    if (!nuker || !terminal) {
        return
    }

    if (nuker.store.getFreeCapacity(RESOURCE_ENERGY) > 0 || nuker.store.getFreeCapacity(RESOURCE_GHODIUM) === 0 || terminal.store[RESOURCE_GHODIUM] < 1000) {
        return
    }

    const researcher = this.creeps.researcher[0]

    if (!researcher) {
        this.heap.needResearcher = true
        return
    }

    researcher.getDeliveryRequest(terminal, nuker, RESOURCE_GHODIUM)

    return
}

Room.prototype.checkTombstone = function () {
    // 내 creep의 tombstone 찾자. 자연적으로 죽은 건 제외
    const myTombstones = this.find(FIND_TOMBSTONES).filter(tombstone => tombstone.creep.my && tombstone.creep.ticksToLive > 1)
    const myDefenderTombstones = myTombstones.filter(tombstone => tombstone.creep.name.split(' ')[1] === 'colonyDefender')
    // 없으면 return
    if (myTombstones.length === 0) {
        return
    }
    const map = Overlord.map

    map[this.name] = map[this.name] || {}

    // 있으면 여러가지 확인
    const hostileStructures = this.structures.tower.filter(tower => tower.RCLActionable)
    // tower 있다는건 다른 사람 방이거나 InvaderCore 있다는 뜻.
    if (hostileStructures.length) {
        map[this.name].inaccessible = Game.time + 10000
        map[this.name].lastScout = Game.time
        map[this.name].numTower = hostileStructures.length
        return
    }

    const deadDefendersId = myDefenderTombstones.map(tombstone => tombstone.creep.id)
    const attackEvents = this.getEventLog().filter(eventLog => eventLog.event === EVENT_ATTACK)

    const checked = {}
    for (const attackEvent of attackEvents) {
        const targetId = attackEvent.data.targetId

        // 내 tombstone 중에 찾아보자
        const targetTombstone = myTombstones.find(tombstone => tombstone.creep.id === targetId)

        // 안찾아지면 내 creep이 죽은 게 아님. 넘기자.
        if (!targetTombstone) {
            continue
        }

        // 여기서부터 targetTombstone은 내 creep의 tombstone임.
        const deadCreep = targetTombstone.creep
        const attacker = Game.getObjectById(attackEvent.objectId)
        const owner = attacker ? attacker.owner : undefined
        const username = owner ? owner.username : undefined

        if (!checked[deadCreep.name] && username !== 'Invader') {
            const memory = Memory.creeps[deadCreep.name]
            if (!memory || memory.role !== 'scouter') {
                data.recordLog(`KILLED: ${deadCreep.name} by ${username}`, this.name)
            }

            if (memory.task) {
                const category = memory.task.category
                const id = memory.task.id

                const task = Overlord.getTasksWithCategory(category)[id]

                if (task) {
                    task.lostCreeps = task.lostCreeps || {}
                    task.lostCreeps[memory.role] = task.lostCreeps[memory.role] || 0

                    task.lostCreeps[memory.role]++
                }
            }

            checked[deadCreep.name] = true
        }

        // 일단 죽은 건 맞으니 inaccessible 붙이자
        const TTL = attacker ? attacker.ticksToLive : 0
        map[this.name].inaccessible = map[this.name].inaccessible || Game.time
        map[this.name].inaccessible = Math.max(map[this.name].inaccessible, Game.time + TTL)
        map[this.name].lastScout = Game.time

        if (!deadDefendersId.includes(targetId)) {
            // defender가 아닐 경우 여기서 넘기자.
            continue
        }

        // 여기서부터는 defender 가 죽은거임.

        // 다시 와도 되는 시간 설정
        map[this.name].threat = map[this.name].threat || Game.time
        map[this.name].threat = Math.max(map[this.name].threat, Game.time + TTL)

        if (username !== 'Invader' && Overlord.remotes.includes(this.name)) {
            if (!deadCreep) {
                continue
            }
            if (!deadCreep.name) {
                continue
            }
            if (!Memory.creeps[deadCreep.name]) {
                continue
            }

            const baseName = Memory.creeps[deadCreep.name].base

            if (!baseName) {
                continue
            }
            const hostRoom = Game.rooms[baseName]
            if (!hostRoom) {
                continue
            }
            const cost = deadCreep.getCost()
            data.recordLog(`${deadCreep.name} killed. add cost ${cost} to the remote ${this.name}`, baseName)
            hostRoom.addRemoteThreatLevel(this.name, cost)
            return
        }
    }
}

Room.prototype.manageSource = function () {
    let sourceUtilizationRate = 0
    for (const source of this.sources) {
        if (this.memory.militaryThreat) {
            const container = source.container
            if (!container || this.defenseCostMatrix.get(container.pos.x, container.pos.y) >= DANGER_TILE_COST) {
                continue
            }
        }
        // RoomVisual
        this.visual.text(`⛏️${source.info.numWork}/6`,
            source.pos.x + 0.5, source.pos.y - 0.25,
            { font: 0.5, align: 'left' }
        )

        this.visual.text(`🚚${source.info.numCarry}/${source.info.maxCarry}`,
            source.pos.x + 0.5, source.pos.y + 0.5,
            { font: 0.5, align: 'left' }
        )

        // source 근처 energy 저장량 (container + dropped energy)
        this.visual.text(` 🔋${source.energyAmountNear}/2000`,
            source.pos.x + 0.5, source.pos.y + 1.25,
            { font: 0.5, align: 'left' }
        )

        // miner 비율 : 5 넘으면 1로 고정
        const minerRatio = Math.min(1, source.info.numWork / 5)

        // hauler 비율 : miner비율 따라간다.
        // linked여도 source 주변 에너지 많으면 maxHaluer 늘어나서 생산하게됨
        const maxCarry = Math.ceil(minerRatio * source.info.maxCarry)

        // 0/0=NAN 꼴이 나오는 걸 방지하기 위해 삼항연산자 사용.
        const haulerRatio =
            maxCarry > 0
                ? Math.min(source.info.numCarry / maxCarry, 1)
                : 1

        // minerRatio와 haulerRatio중에 작은 것이 이 souce의 utilizaitionRate
        sourceUtilizationRate += Math.min(minerRatio, haulerRatio)

        if (minerRatio === 0) {
            this.requestMiner(source, 1)
            continue
        }

        if (haulerRatio === 0) {
            this.requestHauler(source.info.maxCarry, { isUrgent: true, office: source })
            continue
        }

        if (minerRatio < 1 && source.info.numMiner < source.available) {
            this.requestMiner(source, 2)
            continue
        }

        if (haulerRatio < 1 && source.info.numHauler < source.info.maxNumHauler) {
            this.requestHauler(source.info.maxCarry - source.info.numCarry, { isUrgent: false, office: source })
            continue
        }

    }
    this.heap.sourceUtilizationRate = sourceUtilizationRate / (this.sources.length || 1) // 가동률 평균
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

Room.prototype.abandonRoom = function () {
    const terminal = this.terminal
    if (this.isMy) {
        if (terminal && terminal.cooldown < 1) {
            if (terminal.store.getUsedCapacity() < 10000 && this.storage.store.getUsedCapacity() < 10000) {
                data.recordLog(`DEPLETED`, this.name)
                terminal.pos.createFlag(`${this.name} clearAll`, COLOR_PURPLE)
                return
            }
            let onlyEnergy = true
            for (const resourceType of Object.keys(terminal.store)) {
                if (resourceType !== RESOURCE_ENERGY) {
                    if (terminal.store[RESOURCE_ENERGY] > 15000) {
                        Business.dump(resourceType, terminal.store[resourceType], this.name)
                    }
                    onlyEnergy = false
                    break
                }
            }
            if (onlyEnergy === true && terminal.store[RESOURCE_ENERGY] > 10000) {
                Business.dump(RESOURCE_ENERGY, terminal.store[RESOURCE_ENERGY] / 2 - 100, this.name)
            }
        }
    } else {
        Memory.abandon = Memory.abandon.filter(roomName => roomName !== this.name)
    }
}

Object.defineProperties(Room.prototype, {
    abandon: {
        get() {
            if (!Memory.abandon) {
                Memory.abandon = []
                return false
            }

            return Memory.abandon.includes(this.name)
        }
    },
    totalProgress: {
        get() {
            return this.controller.totalProgress
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
    const terminal = this.terminal
    if (!terminal) {
        return
    }

    if (!this.labs) {
        return
    }

    const boostRequests = Object.values(this.boostQueue)
    if (boostRequests.length > 0) {
        this.manageBoost(boostRequests)
        return
    }

    if (this.structures.lab.length < 3) {
        return
    }

    const labTarget = this.getLabTarget()
    if (labTarget) {
        const formula = COMPOUNDS_FORMULA[labTarget]
        return this.operateLab(formula.resourceType0, formula.resourceType1)
    }
}

Room.prototype.manageFactory = function () {
    const factory = this.structures.factory[0]

    if (!factory || !this.terminal) {
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

    if (!powerSpawn || !this.terminal) {
        return
    }
    if (!this.memory.operatePowerSpawn && this.energyLevel >= 200) {
        this.memory.operatePowerSpawn = true
    } else if (this.memory.operatePowerSpawn && this.energyLevel < 190) {
        this.memory.operatePowerSpawn = false
    }

    if (this.memory.operatePowerSpawn) {
        return this.operatePowerSpawn()
    }
}

Room.prototype.manageVisual = function () {
    if (data.info) {
        const i = Overlord.myRooms.indexOf(this)
        this.visual.rect(X_ENTIRE.start, 1.75 + i, X_ENTIRE.end + 0.5, 1, { fill: 'transparent', opacity: 1, stroke: 'white' })
    }

    const controller = this.controller
    if (controller.level < 8) {
        this.visual.text(`🔼${Math.round(100 * controller.progress / controller.progressTotal)}%`, controller.pos.x + 0.75, controller.pos.y + 0.5, { align: 'left' })
    }

    if (this.storage) {
        this.visual.text(` 🔋${Math.floor(this.storage.store.getUsedCapacity(RESOURCE_ENERGY) / 1000)}K`, this.storage.pos.x - 2.9, this.storage.pos.y, { font: 0.5, align: 'left' })
    }
    const GRCLhistory = this.memory.GRCLhistory
    if (SHOW_RCL_HISTORY && GRCLhistory) {
        let i = 2
        while (GRCLhistory[i] && GRCLhistory[1]) {
            this.visual.text(`got RCL${i} at tick ${GRCLhistory[i] - GRCLhistory[1]}`, 25, 25 - i)
            i++
        }
    }
}