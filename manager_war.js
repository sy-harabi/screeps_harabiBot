const IMPORTANT_STRUCTURE_TYPES = ['spawn', 'tower']

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