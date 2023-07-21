Room.prototype.manageScout = function () {
  const MAX_DISTANCE = 12 // 최대 거리
  const SCOUT_INTERVAL = 20000 // scout 완료 후 얼마나 기다렸다가 다시 시작할 것인지

  if (this.controller.level < 4) {
    return
  }

  this.memory.scout = this.memory.scout || {}
  const status = this.memory.scout
  const map = OVERLORD.map

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
    return
  }

  if (status.state === 'BFS') {
    if (status.adjacents && status.adjacents.length) {
      while (status.adjacents.length > 0) {
        const adjacentName = status.adjacents.shift()
        if (map[adjacentName] && ((map[adjacentName].lastScout + SCOUT_INTERVAL) > Game.time || map[adjacentName].distance < map[status.node].distance + 1)) {
          continue
        }
        status.state = 'scout'
        status.next = adjacentName
        return
      }
    }

    while (status.queue.length > 0) {
      const node = status.queue.shift()
      if (!map[node]) {
        continue
      }
      if (map[node].distance >= MAX_DISTANCE) {
        data.recordLog(`${this.name} ends scouting. we searched everything`)
        status.nextScoutTime = Game.time + SCOUT_INTERVAL
        status.state = 'wait'
        return
      }
      if (map[node].inaccessible && map[node].inaccessible > Game.time) {
        continue
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
      while (status.adjacents.length > 0) {
        const adjacentName = status.adjacents.shift()
        if (map[adjacentName] && ((Game.time < map[adjacentName].lastScout + SCOUT_INTERVAL) || map[adjacentName].distance < map[node].distance + 1)) {
          continue
        }
        status.state = 'scout'
        status.next = adjacentName
        return
      }
    }
    data.recordLog(`${this.name} ends scouting. queue is empty`)
    status.nextScoutTime = Game.time + SCOUT_INTERVAL
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
      data.recordLog(`${this.name} scouter cannot find path to ${status.next}`)
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

function getAdjacents(roomName) {
  const describedExits = Game.map.describeExits(roomName)
  return Object.values(describedExits)
}

Room.prototype.resetScout = function () {
  const map = OVERLORD.map
  for (const roomName of Object.keys(map)) {
    if (map[roomName].host && map[roomName].host === this.name) {
      delete map[roomName]
    }
  }

  delete this.memory.scout
  const scouters = getCreepsByRole(this.name, 'scouter')
  for (const scouter of scouters) {
    scouter.suicide()
  }
}


Room.prototype.scoutRoom = function (roomName, distance) {
  const map = OVERLORD.map

  const scouters = getCreepsByRole(this.name, 'scouter')
  const scouter = scouters[0]
  if (!scouter) {
    this.requestScouter()
    return ERR_NOT_FOUND
  }
  if (scouter.spawning) {
    return ERR_NOT_FOUND
  }

  scouter.notifyWhenAttacked(false)

  if (scouter.room.name !== roomName) {
    const result = scouter.moveToRoom(roomName)
    if (result.incomplete || result === ERR_NO_PATH) {
      return ERR_NO_PATH
    }
    return ERR_NOT_FOUND
  }

  const room = Game.rooms[roomName]
  let host = this.name

  const lastScout = Game.time
  const linearDistance = Game.map.getRoomLinearDistance(this.name, roomName)

  const numSource = room.find(FIND_SOURCES).length
  const isController = room.controller ? true : false

  const isClaimed = isController && room.controller.owner && (room.controller.owner.username !== MY_NAME)
  const isReserved = isController && room.controller.reservation && !['Invader'].includes(room.controller.reservation.username)

  const numTower = room.structures.tower.filter(tower => tower.isActive()).length
  const defense = numTower > 0 ? { numTower: numTower } : undefined

  const isAccessibleToContorller = isController && (scouter.moveMy(room.controller.pos, { range: 1 }) === OK)
  const inaccessible = ((defense && (!room.isMy)) || (isController && !isAccessibleToContorller)) ? (Game.time + SCOUT_INTERVAL) : false

  const isRemoteCandidate = isAccessibleToContorller && !inaccessible && !isClaimed && !isReserved && (distance <= 1) && (numSource > 0) && !OVERLORD.colonies.includes(roomName)
  const isClaimCandidate = isAccessibleToContorller && !inaccessible && !isClaimed && !isReserved && (distance > 2) && (numSource > 1) && !OVERLORD.colonies.includes(roomName)

  if (isRemoteCandidate) {
    colonize(roomName, this.name)
  }

  if (Memory.autoClaim && isClaimCandidate && OVERLORD.myRooms.length < Game.gcl.level) {
    claim(roomName, this.name)
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

  scouter.say(`🚶${distance}`, true)

  return OK
}