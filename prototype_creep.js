Object.defineProperties(Creep.prototype, {
    assignedRoom: {
        get() {
            if (this.memory.assignedRoom) {
                return this.memory.assignedRoom
            }
            const splitedName = this.name.split(' ')
            return splitedName[0]
        }
    },
    originalRole: {
        get() {
            const splitedName = this.name.split(' ')
            return splitedName[1]
        }
    }
})

// pos is roomPosition
Creep.prototype.checkEmpty = function (pos) {
    const creep = pos.lookFor(LOOK_CREEPS)[0]
    if (!creep) {
        return true
    }
    if (this.id === creep.id) {
        return true
    }
    return false
}

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

Creep.prototype.moveToRoom = function (goalRoomName, ignoreMap = 0) {
    const target = new RoomPosition(25, 25, goalRoomName)
    return this.moveMy(target, { range: 23, ignoreMap })
}

Creep.prototype.getEnergyFrom = function (id) {
    const target = Game.getObjectById(id)
    if (!target || (!target.amount && !(target.store && target.store[RESOURCE_ENERGY]))) {
        return ERR_INVALID_TARGET
    }
    if (this.pos.getRangeTo(target) > 1) {
        this.moveMy(target, { range: 1 })
        return ERR_NOT_IN_RANGE
    }
    if (this.withdraw(target, RESOURCE_ENERGY) === OK) {
        return OK
    }
    return this.pickup(target)
}

Creep.prototype.searchPath = function (target, range = 0, maxRooms = 1, option = {}) { //option = {ignoreCreeps: true, avoidEnemy: false, avoidRampart: false, ignoreMap:0}
    let { ignoreCreeps, avoidEnemy, avoidRampart, ignoreMap } = option
    if (ignoreCreeps === undefined) {
        ignoreCreeps = true
    }
    if (avoidEnemy === undefined) {
        avoidEnemy = false
    }
    if (avoidRampart === undefined) {
        avoidRampart = false
    }

    // ignoreMap 0이면 map 무조건 반영 / 1이면 목적지만 무시 / 2면 모두 무시
    if (ignoreMap === undefined) {
        ignoreMap = 0
    }

    const thisCreep = this
    // mobility가 1이면 plain에서 2tick, swamp에서 10tick. mibility가 0.5면 plain에서 1tick, swamp에서 5tick
    const mobility = this.getMobility()
    const targetPos = target.pos || target

    let route = undefined
    // maxRooms가 1보다 크면 route 먼저 찾자
    if (maxRooms > 1) {

        // 목적지가 접근금지면 길 없음
        if (ignoreMap === 0 && Memory.map[targetPos.roomName] && Memory.map[targetPos.roomName].inaccessible > Game.time) {
            return ERR_NO_PATH
        }

        route = Game.map.findRoute(this.room, targetPos.roomName, {
            routeCallback(roomName, fromRoomName) {
                // 현재 creep이 있는 방이면 무조건 쓴다
                if (thisCreep.room.name === roomName) {
                    return 1
                }

                // ignoreMap이 1 이상이면 목적지는 무조건 간다
                if (ignoreMap >= 1 && roomName === targetPos.roomName) {
                    return 1
                }

                // ignoreMap이 2 미만이면 inaccessible로 기록된 방은 쓰지말자
                if (ignoreMap < 2 && Memory.map[roomName] && Memory.map[roomName].inaccessible > Game.time) {
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
        route.push(targetPos.roomName)
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

            // 방 보이는지 확인
            const room = Game.rooms[roomName]

            // 방 안보이면 기본 CostMatrix 쓰자
            if (!room) {
                return
            }

            // avoidRampart가 true면 defenseCostMatrix 사용. 아니면 basicCostmatrix 사용.
            let costs = (thisCreep.room.name === roomName && avoidRampart) ? room.defenseCostMatrix.clone() : room.basicCostmatrix.clone()
            // 방 보이고 ignoreCreeps가 false고 지금 이 방이 creep이 있는 방이면 creep 위치에 cost 255 설정
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
        return ERR_NOT_IN_RANGE
    }

    const annoyingCreep = targetPos ? targetPos.lookFor(LOOK_CREEPS)[0] : false
    if (annoyingCreep) {
        if (!annoyingCreep.my) {
            this.heap.stuck++
            return ERR_INVALID_TARGET
        }
        this.say('🙏', true)
        annoyingCreep.say('👌', true)
        annoyingCreep.move(annoyingCreep.pos.getDirectionTo(this))
        this.move(this.pos.getDirectionTo(annoyingCreep))
        if (annoyingCreep.move(annoyingCreep.pos.getDirectionTo(this)) === OK && this.move(this.pos.getDirectionTo(annoyingCreep)) === OK) {
            this.heap.stuck = 0
            return OK
        }
        return ERR_INVALID_TARGET
    }

    const annoyingPowerCreep = targetPos ? targetPos.lookFor(LOOK_POWER_CREEPS)[0] : false
    if (annoyingPowerCreep) {
        if (!annoyingPowerCreep.my) {
            this.heap.stuck++
            return ERR_INVALID_TARGET
        }
        this.say('🙏', true)
        annoyingPowerCreep.say('👌', true)
        if (this.move(this.pos.getDirectionTo(annoyingPowerCreep)) === OK && annoyingPowerCreep.move(annoyingPowerCreep.pos.getDirectionTo(this)) === OK) {
            this.heap.stuck = 0
            return OK
        }
        return ERR_INVALID_TARGET
    }

    // 앞에 아무것도 없는 상황이니 reset하자.
    return ERR_INVALID_TARGET
}

Creep.prototype.resetPath = function () {
    delete this.heap.path
    delete this.heap.target
    delete this.heap.stuck
    delete this.heap.lastPos
}

Creep.prototype.moveMy = function (target, option = {}) { //option = {range, avoidEnemy, avoidRampart, ignoreMap}
    let { range, avoidEnemy, avoidRampart, ignoreMap, ignoreCreeps } = option
    if (range === undefined) {
        range = 0
    }
    if (avoidEnemy === undefined) {
        avoidEnemy = false
    }
    if (avoidRampart === undefined) {
        avoidRampart = this.room.memory.militaryThreat && this.room.isWalledUp
    }
    if (ignoreMap === undefined) {
        ignoreMap = 0
    }
    if (ignoreCreeps === undefined) {
        ignoreCreeps = true
    }

    const targetPos = target.pos || target
    if (!(targetPos instanceof RoomPosition)) {
        data.recordLog(`FAIL: ${this.name} move`, this.room.name)
        return ERR_INVALID_TARGET
    }


    if (avoidRampart) {
        const defenseCostMatrix = this.room.defenseCostMatrix
        const spawn = this.room.structures.spawn[0]
        if (defenseCostMatrix.get(this.pos.x, this.pos.y) >= 254 && spawn) {
            return this.moveMy(spawn, { range: 1, avoidRampart: false })
        }

        let isValidTarget = false
        for (const pos of targetPos.getInRange(range)) {
            if (defenseCostMatrix.get(pos.x, pos.y) < 254) {
                isValidTarget = true
                break
            }
        }

        if (!isValidTarget) {
            return ERR_INVALID_TARGET
        }
    }




    // stay 중이면 return
    if (this.heap.stay > 0) {
        this.heap.stay--
        this.say(`🛌${this.heap.stay}`, true)
        return ERR_BUSY
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
        const result = this.searchPath(targetPos, range, maxRooms, { ignoreCreeps: ignoreCreeps, avoidEnemy, avoidRampart, ignoreMap })
        // 도착지까지 길이 안찾아지는 경우
        if (result.incomplete || result === ERR_NO_PATH) {
            this.heap.noPath = this.heap.noPath || 0
            this.heap.noPath++
            this.say(`❓${this.heap.noPath}`, true)
            if (this.heap.noPath > 1) {
                this.heap.stay = 20
            }
            return result
        }
        // 찾아진 경우
        delete this.heap.noPath
        this.heap.path = result.path
        this.heap.target = targetPos
    }

    // 직전 위치랑 지금 위치가 같은 경우
    if (this.heap.lastPos && (this.pos.isEqualTo(this.heap.lastPos) || (!isValidCoord(this.heap.lastPos.x, this.heap.lastPos.y) && !isValidCoord(this.pos.x, this.pos.y)))) {
        this.heap.stuck = this.heap.stuck || 0
        this.heap.stuck++
        this.say(`🚧${this.heap.stuck}`, true)
    } else {
        this.heap.stuck = 0
    }

    this.heap.lastPos = this.pos

    // stuck이 5이상인 경우 (지난 5tick이 제자리였던 경우)
    if (this.heap.stuck > 4) {
        const result = this.searchPath(targetPos, range, maxRooms, { ignoreCreeps: false, avoidEnemy, avoidRampart, ignoreMap })

        // 도착지까지 길이 안찾아지는 경우
        if (result.incomplete || result === ERR_NO_PATH) {
            this.heap.noPath = this.heap.noPath || 0
            this.heap.noPath++
            this.say(`❓${this.heap.noPath}`, true)
            if (this.heap.noPath > 1) {
                this.heap.stay = 20
            }
            return result
        }

        this.heap.path = result.path
        this.heap.target = targetPos
    } else if (this.heap.stuck > 1) { // stuck이 2이상인 경우 (지난 2tick이 제자리였던 경우)
        if (this.heap.path.length >= 5) { // 아직 갈 길이 멀면 무조건 swapPos
            return this.swapPos(this.heap.path[0])
        }

        // 갈 길이 먼거 아니면 일단 우회로 찾아보자
        const result = this.searchPath(targetPos, range, maxRooms, { ignoreCreeps: false, avoidEnemy, avoidRampart, ignoreMap })

        if (result.incomplete || result === ERR_NO_PATH) { //길이 안찾아져도 swapPos
            return this.swapPos(this.heap.path[0])
        }

        if (result.path.length > this.heap.path.length + 4) {  //너무 돌아가야되면 swapPos
            return this.swapPos(this.heap.path[0])
        }

        // 전부 아니면 우회하자

        // 도착지까지 길이 안찾아지는 경우
        if (result.incomplete || result === ERR_NO_PATH) {
            this.heap.noPath = this.heap.noPath || 0
            this.heap.noPath++
            this.say(`❓${this.heap.noPath}`, true)
            if (this.heap.noPath > 1) {
                this.heap.stay = 20
            }
            return result
        }

        this.heap.path = result.path
        this.heap.target = targetPos
    }

    // path의 첫번째에 도착했으면 첫 번째를 지우자
    if (this.heap.path[0] && this.pos.isEqualTo(this.heap.path[0])) {
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
            this.suicide()
        }
        if (this.pos.getRangeTo(anySpawn) > 2) {
            this.moveMy(anySpawn, { range: 2 })
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

Creep.prototype.checkBodyParts = function (type) {
    if (!Array.isArray(type)) {
        type = [type]
    }
    return this.body.find(part => type.includes(part.type)) ? true : false
}