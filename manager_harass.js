Flag.prototype.harass = function (number = 2) {
    const roomName = this.pos.roomName
    const closestMyRoom = this.findClosestMyRoom(7)
    if (!closestMyRoom) {
        this.remove()
        return
    }
    const defenders = Overlord.getCreepsByRole(roomName, 'colonyDefender')
    const activeDefender = defenders.find(creep => creep.spawning || (creep.ticksToLive > 500))
    if (!activeDefender) {
        closestMyRoom.requestColonyDefender(roomName, { doCost: false })
        return
    }
}