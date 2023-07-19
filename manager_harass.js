Flag.prototype.harass = function () {
    const roomName = this.pos.roomName
    const closestMyRoom = this.findClosestMyRoom(7)
    const defenders = getCreepsByRole(roomName, 'colonyDefender')
    if (defenders.length < 2) {
        closestMyRoom.requestColonyDefender(roomName)
    }
}