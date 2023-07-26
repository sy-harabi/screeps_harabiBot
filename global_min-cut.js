global.MAX_POS = 1 << 12
global.POS_MASK = MAX_POS - 1

global.OUT_NODE = 1 << 12

global.MAX_NODE = 1 << 13
global.NODE_MASK = MAX_NODE - 1

global.INSIDE_EDGE = 1 << 16

global.DIR_SHIFT = 13

global.EIGHT_DELTA = [
  { x: 0, y: -1 }, // TOP
  { x: 1, y: -1 }, // TOP_RIGHT
  { x: 1, y: 0 }, // RIGHT
  { x: 1, y: 1 }, // BOTTOM_RIGHT
  { x: 0, y: 1 }, // BOTTOM
  { x: -1, y: 1 }, // BOTTOM_LEFT
  { x: -1, y: 0 }, // LEFT
  { x: -1, y: -1 }, // TOP_LEFT
];

global.packPosToVertice = function (x, y) {
  return (y << 6) | x
}

global.parseVerticeToPos = function (vertice) {
  return { x: vertice & 0x3f, y: vertice >> 6 }
}

global.isPointInRoom = function (pos) {
  return pos.x >= 0 && pos.x <= 49 && pos.y >= 0 && pos.y <= 49
}

global.pointAdd = function (pos, vector) {
  return { x: pos.x + vector.x, y: pos.y + vector.y }
}

global.surroundingPoses = function (pos) {
  return EIGHT_DELTA.map(vector => pointAdd(pos, vector)).filter(pos => isPointInRoom(pos))
}

Room.prototype.mincutToExit = function (sources, costMap) { //soucres : array of roomPositions, costMap : costMatrix which indicates cost of that position.
  // an array indicating whether a point is at the exit or near the exit
  const exit = new Uint8Array(MAX_NODE)
  for (const exitPos of this.find(FIND_EXIT)) {
    for (const pos of exitPos.getInRange(2)) {
      if (costMap.get(pos.x, pos.y) === 255) {
        continue
      }
      exit[packPosToVertice(pos.x, pos.y) | OUT_NODE] = 1
    }
  }

  const sourceVertices = new Set()
  for (const pos of sources) {
    const vertice = packPosToVertice(pos.x, pos.y)
    if (exit[vertice]) {
      console.log(`Invalid source ${pos.x}, ${pos.y}`)
      return
    }
    if (costMap.get(pos.x, pos.y) === 255) {
      continue
    }
    sourceVertices.add(vertice)
  }

  // setup the capacity map, the keys are the encoded edges
  // 0-12 bits    - source node
  //   0-11 bits      - the packed location of the source node
  //   12 bit         - s-node or the d-node
  // 13-16 bits   - direction of the edge, 0-7 means the edge goes to another
  // location, while 8 means the edge goes from s-node to d-node or vice versa
  let capacityMap = new Int32Array(1 << 17)
  capacityMap.fill(0)
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      if (costMap.get(x, y) === 255) {
        continue
      }

      const vertice = packPosToVertice(x, y)
      capacityMap[vertice | INSIDE_EDGE] = costMap.get(x, y) // edge from a tile to itself

      for (let direction = 0; direction < EIGHT_DELTA.length; direction++) {
        const nextPoint = pointAdd({ x, y }, EIGHT_DELTA[direction])
        if (!isPointInRoom(nextPoint)) {
          continue
        }

        if (costMap.get(nextPoint.x, nextPoint.y) === 255) {
          continue
        }
        capacityMap[(vertice | OUT_NODE) | (direction << DIR_SHIFT)] = 10000 //almost infinite
      }
    }
  }

  let i = 0
  let levels = []
  while (i < 50) {
    const result = getLevels(sourceVertices, exit, capacityMap)
    levels = result.levels
    const cuts = result.cuts

    if (cuts.length) {

      const insides = result.insides
      const outsides = result.outsides
      return { cuts, insides, outsides }
    }
    getBlockingFlow(sourceVertices, exit, capacityMap, levels)
    i++
  }
  return []
}

global.getBlockingFlow = function (sourceVertices, exit, capacityMap, levels) {
  for (const sourceVertice of sourceVertices) {
    while (true) {
      const maxFlow = getDFS(sourceVertice, exit, capacityMap, levels, 10000)
      if (maxFlow === 0) {
        break
      }
    }
  }
}

global.getDFS = function (nodeNow, exit, capacityMap, levels, maxFlow, checkIndex) {
  if (!checkIndex) {
    checkIndex = new Uint8Array(MAX_NODE)
    checkIndex.fill(0)
  }
  if (exit[nodeNow]) {
    return maxFlow
  }
  const adjacentsEdges = getEdgesFrom(nodeNow)
  for (; checkIndex[nodeNow] < getEdgesFrom(nodeNow).length; checkIndex[nodeNow]++) {
    const edge = adjacentsEdges[checkIndex[nodeNow]]
    const nextNode = getEdgeEndNode(edge)
    if (capacityMap[edge] && (levels[nextNode] - levels[nodeNow] == 1)) {
      let newMaxFlow = getDFS(nextNode, exit, capacityMap, levels, Math.min(maxFlow, capacityMap[edge]), checkIndex)
      if (newMaxFlow > 0) {
        capacityMap[edge] -= newMaxFlow
        capacityMap[getReverseEdge(edge)] += newMaxFlow
        return newMaxFlow
      }
    }
  }
  return 0
}

global.getLevels = function (sourceVertices, exit, capacityMap) {
  let connected = false
  const cuts = []
  const outsides = []
  const insides = []
  const queue = []
  const levels = new Int16Array(MAX_NODE)
  levels.fill(-1)

  for (const sourceVertice of sourceVertices) { // make vertices to nodes
    levels[sourceVertice] = 0
    queue.push(sourceVertice)
  }
  while (queue.length) {
    const nodeNow = queue.shift()
    for (const edge of getEdgesFrom(nodeNow)) {
      const nextNode = getEdgeEndNode(edge)
      if (capacityMap[edge] > 0 && levels[nextNode] === -1) {
        levels[nextNode] = levels[nodeNow] + 1
        queue.push(nextNode)
        if (exit[nextNode]) {
          connected = true
        }
      }

    }
  }

  if (!connected) {
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        const node = packPosToVertice(x, y)
        if (levels[node] !== -1 && levels[node | OUT_NODE] === -1) {
          cuts.push(node & POS_MASK)
          continue
        }
        if (levels[node] === -1) {
          outsides.push(node & POS_MASK)
          continue
        }
        insides.push(node & POS_MASK)
      }
    }
  }
  return { levels, cuts, insides, outsides }
}

global.getEdgesFrom = function (node) {
  const result = []
  for (i = 0; i <= 8; i++) {
    result.push(node | (i << DIR_SHIFT))
  }
  return result
}

global.getEdgeEndNode = function (edge) {
  if (edge & INSIDE_EDGE) { // inner tile edge
    return (edge ^ OUT_NODE) & NODE_MASK
  }
  const fromVertice = edge & POS_MASK
  const pos = parseVerticeToPos(fromVertice)
  const direction = edge >> DIR_SHIFT
  const newPoint = pointAdd(pos, EIGHT_DELTA[direction])
  return packPosToVertice(newPoint.x, newPoint.y) | ((edge & OUT_NODE) ^ OUT_NODE)
}

global.getReverseEdge = function (edge) {
  if (edge & INSIDE_EDGE) {
    return edge ^ OUT_NODE
  }
  const direction = ((edge >> DIR_SHIFT) + 4) % 8
  return getEdgeEndNode(edge) | (direction << DIR_SHIFT)
}