Room.prototype.getDamageArrayForMyRoom = function () {
  if (this._damageArrayForMyRoom) {
    return this._damageArrayForMyRoom
  }

  const costArray = new Uint16Array(2500)

  const towerDamageArray = this.getTowerDamageArray()

  for (let i = 0; i < 2500; i++) {
    costArray[i] = towerDamageArray[i]
  }

  const myCreeps = this.find(FIND_MY_CREEPS)
  for (const creep of myCreeps) {
    if (creep.attackPower > 0) {
      for (const pos of creep.pos.getInRange(1)) {
        const packed = packCoord(pos.x, pos.y)
        costArray[packed] += creep.attackPower
      }
    }
    if (creep.rangedAttackPower > 0) {
      for (let range = 2; range <= 3; range++) {
        for (const pos of creep.pos.getAtRange(range)) {
          const packed = packCoord(pos.x, pos.y)
          costArray[packed] += creep.rangedAttackPower
        }
      }
    }
  }
  return this._damageArrayForMyRoom = costArray
}

Room.prototype.getInvulnerables = function (targets) {
  if (this._sortedEnemyCreepsByVulnerability !== undefined) {
    return this._sortedEnemyCreepsByVulnerability
  }

  const result = []

  const damage = (this.frontLineTowersDamageMin || (this.structures.tower.length * 300)) * 0.9

  const damageArray = new Uint16Array(2500)
  damageArray.fill(damage)

  for (const creep of targets) {
    if (this.controller.safeMode || creep.owner.username === 'Invader') {
      continue
    }
    if (getCanBeKilled(creep.body, damage, creep.totalHealPower)) {
      continue
    }
    if (creep.getKillable(damageArray)) {
      continue
    }
    result.push(creep)
  }

  return result

}

/**
 * get required damage to considering totalHealPower and boosted tough parts of target
 * 
 * @param {Creep} target - hostile creep
 * @param {Object} options - an object containing below options
 * @param {boolean} options.assumeFullPower - if true, assume target has full hits. default is false
 * @param {number} options.netDamage - required net damage. default is 0
 * @param {boolean} options.visualize - if true, visualize with RoomVisual.text. default is true
 * @returns {number} - Required damage to achieve net damage to target
 */
Room.prototype.getRequiredDamageFor = function (target, options = {}) {

  const defaultOptions = { assumeFullPower: false, netDamage: 0, visualize: true }
  const mergedOptions = { ...defaultOptions, ...options }
  const { assumeFullPower, netDamage, visualize } = mergedOptions

  // target은 hostile creep or hostile power creep
  // assumeFullPower : boolean. true면 target이 풀피라고 가정.

  let goal = target.totalHealPower + netDamage

  if (target instanceof PowerCreep) {
    return goal
  }

  if (!(target instanceof Creep)) {
    return 0
  }

  let result = 0
  const body = [...target.body]
  while (goal > 0) {
    if (body.length === 0) {
      result += goal
      break
    }
    const part = body.shift()
    const hits = assumeFullPower ? 100 : part.hits
    if (hits === 0) {
      continue
    }
    if (part.type !== TOUGH) {
      result += hits
      goal -= hits
      continue
    }
    if (part.boost === undefined) {
      result += hits
      goal -= hits
      continue
    }
    let ratio = 1
    switch (part.boost) {
      case 'XGHO2':
        ratio = 0.3
        break
      case 'GHO2':
        ratio = 0.5
        break
      case 'GO':
        ratio = 0.7
        break
    }
    result += Math.ceil(hits / ratio)
    goal -= hits
  }
  if (visualize) {
    this.visual.text(result, target.pos, { font: 0.5, align: 'left', color: 'cyan' })
  }
  return result
}

Creep.prototype.getCanBeKilled = function (damage, heal) {
  return getCanBeKilled(this.body, damage, heal)
}

getCanBeKilled = function (creepBody, damage, heal) {
  let body = _.cloneDeep(creepBody)

  i = 0
  while (true) {
    const hitsBefore = getHits(body)
    body = applyDamageAndHeal(body, damage, heal)
    i++
    const hitsAfter = getHits(body)
    if (hitsAfter <= 0) {
      return true
    }
    if (hitsAfter >= hitsBefore) {
      return false
    }
  }
}

Creep.prototype.getKillable = function (damageArray) {
  const packed = packCoord(this.pos.x, this.pos.y)
  const damage = damageArray[packed]

  if (this.hits < this.hitsMax) {
    return getCanBeKilled(this.body, damage, this.totalHealPower)
  }

  const username = this.owner.username

  const adjacents = this.pos.findInRange(FIND_CREEPS, 1).filter(creep => creep.owner.username === username)

  const isCanBeHurt = adjacents.some(creep => {
    const packed = packCoord(creep.pos.x, creep.pos.y)
    const damage = damageArray[packed]
    return creep.getCanBeHurt(damage)
  })

  if (!isCanBeHurt) {
    return false
  }

  let body = _.cloneDeep(this.body)

  const totalHealPowerBefore = this.totalHealPower
  const healPowerBefore = this.healPower

  const effectiveDamage = getEffectiveDamage(body, damage)
  body = applyDamage(body, effectiveDamage)
  const assumedHits = getHits(body)

  if (assumedHits === 0) {
    return true
  }

  const healPowerAfter = getBodyHealPower(body)
  const reduced = healPowerBefore - healPowerAfter

  const totalHealPowerAfter = totalHealPowerBefore - reduced

  return getCanBeKilled(body, damage, totalHealPowerAfter)
}

PowerCreep.prototype.getCanBeHurt = function (damage) {
  const leastPossiblePreHeal = this.getLeastPossiblePreHeal()
  return damage > leastPossiblePreHeal
}

Creep.prototype.getCanBeHurt = function (damage) {
  const effectiveDamage = this.getEffectiveDamage(damage)
  const leastPossiblePreHeal = this.getLeastPossiblePreHeal()
  return effectiveDamage > leastPossiblePreHeal
}

PowerCreep.prototype.getLeastPossiblePreHeal = Creep.prototype.getLeastPossiblePreHeal = function () {
  if (this._leastPossiblePreHeal !== undefined) {
    return this._leastPossiblePreHeal
  }

  const thisCreep = this
  const adjacentCreeps = this.pos.findInRange(FIND_CREEPS, 1)
  const adjacentAllies = adjacentCreeps.filter(creep => creep.owner.username === thisCreep.owner.username)

  if (adjacentAllies.some(creep => creep.id !== thisCreep.id && creep.hits < creep.hitsMax)) {
    return 0
  }

  const adjacentHealPowers = adjacentAllies.map(creep => creep.healPower)
  return this._leastPossiblePreHeal = Math.min(...adjacentHealPowers)
}

Creep.prototype.getEffectiveDamage = function (damage) {
  return getEffectiveDamage(this.body, damage)
}

function getEffectiveDamage(body, damage) {
  let damageReduce = 0
  let damageEffective = damage;

  if (body.some(part => part.boost !== undefined)) {
    for (const bodyPart of body) {
      if (damageEffective <= 0) {
        break;
      }
      let damageRatio = 1;
      if (bodyPart.boost &&
        BOOSTS[bodyPart.type][bodyPart.boost] &&
        BOOSTS[bodyPart.type][bodyPart.boost].damage) {
        damageRatio = BOOSTS[bodyPart.type][bodyPart.boost].damage;
      }
      const bodyPartHitsEffective = bodyPart.hits / damageRatio;
      damageReduce += Math.min(bodyPartHitsEffective, damageEffective) * (1 - damageRatio);
      damageEffective -= Math.min(bodyPartHitsEffective, damageEffective);
    }
  }
  return damage - Math.round(damageReduce);
}

function getHits(body) {
  let result = 0
  for (const part of body) {
    result += part.hits || 0
  }
  return result
}

function getBodyHealPower(body) {
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
    if (part.boost === 'XLHO2') {
      result += 48 // +300%
      continue
    }
    if (part.boost === 'LHO2') {
      result += 36 // +200%
      continue
    }
    if (part.boost === 'LO') {
      result += 24 // +100%
      continue
    }
  }
  return result
}

function applyDamage(body, damage) {
  for (let i = 0; i < body.length; i++) {
    if (damage <= 0) {
      break;
    }
    let damageToApply = Math.min(damage, body[i].hits);
    damage -= damageToApply;
    body[i].hits -= damageToApply;
  }
  return body;
}

function healDamage(body, damage) {
  for (let i = body.length - 1; i >= 0; i--) {
    if (damage <= 0) {
      break;
    }
    let damageToHeal = Math.min(damage, 100 - body[i].hits);
    damage -= damageToHeal;
    body[i].hits += damageToHeal;
  }
  return body;
}

function applyDamageAndHeal(body, damage, heal) {

  const effectiveDamage = getEffectiveDamage(body, damage)

  const damageToApply = effectiveDamage - heal

  if (damageToApply > 0) {
    return applyDamage(body, damageToApply)
  } else {
    return healDamage(body, damageToApply)
  }
}