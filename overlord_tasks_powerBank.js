const POWER_BANK_DAMAGE_THRESHOLD = 600
const POWER_BANK_DAMAGE_THRESHOLD_WITH_BOOSTED = 1920
const HAULER_CARRY_CAPACITY = 1250

const POWERBANK_DISTANCE_THRESHOLD = 5
const POWERBANK_AMOUNT_THRESHOLD = 3000

const NUM_LOST_DEFENDERS_THRESHOLD = 2

Overlord.managePowerBankTasks = function () {
  const tasks = this.getTasksWithCategory('powerBank')

  for (const powerBankRequest of Object.values(tasks)) {
    const targetRoomName = powerBankRequest.roomName
    const roomInCharge = Game.rooms[powerBankRequest.roomNameInCharge]

    if (!roomInCharge) {
      data.recordLog(`POWERBANK: stopped powerBank mining at ${targetRoomName}. no room in charge`, targetRoomName)
      this.deleteTask(powerBankRequest)
      continue
    }

    if (powerBankRequest.completed === true) {
      data.recordLog(`POWERBANK: ${roomInCharge.name} completed powerBank mining at ${targetRoomName}. returned Power: ${powerBankRequest.amountReturned || 0}/${powerBankRequest.amount}`, roomInCharge.name)
      this.deleteTask(powerBankRequest)
      continue
    }

    roomInCharge.runPowerBankRequest(powerBankRequest)
    const color = resourceColor.power
    Game.map.visual.text('power', new RoomPosition(25, 5, powerBankRequest.roomName), { color })
    Game.map.visual.line(new RoomPosition(25, 25, roomInCharge.name), new RoomPosition(25, 25, powerBankRequest.roomName), { color, width: 2 })
  }
}

Overlord.getRequiredAttackPowerForPowerBank = function (powerBankRequest) {
  if (powerBankRequest.destroyed) {
    return 0
  }

  const ticksLeft = powerBankRequest.decayTime - Game.time

  const ticksToTravel = powerBankRequest.distance
  const ticksToSpawn = CREEP_SPAWN_TIME * MAX_CREEP_SIZE
  const buffer = 200

  const ticksToPrepare = ticksToTravel + ticksToSpawn + buffer

  const ticksToAttack = ticksLeft - (powerBankRequest.duoArrived ? 0 : ticksToPrepare)

  if (ticksToAttack <= 0) {
    return Infinity
  }

  const requiredAttackPower = Math.ceil(powerBankRequest.hits / ticksToAttack)

  return requiredAttackPower
}

Room.prototype.runPowerBankRequest = function (powerBankRequest) {
  const targetRoomName = powerBankRequest.roomName
  const powerBankId = powerBankRequest.powerBankId

  const distance = powerBankRequest.distance
  const buffer = 200

  const powerBankAttackers = Overlord.getCreepsByRole(powerBankId, 'powerBankAttacker')
  const powerBankHealers = Overlord.getCreepsByRole(powerBankId, 'powerBankHealer')

  const targetRoom = Game.rooms[targetRoomName]
  const powerBank = Game.getObjectById(powerBankId)

  const haulerNeeded = powerBankRequest.haulerNeeded
  const highwayHaulers = Overlord.getCreepsByRole(targetRoomName, 'highwayHauler')

  // update powerBank hits
  if (powerBank) {
    powerBankRequest.hits = powerBank.hits
    new RoomVisual(targetRoomName).text(`⏳${powerBankRequest.remainingTicks}`, powerBank.pos.x, powerBank.pos.y - 2)
    new RoomVisual(targetRoomName).text(`🔴${powerBankRequest.amount}`, powerBank.pos.x, powerBank.pos.y - 1)
  }

  // check completed
  const completed = powerBankRequest.noMoreSpawn && powerBankAttackers.length === 0 && powerBankHealers.length === 0 && highwayHaulers.length === 0
  if (completed) {
    powerBankRequest.completed = true
    return
  }

  // check noMoreSpawn
  if (!powerBankRequest.noMoreSpawn) {
    const lostCreeps = powerBankRequest.lostCreeps || {}
    const numLostPowerBankAttacker = lostCreeps.powerBankAttacker || 0
    const numLostPowerBankHealer = lostCreeps.powerBankHealer || 0
    const numLostColonyDefender = lostCreeps.colonyDefender || 0

    if (numLostPowerBankAttacker > 0) {
      data.recordLog(`POWERBANK: ${this.name} give up ${targetRoomName}. Attacker is killed.`, targetRoomName)
      powerBankRequest.noMoreSpawn = true
    } else if (numLostPowerBankHealer > 0) {
      data.recordLog(`POWERBANK: ${this.name} give up ${targetRoomName}. Healer is killed.`, targetRoomName)
      powerBankRequest.noMoreSpawn = true
    } else if (numLostColonyDefender > NUM_LOST_DEFENDERS_THRESHOLD) {
      data.recordLog(`POWERBANK: ${this.name} give up ${targetRoomName}. More than ${NUM_LOST_DEFENDERS_THRESHOLD} Defenders are killed.`, targetRoomName)
      powerBankRequest.noMoreSpawn = true
    } else if (Game.time > powerBankRequest.decayTime) {
      data.recordLog(`POWERBANK: ${this.name} give up ${targetRoomName}. Could not destroy Power Bank.`, targetRoomName)
      powerBankRequest.noMoreSpawn = true
    } else if (this.memory.militaryThreat) {
      data.recordLog(`POWERBANK: ${this.name} give up ${targetRoomName}. There is Military Threat.`, targetRoomName)
      powerBankRequest.noMoreSpawn = true
    } else if (powerBankRequest.destroyed) {
      powerBankRequest.noMoreSpawn = true
    }

    const requiredAttackPower = Overlord.getRequiredAttackPowerForPowerBank(powerBankRequest)
    const threshold = powerBankRequest.boost ? POWER_BANK_DAMAGE_THRESHOLD_WITH_BOOSTED : POWER_BANK_DAMAGE_THRESHOLD
    if (requiredAttackPower > threshold) {
      data.recordLog(`POWERBANK: ${this.name} give up ${targetRoomName}. Too Late.`, targetRoomName)
      powerBankRequest.noMoreSpawn = true
    }
  }

  // run highwayHaulers
  for (const highwayHauler of highwayHaulers) {
    highwayHauler.highwayHaul(powerBankRequest)
  }

  // run attack heal duos
  for (const powerBankAttacker of powerBankAttackers) {
    powerBankAttacker.attackPowerBank(powerBankRequest)
  }

  // calculate remaining ticks
  const attackPower = powerBankRequest.boost ? POWER_BANK_DAMAGE_THRESHOLD_WITH_BOOSTED : POWER_BANK_DAMAGE_THRESHOLD
  const remainingTicks = Math.floor(powerBankRequest.hits / attackPower)
  powerBankRequest.remainingTicks = remainingTicks

  // if remaining ticks got sufficiently low, set true to sendHaulers
  if (!powerBankRequest.sendHaulers && remainingTicks < (distance + (Math.ceil(haulerNeeded / 3) * MAX_CREEP_SIZE * CREEP_SPAWN_TIME)) + buffer) {
    powerBankRequest.sendHaulers = true
  }

  // if powerBank is destroyed, no need to go below
  if (powerBankRequest.destroyed) {
    Game.map.visual.text(`🚚`, new RoomPosition(25, 15, targetRoomName), { fontSize: 6, color: '#f000ff' })
    return
  }

  Game.map.visual.text(`⏳:${remainingTicks} 🔴:${powerBankRequest.amount}`, new RoomPosition(25, 15, powerBankRequest.roomName), { fontSize: 6, color: '#f000ff' })

  // update destroyed
  if (targetRoom && !powerBank) {
    powerBankRequest.destroyed = true
    return
  }

  // if noMoreSpawn is true, no need to go below
  if (powerBankRequest.noMoreSpawn) {
    return
  }

  // if sendHauler checked and hauler is not enough, request.
  if (powerBankRequest.sendHaulers) {
    const haulersCarryCapacity = highwayHaulers.reduce((prev, current) => prev + current.store.getCapacity(), 0)
    if (haulersCarryCapacity < powerBankRequest.amount) {
      const numCarry = Math.max(10, Math.ceil((powerBankRequest.amount - haulersCarryCapacity) / 50))
      this.requestHighwayHauler(targetRoomName, RESOURCE_POWER, numCarry)
    }
  }

  // send attacker && healer if there isn't.
  if (powerBankAttackers.length === 0) {
    this.requestPowerBankAttacker(powerBankRequest)
  }

  if (powerBankHealers.length === 0) {
    this.requestPowerBankHealer(powerBankRequest)
  }

  // if has enough duo, don't spawn more duo / defenders
  if (powerBankRequest.hasEnoughDuo === true) {
    return
  }

  // send defenders
  if (!this.sendTroops(targetRoomName, 10000, { distance, task: powerBankRequest })) {
    return
  }

  const powerBankAttackersFiltered = powerBankAttackers.filter(creep => (creep.ticksToLive || 1500) > (buffer + distance + creep.body.length * CREEP_SPAWN_TIME))
  if (powerBankAttackersFiltered.length === 0) {
    this.requestPowerBankAttacker(powerBankRequest)
    return
  }

  const powerBankHealersFiltered = powerBankHealers.filter(creep => (creep.ticksToLive || 1500) > (buffer + distance + creep.body.length * CREEP_SPAWN_TIME))
  if (powerBankHealersFiltered.length === 0) {
    this.requestPowerBankHealer(powerBankRequest)
  }
}

Overlord.checkPowerBanks = function (targetRoomName) {
  const targetRoom = Game.rooms[targetRoomName]
  if (!targetRoom) {
    return
  }

  const powerBankTasks = this.getTasksWithCategory('powerBank')

  const roomsInRange = this.findMyRoomsInRange(targetRoomName, POWERBANK_DISTANCE_THRESHOLD)

  const roomsSorted = roomsInRange.sort((a, b) => {
    const aDistance = Game.map.getRoomLinearDistance(targetRoomName, a.name)
    const bDistance = Game.map.getRoomLinearDistance(targetRoomName, b.name)
    return aDistance - bDistance
  })

  const candidateRoom = roomsSorted.find(room => {
    if (room.controller.level < 8) {
      return false
    }
    if (!room.terminal) {
      return false
    }
    if (room.terminal.store[RESOURCE_POWER] > 30000) {
      return false
    }
    const route = this.getRoute(targetRoomName, room.name)
    if (route === ERR_NO_PATH || route.length > POWERBANK_DISTANCE_THRESHOLD) {
      return false
    }
    if (Object.values(powerBankTasks).map(task => task.roomNameInCharge).includes(room.name)) {
      `${room.name} already has powerBank task`
      return false
    }
    if (room.memory.militaryThreat) {
      return false
    }
    if (room.isReactingToNukes()) {
      return false
    }
    if (room.energyLevel < 120) {
      return false
    }
    return true
  })

  if (!candidateRoom) {
    return
  }

  const powerBanks = targetRoom.find(FIND_STRUCTURES).filter(structure => structure.structureType === 'powerBank')

  for (const powerBank of powerBanks) {

    if (powerBankTasks[powerBank.id]) {
      continue
    }

    if (powerBank.power < POWERBANK_AMOUNT_THRESHOLD) {
      continue
    }

    const powerBankRequest = new PowerBankRequest(candidateRoom, powerBank)

    const requiredAttackPower = this.getRequiredAttackPowerForPowerBank(powerBankRequest)

    const attackPower = powerBankRequest.boost ? POWER_BANK_DAMAGE_THRESHOLD_WITH_BOOSTED : POWER_BANK_DAMAGE_THRESHOLD

    if (requiredAttackPower > (attackPower * 0.8)) {
      continue
    }

    data.recordLog(`POWERBANK: ${candidateRoom.name} start powerBank mining at ${targetRoomName}`, targetRoomName)
    this.registerTask('powerBank', powerBankRequest)
  }
}

const PowerBankRequest = function (room, powerBank) {
  const terminal = room.terminal

  if (!terminal) {
    return
  }

  const search = PathFinder.search(powerBank.pos, { pos: terminal.pos, range: 1 }, {
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

  const pos = powerBank.pos

  this.category = 'powerBank'
  this.id = powerBank.id

  this.roomName = pos.roomName

  this.powerBankId = powerBank.id
  this.packedCoord = packCoord(pos.x, pos.y)
  this.hits = powerBank.hits
  this.amount = powerBank.power
  this.decayTime = Game.time + powerBank.ticksToDecay
  this.available = Math.min(pos.available, 3)
  this.distance = search.cost

  this.roomNameInCharge = room.name
  this.boost = (terminal.store['XUH2O'] > 16 * LAB_BOOST_MINERAL) && (terminal.store['XGHO2'] > 16 * LAB_BOOST_MINERAL)
  this.haulerNeeded = Math.ceil(this.amount / HAULER_CARRY_CAPACITY)

}

Room.prototype.requestHighwayHauler = function (roomName, resourceType, numCarry = 25) {
  if (!this.hasAvailableSpawn()) {
    return
  }

  let body = []

  for (let i = 0; i < Math.min(numCarry, 25, Math.floor(this.energyCapacityAvailable / 100)); i++) {
    body.push(CARRY, MOVE)
  }

  const name = `${roomName} highwayHauler ${Game.time}_${this.spawnQueue.length}`

  const memory = {
    role: 'highwayHauler',
    base: this.name,
    targetRoom: roomName,
    resourceType: resourceType
  }

  const options = { priority: SPAWN_PRIORITY['highwayHauler'] }

  const request = new RequestSpawn(body, name, memory, options)
  this.spawnQueue.push(request)
}

Room.prototype.requestPowerBankAttacker = function (powerBankRequest) {
  if (!this.hasAvailableSpawn()) {
    return
  }

  const boost = powerBankRequest.boost

  let body = []

  if (boost) {
    for (let i = 0; i < 3; i++) {
      body.push(TOUGH)
    }

    for (let i = 0; i < 19; i++) {
      body.push(MOVE)
    }

    for (let i = 0; i < 16; i++) {
      body.push(ATTACK)
    }
  } else {
    for (let i = 0; i < 20; i++) {
      body.push(MOVE)
    }

    for (let i = 0; i < 20; i++) {
      body.push(ATTACK)
    }
  }

  const boosted = boost ? false : undefined

  const powerBankId = powerBankRequest.powerBankId

  const name = `${powerBankId} powerBankAttacker ${Game.time}`

  const memory = {
    role: 'powerBankAttacker',
    base: this.name,
    boosted,
    task: { category: powerBankRequest.category, id: powerBankRequest.id }
  }

  const options = { priority: SPAWN_PRIORITY['powerBankAttacker'] }

  if (boost) {
    options.boostResources = ['XGHO2', 'XUH2O']
  }

  const request = new RequestSpawn(body, name, memory, options)
  this.spawnQueue.push(request)
}

Room.prototype.requestPowerBankHealer = function (powerBankRequest) {

  let body = []

  for (let i = 0; i < 15; i++) {
    body.push(HEAL)
  }
  for (let i = 0; i < 15; i++) {
    body.push(MOVE)
  }
  for (let i = 0; i < 10; i++) {
    body.push(HEAL)
  }
  for (let i = 0; i < 10; i++) {
    body.push(MOVE)
  }

  const powerBankId = powerBankRequest.powerBankId

  const name = `${powerBankId} powerBankHealer ${Game.time}`

  const memory = {
    role: 'powerBankHealer',
    base: this.name,
    task: { category: powerBankRequest.category, id: powerBankRequest.id }
  }

  const options = { priority: SPAWN_PRIORITY['powerBankHealer'] }

  const request = new RequestSpawn(body, name, memory, options)
  this.spawnQueue.push(request)
}

Creep.prototype.highwayHaul = function (powerBankRequest) {
  if (!Game.rooms[this.memory.base]) {
    return
  }

  if (this.spawning) {
    return
  }

  if (!this.memory.supplying && powerBankRequest.destroyed && (this.store.getFreeCapacity() === 0 || powerBankRequest.nothingLeft)) {
    this.memory.supplying = true
  }

  const enemyCombatants = this.room.getEnemyCombatants()

  const isEnemyCombatant = enemyCombatants.length > 0

  if (isEnemyCombatant) {
    for (const combatant of enemyCombatants) {
      const range = this.pos.getRangeTo(combatant.pos)
      if (range < 10) {
        const maxRooms = range < 5 ? 2 : 1
        this.fleeFrom(enemyCombatants, 15, maxRooms)
        return
      }
    }
  }

  if (this.memory.supplying) {
    this.say('🎁', true)
    if (this.room.name !== this.memory.base) {
      this.moveToRoom(this.memory.base)
      return
    }
    if (this.memory.amount === undefined) {
      this.memory.amount = this.store.getUsedCapacity()
    }
    if (this.store.getUsedCapacity() > 0) {
      this.returnAll()
      return
    }
    this.memory.assignedRoom = this.room.name
    this.memory.role = 'manager'
    powerBankRequest.amountReturned = powerBankRequest.amountReturned || 0
    powerBankRequest.amountReturned += this.memory.amount
    return
  }

  if (this.room.name !== powerBankRequest.roomName) {
    const parsed = parseCoord(powerBankRequest.packedCoord)
    const targetPos = new RoomPosition(parsed.x, parsed.y, powerBankRequest.roomName)
    this.moveMy({ pos: targetPos, range: 1 }, { ignoreMap: 2 })
    return
  }

  const resourceType = this.memory.resourceType

  const tombstone = this.room.find(FIND_TOMBSTONES).find(tombstone => tombstone.store[resourceType] > 0)

  if (tombstone) {
    if (this.pos.getRangeTo(tombstone) > 1) {
      this.moveMy({ pos: tombstone.pos, range: 1 })
      return
    }
    this.withdraw(tombstone, resourceType)
    return
  }

  const droppedResource = this.room.find(FIND_DROPPED_RESOURCES).find(droppedResource => droppedResource.resourceType === resourceType)

  if (droppedResource) {
    if (this.pos.getRangeTo(droppedResource) > 1) {
      this.moveMy({ pos: droppedResource.pos, range: 1 })
      return
    }
    this.pickup(droppedResource)
    return
  }

  const ruin = this.room.find(FIND_RUINS).find(ruin => ruin.store[resourceType] > 0)

  if (ruin) {
    if (this.pos.getRangeTo(ruin) > 1) {
      this.moveMy({ pos: ruin.pos, range: 1 })
      return
    }
    this.withdraw(ruin, resourceType)
    return
  }

  const powerBank = Game.getObjectById(powerBankRequest.powerBankId)

  if (powerBank) {
    const range = this.pos.getRangeTo(powerBank)
    this.setWorkingInfo(powerBank.pos, 3)
    if (range > 3) {
      this.moveMy({ pos: powerBank.pos, range: 3 })
      return
    }
    return
  }

  // nothing...
  powerBankRequest.nothingLeft = true
}

Creep.prototype.attackPowerBank = function (powerBankRequest) {
  if (this.spawning) {
    return
  }

  if (this.memory.boosted === false) {
    return
  }

  const base = Game.rooms[this.memory.base]
  if (!base) {
    return
  }

  if (!this.memory.healer) {
    const powerBankHealers = Overlord.getCreepsByRole(powerBankRequest.powerBankId, 'powerBankHealer')
    const candidate = powerBankHealers.find((creep) => {
      if (creep.spawning) {
        return false
      }
      if (creep.room.name !== base.name) {
        return false
      }
      if (creep.memory.attacker !== undefined) {
        return false
      }
      return true
    })
    if (candidate) {
      this.memory.healer = candidate.name
      candidate.memory.attacker = this.name
    }
  }

  const healer = Game.creeps[this.memory.healer]

  if (!healer || healer.spawning || this.memory.boosted === false) {
    return
  }

  const hostileCreeps = this.room.findHostileCreeps()
  const targets = this.pos.findInRange(hostileCreeps, 1)
  if (targets.length > 0) {
    this.attack(targets[0])
  }

  healer.follow(this)
  healer.care(this)

  if ((this.room.name === healer.room.name && this.pos.getRangeTo(healer) > 1 && Game.time % 2 === 0)) {
    return
  }

  if (this.room.name !== powerBankRequest.roomName) {
    const parsed = parseCoord(powerBankRequest.packedCoord)
    const targetPos = new RoomPosition(parsed.x, parsed.y, powerBankRequest.roomName)
    this.moveMy({ pos: targetPos, range: 1 })
    return
  }

  const enemyCombatants = this.room.getEnemyCombatants()

  if (enemyCombatants.length > 0) {
    const range = this.memory.end ? 50 : 5
    const closesestEnemy = this.pos.findClosestByRange(enemyCombatants)
    if (this.pos.getRangeTo(closesestEnemy) <= range) {
      this.say('💢', true)
      this.heap.enemyDetected = Game.time
      this.moveMy(closesestEnemy)
      this.attack(closesestEnemy)
      return
    }
  }

  if ((this.heap.enemyDetected && Game.time < this.heap.enemyDetected + 2)) {
    return
  }

  const powerBank = Game.getObjectById(powerBankRequest.powerBankId)

  if (!powerBank) {
    this.memory.end = true
    return
  }

  const remainingTicks = powerBankRequest.remainingTicks || Infinity
  const ticksToLive = Math.min(this.ticksToLive, healer.ticksToLive)
  powerBankRequest.hasEnoughDuo = ticksToLive >= remainingTicks

  const range = this.pos.getRangeTo(powerBank)
  if (range > 1) {
    this.moveMy({ pos: powerBank.pos, range: 1 })
  }

  if (this.hits < this.hitsMax) {
    return
  }

  if (range > 1) {
    return
  }

  this.setWorkingInfo(powerBank.pos, 1)
  this.attack(powerBank)
  this.say('🔨', true)

  if (!powerBankRequest.duoArrived) {
    powerBankRequest.duoArrived = true
  }
}