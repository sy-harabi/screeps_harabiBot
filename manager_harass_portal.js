Flag.prototype.portalFlanking = function () {
    const roomName = this.pos.roomName

    if (this.room && this.room.controller && !this.room.controller.owner) {
        this.remove()
    }

    const flags = Object.values(Game.flags)
    const portalFlag = flags.find(flag => {
        const name = flag.name.toLowerCase()
        return name.includes('portal') && !name.includes('flanking')
    })

    if (!portalFlag) {
        this.remove()
        return
    }

    const portalRoomName = portalFlag.pos.roomName

    if (!this.memory.closestMyRoom) {
        const closestMyRoom = Overlord.findClosestMyRoom(portalRoomName, 6, 5)
        this.memory.closestMyRoom = closestMyRoom.name
    }
    const closestMyRoom = Game.rooms[this.memory.closestMyRoom]

    if (!closestMyRoom) {
        this.remove()
        return
    }

    const defenders = Overlord.getCreepsByRole(roomName, 'colonyDefender')
    const activeDefenders = defenders.filter(creep => creep.spawning || (creep.ticksToLive > 500))
    if (activeDefenders.length < 2) {
        closestMyRoom.requestColonyDefender(roomName, { doCost: false, portalFlag: portalFlag.name })
        return
    }
}