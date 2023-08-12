global.business = {
    get profitableCompounds() {
        if (this._profitableCompounds && (Game.time - this.lastCalc) < 1000) {
            return this._profitableCompounds
        }
        this._profitableCompounds = []
        for (const resourceType of Object.keys(TIER3_COMPOUNDS)) {
            if (business.calcReturnRatioPerTickPerLevel8Room(resourceType) >= 20) {
                this._profitableCompounds.push(resourceType)
            }
        }
        data.recordLog('CALC: profitable compounds.')
        this.lastCalc = Game.time
        return this._profitableCompounds
    }
}

business.getMaxPrice = function (resourceType) {
    let history = Game.market.getHistory(resourceType)
    history = Array.isArray(history) ? history : []
    const historyPrice = history.map(dailyHistory => dailyHistory.avgPrice).sort((a, b) => b - a)
    return historyPrice[Math.floor(history.length / 10)] * 1.1
}

business.getMinPrice = function (resourceType) {
    let history = Game.market.getHistory(resourceType)
    history = Array.isArray(history) ? history : []
    const historyPrice = history.map(dailyHistory => dailyHistory.avgPrice).sort((a, b) => b - a)
    return historyPrice[history.length - 1 - Math.floor(history.length / 5)] * 0.9
}

business.getMaxBuyPrice = function (resourceType) {
    const myOrders = Object.values(Game.market.orders)
    const myOrdersId = myOrders.map(order => order.id)

    const buyOrders = Game.market.getAllOrders({ resourceType: resourceType, type: ORDER_BUY }).filter(order => !myOrdersId.includes(order.id))
    return Math.max(...buyOrders.map(order => order.price))
}

business.getMinSellPrice = function (resourceType) {
    const myOrders = Object.values(Game.market.orders)
    const myOrdersId = myOrders.map(order => order.id)

    const sellOrders = Game.market.getAllOrders({ resourceType: resourceType, type: ORDER_SELL }).filter(order => !myOrdersId.includes(order.id))
    return Math.min(...sellOrders.map(order => order.price))
}

business.getBuyPrice = function (resourceType) {
    const maximumPrice = business.getMaxPrice(resourceType)
    const minimumPrice = business.getMinPrice(resourceType)
    const maxBuyPrice = business.getMaxBuyPrice(resourceType)

    if (maxBuyPrice <= minimumPrice) {
        return minimumPrice
    }

    if (maximumPrice <= maxBuyPrice) {
        return maximumPrice
    }

    return maxBuyPrice

}

business.getSellPrice = function (resourceType) {
    if (Game.market.getHistory(resourceType).length || 0 < 10) {
        return business.getMaxBuyPrice(resourceType)
    }

    const maximumPrice = business.getMaxPrice(resourceType)
    const minimumPrice = business.getMinPrice(resourceType)
    const minSellPrice = business.getMinSellPrice(resourceType)

    if (maximumPrice < minSellPrice) {
        return maximumPrice
    }

    if (minSellPrice <= minimumPrice) {
        return minimumPrice
    }

    return minSellPrice

}

business.calcReturnRatioPerTickPerLevel8Room = function (resourceType) {
    if (!Object.keys(REACTION_TIME).includes(resourceType)) {
        return 0
    }

    const numLabs = 8
    const produceAmount = 5
    const manufactureTime = COMPOUNDS_MANUFACTURING_TIME[resourceType]

    const components = resourceType.split('').map((letter, index) => {
        if (!isNaN(letter)) {
            return resourceType[index - 1]
        } else {
            return resourceType[index]
        }
    })

    const take = business.getSellPrice(resourceType) * numLabs * produceAmount

    const numMineral = {}
    numMineral.Z = 0
    numMineral.K = 0
    numMineral.U = 0
    numMineral.L = 0
    numMineral.O = 0
    numMineral.H = 0
    numMineral.X = 0

    for (const component of components) {
        if (component === 'G') {
            numMineral.Z++
            numMineral.K++
            numMineral.U++
            numMineral.L++
            continue
        }
        numMineral[component]++
    }

    let cost = 0

    for (const mineralType of Object.keys(numMineral)) {
        if (!numMineral[mineralType]) {
            continue
        }
        cost += business.getBuyPrice(mineralType) * numMineral[mineralType]
    }

    const costForResearcher = 750 * business.getBuyPrice(RESOURCE_ENERGY) / 1500

    return ((take - cost) / manufactureTime) / costForResearcher
}

business.buy = function (resourceType, amount, roomName = undefined) {
    const energyPrice = business.getSellPrice(RESOURCE_ENERGY)
    const buyPrice = business.getBuyPrice(resourceType)

    const isIntershard = INTERSHARD_RESOURCES.includes(resourceType)

    let sellOrders = Game.market.getAllOrders({ resourceType: resourceType, type: ORDER_SELL })
    if (!isIntershard) { //전역 자원이 아니면
        const terminals = Overlord.structures.terminal.sort((a, b) => Game.map.getRoomLinearDistance(a.room.name, roomName) - Game.map.getRoomLinearDistance(b.room.name, roomName))
        for (const terminal of terminals) { // 일단 주변 방에서 받을 수 있으면 받기
            if (terminal.store[resourceType] > 4000) {
                terminal.send(resourceType, amount > 2000 ? amount : 2000, roomName)
                return 'received'
            }
        }
        function priceWithCost(order) {
            const transactionCost = Game.market.calcTransactionCost(100, roomName, order.roomName) * energyPrice / 100
            return transactionCost + order.price
        }
        sellOrders = sellOrders.sort((a, b) => priceWithCost(a) - priceWithCost(b))
    }

    const cheapestSellOrder = sellOrders[0]
    const minSellPrice = cheapestSellOrder ? priceWithCost(cheapestSellOrder) : Infinity

    //판매주문중에 제일 싼 가격이 충분히 싸면 사자
    if (minSellPrice <= 1.1 * buyPrice || minSellPrice <= 1) {
        const result = isIntershard ? Game.market.deal(cheapestSellOrder.id, amount) : Game.market.deal(cheapestSellOrder.id, amount, roomName)
        if (result === OK) {
            data.recordLog(`BUY: ${amount} ${resourceType}`, roomName)
            return 'deal from market'
        }
    }

    //그게 아니면 주문을 넣자
    const myOrders = Object.values(Game.market.orders)
    let existingOrders = []
    if (myOrders.length) {
        existingOrders = isIntershard ?
            (
                myOrders.filter(order => order.resourceType === resourceType && order.type === ORDER_BUY && order.active)
            ) : (
                myOrders.filter(order => order.roomName === roomName && order.resourceType === resourceType && order.type === ORDER_BUY && order.active)
            )
    }

    //이미 주문이 있으면 새 가격에 맞춰서 수정하자 (가격을 내리진 않는다.)
    if (existingOrders.length) {
        if (existingOrders[0].price < buyPrice) {
            Game.market.changeOrderPrice(existingOrders[0].id, buyPrice)
        }
        if (existingOrders[0].amount < amount) {
            Game.market.extendOrder(existingOrders[0].id, amount - existingOrders[0].amount)
        }
        return 'change order'
    }

    //주문이 없으면 새로 주문 넣자
    if (Game.market.createOrder({
        type: ORDER_BUY,
        resourceType: resourceType,
        price: buyPrice,
        totalAmount: amount,
        roomName: roomName
    }) === OK) {
        data.recordLog(`ORDER: Buy ${amount} ${resourceType} `, roomName)
    }
    return 'new order'
}



business.sell = function (resourceType, amount, roomName = undefined) {
    const isIntershard = INTERSHARD_RESOURCES.includes(resourceType)

    const myOrders = Object.values(Game.market.orders)
    const existingOrders = myOrders.filter(order => order.resourceType === resourceType && order.type === ORDER_SELL && order.active)

    const energyPrice = business.getSellPrice(RESOURCE_ENERGY)
    const sellPrice = business.getSellPrice(resourceType)


    let buyOrders = Game.market.getAllOrders({ resourceType: resourceType, type: ORDER_BUY })
    if (!isIntershard) { //전역 자원이 아니면
        buyOrders = buyOrders.filter(order => Game.market.calcTransactionCost(100, roomName, order.roomName) * energyPrice < 5 * sellPrice) //구매 주문중에 가까운것만 고려하기
    }
    const mostExpensiveBuyOrder = getMaximumPoint(buyOrders, order => order.price)
    const maxBuyPrice = mostExpensiveBuyOrder ? mostExpensiveBuyOrder.price : 0

    //구매주문 가격이 충분히 비싸면 바로 팔자
    if (mostExpensiveBuyOrder && (maxBuyPrice * 1.15 >= sellPrice || Game.market.credits < energyPrice * 500000)) {
        const finalAmount = Math.min(mostExpensiveBuyOrder.amount, amount)
        const result = Game.market.deal(mostExpensiveBuyOrder.id, finalAmount, roomName)
        if (result === OK) {
            data.recordLog(`SELL: ${finalAmount} ${resourceType}`, roomName)
            return true
        }
    }

    //그게 아니면 주문을 넣자. 이미 다른 방에서 올린 주문이 있으면 하지말구
    const thisRoomOrders = existingOrders.filter(order => order.roomName === roomName)
    if (!isIntershard && existingOrders.length) {
        if (!thisRoomOrders.length) {
            return false
        }
    }

    //이미 주문이 있으면 새 가격에 맞춰서 수정하자 (가격을 올리진 않는다.)
    if (existingOrders.length) {
        const thisRoomOrder = thisRoomOrders[0]
        if (thisRoomOrder.price > sellPrice) {
            Game.market.changeOrderPrice(thisRoomOrder.id, sellPrice)
        }
        if (thisRoomOrder.amount < amount) {
            Game.market.extendOrder(thisRoomOrder.id, amount - thisRoomOrder.amount)
        }
        return false
    }

    //주문이 없으면 새로 주문 넣자
    Game.market.createOrder({
        type: ORDER_SELL,
        resourceType: resourceType,
        price: sellPrice,
        totalAmount: amount,
        roomName: roomName
    })
    data.recordLog(`ORDER: Sell ${amount} ${resourceType}`, roomName)
    return false
}

business.dump = function (resourceType, amount, roomName) {
    const myOrders = Object.values(Game.market.orders)
    const myOrdersId = myOrders.map(order => order.id)

    let buyOrders = Game.market.getAllOrders({ resourceType: resourceType, type: ORDER_BUY }).filter(order => !myOrdersId.includes(order.id))
    buyOrders = buyOrders.filter(order => Game.market.calcTransactionCost(Math.min(order.amount, amount), roomName, order.roomName) < Game.rooms[roomName].terminal.store[RESOURCE_ENERGY]) //구매 주문중에 가까운것만 고려하기

    const mostExpensiveBuyOrder = getMaximumPoint(buyOrders, order => order.price)
    if (!mostExpensiveBuyOrder) {
        return false
    }
    const sellAmount = Math.min(mostExpensiveBuyOrder.amount, amount)
    const result = Game.market.deal(mostExpensiveBuyOrder.id, sellAmount, roomName)
    if (result === OK) {
        data.recordLog(`DUMP: ${sellAmount} ${resourceType}`, roomName)
        return true
    }
}