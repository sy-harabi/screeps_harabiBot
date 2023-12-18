Creep.prototype.harass = function (roomName) {

}

Creep.prototype.healWounded = function () {
  const wounded = this.room.find(FIND_MY_CREEPS).filter(creep => creep.hitsMax - creep.hits > 0)
  if (wounded.length) {
    const target = this.pos.findClosestByRange(wounded)
    if (this.pos.getRangeTo(target) > 1) {
      this.moveMy({ pos: target.pos, range: 1 }, { staySafe: false, ignoreMap: 1 })
    }
    this.heal(target)
    return
  }
}

Creep.prototype.handleCombatants = function (targets) {
  const targetsNearby = this.pos.findInRange(targets, 4).sort((a, b) => b.attackPower - a.attackPower)

  // run or kite
  for (const target of targetsNearby) {
    const range = this.pos.getRangeTo(target)

    const shouldRun = (target.attackPower / this.attackPower) > 2

    if (shouldRun && range <= 4) {
      this.fleeFrom(target, 10, 1)
      return
    }

    const myNetAttack = this.attackPower - target.healPower
    const hostileNetAttack = target.attackPower - this.healPower

    const shouldKite = hostileNetAttack > 0 && hostileNetAttack > myNetAttack
    const idealRange = shouldKite ? 3 : 2

    if (range < idealRange) {
      this.fleeFrom(target, 10, 1)
      return
    }
  }

  // fight with closest target

  const closestTarget = this.pos.findClosestByPath(targets)

  if (!closestTarget) {
    return
  }

  const range = this.pos.getRangeTo(closestTarget)

  if (range > 3) {
    this.moveMy({ pos: closestTarget.pos, range: 3 }, { ignoreCreeps: false, staySafe: false, ignoreMap: 2 })
    return
  }

  const myNetAttack = this.attackPower - closestTarget.healPower
  const hostileNetAttack = closestTarget.attackPower - this.healPower

  const shouldKite = hostileNetAttack > 0 && hostileNetAttack > myNetAttack
  const idealRange = shouldKite ? 3 : 2

  if (range > idealRange) {
    this.moveMy({ pos: closestTarget.pos, range: 3 }, { ignoreCreeps: false, staySafe: false, ignoreMap: 2 })
    return
  }

  if (range < idealRange) {
    this.fleeFrom(closestTarget, 10, 1)
    return
  }

}

Creep.prototype.harasserRangedAttack = function () {

  let rangedMassAttackTotalDamage = 0

  const positions = this.pos.getInRange(3)
  const rangedAttackPower = this.rangedAttackPower

  let rangedAttackTarget = undefined

  for (const pos of positions) {
    const priorityTarget = pos.lookFor(LOOK_CREEPS).find(creep => !creep.my)

    if (!priorityTarget) {
      continue
    }

    if (rangedAttackTarget === undefined) {
      rangedAttackTarget = priorityTarget
    } else if (priorityTarget.hits / priorityTarget.hitsMax < rangedAttackTarget.hits / rangedAttackTarget.hitsMax) {
      rangedAttackTarget = priorityTarget
    } else if (priorityTarget.hits / priorityTarget.hitsMax === rangedAttackTarget.hits / rangedAttackTarget.hitsMax && priorityTarget.healPower > rangedAttackTarget.healPower) {
      rangedAttackTarget = priorityTarget
    }

    if (priorityTarget.my === false) {
      const range = this.pos.getRangeTo(pos)

      if (range <= 1) {
        this.rangedMassAttack()
        return OK
      }

      const rangeConstant = range <= 1 ? 1 : range <= 2 ? 0.4 : 0.1
      const damage = rangedAttackPower * rangeConstant

      rangedMassAttackTotalDamage += damage
      continue
    }
  }

  if (rangedMassAttackTotalDamage >= rangedAttackPower) {
    this.rangedMassAttack()
    return OK
  }

  if (rangedAttackTarget) {
    this.rangedAttack(rangedAttackTarget)
    return OK
  }
  return ERR_NOT_FOUND
}

Creep.prototype.activeHeal = function () {
  const myCreepsInRange = this.pos.findInRange(FIND_MY_CREEPS, 3)

  let adjacentWounded = undefined
  let rangedWounded = undefined

  for (const creep of myCreepsInRange) {
    if (creep.hits === creep.hitsMax) {
      continue
    }

    // find creep with lowest hits ratio
    if (this.pos.getRangeTo(creep.pos) <= 1) {
      if (!adjacentWounded) {
        adjacentWounded = creep
        continue
      }
      const hitsRatioBefore = adjacentWounded.hits / adjacentWounded.hitsMax
      const hitsRatioNow = creep.hits / creep.hitsMax
      if (hitsRatioNow < hitsRatioBefore) {
        adjacentWounded = creep
      }
      continue
    }

    if (adjacentWounded) {
      continue
    }

    // find creep with lowest hits ratio
    if (!rangedWounded) {
      rangedWounded = creep
      continue
    }
    const hitsRatioBefore = rangedWounded.hits / rangedWounded.hitsMax
    const hitsRatioNow = creep.hits / creep.hitsMax
    if (hitsRatioNow < hitsRatioBefore) {
      rangedWounded = creep
    }
  }

  if (adjacentWounded) {
    this.heal(adjacentWounded)
    return
  }

  if (rangedWounded) {
    this.heal(rangedWounded)
    return
  }

  this.heal(this)
}

Creep.prototype.flee = function (range = 10) {
  const enemyCombatants = this.room.getEnemyCombatants()
  if (enemyCombatants.length === 0) {
    ERR_NOT_FOUND
  }
  const closestEnemyCombatant = this.pos.findClosestByRange(enemyCombatants)
  if (this.pos.getRangeTo(closestEnemyCombatant) < range) {
    this.fleeFrom(enemyCombatants, range)
    return OK
  }
  return ERR_NOT_IN_RANGE
}