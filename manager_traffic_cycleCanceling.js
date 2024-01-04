global.TRAFFIC_TEST = false

let Graph = require('./util_graph')

const SOURCE = -1
const SINK = -2

Room.prototype.manageTraffic = function () {
  checkCPU('manageTraffic')

  const creeps = this.find(FIND_MY_CREEPS)

  const initialFlow = new Graph()
  initialFlow.addVertex(SOURCE) // source
  initialFlow.addVertex(SINK) // sink

  for (let i = 0; i < creeps.length; i++) {
    const creep = creeps[i]

    const moveIntent = creep.getMoveIntent()

    const vertice = packCreepIndexToVertice(i)
    initialFlow.addVertex(vertice)

    initialFlow.setEdge(SOURCE, vertice, { flow: 1 })

    for (const intent of moveIntent) {
      const adjacent = packPosToVertice(intent.pos.x, intent.pos.y)
      initialFlow.addVertex(adjacent)

      if (creep.pos.isEqualTo(intent.pos)) {
        const options = { flow: 1, cost: intent.cost }
        initialFlow.setEdge(vertice, adjacent, options)
        initialFlow.setEdge(adjacent, SINK, { flow: 1 })
        continue
      }

      const options = { flow: 0, cost: intent.cost }
      initialFlow.setEdge(vertice, adjacent, options)

      const edgeBefore = initialFlow.getEdge(adjacent, SINK)
      if (!edgeBefore) {
        initialFlow.setEdge(adjacent, SINK, { flow: 0 })
      }
    }
  }

  checkCPU('make Graph')

  const result = initialFlow.cycleCanceling(SINK)

  checkCPU('cycleCanceling')

  let numMoved = 0

  for (let i = 0; i < creeps.length; i++) {
    const vertice = packCreepIndexToVertice(i)
    const adjacents = result.getAdjacents(vertice)
    for (const adjacent of adjacents) {
      const edge = result.getEdge(vertice, adjacent)
      if (edge.flow > 0) {
        const creep = creeps[i]
        const pos = parseVerticeToPos(adjacent)
        if (!creep.pos.isEqualTo(pos.x, pos.y)) {
          const direction = creep.pos.getDirectionTo(pos.x, pos.y)
          if (creep.move(direction) === OK) {

            numMoved++
          }
        }
        break
      }
    }
  }

  checkCPU('move')
};

Creep.prototype.getStuckTick = function () {
  return this.heap.stuck || 0
}

Creep.prototype.setNextPos = function (pos) {
  this._nextPos = pos
}

Creep.prototype.getNextPos = function () {
  return this._nextPos
}

Creep.prototype.setWorkingInfo = function (pos, range) {
  this._workingInfo = { pos, range }
}

Creep.prototype.getWorkingInfo = function () {
  return this._workingInfo
}

Creep.prototype.getMoveIntent = function () {
  if (this._moveIntent !== undefined) {
    return this._moveIntent;
  }

  const result = [];
  const costs = (!this.room.memory.militaryThreat || !this.room.isWalledUp) ? this.room.basicCostmatrix : this.room.defenseCostMatrix

  const nextPos = this.getNextPos()
  if (nextPos) {
    result.push({ pos: this.pos, cost: 5 })
    result.push({ pos: nextPos, cost: 0 });
    return this._moveIntent = result
  }

  result.push({ pos: this.pos, cost: 0 })

  const adjacents = this.pos.getAtRange(1)

  const workingInfo = this.getWorkingInfo()

  if (workingInfo) {
    const targetPos = workingInfo.pos;
    const range = workingInfo.range;
    const positionsOutOfRange = []

    for (const pos of adjacents) {
      if (pos.isWall) {
        continue
      }
      if (isEdgeCoord(pos.x, pos.y)) {
        continue
      }

      if (costs.get(pos.x, pos.y) > 1) {
        continue;
      }

      if (pos.getRangeTo(targetPos) > range) {
        positionsOutOfRange.push(pos)
        continue;
      }

      result.push({ pos: pos, cost: 1 });
    }

    for (const pos of positionsOutOfRange) {
      result.push({ pos: pos, cost: 5 });
    }

    return this._moveIntent = result
  }

  for (const pos of adjacents) {
    if (pos.isWall) {
      continue
    }
    if (isEdgeCoord(pos.x, pos.y)) {
      continue
    }
    if (costs.get(pos.x, pos.y) > 1) {
      continue;
    }
    result.push({ pos: pos, cost: 1 });
  }

  return this._moveIntent = result
};

function isVerticePos(vertice) {
  return vertice - (1 << 12)
}

function packCreepIndexToVertice(index) {
  return index + (1 << 12)
}

function parseVerticeToCreepIndex(vertice) {
  return (vertice << 12) - 1
}

function packPosToVertice(x, y) {
  return (y << 6) | x
}

function parseVerticeToPos(vertice) {
  return { x: vertice & 0x3f, y: vertice >> 6 }
}