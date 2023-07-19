Flag.prototype.manageClearAll = function () {
    const closestMyRoom = this.findClosestMyRoom()
    const targetRoomName = this.pos.roomName
    const targetRoom = Game.rooms[targetRoomName]

    if (targetRoom && targetRoom.isMy) {
        const structures = targetRoom.find(FIND_STRUCTURES)

        if (structures.length > 1) {
            for (const structure of structures) {
                structure.destroy()
            }
            return
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

    if ((!targetRoom || !targetRoom.controller.reservation || targetRoom.controller.reservation.ticksToEnd < 200 || targetRoom.controller.reservation.username === MY_NAME) && !getNumCreepsByRole(targetRoomName, 'claimer')) {
        closestMyRoom.requestClaimer(targetRoomName)
        return
    }
}
