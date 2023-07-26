global.info = function () {
    if (data.info) {
        data.info = false
        return 'hide info'
    } else {
        data.info = true
        return 'show info'
    }
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

global.cleanRoomMemory = function () {
    const colonyList = []
    for (const myRoom of OVERLORD.myRooms) {
        if (!myRoom.memory.colony) {
            continue
        }
        for (const colonyName of Object.keys(myRoom.memory.colony)) {
            colonyList.push(colonyName)
        }
    }
    if (colonyList.length) {
        data.recordLog(`number of colony: ${colonyList.length}`)
        data.recordLog(`list of colony: ${colonyList}`)
    }
    Object.keys(Memory.rooms).forEach( //메모리에 있는 방이름마다 검사
        function (roomName) {
            if (!Game.rooms[roomName] && !colonyList.includes(roomName)) { //해당 이름을 가진 방이 존재하지 않으면
                delete Memory.rooms[roomName]; //메모리를 지운다
            }
        }
    )
    return 'cleaned room memory'
}


global.basePlan = function (roomName, numIteration = 10) {

    data.observe = { roomName: roomName.toUpperCase(), tick: numIteration + 5 }
    return `observe room and get basePlan ${roomName.toUpperCase()} start`
}

global.observeRoom = function (roomName, tick) {

    new RoomVisual().text(`ticks left: ${tick}`, 25, 45)
    data.observe.tick--

    const room = Game.rooms[roomName]

    if (tick <= 0) {
        data.info = true
        if (room && !room.isMy) {
            delete room.memory
            delete room.heap
        }
        delete data.observe
        return
    }

    data.info = false
    const observer = OVERLORD.structures.observer.find(observer => Game.map.getRoomLinearDistance(observer.room.name, roomName) <= 10)
    if (observer) {
        observer.observeRoom(roomName)
    }

    if (!room) {
        return
    }

    if (tick <= 5) {
        Game.rooms[roomName].visualizeBasePlan()
        return
    }

    Game.rooms[roomName].optimizeBasePlan(tick)
    return
}

global.getMaximumPoint = function (array, func) {
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

global.getMinimumPoint = function (array, func) {
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

global.abondon = function (roomName) {
    if (!Memory.abondon) {
        Memory.abondon = []
    }
    Memory.abondon.push(roomName)
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

global.colonize = function (colonyName, baseName) {
    colonyName = colonyName.toUpperCase()
    const base = baseName ? Game.rooms[baseName.toUpperCase()] : findClosestMyRoom(colonyName)
    if (!base || !base.isMy) {
        console.log('invalid base')
        return
    }
    baseName = base.name
    if (base.memory.colony && base.memory.colony[colonyName]) {
        return
    }

    if (Memory.rooms[colonyName]) {
        if (Memory.rooms[colonyName].host && Memory.rooms[colonyName].host !== baseName) {
            return
        }
    }

    if (!(base && base.isMy)) {
        console.log(`Base ${baseName} is not your room`)
        return
    }

    const distance = Game.map.getRoomLinearDistance(baseName, colonyName)

    if (distance > 1) {
        console.log(`Colony ${colonyName} is too far from your base ${baseName}. distance is ${distance}`)
        return
    }

    base.memory.colony = base.memory.colony || {}
    base.memory.colony[colonyName] = {}
    return
}

global.claim = function (targetRoomName, baseName) {
    targetRoomName = targetRoomName.toUpperCase()
    const base = baseName ? Game.rooms[baseName.toUpperCase()] : findClosestMyRoom(targetRoomName, 4)
    baseName = base.name
    base.memory.claimRoom = base.memory.claimRoom || {}
    base.memory.claimRoom[targetRoomName] = base.memory.claimRoom[targetRoomName] || {}
    return `${baseName} starts claim protocol to ${targetRoomName}`
}

global.classifyCreeps = function () {
    const creepAction = require('creepAction')

    if (Game._classifiedCreeps) {
        return Game._classifiedCreeps
    }
    const creeps = Object.values(Game.creeps)
    const result = {}
    for (const roomName of Object.keys(Game.rooms)) {
        result[roomName] = {}
        for (const creepRole of CREEP_ROELS) {
            result[roomName][creepRole] = []
        }
        result[roomName].wounded = []
    }
    for (const creep of creeps) {
        if (creep.owner.username !== MY_NAME) {
            continue
        }

        if (!result[creep.assignedRoom]) {
            result[creep.assignedRoom] = {}
        }

        if (creep.hitsMax - creep.hits) {
            if (!result[creep.assignedRoom].wounded) {
                result[creep.assignedRoom].wounded = []
            }
            result[creep.assignedRoom].wounded.push(creep)
        }

        if (creep.memory.role) {
            if (!creep.spawning && SELF_DIRECTED_CREEP_ROELS.includes(creep.memory.role)) {
                creepAction[creep.memory.role](creep)
            }

            if (!result[creep.assignedRoom][creep.memory.role]) {
                result[creep.assignedRoom][creep.memory.role] = []
            }
            result[creep.assignedRoom][creep.memory.role].push(creep)
        }
    }
    Game._classifiedCreeps = result
    return Game._classifiedCreeps
}

global.getNumCreepsByRole = function (roomName, role) {
    const creeps = classifyCreeps()
    if (!creeps[roomName]) {
        return 0
    }
    if (!creeps[roomName][role]) {
        return 0
    }
    return creeps[roomName][role].length
}

global.getCreepsByRole = function (roomName, role) {
    const creeps = classifyCreeps()
    if (!creeps[roomName]) {
        return []
    }
    if (!creeps[roomName][role]) {
        return []
    }
    return creeps[roomName][role]
}

global.findClosestMyRoom = function (fromRoomName, level = 0) {
    const closestRoomName = Object.keys(Game.rooms).filter(roomName => roomName !== fromRoomName && Game.rooms[roomName].isMy && Game.rooms[roomName].controller.level >= level).sort((a, b) => {
        return Game.map.findRoute(fromRoomName, a, {
            routeCallback(roomName) {
                if (ROOMNAMES_TO_AVOID.includes(roomName)) {
                    return Infinity;
                }
                return 1;
            }
        }).length - Game.map.findRoute(fromRoomName, b, {
            routeCallback(roomName) {
                if (ROOMNAMES_TO_AVOID.includes(roomName)) {
                    return Infinity;
                }
                return 1;
            }
        }).length
    })[0]
    return Game.rooms[closestRoomName]
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

global.mapInfo = function () {
    const map = OVERLORD.map
    const EXPIRATION_PERIOD = 40000
    for (const roomName of Object.keys(map)) {
        try {
            const info = map[roomName]
            const center = new RoomPosition(25, 25, roomName)

            if (!info.lastScout || Game.time > info.lastScout + EXPIRATION_PERIOD) {
                delete map[roomName]
            }

            if (info.lastScout !== undefined) {
                Game.map.visual.text(`⏳${info.lastScout + EXPIRATION_PERIOD - Game.time}`, new RoomPosition(center.x - 20, center.y + 15, center.roomName), { fontSize: 7, align: 'left' })
            }

            if (info.isClaimCandidate) {
                Game.map.visual.text(`🚩`, new RoomPosition(center.x - 15, center.y, center.roomName))
            }
            if (info.isRemoteCandidate) {
                Game.map.visual.text(`⛏️`, new RoomPosition(center.x + 15, center.y, center.roomName), { align: 'left' })
            }
            if (info.inaccessible && info.inaccessible > Game.time) {
                Game.map.visual.text(`🚫${info.inaccessible - Game.time}`, new RoomPosition(center.x, center.y - 15, center.roomName), { fontSize: 7, color: '#f000ff' })
            }

            // 내 방인지 체크
            const room = Game.rooms[roomName]
            if (room && room.isMy) {
                Game.map.visual.text(`${room.controller.level}`, new RoomPosition(center.x - 18, center.y - 20, center.roomName), { fontSize: 13, color: '#74ee15' })
                if (room.memory.scout) {
                    Game.map.visual.text(`${room.memory.scout.state}`, new RoomPosition(center.x + 5, center.y - 20, center.roomName), { fontSize: 13, color: '#74ee15' })
                    if (room.memory.scout.next) {
                        Game.map.visual.line(center, new RoomPosition(25, 25, room.memory.scout.next), { color: '#ffe700', width: '2', opacity: 1 })
                        Game.map.visual.circle(new RoomPosition(25, 25, room.memory.scout.next), { fill: '#ffe700' })
                    }
                }
                continue
            }

            // host가 있는 info인지 체크. 즉 scouter가 확인한 방인지 체크
            if (!info.host) {
                continue
            }

            const hostPos = new RoomPosition(25, 25, info.host)
            Game.map.visual.line(hostPos, center, { color: '#00ffe8', width: '1', opacity: 0.2 })
            Game.map.visual.text(`🚶${info.distance}`, new RoomPosition(center.x + 15, center.y + 15, center.roomName), { fontSize: 7 })
        }
        catch (error) {
            console.log(error)
            data.recordLog(`${roomName} has error ${error}`)
            delete map[roomName]
        }

    }
}

global.resetMap = function (roomName) {
    if (roomName === undefined) {
        Memory.map = {}
        for (const myRoom of OVERLORD.myRooms) {
            delete myRoom.memory.scout
            const scouters = getCreepsByRole(myRoom.name, 'scouter')
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
        const scouter = getCreepsByRole(roomName, 'scouter')[0]
        if (scouter) {
            scouter.suicide()
        }
        return `reset map of ${roomName}`
    }
}