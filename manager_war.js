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

  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      const pos = new RoomPosition(x, y, roomName)
      if (pos.isWall) {
        continue
      }
      room.visual.text(pos.getTowerDamageAt(), pos, { font: 0.4 })
    }
  }
}