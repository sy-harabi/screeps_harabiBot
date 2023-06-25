global.OVERLORD = {
    get rooms() {
        return Object.values(Game.rooms).filter(room => room.isMy)
    },
    get structures() {
        this._structures = {}
        const overlordStructureTypes = ['terminal', 'observer']
        for (const structureType of overlordStructureTypes) {
            this._structures[structureType] = []
        }
        for (const room of this.rooms) {
            for (const structureType of overlordStructureTypes) {
                if (room.structures[structureType].length) {
                    this._structures[structureType].push(room.structures[structureType][0])
                }
            }
        }
        return this._structures
    },
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
    for (const myRoom of MY_ROOMS) {
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
    data.observe.tick--

    const room = Game.rooms[roomName]
    if (tick < 0) {
        if (room && !room.isMy) {
            delete room.memory
            delete room.heap
        }
        delete data.observe
        return
    }

    new RoomVisual().text(`ticks left: ${tick}`, 25, 25)

    const observer = OVERLORD.structures.observer.find(observer => Game.map.getRoomLinearDistance(observer.room.name, roomName) <= 10)
    if (observer) {
        observer.observeRoom(roomName)
    }

    if (!room) {
        return
    }

    if (tick < 5) {
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

global.colonize = function (baseName, colonyName) {

    baseName = baseName.toUpperCase()
    colonyName = colonyName.toUpperCase()
    const base = Game.rooms[baseName.toUpperCase()]
    delete base.memory.colony
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