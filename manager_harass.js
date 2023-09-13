Flag.prototype.harass = function (number = 2) {
    const roomName = this.pos.roomName
    const closestMyRoom = this.findClosestMyRoom(7)
    if (!closestMyRoom) {
        this.remove()
        return
    }
    const defenders = Overlord.getCreepsByRole(roomName, 'colonyDefender')
    if (defenders.length < number) {
        closestMyRoom.requestColonyDefender(roomName, { doCost: false })
    }
}