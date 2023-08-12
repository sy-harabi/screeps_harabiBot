const EXPIRATION_PERIOD = 40000

global.Overlord = {
  get map() {
    if (Game._map) {
      return Game._map
    }
    return Game._map = Memory.map = Memory.map || {}
  },
  get myRooms() {
    if (Game._myRooms) {
      return Game._myRooms
    }
    return Game._myRooms = Object.values(Game.rooms).filter(room => room.isMy).sort((a, b) => b.controller.totalProgress - a.controller.totalProgress)
  },
  get structures() {
    if (Game._structures) {
      return Game._structures
    }
    Game._structures = {}
    const overlordStructureTypes = ['terminal', 'observer']
    for (const structureType of overlordStructureTypes) {
      Game._structures[structureType] = []
    }
    for (const room of this.myRooms) {
      for (const structureType of overlordStructureTypes) {
        if (room.structures[structureType].length) {
          Game._structures[structureType].push(room.structures[structureType][0])
        }
      }

    }
    return Game._structures
  },
  get colonies() {
    if (Game._colonies) {
      return Game._colonies
    }
    Game._colonies = []
    for (const myRoom of this.myRooms) {
      if (!myRoom.memory.colony) {
        continue
      }
      for (const colonyName of Object.keys(myRoom.memory.colony)) {
        Game._colonies.push(colonyName)
      }
    }
    return Game._colonies
  },
}

Overlord.purgeMapInfo = function () {
  const map = this.map
  for (const roomName in map) {
    if (!map[roomName].lastScout || Game.time > map[roomName].lastScout + EXPIRATION_PERIOD) {
      delete map[roomName]
    }
  }
}

Overlord.mapInfo = function () {
  const map = this.map
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
        Game.map.visual.text(`🚩`, new RoomPosition(center.x - 15, center.y, center.roomName), { fontSize: 7, })
        Game.map.visual.text(`⚡${info.numSource}/2`, new RoomPosition(center.x + 12, center.y, center.roomName), { fontSize: 7, })
        Game.map.visual.text(`💎${info.mineralType}`, new RoomPosition(center.x, center.y - 15, center.roomName), { fontSize: 7, })
      } else if (info.isRemoteCandidate) {
        Game.map.visual.text(`⚡${info.numSource}/2`, new RoomPosition(center.x + 12, center.y - 15, center.roomName), { fontSize: 7, })
        Game.map.visual.text(`⛏️`, new RoomPosition(center.x - 15, center.y - 15, center.roomName), { fontSize: 7, })
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
      } else {
        Game.map.visual.text(`🚶${info.distance}`, new RoomPosition(center.x + 15, center.y + 15, center.roomName), { fontSize: 7 })
      }

      // host가 있는 info인지 체크. 즉 scouter가 확인한 방인지 체크
      if (!info.host) {
        continue
      }

      const hostPos = new RoomPosition(25, 25, info.host)
      // Game.map.visual.line(hostPos, center, { color: '#00ffe8', width: '1', opacity: 0.2 })

      const describedExits = Game.map.describeExits(roomName)
      for (const direction of ['1', '3', '5', '7']) {
        const adjacentName = describedExits[direction]
        if (describedExits[direction] && map[adjacentName] && info.host === map[adjacentName].host) {
          continue
        }
        let startPos = undefined
        let endPos = undefined
        switch (direction) {
          case '1':
            startPos = new RoomPosition(0, 0, roomName)
            endPos = new RoomPosition(49, 0, roomName)
            break
          case '3':
            startPos = new RoomPosition(49, 49, roomName)
            endPos = new RoomPosition(49, 0, roomName)
            break
          case '5':
            startPos = new RoomPosition(0, 49, roomName)
            endPos = new RoomPosition(49, 49, roomName)
            break
          case '7':
            startPos = new RoomPosition(0, 0, roomName)
            endPos = new RoomPosition(0, 49, roomName)
            break
        }
        if (!startPos || !endPos) {
          continue
        }
        Game.map.visual.line(startPos, endPos, { color: '#00ffe8', width: '2', opacity: 1 })
      }


    }
    catch (error) {
      console.log(error)
      data.recordLog(`MAP: ${error}`, roomName)
      // delete map[roomName]
    }
  }
}

Overlord.cleanRoomMemory = function () {
  const colonyList = []
  for (const myRoom of this.myRooms) {
    if (!myRoom.memory.colony) {
      continue
    }
    for (const colonyName of Object.keys(myRoom.memory.colony)) {
      colonyList.push(colonyName)
    }
  }
  Memory.info = Memory.info || {}
  Memory.info.numRemotes = colonyList.length
  Object.keys(Memory.rooms).forEach( //메모리에 있는 방이름마다 검사
    function (roomName) {
      if (!Game.rooms[roomName] && !colonyList.includes(roomName)) { //해당 이름을 가진 방이 존재하지 않으면
        delete Memory.rooms[roomName]; //메모리를 지운다
      }
    }
  )
  return 'cleaned room memory'
}

Overlord.observeRoom = function (roomName) {
  data.info = false
  const observer = this.structures.observer.find(observer => Game.map.getRoomLinearDistance(observer.room.name, roomName) <= 10)
  if (observer) {
    observer.observeRoom(roomName)
  }
}

Overlord.classifyCreeps = function () {
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

Overlord.getNumCreepsByRole = function (roomName, role) {
  const creeps = this.classifyCreeps()
  if (!creeps[roomName]) {
    return 0
  }
  if (!creeps[roomName][role]) {
    return 0
  }
  return creeps[roomName][role].length
}

Overlord.getCreepsByRole = function (roomName, role) {
  const creeps = this.classifyCreeps()
  if (!creeps[roomName]) {
    return []
  }
  if (!creeps[roomName][role]) {
    return []
  }
  return creeps[roomName][role]
}

Overlord.getCreepsByAssignedRoom = function (roomName) {
  const creeps = this.classifyCreeps()
  if (!creeps[roomName]) {
    return []
  }
  const result = []
  for (const roleName in creeps[roomName]) {
    result.push(...creeps[roomName][roleName])
  }
  return result
}

Overlord.findClosestMyRoom = function (fromRoomName, level = 0) {
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