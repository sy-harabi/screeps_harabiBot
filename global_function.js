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

global.basePlan = function (roomName, numIteration = 10) {

    data.observe = { roomName: roomName.toUpperCase(), tick: numIteration + 5 }
    return `observe room and get basePlan ${roomName.toUpperCase()} start`
}

global.getMaxObject = function (array, func) {
    if (!array.length) {
        return undefined
    }
    let maximumPoint = array[0]
    for (const point of array) {
        if (func(point) > func(maximumPoint)) {
            maximumPoint = point
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
    if (!data.cpu) {
        data.cpu = Game.cpu.getUsed()
    }
    const cpu = Game.cpu.getUsed()
    const cpuUsed = cpu - data.cpu
    if (cpuUsed > 1) {
        console.log(`tick: ${Game.time} | name: ${name} | used: ${cpuUsed} at `)
    }
    data.cpu = cpu
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