const profiler = require('screeps-profiler');

class Graph {
  constructor(vertices, edges) {
    this.vertices = vertices || new Set()
    this.edges = edges || new Map()
  }

  copy() {
    const result = new Graph(new Set(this.vertices))
    for (const vertice of result.vertices) {
      const adjacents = this.getAdjacents(vertice)
      for (const adjacent of adjacents) {
        const edgeBefore = this.getEdge(vertice, adjacent)
        const options = { flow: edgeBefore.flow, capacity: edgeBefore.capacity, cost: edgeBefore.cost }
        result.setEdge(edgeBefore.start, edgeBefore.end, options)
      }
    }
    return result
  }

  addVertex(x) {
    this.vertices.add(x)
  }

  removeVertex(x) {
    this.vertices.remove(x)
  }

  hasVertex(x) {
    return this.vertices.has(x)
  }

  setEdge(start, end, options) {
    const defaultOptions = { flow: 0, capacity: 1, cost: 0 }
    const mergedOptions = { ...defaultOptions, ...options }

    if (!this.hasVertex(end)) {
      throw new Error(`fail to set edge. there is no end ${end}`)
    }

    if (!this.hasVertex(start)) {
      throw new Error(`fail to set edge. there is no start ${start}`)
    }

    if (!this.edges.has(start)) {
      this.edges.set(start, new Map())
    }

    this.edges.get(start).set(end, new Edge(start, end, mergedOptions))
  }

  removeEdge(start, end) {
    if (!this.edges.has(start)) {
      return
    }
    this.edges.get(start).delete(end)
  }

  getEdge(start, end) {
    if (!this.edges.has(start)) {
      return undefined
    }
    return this.edges.get(start).get(end)
  }

  getAdjacents(start) {
    if (!this.edges.has(start)) {
      this.edges.set(start, new Map())
    }
    return this.edges.get(start).keys()
  }

  getSize() {
    return this.vertices.size
  }
}

class Edge {
  constructor(start, end, options) {
    const defaultOptions = { flow: 0, capacity: 1, cost: 0 }
    const mergedOptions = { ...defaultOptions, ...options }
    const { flow, capacity, cost } = mergedOptions
    this.flow = flow
    this.capacity = capacity
    this.cost = cost
  }
  getStart() {
    return this.start
  }
  getEnd() {
    return this.end
  }
  getFlow() {
    return this.flow
  }
  getCapacity() {
    return this.capacity
  }
  getCost() {
    return this.cost
  }
  setFlow(flow) {
    this.flow = flow
  }
  setCapacity(capacity) {
    this.capacity = capacity
  }
  setCost(cost) {
    this.cost = cost
  }
  addFlow(flow) {
    this.flow += flow
  }
}

Graph.prototype.minimumCostMaximumFlowWithUnitCapacity = function (source, sink) {
  const residual = this.getResidual()

  while (true) {
    const flowPath = residual.shortestPathFasterAlgorithm(source, sink)

    if (!flowPath) {
      break
    }

    residual.sendFlow(flowPath, 1)
  }

  const result = residual.getOptimal()

  return result
}

Graph.prototype.shortestPathFasterAlgorithm = function (source, sink) {
  const predecessors = {}

  const distances = {}

  for (const vertice of this.vertices) {
    distances[vertice] = Infinity
  }

  distances[source] = 0

  const queue = []

  queue.push(source)

  while (queue.length > 0) {

    const vertex = queue.shift()

    const adjacents = this.getAdjacents(vertex)
    for (const adjacent of adjacents) {
      const edge = this.getEdge(vertex, adjacent)

      const vertexDistance = distances[vertex]
      const adjacentDistance = distances[adjacent]

      if (vertexDistance + edge.cost < adjacentDistance) {
        distances[adjacent] = vertexDistance + edge.cost
        predecessors[adjacent] = vertex

        if (!queue.includes(adjacent)) {
          if (distances[adjacent] < distances[queue[0]]) {
            queue.unshift(adjacent)
          } else {
            queue.push(adjacent)
          }
        }
      }
    }
  }

  if (!predecessors[sink]) {
    return false
  }

  return retrievePath(predecessors, sink)
}

Graph.prototype.cycleCanceling = function (sink) {

  const residual = this.getResidual()

  checkCPU('residual')

  let negativeCycle = residual.bellmanFord(sink)
  let i = 0

  checkCPU('bellmanFord')

  while (negativeCycle && Array.isArray(negativeCycle)) {

    negativeCycle.push(negativeCycle[0])

    checkCPU('negativeCycle')

    const capacity = residual.getPathCapacityAvailable(negativeCycle)

    checkCPU('getCapacity')

    residual.sendFlow(negativeCycle, capacity)

    checkCPU('sendFlow')

    negativeCycle = residual.bellmanFord(sink)

    checkCPU('bellmanFord')
    i++
  }

  console.log(`itrate ${i} times`)

  const result = residual.getOptimal()

  checkCPU('getOptimal')

  return result

}

Graph.prototype.bellmanFord = function (source) {
  const distances = {}
  const predecessors = {}
  for (const vertice of this.vertices) {
    distances[vertice] = Infinity
  }

  distances[source] = 0

  for (let i = 0; i < this.getSize() - 1; i++) {
    for (const vertice of this.vertices) {
      const adjacents = this.getAdjacents(vertice)
      for (const adjacent of adjacents) {
        const edge = this.getEdge(vertice, adjacent)
        const verticeDistance = distances[vertice]
        const adjacentDistance = distances[adjacent]
        if (adjacentDistance > verticeDistance + edge.cost) {
          distances[adjacent] = verticeDistance + edge.cost
          predecessors[adjacent] = vertice
        }
      }
    }
  }

  for (const vertice of this.vertices) {
    const adjacents = this.getAdjacents(vertice)
    for (const adjacent of adjacents) {
      const edge = this.getEdge(vertice, adjacent)
      const verticeDistance = distances[vertice]
      const adjacentDistance = distances[adjacent]
      if (adjacentDistance > verticeDistance + edge.cost) {
        return retrievePath(predecessors, vertice)
      }
    }
  }

  const result = {}

  for (const vertice of this.vertices) {
    result[vertice] = { predecessor: predecessors[vertice], distance: distances[vertice] }
  }

  return result
}

Graph.prototype.getOptimal = function () {
  const result = new Graph(this.vertices)
  for (const vertice of this.vertices) {
    for (const adjacent of this.getAdjacents(vertice)) {

      const edge = this.getEdge(vertice, adjacent)
      const reverseEdge = this.getEdge(adjacent, vertice)

      const capacity = (edge ? edge.capacity : 0) + (reverseEdge ? reverseEdge.capacity : 0)

      if (edge.cost < 0 || Object.is(edge.cost, -0)) {
        const options = { flow: edge.capacity, capacity: capacity, cost: -edge.cost }
        result.setEdge(adjacent, vertice, options)
      } else if (!reverseEdge) {
        const options = { flow: 0, capacity: capacity, cost: edge.cost }
        result.setEdge(vertice, adjacent, options)
      }
    }
  }
  return result
}

Graph.prototype.getResidual = function () {
  const result = new Graph(this.vertices)

  for (const vertice of this.vertices) {
    const adjacents = this.getAdjacents(vertice)
    for (const adjacent of adjacents) {
      const edge = this.getEdge(vertice, adjacent)
      if (edge.flow > 0) {
        const options = { flow: 0, capacity: edge.flow, cost: -edge.cost }
        result.setEdge(adjacent, vertice, options)
      }
      if (edge.capacity - edge.flow > 0) {
        const options = { flow: 0, capacity: edge.capacity - edge.flow, cost: edge.cost }
        result.setEdge(vertice, adjacent, options)
      }
    }
  }
  return result
}

function retrievePath(predecessors, vertice) {

  const pathSet = new Set([vertice])
  let nextVertice = predecessors[vertice]
  let path = new Array()
  path.push(vertice)
  while (nextVertice && !pathSet.has(nextVertice)) {
    pathSet.add(nextVertice)
    path.unshift(nextVertice)
    nextVertice = predecessors[nextVertice]
  }

  if (pathSet.has(nextVertice)) {
    path = path.slice(0, path.indexOf(nextVertice) + 1)
  }

  return path
}

Graph.prototype.getPathCapacityAvailable = function (path) {
  let result = Infinity
  for (let i = 0; i < path.length - 1; i++) {
    const edge = this.getEdge(path[i], path[i + 1])
    const capacityAvailable = edge.capacity - edge.flow
    if (capacityAvailable < result) {
      result = capacityAvailable
    }
  }
  return result
}

Graph.prototype.sendFlow = function (path, flow) {
  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i]
    const end = path[i + 1]

    const edge = this.getEdge(start, end)
    if (edge.capacity === flow) {
      this.removeEdge(start, end)
    } else {
      edge.capacity -= flow
    }

    const reverseEdge = this.getEdge(end, start)
    if (!reverseEdge) {
      const options = { capacity: flow, cost: -edge.cost }
      this.setEdge(end, start, options)
    } else {
      reverseEdge.capacity += flow
    }
  }
}

profiler.registerClass(Graph, 'Graph');

module.exports = Graph