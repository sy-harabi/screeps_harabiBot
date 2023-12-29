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

const FORMATION_VECTORS_REVERSED = [
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

const ATTACK_TARGET_POSITION_VECTORS = [
  { x: -2, y: -1 },
  { x: -2, y: -0 },
  { x: -1, y: -2 },
  { x: -1, y: 1 },
  { x: 0, y: -2 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: 1, y: -1 }
]

Flag.prototype.manageQuad = function () {
  const isDismantle = this.name.toLowerCase().includes('dismantle')

  const base = this.memory.base ? Game.rooms[this.memory.base] : this.findClosestMyRoom(8)

  const quad = new Quad(this.name)

  // check creeps
  if (!this.memory.quadSpawned && quad.creeps.length === 4) {
    for (const creep of quad.creeps) {
      delete creep.memory.wait
    }
    this.memory.quadSpawned = true
  }

  // check ticksToLive
  if (quad.creeps.length > 0) {
    this.memory.ticksToLive = quad.ticksToLive
  } else {
    this.memory.ticksToLive = 1500
  }

  // spawn creeps
  if (!this.memory.quadSpawned) {
    const creepCount = quad.creeps.length
    if (creepCount >= 2) {
      base.needNotSpawningSpawn = true
    }
    const names = quad.names
    for (let i = creepCount; i < 4; i++) {
      const name = names[i]
      const creep = Game.creeps[name]

      if (!creep) {
        if (isDismantle) {
          if (i < 2) {
            base.requestQuadMemberHealer(name)
            continue
          }
          base.requestQuadMemberDismantler(name)
          continue
        }
        base.requestQuadMemberBlinkie(name)
      }
    }
    return
  }

  // check boost
  if (!this.memory.quadBoosted) {
    for (const creep of quad.creeps) {
      if (creep.memory.boosted !== true) {
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
    const goals = exitPositions.map(pos => { return { pos, range: 4 } })

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
    if (quad.creeps.some(creep => creep.pos.roomName !== targetRoomName)) {
      const cachedPath = quad.getCachedPath()

      if (cachedPath) {
        return
      }

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

Room.prototype.requestQuadMemberHealer = function (name) {
  if (!this.hasAvailableSpawn()) {
    return
  }

  let body = []
  for (let i = 0; i < 40; i++) {
    body.push(HEAL)
  }
  for (let i = 0; i < 10; i++) {
    body.push(MOVE)
  }

  if (TEST) {
    body = [HEAL, HEAL, HEAL, HEAL, MOVE]
  }

  const memory = { role: 'quad', base: this.name, boosted: false, wait: true }

  const options = { priority: 1 }

  options.boostResources = ['XZHO2', 'XLHO2']

  const request = new RequestSpawn(body, name, memory, options)

  this.spawnQueue.push(request)
}

Room.prototype.requestQuadMemberDismantler = function (name) {
  if (!this.hasAvailableSpawn()) {
    return
  }

  let body = []
  for (let i = 0; i < 5; i++) {
    body.push(RANGED_ATTACK)
  }
  for (let i = 0; i < 35; i++) {
    body.push(WORK)
  }
  for (let i = 0; i < 10; i++) {
    body.push(MOVE)
  }

  if (TEST) {
    body = [RANGED_ATTACK, WORK, WORK, WORK, MOVE]
  }

  const memory = { role: 'quad', base: this.name, boosted: false, wait: true }

  const options = { priority: 1 }
  options.boostResources = ['XZHO2', 'XZH2O', 'XKHO2']

  const request = new RequestSpawn(body, name, memory, options)

  this.spawnQueue.push(request)
}

Room.prototype.requestQuadMemberBlinkie = function (name) {
  if (!this.hasAvailableSpawn()) {
    return
  }


  let body = []
  for (let i = 0; i < 2; i++) {
    body.push(TOUGH)
  }
  for (let i = 0; i < 15; i++) {
    body.push(RANGED_ATTACK)
  }
  for (let i = 0; i < 3; i++) {
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

  const request = new RequestSpawn(body, name, memory, options)

  this.spawnQueue.push(request)
}

class Quad {
  constructor(name) {
    const names = [0, 1, 2, 3].map(number => `${name} ${number}`)
    this.name = name
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

  get moveCost() {
    const moveCosts = this.creeps.map(creep => creep.getMoveCost())
    return Math.max(...moveCosts)
  }

  get leader() {
    return this.creeps[0]
  }

  get pos() {
    if (this._pos !== undefined) {
      return this._pos
    }

    const leader = this.leader

    if (!leader) {
      return undefined
    }

    if (this.isCompact) {
      const x = Math.min(...this.creeps.map(creep => creep.pos.x))
      const y = Math.min(...this.creeps.map(creep => creep.pos.y))
      const pos = new RoomPosition(x, y, this.roomName)
      return this._pos = pos
    }

    return this._pos = leader.pos
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

  get ticksToLive() {
    if (this._ticksToLive !== undefined) {
      return this._ticksToLive
    }
    return this._ticksToLive = Math.max(...this.creeps.map(creep => creep.ticksToLive || 1500))
  }

  get hitsMax() {
    if (this._hitsMax !== undefined) {
      return this._hitsMax
    }
    return this._hitsMax = this.creeps.map(creep => creep.hitsMax).reduce((accumulator, currentValue) => accumulator + currentValue, 0)
  }

  get hits() {
    if (this._hits !== undefined) {
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

  get isCompact() {
    if (this._isCompact !== undefined) {
      return this._isCompact
    }
    return this._isCompact = this.getIsCompact()
  }

  get isFormed() {
    if (this._isFormed) {
      return this._isFormed
    }
    return this._isFormed = this.getIsFormed()
  }

  get dismantlePower() {
    if (this._dismantlePower) {
      return this._dismantlePower
    }
    const result = this.creeps.map(creep => creep.dismantlePower).reduce((acc, curr) => acc + curr, 0)
    return this._dismantlePower = result
  }

  get attackPower() {
    if (this._attackPower) {
      return this._attackPower
    }
    const result = this.creeps.map(creep => creep.attackPower).reduce((acc, curr) => acc + curr, 0)
    return this._attackPower = result
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

  get heap() {
    if (!Heap.quads.has(this.name)) {
      Heap.quads.set(this.name, {})
    }
    return Heap.quads.get(this.name)
  }
}

Quad.prototype.attackRoom = function () {
  const attackResult = this.passiveRangedAttack()

  if (!this.isFormed) {
    this.leader.say('🎺', true)
    const costs = this.costMatrix
    if (costs.get(this.pos.x, this.pos.y) < EDGE_COST) {
      this.formUp()
      return
    } else {
      const centerPos = new RoomPosition(25, 25, this.roomName)
      this.moveInFormation({ pos: centerPos, range: 22 })
      return
    }
  }

  if (this.healPower < (this.hitsMax - this.hits) + HEAL_BUFFER) {
    this.leader.say('🚑', true)
    this.retreat()
    return
  }

  if (this.room.controller && this.room.controller.safeMode > 0) {
    this.leader.say('🏰', true)
    this.retreat()
    return
  }

  if (this.isDanger()) {
    this.leader.say('🚑', true)
    this.retreat()
    if (attackResult !== OK && Math.random() < 0.04) {
      this.deleteCachedPath()
    }
    return
  }

  const path = this.getPathToAttack()

  if (path === ERR_NOT_FOUND) {
    this.leader.say('🚫', true)
    this.retreat()
    return
  }

  const nextPos = this.pos.getNextPosFromPath(path)

  if (nextPos) {
    visualizePath(path, nextPos)
    if (this.isAbleToStep(nextPos)) {
      const direction = this.pos.getDirectionTo(nextPos)
      this.move(direction)
      return
    }

    if (this.checkMyCreep(nextPos)) {
      this.deleteCachedPath()
      return
    }


    const targetStructure = this.getStructureToAttackAt(nextPos)

    const posToAttack = this.findPosToAttack(targetStructure)
    if (posToAttack) {
      const range = this.pos.getRangeTo(posToAttack)

      if (range > 0) {
        const direction = this.pos.getDirectionTo(posToAttack)
        this.move(direction)
        return
      }
    }

    if (this.dismantlePower > 0 && targetStructure) {
      this.dismantle(targetStructure)
    }

    return
  }
  this.deleteCachedPath()
  return
}

Quad.prototype.isDanger = function () {
  const damageArray = this.getDamageArray(this.moveCost)
  const healPower = this.healPower

  for (const creep of this.creeps) {
    for (const pos of creep.pos.getInRange(1)) {
      const packed = packCoord(pos.x, pos.y)
      const damage = damageArray[packed]
      const effectiveDamage = creep.getEffectiveDamage(damage)
      const netHeal = healPower - effectiveDamage
      if (netHeal < HEAL_BUFFER) {
        return true
      }
    }
  }
  return false
}

Quad.prototype.dismantle = function (structure) {
  this.prepareDismantle(structure)

  for (const creep of this.creeps) {
    if (creep.dismantlePower > 0) {
      creep.dismantle(structure)
    }
  }
}

Quad.prototype.prepareDismantle = function (structure) {
  const dismantlers = this.creeps.filter(creep => creep.dismantlePower > 0)

  let isFormed = true
  for (const creep of dismantlers) {
    if (creep.pos.getRangeTo(structure.pos) > 1) {
      isFormed = false
      break
    }
  }

  if (isFormed) {
    return true
  }

  const creepsSorted = [...this.creeps].sort((a, b) => b.dismantlePower - a.dismantlePower)
  const formation = this.formation
  const indexSorted = [0, 1, 2, 3].sort((a, b) => {
    const aPos = formation[a]
    const bPos = formation[b]
    if (!aPos) {
      return 1
    }
    if (!bPos) {
      return -1
    }
    return aPos.getRangeTo(structure.pos) - bPos.getRangeTo(structure.pos)
  })

  for (let i = 0; i < creepsSorted.length; i++) {
    const creep = creepsSorted[i]
    creep.memory.position = indexSorted[i]
  }

  this.formUp()
}

Quad.prototype.findPosToAttack = function (targetStructure) {

  if (!targetStructure) {
    return undefined
  }

  const candidatePositions = []

  for (const vector of ATTACK_TARGET_POSITION_VECTORS) {
    const x = vector.x + targetStructure.pos.x
    if (x < 0 || x > 49) {
      continue
    }
    const y = vector.y + targetStructure.pos.y
    if (y < 0 || y > 49) {
      continue
    }
    const pos = new RoomPosition(x, y, this.roomName)
    const range = this.pos.getRangeTo(pos)
    if (range > 1) {
      continue
    }
    if (range === 0) {
      return pos
    }
    candidatePositions.push(pos)
  }

  const targetPos = candidatePositions.find(pos => this.isAbleToStep(pos))
  return targetPos
}

Quad.prototype.getStructureToAttackAt = function (nextPos) {
  const structures = this.getStructuresOnSquarePositions(nextPos)
  if (structures.length === 0) {
    return
  }
  const targetStructure = getMinObject(structures, structure => structure.hits || Infinity)
  return targetStructure
}

Quad.prototype.getStructuresOnSquarePositions = function (pos) {
  const result = []
  const squarePositions = pos.getQuadSquarePositions()
  for (const pos of squarePositions) {
    const structuresOnPos = pos.lookFor(LOOK_STRUCTURES)
    for (const structure of structuresOnPos) {
      const structureType = structure.structureType
      if (ENEMY_OBSTACLE_OBJECT_TYPES.includes(structureType)) {
        result.push(structure)
      }
    }
  }
  return result
}

RoomPosition.prototype.getQuadSquarePositions = function () {
  const result = []
  for (const vector of FORMATION_VECTORS) {
    const x = this.x + vector.x
    if (x < 0 || x > 49) {
      continue
    }
    const y = this.y + vector.y
    if (y < 0 || y > 49) {
      continue
    }

    const pos = new RoomPosition(x, y, this.roomName)
    result.push(pos)
  }
  return result
}

Quad.prototype.getPathToAttack = function () {
  if (Math.random() < 0.003) {
    this.deleteCachedPath()
  }

  const cachedPath = this.getCachedPath()

  if (cachedPath !== undefined && this.pos.getNextPosFromPath(cachedPath)) {
    this.leader.say('🚜', true)
    return cachedPath
  }

  const quadCostArray = this.getBulldozeQuadCostArray()

  if (!quadCostArray) {
    return ERR_NOT_FOUND
  }

  const bulldozePath = this.getBulldozePath(quadCostArray)

  if (Array.isArray(bulldozePath)) {
    this.leader.say('🚜', true)
    return this.heap._path = bulldozePath
  }

  const skirmishPath = this.getSkirmishPath(quadCostArray)
  if (Array.isArray(skirmishPath)) {
    this.leader.say('🔫', true)
    return skirmishPath
  }

  this.leader.say('🚫', true)
  return ERR_NOT_FOUND
}

Quad.prototype.getCachedPath = function () {
  const cachedPath = this.heap._path
  if (!cachedPath) {
    return undefined
  }

  if (!Array.isArray(cachedPath)) {
    return undefined
  }

  if (cachedPath.length === 0) {
    return undefined
  }

  return cachedPath
}

RoomPosition.prototype.getNextPosFromPath = function (path) {
  for (let i = path.length - 1; i >= 0; i--) {
    const pos = path[i]
    if (this.isEqualTo(pos)) {
      return undefined
    }
    if (this.getRangeTo(pos) === 1) {
      return pos
    }
  }
  return undefined
}

Quad.prototype.deleteCachedPath = function () {
  delete this.heap._path
}

Quad.prototype.isAbleToStep = function (pos) {
  const costs = this.costMatrix
  if (costs.get(pos.x, pos.y) > EDGE_COST) {
    return false
  }

  const minX = Math.max(0, pos.x)
  const minY = Math.max(0, pos.y)

  const maxX = Math.min(49, pos.x + 1)
  const maxY = Math.min(49, pos.y + 1)

  const creeps = this.room.lookForAtArea(LOOK_CREEPS, minY, minX, maxY, maxX, true)
  const thisIds = this.creepIds
  const creepsFiltered = creeps.filter(looked => !looked.creep.pos.isRampart && !thisIds.includes(looked.creep.id))
  if (creepsFiltered.length > 0) {
    return false
  }

  const structures = this.room.lookForAtArea(LOOK_STRUCTURES, minY, minX, maxY, maxX, true)
  const structuresFiltered = structures.filter(looked => ENEMY_OBSTACLE_OBJECT_TYPES.includes(looked.structure.structureType))
  if (structuresFiltered.length > 0) {
    return false
  }

  return true
}

Quad.prototype.checkMyCreep = function (pos) {
  const minX = Math.max(0, pos.x)
  const minY = Math.max(0, pos.y)

  const maxX = Math.min(49, pos.x + 1)
  const maxY = Math.min(49, pos.y + 1)

  const creeps = this.room.lookForAtArea(LOOK_CREEPS, minY, minX, maxY, maxX, true)
  const isMyCreep = creeps.find(looked => !this.creepIds.includes(looked.creep.id) && looked.creep.my)

  if (isMyCreep) {
    return true
  }

  return false
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
    for (const vector of FORMATION_VECTORS_REVERSED) {
      const x = pos.x + vector.x
      if (x < 0 || x > 49) {
        continue
      }
      const y = pos.y + vector.y
      if (y < 0 || y > 49) {
        continue
      }
      const newPos = new RoomPosition(x, y, this.roomName)
      const goal = { pos: newPos, range }
      goals.push(goal)
    }
  }

  const dijkstra = this.room.dijkstra(this.pos, goals, quadCostArray)
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
    for (const vector of FORMATION_VECTORS_REVERSED) {
      const x = pos.x + vector.x
      if (x < 0 || x > 49) {
        continue
      }
      const y = pos.y + vector.y
      if (y < 0 || y > 49) {
        continue
      }
      const newPos = new RoomPosition(x, y, this.roomName)
      const goal = { pos: newPos, range: structureRange }
      goals.push(goal)
    }
  }

  const creepRange = 2
  for (const creep of hostileCreeps) {
    const pos = creep.pos
    for (const vector of FORMATION_VECTORS_REVERSED) {
      const x = pos.x + vector.x
      if (x < 0 || x > 49) {
        continue
      }
      const y = pos.y + vector.y
      if (y < 0 || y > 49) {
        continue
      }
      const newPos = new RoomPosition(x, y, this.roomName)
      const goal = { pos: newPos, range: creepRange }
      goals.push(goal)
    }
  }

  const dijkstra = this.room.dijkstra(this.pos, goals, quadCostArray)
  return this._skirmishPath = dijkstra
}

Quad.prototype.getBulldozeQuadCostArray = function () {
  if (this._bulldozeQuadCostArray) {
    return this._bulldozeQuadCostArray
  }

  const length = 2500

  const costArray = this.getCostArrayForBulldoze()

  const result = new Uint32Array(length)

  const damageArray = this.room.getTowerDamageArray()

  for (let i = 0; i < length; i++) {
    const netHeal = this.healPower - damageArray[i] - HEAL_BUFFER
    if (netHeal < 0) {
      result[i] = 0
      continue
    }
    result[i] = costArray[i]
  }

  const myCreeps = this.room.find(FIND_MY_CREEPS)

  for (const creep of myCreeps) {
    if (!this.names.includes(creep.name)) {
      for (const pos of creep.pos.getInRange(1)) {
        const packed = packCoord(pos.x, pos.y)
        result[packed] = 0
      }
    }
  }

  const quadCostArray = transformCostArrayForQuad(result, this.roomName)

  return this._bulldozeQuadCostArray = quadCostArray
}

Quad.prototype.getCostArrayForBulldoze = function () {
  if (Math.random() < 0.01) {
    delete this.heap._costArrayForBulldoze
  }

  if (this.heap._costArrayForBulldoze !== undefined) {
    return this.heap._costArrayForBulldoze
  }

  const power = this.attackPower + this.dismantlePower

  if (power === 0) {
    return undefined
  }

  const costArray = this.room.getCostArrayForBulldoze(power)

  return this.heap._costArrayForBulldoze = costArray
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
  let result = ERR_NOT_FOUND
  for (const creep of this.creeps) {
    if (creep.passiveRangedAttack() === OK) {
      result = OK
    }
  }
  return result
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
        return OK
      }

      const rangeConstant = range <= 1 ? 1 : range <= 2 ? 0.4 : 0.1
      const damage = rangedAttackPower * rangeConstant

      rangedMassAttackTotalDamage += damage
      continue
    }
  }

  if (rangedMassAttackTotalDamage >= rangedAttackPower) {
    this.rangedMassAttack()
    return OK
  }

  if (rangedAttackTarget) {
    this.rangedAttack(rangedAttackTarget)
    return OK
  }

  return ERR_NOT_FOUND
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
  const costs = this.costMatrix
  const damageArray = this.getDamageArray(this.moveCost)
  const packedNow = packCoord(this.pos.x, this.pos.y)
  const damageNow = damageArray[packedNow]

  const adjacentPositions = this.pos.getAtRange(1)
  const adjacentPositionsFiltered = adjacentPositions.filter(pos => {
    if (!this.isAbleToStep(pos)) {
      return false
    }
    if (costs.get(pos.x, pos.y) >= HALF_EDGE_COST) {
      return false
    }
    const packed = packCoord(pos.x, pos.y)
    const damage = damageArray[packed]
    if (damage > damageNow) {
      return false
    }
    return true
  })

  const posToRetreat = getMinObject(adjacentPositionsFiltered, (pos) => {
    const packed = packCoord(pos.x, pos.y)
    const addition = pos.getQuadSquarePositions().find(squarePos => squarePos.isSwamp) ? 100 : 0
    return damageArray[packed] + addition
  })

  if (!posToRetreat) {
    this.leader.say('noPos')
    const exitPositions = this.room.find(FIND_EXIT)
    const goals = exitPositions.map(pos => { return { pos, range: 2 } })
    this.moveInFormation(goals)
    return
  }

  const direction = this.pos.getDirectionTo(posToRetreat)
  this.room.visual.circle(posToRetreat, { radius: 0.5, fill: COLOR_NEON_YELLOW })
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

  if (this.pos.isInGoal(goals)) {
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

  this.leader.moveMy(goals, { ignoreCreeps: 20, ignoreMap: 2, visualize: true })

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
    if (!isEdgeCoord(creep.pos.x, creep.pos.y)
      && !isEdgeCoord(formerCreep.pos.x, formerCreep.pos.y)
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
  const damageArray = this.getDamageArray()

  this.creeps.forEach(creep => {
    const packed = packCoord(creep.pos.x, creep.pos.y)
    const damage = damageArray[packed]
    creep.virtualHits = creep.hits - creep.getEffectiveDamage(damage)
  })
  const creeps = [...this.creeps].sort((a, b) => b.healPower - a.healPower)
  for (const creep of creeps) {
    if (creep.healPower === 0) {
      continue
    }
    const mostInjuredCreep = getMinObject(this.creeps, (a) => a.virtualHits)

    creep.heal(mostInjuredCreep)

    mostInjuredCreep.virtualHits += creep.healPower
  }
}

Quad.prototype.formUp = function () {
  if (this.isCompact && this.fatigue > 0) {
    return
  }

  const creeps = this.creeps
  const formation = this.formation
  for (let i = 0; i < creeps.length; i++) {
    const creep = creeps[i]
    const index = getIndex(creep, i)
    const pos = formation[index]
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

  const x = this.pos.x
  const y = this.pos.y

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
    const index = getIndex(creep, i)
    if (creep.pos.roomName !== this.roomName) {
      continue
    }
    if (!formation[index]) {
      continue
    }
    if (!creep.pos.isEqualTo(formation[index])) {
      return false
    }
  }
  return true
}

Quad.prototype.getCreeps = function () {
  if (this._creeps) {
    return this._creeps
  }

  const result = new Array(4)
  for (let i = 0; i < 4; i++) {
    const name = this.names[i]
    const creep = Game.creeps[name]
    if (!creep || creep.spawning) {
      continue
    }
    const index = getIndex(creep, i)
    result[index] = creep
  }

  return this._creeps = result.filter(creep => creep !== undefined)
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
        cost += newCost
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

      if (isEdgeCoord(x, y) && basicCosts.get(x, y) < HALF_EDGE_COST) {
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
          continue
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

  const costsNow = costs.get(this.pos.x, this.pos.y)

  if (costsNow === 255) {
    this.leader.say('255cost')
    this.indivisualMove(goals)
    return
  }

  const search = this.getSearchTo(goals)
  if (search.incomplete) {
    this.indivisualMove(goals)
    return
  }

  if (!this.isFormed) {
    if (costsNow < HALF_EDGE_COST) {
      this.leader.say('form!', true)
      this.formUp()
      return
    }
    this.indivisualMove(goals)
    return
  }


  const path = search.path
  visualizePath(path)

  const nextPos = path[0]

  if (isEdgeCoord(this.pos.x, this.pos.y) && isEdgeCoord(nextPos.x, nextPos.y)) {
    return
  }

  if (nextPos && this.isAbleToStep(nextPos)) {
    const direction = this.pos.getDirectionTo(nextPos)
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
  const search = PathFinder.search(this.pos, goals, {
    roomCallback: (roomName) => getQuadCostMatrix(roomName)
  })

  return search
}

Quad.prototype.move = function (direction) {
  if (this.fatigue > 0) {
    return ERR_TIRED
  }
  for (const creep of this.creeps) {
    if (!isEdgeCoord(creep.pos.x, creep.pos.y) && !isEdgeCoord(this.pos.x, this.pos.y) && creep.pos.getRangeTo(this.pos) > 1) {
      continue
    }
    creep.move(direction)
  }
  return OK
}

Quad.prototype.getIsCompact = function () {
  const creeps = this.creeps
  for (let i = 0; i < creeps.length - 1; i++) {
    const creepA = creeps[i]
    for (let j = i + 1; j < creeps.length; j++) {
      const creepB = creeps[j]
      if (!creepA || !creepB) {
        continue
      }
      if (creepA.pos.getRangeTo(creepB.pos) > 1) {
        return false
      }
    }
  }
  return true
}

Quad.prototype.getDamageArray = function () {
  if (this._damageArray) {
    return this._damageArray
  }

  const costArray = new Uint16Array(2500)

  const towerDamageArray = this.room.getTowerDamageArray()

  for (let i = 0; i < 2500; i++) {
    costArray[i] = towerDamageArray[i]
  }

  const hostileCreeps = this.room.find(FIND_HOSTILE_CREEPS)
  for (const creep of hostileCreeps) {
    if (creep.attackPower > 0) {
      for (const pos of creep.pos.getInRange(1)) {
        const packed = packCoord(pos.x, pos.y)
        costArray[packed] += creep.attackPower
        costArray[packed] += creep.rangedAttackPower
      }
    }
    if (creep.rangedAttackPower > 0) {
      for (let range = 2; range <= 3; range++) {
        for (const pos of creep.pos.getAtRange(range)) {
          const packed = packCoord(pos.x, pos.y)
          costArray[packed] += creep.rangedAttackPower
        }
      }
    }
  }
  return this._damageArray = costArray
}

function getIndex(creep, index) {
  const position = creep.memory.position
  if (position !== undefined) {
    return position
  }
  return index
}