const IMPORTANT_STRUCTURE_TYPES = ['spawn', 'tower']

const SEIZE_NEXT_QUAD_INTERVAL = 500

Flag.prototype.seizeRoom = function () {
  if (this.memory.endTick && Game.time > this.memory.endTick) {
    this.remove()
  }

  if (this.memory.wait > 0) {
    this.memory.wait--
    return
  }

  const flags = Object.values(Game.flags)

  const quadFlags = flags.filter(flag => {
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
    if (ticksToLive < (CREEP_LIFE_TIME - SEIZE_NEXT_QUAD_INTERVAL)) {
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

  for (let y = 25; y < 50; y++) {
    const pos = new RoomPosition(25, y, this.pos.roomName)

    const found = pos.lookFor(LOOK_FLAGS)

    if (found.length) {
      continue
    }

    const flagName = `${this.pos.roomName} Quad ${Game.time}`

    pos.createFlag(flagName, COLOR_RED)
    return
  }


}

Flag.prototype.conductWar = function () {
  const roomName = this.pos.roomName
  const closestMyRoom = this.findClosestMyRoom(8)

  const observer = closestMyRoom.structures.observer[0]
  if (!observer) {
    return
  }
  observer.observeRoom(roomName)

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
    const netHeal = this.healPower - damageArray[i]
    if (netHeal < 0) {
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