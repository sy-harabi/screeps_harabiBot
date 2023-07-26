Room.prototype.factoryDistribution = function () {
    const factory = this.structures.factory[0]
    const terminal = this.terminal
    const researcher = this.creeps.researcher[0]

    const RAW_COMMODITIES_AMOUNT_TO_KEEP = 2000
    const BASIC_REGIONAL_COMMODITIES_AMOUNT_TO_KEEP = 100

    for (const resourceType of Object.keys(factory.store)) {
        if (RAW_RESOURCES.includes(resourceType) && factory.store[resourceType] > RAW_COMMODITIES_AMOUNT_TO_KEEP * 1.1 && terminal.store.getFreeCapacity() > 10000) {
            if (!researcher) {
                this.heap.needResearcher = true
                return
            }
            return researcher.getDeliveryRequest(factory, terminal, resourceType)
        }

        if (Object.keys(BASIC_REGIONAL_COMMODITIES).includes(resourceType) && factory.store[resourceType] >= BASIC_REGIONAL_COMMODITIES_AMOUNT_TO_KEEP && terminal.store.getFreeCapacity() > 10000) {
            if (!researcher) {
                this.heap.needResearcher = true
                return
            }
            return researcher.getDeliveryRequest(factory, terminal, resourceType)
        }
    }
}

Room.prototype.operateFactory = function (target) {
    const commodity = target.commodity
    const factory = this.structures.factory[0]
    const terminal = this.terminal

    const researcher = this.creeps.researcher[0]
    const formula = FACTORY_COMPONENTS[commodity]

    if (target.amount && factory.store[commodity] >= target.amount) {
        delete this.memory.factoryTarget //목표 바꿔야지
        return ERR_FULL
    }

    if (!formula) {
        return ERR_NOT_ENOUGH_RESOURCES
    }
    for (const resourceType of Object.keys(formula)) { //재료 다 있는지 확인
        if ((factory.store[resourceType]) < formula[resourceType]) { //재료가 없는 상황
            if (terminal.store[resourceType] >= formula[resourceType] - factory.store[resourceType]) { //터미널에 있으면 가져오자
                if (!researcher) { // researcher 없으면 생산
                    this.heap.needResearcher = true
                    return ERR_BUSY
                }
                researcher.getDeliveryRequest(terminal, factory, resourceType)
                return ERR_NOT_ENOUGH_RESOURCES
            }
        }
    }

    const result = factory.produce(commodity)

    //자원 부족해지면
    if (result === ERR_NOT_ENOUGH_RESOURCES) {
        delete this.memory.factoryTarget //목표 바꿔야지
        return ERR_NOT_ENOUGH_RESOURCES
    }

    return result
}

Room.prototype.getFactoryTarget = function () {
    // 방이 내 방이 아니면 오류
    if (!this.isMy) {
        return undefined
    }
    // RCL이 6보다 낮으면 오류
    if (this.controller.level < 8) {
        return undefined
    }

    // terminal 없으면 오류
    const terminal = this.terminal
    if (!terminal) {
        return undefined
    }

    // factory 없으면 오류
    const factory = this.structures.factory[0]
    if (!factory) {
        return undefined
    }

    if (this.memory.factoryTarget !== undefined) {
        return this.memory.factoryTarget
    }

    const targetCommodities = Object.keys(BASIC_REGIONAL_COMMODITIES)
    const checked = {}

    for (const target of targetCommodities) {
        // target 부터 확인하자
        const result = this.checkCommodity(target)

        // 만들 수 있으면 만들자
        if (result === OK) {
            return this.memory.factoryTarget = { commodity: target, amount: undefined }
        }

        // 둘 다 아니면 queue에 넣고 BFS 시작
        const queue = [target]
        checked[target] = true

        // BFS
        while (queue.length > 0) {
            // queue에서 하나 빼옴
            const node = queue.shift()

            // formula 확인
            const formula = FACTORY_COMPONENTS[node]
            if (!formula) {
                continue
            }

            // node를 만드는 재료들이 adjacents
            const adjacents = Object.keys(formula)

            // 각 adjacent마다 확인
            for (const adjacent of adjacents) {

                // 이미 확인한 녀석이면 넘어가자
                if (checked[adjacent]) {
                    continue
                }

                // 충분히 있으면 넘어가자
                if (terminal.store[adjacent] + factory.store[adjacent] >= formula[adjacent]) {
                    continue
                }

                // 확인 진행하자
                const result = this.checkCommodity(adjacent)

                // 만들 수 있으면 요놈을 만들자
                if (result === OK) {
                    return this.memory.factoryTarget = { commodity: adjacent, amount: formula[adjacent] }
                }

                // 둘 다 아니면 queue에 넣고 다음으로 넘어가자
                queue.push(adjacent)
                checked[adjacent] = true
            }

            // 만들만한 게 아무것도 없었으면 다음 target으로 넘어가자
        }
    }

    //만들 게 없음
    return this.memory.factoryTarget = undefined
}

Room.prototype.checkCommodity = function (commodity) {
    const formula = FACTORY_COMPONENTS[commodity]
    if (!formula) {
        return ERR_NOT_FOUND
    }

    const terminal = this.terminal
    const factory = this.structures.factory[0]

    for (const component in formula) {
        if (factory.store[component] + terminal.store[component] >= formula[component]) {
            continue
        }
        return ERR_NOT_ENOUGH_RESOURCES
    }

    return OK
}