// creeps has array of roomPositions in creep._moveIntent in which order represent preference.
// order represent priority in the array of creeps. low priority -> high priority
// creeps which want to move has creep._moveIntent = [nextPos, currentPos]
// creeps that doesn't care about move / be moved has creep._moveIntent = [currentPos, ...pos.getAtRange(1)]
// creeps that are working has creep._moveIntent = [currentPos, ...pos.getAtRange(1).filter(pos=>pos.getRangeTo(target)<=VALID_WORK_RANGE), ...else]

Room.prototype.manageTraffic = function () {
  const beforeCPU = Game.cpu.getUsed()
  const creeps = this.find(FIND_CREEPS)
  const visited = new Uint8Array(creeps.length);
  const costs = barrierCosts.clone(); // CostMatrix which is filled with 255

  for (let a = 0; a < creeps.length; a++) {
    if (!creeps[a]._matchedPos) {
      visited.fill(0)
      dfs(a, creeps, visited, costs)
    }
  }

  let numMoved = 0
  for (const creep of creeps) {
    if (creep._matchedPos) {
      numMoved++
      const direction = creep.pos.getDirectionTo(creep._matchedPos)
      creep.move(direction)
    }
  }

  console.log(`${this.name} used ${Game.cpu.getUsed() - beforeCPU} to manage traffic ${creeps.length} of creeps with ${numMoved} of move intent`)
};


/**
 *
 * @param {number} a - index of creep in creeps
 * @param {array} creeps - array of creeps
 * @param {array} visited - array which represent if a creep is checked
 * @param {array} costs - costMatrix which represent index of the creep which occupy that position
 */
function dfs(a, creeps, visited, costs) {
  visited[a] = 1;
  const moveIntent = creeps[a].getMoveIntent();
  for (let i = 0; i < moveIntent.length; i++) {
    const pos = moveIntent[i];
    const before = costs.get(pos.x, pos.y);
    if (before === 255 || (visited[before] === 0 && dfs(before, creeps, visited, costs))) {
      creeps[a]._matchedPos = pos
      costs.set(pos.x, pos.y) = a
      return true
    }
  }
  return false
}

// possible creeps with ._working : miner / laborer / wallMaker / extractor / pioneer / colonyCoreDefender / highwayMiner / depoisitWorker / dismantler / roomDefender / reserver / colonyMiner / colonyHauler / 

Creep.prototype.getMoveIntent = function () {
  if (this._moveIntent) {
    return this._moveIntent;
  }

  const result = [this.pos];

  if (this._nextPos) {
    result.push(this._nextPos);
    return (this._moveIntent = result);
  }

  const costs = this.room.basicCostmatrix;

  const adjacents = this.pos.getAtRange(1);

  if (this._working) {
    const targetPos = this._working.pos;
    const range = this._working.range;

    for (const pos of adjacents) {
      if (costs.get(pos.x, pos.y) > 1) {
        continue;
      }

      if (pos.getRangeTo(targetPos) > range) {
        continue;
      }

      result.push(pos);
    }

    return (this._moveIntent = result);
  }

  for (const pos of adjacents) {
    if (costs.get(pos.x, pos.y) > 1) {
      continue;
    }
    result.push(pos);
  }

  return (this._moveIntent = result);
};