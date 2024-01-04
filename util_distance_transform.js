Object.defineProperties(Room.prototype, {
  distanceTransform: {
    get() {
      if (this.heap.distanceTransform !== undefined) {
        return this.heap.distanceTransform
      }
      return this.heap.distanceTransform = this.getDistanceTransform()
    }
  }
})

Room.prototype.getDistanceTransform = function (visual = false, insides) {

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

  let costs = new PathFinder.CostMatrix
  const terrain = new Room.Terrain(this.name)
  const exits = this.find(FIND_EXIT)
  if (insides === undefined) {
    for (let x = 0; x <= 49; x++) {
      for (let y = 0; y <= 49; y++) {
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
          costs.set(x, y, 0)
          continue
        }
        costs.set(x, y, 1 << 8)
      }
    }

    for (const exit of exits) {
      for (const pos of exit.getInRange(2)) {
        costs.set(pos.x, pos.y, 0)
      }
    }
  } else {
    for (let x = 0; x <= 49; x++) {
      for (let y = 0; y <= 49; y++) {
        costs.set(x, y, 0)
      }
    }
    for (const pos of insides) {
      costs.set(pos.x, pos.y, 1 << 8)
    }
  }

  for (let x = 0; x <= 49; x++) {
    for (let y = 0; y <= 49; y++) {
      const nearDistances = BOTTOM_LEFT.map(vector => costs.get(x + vector.x, y + vector.y) + 1 || 50)
      nearDistances.push(costs.get(x, y))
      costs.set(x, y, Math.min(...nearDistances))
    }
  }

  const positionsByLevel = {}

  for (let x = 49; x >= 0; x--) {
    for (let y = 49; y >= 0; y--) {
      const nearDistances = TOP_RIGHT.map(vector => costs.get(x + vector.x, y + vector.y) + 1 || 50)
      nearDistances.push(costs.get(x, y))
      const distance = Math.min(...nearDistances)
      costs.set(x, y, distance)
      if (!positionsByLevel[distance]) {
        positionsByLevel[distance] = []
      }
      positionsByLevel[distance].push(new RoomPosition(x, y, this.name))
    }
  }

  if (visual && !this.DTvisual) {
    const maxLevel = Math.max(...Object.keys(positionsByLevel))
    for (let x = 49; x >= 0; x--) {
      for (let y = 49; y >= 0; y--) {
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
          continue
        }
        const cost = costs.get(x, y)
        const hue = 180 * (1 - cost / maxLevel)
        const color = `hsl(${hue},100%,60%)`
        this.visual.text(cost, x, y)
        this.visual.rect(x - 0.5, y - 0.5, 1, 1, { fill: color, opacity: 0.4 })
      }
    }
    this.DTvisual = true
  }

  return { positions: positionsByLevel, costs }
}
