const START_COST = 150

/**
 * create flood-fill of a room for given sources
 * 
 * @param {Array} sources - array of RoomPositions to start flood-fill.
 * @param {Object} option - An Object containing options
 * @param {number} option.maxLevel - if given, stop flood-fill at this level.
 * @param {CostMatrix} option.costMatrix - if given, any tiles with cost greater than START_COST is treated like a wall.
 * @param {number} option.costThreshod - change START_COST to given number
 * @param {Array} option.adjacents - define adjacents by array of vectors like {x:1, y:0}. default is adjacents by Chebyshev distance.
 * @param {boolean} option.visual - if true, show levels by RoomVisual.text
 * @returns {Object} An object containing belows.
 * @returns {Object} returns.positions - An object with level as key and array of positions as value.
 * @returns {Array} returns.allPositions - An array of all positions such that flood-fill founds.
 * @returns {CostMatrix} returns.costs - CostMatrix in which the cost represents the shortest travel distance from the source.
 */
Room.prototype.floodFill = function (sources, option = {}) {

  let { maxLevel, costMatrix, costThreshod, adjacents, visual } = option

  if (maxLevel === undefined) {
    maxLevel = Infinity
  }

  if (costMatrix === undefined) {
    costMatrix = new PathFinder.CostMatrix;
  } else {
    costMatrix = costMatrix.clone()
  }

  if (costThreshod === undefined) {
    costThreshod = START_COST
  }

  if (adjacents === undefined) {
    adjacents = NEAR
  }

  if (visual === undefined) {
    visual = false
  }

  const queue = [];

  const terrain = new Room.Terrain(this.name);

  const positionsByLevel = {}

  // Set the check CostMatrix
  const checkCosts = new PathFinder.CostMatrix

  // Set the cost to 0 for each source position and add them to the queue
  const allPositions = []

  for (const source of sources) {
    allPositions.push(source)
    costMatrix.set(source.x, source.y, 0);
    queue.push(source);
    checkCosts.set(source.x, source.y, 1)
  }

  // Start the flood-fill algorithm
  while (queue.length) {
    const currentPos = queue.shift();

    // Get neighboring positions
    for (const vector of adjacents) {
      const x = currentPos.x + vector.x
      const y = currentPos.y + vector.y
      if (x < 0 || x > 49 || y < 0 || y > 49) {
        continue
      }

      if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
        continue
      }

      if (costMatrix.get(x, y) > costThreshod) {
        continue
      }

      if (checkCosts.get(x, y) === 0 && costMatrix.get(currentPos.x, currentPos.y) < maxLevel) {
        // Set the cost to the current position's cost plus 1
        const neighbor = new RoomPosition(x, y, this.name)

        const level = costMatrix.get(currentPos.x, currentPos.y) + 1
        costMatrix.set(x, y, level);

        checkCosts.set(x, y, 1)
        queue.push(neighbor);

        allPositions.push(neighbor)
        positionsByLevel[level] = positionsByLevel[level] || []
        positionsByLevel[level].push(neighbor)

        if (visual) {
          this.visual.text(level, neighbor)
        }
      }
    }
  }

  return { positions: positionsByLevel, allPositions: allPositions, costs: costMatrix }
}


Room.prototype.getWeightedFloodFill = function (sources, costs) {
  const positionsByLevel = {}
  const costsForCost = new PathFinder.CostMatrix
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      costsForCost.set(x, y, 255)
    }
  }
  for (const pos of sources) {
    costsForCost.set(pos.x, pos.y, costs.get(pos.x, pos.y))
  }
  const queue = [...sources]
  while (queue.length > 0) {
    const node = queue.shift()
    const nodeCost = costsForCost.get(node.x, node.y)
    positionsByLevel[nodeCost] = positionsByLevel[nodeCost] || []
    positionsByLevel[nodeCost].push(node)
    for (const neighbor of node.getAtRange(1)) {
      const cost = costs.get(neighbor.x, neighbor.y)
      if (nodeCost + cost < costsForCost.get(neighbor.x, neighbor.y)) {
        costsForCost.set(neighbor.x, neighbor.y, nodeCost + cost)
        queue.push(neighbor)
        queue.sort((a, b) => costsForCost.get(a.x, a.y) - costsForCost.get(b.x, b.y))
        continue
      }
    }
  }
  return { costsForCost, positions: positionsByLevel }
}