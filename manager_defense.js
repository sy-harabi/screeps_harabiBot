Room.prototype.manageDefense = function () {
  const targets = this.find(FIND_HOSTILE_CREEPS)
  const towerImmuneTargets = []
  if (targets.length && this.structures.tower.length > 0) { // tower 있을 때
    for (const target of targets) {
      if (this.calcEnemyHealPower(target) < this.calcTowerDamage(target)) {
        return this.towerAttack(target)
      }
      towerImmuneTargets.push(target)
    }
    if (towerImmuneTargets.length) {
      this.controller.activateSafeMode()
    }
  }

  for (const tower of this.structures.tower) {
    if (this.creeps.wounded.length) {
      tower.heal(tower.pos.findClosestByRange(this.creeps.wounded))
      continue
    }
    if (this.structures.damaged.length && !data.cpuEmergency) {
      tower.repair(tower.pos.findClosestByRange(this.structures.damaged))
      break;
    }
    if (this.controller.level >= 5 && !data.cpuEmergency) {
      const threshold = (this.controller.level - 4) * 100000 // rcl5에 100K, 6에 200K, 7에 300K, 8에 400K
      if (this.structures.constructedWall.length > 0 || this.structures.rampart.length > 0) {
        const toRepair = this.structures.constructedWall.concat(this.structures.rampart).sort((a, b) => { return a.hits - b.hits })[0]
        if (toRepair.hits < threshold) {
          tower.repair(toRepair)
        }
      }
    }
  }
}

Room.prototype.towerAttack = function (target) { //target은 enemy creep
  const towers = this.structures.tower
  for (const tower of towers) {
    tower.attack(target)
  }
}


Room.prototype.calcEnemyHealPower = function (target) { //target은 enemy creep
  let result = 0
  const nearbyCreeps = target.pos.findInRange(FIND_HOSTILE_CREEPS, 3) //본인도 포함
  for (const creep of nearbyCreeps) {
    if (target.pos.getRangeTo(creep.pos) <= 1) {
      result += creep.calcHealPower()
      continue
    }
    result += (creep.calcHealPower() / 3) // short range 아니면 효율 1/3 됨
  }
  this.visual.text(result, target.pos.x, target.pos.y + 1, { color: COLOR_GREEN })
  return result
}

Room.prototype.calcTowerDamage = function (target) { //target은 roomPosition 혹은 roomPosition 가지는 Object
  const towers = this.structures.tower.filter(tower => tower.store[RESOURCE_ENERGY] > 0)

  let result = 0
  for (const tower of towers) {
    result += tower.attackDamage(target)
  }

  this.visual.text(result, target.pos || target, { color: COLOR_RED })
  return result
}

StructureTower.prototype.attackDamage = function (target) { //target은 roomPosition 혹은 roomPosition 가지는 Object
  const targetPos = target.pos || target
  const range = this.pos.getRangeTo(targetPos)
  if (range <= 5) {
    return 600
  }
  if (range >= 20) {
    return 150
  }
  return 750 - 30 * range
}

Creep.prototype.calcHealPower = function () {
  const body = this.body
  let result = 0
  for (const part of body) {
    if (part.type !== 'heal') {
      continue
    }
    if (part.hits <= 0) {
      continue
    }
    if (!part.boost) {
      result += 12
      continue
    }
    if (part.boost === XLHO2) {
      result += 48 // +300%
      continue
    }
    if (part.boost === LHO2) {
      result += 36 // +200%
      continue
    }
    if (part.boost === LO) {
      result += 24 // +100%
      continue
    }
  }
  return result
}