global.getRoomType = function (roomName) {
    const roomCoord = getRoomCoord(roomName)
    const x = roomCoord.x
    const y = roomCoord.y
    if (x % 10 === 0 || y % 10 === 0) {
        return 'highway'
    }

    if (x < 4 || x > 6 || y < 4 || y > 6) {
        return 'normal'
    }

    return 'sourceKeeper'
}

global.getRoomCoord = function (roomName) {
    roomName = roomName.name || roomName
    const roomCoord = roomName.match(/[a-zA-Z]+|[0-9]+/g)
    roomCoord[1] = Number(roomCoord[1])
    roomCoord[3] = Number(roomCoord[3])
    const x = roomCoord[1]
    const y = roomCoord[3]
    return { x, y }
}

global.isValidCoord = function (x, y) {
    if (x < 1) {
        return false
    }
    if (x > 48) {
        return false
    }
    if (y < 1) {
        return false
    }
    if (y > 48) {
        return false
    }
    return true
}

global.packCoord = function (x, y) {
    return 50 * y + x
}
global.parseCoord = function (packed) {
    const x = packed % 50
    const y = (packed - x) / 50
    return { x, y }
}

global.info = function () {
    if (data.info) {
        data.info = false
        return 'hide info'
    } else {
        data.info = true
        return 'show info'
    }
}

Memory.autoClaim

global.autoClaim = function () {
    if (Memory.autoClaim) {
        Memory.autoClaim = false
        return 'deactivate automated claim'
    } else {
        Memory.autoClaim = true
        return 'atcivate automated claim'
    }
}

global.basePlan = function (roomName, numIteration = 10) {

    data.observe = { roomName: roomName.toUpperCase(), tick: numIteration + 5 }
    return `observe room and get basePlan ${roomName.toUpperCase()} start`
}

/**
 * 
 * @param {array} array - array of object 
 * @param {function} func - function to calculate value 
 * @returns - object which has maximum function value. undefined if array is empty
 */
global.getMaxObject = function (array, func) {
    if (!array.length) {
        return undefined
    }
    let maximumPoint = array[0]
    let maximumValue = func(maximumPoint)
    for (const point of array) {
        const value = func(point)
        if (value > maximumValue) {
            maximumPoint = point
            maximumValue = value
        }
    }
    return maximumPoint
}

global.getMinObject = function (array, func) {
    if (!array.length) {
        return undefined
    }
    let minimumPoint = array[0]
    for (const point of array) {
        if (func(point) < func(minimumPoint)) {
            minimumPoint = point
        }
    }
    return minimumPoint
}

global.abandon = function (roomName) {
    if (!Memory.abandon) {
        Memory.abandon = []
    }
    Memory.abandon.push(roomName)
}

global.checkCPU = function (name) {
    if (!Game._cpu) {
        Game._cpu = Game.cpu.getUsed()
    }

    if (!name) {
        Game._cpu = Game.cpu.getUsed()
        return
    }

    const cpu = Game.cpu.getUsed()
    const cpuUsed = cpu - Game._cpu
    if (cpuUsed > 0) {
        console.log(`tick: ${Game.time} | name: ${name} | used: ${cpuUsed} at `)
    }
    Game._cpu = cpu
}

global.colonize = function (remoteName, baseName) {
    remoteName = remoteName.toUpperCase()
    const base = baseName ? Game.rooms[baseName.toUpperCase()] : Overlord.findClosestMyRoom(colonyName, 4)
    if (!base || !base.isMy) {
        console.log('invalid base')
        return
    }

    const distance = Game.map.getRoomLinearDistance(baseName, remoteName)

    if (distance > 2) {
        console.log(`Remote ${remoteName} is too far from your base ${baseName}. distance is ${distance}`)
        return
    }

    base.memory.remotes = base.memory.remotes || {}
    base.memory.remotes[remoteName] = base.memory.remotes[remoteName] || {}

    Memory.rooms[remoteName] = Memory.rooms[remoteName] || {}
    Memory.rooms[remoteName].host = base.name

    console.log(`${baseName} colonize ${remoteName}. distance is ${distance}`)
    return OK
}

global.claim = function (targetRoomName, baseName) {
    targetRoomName = targetRoomName.toUpperCase()
    const base = baseName ? Game.rooms[baseName.toUpperCase()] : Overlord.findClosestMyRoom(targetRoomName, 4)
    baseName = base.name
    base.memory.claimRoom = base.memory.claimRoom || {}
    base.memory.claimRoom[targetRoomName] = base.memory.claimRoom[targetRoomName] || {}
    return `${baseName} starts claim protocol to ${targetRoomName}`
}

global.cancleAllClaim = function () {
    const myRooms = Overlord.myRooms
    for (const room of myRooms) {
        delete room.memory.claimRoom
    }
}

global.visual = function () {
    if (data.visualize) {
        data.visualize = false
        data.info = true
        return "hide basePlan"
    }
    data.visualize = true
    data.info = false
    return "show basePlan"
}

global.resetMap = function (roomName) {
    if (roomName === undefined) {
        Memory.map = {}
        for (const myRoom of Overlord.myRooms) {
            delete myRoom.memory.scout
            const scouters = Overlord.getCreepsByRole(myRoom.name, 'scouter')
            for (const scouter of scouters) {
                scouter.suicide()
            }
        }
        return 'reset map'
    } else {
        roomName = roomName.toUpperCase()
        const room = Game.rooms[roomName]
        if (!room || !room.isMy) {
            return 'invalid roomName'
        }
        Memory.map = Memory.map || {}
        const map = Memory.map
        for (const mapRoomName in Memory.map) {
            const roomInfo = map[mapRoomName]
            if (roomInfo && roomInfo.host === roomName) {
                delete map[mapRoomName]
            }
        }
        delete room.memory.scout
        const scouter = Overlord.getCreepsByRole(roomName, 'scouter')[0]
        if (scouter) {
            scouter.suicide()
        }
        return `reset map of ${roomName}`
    }
}

global.link = function () {
    for (const myRoom of Overlord.myRooms) {
        console.log(myRoom.hyperLink)
    }
}

global.mapInfo = function () {
    Memory.showMapInfo = (Memory.showMapInfo || 0) ^ 1
    if (Memory.showMapInfo === 1) {
        Memory.mapInfoTime = Game.time
    }
    return `show map visual : ${Memory.showMapInfo}`
}

global.sieze = function (roomName, ticks = 3000) {
    roomName = roomName.toUpperCase()
    const name = `${roomName} seize ${Game.time}`

    const endTick = Game.time + ticks

    const pos = new RoomPosition(25, 25, roomName)

    if (!pos) {
        return
    }

    pos.createFlag(name)

    Memory.flags = Memory.flags || {}
    Memory.flags[name].endTick = endTick

    return
}

global.logSend = function (resourceType) {
    const outgoingTransactions = Game.market.outgoingTransactions

    for (const transaction of outgoingTransactions) {
        if (resourceType && transaction.resourceType !== resourceType) {
            continue
        }
        console.log(`${transaction.from} sent ${transaction.amount} of ${transaction.resourceType} to ${transaction.to}`)
    }
}

