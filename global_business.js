const TICKS_TO_CHANGE_PRICE = 100
const CHANGE_PRICE_RATIO = 0.1

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

        let history = Game.market.getHistory('energy')
        history = Array.isArray(history) ? history : []

        if (history.length < 2) {
            return Game._energyPrice = this.getMaxBuyOrder('energy').order.price
        }

        const lastHistory = history[history.length - 2]
        return Game._energyPrice = lastHistory.avgPrice
    }
}

Business.getFinalPrice = function (order, roomName, log = false) {
    const targetRoomName = order.roomName
    const price = order.price

    if (roomName === undefined) {
        return price
    }

    const energyPrice = Business.energyPrice
    const transactionCost = Game.market.calcTransactionCost(1000, roomName, targetRoomName)
    const sign = order.type === ORDER_SELL ? 1 : -1
    const tax = sign * energyPrice * transactionCost / 1000
    if (log) {
        console.log(`price:${price}, tax:${tax}, finalPrice:${price + tax}`)
    }
    return (price + tax)
}

Business.getMaxBuyOrder = function (resourceType, roomName, log) {
    const myOrdersId = Business.myOrdersId
    const buyOrders = Game.market.getAllOrders({ resourceType: resourceType, type: ORDER_BUY }).filter(order => !myOrdersId.includes(order.id))
    const maxBuyOrder = getMaxObject(buyOrders, order => {
        order.finalPrice = Business.getFinalPrice(order, roomName, log)
        return order.finalPrice
    })
    if (maxBuyOrder === undefined) {
        return { order: undefined, finalPrice: undefined }
    }
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
    const startPrice = priceRange.avgPrice

    //check order
    const myOrders = this.myOrders
    const targetOrders = myOrders.filter(order => {
        if (order.roomName !== roomName) {
            return false
        }
        if (order.resourceType !== resourceType) {
            return false
        }
        if (order.type !== ORDER_BUY) {
            return false
        }
        return true
    })

    const currentOrder = targetOrders[0]
    const time = currentOrder ? Game.time - currentOrder.created : 0
    const priceNow = startPrice + (priceRange.max - startPrice) * Math.floor(time / TICKS_TO_CHANGE_PRICE) * CHANGE_PRICE_RATIO

    //try deal
    const minSellOrder = this.getMinSellOrder(resourceType, roomName)
    const order = minSellOrder !== undefined ? minSellOrder.order : undefined
    if (minSellOrder && minSellOrder.finalPrice <= priceNow * (1 + MARKET_FEE)) {
        const dealAmount = Math.min(amount, order.amount)
        if (Game.market.deal(order.id, amount, roomName) === OK && dealAmount === amount) {
            this.cancelAllOrder(resourceType, roomName, ORDER_BUY)
            return OK
        }
    }

    //deal at private server
    if (order && priceRange.max - priceRange.min === 0) {
        const dealAmount = Math.min(amount, order.amount)
        if (Game.market.deal(order.id, amount, roomName) === OK && dealAmount === amount) {
            this.cancelAllOrder(resourceType, roomName, ORDER_BUY)
            return OK
        }
    }

    // create order
    if (targetOrders.length === 0) {
        Game.market.createOrder({
            type: ORDER_BUY,
            resourceType: resourceType,
            price: startPrice,
            totalAmount: amount,
            roomName
        })
        return
    }

    // increase price as time goes by. take 10000 ticks from min to max.
    if (currentOrder.price < priceNow) {
        Game.market.changeOrderPrice(currentOrder.id, priceNow)
    }
}

Business.sell = function (resourceType, amount, roomName = undefined) {
    const priceRange = this.getPriceRange(resourceType)

    if (priceRange === undefined) {
        this.dump(resourceType, amount, roomName)
        return ERR_NOT_FOUND
    }

    //check order
    const myOrders = this.myOrders
    const targetOrders = myOrders.filter(order => {
        if (order.roomName !== roomName) {
            return false
        }
        if (order.resourceType !== resourceType) {
            return false
        }
        if (order.type !== ORDER_SELL) {
            return false
        }
        return true
    })

    const currentOrder = targetOrders[0]
    const time = currentOrder ? Game.time - currentOrder.created : 0
    const priceNow = priceRange.max - (priceRange.max - priceRange.avgPrice) * Math.floor(time / TICKS_TO_CHANGE_PRICE) * CHANGE_PRICE_RATIO

    //try deal
    const maxBuyOrder = this.getMaxBuyOrder(resourceType, roomName)
    const order = maxBuyOrder.order
    if (maxBuyOrder.finalPrice && maxBuyOrder.finalPrice >= priceNow * (1 - MARKET_FEE)) {
        const dealAmount = Math.min(amount, order.amount)
        if (Game.market.deal(order.id, dealAmount, roomName) === OK && dealAmount === amount) {
            this.cancelAllOrder(resourceType, roomName, ORDER_SELL)
            return OK
        }
    }

    //deal at private server
    if (order && priceRange.max - priceRange.min === 0) {
        const dealAmount = Math.min(amount, order.amount)
        if (Game.market.deal(order.id, dealAmount, roomName) === OK && dealAmount === amount) {
            this.cancelAllOrder(resourceType, roomName, ORDER_SELL)
            return OK
        }
    }

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

    // decrease price as time goes by. take 10000 ticks from min to max.
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