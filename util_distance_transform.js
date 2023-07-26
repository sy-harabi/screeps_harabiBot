Room.prototype.getDistanceTransform = function () {
  if (this.heap.distanceTransform) {
    return this.heap.distanceTransform
  }

  const BOTTOM_LEFT = [
    { x: -1, y: -1 },
    { x: -1, y: 0 },
    { x: -1, y: 1 },
    { x: 0, y: -1 }
  ]

  const TOP_RIGHT = [
    { x: 1, y: 1 },
    { x: 1, y: 0 },
    { x: 1, y: -1 },
    { x: 0, y: +1 }
  ]

  const cost = new PathFinder.CostMatrix
  const terrain = new Room.Terrain(this.name)
  const exits = this.find(FIND_EXIT)

  for (let x = 0; x <= 49; x++) {
    for (let y = 0; y <= 49; y++) {
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
        cost.set(x, y, 0)
        continue
      }
      cost.set(x, y, 1 << 6)
    }
  }

  for (const exit of exits) {
    for (const pos of exit.getInRange(1)) {
      cost.set(pos.x, pos.y, 0)
    }
  }

  for (let x = 0; x <= 49; x++) {
    for (let y = 0; y <= 49; y++) {
      const nearDistances = BOTTOM_LEFT.map(vector => cost.get(x + vector.x, y + vector.y) + 1 || 50)
      nearDistances.push(cost.get(x, y))
      cost.set(x, y, Math.min(...nearDistances))
    }
  }

  const result = new Array(26)
  for (i = 0; i < result.length; i++) {
    result[i] = new Array()
  }

  for (let x = 49; x >= 0; x--) {
    for (let y = 49; y >= 0; y--) {
      const nearDistances = TOP_RIGHT.map(vector => cost.get(x + vector.x, y + vector.y) + 1 || 50)
      nearDistances.push(cost.get(x, y))
      const distance = Math.min(...nearDistances)
      cost.set(x, y, distance)
      result[distance].push(new RoomPosition(x, y, this.name))
    }
  }
  this.heap.distanceTransform = result
  return result
}