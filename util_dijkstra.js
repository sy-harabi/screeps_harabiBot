let MinHeap = require('./util_min_heap')

const INFINITY = 4294967295

const EIGHT_DELTA = [
  { x: 0, y: -1 }, // TOP
  { x: 1, y: -1 }, // TOP_RIGHT
  { x: 1, y: 0 }, // RIGHT
  { x: 1, y: 1 }, // BOTTOM_RIGHT
  { x: 0, y: 1 }, // BOTTOM
  { x: -1, y: 1 }, // BOTTOM_LEFT
  { x: -1, y: 0 }, // LEFT
  { x: -1, y: -1 }, // TOP_LEFT
];

/**
 * 
 * @param {RoomPosition} startPos - RoomPosition
 * @param {Object} goals - object containing {pos:RoomPosition, range:number}
 * @param {*} costArray - Uint32Array(2500). 0 means you cannot use that tile
 */
Room.prototype.dijkstra = function (startPos, goals, costArray) {
  if (goals.length === 0) {
    return ERR_INVALID_TARGET
  }

  goals = normalizeGoals(goals)
  if (startPos.isInGoal(goals)) {
    return []
  }

  const goalsPacked = new Set()

  for (const goal of goals) {
    const goalPos = goal.pos || goal
    const range = goal.range || 0

    for (const pos of goalPos.getInRange(range)) {
      const packed = packCoord(pos.x, pos.y)
      goalsPacked.add(packed)
    }

  }

  const roomName = this.name

  const costs = new Uint32Array(2500)
  costs.fill(INFINITY)

  const previous = new Uint32Array(2500)
  const queue = new MinHeap((index) => costs[index])
  const packedPath = []

  const startPosPacked = packCoord(startPos.x, startPos.y)
  costs[startPosPacked] = 0
  queue.insert(startPosPacked)

  while (queue.getSize() > 0) {

    const currentPacked = queue.remove()

    if (goalsPacked.has(currentPacked)) {
      packedPath.unshift(currentPacked)
      break
    }

    const currentCost = costs[currentPacked]
    const parsed = parseCoord(currentPacked)
    // this.visual.text(currentCost, parsed.x, parsed.y, { font: 0.3 })
    const neighbors = surroundingPoses(parsed).map(parsed => packCoord(parsed.x, parsed.y))
    const neighborsFiltered = neighbors.filter(packed => costArray[packed] > 0)

    for (const packed of neighborsFiltered) {

      const afterCost = Math.min(INFINITY - 1, currentCost + costArray[packed])
      const beforeCost = costs[packed]

      if (afterCost < beforeCost) {
        costs[packed] = afterCost
        previous[packed] = currentPacked
        queue.insert(packed)
      }
    }

  }

  if (packedPath.length === 0) {
    return ERR_NOT_FOUND
  }

  while (true) {
    if (previous[packedPath[0]] === 0) {
      return ERR_NOT_FOUND
    }
    if (previous[packedPath[0]] === startPosPacked) {
      break
    }
    packedPath.unshift(previous[packedPath[0]])
  }

  const path = packedPath.map(packed => {
    const parsed = parseCoord(packed)
    const pos = new RoomPosition(parsed.x, parsed.y, roomName)
    return pos
  })

  return path
}

function surroundingPoses(pos) {
  return EIGHT_DELTA.map(vector => pointAdd(pos, vector)).filter(pos => isPointInRoom(pos))
}

function pointAdd(pos, vector) {
  return { x: pos.x + vector.x, y: pos.y + vector.y }
}

function isPointInRoom(pos) {
  return pos.x >= 0 && pos.x <= 49 && pos.y >= 0 && pos.y <= 49
}