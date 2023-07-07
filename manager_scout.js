Memory.map = Memory.map || {}

function getAdjacents(roomName) {
  const describedExits = Game.map.describeExits(roomName)
  return Object.values(describedExits)
}

Room.prototype.manageScout = function () {
  const MAX_DISTANCE = 10 // 최대 거리

  if (this.controller.level < 4) {
    return
  }

  this.memory.scout = this.memory.scout || {}
  const status = this.memory.scout
  Memory.map = Memory.map || {}
  const map = Memory.map

  // 초기화 코드

  // Memory.map = {}
  // delete this.memory.scout
  // const scouters = getCreepsByRole(this.name, 'scouter')
  // for (const scouter of scouters) {
  //   scouter.suicide()
  // }
  // return


  if (!status.state) {
    status.state = 'init'
    return
  }

  if (status.state === 'init') {
    status.queue = new Array()
    status.queue.push(this.name)
    map[this.name] = {
      lastScout: Game.time,
      numSource: this.sources.length,
      isController: true,
      isClaimed: true,
      isReserved: true,
      defense: { numTower: this.structures.tower.length, owner: MY_NAME },
      host: this.name,
      linearDistance: 0,
      distance: 0,
      isRemoteCandidate: false,
      isClaimCandidate: false,
    }
    status.state = 'BFS'
    status.nextScoutTime = Game.time + 16000
    return
  }

  if (status.state === 'BFS') {
    if (status.adjacents && status.adjacents.length) {
      let next = undefined
      while (status.adjacents.length) {
        const adjacentName = status.adjacents.shift()
        if (map[adjacentName] && map[adjacentName].next > Game.time) {
          continue
        }
        next = adjacentName
        break
      }
      if (next) {
        status.state = 'scout'
        status.next = next
        return
      }
    }

    if (status.queue.length) {
      const node = status.queue.shift()
      if (map[node].distance >= MAX_DISTANCE) {
        status.state = 'wait'
        return
      }
      if (map[node] && map[node].inaccessible > Game.time) {
        return
      }
      status.node = node
      status.adjacents = getAdjacents(node).filter(function (roomName) {
        const room = Game.rooms[roomName]
        // 닫혀있거나 novice zone, respawn zone 이면 제외
        if (Game.map.getRoomStatus(roomName).status !== 'normal') {
          return false
        }

        // source keeper room은 굳이 안봐도 됨
        const roomCoord = roomName.match(/[a-zA-Z]+|[0-9]+/g)
        roomCoord[1] = Number(roomCoord[1])
        roomCoord[3] = Number(roomCoord[3])
        const x = roomCoord[1]
        const y = roomCoord[3]
        if (4 <= (x % 10) && (x % 10) <= 6 && 4 <= (y % 10) && (y % 10) <= 6) {
          return false
        }

        // 방 안보이면 정찰 대상
        if (!room) {
          return true
        }

        // 내 방이면 굳이 안봐도 됨
        if (room.isMy) {
          return false
        }

        // 내 방 아니면 정찰 대상
        return true
      })
      let next = undefined
      while (status.adjacents.length) {
        const adjacentName = status.adjacents.shift()
        if (map[adjacentName] && ((map[adjacentName].lastScout + 5000) > Game.time)) {
          continue
        }
        next = adjacentName
        break
      }
      if (next) {
        status.state = 'scout'
        status.next = next
      }
      return
    }
    status.state = 'wait'
    return
  }

  if (status.state === 'scout') {
    const nodeDistance = map[status.node].distance
    const result = this.scoutRoom(status.next, nodeDistance + 1)
    if (result === OK) {
      status.queue.push(status.next)
      delete status.next
      status.state = 'BFS'
    } else if (result === ERR_NO_PATH) {
      delete status.next
      status.state = 'BFS'
    }
    return
  }

  if (status.state === 'wait') {
    if (Game.time > status.nextScoutTime) {
      status.state = 'init'
      return
    }
    return
  }
}

Room.prototype.scoutRoom = function (roomName, distance) {
  Memory.map = Memory.map || {}
  const map = Memory.map

  const scouters = getCreepsByRole(this.name, 'scouter')
  const scouter = scouters[0]
  if (!scouter) {
    this.requestScouter()
    return ERR_NOT_FOUND
  }
  if (scouter.spawning) {
    return ERR_NOT_FOUND
  }

  if (scouter.room.name !== roomName) {
    const result = scouter.moveToRoom(roomName)
    if (result.incomplete || result === ERR_NO_PATH) {
      return ERR_NO_PATH
    }
    return ERR_NOT_FOUND
  }

  const room = Game.rooms[roomName]
  const lastScout = Game.time
  const numSource = room.find(FIND_SOURCES).length
  const isController = room.controller ? true : false
  const isClaimed = isController && room.controller.owner && (room.controller.owner.username !== MY_NAME)
  const isReserved = isController && room.controller.reservation && !['Invader'].includes(room.controller.reservation.username)
  const numTower = room.structures.tower.filter(tower => tower.isActive()).length
  const defense = numTower > 0 ? { numTower: numTower } : undefined
  const host = this.name
  const linearDistance = Game.map.getRoomLinearDistance(this.name, roomName)
  const isAccessibleToContorller = isController && (scouter.moveMy(room.controller.pos, { range: 1 }) === OK)
  const isRemoteCandidate = isAccessibleToContorller && !isClaimed && !isReserved && (distance <= 1) && (numSource > 0)
  const isClaimCandidate = isAccessibleToContorller && !isClaimed && !isReserved && (distance > 1) && (numSource > 1)
  const inaccessible = ((defense && (!room.isMy)) || (isController && !isAccessibleToContorller)) ? (Game.time + 20000) : false

  if (isRemoteCandidate) {
    colonize(roomName, this.name)
  }

  if (map[roomName] && ((map[roomName].lastScout + 5000) > Game.time) && (map[roomName].distance < distance)) {
    return OK
  }

  map[roomName] = {
    lastScout,
    numSource,
    isController,
    isClaimed,
    isReserved,
    defense,
    host,
    linearDistance,
    distance,
    isRemoteCandidate,
    isClaimCandidate,
    inaccessible
  }

  return OK
}