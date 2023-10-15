const SCOUT_INTERVAL = 3000 // scout 시작 후 얼마나 지나야 리셋할건지

const DISTANCE_TO_DEPOSIT_MINING = 5

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

  this.memory.scout = this.memory.scout || {}
  const status = this.memory.scout
  const map = Overlord.map

  if (!status.startTick) {
    status.startTick = Game.time
  }

  // 5000 tick 마다 새로 정찰
  if (Game.time - status.startTick > SCOUT_INTERVAL) {
    delete this.memory.scout
  }

  if (!status.state) {
    status.state = 'init'
    return
  }

  if (status.state === 'init') {
    status.queue = new Array()
    status.queue.push(this.name)
    map[this.name] = {
      lastScout: status.startTick,
      numSource: this.sources.length,
      isController: true,
      isClaimedByOther: false,
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

        if (getRoomType(roomName) === 'sourceKeeper') {
          return false
        }

        // 이미 본거면 제외
        if (map[roomName] && map[roomName].host === thisRoomName && status.startTick <= map[roomName].lastScout) {
          return false
        }

        // 다른 더 가까운 방에서 봤으면 제외
        if (map[roomName] && map[roomName].distance && map[roomName].distance < map[status.node].distance + 1) {
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
    const result = this.scoutRoom(status.next, nodeDistance + 1, status.startTick)
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

// lastScout means status.startTick. which means tick that started scout
Room.prototype.scoutRoom = function (roomName, distance, lastScout) {
  const map = Overlord.map

  // BFS 이후에 다른방에서 정찰했고 distance가 더 작으면
  if (map[roomName] && map[roomName].distance && map[roomName].distance < distance) {
    return OK
  }

  // highway고 distance 5 초과면 봤다치자.
  if (getRoomType(roomName) === 'highway' && distance > DISTANCE_TO_DEPOSIT_MINING) {
    map[roomName] = map[roomName] || {}

    map[roomName].host = this.name
    map[roomName].distance = distance
    map[roomName].lastScout = lastScout
    map[roomName].numSource = 0
    map[roomName].isController = false
    map[roomName].isClaimedByOther = false
    map[roomName].inaccessible = false
    map[roomName].isRemoteCandidate = false
    map[roomName].isClaimCandidate = false
    return OK
  }

  const room = Game.rooms[roomName]
  if (!room) {
    return this.acquireVision(roomName)
  }

  // highway고 distance 5 이내면 deposit check.
  if (getRoomType(roomName) === 'highway' && distance <= DISTANCE_TO_DEPOSIT_MINING) {
    this.depositCheck(roomName)
  }

  const info = room.getInfo(this.name, distance, lastScout)
  map[roomName] = { ...map[roomName], ...info }

  this.tryRemote(roomName)

  if (Memory.autoClaim && map[roomName].isClaimCandidate && Overlord.myRooms.length < Game.gcl.level) {
    claim(roomName, this.name)
  }

  return OK
}

Room.prototype.tryRemote = function (roomName) {
  const info = Overlord.map[roomName]

  // not adequate
  if (!info.isRemoteCandidate) {
    return
  }

  // too far
  if (info.distance > 2) {
    return
  }

  // already my remote
  if (this.memory.remotes && Object.keys(this.memory.remotes).includes(roomName)) {
    console.log(`${roomName} is already my remote`)
    return
  }

  const roomBefore = findRemoteHost(roomName)

  // no competition
  if (!roomBefore) {

    console.log(`Try make remote ${roomName}`)

    const infraPlan = this.getRemoteInfraPlan(roomName)

    if (infraPlan === ERR_NOT_FOUND) {
      data.recordLog(`FAIL: Cannot colonize ${roomName}. cannot find infraPlan.`, this.name)
      this.abandonRemote(roomName)
      return
    }

    const spawnCapacityRatio = this.getSpawnCapacityRatio()
    if (spawnCapacityRatio > SPAWN_CAPACITY_THRESHOLD) {
      data.recordLog(`REMOTE: spawn capacity is full. do not remote ${roomName}`, roomName)
      this.abandonRemote(roomName)
      return
    }

    data.recordLog(`REMOTE: Not my remote. Colonize ${roomName} with distance ${info.distance}`, this.name)
    colonize(roomName, this.name)
    return
  }


  // competition
  console.log(`competition for ${roomName}`)

  const statusBefore = roomBefore.getRemoteStatus(roomName)

  const infraPlan = this.getRemoteInfraPlan(roomName)

  // cannot find infraPlan
  if (infraPlan === ERR_NOT_FOUND) {
    data.recordLog(`FAIL: Cannot colonize ${roomName}. cannot find infraPlan.`, this.name)
    this.abandonRemote(roomName)
    return
  }

  const spawnCapacityRatio = this.getSpawnCapacityRatio()
  if (spawnCapacityRatio > SPAWN_CAPACITY_THRESHOLD) {
    data.recordLog(`REMOTE: spawn capacity is full. do not remote ${roomName}`, roomName)
    this.abandonRemote(roomName)
    return
  }

  if (!statusBefore || !statusBefore.infraPlan) {
    console.log(`no status before`)

    data.recordLog(`REMOTE: No competition. Abandon remote ${roomName}`, roomName)
    roomBefore.abandonRemote(roomName)

    data.recordLog(`REMOTE: Colonize ${roomName} with distance ${info.distance}`, roomName)
    colonize(roomName, this.name)
    return
  }

  // compare

  const statusNow = this.getRemoteStatus(roomName)

  if (!statusNow) {
    console.log(`no status now`)
    this.abandonRemote(roomName)
    return
  }

  if (Object.keys(statusNow.infraPlan).length < Object.keys(statusBefore.infraPlan).length) {
    console.log(`infraPlan before has more source`)
    this.abandonRemote(roomName)
    return
  }

  const totalPathLengthBefore = Object.values(statusBefore.infraPlan).map(value => value.pathLength).reduce((acc, curr) => acc + curr, 0)
  const totalPathLengthNow = Object.values(statusNow.infraPlan).map(value => value.pathLength).reduce((acc, curr) => acc + curr, 0)

  // compare
  if (totalPathLengthBefore <= totalPathLengthNow) {
    console.log(`infraPlan before has better plan`)
    this.abandonRemote(roomName)
    return
  }

  console.log(`infraPlan now has better plan`)

  data.recordLog(`REMOTE: Abandon remote ${roomName}. Less efficient than ${this.name}`, roomBefore.name)
  roomBefore.abandonRemote(roomName)

  data.recordLog(`REMOTE: Colonize ${roomName} with distance ${distance}`, roomName)
  colonize(roomName, this.name)

  return
}

function findRemoteHost(remoteName) {
  for (const room of Overlord.myRooms) {
    if (room.memory.remotes && room.memory.remotes[remoteName]) {
      return room
    }
  }
  return undefined
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

Room.prototype.acquireVision = function (roomName) {
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

  if (scouter.room.name !== roomName) {
    const result = scouter.moveToRoom(roomName, 1)
    if (result === ERR_NO_PATH) {
      return ERR_NO_PATH
    }
    return ERR_NOT_FOUND
  }
}

Room.prototype.getInfo = function (host, distance, lastScout) {
  const numSource = this.find(FIND_SOURCES).length
  const mineralType = this.mineral ? this.mineral.mineralType : undefined

  const isController = this.controller ? true : false
  const isClaimedByOther = isController && this.controller.owner && (this.controller.owner.username !== MY_NAME)

  const numTower = this.structures.tower.filter(tower => tower.RCLActionable).length

  const isAccessibleToContorller = this.getAccessibleToController()
  const inaccessible = (((!this.isMy) && numTower > 0) || (isController && !isAccessibleToContorller)) ? (Game.time + 2 * SCOUT_INTERVAL) : 0

  const isRemoteCandidate = isAccessibleToContorller && inaccessible < Game.time && !isClaimedByOther && (numSource > 0)
  const isClaimCandidate = isAccessibleToContorller && inaccessible < Game.time && !isClaimedByOther && (distance > 2) && (numSource > 1) && !Overlord.remotes.includes(this.name)

  return {
    host,
    distance,
    lastScout,
    numSource,
    mineralType,
    numTower,
    isClaimedByOther,
    isRemoteCandidate,
    isClaimCandidate,
    inaccessible
  }
}