Creep.prototype.fleeFrom = function (from, range = 10, maxRooms = 2) {

  from = Array.isArray(from) ? from : [from]
  from = from.map(target => {
    const pos = target.pos || target
    return { pos, range }
  })

  const room = this.room
  const moveCost = this.getMoveCost()
  const map = Overlord.map
  const costsForFlee = room.getCostMatrixForConflict()
  const search = PathFinder.search(this.pos, from, {
    plainCost: Math.max(1, Math.ceil(2 * moveCost)),
    swampCost: Math.max(1, Math.ceil(10 * moveCost)),
    maxRooms,
    flee: true,
    roomCallback: function (roomName) {
      if (map[roomName] && map[roomName].numTower) {
        return false
      }
      if (roomName === room.name) {
        return costsForFlee
      }
    }
  })

  const path = search.path
  if (!path) {
    this.say(`⚠️`, true)
    return
  }

  visualizePath(path, this.pos)
  const nextPos = path[0]

  if (nextPos) {
    costsForFlee.set(nextPos.x, nextPos.y, 255)
    costsForFlee.set(this.pos.x, this.pos.y, this.room.basicCostmatrix.get(this.pos.x, this.pos.y))
    this.setNextPos(nextPos)
  }
}

Room.prototype.getCostMatrixForConflict = function () {
  if (this._costMatrixForConflict) {
    return this._costMatrixForConflict
  }

  const costs = this.basicCostmatrix.clone()

  const enemyCombatants = this.getEnemyCombatants()
  for (const enemyCombatant of enemyCombatants) {
    const range = enemyCombatant.rangedAttackPower > 0 ? 4 : 3
    for (const pos of enemyCombatant.pos.getInRange(range)) {
      if (!pos.isWall && costs.get(pos.x, pos.y) < 10) {
        costs.set(pos.x, pos.y, 10)
      }
    }
  }

  return this._costMatrixForConflict = costs
}