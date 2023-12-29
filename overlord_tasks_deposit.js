const DEPOSIT_DISTANCE_THRESHOLD = 5
const WORKER_SIZE = 15
const RETURN_RATIO = 2
const WORKER_ENERGY_COST = 3250 //15w10c25m
const NUM_LOST_CREEPS_THRESHOLD = 2

Overlord.manageDepositTasks = function () {
  const tasks = this.getTasksWithCategory('deposit')

  for (const depositRequest of Object.values(tasks)) {
    const targetRoomName = depositRequest.roomName
    const roomInCharge = Game.rooms[depositRequest.roomNameInCharge]

    if (!roomInCharge) {
      data.recordLog(`DEPOSIT: stopped deposit mining at ${targetRoomName}. no room in charge`, targetRoomName)
      this.deleteTask(depositRequest)
    }

    if (depositRequest.completed === true) {
      data.recordLog(`DEPOSIT: ${roomInCharge.name} completed DEPOSIT mining at ${targetRoomName}. returned ${depositRequest.amountReturned} ${depositRequest.depositType}`, roomInCharge.name)
      this.deleteTask(depositRequest)
      return
    }

    roomInCharge.runDepositWork(depositRequest)
    const color = resourceColor[depositRequest.depositType]
    Game.map.visual.text(`${depositRequest.depositType}`, new RoomPosition(25, 25, depositRequest.roomName), { color })
    Game.map.visual.text(`⏳${depositRequest.lastCooldown}/${depositRequest.maxCooldown}`, new RoomPosition(25, 35, depositRequest.roomName), { color, fontSize: 6 })
    Game.map.visual.line(new RoomPosition(25, 25, roomInCharge.name), new RoomPosition(25, 25, depositRequest.roomName), { color, width: 2 })
  }
}

Overlord.checkDeposits = function (targetRoomName) {
  const targetRoom = Game.rooms[targetRoomName]
  if (!targetRoom) {
    return
  }

  const roomsInRange = this.findMyRoomsInRange(targetRoomName, DEPOSIT_DISTANCE_THRESHOLD)

  const roomsSorted = roomsInRange.sort((a, b) => {
    const aDistance = Game.map.getRoomLinearDistance(targetRoomName, a.name)
    const bDistance = Game.map.getRoomLinearDistance(targetRoomName, b.name)
    return aDistance - bDistance
  })

  if (roomsSorted.length === 0) {
    return
  }

  const depositTasks = this.getTasksWithCategory('deposit')
  const deposits = targetRoom.find(FIND_DEPOSITS)

  for (const deposit of deposits) {
    for (const room of roomsSorted) {
      if (room.controller.level < 7) {
        continue
      }
      if (!room.structures.factory.length === 0) {
        continue
      }
      if (room.terminal && room.terminal.store[deposit.depositType] > 10000) {
        continue
      }
      const route = this.getRoute(targetRoomName, room.name)
      if (route === ERR_NO_PATH || route.length > DEPOSIT_DISTANCE_THRESHOLD) {
        continue
      }
      if (Object.values(depositTasks).map(task => task.roomNameInCharge).includes(room.name)) {
        `${room.name} already has deposit task`
        continue
      }
      if (room.memory.militaryThreat) {
        continue
      }
      if (room.isReactingToNukes()) {
        continue
      }
      if (room.energyLevel < 120) {
        continue
      }
      const depositRequest = new DepositRequest(room, deposit)
      const maxCooldown = room.getDepositMaxCooldown(depositRequest)
      if (depositRequest.lastCooldown >= maxCooldown) {
        continue
      }
      depositRequest.maxCooldown = maxCooldown
      Overlord.registerTask('deposit', depositRequest)
      return
    }
  }
}

Room.prototype.getDepositMaxCooldown = function (depositRequest) {
  const price = Business.getMaxBuyOrder(depositRequest.depositType, this.name).finalPrice
  const amount = WORKER_SIZE * (1500 - depositRequest.distance * 2.2)
  const cost = WORKER_ENERGY_COST * Business.energyPrice
  return Math.ceil(price * amount / cost / RETURN_RATIO)
}

const DepositRequest = function (room, deposit) {
  const factory = room.structures.factory[0]

  if (!factory) {
    return
  }

  const search = PathFinder.search(deposit.pos, { pos: factory.pos, range: 1 }, {
    plainCost: 1,
    swampCost: 5,
    roomCallback: function (roomName) {
      if (Game.rooms[roomName]) {
        return Game.rooms[roomName].basicCostmatrix
      }
      return
    },
    maxOps: 5000
  })

  const distance = search.cost

  this.category = 'deposit'
  this.id = deposit.id

  this.roomName = deposit.pos.roomName

  this.depositType = deposit.depositType
  this.depositId = deposit.id
  this.packedCoord = packCoord(deposit.pos.x, deposit.pos.y)
  this.lastCooldown = deposit.lastCooldown
  this.available = Math.min(deposit.pos.available, 3)
  this.distance = distance

  this.roomNameInCharge = room.name
  this.factoryId = factory.id
}

Room.prototype.runDepositWork = function (depositRequest) {
  const depositWorkers = Overlord.getCreepsByRole(depositRequest.depositId, 'depositWorker')
  const numDepositWorker = depositWorkers.length

  const roomName = depositRequest.roomName

  const completed = depositRequest.noMoreSpawn && depositWorkers.length === 0
  if (completed) {
    depositRequest.completed = true
    return
  }

  if (!depositRequest.noMoreSpawn) {
    const lostCreeps = depositRequest.lostCreeps || {}
    const numLostDepositWorker = lostCreeps.depositWorker || 0
    const numLostColonyDefender = lostCreeps.colonyDefender || 0

    if ((numLostColonyDefender + numLostDepositWorker) > NUM_LOST_CREEPS_THRESHOLD) {
      data.recordLog(`DEPOSIT: ${this.name} give up ${roomName}. More than ${NUM_LOST_CREEPS_THRESHOLD} Creeps are killed.`, roomName)
      depositRequest.noMoreSpawn = true
    } else if (depositRequest.lastCooldown > depositRequest.maxCooldown) {
      data.recordLog(`DEPOSIT: ${this.name} stop investing ${roomName}. Cooldown is high.`, roomName)
      depositRequest.noMoreSpawn = true
    } else if (this.memory.militaryThreat) {
      data.recordLog(`DEPOSIT: ${this.name} stop investing ${roomName}. There is Militray Threat.`, roomName)
      depositRequest.noMoreSpawn = true
    }
  }

  for (const worker of depositWorkers) {
    worker.depositWork(depositRequest)
  }

  const deposit = Game.getObjectById(depositRequest.depositId)

  if (deposit) {
    depositRequest.lastCooldown = deposit.lastCooldown
    new RoomVisual(roomName).text(`⏳${depositRequest.lastCooldown}/${depositRequest.maxCooldown}`, deposit.pos.x, deposit.pos.y - 1)
  }

  if (depositRequest.noMoreSpawn) {
    return
  }

  const distance = depositRequest.distance

  if (this.sendTroops(roomName, 10000, { distance, task: depositRequest }) === false) {
    return
  }

  if (numDepositWorker < depositRequest.available) {
    this.requestDepositWorker(depositRequest)
  }
}

Creep.prototype.depositWork = function (depositRequest) {
  if (!Game.rooms[this.memory.base]) {
    return
  }

  if (this.memory.supplying && this.store.getUsedCapacity() === 0) {
    this.memory.supplying = false

    depositRequest.amountReturned = depositRequest.amountReturned || 0
    depositRequest.amountReturned += (this.memory.amount || 0)
    delete this.memory.amount
  } else if (!this.memory.supplying && this.store.getFreeCapacity() === 0) {
    this.memory.supplying = true
  }

  const enemyCombatants = this.room.getEnemyCombatants()

  const isEnemyCombatant = enemyCombatants.length > 0
  if (isEnemyCombatant) {
    for (const combatant of enemyCombatants) {
      if (this.pos.getRangeTo(combatant.pos) < 10) {
        this.memory.supplying = true
        this.fleeFrom(combatant, 15)
        return
      }
    }
    const isDefender = this.room.getIsDefender()
    if (!isDefender) {
      if (this.store.getUsedCapacity() > 0) {
        this.memory.supplying = true

        delete this.memory.evacuate
        delete this.memory.evacuateFrom
      } else {
        this.memory.evacuate = true
        this.memory.evacuateFrom = this.room.name
      }
    }
  }

  if (this.memory.supplying) {
    if (this.room.name !== this.memory.base) {
      this.moveToRoom(this.memory.base)
      return
    }
    if (this.memory.amount === undefined) {
      this.memory.amount = this.store.getUsedCapacity(depositRequest.depositType)
    }
    if (this.store.getUsedCapacity() > 0) {
      this.returnAll()
      return
    }
    return
  }

  if (this.ticksToLive < depositRequest.distance * 1.3) {
    if (this.store.getUsedCapacity() > 0) {
      this.memory.supplying = true
      return
    } else {
      if (this.room.name !== this.memory.base) {
        this.moveToRoom(this.memory.base, 2)
        return
      }
      this.getRecycled()
      return
    }
  }

  if (this.memory.evacuate) {
    if (isEnemyCombatant) {
      this.moveToRoom(this.memory.base)
      return
    }
    const center = new RoomPosition(25, 25, this.room.name)
    if (this.pos.getRangeTo(center) > 20) {
      this.moveMy({ pos: center, range: 20 })
      return
    }
    const evacuateFrom = Game.rooms[this.memory.evacuateFrom]
    if (evacuateFrom && evacuateFrom.getEnemyCombatants().length === 0) {
      delete this.memory.evacuate
      delete this.memory.evacuateFrom
    }
    return
  }

  if (this.room.name !== depositRequest.roomName) {
    const parsed = parseCoord(depositRequest.packedCoord)
    const targetPos = new RoomPosition(parsed.x, parsed.y, depositRequest.roomName)
    if (this.moveMy({ pos: targetPos, range: 1 }) === ERR_NO_PATH) {
      depositRequest.threatLevel++
    }
    return
  }

  const deposit = Game.getObjectById(depositRequest.depositId)

  if (!deposit) {
    this.deleteDeposit(depositRequest)
  }

  const resourceType = deposit.depositType

  const tombstone = deposit.pos.findInRange(FIND_TOMBSTONES, 3).find(tombstone => tombstone.store[resourceType] > 0)

  if (tombstone) {
    if (this.pos.getRangeTo(tombstone) > 1) {
      this.moveMy({ pos: tombstone.pos, range: 1 })
      return
    }
    this.withdraw(tombstone, resourceType)
    return
  }

  const droppedResource = deposit.pos.findInRange(FIND_DROPPED_RESOURCES, 3).find(droppedResource => droppedResource.resourceType === resourceType)

  if (droppedResource) {
    if (this.pos.getRangeTo(droppedResource) > 1) {
      this.moveMy({ pos: droppedResource.pos, range: 1 })
      return
    }
    this.pickup(droppedResource)
    return
  }

  const range = this.pos.getRangeTo(deposit)
  if (range > 1) {
    const targetPos = deposit.pos.getAtRange(1).find(pos => pos.walkable && (!pos.creep || (pos.creep.my && pos.creep.memory.role !== this.memory.role)))
    if (!targetPos) {
      this.moveMy({ pos: deposit.pos, range: 3 })
      return
    }
    this.moveMy({ pos: targetPos, range: 0 })
    return
  }

  this.setWorkingInfo(deposit.pos, 1)
  this.harvest(deposit)
}