Flag.prototype.manageClearAll = function () {
    const closestMyRoom = this.findClosestMyRoom()
    const targetRoomName = this.pos.roomName
    const targetRoom = Game.rooms[targetRoomName]

    if (targetRoom && targetRoom.isMy) {
        const structures = targetRoom.find(FIND_STRUCTURES)

        for (const structure of structures) {
            structure.destroy()
        }

        for (const constructionSite of targetRoom.constructionSites) {
            constructionSite.remove()
        }

        for (const creep of targetRoom.find(FIND_MY_CREEPS)) {
            creep.suicide()
        }

        for (const powerCreep of targetRoom.find(FIND_MY_POWER_CREEPS)) {
            powerCreep.suicide()
        }
        targetRoom.controller.unclaim()
        delete Memory.rooms[targetRoomName]
        this.remove()
        return
    }

    if ((!targetRoom || !targetRoom.controller.reservation || targetRoom.controller.reservation.ticksToEnd < 200 || targetRoom.controller.reservation.username === MY_NAME) && !Overlord.getNumCreepsByRole(targetRoomName, 'claimer')) {
        closestMyRoom.requestClaimer(targetRoomName)
        return
    }
}
