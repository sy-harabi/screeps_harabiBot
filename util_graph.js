const profiler = require('screeps-profiler');

let MinHeap = require('./util_min_heap')

class Graph {
  constructor(vertices, edges) {
    this.vertices = vertices || new Set()
    this.edges = edges || new Map()
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
    this.addVertex(start)
    this.addVertex(end)

    const defaultOptions = { flow: 0, capacity: 1, cost: 0 }
    const mergedOptions = { ...defaultOptions, ...options }

    if (!this.edges.has(start)) {
      this.edges.set(start, new Map())
    }

    this.edges.get(start).set(end, new Edge(mergedOptions))
  }

  removeEdge(start, end) {
    if (!this.edges.has(start)) {
      return
    }
    this.edges.get(start).delete(end)
  }

  getEdge(start, end) {
    if (!this.edges.has(start)) {
      this.edges.set(start, new Map())
    }
    return this.edges.get(start).get(end)
  }

  getEdges(start) {
    if (!this.edges.has(start)) {
      this.edges.set(start, new Map())
    }
    return this.edges.get(start)
  }

  getSize() {
    return this.vertices.size
  }
}

class Edge {
  constructor(options) {
    const defaultOptions = { flow: 0, capacity: 1, cost: 0 }
    const mergedOptions = { ...defaultOptions, ...options }
    const { flow, capacity, cost } = mergedOptions
    this.flow = flow
    this.capacity = capacity
    this.cost = cost
  }
}

Graph.prototype.minimumCostMaximumFlowWithUnitCapacity = function (source, sink, log) {
  let i = 0
  const result = new Map()

  while (true) {
    i++
    const flowPath = this.dijkstra(source, sink)

    if (!flowPath) {
      break
    }

    this.sendFlow(flowPath, result)
  }

  if (log) {
    console.log(`num dijkstra:${i}`)
  }

  return result
}

Graph.prototype.dijkstra = function (source, sink) {
  const predecessors = new Map()

  const distances = new Map()

  distances.set(source, 0)

  const queue = new MinHeap((vertex) => distances.get(vertex))
  queue.insert(source)

  while (queue.getSize() > 0) {
    const current = queue.remove()

    const currentDistance = distances.get(current)

    const edges = this.getEdges(current)

    for (const [adjacent, edge] of edges) {
      const adjacentDistance = distances.get(adjacent)
      if (adjacentDistance === undefined || currentDistance + edge.cost < adjacentDistance) {
        distances.set(adjacent, currentDistance + edge.cost)
        predecessors.set(adjacent, current)
        queue.insert(adjacent)
      }
    }

    if (current === sink) {
      break
    }
  }

  if (!predecessors.get(sink)) {
    return false
  }

  return this.retrievePath(predecessors, sink)
}

Graph.prototype.retrievePath = function (predecessors, vertice) {
  const path = new Array()

  while (vertice) {
    path.unshift(vertice)
    vertice = predecessors.get(vertice)
  }

  return path
}

Graph.prototype.sendFlow = function (path, result) {
  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i]
    const end = path[i + 1]

    const edge = this.getEdge(start, end)
    this.removeEdge(start, end)
    this.setEdge(end, start, { cost: -edge.cost })

    result.set(start, end)
  }
}

profiler.registerClass(Graph, 'Graph');


profiler.registerClass(Map, 'Map');

module.exports = Graph