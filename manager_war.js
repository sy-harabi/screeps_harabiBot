const IMPORTANT_STRUCTURE_TYPES = ['spawn', 'tower']

const SIEGE_NEXT_QUAD_INTERVAL = 500

Flag.prototype.siegeRoom = function () {
  if (this.memory.endTick && Game.time > this.memory.endTick) {
    this.remove()
  }

  if (this.memory.wait > 0) {
    this.memory.wait--
    return
  }

  this.memory.base = this.memory.base || this.findClosestMyRoom(8).name

  const flags = Object.values(Game.flags)

  const quadFlags = flags.filter(flag => {
    if (flag.memory.base !== this.memory.base) {
      return false
    }
    if (flag.pos.roomName !== this.pos.roomName) {
      return false
    }
    const name = flag.name.toLowerCase()
    if (!name.includes('quad')) {
      return false
    }
    return true
  })

  const activeQuadFlag = quadFlags.find(flag => {
    const ticksToLive = flag.memory.ticksToLive || 1500
    if (ticksToLive < (CREEP_LIFE_TIME - SIEGE_NEXT_QUAD_INTERVAL)) {
      return false
    }
    return true
  })

  if (activeQuadFlag) {
    return
  }

  if (quadFlags[0] && quadFlags[0].memory.quadBoosted !== true) {
    this.remove()
  }

  if (!this.room) {
    Overlord.observeRoom(this.pos.roomName)
    return
  }

  if (this.room.controller.safeMode > 300) {
    this.memory.wait = 100
    return
  }

  const spawn = this.room.find(FIND_HOSTILE_STRUCTURES).find(structure => structure.structureType === 'spawn')

  if (!spawn) {
    this.pos.createFlag(`${this.pos.roomName} harass ${Game.time}`)
    this.remove()
  }

  for (let y = this.pos.y + 1; y < 50; y++) {
    const pos = new RoomPosition(this.pos.x, y, this.pos.roomName)

    const found = pos.lookFor(LOOK_FLAGS)

    if (found.length) {
      continue
    }

    const flagName = `${this.name} Quad ${Game.time}`

    pos.createFlag(flagName, COLOR_RED)

    if (this.memory.base) {
      Memory.flags = Memory.flags || {}
      Memory.flags[flagName] = Memory.flags[flagName] || {}
      Memory.flags[flagName].base = this.memory.base
    }

    return
  }


}

Flag.prototype.conductWar = function () {
  Overlord.observeRoom(this.pos.roomName)

  const room = this.room
  if (!room) {
    return
  }

  const power = 2000

  if (power === 0) {
    return
  }

  const costArray = this.room.getCostArrayForBulldoze(power)

  const damageArray = this.room.getDamageArray()

  for (let i = 0; i < damageArray.length; i++) {
    const netHeal = 2500 - damageArray[i]
    if (netHeal < 0) {
      const pos = parseCoord(i)
      room.visual.rect(pos.x - 0.5, pos.y - 0.5, 1, 1, { fill: 'red', opacity: 0.15 })
      costArray[i] = 0
    }
  }

  const quadCostArray = transformCostArrayForQuad(costArray, this.roomName)

  const hostileStructures = this.room.find(FIND_HOSTILE_STRUCTURES)
  const importantStructures = hostileStructures.filter(structure => IMPORTANT_STRUCTURE_TYPES.includes(structure.structureType))

  const goals = importantStructures.map(structure => {
    return { pos: structure.pos, range: 0 }
  })

  const dijkstra = this.room.dijkstra(this.pos, goals, quadCostArray)

  this.room.visual.poly(dijkstra)
}