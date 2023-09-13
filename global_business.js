const profiler = require('screeps-profiler');

global.Business = {
    get myOrders() {
        if (Game._myOrders) {
            return Game._myOrders
        }
        const myOrders = Object.values(Game.market.orders)
        return Game._myOrders = myOrders
    },
    get myOrdersId() {
        if (Game._myOrdersId) {
            return Game._myOrdersId
        }
        const myOrdersId = this.myOrders.map(order => order.id)
        return Game._myOrdersId = myOrdersId
    },
    get energyPrice() {
        if (Game._energyPrice) {
            return Game._energyPrice
        }
        const history = Game.market.getHistory('energy')
        if (history.length < 2) {
            return Game._energyPrice = this.getMaxBuyOrder('energy').order.price
        }
        const lastHistory = history[history.length - 2]
        return Game._energyPrice = lastHistory.avgPrice
    }
}

Business.getFinalPrice = function (order, roomName) {
    const targetRoomName = order.roomName
    const price = order.price

    if (roomName === undefined) {
        return price
    }

    const energyPrice = Business.energyPrice
    const transactionCost = Game.market.calcTransactionCost(1000, roomName, targetRoomName)
    const sign = order.type === ORDER_SELL ? 1 : -1
    return (price + sign * energyPrice * transactionCost / 1000).toFixed(2)
}

Business.getMaxBuyOrder = function (resourceType, roomName) {
    const myOrdersId = Business.myOrdersId
    const buyOrders = Game.market.getAllOrders({ resourceType: resourceType, type: ORDER_BUY }).filter(order => !myOrdersId.includes(order.id))
    const maxBuyOrder = getMaxObject(buyOrders, order => {
        order.finalPrice = Business.getFinalPrice(order, roomName)
        return order.finalPrice
    })
    return { order: maxBuyOrder, finalPrice: maxBuyOrder.finalPrice }
}

Business.getMinSellOrder = function (resourceType, roomName) {
    const myOrdersId = Business.myOrdersId
    const sellOrders = Game.market.getAllOrders({ resourceType: resourceType, type: ORDER_SELL }).filter(order => !myOrdersId.includes(order.id))
    const minSellOrder = getMinObject(sellOrders, order => {
        order.finalPrice = Business.getFinalPrice(order, roomName)
        return order.finalPrice
    })
    return { order: minSellOrder, finalPrice: minSellOrder.finalPrice }
}

Business.cancelAllOrder = function (resourceType, roomName, type) {
    if (!Game.rooms[roomName] || !Game.rooms[roomName].isMy) {
        return ERR_INVALID_ARGS
    }
    const myOrders = this.myOrders
    const targetOrders = myOrders.filter(order => {
        if (type && order.type !== type) {
            return false
        }
        if (order.roomName !== roomName) {
            return false
        }
        if (order.resourceType !== resourceType) {
            return false
        }
        return true
    })
    for (const order of targetOrders) {
        Game.market.cancelOrder(order.id)
    }
    return OK
}

Business.getPriceRange = function (resourceType) {
    if (Game._priceRange && Game._priceRange[resourceType]) {
        return Game._priceRange[resourceType]
    }

    Game._priceRange = Game._priceRange || {}

    let history = Game.market.getHistory(resourceType)
    history = Array.isArray(history) ? history : []

    if (history.length < 2) {

        return Game._priceRange[resourceType] = undefined
    }

    const lastHistory = history[history.length - 2]
    const avgPrice = lastHistory.avgPrice
    const min = avgPrice - lastHistory.stddevPrice
    const max = avgPrice + lastHistory.stddevPrice
    return Game._priceRange[resourceType] = { min, avgPrice, max }
}

Business.buy = function (resourceType, amount, roomName) {
    const priceRange = this.getPriceRange(resourceType)

    if (priceRange === undefined) {
        return ERR_NOT_FOUND
    }

    //try deal
    const minSellOrder = this.getMinSellOrder(resourceType, roomName)
    const order = minSellOrder !== undefined ? minSellOrder.order : undefined
    if (minSellOrder && minSellOrder.finalPrice <= priceRange.avgPrice * (1 + MARKET_FEE)) {
        const dealAmount = Math.min(amount, order.amount)
        if (Game.market.deal(order.id, amount, roomName) === OK && dealAmount === amount) {
            this.cancelAllOrder(resourceType, roomName, ORDER_BUY)
            return OK
        }
    }

    //create or change order
    const myOrders = this.myOrders
    const targetOrders = myOrders.filter(order => {
        if (order.type !== ORDER_BUY) {
            return false
        }
        if (order.resourceType !== resourceType) {
            return false
        }
        return true
    })

    // create order
    if (targetOrders.length === 0) {
        Game.market.createOrder({
            type: ORDER_BUY,
            resourceType: resourceType,
            price: priceRange.min,
            totalAmount: amount,
            roomName
        })
        return
    }

    // change order
    const currentOrder = targetOrders[0]
    const time = Game.time - currentOrder.created

    // increase price as time goes by. take 10000 ticks from min to max.
    const priceNow = (priceRange.min + (priceRange.max - priceRange.min) * Math.floor(time / 100) / 100).toFixed(2)
    if (currentOrder.price < priceNow) {
        Game.market.changeOrderPrice(currentOrder.id, priceNow)
    }
}

Business.sell = function (resourceType, amount, roomName = undefined) {
    const priceRange = this.getPriceRange(resourceType)

    if (priceRange === undefined) {
        return ERR_NOT_FOUND
    }

    //try deal
    const maxBuyOrder = this.getMaxBuyOrder(resourceType, roomName)
    const order = maxBuyOrder.order
    if (maxBuyOrder.finalPrice >= priceRange.avgPrice * (1 - MARKET_FEE)) {
        const dealAmount = Math.min(amount, order.amount)
        if (Game.market.deal(order.id, dealAmount, roomName) === OK && dealAmount === amount) {
            this.cancelAllOrder(resourceType, roomName, ORDER_SELL)
            return OK
        }
    }

    //check order
    const myOrders = this.myOrders
    const targetOrders = myOrders.filter(order => {
        if (order.type !== ORDER_SELL) {
            return false
        }
        if (order.resourceType !== resourceType) {
            return false
        }
        return true
    })

    // create order
    if (targetOrders.length === 0) {
        Game.market.createOrder({
            type: ORDER_SELL,
            resourceType: resourceType,
            price: priceRange.max,
            totalAmount: amount,
            roomName
        })
        return
    }

    // change order
    const currentOrder = targetOrders[0]
    const time = Game.time - currentOrder.created

    // decrease price as time goes by. take 10000 ticks from min to max.
    const priceNow = (priceRange.max - (priceRange.max - priceRange.min) * Math.floor(time / 100) / 100).toFixed(2)
    if (currentOrder.price > priceNow) {
        Game.market.changeOrderPrice(currentOrder.id, priceNow)
        return
    }
}

Business.dump = function (resourceType, amount, roomName) {

    const maxBuyOrder = this.getMaxBuyOrder(resourceType, roomName)
    const order = maxBuyOrder.order
    if (!order) {
        return false
    }
    const sellAmount = Math.min(order.amount, amount)
    const result = Game.market.deal(order.id, sellAmount, roomName)
    if (result === OK) {
        return true
    }
    return result
}

profiler.registerObject(Business, 'Business')