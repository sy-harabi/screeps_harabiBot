function run(flag) { //플래그를 대입하는 함수 (이름 아님)
    if (flag.room && flag.room.controller.my) { // 방 보이고 먹었으면
        flag.memory.spawnPioneer = true
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

        if (flag.memory.removeHostileConstructionSites && flag.memory.destroyStructures && flag.room.structures.spawn.length && flag.room.controller.level >= 3) {
            flag.remove(); // 깃발 지워라
            return
        }
    }

    const roomName = flag.pos.roomName
    const closestMyRoom = flag.findClosestMyRoomAvoidEnemy(5)
    if (!closestMyRoom) {
        flag.remove()
        return
    }
    flag.memory.creeps = [
        `${flag.name} claimer`,
        `${flag.name} pioneer 1`,
        `${flag.name} pioneer 2`,
        `${flag.name} pioneer 3`,
        `${flag.name} pioneer 4`
    ]

    if ((!Game.rooms[roomName] || !Game.rooms[roomName].controller.my) && Object.keys(Game.creeps).indexOf(flag.memory.creeps[0]) === -1) { // 방 안보이고 claimer 없으면
        const spawn = closestMyRoom.structures.spawn.find(s => !s.spawning)
        if (!spawn) {
            return
        }
        if (spawn.spawnCreep([CLAIM, MOVE, MOVE, MOVE, MOVE, MOVE], flag.memory.creeps[0], {
            memory: {
                role: 'claimer',
                targetRoom: roomName,
                flag: flag.name
            }
        }) === OK) {
            return
        }
    }

    if (flag.isInvader) {
        closestMyRoom.spawnColonyDefender(flag.pos.roomName)
    }
    if (flag.isInvaderCore) {
        closestMyRoom.spawnColonyCoreDefender(flag.pos.roomName)
    }

    if (flag.memory.spawnPioneer) {
        for (let i = 1; i < 5; i++) { // romoteBuilder 생산
            if (Object.keys(Game.creeps).indexOf(flag.memory.creeps[i]) === -1) { // 해당 번호의 remoteBuilder 없으면 만들어라
                const spawn = closestMyRoom.structures.spawn.filter(s => !s.spawning)[0]
                if (!spawn) {
                    return
                }
                let pioneerBody = []
                for (j = 0; j < Math.min(10, Math.floor(closestMyRoom.energyAvailable / 200)); j++) {
                    pioneerBody.push(WORK, MOVE, CARRY)
                }
                if (spawn.spawnCreep(pioneerBody, flag.memory.creeps[i], {
                    memory: {
                        role: 'pioneer',
                        targetRoom: roomName,
                        working: false
                    }
                }) === OK) {
                    return
                }
            }
        }
    }
}
module.exports = { run }