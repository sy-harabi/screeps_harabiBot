Room.prototype.manageTowerAttack = function (targets) {
  const vulnerable = []
  const possible = []

  const damageArray = this.getDamageArrayForMyRoom()

  for (const creep of targets) {
    const packed = packCoord(creep.pos.x, creep.pos.y)
    const damage = damageArray[packed]
    if (creep.getCanBeKilled(damage, creep.totalHealPower)) {
      vulnerable.push(creep)
      continue
    }
    if (creep.getCanBeHurt(damage)) {
      possible.push(creep)
      continue
    }
  }

  if (vulnerable.length) {
    const target = getMinObject(vulnerable, creep => creep.hits)
    this.towerAttack(target)
    return
  }

  if (possible.length > 0) {
    const killable = targets.find(creep => {
      return creep.getKillable(damageArray)
    })

    if (killable) {
      const targets = killable.pos.findInRange(possible, 1)
      data.recordLog(`found killable ${killable.name}. do some random shot`, this.name)
      this.towerAttackRandomly(targets)
      return
    }
  }

  if (Math.random() < 0.05) {
    this.towerAttackRandomly(targets)
    return
  }

  const weakestRampart = this.weakestRampart
  if (this.weakestRampart && this.weakestRampart.hits < 2000) {
    for (const tower of this.structures.tower) {
      tower.repair(weakestRampart)
    }
    return
  }

  if (this.creeps.wounded.length) {
    const safeWounded = this.creeps.wounded.filter(creep => this.defenseCostMatrix.get(creep.pos.x, creep.pos.y) < DANGER_TILE_COST)
    for (const tower of this.structures.tower) {
      tower.heal(tower.pos.findClosestByRange(safeWounded))
    }
    return
  }
}

/**
 * attack target with towers until it gets enough damage to be killed,
 * considering totalHealPower and boosted tough parts
 * 
 * @param {Creep} target - hostile creep
 */
Room.prototype.towerAttack = function (target) {
  const towers = this.structures.tower.sort((a, b) => a.pos.getRangeTo(target.pos) - b.pos.getRangeTo(target.pos))

  const isEmptyTower = towers.some(tower => tower.store[RESOURCE_ENERGY] === 0)

  if (isEmptyTower) {
    return
  }

  const goal = target.hits
  const damageNeed = this.getRequiredDamageFor(target, { netDamage: goal, visualize: true })

  let damageExpected = 0
  for (const tower of towers) {
    tower.attack(target)
    damageExpected += tower.getAttackDamageTo(target)
    if (damageExpected >= damageNeed) {
      return
    }
  }
}

Room.prototype.towerAttackRandomly = function (targets) {
  const towers = this.structures.tower

  const isEmptyTower = towers.some(tower => tower.store[RESOURCE_ENERGY] === 0)

  if (isEmptyTower) {
    return
  }

  const index = Math.floor(Math.random() * targets.length)
  const target = targets[index]


  for (const tower of towers) {
    tower.attack(target)
  }
}