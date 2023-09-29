const TEST = false
const IMPORTANT_STRUCTURE_TYPES = ['spawn', 'tower']
const ENEMY_OBSTACLE_OBJECT_TYPES = [...OBSTACLE_OBJECT_TYPES, 'rampart']

const FORMATION_VECTORS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 }
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
    this.memory.quadSpawned = true
  }

  // spawn creeps
  if (!this.memory.quadSpawned) {
    for (const name of names) {
      const creep = Game.creeps[name]
      if (!creep) {
        base.requestQuadMember(name, this)
      }
    }
    return
  }

  // check boost
  if (!TEST && !this.memory.quadBoosted) {
    for (const creep of quad.creeps) {
      if (creep.memory.boosted === false) {
        return
      }
    }
    this.memory.quadBoosted = true
  }

  // if a member dies, spread out
  if (quad.creeps.length < 4) {
    quad.spread()
    delete this.memory
    this.remove()
    return
  }

  this.memory.status = this.memory.status || 'travel'

  quad.leader.say(this.memory.status, true)

  // move to target room
  const targetRoomName = this.pos.roomName
  const rallyExit = quad.getRallyExit(targetRoomName)

  if (this.memory.status === 'travel') {
    const rallyRoomCenterPos = new RoomPosition(25, 25, rallyExit.roomName)

    if (quad.snakeTravel(rallyRoomCenterPos, 20) !== 'finished') {
      return
    }

    this.memory.status = 'engage'
    return
  }

  if (this.memory.status === 'engage') {
    if (quad.roomName !== targetRoomName) {
      quad.quadHeal()
      const targetRoomCenterPos = new RoomPosition(25, 25, targetRoomName)
      const result = quad.moveInFormation({ pos: targetRoomCenterPos, range: 22 })
      if (result === ERR_NO_PATH) {
        for (const creep of this.creeps) {
          creep.moveMy(targetRoomCenterPos, { range: 22 })
        }
        return
      }
      return
    }
    quad.attackRoom(targetRoomName)
    return
  }
}

Room.prototype.requestQuadMember = function (name, flag) {
  const flagName = flag.name
  const targetRoomName = flag.pos.roomName

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
    body = [MOVE, MOVE, RANGED_ATTACK, HEAL]
  }

  const memory = { role: 'quad', base: this.name, boosted: false, flagName, targetRoomName }

  const options = { priority: 1 }
  if (!TEST) {
    options.boostResources = ['XZHO2', 'XGHO2', 'XLHO2', 'XKHO2',]
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
    return this._hitsMax = this.creeps.map(creep => creep.hitsMax).reduce((accumulator, currentValue) => accumulator + currentValue)
  }

  get hits() {
    if (this._hits) {
      return this._hits
    }
    return this._hits = this.creeps.map(creep => creep.hits).reduce((accumulator, currentValue) => accumulator + currentValue.hits)
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
    const result = this.creeps.map(creep => creep.rangedAttackPower).reduce((acc, curr) => acc + curr)
    return this._rangedAttackPower = result
  }

  get healPower() {
    if (this._healPower) {
      return this._healPower
    }
    const result = this.creeps.map(creep => creep.healPower).reduce((acc, curr) => acc + curr)
    return this._healPower = result
  }

  get isSnakeFormedUp() {
    if (this._isSnakeFormedUp) {
      return this._isSnakeFormedUp
    }
    return this._isSnakeFormedUp = this.getIsSnakeFormedUp()
  }
}

Quad.prototype.attackRoom = function (targetRoomName) {

  this.quadHeal()
  this.passiveRangedAttack()

  if (this.healPower < (this.hitsMax - this.hits)) {
    this.retreat(targetRoomName)
    return
  }

  if (this.room.controller.safeMode > 0) {
    this.retreat(targetRoomName)
    return
  }

  if (isValidCoord(this.leader.pos.x, this.leader.pos.y) && !this.isFormed) {
    this.formUp()
    return
  }

  const quadCostArray = this.getBulldozeQuadCostArray()

  const packed = packCoord(this.leader.pos.x, this.leader.pos.y)
  if (quadCostArray[packed] === 0) {
    this.retreat(targetRoomName)
    return
  }

  const path = this.getBulldozePath(quadCostArray)

  if (path === ERR_NOT_FOUND) {
    this.retreat(targetRoomName)
    return
  }

  const nextPos = path[0]

  if (nextPos) {
    if (this.fatigue > 0) {
      return
    }
    this.room.visual.poly(path, { stroke: 'red', strokeWidth: 0.3 })
    const structures = this.room.lookForAtArea(LOOK_STRUCTURES, nextPos.y, nextPos.x, nextPos.y + 1, nextPos.x + 1, true)
    const structuresFiltered = structures.filter(looked => ENEMY_OBSTACLE_OBJECT_TYPES.includes(looked.structure.structureType))
    const creeps = this.room.lookForAtArea(LOOK_CREEPS, nextPos.y, nextPos.x, nextPos.y + 1, nextPos.x + 1, true)
    const creepsFiltered = creeps.filter(looked => !looked.creep.my)

    if (structuresFiltered.length > 0 || creepsFiltered.length > 0) {
      return
    }

    const direction = this.leader.pos.getDirectionTo(nextPos)
    this.move(direction)
    return
  }

  const hostileCreeps = this.room.find(FIND_HOSTILE_CREEPS)
  const hostileStructures = this.room.find(FIND_HOSTILE_STRUCTURES).filter(structure => {
    if (structure.structureType === 'controller') {
      return false
    }
    if (!structure.store) {
      return true
    }
    if (structure.store.getUsedCapacity() > 10000) {
      return false
    }
    return true
  })
  const hostiles = [...hostileCreeps, ...hostileStructures]
  const hostile = this.leader.pos.findClosestByRange(hostiles)
  if (hostile) {
    this.moveInFormation({ pos: hostile.pos, range: 2 })
  }

  this.moveInFormation({ pos: this.room.controller.pos, range: 3 })
}

Quad.prototype.getBulldozePath = function (quadCostArray) {
  if (this._bulldozePath) {
    return this._bulldozePath
  }

  const hostileStructures = this.room.find(FIND_HOSTILE_STRUCTURES)
  const importantStructures = hostileStructures.filter(structure => IMPORTANT_STRUCTURE_TYPES.includes(structure.structureType))

  const goals = importantStructures.map(structure => {
    return { pos: structure.pos, range: 0 }
  })

  const dijkstra = this.room.dijkstra(this.leader.pos, goals, quadCostArray)
  return this._bulldozePath = dijkstra
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
    const netHeal = this.healPower - damageArray[i]
    if (netHeal < 0) {
      costArray[i] = 0
    }
  }

  const quadCostArray = transformCostArrayForQuad(costArray)

  return this._bulldozeQuadCostArray = quadCostArray
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
    const hostileCreeps = pos.lookFor(LOOK_CREEPS).filter(creep => !creep.my)
    const hostileCreep = hostileCreeps ? hostileCreeps[0] : undefined
    const hostileStructure = getMaxObject(pos.lookFor(LOOK_STRUCTURES).filter(structure => structure.my === false), (structure) => structure.hits)

    if (!hostileCreep && !hostileStructure) {
      continue
    }

    if (!hostileStructure) {
      if (rangedAttackTarget === undefined || hostileCreep.hits < rangedAttackTarget.hits) {
        rangedAttackTarget = hostileCreep
      }
    } else if (rangedAttackTarget === undefined || hostileStructure.hits < rangedAttackTarget.hits) {
      rangedAttackTarget = hostileStructure
    }

    const range = this.pos.getRangeTo(pos)
    if (range <= 1) {
      this.rangedMassAttack()
      return
    }
    const rangeConstant = range <= 1 ? 1 : range <= 2 ? 0.4 : 0.1
    const damage = rangedAttackPower * rangeConstant
    rangedMassAttackTotalDamage += damage
  }

  if (rangedMassAttackTotalDamage >= rangedAttackPower) {
    this.rangedMassAttack()
    return
  }

  if (rangedAttackTarget) {
    this.rangedAttack(rangedAttackTarget)
  }
}

Quad.prototype.retreat = function (targetRoomName) {
  this.leader.say('retreat!', true)
  const rallyExit = this.getRallyExit(targetRoomName)
  const rallyPosition = new RoomPosition(25, 25, rallyExit.roomName)
  this.moveInFormation({ pos: rallyPosition, range: 20 })
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

      // ignoreMap이 1 이상이면 목적지는 무조건 간다
      if (roomName === targetRoomName) {
        return 1
      }

      // ignoreMap이 2 미만이면 inaccessible로 기록된 방은 쓰지말자
      if (Memory.map[roomName] && Memory.map[roomName].inaccessible > Game.time) {
        return 25
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

Quad.prototype.snakeTravel = function (target, range = 0) {
  const targetPos = target.pos || target

  if (this.leader.pos.getRangeTo(targetPos) <= range) {
    delete this.leader.memory.snakeFormed
    return 'finished'
  }

  if (Game.time % 10 === 0) {
    delete this.leader.memory.snakeFormed
  }

  if (!this.leader.memory.snakeFormed && this.isSnakeFormedUp) {
    this.leader.memory.snakeFormed = true
  }

  if (!this.leader.memory.snakeFormed) {
    this.formSnake()
    return ERR_BUSY
  }

  if (this.fatigue > 0) {
    return ERR_BUSY
  }

  this.leader.moveMy(targetPos, { range, ignoreCreeps: 20 })

  for (i = 1; i < this.creeps.length; i++) {
    const formerCreep = this.creeps[i - 1]
    const creep = this.creeps[i]
    if (creep.pos.roomName !== formerCreep.pos.roomName || creep.pos.getRangeTo(formerCreep) > 1) {
      creep.moveMy(formerCreep)
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
      creep.moveMy(formerCreep, { range: 1 })
    }
  }
}

Quad.prototype.spread = function () {
  const base = this.leader.memory.base
  const colonyName = this.leader.memory.targetRoomName

  const memory = {
    role: 'colonyDefender',
    base: base,
    colony: colonyName
  }

  for (const creep of this.creeps) {
    creep.memory = memory
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
    creep.moveMy(pos)
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
  for (let i = 0; i < creeps.length; i++) {
    const creep = creeps[i]
    if (!isValidCoord(creep.pos.x, creep.pos.y)) {
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
    if (creep) {
      result.push(creep)
    }
  }

  return (this._creeps = result)
}

function transformCostArrayForQuad(costArray) {
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
          continue
        }
        cost = Math.max(cost, newCost - 1)
      }
      result[packed] = cost
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

      if (!isValidCoord(x, y) && basicCosts.get(x, y) < 10) {
        basicCosts.set(x, y, 10)
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
          continue
        }
        cost = Math.max(cost, basicCosts.get(newX, newY) - 1)
      }
      costs.set(x, y, cost)
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
  const search = this.getSearchTo(goals)

  if (search.incomplete) {
    return ERR_NO_PATH
  }

  const path = search.path

  const costs = getQuadCostMatrix(this.roomName)

  if (costs.get(this.leader.pos.x, this.leader.pos.y) <= 5 && !this.isFormed) {
    this.leader.say('form!', true)
    this.formUp()
    return
  }

  new RoomVisual(this.roomName).line(this.leader.pos, path[0])
  for (let i = 0; i < path.length - 1; i++) {
    if (path[i].roomName === path[i + 1].roomName) {
      new RoomVisual(path[i].roomName).line(path[i], path[i + 1])
    }
  }

  const direction = this.leader.pos.getDirectionTo(path[0])
  this.move(direction)
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
}