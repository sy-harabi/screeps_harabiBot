Overlord.findMyRoomsInRange = function (fromRoomName, range) {
  const myRooms = this.myRooms
  const myRoomsFiltered = myRooms.filter(room => {
    if (Game.map.getRoomLinearDistance(fromRoomName, room.name) > range) {
      return false
    }
    return true
  })
  return myRoomsFiltered
}

Overlord.findClosestMyRoom = function (fromRoomName, level = 0, maxRooms = 16) {
  const myRooms = Overlord.findMyRoomsInRange(fromRoomName, maxRooms)
  const myRoomsFiltered = myRooms.filter(room => {
    if (room.controller.level < level) {
      return false
    }
    if (Game.map.getRoomLinearDistance(fromRoomName, room.name) > 16) {
      return false
    }
    return true
  }, this)
  const myRoomsSorted = myRoomsFiltered.sort((a, b) => {
    const routeA = this.getRoute(fromRoomName, a.name)
    const routeB = this.getRoute(fromRoomName, b.name)
    const lengthA = routeA.length || Infinity
    const lengthB = routeB.length || Infinity
    return lengthA - lengthB
  })
  return myRoomsSorted[0]
}

Overlord.getRoute = function (startRoomName, endRoomName) {
  const route = Game.map.findRoute(startRoomName, endRoomName, {
    routeCallback(roomName, fromRoomName) {
      // 시작하는 방은 무조건 쓴다
      if (roomName === startRoomName) {
        return 1
      }

      // 목적지는 무조건 간다
      if (roomName === endRoomName) {
        return 1
      }

      // defense 있는 방이면 쓰지말자
      if (Memory.map[roomName] && Memory.map[roomName].inaccessible > Game.time && Memory.map[roomName].numTower > 0) {
        return Infinity
      }

      // 막혀있거나, novice zone이거나, respawn zone 이면 쓰지말자
      if (Game.map.getRoomStatus(roomName).status !== 'normal') {
        return Infinity
      }

      const roomCoord = roomName.match(/[a-zA-Z]+|[0-9]+/g)
      roomCoord[1] = Number(roomCoord[1])
      roomCoord[3] = Number(roomCoord[3])
      const x = roomCoord[1]
      const y = roomCoord[3]
      // highway면 cost 1
      if (x % 10 === 0 || y % 10 === 0) {
        return 1
      }

      // 내가 쓰고 있는 방이면 cost 1
      const isMy = Game.rooms[roomName] && (Game.rooms[roomName].isMy || Game.rooms[roomName].isMyRemote)
      if (isMy) {
        return 1
      }

      // 다른 경우에는 cost 2.5
      return 2.5;
    }
  })
  return route
}