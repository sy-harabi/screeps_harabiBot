const VISUALIZE_GOAL = false
const VISUALIZE_MOVE = false

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

Creep.prototype.getCost = function () {
    const body = this.body

    let result = 0

    for (const part of body) {
        let multiplier = 1
        const boost = part.boost
        if (boost) {
            if (Object.values(TIER1_COMPOUNDS).includes(boost)) {
                multiplier = 2
            } else if (Object.values(TIER2_COMPOUNDS).includes(boost)) {
                multiplier = 3
            } else if (Object.values(TIER3_COMPOUNDS).includes(boost)) {
                multiplier = 4
            }
        }
        result += (BODYPART_COST[part.type] * multiplier)
    }

    return result
}

// pos is roomPosition
Creep.prototype.checkEmpty = function (pos) {
    const creep = pos.lookFor(LOOK_CREEPS)[0]
    if (!creep) {
        return OK
    }
    if (this.id === creep.id) {
        return OK
    }
    return creep
}

Creep.prototype.moveRandom = function () {
    const costs = this.room.basicCostmatrix
    const adjacents = this.pos.getAtRange(1).filter(pos => costs.get(pos.x, pos.y) < 255)
    const index = Math.floor(Math.random() * adjacents.length)
    const targetPos = adjacents[index]
    this.moveMy(targetPos)
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

Creep.prototype.moveToRoom = function (goalRoomName, ignoreMap) {
    if (ignoreMap === undefined) {
        ignoreMap = this.memory.ignoreMap || 0
    }

    const target = new RoomPosition(25, 25, goalRoomName)

    return this.moveMy({ pos: target, range: 23 }, { ignoreMap })
}

Creep.prototype.getEnergyFrom = function (id) {
    const target = Game.getObjectById(id)
    if (!target || (!target.amount && !(target.store && target.store[RESOURCE_ENERGY]))) {
        return ERR_INVALID_TARGET
    }
    if (this.pos.getRangeTo(target) > 1) {
        this.moveMy({ pos: target.pos, range: 1 })
        return ERR_NOT_IN_RANGE
    }
    this.setWorkingInfo(target.pos, 1)
    if (this.withdraw(target, RESOURCE_ENERGY) === OK) {
        return OK
    }
    return this.pickup(target)
}

/**
 * 
 * @param {array} goals - an array of goals {pos, range}. should be in normalized form.
 * @param {object} options 
 * @returns ERR_NO_PATH if there is no path. otherwise path(an array of roomPositions)
 */
Creep.prototype.searchPath = function (goals, options = {}) {

    const defaultOptions = { ignoreCreeps: true, avoidEnemy: false, staySafe: false, ignoreMap: 0, visualize: false }

    const mergedOptions = { ...defaultOptions, ...options }

    const { ignoreCreeps, avoidEnemy, staySafe, ignoreMap, visualize } = mergedOptions

    const thisCreep = this
    // mobility가 1이면 plain에서 2tick, swamp에서 10tick. mibility가 0.5면 plain에서 1tick, swamp에서 5tick
    const mobility = this.getMobility()

    const mainTargetPos = goals[0].pos
    const targetRoomName = mainTargetPos.roomName

    let route = undefined
    // maxRooms가 1보다 크면 route 먼저 찾자

    const maxRooms = this.room.name === targetRoomName ? 1 : 16

    if (maxRooms > 1) {

        // 목적지가 접근금지면 길 없음
        if (ignoreMap === 0 && Memory.map[targetRoomName] && Memory.map[targetRoomName].inaccessible > Game.time) {
            return ERR_NO_PATH
        }

        route = Game.map.findRoute(this.room, targetRoomName, {
            routeCallback(roomName, fromRoomName) {
                // 현재 creep이 있는 방이면 무조건 쓴다
                if (thisCreep.room.name === roomName) {
                    return 1
                }

                // ignoreMap이 1 이상이면 목적지는 무조건 간다
                if (ignoreMap >= 1 && roomName === targetRoomName) {
                    return 1
                }

                // ignoreMap이 2 미만이면 inaccessible로 기록된 방은 쓰지말자
                if (ignoreMap < 2 && Memory.map[roomName] && Memory.map[roomName].inaccessible > Game.time) {
                    return Infinity
                }

                // defense 있는 방이면 쓰지말자
                if (Memory.map[roomName] && Memory.map[roomName].inaccessible > Game.time && Memory.map[roomName].numTower > 0) {
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

        // route 안찾아지면 ERR_NO_PATH
        if (route === ERR_NO_PATH) {
            return ERR_NO_PATH
        }
        route = route.map(routeValue => routeValue.room)
        route.push(thisCreep.room.name)
        route.push(targetRoomName)
    }

    // path 계산
    const result = PathFinder.search(this.pos, goals, {
        plainCost: Math.max(1, Math.ceil(2 * mobility)),
        swampCost: Math.max(1, Math.ceil(10 * mobility)),
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

            // staySafe가 true면 defenseCostMatrix 사용. 아니면 basicCostmatrix 사용.
            let costs = (thisCreep.room.name === roomName && staySafe) ? room.defenseCostMatrix.clone() : room.basicCostmatrix.clone()
            // 방 보이고 ignoreCreeps가 false고 지금 이 방이 creep이 있는 방이면 creep 위치에 cost 255 설정
            if (ignoreCreeps !== true && thisCreep.room.name === roomName) {
                const creepCost = ignoreCreeps === false ? 255 : ignoreCreeps
                for (const creep of thisCreep.room.find(FIND_CREEPS)) {
                    costs.set(creep.pos.x, creep.pos.y, creepCost)
                }
                for (const powerCreep of thisCreep.room.find(FIND_POWER_CREEPS)) {
                    costs.set(powerCreep.pos.x, powerCreep.pos.y, creepCost)
                }
            }
            // avoidEnemy가 true면 avoidEnemy
            if (avoidEnemy) {
                for (const creep of thisCreep.room.find(FIND_HOSTILE_CREEPS)) {
                    for (const pos of creep.pos.getInRange(5)) {
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

    if (visualize) {
        visualizePath(result.path)
    }

    if (result.incomplete) {
        return ERR_NO_PATH
    }

    // route가 안찾아지면 ERR_NO_PATH. 그 외에는 path
    return result
}

global.visualizePath = function (path) {
    for (let i = 0; i < path.length - 1; i++) {
        const posNow = path[i]
        const posNext = path[i + 1]
        if (posNow.roomName === posNext.roomName) {
            new RoomVisual(posNow.roomName).line(posNow, posNext, {
                color: 'aqua', width: .15,
                opacity: .2, lineStyle: 'dashed'
            })
        }
    }
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

Creep.prototype.resetPath = function () {
    delete this.heap.path
    delete this.heap.stuck
    delete this.heap.lastPos
}

/**
 * 
 * @param {Object} goals - Either goal {pos, range} or array of goals.
 * @param {Object} options - Object containing following options
 * @param {number} options.range - range to pos before goal is considered reached. default is 0
 * @param {boolean} options.avoidEnemy - if true, avoid enemy creeps. usually used in SK rooms.
 * @param {boolean} options.staySafe - if true, don't go outside of protected area.
 * @param {number} options.ignoreMap - at 0, don't pass through inassessible roons. at 1, ignore assessibility of target room. at 2, totally ignore assessibility
 * @param {boolean} ignoreCreeps - if true, ignore creeps
 * @param {boolean} ignoreOrder - if true, ignore scheduled move
 * @returns {Constant} OK - The creep is arrived to target or move action is scheduled
 * @returns {Constant} ERR_BUSY - The creep is spawning or staying or already moved
 * @returns {Constant} ERR_TIRED - 	The fatigue indicator of the creep is non-zero.
 * @returns {Constant} ERR_NOT_FOUND - there's no nextPos
 * @returns {Constant} ERR_NO_PATH - there's no route or PathFinder failed
 * @returns {Constant} ERR_INVALID_TARGET - Tried swapPos but failed. target is not my creep or cannot move
 * @returns {Constant} ERR_NOT_IN_RANGE - Tried swapPos but failed. target is not adjacent
 */
Creep.prototype.moveMy = function (goals, options = {}) { //option = {avoidEnemy, staySafe, ignoreMap}
    const defaultOptions = {
        avoidEnemy: false,
        staySafe: (this.room.memory.militaryThreat && this.room.isWalledUp),
        ignoreMap: (this.memory.ignoreMap || 0),
        ignoreCreeps: true,
        ignoreOrder: false
    }
    const mergedOptions = { ...defaultOptions, ...options }

    const { avoidEnemy, staySafe, ignoreMap, ignoreCreeps, ignoreOrder } = mergedOptions

    goals = normalizeGoals(goals)

    if (goals.length === 0) {
        return ERR_INVALID_TARGET
    }

    const mainTargetPos = goals[0].pos

    if (staySafe) {
        const defenseCostMatrix = this.room.defenseCostMatrix
        const spawn = this.room.structures.spawn[0]
        if (defenseCostMatrix.get(this.pos.x, this.pos.y) >= DANGER_TILE_COST && spawn) {
            return this.moveMy({ pos: spawn.pos, range: 1 }, { staySafe: false, ignoreOrder: true })
        }

        let isValidTarget = false
        outer:
        for (const goal of goals) {
            for (const pos of goal.pos.getInRange(goal.range)) {
                if (defenseCostMatrix.get(pos.x, pos.y) < DANGER_TILE_COST) {
                    isValidTarget = true
                    break outer
                }
            }
        }

        if (!isValidTarget) {
            this.room.visual.line(this.pos, mainTargetPos, { color: 'red', lineStyle: 'dashed' })
            this.say('🚫', true)
            return ERR_INVALID_TARGET
        }
    }

    //도착했으면 기억 지우고 return
    if (this.pos.isInGoal(goals)) {
        this.resetPath()
        return OK
    }

    if (!ignoreOrder && this._moved) {
        this.say(`❌`, true)
        return ERR_BUSY
    }

    //spawn 중이면 return
    if (this.spawning) {
        return ERR_BUSY
    }

    // stay 중이면 return
    if (this.heap.stay) {
        if (this.heap.stay > Game.time) {
            this.room.visual.line(this.pos, mainTargetPos, { color: 'red', lineStyle: 'dashed' })
            this.say(`🛌${this.heap.stay - Game.time}`, true)
            return ERR_BUSY
        } else {
            delete this.heap.stay
            if (this.memory.role !== 'scouter' && !this.memory.notifiedStuck) {
                data.recordLog(`ERROR: ${this.name} got stucked`, this.room.name)
                this.memory.notifiedStuck = true
            }
        }
    }

    //같은 방에 있으면 목적지 표시. 다른 방에 있으면 지도에 표시
    if (this.pos.roomName === mainTargetPos.roomName) {
        if (VISUALIZE_GOAL === true) {
            this.room.visual.line(this.pos, mainTargetPos, { color: 'yellow', lineStyle: 'dashed' })
        }
    } else if (this.heap.path && this.heap.path.length > 0) {
        Game.map.visual.poly(this.heap.path, { stroke: '#ffe700', strokeWidth: 1, opacity: 0.75 })
    }

    //fatigue 있으면 return
    if (this.fatigue) {
        return ERR_TIRED
    }

    if (this.needNewPath(goals)) {
        this.resetPath()

        const result = this.searchPath(goals, { ignoreCreeps: ignoreCreeps, avoidEnemy, staySafe, ignoreMap })

        // 도착지까지 길이 안찾아지는 경우
        if (result === ERR_NO_PATH) {
            this.heap.noPath = this.heap.noPath || 0
            this.heap.noPath++
            this.say(`❓${this.heap.noPath}`, true)
            if (this.heap.noPath > 1) {
                this.heap.stay = Game.time + 10
            }
            return ERR_NO_PATH
        }

        // 찾아진 경우
        delete this.heap.noPath
        this.heap.path = result.path
    }

    // 직전 위치랑 지금 위치가 같은 경우
    if (this.checkStuck()) {
        this.heap.stuck = this.heap.stuck || 0
        this.heap.stuck++
        this.heap.lastPos = this.pos
        this.heap.lastPosTick = Game.time
    } else {
        this.heap.stuck = 0
    }

    if (this.heap.stuck > 10) {
        this.say(`🚧`, true)
        const result = this.searchPath(goals, { avoidEnemy, staySafe, ignoreMap })
        if (result === ERR_NO_PATH) {
            this.heap.noPath = this.heap.noPath || 0
            this.heap.noPath++
            this.say(`❓${this.heap.noPath}`, true)
            if (this.heap.noPath > 1) {
                this.heap.stay = Game.time + 10
            }
            return ERR_NO_PATH
        }

        this.heap.stuck = 0
        this.heap.path = result.path
    }
    this.heap.lastPos = this.pos
    this.heap.lastPosTick = Game.time

    // path의 첫번째에 도착했으면 첫 번째를 지우자
    if (this.heap.path[0] && this.pos.isEqualTo(this.heap.path[0])) {
        this.heap.path.shift()
    }

    // 다음꺼한테 가자
    const nextPos = this.heap.path[0]

    if ((VISUALIZE_MOVE || TRAFFIC_TEST) && nextPos) {
        this.room.visual.arrow(this.pos, nextPos, { color: 'red', opacity: 1 })
    }

    // 다음꺼 없거나 다음꺼가 멀면 뭔가 잘못된거니까 리셋
    if (!nextPos) {
        this.resetPath()
        this.say('🆑', true)
        return ERR_NOT_FOUND
    }

    if (this.pos.roomName !== nextPos.roomName || this.pos.getRangeTo(nextPos) > 1) {
        this.resetPath()
        this.say('🆑', true)
        return ERR_NOT_FOUND
    }

    this.setNextPos(nextPos)

    // 움직였으니까 _moved 체크
    this._moved = true

    // 여기는 validCoord인데 다음꺼는 validCoord가 아니면 이제 방의 edge인거다. 다음꺼를 지우자.
    if (isValidCoord(this.pos.x, this.pos.y) && !isValidCoord(nextPos.x, nextPos.y)) {
        this.heap.path.shift()
    }
    return OK
}

/**
 * 
 * @param {array} goals - an array of goals {pos, range}. should be in normalized form.
 * @returns {boolean} - whether this creep needs new path or not
 */
Creep.prototype.needNewPath = function (goals) {
    //원래 target이 있었는데 지금 target이랑 다르거나, heap에 path가 없거나, heap에 있는 path가 비어있으면 새롭게 길 찾자
    if (!this.heap.path) {
        return true
    }

    if (this.heap.path.length === 0) {
        return true
    }

    if (this.pos.getRangeTo(this.heap.path[0]) > 1) {
        return true
    }

    const cachedPath = this.heap.path
    const cachedPathLastPos = cachedPath[cachedPath.length - 1]
    if (cachedPathLastPos.isInGoal(goals)) {
        return false
    }

    return true
}

global.normalizeGoals = function (goals) {
    goals = Array.isArray(goals) ? goals : [goals]
    const result = []
    for (let i = 0; i < goals.length; i++) {
        const goal = goals[i]

        const pos = goal.pos || goal
        if (!RoomPosition.prototype.isPrototypeOf(pos)) {
            continue
        }

        const range = goal.range || 0
        if (isNaN(range)) {
            continue
        }

        result.push({ pos, range })
    }
    return result
}

RoomPosition.prototype.isInGoal = function (goals) {

    for (const goal of goals) {
        if (this.roomName !== goal.pos.roomName) {
            continue
        }
        if (this.getRangeTo(goal.pos) <= goal.range) {
            return true
        }
    }

    return false
}

Creep.prototype.checkStuck = function () {
    if (!this.heap.lastPos) {
        return false
    }
    if (!this.heap.lastPosTick) {
        return false
    }
    if ((Game.time - this.heap.lastPosTick) !== 1) {
        return false
    }
    if (this.pos.isEqualTo(this.heap.lastPos)) {
        return true
    }
    if (isValidCoord(this.heap.lastPos.x, this.heap.lastPos.y)) {
        return false
    }
    if (isValidCoord(this.pos.x, this.pos.y)) {
        return false
    }
    return true
}

Creep.prototype.getRecycled = function () {
    const closestSpawn = this.pos.findClosestByRange(this.room.structures.spawn.filter(s => !s.spawning))

    if (closestSpawn) {
        if (this.pos.getRangeTo(closestSpawn) > 1) {
            this.moveMy({ pos: closestSpawn.pos, range: 1 })
            return
        }
        closestSpawn.recycleCreep(this)
        return
    }

    const anySpawn = this.room.structures.spawn[0]
    if (anySpawn) {
        if (this.pos.getRangeTo(anySpawn) > 2) {
            this.moveMy({ pos: anySpawn.pos, range: 1 })
        }
        return
    }
    this.suicide()
    return
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