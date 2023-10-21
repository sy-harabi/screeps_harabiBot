Room.prototype.manageTraffic = function () {
  const beforeCPU = Game.cpu.getUsed()
  const creeps = this.find(FIND_MY_CREEPS)
  const popularityCosts = new PathFinder.CostMatrix;

  for (const creep of creeps) {
    const moveIntent = creep.getMoveIntent()

    for (const pos of moveIntent) {
      const delta = pos.isEqualTo(creep.pos) ? 8 : 1

      const cost = popularityCosts.get(pos.x, pos.y) + delta
      popularityCosts.set(pos.x, pos.y, cost)
    }
  }

  creeps.sort((a, b) => popularityCosts.get(b.pos.x, b.pos.y) - popularityCosts.get(a.pos.x, a.pos.y))
  const visited = new Uint8Array(creeps.length);
  const costs = barrierCosts.clone(); // CostMatrix which is filled with 255

  for (let a = 0; a < creeps.length; a++) {
    const creep = creeps[a]
    if (!creep._matchedPos) {
      visited.fill(0)
      dfs(a, creeps, visited, costs, popularityCosts)
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

  if (this.isMy) {
    console.log(`${this.name} used ${(Game.cpu.getUsed() - beforeCPU - 0.2 * numMoved).toFixed(2)} to manage traffic with ${numMoved} of move intent at tick ${Game.time}`)
  }
};


/**
 *
 * @param {number} a - index of a creep in array of creeps
 * @param {array} creeps - array of creeps
 * @param {array} visited - array which represent if a creep is checked
 * @param {array} costs - costMatrix which represent index of the creep which is occupying that position
 */
function dfs(a, creeps, visited, costs, popularityCosts) {
  visited[a] = 1;
  const creep = creeps[a]

  const moveIntent = creep.getMoveIntent().sort((aPos, bPos) => {
    if (creep.pos.isEqualTo(aPos)) {
      return -1
    }
    if (creep.pos.isEqualTo(bPos)) {
      return 1
    }
    return popularityCosts.get(aPos.x, aPos.y) - popularityCosts.get(bPos.x, bPos.y)
  });

  for (let i = 0; i < moveIntent.length; i++) {
    const pos = moveIntent[i];
    const before = costs.get(pos.x, pos.y);
    if (before === 255 || (visited[before] === 0 && dfs(before, creeps, visited, costs, popularityCosts))) {
      creeps[a]._matchedPos = pos
      costs.set(pos.x, pos.y, a)
      return true
    }
  }
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

  const nextPos = this.getNextPos()
  if (nextPos) {
    result.push(nextPos);
    return this._moveIntent = result
  }

  result.push(this.pos)

  const costs = (!this.room.memory.militaryThreat || !this.room.isWalledUp) ? this.room.basicCostmatrix : this.room.defenseCostMatrix

  const adjacents = this.pos.getAtRange(1);

  const workingInfo = this.getWorkingInfo()
  if (workingInfo) {
    const targetPos = workingInfo.pos;
    const range = workingInfo.range;

    for (const pos of adjacents) {
      if (pos.isWall) {
        continue
      }
      if (!isValidCoord(pos.x, pos.y)) {
        continue
      }

      if (costs.get(pos.x, pos.y) > 1) {
        continue;
      }

      if (pos.getRangeTo(targetPos) > range) {
        continue;
      }

      result.push(pos);
    }

    return this._moveIntent = result
  }

  for (const pos of adjacents) {
    if (pos.isWall) {
      continue
    }
    if (!isValidCoord(pos.x, pos.y)) {
      continue
    }
    if (costs.get(pos.x, pos.y) > 1) {
      continue;
    }
    result.push(pos);
  }

  return this._moveIntent = result
};