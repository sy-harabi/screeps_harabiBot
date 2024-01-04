
// rampart 바깥쪽을 모두 구해서 cost를 높이는 method
// dismantleRoom 때문에 남겨둠

Room.prototype.getDefenseCostMatrix = function (resultCost = DANGER_TILE_COST, option = {}) { //option = {checkResult:false, exitDirection:FIND_EXIT}
  let { checkResult, exitDirection } = option

  if (checkResult === undefined) {
    checkResult = false
  }

  if (exitDirection === undefined) {
    exitDirection = FIND_EXIT
  }

  const costMatrix = this.basicCostmatrix.clone()
  const sources = this.find(exitDirection) // exit에서 시작해서 닿을 수 있는 곳은 모두 outer

  const queue = [];

  // Set the cost to resultCost for each source position and add them to the queue
  for (const source of sources) {
    costMatrix.set(source.x, source.y, resultCost);
    queue.push(source);
  }

  const ADJACENT_VECTORS = [
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },

  ]

  const leafNodes = []
  // Start the flood-fill algorithm
  while (queue.length) {
    const currentPos = queue.shift();
    // Get neighboring positions
    const neighbors = []

    for (const vector of ADJACENT_VECTORS) {
      if (0 <= currentPos.x + vector.x && currentPos.x + vector.x <= 49 && 0 <= currentPos.y + vector.y && currentPos.y + vector.y <= 49) {
        neighbors.push(new RoomPosition(currentPos.x + vector.x, currentPos.y + vector.y, this.name))
      }
    }

    let isLeaf = false
    for (const neighbor of neighbors) {
      const x = neighbor.x;
      const y = neighbor.y;
      if (neighbor.isWall) {
        isLeaf = true
        continue
      }
      if (neighbor.isRampart) {
        isLeaf = true
        continue
      }
      if (costMatrix.get(x, y) < resultCost) {
        costMatrix.set(x, y, resultCost)
        queue.push(neighbor)
      }
    }
    if (isLeaf) {
      leafNodes.push(currentPos)
    }
  }

  for (const leafPos of leafNodes) {
    for (const pos of leafPos.getAtRange(3)) {
      if (pos.isWall) {
        continue
      }
      if (!pos.isRampart && costMatrix.get(pos.x, pos.y) < resultCost - 1) {
        costMatrix.set(pos.x, pos.y, resultCost - 1)
      }
    }
    for (const pos of leafPos.getAtRange(2)) {
      if (pos.isWall) {
        continue
      }
      if (!pos.isRampart && costMatrix.get(pos.x, pos.y) < resultCost - 1) {
        costMatrix.set(pos.x, pos.y, resultCost - 1)
      }
    }
  }

  if (checkResult) {
    for (let x = 0; x <= 49; x++) {
      for (let y = 0; y <= 49; y++) {
        this.visual.text(costMatrix.get(x, y), x, y, { font: 0.5 })
      }
    }
  }

  return costMatrix
}