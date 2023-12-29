Flag.prototype.attackRoom = function () {
    const roomName = this.pos.roomName
    const boost = this.name.toLowerCase().includes('boost')
    const closestMyRoom = boost ? this.findClosestMyRoom(8) : this.findClosestMyRoom(7)
    const attacker = Game.creeps[`${this.name} attacker`]
    const healer = Game.creeps[`${this.name} healer`]

    if (!closestMyRoom) {
        delete this.memory
        this.remove()
    }

    if (this.memory.startAttack && (!attacker || !healer)) {
        if (this.memory.end) {
            delete this.memory
            this.remove()
            return
        }

        const thisRoom = this.room
        if (!thisRoom) {
            delete this.memory
            this.remove()
            return
        }
        const agentNames = [`${this.name} attacker`, `${this.name} healer`]
        const myTombstones = thisRoom.find(FIND_TOMBSTONES).filter(tombstone => tombstone.creep.my && tombstone.creep.ticksToLive > 1)
        const agentTombstone = myTombstones.find(tombstone => agentNames.includes(tombstone.creep.name))
        if (agentTombstone) {
            data.recordLog(`ATTACK: ${agentTombstone.creep.name} died stop attack`, roomName, 0)
            delete this.memory
            this.remove()
            return
        }
        delete this.memory
        this.remove()
        this.pos.createFlag(this.name + '`')
        return
    }

    if (!attacker) {
        closestMyRoom.requestAttacker(this.name, boost)
    }

    if (!healer) {
        closestMyRoom.requestHealer(this.name, boost)
    }

    if (!attacker || !healer) {
        return
    }

    if (boost && !this.memory.boosted) {
        this.memory.boosted = (attacker.memory.boosted !== false) && (healer.memory.boosted !== false)
        return
    }

    this.memory.startAttack = true

    attacker.attackRoom(roomName)
    healer.care(attacker)
}

Room.prototype.requestAttacker = function (flagName, boost = false) {
    if (!this.hasAvailableSpawn()) {
        return
    }

    let body = []

    if (boost) {
        for (let i = 0; i < 12; i++) {
            body.push(TOUGH)
        }
        for (let i = 0; i < 28; i++) {
            body.push(ATTACK)
        }
        for (let i = 0; i < 10; i++) {
            body.push(MOVE)
        }
    } else {
        for (let i = 0; i < 25; i++) {
            body.push(ATTACK)
        }
        for (let i = 0; i < 25; i++) {
            body.push(MOVE)
        }
    }

    const name = `${flagName} attacker`

    const memory = {
        role: 'attacker',
        healer: `${flagName} healer`,
        base: this.name
    }

    const options = { priority: SPAWN_PRIORITY['attacker'] }
    if (boost) {
        options.boostResources = ['XZHO2', 'XGHO2', 'XUH2O']
        memory.boosted = false
    }

    const request = new RequestSpawn(body, name, memory, options)
    this.spawnQueue.push(request)
}
Room.prototype.requestHealer = function (flagName, boost = false) {
    if (!this.hasAvailableSpawn()) {
        return
    }

    let body = []

    if (boost) {
        for (let i = 0; i < 15; i++) {
            body.push(TOUGH)
        }
        for (let i = 0; i < 25; i++) {
            body.push(HEAL)
        }
        for (let i = 0; i < 10; i++) {
            body.push(MOVE)
        }
    } else {
        for (let i = 0; i < 15; i++) {
            body.push(HEAL)
        }
        for (let i = 0; i < 15; i++) {
            body.push(MOVE)
        }
        for (let i = 0; i < 10; i++) {
            body.push(HEAL)
        }
        for (let i = 0; i < 10; i++) {
            body.push(MOVE)
        }
    }

    const name = `${flagName} healer`

    const memory = {
        role: 'healer',
        healer: `${flagName} attacker`,
        base: this.name
    }

    const options = { priority: SPAWN_PRIORITY['healer'] }
    if (boost) {
        options.boostResources = ['XZHO2', 'XGHO2', 'XLHO2']
        memory.boosted = false
    }

    const request = new RequestSpawn(body, name, memory, options)
    this.spawnQueue.push(request)
}