Room.prototype.manageDefense = function () {
  const targets = this.find(FIND_HOSTILE_CREEPS)
  const towerImmuneTargets = []
  const threshold = (this.controller.level - 4) * 200000 // rcl5에 200K, 6에 400K, 7에 600K, 8에 800K
  const weakestRampart = this.weakestRampart
  if (targets.length) {
    let isInvincibleFoe = false
    if (this.structures.tower.length > 0) { // tower 있을 때

      let targetToAttack = undefined
      let damageExpected = 0

      for (const target of targets) {
        // 타워로 데미지 줄 수 있는지 확인
        const netDamage = this.getTowerDamageFor(target) - this.calcEnemyHealPower(target)
        if (netDamage > damageExpected) {
          targetToAttack = target
          damageExpected = netDamage
          continue //damage 줄 수 있으면 다음 타겟으로
        }

        // damage 못주면 immune으로 분류
        towerImmuneTargets.push(target)
        // immune이 NPC Invader인지 확인
        if (target.owner.username !== 'Invader') {
          isInvincibleFoe = true //Invader 아니면 invincibleFoe 등장한거임
        }
      }

      // immune 아닌 적 있으면
      if (targetToAttack) { //제일 약한애 공격
        return this.towerAttack(targetToAttack)
      }

      // invincibleFoe 있으면 위급상황인거임
      if (isInvincibleFoe) {
        console.log(this.name + 'emergency')
        this.visual.text('emergency💣', this.controller.pos.x + 0.75, this.controller.pos.y - 1.5, { align: 'left' })

        if (weakestRampart.hits < 0.1 * threshold) {
          if (this.controller.activateSafeMode() === OK) {
            data.recordLog(`${this.name} activate safe mode`)
          }
        }
        this.memory.militaryThreat = true //memory에 militaryThreat 입력
      }
    }
    // to-do : spawn a defense creep
  } else {
    if (this.memory.militaryThreat) {
      if (weakestRampart.hits > 0.95 * threshold) {
        this.memory.militaryThreat = false // 적 없어지고 수리 끝나면 militaryThreat끄자
      }
    }
  }

  for (const tower of this.structures.tower) {
    if (this.creeps.wounded.length) {
      tower.heal(tower.pos.findClosestByRange(this.creeps.wounded))
      continue
    }
    if (this.controller.level >= 5 && !data.cpuEmergency) {
      if (this.structures.rampart.length > 0) {
        if (weakestRampart.hits < threshold) {
          tower.repair(weakestRampart)
          continue
        }
      }
    }
    if (this.structures.damaged.length && !data.cpuEmergency) {
      tower.repair(tower.pos.findClosestByRange(this.structures.damaged))
      break;
    }

  }
}

Room.prototype.towerAttack = function (target) { //target은 enemy creep
  const towers = this.structures.tower
  for (const tower of towers) {
    tower.attack(target)
  }
}

Room.prototype.getTowerDamageFor = function (target) {//target은 enemy creep
  let result = 0
  let damage = target.pos.getTowerDamageAt()
  const body = target.body.filter(part => part.hits > 0)
  for (const part of body) {
    if (damage <= 0) {
      break
    }
    if (part.type !== 'tough' || !part.boost) {
      result += Math.min(part.hits, damage)
      damage -= 100
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
    result += Math.min(part.hits, damage * ratio)
    damage -= 100 / ratio
  }
  result = Math.floor(result)
  this.visual.text(result, target.pos, { color: '#f000ff' })
  return result
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
  this.visual.text(result, target.pos.x, target.pos.y + 1, { color: '#74ee15' })
  return result
}

RoomPosition.prototype.getTowerDamageAt = function () { //target은 roomPosition 혹은 roomPosition 가지는 Object
  const towers = Game.rooms[this.roomName].structures.tower.filter(tower => tower.store[RESOURCE_ENERGY] > 0)

  let result = 0
  for (const tower of towers) {
    result += tower.attackDamage(this)
  }
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