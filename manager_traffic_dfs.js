global.TRAFFIC_TEST = false

Room.prototype.manageTraffic = function () {
  const CPUbefore = TRAFFIC_TEST ? Game.cpu.getUsed() : undefined

  const creeps = this.find(FIND_MY_CREEPS).sort((a, b) => b.getStuckTick() - a.getStuckTick())
  const movingCreepIndexes = []

  const costs = barrierCosts.clone(); // CostMatrix which is filled with 255
  for (let a = 0; a < creeps.length; a++) {
    const creep = creeps[a]
    costs.set(creep.pos.x, creep.pos.y, a)
    if (creep.getNextPos()) {
      movingCreepIndexes.push(a)
    }
  }

  const visited = new Uint8Array(creeps.length);

  for (const a of movingCreepIndexes) {
    const creep = creeps[a]
    if (!creep._matchedPos) {
      visited.fill(0)
      dfs(a, creeps, visited, costs)
    }
  }

  let numMoved = 0
  for (const creep of creeps) {
    const matchedPos = creep._matchedPos
    if (matchedPos && !creep.pos.isEqualTo(matchedPos)) {
      const direction = creep.pos.getDirectionTo(matchedPos)
      if (creep.move(direction) === OK) {
        numMoved++
      }
    }
  }

  if (TRAFFIC_TEST && this.isMy) {
    const usedCPU = Game.cpu.getUsed() - CPUbefore - numMoved * 0.2
    console.log(`use ${usedCPU.toFixed(2)} cpu for ${numMoved} moves`)
    console.log(`use ${(usedCPU / numMoved).toFixed(2)} cpu for each move`)
  }
};

Creep.prototype.getStuckTick = function () {
  return this.heap.stuck || 0
}


/**
 *
 * @param {number} a - index of a creep in array of creeps
 * @param {array} creeps - array of creeps
 * @param {array} visited - array which represent if a creep is checked
 * @param {array} costs - costMatrix which represent index of the creep which is occupying that position
 */
function dfs(a, creeps, visited, costs) {
  visited[a] = 1;
  const creep = creeps[a]

  if (creep._matchedPos) {
    return false
  }

  const moveIntent = [...creep.getMoveIntent()]

  if (creep.getNextPos()) {
    costs.set(creep.pos.x, creep.pos.y, 255)
  }

  while (moveIntent.length > 0) {
    const pos = moveIntent.shift()
    const before = costs.get(pos.x, pos.y);
    if (before === 255 || (visited[before] === 0 && dfs(before, creeps, visited, costs))) {
      const newBefore = costs.get(pos.x, pos.y)
      if (newBefore !== 255 && creeps[newBefore].getNextPos()) {
        continue
      }
      creeps[a]._matchedPos = pos
      costs.set(pos.x, pos.y, a)
      return true
    }
  }

  costs.set(creep.pos.x, creep.pos.y, a)

  return false
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
    result.push(nextPos);
    return this._moveIntent = result
  }


  const adjacents = this.pos.getAtRange(1).sort((a, b) => Math.random() - 0.5)

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

      result.push(pos);
    }
    result.push(...positionsOutOfRange)

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
    result.push(pos);
  }

  return this._moveIntent = result
};