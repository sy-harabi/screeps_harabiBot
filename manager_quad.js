const FORMATION_VECTORS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 }
]

Flag.prototype.manageQuad = function () {
  const base = this.room
  const names = [0, 1, 2, 3].map(number => `${this.name} ${number}`)
  for (const name of names) {
    const creep = Game.creeps[name]
    if (!creep) {
      base.requestQuadMember(name, this.name)
      return
    }
  }

  const quad = new Quad(names)

  for (const pos of quad.formation) {
    this.room.visual.circle(pos)
  }

  const path = quad.getPathTo(this.pos)
  if (path === ERR_NO_PATH) {
    quad.leader.moveMy(this.pos)
    return
  }

  const costs = quad.costMatrix
  if (costs.get(quad.leader.pos.x, quad.leader.pos.y) === 255) {
    quad.leader.moveMy(this.pos)
    return
  }

  if (!quad.isFormed) {
    quad.formUp()
    return
  }

  quad.leader.moveMy(this.pos)
  this.room.visual.poly(path)
  const direction = quad.leader.pos.getDirectionTo(path[0])

  quad.move(direction)
}

Room.prototype.requestQuadMember = function (name, flagName) {
  const body = [MOVE]
  const memory = { role: 'quad', base: this.name, flagName }
  const request = new RequestSpawn(body, name, memory, { priority: 1 })

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
    return this._hitsMax = this.creeps.reduce((accumulator, currentValue) => accumulator + currentValue.hits)
  }

  get hits() {
    if (this._hits) {
      return this._hits
    }
    return this._hits = this.creeps.reduce((accumulator, currentValue) => accumulator + currentValue.hits)
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

  get costMatrix() {
    if (this._costMatrix) {
      return this._costMatrix
    }
    return this._costMatrix = this.getCostMatrix()
  }
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

Quad.prototype.preHeal = function () {

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

    if (!isValidCoord(newX, newY)) {
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
  for (let i = 0; i < creeps.length; i++) {
    const creep = creeps[i]
    if (!creep.pos.isEqualTo(formation[i])) {
      return false
    }
  }
  return true
}

Quad.prototype.getCostMatrix = function () {
  const basicCosts = this.room.basicCostmatrix.clone()
  const costs = new PathFinder.CostMatrix
  const terrain = new Room.Terrain(this.room.name)
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      const terrainMask = terrain.get(x, y)
      if (terrainMask === TERRAIN_MASK_WALL) {
        basicCosts.set(x, y, 255)
        continue
      }
      if (terrainMask === TERRAIN_MASK_SWAMP && basicCosts.get(x, y) < 5) {
        basicCosts.set(x, y, 5)
        continue
      }
    }
  }

  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      let cost = 0
      for (const vector of FORMATION_VECTORS) {
        const newX = vector.x + x
        const newY = vector.y + y
        if (!isValidCoord(newX, newY)) {
          continue
        }
        cost = Math.max(cost, basicCosts.get(newX, newY))
      }
      costs.set(x, y, cost)
    }
  }
  return costs
}

Quad.prototype.getPathTo = function (target, range) {
  const targetPos = target.pos || target
  const search = PathFinder.search(this.leader.pos, { pos: targetPos, range }, {
    maxRooms: 1,
    roomCallback: () => this.costMatrix
  })
  if (search.incomplete) {
    return ERR_NO_PATH
  }
  return search.path
}

Quad.prototype.move = function (direction) {
  if (this.fatigue > 0) {
    return ERR_TIRED
  }
  for (const creep of this.creeps) {
    creep.move(direction)
  }
}