const TEST = false
const IMPORTANT_STRUCTURE_TYPES = ['spawn', 'tower']
const ENEMY_OBSTACLE_OBJECT_TYPES = [...OBSTACLE_OBJECT_TYPES, 'rampart']
const QUAD_COST_VISUAL = false
const BULLDOZE_COST_VISUAL = false
const EDGE_COST = 50
const HALF_EDGE_COST = 10

const HEAL_BUFFER = 100

const FORMATION_VECTORS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 }
]

const FORMATION_VECTORS_REVERSE = [
  { x: 0, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: -1, y: -1 }
]

const FORMATION_NEIGHBOR_VECTORS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 }
]

Flag.prototype.manageQuad = function () {
  const base = this.findClosestMyRoom(8)
  const names = [0, 1, 2, 3].map(number => `${this.name} ${number}`)

  const quad = new Quad(names)

  // check creeps
  if (!this.memory.quadSpawned && quad.creeps.length === 4) {
    for (const creep of quad.creeps) {
      delete creep.memory.wait
    }
    this.memory.quadSpawned = true
  }

  // spawn creeps
  if (!this.memory.quadSpawned) {
    const creepCount = quad.creeps.length
    if (creepCount === 3) {
      base.needNotSpawningSpawn = true
    }
    for (let i = creepCount; i < 4; i++) {
      const name = names[i]
      const creep = Game.creeps[name]
      const isFirst = (i === 0)
      if (!creep) {
        base.requestQuadMember(name, isFirst)
      }
    }
    return
  }

  // check boost
  if (!this.memory.quadBoosted) {
    for (const creep of quad.creeps) {
      if (creep.memory.boosted === false) {
        return
      }
    }
    this.memory.quadBoosted = true
  }

  // if every member dies, end protocol
  if (quad.creeps.length === 0) {
    delete this.memory
    this.remove()
    return
  }

  this.memory.status = this.memory.status || 'travel'

  // heal and attack all the time
  quad.quadHeal()

  // move to target room
  const targetRoomName = this.pos.roomName
  const rallyExit = quad.getRallyExit(targetRoomName)

  if (this.memory.status === 'travel') {
    quad.leader.say('🐍', true)

    quad.rangedMassAttack()
    const rallyRoomCenterPos = new RoomPosition(25, 25, rallyExit.roomName)

    if (quad.roomName !== rallyExit.roomName) {
      quad.snakeTravel({ pos: rallyRoomCenterPos, range: 20 })
      return
    }

    const exitPositions = quad.room.find(rallyExit.exit)
    const goals = exitPositions.map(pos => { return { pos, range: 5 } })

    if (quad.snakeTravel(goals) !== 'finished') {
      return
    }

    this.memory.status = 'engage'
    return
  }

  if (this.memory.status === 'engage') {
    for (const creep of quad.creeps) {
      if (creep.pos.roomName !== targetRoomName) {
        quad.leader.say('🎺', true)
        const targetRoomCenterPos = new RoomPosition(25, 25, targetRoomName)
        quad.moveInFormation({ pos: targetRoomCenterPos, range: 22 })

        quad.rangedMassAttack()
        return
      }
    }
    this.memory.status = 'attack'
  }

  if (this.memory.status === 'attack') {
    if (this.room.name !== targetRoomName) {
      quad.leader.say('🎺', true)
      const targetRoomCenterPos = new RoomPosition(25, 25, targetRoomName)
      quad.moveInFormation({ pos: targetRoomCenterPos, range: 22 })
      quad.rangedMassAttack()
      return
    }
    quad.attackRoom(targetRoomName)
    return
  }
}




Room.prototype.requestQuadMember = function (name, isFirst = false) {

  let body = []
  for (let i = 0; i < 15; i++) {
    body.push(RANGED_ATTACK)
  }
  for (let i = 0; i < 5; i++) {
    body.push(TOUGH)
  }
  for (let i = 0; i < 5; i++) {
    body.push(MOVE)
  }
  for (let i = 0; i < 20; i++) {
    body.push(HEAL)
  }
  for (let i = 0; i < 5; i++) {
    body.push(MOVE)
  }

  if (TEST) {
    body = [MOVE, MOVE, RANGED_ATTACK, HEAL, CARRY, CARRY, CARRY, CARRY, CARRY]
  }

  const memory = { role: 'quad', base: this.name, boosted: false, wait: true }

  const options = { priority: 1 }
  if (TEST) {
    options.boostResources = ['XZHO2', 'XLHO2', 'XKHO2',]
  } else {
    options.boostResources = ['XZHO2', 'XGHO2', 'XLHO2', 'XKHO2',]
  }

  if (isFirst) {
    options.boostMultiplier = 4
  }

  const request = new RequestSpawn(body, name, memory, options)

  this.spawnQueue.push(request)
}

class Quad {
  constructor(names) {
    this.names = names
  }

  get creeps() {
    return this.getCreeps()
  }

  get creepIds() {
    if (this._creepIds) {
      return this._creepIds
    }
    return this._creepIds = this.creeps.map(creep => creep.id)
  }

  get fatigue() {
    if (this._fatigue) {
      return this._fatigue
    }
    let result = 0
    for (const creep of this.creeps) {
      result = Math.max(result, creep.fatigue)
    }
    return this._fatigue = result
  }

  get leader() {
    return this.creeps[0]
  }

  get room() {
    if (!this.leader) {
      return undefined
    }
    return this.leader.room
  }

  get roomName() {
    if (this._roomName !== undefined) {
      return this._roomName
    }
    if (!this.room) {
      return undefined
    }
    return this._roomName = this.room.name
  }

  get hitsMax() {
    if (this._hitsMax) {
      return this._hitsMax
    }
    return this._hitsMax = this.creeps.map(creep => creep.hitsMax).reduce((accumulator, currentValue) => accumulator + currentValue, 0)
  }

  get hits() {
    if (this._hits) {
      return this._hits
    }
    return this._hits = this.creeps.map(creep => creep.hits).reduce((accumulator, currentValue) => accumulator + currentValue.hits, 0)
  }

  get formation() {
    if (this._formation) {
      return this._formation
    }
    return this._formation = this.getFormation()
  }

  get isFormed() {
    if (this._isFormed) {
      return this._isFormed
    }
    return this._isFormed = this.getIsFormed()
  }

  get rangedAttackPower() {
    if (this._rangedAttackPower) {
      return this._rangedAttackPower
    }
    const result = this.creeps.map(creep => creep.rangedAttackPower).reduce((acc, curr) => acc + curr, 0)
    return this._rangedAttackPower = result
  }

  get healPower() {
    if (this._healPower) {
      return this._healPower
    }
    const result = this.creeps.map(creep => creep.healPower).reduce((acc, curr) => acc + curr, 0)
    return this._healPower = result
  }

  get isSnakeFormedUp() {
    if (this._isSnakeFormedUp) {
      return this._isSnakeFormedUp
    }
    return this._isSnakeFormedUp = this.getIsSnakeFormedUp()
  }

  get costMatrix() {
    if (this._costMatrix) {
      return this._costMatrix
    }
    return this._costMatrix = getQuadCostMatrix(this.roomName)
  }
}

Quad.prototype.attackRoom = function () {
  this.passiveRangedAttack()

  if (this.healPower < (this.hitsMax - this.hits) + HEAL_BUFFER) {
    this.leader.say('🚑', true)
    this.retreat()
    return
  }

  if (this.room.controller.safeMode > 0) {
    this.leader.say('🏰', true)
    this.retreat()
    return
  }

  if (!this.isFormed) {
    this.leader.say('🎺', true)
    const costs = this.costMatrix
    if (costs.get(this.leader.pos.x, this.leader.pos.y) < EDGE_COST) {
      this.formUp()
      return
    } else {
      this.retreat()
      return
    }
  }

  const quadCostArray = this.getBulldozeQuadCostArray()

  const packed = packCoord(this.leader.pos.x, this.leader.pos.y)
  if (quadCostArray[packed] === 0) {
    this.leader.say('🚑', true)
    this.retreat()
    return
  }

  const path = this.getPathToAttack(quadCostArray)

  if (path === ERR_NOT_FOUND) {
    this.leader.say('🚫', true)
    this.retreat()
    return
  }

  visualizePath(path)
  const nextPos = path[0]

  if (nextPos) {
    if (this.isAbleToStep(nextPos)) {
      const direction = this.leader.pos.getDirectionTo(nextPos)
      this.move(direction)
    }
    return
  }
}

Quad.prototype.getPathToAttack = function (quadCostArray) {
  const cachedPath = this.getCachedPath()

  if (cachedPath !== undefined) {
    this.leader.say('🏇', true)
    return cachedPath
  }

  const bulldozePath = this.getBulldozePath(quadCostArray)

  if (Array.isArray(bulldozePath)) {
    this.leader.say('🏇', true)
    return this.leader.heap._path = bulldozePath
  }

  const skirmishPath = this.getSkirmishPath(quadCostArray)
  if (Array.isArray(skirmishPath)) {
    this.leader.say('🏹', true)
    return skirmishPath
  }

  this.leader.say('🚫', true)
  return ERR_NOT_FOUND
}

Quad.prototype.getCachedPath = function () {
  const cachedPath = this.leader.heap._path
  if (!cachedPath) {
    return undefined
  }
  if (cachedPath.length === 0) {
    return undefined
  }
  if (this.leader.pos.getRangeTo(cachedPath[0]) === 1) {
    return cachedPath
  }
  if (this.leader.pos.getRangeTo(cachedPath[0]) === 0 && cachedPath.length > 1) {
    this.leader.heap._path.shift()
    return this.leader.heap._path
  }
}

Quad.prototype.isAbleToStep = function (pos) {
  const costs = this.costMatrix
  if (costs.get(pos.x, pos.y) > EDGE_COST) {
    return false
  }

  const maxX = Math.min(49, pos.x + 1)
  const maxY = Math.min(49, pos.y + 1)

  const structures = this.room.lookForAtArea(LOOK_STRUCTURES, pos.y, pos.x, maxY, maxX, true)
  const structuresFiltered = structures.filter(looked => ENEMY_OBSTACLE_OBJECT_TYPES.includes(looked.structure.structureType))
  if (structuresFiltered.length > 0) {
    return false
  }

  const creeps = this.room.lookForAtArea(LOOK_CREEPS, pos.y, pos.x, maxY, maxX, true)
  const creepsFiltered = creeps.filter(looked => !this.creepIds.includes(looked.creep.id))
  if (creepsFiltered.length > 0) {
    return false
  }

  return true
}

Quad.prototype.getBulldozePath = function (quadCostArray) {
  if (this._bulldozePath) {
    return this._bulldozePath
  }

  const range = 0

  const hostileStructures = this.room.find(FIND_HOSTILE_STRUCTURES)
  const importantStructures = hostileStructures.filter(structure => IMPORTANT_STRUCTURE_TYPES.includes(structure.structureType))

  const goals = []

  for (const structure of importantStructures) {
    const pos = structure.pos
    for (const vector of FORMATION_VECTORS_REVERSE) {
      const newPos = new RoomPosition(pos.x + vector.x, pos.y + vector.y, this.roomName)
      const goal = { pos: newPos, range }
      goals.push(goal)
    }
  }

  const dijkstra = this.room.dijkstra(this.leader.pos, goals, quadCostArray)
  return this._bulldozePath = dijkstra
}

Quad.prototype.getSkirmishPath = function (quadCostArray) {
  if (this._skirmishPath) {
    return this._skirmishPath
  }

  const hostileStructures = this.room.find(FIND_HOSTILE_STRUCTURES).filter(structure => structure.hits)
  const hostileCreeps = this.room.find(FIND_HOSTILE_CREEPS)
  const goals = []

  const structureRange = 1
  for (const structure of hostileStructures) {
    const pos = structure.pos
    for (const vector of FORMATION_VECTORS_REVERSE) {
      const newPos = new RoomPosition(pos.x + vector.x, pos.y + vector.y, this.roomName)
      const goal = { pos: newPos, range: structureRange }
      goals.push(goal)
    }
  }

  const creepRange = 2
  for (const creep of hostileCreeps) {
    const pos = creep.pos
    for (const vector of FORMATION_VECTORS_REVERSE) {
      const newPos = new RoomPosition(pos.x + vector.x, pos.y + vector.y, this.roomName)
      const goal = { pos: newPos, range: creepRange }
      goals.push(goal)
    }
  }

  const dijkstra = this.room.dijkstra(this.leader.pos, goals, quadCostArray)
  return this._skirmishPath = dijkstra
}

Quad.prototype.getBulldozeQuadCostArray = function () {
  if (this._bulldozeQuadCostArray) {
    return this._bulldozeQuadCostArray
  }

  const power = this.rangedAttackPower

  if (power === 0) {
    return
  }

  const costArray = this.room.getCostArrayForBulldoze(power)

  const damageArray = this.room.getDamageArray()

  for (let i = 0; i < damageArray.length; i++) {
    const netHeal = this.healPower - damageArray[i] - HEAL_BUFFER
    if (netHeal < 0) {
      costArray[i] = 0
    }
  }

  const quadCostArray = transformCostArrayForQuad(costArray, this.roomName)

  return this._bulldozeQuadCostArray = quadCostArray
}

Quad.prototype.rangedMassAttack = function () {
  for (const creep of this.creeps) {
    const hostileCreeps = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3)
    if (hostileCreeps.length > 0) {
      creep.rangedMassAttack()
    }
  }
}

Quad.prototype.passiveRangedAttack = function () {
  for (const creep of this.creeps) {
    creep.passiveRangedAttack()
  }
}

Creep.prototype.passiveRangedAttack = function () {

  let rangedMassAttackTotalDamage = 0

  const positions = this.pos.getInRange(3)
  const rangedAttackPower = this.rangedAttackPower

  let rangedAttackTarget = undefined

  for (const pos of positions) {
    const priorityTarget = this.getPriorityTarget(pos)

    if (!priorityTarget) {
      continue
    }

    if (rangedAttackTarget === undefined || priorityTarget.hits < rangedAttackTarget.hits) {
      rangedAttackTarget = priorityTarget
    }

    if (priorityTarget.my === false) {
      const range = this.pos.getRangeTo(pos)

      if (range <= 1) {
        this.rangedMassAttack()
        return
      }

      const rangeConstant = range <= 1 ? 1 : range <= 2 ? 0.4 : 0.1
      const damage = rangedAttackPower * rangeConstant

      rangedMassAttackTotalDamage += damage
      continue
    }
  }

  if (rangedMassAttackTotalDamage >= rangedAttackPower) {
    this.rangedMassAttack()
    return
  }

  if (rangedAttackTarget) {
    this.rangedAttack(rangedAttackTarget)
  }
}

Creep.prototype.getPriorityTarget = function (pos) {
  const structures = pos.lookFor(LOOK_STRUCTURES).filter(structure => structure.hits)
  const hostileCreeps = pos.lookFor(LOOK_CREEPS).filter(creep => !creep.my)

  if (structures.length === 0 && hostileCreeps.length === 0) {
    return undefined
  }

  let hostileStructure = undefined
  let neutralStructure = undefined

  for (const structure of structures) {
    if (structure.structureType === 'rampart') {
      return structure
    }
    if (structure.my === false) {
      hostileStructure = structure
      continue
    }
    if (neutralStructure === undefined || structure.hits > neutralStructure.hits) {
      neutralStructure = structure
      continue
    }
  }

  if (hostileCreeps.length > 0) {
    return hostileCreeps[0]
  }

  if (hostileStructure) {
    return hostileStructure
  }

  if (neutralStructure) {
    return neutralStructure
  }

  return undefined
}

Quad.prototype.retreat = function () {
  delete this.leader.heap._path

  const costs = this.costMatrix
  if (!this.isFormed) {
    if (costs.get(this.leader.pos.x, this.leader.pos.y) < EDGE_COST) {
      this.leader.say('form!', true)
      this.formUp()
      return
    }
  }

  const damageArray = this.room.getDamageArray()

  const adjacentPositions = this.leader.pos.getAtRange(1)
  const adjacentPositionsFiltered = adjacentPositions.filter(pos => this.isAbleToStep(pos) && costs.get(pos.x, pos.y) < HALF_EDGE_COST)

  const posToRetreat = getMinObject(adjacentPositionsFiltered, (pos) => {
    const packed = packCoord(pos.x, pos.y)
    return damageArray[packed]
  })

  if (!posToRetreat) {
    this.leader.say('noPos')
    const exitPositions = this.room.find(FIND_EXIT)
    const goals = exitPositions.map(pos => { return { pos, range: 2 } })
    this.moveInFormation(goals)
    return
  }

  const direction = this.leader.pos.getDirectionTo(posToRetreat)
  this.room.visual.circle(posToRetreat)
  this.move(direction)
}

Quad.prototype.getRallyExit = function (targetRoomName) {
  const cachedResult = this.leader.memory.rallyExit
  if (cachedResult && cachedResult['targetRoomName'] === targetRoomName) {
    return cachedResult
  }

  const thisRoomName = this.roomName
  const route = Game.map.findRoute(this.room, targetRoomName, {
    routeCallback(roomName, fromRoomName) {
      // 현재 creep이 있는 방이면 무조건 쓴다
      if (roomName === thisRoomName) {
        return 1
      }

      // 목적지는 무조건 간다
      if (roomName === targetRoomName) {
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
  if (route === ERR_NO_PATH) {
    return undefined
  }

  const exit = route[route.length - 1] ? route[route.length - 1].exit : undefined
  const roomName = route[route.length - 2] ? route[route.length - 2].room : this.roomName

  const result = { exit, roomName, targetRoomName }
  return this.leader.memory.rallyExit = result
}

Quad.prototype.snakeTravel = function (goals) {
  goals = normalizeGoals(goals)

  if (this.leader.pos.isInGoal(goals)) {
    delete this.leader.memory.snakeFormed
    return 'finished'
  }

  if (Game.time % 10 === 0) {
    delete this.leader.memory.snakeFormed
  }

  if (!this.leader.memory.snakeFormed && this.isSnakeFormedUp) {
    this.leader.memory.snakeFormed = true
  }

  if (!this.leader.memory.snakeFormed && Game.time % 3 === 0) {
    this.formSnake()
    return ERR_BUSY
  }

  if (this.fatigue > 0) {
    return ERR_TIRED
  }

  this.leader.moveMy(goals, { ignoreCreeps: 20, ignoreMap: 2 })

  for (i = 1; i < this.creeps.length; i++) {
    const formerCreep = this.creeps[i - 1]
    const creep = this.creeps[i]
    if (creep.pos.roomName !== formerCreep.pos.roomName || creep.pos.getRangeTo(formerCreep) > 1) {
      creep.moveMy(formerCreep, { ignoreMap: 2 })
      continue
    }
    const direction = creep.pos.getDirectionTo(formerCreep)
    creep.move(direction)
  }

  return OK
}

Quad.prototype.getIsSnakeFormedUp = function () {
  for (i = 1; i < this.creeps.length; i++) {
    const formerCreep = this.creeps[i - 1]
    const creep = this.creeps[i]
    if (isValidCoord(creep.pos.x, creep.pos.y)
      && isValidCoord(formerCreep.pos.x, formerCreep.pos.y)
      && creep.pos.getRangeTo(formerCreep) > 1) {
      return false
    }
  }
  return true
}

Quad.prototype.formSnake = function () {
  for (i = 1; i < this.creeps.length; i++) {
    const formerCreep = this.creeps[i - 1]
    const creep = this.creeps[i]
    if (creep.pos.getRangeTo(formerCreep) > 1) {
      creep.moveMy({ pos: formerCreep.pos, range: 1 }, { ignoreMap: 2 })
    }
  }
}

Quad.prototype.quadHeal = function () {
  if (this.hits === this.hitsMax) {
    this.preHeal()
    return
  }
  this.activeHeal()
  return
}

Quad.prototype.preHeal = function () {
  for (const creep of this.creeps) {
    creep.heal(creep)
  }
}

Quad.prototype.activeHeal = function () {
  this.creeps.forEach(creep => {
    creep.virtualHits = creep.hits
  })
  for (const creep of this.creeps) {
    const mostInjuredCreep = getMinObject(this.creeps, (a) => a.virtualHits)
    if (mostInjuredCreep.virtualHits === mostInjuredCreep.hitsMax) {
      creep.heal(creep)
      continue
    }
    creep.heal(mostInjuredCreep)
    mostInjuredCreep.virtualHits = Math.min(mostInjuredCreep.hitsMax, mostInjuredCreep.virtualHits + creep.healPower)
  }
}

Quad.prototype.formUp = function () {
  const creeps = this.creeps
  const formation = this.formation
  for (let i = 0; i < creeps.length; i++) {
    const creep = creeps[i]
    const pos = formation[i]
    if (!pos) {
      return
    }
    if (creep.pos.isEqualTo(pos)) {
      continue
    }
    creep.moveMy(pos, { ignoreMap: 2 })
  }
}

Quad.prototype.getFormation = function () {
  if (!this.leader) {
    return undefined
  }

  const result = []

  const x = this.leader.pos.x
  const y = this.leader.pos.y

  for (const vector of FORMATION_VECTORS) {
    const newX = vector.x + x
    const newY = vector.y + y
    if (newX < 0 || newX > 49 || newY < 0 || newY > 49) {
      continue
    }
    const pos = new RoomPosition(newX, newY, this.roomName)

    if (pos.isWall) {
      continue
    }

    result.push(pos)
  }

  return result
}

Quad.prototype.getIsFormed = function () {
  const formation = this.formation
  const creeps = this.creeps
  for (let i = 0; i < Math.min(creeps.length, formation.length); i++) {
    const creep = creeps[i]
    if (creep.pos.roomName !== this.roomName) {
      continue
    }
    if (!creep.pos.isEqualTo(formation[i])) {
      return false
    }
  }
  return true
}

Quad.prototype.getCreeps = function () {
  if (this._creeps) {
    return this._creeps
  }

  const result = []
  for (const name of this.names) {
    const creep = Game.creeps[name]
    if (creep && !creep.spawning) {
      result.push(creep)
    }
  }

  result.sort((a, b) => (b.ticksToLive || 1500) - (a.ticksToLive || 1500))

  return this._creeps = result
}

global.transformCostArrayForQuad = function (costArray, roomName) {
  const result = new Uint32Array(2500)
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      const packed = packCoord(x, y)
      let cost = costArray[packed]
      for (const vector of FORMATION_NEIGHBOR_VECTORS) {
        const newX = vector.x + x
        const newY = vector.y + y
        if (newX < 0 || newX > 49 || newY < 0 || newY > 49) {
          continue
        }
        const newPacked = packCoord(newX, newY)
        const newCost = costArray[newPacked]
        if (cost === 0 || newCost === 0) {
          cost = 0
          break
        }
        cost = Math.max(cost, newCost)
      }
      result[packed] = cost
      if (BULLDOZE_COST_VISUAL) {
        new RoomVisual(roomName).text(cost, x, y, { font: 0.3 })
      }
    }
  }
  return result
}

function getQuadCostMatrix(roomName) {
  const room = Game.rooms[roomName]
  const basicCosts = room ? room.basicCostmatrix.clone() : new PathFinder.CostMatrix

  const costs = new PathFinder.CostMatrix
  const terrain = new Room.Terrain(roomName)

  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      const terrainMask = terrain.get(x, y)
      if (terrainMask === TERRAIN_MASK_WALL) {
        basicCosts.set(x, y, 255)
        continue
      }

      if (!isValidCoord(x, y) && basicCosts.get(x, y) < HALF_EDGE_COST) {
        basicCosts.set(x, y, HALF_EDGE_COST)
      }

      if (terrainMask === TERRAIN_MASK_SWAMP && basicCosts.get(x, y) < 5) {
        basicCosts.set(x, y, 5)
        continue
      }
    }
  }

  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      let cost = basicCosts.get(x, y)
      for (const vector of FORMATION_NEIGHBOR_VECTORS) {
        const newX = vector.x + x
        const newY = vector.y + y
        if (newX < 0 || newX > 49 || newY < 0 || newY > 49) {
          cost = Math.max(cost, EDGE_COST)
          break
        }
        cost = Math.max(cost, basicCosts.get(newX, newY))
      }
      costs.set(x, y, cost)
      if (QUAD_COST_VISUAL) {
        new RoomVisual(roomName).text(cost, x, y, { font: 0.5 })
      }
    }
  }
  return costs
}

/**
 * 
 * @param {object} goals - a goal {pos, range} or an array of goals
 * @returns 
 */
Quad.prototype.moveInFormation = function (goals) {
  if (this.fatigue > 0) {
    return ERR_TIRED
  }

  const costs = this.costMatrix

  const costsNow = costs.get(this.leader.pos.x, this.leader.pos.y)

  if (costsNow === 255) {
    this.leader.say('255cost')
    this.indivisualMove(goals)
    return
  }

  if (!this.isFormed) {
    if (costsNow < EDGE_COST) {
      this.leader.say('form!', true)
      this.formUp()
      return
    }
    this.indivisualMove(goals)
    return
  }

  const search = this.getSearchTo(goals)

  if (search.incomplete) {
    this.indivisualMove(goals)
    return
  }

  const path = search.path
  visualizePath(path)

  const nextPos = path[0]
  if (nextPos && this.isAbleToStep(nextPos)) {
    const direction = this.leader.pos.getDirectionTo(nextPos)
    this.move(direction)
    return
  }

  this.indivisualMove(goals)
  return
}

Quad.prototype.indivisualMove = function (goals) {
  for (const creep of this.creeps) {
    creep.moveMy(goals, { ignoreMap: 2 })
  }
}

Quad.prototype.getSearchTo = function (goals) {
  const search = PathFinder.search(this.leader.pos, goals, {
    roomCallback: (roomName) => getQuadCostMatrix(roomName)
  })

  return search
}

Quad.prototype.move = function (direction) {
  if (this.fatigue > 0) {
    return ERR_TIRED
  }
  for (const creep of this.creeps) {
    if (isValidCoord(creep.pos.x, creep.pos.y) && isValidCoord(this.leader.pos.x, this.leader.pos.y) && creep.pos.getRangeTo(this.leader) > 1) {
      continue
    }
    creep.move(direction)
  }
  return OK
}