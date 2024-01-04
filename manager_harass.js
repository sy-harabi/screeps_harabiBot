Flag.prototype.harass = function (number = 2) {
    const roomName = this.pos.roomName
    const closestMyRoom = this.findClosestMyRoom(6)
    if (!closestMyRoom) {
        this.remove()
        return
    }
    const defenders = Overlord.getCreepsByRole(roomName, 'colonyDefender')
    const activeDefenders = defenders.filter(creep => creep.spawning || (creep.ticksToLive > 500))
    if (activeDefenders.length < number) {
        closestMyRoom.requestColonyDefender(roomName, { doCost: false })
        return
    }
}

Flag.prototype.defend = function () {
    const roomName = this.pos.roomName
    const closestMyRoom = this.findClosestMyRoom(6)
    if (!closestMyRoom) {
        this.remove()
        return
    }

    const room = Game.rooms[roomName]
}