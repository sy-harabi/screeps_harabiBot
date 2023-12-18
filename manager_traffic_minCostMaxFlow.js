global.TRAFFIC_TEST = true

let Graph = require('./util_graph')

const SOURCE = -1
const SINK = -2

const COST_BLOCKED = 2
const COST_EXCUSE = 0
const COST_STOP_WORK = 1

Room.prototype.manageTraffic = function () {

  const CPUbefore = TRAFFIC_TEST ? Game.cpu.getUsed() : undefined

  const isMy = this.isMy

  if (TRAFFIC_TEST && isMy) {
    console.log('------------------------------------------')
    checkCPU()
  }

  const creeps = this.find(FIND_MY_CREEPS)

  const initialFlow = new Graph(new Set([SOURCE, SINK]))

  const posVertices = []

  const costs = (!this.memory.militaryThreat || !this.isWalledUp) ? this.basicCostmatrix : this.defenseCostMatrix

  for (let i = 0; i < creeps.length; i++) {
    const creep = creeps[i]
    const vertice = packCreepIndexToVertice(i)
    initialFlow.addVertex(vertice)

    const currentPosVertex = packPosToVertice(creep.pos.x, creep.pos.y)
    initialFlow.addVertex(currentPosVertex)

    if (creep.getNextPos()) {
      initialFlow.setEdge(SOURCE, vertice)
      initialFlow.setEdge(vertice, currentPosVertex, { cost: COST_BLOCKED })
      initialFlow.setEdge(currentPosVertex, SINK)
    } else {
      initialFlow.setEdge(SINK, currentPosVertex, { cost: -0 })
      initialFlow.setEdge(currentPosVertex, vertice, { cost: -0 })
      initialFlow.setEdge(vertice, SOURCE, { cost: -0 })
    }

    creep.setMoveIntent(costs, initialFlow, vertice, posVertices)
  }

  for (const posVertex of posVertices) {
    if (initialFlow.getEdge(SINK, posVertex) || initialFlow.getEdge(posVertex, SINK)) {
      continue
    }
    initialFlow.setEdge(posVertex, SINK)
  }

  if (TRAFFIC_TEST && isMy) {
    checkCPU(`set Graph`)
  }


  const result = initialFlow.minimumCostMaximumFlowWithUnitCapacity(SOURCE, SINK, isMy)

  if (TRAFFIC_TEST && isMy) {
    checkCPU(`MCMF`)
  }


  let numMoved = 0

  for (let i = 0; i < creeps.length; i++) {
    const vertice = packCreepIndexToVertice(i)

    const posVertex = result.get(vertice)

    if (posVertex) {
      const creep = creeps[i]
      const pos = parseVerticeToPos(posVertex)
      const direction = creep.pos.getDirectionTo(pos.x, pos.y)
      if (creep.move(direction) === OK) {
        numMoved++
      }
    }
  }

  if (TRAFFIC_TEST && isMy) {
    const usedCPU = Game.cpu.getUsed() - CPUbefore - numMoved * 0.2
    console.log(`use ${usedCPU.toFixed(2)} cpu for ${numMoved} moves`)
    console.log(`use ${(usedCPU / numMoved).toFixed(2)} cpu for each move`)
  }
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

Creep.prototype.setMoveIntent = function (costs, graph, creepVertex, posVertices) {

  const nextPos = this.getNextPos()
  if (nextPos) {
    const nexPosVertex = packPosToVertice(nextPos.x, nextPos.y)
    graph.addVertex(nexPosVertex)
    graph.setEdge(creepVertex, nexPosVertex)
    posVertices.push(nexPosVertex)
    return
  }

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

      const posVertex = packPosToVertice(pos.x, pos.y)

      graph.addVertex(posVertex)
      graph.setEdge(creepVertex, posVertex, { cost: COST_EXCUSE })
      posVertices.push(posVertex)
    }

    for (const pos of positionsOutOfRange) {
      const posVertex = packPosToVertice(pos.x, pos.y)

      graph.addVertex(posVertex)
      graph.setEdge(creepVertex, posVertex, { cost: COST_STOP_WORK })
      posVertices.push(posVertex)
    }
    return
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
    const posVertex = packPosToVertice(pos.x, pos.y)

    graph.addVertex(posVertex)
    graph.setEdge(creepVertex, posVertex, { cost: COST_EXCUSE })
    posVertices.push(posVertex)
  }
};

function packCreepIndexToVertice(index) {
  return index + (1 << 12)
}

function packPosToVertice(x, y) {
  return (y << 6) | x
}

function parseVerticeToPos(vertice) {
  return { x: vertice & 0x3f, y: vertice >> 6 }
}