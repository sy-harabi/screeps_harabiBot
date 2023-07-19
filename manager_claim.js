Room.prototype.manageClaim = function () {
    this.memory.claimRoom = this.memory.claimRoom || {}
    if (Object.keys(this.memory.claimRoom).length === 0) {
        return
    }
    for (const roomName of Object.keys(this.memory.claimRoom)) {
        this.claimRoom(roomName)
    }
}

Room.prototype.claimRoom = function (roomName) {
    // room memory에 status object 만들기
    this.memory.claimRoom = this.memory.claimRoom || {}
    this.memory.claimRoom[roomName] = this.memory.claimRoom[roomName] || {}
    const status = this.memory.claimRoom[roomName]

    // targetRoom (안보이면 undefined)
    const targetRoom = Game.rooms[roomName]

    // claim part
    if (targetRoom && targetRoom.isMy) {
        status.isClaimed = true
    } else {
        status.isClaimed = false
        const claimer = getCreepsByRole(roomName, 'claimer')[0]
        if (!claimer) {
            this.requestClaimer(roomName)
        }
    }

    // clear part
    if (status.isClaimed && !status.isCleared) {
        for (const site of targetRoom.find(FIND_HOSTILE_CONSTRUCTION_SITES)) {
            site.remove()
        }
        const structures = targetRoom.find(FIND_STRUCTURES)
        let numLeft = 0
        for (const structure of structures) {
            if (structure.my) {
                continue
            }
            if (structure.store && structure.store[RESOURCE_ENERGY] > 100 && targetRoom.controller.level < 4) {
                numLeft++
                continue
            }
            structure.destroy()
        }
        if (numLeft === 0) {
            status.isCleared = true
        }
    }

    // defense part

    // defender가 죽은거면 방어 어려우니까 포기
    const map = OVERLORD.map
    if (map[roomName] && map[roomName].threat) {
        delete this.memory.claimRoom[roomName]
        return
    }
    const defenders = getCreepsByRole(roomName, 'colonyDefender')
    if (defenders.length === 0) {
        this.requestColonyDefender(roomName)
    }

    // 아직 claim 안된거면 여기서 멈춰
    if (!status.isClaimed) {
        return
    }

    // 작동하는 타워까지 있으면 이제 claim 끝
    const spawn = targetRoom.structures.spawn[0]
    const towerActive = targetRoom.structures.tower.find(tower => tower.isActive && tower.store[RESOURCE_ENERGY] > 0)
    if (targetRoom && spawn && towerActive && status.isCleared) {
        delete this.memory.claimRoom[roomName]
        return
    }

    // pioneer part

    // spawn 생기면 보내지 말자
    if (spawn) {
        return
    }

    const pioneers = getCreepsByRole(roomName, 'pioneer')
    let numWork = 0
    for (const pioneer of pioneers) {
        numWork += pioneer.getNumParts('work')
    }
    let number = pioneers.length ? Math.max(...pioneers.map(pioneer => pioneer.memory.number)) : 0
    if (numWork < 40) {
        number++
        return this.requestPioneer(roomName, number)
    }

}