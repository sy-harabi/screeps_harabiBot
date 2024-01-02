const MinHeap = require("./util_min_heap")

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

Overlord.findPath = function (startPos, goals, options = {}) {
  const defaultOptions = { ignoreCreeps: true, staySafe: false, ignoreMap: 1, visualize: false, moveCost: 0.5 }

  const mergedOptions = { ...defaultOptions, ...options }

  const { ignoreCreeps, staySafe, ignoreMap, visualize, moveCost } = mergedOptions

  const mainTargetPos = goals[0].pos
  const targetRoomName = mainTargetPos.roomName

  const maxRooms = startPos.roomName === targetRoomName ? 1 : 16

  let routes = [[startPos.roomName]]
  if (maxRooms > 1) {
    if (ignoreMap === 0 && Memory.map[targetRoomName] && Memory.map[targetRoomName].inaccessible > Game.time) {
      return ERR_NO_PATH
    }

    routes = this.findRoutesWithPortal(startPos.roomName, targetRoomName, ignoreMap)
  }

  const result = []
  let posNow = startPos
  while (routes.length > 0) {
    const routeNow = routes.shift()
    const routeNowLastRoomName = routeNow[routeNow.length - 1]

    const routeNext = routes[0]
    const toPortal = !!routeNext

    const goalsNow = toPortal > 0 ? getPortalPositions(routeNowLastRoomName, routeNext[0]) : goals

    const maxRoomsNow = routeNow.length

    const search = PathFinder.search(posNow, goalsNow, {
      plainCost: Math.max(1, Math.ceil(2 * moveCost)),
      swampCost: Math.max(1, Math.ceil(10 * moveCost)),
      roomCallback: function (roomName) {
        // route에 있는 방만 써라
        if (routeNow !== undefined && !routeNow.includes(roomName)) {
          return false
        }

        // 방 보이는지 확인
        const room = Game.rooms[roomName]

        // 방 안보이면 기본 CostMatrix 쓰자
        if (!room) {
          const roomType = getRoomType(roomName)
          if (['highway', 'crossing'].includes(roomType)) {
            const memory = Memory.rooms[roomName]

            if (!memory) {
              return
            }

            if (!memory.portalInfo) {
              return
            }

            const portalPositions = Object.keys(memory.portalInfo)

            const costs = new PathFinder.CostMatrix
            for (const packed of portalPositions) {
              const parsed = parseCoord(packed)
              costs.set(parsed.x, parsed.y, 255)
            }
            return costs
          }
          return
        }

        // staySafe가 true면 defenseCostMatrix 사용. 아니면 basicCostmatrix 사용.
        let costs = (startPos.rooName === roomName && staySafe) ? room.defenseCostMatrix.clone() : room.basicCostmatrix.clone()
        // 방 보이고 ignoreCreeps가 false고 지금 이 방이 creep이 있는 방이면 creep 위치에 cost 255 설정
        if (ignoreCreeps !== true && thisCreep.room.name === roomName) {
          const creepCost = ignoreCreeps === false ? 255 : ignoreCreeps
          for (const creep of thisCreep.room.find(FIND_CREEPS)) {
            costs.set(creep.pos.x, creep.pos.y, creepCost)
          }
          for (const powerCreep of thisCreep.room.find(FIND_POWER_CREEPS)) {
            costs.set(powerCreep.pos.x, powerCreep.pos.y, creepCost)
          }
        }

        return costs
      },
      maxRooms: maxRoomsNow,
      maxOps: maxRoomsNow > 1 ? 40000 : 1000
    })
    if (search.incomplete) {
      return ERR_NO_PATH
    }
    result.push(...search.path)
    if (toPortal) {
      const portalInfo = Memory.rooms[routeNowLastRoomName].portalInfo
      const lastPos = result[result.length - 1]

      for (const pos of lastPos.getAtRange(1)) {
        const packed = packCoord(pos.x, pos.y)
        const info = portalInfo[packed]
        if (!info) {
          continue
        }
        const parsed = parseCoord(info.packed)
        const destination = new RoomPosition(parsed.x, parsed.y, info.roomName)
        result.push(pos)
        posNow = destination
      }
    }
  }

  Game.map.visual.poly(result)

  return result
}

function getPortalPositions(roomName, toRoomName) {
  const memory = Memory.rooms[roomName]
  if (!memory) {
    return []
  }
  const portalInfo = memory.portalInfo
  if (!portalInfo) {
    return []
  }
  const positions = []
  for (const packed in portalInfo) {
    const destinationRoomName = portalInfo[packed].roomName
    if (destinationRoomName !== toRoomName) {
      continue
    }
    const parsed = parseCoord(packed)
    const pos = new RoomPosition(parsed.x, parsed.y, roomName)
    positions.push(pos)
  }
  return positions.map(pos => { return { pos, range: 1 } })
}

Overlord.findRoutesWithPortal = function (startRoomName, goalRoomName, ignoreMap = 1) {
  const costs = {}
  costs[startRoomName] = 0

  const previous = []
  const queue = new MinHeap(roomName => costs[roomName])
  const portalSet = {}

  queue.insert(startRoomName)

  while (queue.getSize() > 0) {
    const current = queue.remove()

    if (current === goalRoomName) {
      break
    }

    const currentCost = costs[current]

    if (currentCost > 25) {
      return ERR_NO_PATH
    }

    const neighbors = Object.values(Game.map.describeExits(current))
    const portalInfo = Memory.rooms[current] ? Memory.rooms[current].portalInfo : undefined
    if (portalInfo) {
      const portals = Object.values(portalInfo)
      const roomName = portals[0] ? portals[0].roomName : undefined
      if (roomName) {
        neighbors.push(roomName)
      }
      portalSet[current] = roomName
    }

    for (const neighbor of neighbors) {
      const cost = getRoomCost(startRoomName, goalRoomName, neighbor, ignoreMap)
      const afterCost = currentCost + cost
      const beforeCost = costs[neighbor] !== undefined ? costs[neighbor] : Infinity
      if (afterCost < beforeCost) {
        costs[neighbor] = afterCost
        previous[neighbor] = current
        queue.insert(neighbor)
      }
    }
  }

  if (!previous[goalRoomName]) {
    return ERR_NO_PATH
  }

  let now = goalRoomName
  const result = [[goalRoomName]]

  while (true) {
    const prev = previous[now]

    if (!prev) {
      break
    }

    if (portalSet[prev] === now) {
      result.unshift([prev])
      now = prev
      continue
    }
    result[0].unshift(prev)
    now = prev
  }
  return result
}

function getRoomCost(startRoomName, goalRoomName, roomName, ignoreMap = 1) {
  if (roomName === startRoomName) {
    return 1
  }
  if (ignoreMap >= 1 && roomName === goalRoomName) {
    return 1
  }

  const room = Game.rooms[roomName]

  if (room && (room.isMy || room.isMyRemote)) {
    return 1
  }

  const info = Memory.map[roomName]

  if (info && allies.includes(info.owner)) {
    return 1
  }

  const inaccessible = info ? info.inaccessible : undefined
  if (ignoreMap < 2 && inaccessible && inaccessible > Game.time) {
    return Infinity
  }

  if (info && info.numTower > 0) {
    return Infinity
  }

  const status = Game.map.getRoomStatus(roomName)

  if (status && status.status !== 'normal') {
    return Infinity
  }

  const roomType = getRoomType(roomName)

  if (['highway', 'crossing'].includes(roomType)) {
    return 1
  }

  return 2.5
}