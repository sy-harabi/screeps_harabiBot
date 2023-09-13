const SCOUT_INTERVAL = 20000 // scout 완료 후 얼마나 기다렸다가 다시 시작할 것인지
const NUM_REMOTE_SOURCES = {
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
  6: 4,
  7: 7,
  8: 10
}


Room.prototype.manageScout = function () {
  const MAX_DISTANCE = 12 // 최대 거리
  if (this.controller.level < 4) {
    return
  }

  this.memory.scout = this.memory.scout || {}
  const status = this.memory.scout
  const map = Overlord.map

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
    if (status.adjacents && status.adjacents.length > 0) {
      while (status.adjacents.length > 0) {
        status.next = status.adjacents.shift()
        status.state = 'scout'
        return
      }
    }

    while (status.queue.length > 0) {
      const node = status.queue.shift()
      if (!map[node]) {
        continue
      }
      if (map[node].distance >= MAX_DISTANCE) {
        status.nextScoutTime = Game.time + SCOUT_INTERVAL
        status.state = 'wait'
        return
      }
      if (map[node].inaccessible && map[node].inaccessible > Game.time) {
        continue
      }
      const thisRoomName = this.name
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

        // 이미 본거면 제외
        if (map[roomName] &&
          map[roomName].host === thisRoomName &&
          Game.time < map[roomName].lastScout + SCOUT_INTERVAL) {
          return false
        }

        // 다른 더 가까운 방에서 봤으면 제외
        if (map[roomName] &&
          map[roomName].distance &&
          map[roomName].distance < map[status.node].distance + 1) {
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
        status.next = status.adjacents.shift()
        status.state = 'scout'
        return
      }
    }
    status.nextScoutTime = Game.time + SCOUT_INTERVAL
    status.state = 'wait'
    return
  }

  if (status.state === 'scout') {
    if (!map[status.node] || map[status.node].distance === undefined || !map[status.node].host || map[status.node].host !== this.name) {
      delete status.next
      status.state = 'BFS'
      return
    }
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

function getAdjacents(roomName) {
  const describedExits = Game.map.describeExits(roomName)
  return Object.values(describedExits)
}

Room.prototype.resetScout = function () {
  const map = Overlord.map
  for (const roomName of Object.keys(map)) {
    if (map[roomName].host && map[roomName].host === this.name) {
      delete map[roomName]
    }
  }

  delete this.memory.scout
  const scouters = Overlord.getCreepsByRole(this.name, 'scouter')
  for (const scouter of scouters) {
    scouter.suicide()
  }
}


Room.prototype.scoutRoom = function (roomName, distance) {
  const map = Overlord.map

  // highway면 대충 넘기자
  const roomCoord = roomName.match(/[a-zA-Z]+|[0-9]+/g)
  roomCoord[1] = Number(roomCoord[1])
  roomCoord[3] = Number(roomCoord[3])
  const x = roomCoord[1]
  const y = roomCoord[3]
  if (x % 10 === 0 || y % 10 === 0) {
    let host = this.name

    const lastScout = Game.time

    const numSource = 0
    const isController = false

    const isClaimed = false
    const isReserved = false

    const defense = undefined

    const inaccessible = false

    const isRemoteCandidate = false
    const isClaimCandidate = false

    map[roomName] = {
      lastScout,
      numSource,
      isController,
      isClaimed,
      isReserved,
      defense,
      host,
      distance,
      isRemoteCandidate,
      isClaimCandidate,
      inaccessible
    }
    return OK
  }

  // BFS 이후에 다른방에서 정찰했고 distance가 더 작으면
  if (map[roomName] && map[roomName].distance && map[roomName].distance < distance) {
    return OK
  }

  const room = Game.rooms[roomName]
  if (!room) {
    const observer = this.structures.observer[0]
    if (observer && Game.map.getRoomLinearDistance(this.name, roomName) <= 10) {
      observer.observeRoom(roomName)
      return ERR_NOT_FOUND
    }

    const scouters = Overlord.getCreepsByRole(this.name, 'scouter')
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
      const result = scouter.moveToRoom(roomName, 1)
      if (result === ERR_NO_PATH) {
        return ERR_NO_PATH
      }
      return ERR_NOT_FOUND
    }

    return
  }

  let host = this.name

  const lastScout = Game.time
  const linearDistance = Game.map.getRoomLinearDistance(this.name, roomName)

  const numSource = room.find(FIND_SOURCES).length
  const mineralType = room.mineral.mineralType

  const isController = room.controller ? true : false

  const isClaimed = isController && room.controller.owner && (room.controller.owner.username !== MY_NAME)
  const isReserved = isController && room.controller.reservation && !['Invader', MY_NAME].includes(room.controller.reservation.username)

  const numTower = room.structures.tower.filter(tower => tower.RCLActionable).length
  const defense = numTower > 0 ? { numTower: numTower } : undefined

  const isAccessibleToContorller = room.getAccessibleToController()
  const inaccessible = ((defense && (!room.isMy)) || (isController && !isAccessibleToContorller)) ? (Game.time + SCOUT_INTERVAL) : false

  const isRemoteCandidate = isAccessibleToContorller && !inaccessible && !isClaimed && !isReserved && (numSource > 0)
  const isClaimCandidate = isAccessibleToContorller && !inaccessible && !isClaimed && !isReserved && (distance > 2) && (numSource > 1) && !Overlord.remotes.includes(roomName)

  remote: {
    // not adequate
    if (!isRemoteCandidate) {
      break remote
    }

    // too far
    if (distance > 2) {
      break remote
    }

    const infraPlan = this.getRemoteInfraPlan(roomName)

    // cannot find infraPlan
    if (infraPlan === ERR_NOT_FOUND) {
      this.abandonRemote(roomName)
      break remote
    }


    // no competition
    if (!Memory.rooms[roomName] || !Memory.rooms[roomName].host) {
      data.recordLog(`REMOTE: No host. Colonize ${room.name} with distance ${distance}`, this.name)
      colonize(roomName, this.name)
      break remote
    }

    // already my remote
    if (Memory.rooms[roomName].host === this.name) {
      break remote
    }

    // competition
    console.log(`competition for ${roomName}`)

    const roomBefore = Game.rooms[Memory.rooms[roomName].host]
    const statusBefore = roomBefore ? roomBefore.memory.remotes ? roomBefore.memory.remotes[roomName] : undefined : undefined

    if (!statusBefore) {
      console.log(`no status before`)

      data.recordLog(`REMOTE: No competition. Abandon remote ${roomName}`, roomBefore.name)
      roomBefore.abandonRemote(roomName)

      data.recordLog(`REMOTE: Colonize ${room.name} with distance ${distance}`, this.name)
      colonize(roomName, this.name)
      break remote
    }

    // calcaulate total path length

    const statusNow = this.memory.remotes ? this.memory.remotes[roomName] : undefined
    if (!statusNow) {
      console.log(`no status now`)
      this.abandonRemote(roomName)
      break remote
    }

    if (!statusBefore.infraPlan) {
      console.log(`no infraPlan before`)

      data.recordLog(`REMOTE: Abandon remote ${roomName}`, roomBefore.name)
      roomBefore.abandonRemote(roomName)

      data.recordLog(`REMOTE: Colonize ${room.name} with distance ${distance}`, this.name)
      colonize(roomName, this.name)
      break remote
    }

    if (Object.keys(statusNow.infraPlan).length < Object.keys(statusBefore.infraPlan).length) {
      console.log(`infraPlan before has more source`)
      this.abandonRemote(roomName)
      break remote
    }

    const totalPathLengthBefore = Object.values(statusBefore.infraPlan).map(value => value.pathLength).reduce((acc, curr) => acc + curr, 0)
    const totalPathLengthNow = Object.values(statusNow.infraPlan).map(value => value.pathLength).reduce((acc, curr) => acc + curr, 0)

    // compare
    if (totalPathLengthBefore <= totalPathLengthNow) {
      console.log(`infraPlan before has better plan`)
      this.abandonRemote(roomName)
      break remote
    }

    console.log(`infraPlan now has better plan`)

    data.recordLog(`REMOTE: Abandon remote ${roomName}`, roomBefore.name)
    roomBefore.abandonRemote(roomName)

    data.recordLog(`REMOTE: Colonize ${room.name} with distance ${distance}`, this.name)
    colonize(roomName, this.name)

    break remote
  }



  if (Memory.autoClaim && isClaimCandidate && Overlord.myRooms.length < Game.gcl.level) {
    claim(roomName, this.name)
  }

  // save info
  const info = {
    lastScout,
    numSource,
    mineralType,
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

  map[roomName] = map[roomName] || {}
  map[roomName] = { ...map[roomName], ...info }

  return OK
}

Room.prototype.getAccessibleToController = function () {
  const controller = this.controller
  if (!controller) {
    return false
  }
  const exits = this.find(FIND_EXIT)
  const search = PathFinder.search(
    controller.pos, exits, {
    maxRooms: 1,
    maxOps: 10000,
    roomCallback: function (roomName) {
      const room = Game.rooms[roomName]
      if (room) {
        return room.basicCostmatrix
      }
    }
  }
  )
  return !search.incomplete
}