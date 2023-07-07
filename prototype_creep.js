Object.defineProperties(Creep.prototype, {
    assignedRoom: {
        get() {
            const splitedName = this.name.split(' ')
            return splitedName[0]
        }
    }
})

Creep.prototype.getMobility = function () {
    let burden = 0
    let move = 0
    let usedCapacity = this.store.getUsedCapacity()
    for (const part of this.body) {
        if (part.type === MOVE) {
            move += (part.boost === 'XZHO2' ? 8 : part.boost === 'ZHO2' ? 6 : part.boost === 'ZO' ? 4 : 2)
            continue
        }
        if (part.type === CARRY) {
            if (usedCapacity > 0) {
                burden += 1
                usedCapacity -= 50
                continue
            }
            continue
        }
        burden += 1
        continue
    }
    return burden / move
}

Creep.prototype.moveToRoom = function (goalRoomName) {
    const target = new RoomPosition(25, 25, goalRoomName)
    return this.moveMy(target, { range: 23 })
}

Creep.prototype.travelTo = function (goalRoomName) {

}

Creep.prototype.getEnergyFrom = function (id) {
    const target = Game.getObjectById(id)
    if (target) {
        if (this.withdraw(target, RESOURCE_ENERGY) === -9 || this.pickup(target) === -9) {
            this.moveMy(target, { range: 1 })
        }
    }
}

Creep.prototype.searchPath = function (target, range = 0, maxRooms = 1, option = { ignoreCreeps: true, avoidEnemy: false, avoidRampart: false }) {
    const { ignoreCreeps, avoidEnemy, avoidRampart } = option
    const thisCreep = this
    // mobility가 1이면 plain에서 2tick, swamp에서 10tick. mibility가 0.5면 plain에서 1tick, swamp에서 5tick
    const mobility = this.getMobility()
    const targetPos = target.pos || target
    let route = undefined
    // maxRooms가 1보다 크면 route 먼저 찾자
    if (maxRooms > 1) {
        route = Game.map.findRoute(this.room, targetPos.roomName, {
            routeCallback(roomName, fromRoomName) {
                // inaccessible로 기록된 방은 쓰지말자
                if (Memory.map[roomName] && Memory.map[roomName].inaccessible > Game.time) {
                    return Infinity
                }

                // 막혀있거나, novice zone이거나, respawn zone 이면 쓰지말자
                if (Game.map.getRoomStatus(roomName).status !== 'normal') {
                    return Infinity
                }

                const roomCoord = roomName.match(/[a-zA-Z]+|[0-9]+/g)
                roomCoord[1] = Number(roomCoord[1])
                roomCoord[3] = Number(roomCoord[3])
                const x = roomCoord[1]
                const y = roomCoord[3]
                // highway면 cost 1
                if (x % 10 === 0 || y % 10 === 0) {
                    return 1
                }

                // 내가 쓰고 있는 방이면 cost 1
                const isMy = Game.rooms[roomName] && (Game.rooms[roomName].isMy || Game.rooms[roomName].isMyRemote)
                if (isMy) {
                    return 1
                }

                // 다른 경우에는 cost 2.5
                return 2.5;
            }
        })

        // route 안찾아지면 ERR_NO_PATH return
        if (route === ERR_NO_PATH) {
            return ERR_NO_PATH
        }
        route = route.map(routeValue => routeValue.room)
        route.push(thisCreep.room.name)
    }

    // path 계산
    const result = PathFinder.search(this.pos, { pos: targetPos, range: range }, {
        plainCost: Math.ceil(2 * mobility),
        swampCost: Math.ceil(10 * mobility),
        roomCallback: function (roomName) {
            // route에 있는 방만 써라
            if (route && !route.includes(roomName)) {
                return false
            }

            const room = Game.rooms[roomName]

            // 방 안보이면 기본 CostMatrix 쓰자
            if (!room) {
                return true
            }
            let costs = room.basicCostmatrix.clone()
            // 방 보이고 ignoreCreeps가 false고 지금 이 방이 creep이 있는 방이면 basicCostMatrixWithCreeps 사용
            if (!ignoreCreeps && thisCreep.room.name === roomName) {
                for (const creep of thisCreep.room.find(FIND_CREEPS)) {
                    costs.set(creep.pos.x, creep.pos.y, 255)
                }
                for (const powerCreep of thisCreep.room.find(FIND_POWER_CREEPS)) {
                    costs.set(powerCreep.pos.x, powerCreep.pos.y, 255)
                }
            }
            // avoidEnemy가 true면 avoidEnemy
            if (avoidEnemy) {
                for (const creep of thisCreep.room.find(FIND_HOSTILE_CREEPS)) {
                    for (const pos of creep.pos.getInRange(3)) {
                        costs.set(pos.x, pos.y, 200)
                        thisCreep.room.visual.circle(pos)
                    }
                }
            }
            // avoidRampart가 true면 avoidRampart
            if (avoidRampart) {
                for (const rampart of thisCreep.room.structures.rampart) {
                    for (const pos of rampart.pos.getInRange(2)) {
                        costs.set(pos.x, pos.y, 200)
                        thisCreep.room.visual.circle(pos)
                    }
                }

            }
            return costs
        },
        maxRooms: maxRooms,
        maxOps: maxRooms > 1 ? (4000 * route.length) : 4000
    })

    // 길 표시
    for (let i = 0; i < result.path.length - 1; i++) {
        const posNow = result.path[i]
        const posNext = result.path[i + 1]
        if (posNow.roomName === posNext.roomName) {
            new RoomVisual(posNow.roomName).line(posNow, posNext, {
                color: 'aqua', width: .15,
                opacity: .2, lineStyle: 'dashed'
            })
        }
    }

    // route가 안찾아지면 ERR_NO_PATH. 그 외에는 pathFinder.search의 result
    return result
}

Creep.prototype.searchBattlePath = function (target, range = 1, maxRooms = 16) {
    const result = PathFinder.search(this.pos, { pos: (target.pos || target), range: range }, {
        plainCost: 2,
        swampCost: 10,
        roomCallback: function (roomName) {
            if (roomName === (target.roomName || target.room.name))
                return Game.rooms[roomName].costmatrixForBattle
        },
        maxRooms: maxRooms
    })
    this.memory.path = result.path
    return result
}

Creep.prototype.swapPos = function (targetPos) {
    // 뭔가 잘못된 상황이니 reset 하자
    if (this.pos.getRangeTo(targetPos) !== 1) {
        this.resetPath()
        return ERR_NOT_IN_RANGE
    }

    const annoyingCreep = targetPos ? targetPos.lookFor(LOOK_CREEPS)[0] : false
    if (annoyingCreep) {
        this.say('🙏', true)
        this.move(this.pos.getDirectionTo(annoyingCreep))
        annoyingCreep.say('👌', true)
        annoyingCreep.move(annoyingCreep.pos.getDirectionTo(this))
        this.heap.stuck = 0
        return OK
    }

    const annoyingPowerCreep = targetPos ? targetPos.lookFor(LOOK_POWER_CREEPS)[0] : false
    if (annoyingPowerCreep) {
        this.say('🙏', true)
        this.move(this.pos.getDirectionTo(annoyingPowerCreep))
        annoyingPowerCreep.say('👌', true)
        annoyingPowerCreep.move(annoyingPowerCreep.pos.getDirectionTo(this))
        this.heap.stuck = 0
        return OK
    }

    // 앞에 아무것도 없는 상황이니 reset하자.
    this.resetPath()
    return ERR_INVALID_TARGET
}

Creep.prototype.resetPath = function () {
    delete this.heap.path
    delete this.heap.target
    delete this.heap.stuck
    delete this.heap.lastPos
}

Creep.prototype.moveMy = function (target, option = {}) { //option = {range, avoidEnemy, avoidRampart}
    let { range, avoidEnemy, avoidRampart } = option
    if (range === undefined) {
        range = 0
    }
    if (avoidEnemy === undefined) {
        avoidEnemy = false
    }
    if (avoidRampart === undefined) {
        avoidRampart = false
    }
    const targetPos = target.pos || target
    if (this.room.memory.militaryThreat) {
        avoidRampart = true
    }
    //spawn 중이면 return
    if (this.spawning) {
        return ERR_BUSY
    }

    //fatigue 있으면 return
    if (this.fatigue) {
        return ERR_TIRED
    }

    //도착했으면 기억 지우고 return
    if (this.pos.roomName === targetPos.roomName && this.pos.getRangeTo(targetPos) <= range) {
        this.resetPath()
        return OK
    }

    //같은 방에 있으면 목적지 표시
    if (this.pos.roomName === targetPos.roomName) {
        this.room.visual.line(this.pos, targetPos, { color: 'yellow', lineStyle: 'dashed' })
    }

    //같은 방에 있으면 maxRooms 1로 하자. (같은 방에 있는 목적지 가려고 다른 방으로 나갔다 들어오는 거 방지)
    const maxRooms = (this.room.name === targetPos.roomName) ? 1 : 16
    //원래 target이 있었는데 지금 target이랑 다르거나, heap에 path가 없거나, heap에 있는 path가 비어있으면 새롭게 길 찾자
    if ((this.heap.target && !targetPos.isEqualTo(this.heap.target)) || !this.heap.path || !this.heap.path.length || avoidEnemy) {
        this.resetPath() //일단 지금 기억하고 있는 거 다 지우고 시작
        // searchPath는 route가 안찾아지면 ERR_NO_PATH고 그 외의 경우에는 PathFinder.search의 result다.
        const result = this.searchPath(targetPos, range, maxRooms, { ignoreCreeps: true, avoidEnemy, avoidRampart })
        // 도착지까지 길이 안찾아지는 경우
        if (result.incomplete || result === ERR_NO_PATH) {
            this.heap.noPath = this.heap.noPath || 0
            this.heap.noPath++
            this.say(`❓${this.heap.noPath}`, true)
            if (this.heap.noPath > 10) {
                data.recordLog(`${this.name} cannot find path from ${this.room.name} to ${targetPos.roomName}`)
                this.getRecycled()
            }
            return result
        }
        // 찾아진 경우
        delete this.heap.noPath
        this.heap.path = result.path
        this.heap.target = targetPos
    }

    // 직전 위치랑 지금 위치가 같은 경우
    if (this.heap.lastPos && this.pos.isEqualTo(this.heap.lastPos)) {
        this.heap.stuck = this.heap.stuck || 0
        this.heap.stuck++
        this.say(`🚧${this.heap.stuck}`, true)
    } else {
        this.heap.stuck = 0
    }

    this.heap.lastPos = this.pos

    // stuck이 2이상인 경우 (지난 2tick이 제자리였던 경우)
    if (this.heap.stuck > 1) {
        if (this.heap.path.length >= 5) { // 아직 갈 길이 멀면 무조건 swapPos
            return this.swapPos(this.heap.path[0])
        }

        // 갈 길이 먼거 아니면 일단 우회로 찾아보자
        const result = this.searchPath(targetPos, range, maxRooms, { ignoreCreeps: false, avoidEnemy, avoidRampart })

        if (result.incomplete) { //길이 안찾아져도 swapPos
            return this.swapPos(this.heap.path[0])
        }

        if (result.path.length > this.heap.path.length + 4) {  //너무 돌아가야되면 swapPos
            return this.swapPos(this.heap.path[0])
        }

        // 전부 아니면 우회하자
        this.heap.path = result.path
        this.heap.target = targetPos
    }

    // path의 첫번째에 도착했으면 첫 번째를 지우자
    if (this.pos.isEqualTo(this.heap.path[0])) {
        this.heap.path.shift()
    }

    // 다음꺼한테 가자
    const nextPos = this.heap.path[0]
    // 다음꺼 없으면 뭔가 잘못된거니까 리셋
    if (!nextPos) {
        this.resetPath()
        return ERR_NOT_FOUND
    }

    this.move(this.pos.getDirectionTo(nextPos))

    // 여기는 validCoord인데 다음꺼는 validCoord가 아니면 이제 방의 edge인거다. 다음꺼를 지우자.
    if (isValidCoord(this.pos.x, this.pos.y) && !isValidCoord(nextPos.x, nextPos.y)) {
        this.heap.path.shift()
    }

    return OK
}
// 가능한 return값은 OK, ERR_BUSY, ERR_TIRED, ERR_NOT_FOUND(nextPos 없을때)
// ERR_NO_PATH(route없을때), PathFInder.search()의 result(result.incomplete일 때)
// ERR_NOT_IN_RANGE(swapPos), ERR_INVALID_TARGET(swapPos)

Creep.prototype.getRecycled = function () {
    const closestSpawn = this.pos.findClosestByRange(this.room.structures.spawn.filter(s => !s.spawning))
    if (!closestSpawn) {
        const anySpawn = this.room.structures.spawn[0]
        if (!anySpawn) {
            return
        }
        if (!this.pos.isNearTo(anySpawn)) {
            this.moveMy(anySpawn, { range: 1 })
        }
        return false
    }
    if (closestSpawn.recycleCreep(this) === -9) {
        this.moveMy(closestSpawn, { range: 1 })
    }
}

Creep.prototype.getNumParts = function (partsName) {
    return this.body.filter(part => part.type === partsName).length
}