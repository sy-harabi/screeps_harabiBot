function run(flag) { //플래그를 대입하는 함수 (이름 아님)
    const roomName = flag.pos.roomName
    const closestMyRoom = flag.findClosestMyRoom(7)
    const attacker = Game.creeps[`${flag.name} attacker`]
    const healer = Game.creeps[`${flag.name} healer`]
    const spawns = closestMyRoom.structures.spawn.filter(s => !s.spawning)

    if (flag.memory.end) {
        if (!attacker || !healer) {
            delete flag.memory
            flag.remove()
            flag.pos.createFlag(flag.name + '`')
            return
        }
    }

    if (flag.name.toLowerCase().includes('boost') && !flag.memory.boosted) {
        if (!closestMyRoom.memory.boost) {
            closestMyRoom.memory.boost = {}
            return
        }

        closestMyRoom.memory.boost.queue = closestMyRoom.memory.boost.queue || []
        const boostQueue = closestMyRoom.memory.boost.queue

        if (attacker && healer) {
            for (const part of attacker.body) {
                if (!part.boost) {
                    if (!boostQueue.includes(attacker.id)) {
                        delete attacker.memory.boosted
                        boostQueue.push(attacker.id)
                    }
                    flag.memory.boosted = false
                    return
                }
            }
            for (const part of healer.body) {
                if (!part.boost) {
                    if (!boostQueue.includes(healer.id)) {
                        boostQueue.push(healer.id)
                        delete healer.memory.boosted
                        console.log(healer.id)
                    }
                    flag.memory.boosted = false
                    return
                }
            }
            flag.memory.boosted = true
        } else {
            if (closestMyRoom.memory.boostState !== 'boost') {
                return
            }
        }
    }

    if (flag.memory.boosted) {
        for (const part of attacker.body) {
            if (!part.boost) {
                flag.memory.boosted = false
                return
            }
        }
        for (const part of healer.body) {
            if (!part.boost) {
                flag.memory.boosted = false
                return
            }
        }
        flag.memory.end = true
    }

    if (!attacker) {
        const spawn = spawns[0]
        if (spawn) {
            let body = []
            if (flag.name.includes('boost')) {
                if (!closestMyRoom.memory.boostState) {
                    return
                }
                for (let i = 0; i < 12; i++) {
                    body.push(TOUGH)
                }
                for (let i = 0; i < 28; i++) {
                    body.push(ATTACK)
                }
                // for (let i = 0; i < 8; i++) {
                //     body.push(RANGED_ATTACK)
                // }
                for (let i = 0; i < 10; i++) {
                    body.push(MOVE)
                }
            } else {
                for (let i = 0; i < 15; i++) {
                    body.push(ATTACK)
                }
                for (let i = 0; i < 10; i++) {
                    body.push(RANGED_ATTACK)
                }
                for (let i = 0; i < 25; i++) {
                    body.push(MOVE)
                }
            }

            if (spawn.spawnCreep(body, `${flag.name} attacker`, {
                memory: {
                    role: 'attacker',
                    healer: `${flag.name} healer`,
                    base: spawn.room.name
                }
            }) === OK) {
                spawns.shift()
            }
        }
    } else {
        attacker.attackRoom(roomName)
    }

    if (!healer) {
        const spawn = spawns[0]
        if (spawn) {
            let body = []
            if (flag.name.includes('boost')) {
                if (!closestMyRoom.memory.boostState) {
                    return
                }
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
                for (let i = 0; i < 10; i++) {
                    body.push(HEAL)
                }
                for (let i = 0; i < 10; i++) {
                    body.push(MOVE)
                }
                for (let i = 0; i < 5; i++) {
                    body.push(HEAL)
                }
                for (let i = 0; i < 5; i++) {
                    body.push(MOVE)
                }
            }
            if (spawn.spawnCreep(body, `${flag.name} healer`, {
                memory: {
                    role: 'healer',
                    attacker: `${flag.name} attacker`
                }
            }) === OK) {

                spawns.shift()
            }
        }
    } else {
        healer.care(attacker)
    }
}
module.exports = { run }