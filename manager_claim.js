function run(flag) { //플래그를 대입하는 함수 (이름 아님)
    if (flag.room && flag.room.controller.my) { // 방 보이고 먹었으면

        flag.memory.spawnPioneer = flag.room.controller.level < 2 ? true : false

        flag.memory.spawnDefender = true

        if (!flag.memory.removeHostileConstructionSites) {
            for (const site of flag.room.find(FIND_HOSTILE_CONSTRUCTION_SITES)) {
                site.remove()
            }
            flag.memory.removeHostileConstructionSites = true
        }

        if (!flag.memory.destroyStructures) {
            const structures = flag.room.find(FIND_STRUCTURES)
            for (const structure of structures) {
                if (!structure.my) {
                    structure.destroy()
                }
            }
            flag.room.memory.level = 0
            flag.memory.destroyStructures = true
        }

        if (flag.memory.removeHostileConstructionSites && flag.memory.destroyStructures && flag.room.structures.spawn.length && flag.room.structures.tower.length) {
            flag.remove(); // 깃발 지워라
            return
        }
    }

    const roomName = flag.pos.roomName
    const closestMyRoom = flag.findClosestMyRoomAvoidEnemy(4)
    const distance = flag.memory.distanceToClosestRoom || 10

    if (!closestMyRoom) {
        flag.remove()
        return
    }

    if ((!Game.rooms[roomName] || !Game.rooms[roomName].controller.my) && !getNumCreepsByRole(flag.pos.roomName, 'claimer')) { // 방 안보이고 claimer 없으면
        return closestMyRoom.requestClaimer(flag.pos.roomName)
    }


    if (flag.isInvaderCore) {
        if (!getNumCreepsByRole(flag.pos.roomName, 'colonyDefender')) {
            return closestMyRoom.requestColonyCoreDefender(flag.pos.roomName)
        }
    }

    if (flag.memory.spawnPioneer) {
        let pioneers = getCreepsByRole(flag.pos.roomName, 'pioneer').filter(creep => creep.ticksToLive > distance * 50)
        let numWork = 0
        for (const pioneer of pioneers) {
            numWork += pioneer.getNumParts('work')
        }
        let number = pioneers.length ? Math.max(...pioneers.map(pioneer => pioneer.memory.number)) : 0
        if (numWork < 40) {
            number++
            return closestMyRoom.requestPioneer(flag.pos.roomName, number)
        }
    }

    if (flag.memory.spawnDefender) {
        let colonyDefenders = getCreepsByRole(flag.pos.roomName, 'colonyDefender').filter(creep => creep.ticksToLive > distance * 50)
        if (!colonyDefenders.length) {
            return closestMyRoom.requestColonyDefender(flag.pos.roomName)
        }
    }

}
module.exports = { run }