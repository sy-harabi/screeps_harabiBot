Object.defineProperties(Room.prototype, {
    specialty: {
        get() {
            if (this.memory.specialty) {
                return this.memory.specialty
            }

            const roomCoord = this.name.match(/[a-zA-Z]+|[0-9]+/g)
            if (roomCoord[0] === 'E') {
                if (roomCoord[2] === 'S') {
                    this.memory.specialty = 'biological'
                    return this.memory.specialty
                }
                this.memory.specialty = 'mystical '
                return this.memory.specialty
            }

            if (roomCoord[2] === 'S') {
                this.memory.specialty = 'mechanical'
                return this.memory.specialty
            }
            this.memory.specialty = 'electronical'
            return this.memory.specialty
        }
    },
    specialtyCommodities: {
        get() {
            return FACTORY_OBJECTIVES[this.specialty]
        }
    },
    factoryFinalObjective: {
        get() {
            if (this.memory.factoryFinalObjective) {
                return this.memory.factoryFinalObjective
            }

            if (!this.closeHighways.length) {
                return null
            }

            const factory = this.structures.factory[0]
            if (!factory) {
                return null
            }

            let level = 0
            this.memory.factoryFinalObjective = this.specialtyCommodities[level]
        }
    }
    , factoryObjective: {
        get() {
            if (this.memory.factoryObjective) {
                return this.memory.factoryObjective
            }

            this.memory.factoryObjective = this.factoryFinalObjective

            return this.memory.factoryFinalObjective
        }
    }
})

Room.prototype.factoryDistribution = function () {
    const factory = this.structures.factory[0]
    const terminal = this.terminal
    const finalCommodity = this.factoryFinalObjective
    const rawCommodity = this.specialtyCommodities[6]
    const researcher = this.creeps.researcher[0]

    const RAW_COMMODITIES_AMOUNT_TO_KEEP = 10000

    for (const resourceType of Object.keys(factory.store)) {
        if (RAW_RESOURCES.includes(resourceType) && factory.store[resourceType] > RAW_COMMODITIES_AMOUNT_TO_KEEP * 1.1 && terminal.store.getFreeCapacity() > 10000) {
            if (!researcher) {
                this.heap.needResearcher = true
                return
            }
            return researcher.getDeliveryRequest(factory, terminal, resourceType)
        }
    }

    return

    if (factory.store[finalCommodity] >= 1000) {
        if (!researcher) {
            this.heap.needResearcher = true
            return
        }
        return researcher.getDeliveryRequest(factory, terminal, finalCommodity)
    }

    if (factory.store[rawCommodity] < 10000 && terminal.store[rawCommodity] >= 1000) {
        if (!researcher) {
            this.heap.needResearcher = true
            return
        }
        return researcher.getDeliveryRequest(terminal, factory, rawCommodity)
    }


    if (factory.store[rawCommodity] > RAW_COMMODITIES_AMOUNT_TO_KEEP * 1.1) {
        if (!researcher) {
            this.heap.needResearcher = true
            return
        }
        return researcher.getDeliveryRequest(factory, terminal, rawCommodity)
    }
}

Room.prototype.operateFactory = function (commodity) {
    if (this.memory.factoryObjectiveChecked && this.memory.factoryObjectiveChecked >= Game.time) {
        return ERR_BUSY
    }

    const factory = this.structures.factory[0]
    const terminal = this.terminal
    if (!factory || !terminal) {
        delete this.memory.factoryObjective // 이 목표는 안되는거임
        this.memory.factoryObjectiveChecked = Game.time
        return ERR_NOT_FOUND
    }
    const researcher = this.creeps.researcher[0]
    const components = FACTORY_COMPONENTS[commodity]
    const finalCommodity = this.factoryFinalObjective

    if (terminal.store[finalCommodity] > 5000) {
        delete this.memory.factoryObjective // 이 목표는 안되는거임
        this.memory.factoryObjectiveChecked = Game.time
        return ERR_FULL
    }

    for (const resourceType of Object.keys(components)) { //재료 다 있는지 확인
        if ((factory.store[resourceType]) < components[resourceType]) { //재료가 없는 상황
            if (terminal.store[resourceType] > 1000) { //터미널에 있으면 가져오자
                if (!researcher) { // researcher 없으면 생산
                    this.heap.needResearcher = true
                    return ERR_BUSY
                }
                researcher.getDeliveryRequest(terminal, factory, resourceType)
                return ERR_NOT_ENOUGH_RESOURCES
            }
            if (FACTORY_COMPONENTS[resourceType]) {
                this.memory.factoryObjective = resourceType //만들어야되는거면 그걸 목표로 삼자
                return ERR_NOT_ENOUGH_RESOURCES
            }
            delete this.memory.factoryObjective //둘다 안되면 이 목표는 안되는거임
            this.memory.factoryObjectiveChecked = Game.time
            return ERR_NOT_ENOUGH_RESOURCES
        }
    }

    const result = factory.produce(commodity)

    if (result === ERR_NOT_ENOUGH_RESOURCES) { //자원 부족해지면
        delete this.memory.factoryObjective //목표 바꿔야지
        return ERR_NOT_ENOUGH_RESOURCES
    }

    return result
}