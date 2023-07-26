Room.prototype.manageDefense = function () {
    this.memory.defense = this.memory.defense || {}
    const status = this.memory.defense
    status.state = status.state || 'normal'
    const targets = this.find(FIND_HOSTILE_CREEPS)
    const aggressiveTargets = targets.filter(creep => creep.checkBodyParts(INVADER_BODY_PARTS))
    if (aggressiveTargets.length === 0 && status.state === 'normal') {
        this.manageTower()
        return
    }
    this.visual.text(`⚔️${status.state}`, this.controller.pos.x + 0.75, this.controller.pos.y - 1.5, { align: 'left' })

    const strong = []
    const weak = []

    for (const target of targets) {
        if (!this.controller.safeMode && this.calcEnemyHealPower(target) - this.getTowerDamageFor(target) > 0) {
            strong.push(target)
            continue
        }
        weak.push(target)
    }

    if (strong.length > 0 && status.state === 'normal' && this.isWalledUp) {
        status.state = 'emergency'
        this.memory.militaryThreat = true
        for (const hauler of this.creeps.hauler) {
            hauler.memory.role = 'manager'
        }
    } else if (status.state === 'emergency' && strong.length === 0) {
        status.state = 'normal'
        this.memory.militaryThreat = false
    }

    if (status.state === 'emergency') {
        const roomDefenders = this.creeps.roomDefender
        if (roomDefenders.length < Math.ceil(strong.length / 2)) {
            this.requestRoomDefender()
        }
        let towerAttackCall = false
        for (const roomDefender of roomDefenders) {
            const target = roomDefender.pos.findClosestByRange(targets)
            if (roomDefender.holdBunker(target) === OK) {
                towerAttackCall = true
            }
        }
        if (!towerAttackCall) {
            const weakestRampart = this.weakestRampart
            if (this.weakestRampart) {
                for (const tower of this.structures.tower) {
                    tower.repair(weakestRampart)
                }
            }
        }
    }

    if (weak.length > 0) {
        this.towerAttack(weak[0])
    }
}

Room.prototype.requestRoomDefender = function () {
    let body = []
    const bodyLength = Math.min(Math.floor((this.energyCapacityAvailable) / 210), 16)
    for (let i = 0; i < bodyLength; i++) {
        body.push(MOVE)
    }
    for (let i = 0; i < bodyLength; i++) {
        body.push(ATTACK, ATTACK)
    }

    const name = `${this.name} roomDefender ${Game.time}_${this.spawnQueue.length}`
    const memory = {
        role: 'roomDefender'
    }
    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['roomDefender'] })
    this.spawnQueue.push(request)
}

Creep.prototype.holdBunker = function (target) { //target is enemy creep
    const targetPos = target.pos || target
    const ramparts = this.room.structures.rampart.sort((a, b) => targetPos.getRangeTo(a) - targetPos.getRangeTo(b))
    for (const rampart of ramparts) {
        if (this.checkEmpty(rampart.pos) && this.pos.getRangeTo(rampart.pos) > 0) {
            this.moveMy(rampart.pos)
        }
        if (this.pos.getRangeTo(target) <= 1) {
            if (this.attack(target) === OK) {
                this.room.towerAttack(target)
                return OK
            }
        }
        return false
    }
    if (this.pos.getRangeTo(targetPos) > 1) {
        this.moveMy(targetPos, { range: 1 })
    }
    if (this.attack(target) === OK) {
        this.room.towerAttack(target)
        return OK
    }
    return false
}

Room.prototype.manageTower = function () {
    // tower 없으면 멈춰
    if (this.structures.tower.length === 0) {
        return
    }

    // 다친 creep 있으면 치료
    if (this.creeps.wounded.length) {
        for (const tower of this.structures.tower) {
            tower.heal(tower.pos.findClosestByRange(this.creeps.wounded))
        }
        return
    }

    // 고장난 건물 있으면 수리
    if (this.structures.damaged.length) {
        for (const tower of this.structures.tower) {
            tower.repair(tower.pos.findClosestByRange(this.structures.damaged))
        }
        return
    }

    // rampart 없으면 종료
    if (this.structures.rampart.length === 0) {
        return
    }

    const threshold = (this.controller.level - 4) * 400000 // rcl5에 400K, 6에 800K, 7에 1.2M, 8에 1.6M
    const weakestRampart = this.weakestRampart

    // 제일 약한 rampart도 threshold 넘으면 종료
    if (weakestRampart.hits >= threshold) {
        return
    }

    // wallMaker 없으면 spawn
    if (!this.creeps.wallMaker.length && this.storage && this.storage.store[RESOURCE_ENERGY] > 10000) {
        this.requestWallMaker()
    }

    // 제일 약한 rampart가 200k 안되면 수리
    if (weakestRampart.hits < 200000 && this.storage && this.storage.store[RESOURCE_ENERGY] > 10000) {
        for (const tower of this.structures.tower) {
            tower.repair(weakestRampart)
        }
        return
    }
}

Room.prototype.towerAttack = function (target) { //target은 enemy creep
    const towers = this.structures.tower
    for (const tower of towers) {
        tower.attack(target)
    }
}

Room.prototype.getTowerDamageFor = function (target) {//target은 enemy creep
    let damage = target.pos.getTowerDamageAt()
    let netDamage = target.getNetDamageFor(damage)
    this.visual.text(netDamage, target.pos, { color: '#f000ff' })
    return netDamage
}

Creep.prototype.getNetDamageFor = function (damage) {
    let result = 0
    const body = this.body.filter(part => part.hits > 0)
    for (const part of body) {
        if (damage <= 0) {
            break
        }
        if (part.type !== 'tough' || !part.boost) {
            result += Math.min(part.hits, damage)
            damage -= Math.min(part.hits, damage)
            continue
        }
        let ratio = 1
        switch (part.boost) {
            case 'XGHO2':
                ratio = 0.3
                break
            case 'GHO2':
                ratio = 0.5
                break
            case 'GO':
                ratio = 0.7
                break
        }
        result += Math.min(part.hits, damage * ratio)
        damage -= Math.min(part.hits, damage * ratio) / ratio
    }
    result = Math.floor(result + damage)
    return result
}


Room.prototype.calcEnemyHealPower = function (target) { //target은 enemy creep
    let result = 0
    const nearbyCreeps = target.pos.findInRange(FIND_HOSTILE_CREEPS, 3) //본인도 포함
    for (const creep of nearbyCreeps) {
        if (target.pos.getRangeTo(creep.pos) <= 1) {
            result += creep.calcHealPower()
            continue
        }
        result += (creep.calcHealPower() / 3) // short range 아니면 효율 1/3 됨
    }
    this.visual.text(result, target.pos.x, target.pos.y + 1, { color: '#74ee15' })
    return result
}

RoomPosition.prototype.getTowerDamageAt = function () { //target은 roomPosition 혹은 roomPosition 가지는 Object
    const towers = Game.rooms[this.roomName].structures.tower.filter(tower => tower.store[RESOURCE_ENERGY] > 0)

    let result = 0
    for (const tower of towers) {
        result += tower.attackDamage(this)
    }
    return result
}

StructureTower.prototype.attackDamage = function (target) { //target은 roomPosition 혹은 roomPosition 가지는 Object
    const targetPos = target.pos || target
    const range = this.pos.getRangeTo(targetPos)
    if (range <= 5) {
        return 600
    }
    if (range >= 20) {
        return 150
    }
    return 750 - 30 * range
}

Creep.prototype.calcHealPower = function () {
    const body = this.body
    let result = 0
    for (const part of body) {
        if (part.type !== 'heal') {
            continue
        }
        if (part.hits <= 0) {
            continue
        }
        if (!part.boost) {
            result += 12
            continue
        }
        if (part.boost === 'XLHO2') {
            result += 48 // +300%
            continue
        }
        if (part.boost === 'LHO2') {
            result += 36 // +200%
            continue
        }
        if (part.boost === 'LO') {
            result += 24 // +100%
            continue
        }
    }
    return result
}

Creep.prototype.calcAttackPower = function () {
    const body = this.body
    let result = 0
    for (const part of body) {
        if (part.type === 'attack') {
            if (part.hits <= 0) {
                continue
            }
            if (!part.boost) {
                result += 30
                continue
            }
            if (part.boost === 'UH') {
                result += 60 // +100%
                continue
            }
            if (part.boost === 'UH2O') {
                result += 90 // +200%
                continue
            }
            if (part.boost === 'XUH2O') {
                result += 120 // +300%
                continue
            }
        }
        if (part.type === 'ranged_attack') {
            if (part.hits <= 0) {
                continue
            }
            if (!part.boost) {
                result += 10
                continue
            }
            if (part.boost === 'KO') {
                result += 20 // +100%
                continue
            }
            if (part.boost === 'KHO2') {
                result += 30 // +200%
                continue
            }
            if (part.boost === 'XKHO2') {
                result += 40 // +300%
                continue
            }
        }
        continue
    }
    return result
}

// rampart 바깥쪽을 모두 구해서 cost를 높이는 method
Room.prototype.getDefenseCostMatrix = function (resultCost = 254, option = {}) { //option = {checkResult:false, exitDirection:FIND_EXIT}
    let { checkResult, exitDirection } = option

    if (checkResult === undefined) {
        checkResult = false
    }

    if (exitDirection === undefined) {
        exitDirection = FIND_EXIT
    }

    // heap에 있으면 heap을 return. 10tick 마다 갱신
    if (this.heap._defenseCostMatrix && Game.time % 10 !== 0) {
        const costMatrix = this.heap._defenseCostMatrix
        if (checkResult) {
            for (let x = 0; x <= 49; x++) {
                for (let y = 0; y <= 49; y++) {
                    this.visual.text(costMatrix.get(x, y), x, y, { font: 0.5 })
                }
            }
        }
        return costMatrix
    }

    const costMatrix = this.basicCostmatrix.clone()
    const sources = this.find(exitDirection) // exit에서 시작해서 닿을 수 있는 곳은 모두 outer

    const queue = [];

    // Set the cost to resultCost for each source position and add them to the queue
    for (const source of sources) {
        costMatrix.set(source.x, source.y, resultCost);
        queue.push(source);
    }

    const ADJACENT_VECTORS = [
        { x: 0, y: 1 },
        { x: 0, y: -1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: -1 },
        { x: -1, y: 1 },
        { x: -1, y: -1 },

    ]

    const leafNodes = []
    // Start the flood-fill algorithm
    while (queue.length) {
        const currentPos = queue.shift();
        // Get neighboring positions
        const neighbors = []

        for (const vector of ADJACENT_VECTORS) {
            if (0 <= currentPos.x + vector.x && currentPos.x + vector.x <= 49 && 0 <= currentPos.y + vector.y && currentPos.y + vector.y <= 49) {
                neighbors.push(new RoomPosition(currentPos.x + vector.x, currentPos.y + vector.y, this.name))
            }
        }

        let isLeaf = false
        for (const neighbor of neighbors) {
            const x = neighbor.x;
            const y = neighbor.y;
            if (neighbor.isWall) {
                isLeaf = true
                continue
            }
            if (neighbor.isRampart) {
                ifLeaf = true
                continue
            }
            if (costMatrix.get(x, y) < resultCost) {
                costMatrix.set(x, y, resultCost)
                queue.push(neighbor)
            }
        }
        if (isLeaf) {
            leafNodes.push(currentPos)
        }
    }

    for (const leafPos of leafNodes) {
        for (const pos of leafPos.getAtRange(3)) {
            if (!pos.isRampart && costMatrix.get(pos.x, pos.y) < resultCost) {
                costMatrix.set(pos.x, pos.y, resultCost)
            }
        }
        for (const pos of leafPos.getAtRange(2)) {
            if (!pos.isRampart && costMatrix.get(pos.x, pos.y) < resultCost) {
                costMatrix.set(pos.x, pos.y, resultCost)
            }
        }
    }

    return this.heap._defenseCostMatrix = costMatrix
}

Object.defineProperties(Room.prototype, {
    isWalledUp: {
        get() {
            if (this.heap._isWalledUp && Game.time % 10 !== 0) {
                return this.heap._isWalledUp
            }
            const spawn = this.structures.spawn[0]
            // spawn 없으면 false
            if (!spawn) {
                return this.heap._isWalledUp = false
            }
            // spawn 주변 위치 확인
            const nearSpawnPositions = spawn.pos.getAtRange(1)
            const defenseCostMatrix = this.getDefenseCostMatrix()
            for (const pos of nearSpawnPositions) {
                if (defenseCostMatrix.get(pos.x, pos.y) >= 200) {
                    continue
                } else {
                    // spawn 주변 위치에 하나라도 defenseCostMatrix cost 낮은 위치 있으면 막혀있는거
                    return this.heap._isWalledUp = true
                }
            }
            //여기까지 왔으면 spawn 주변 위치 모두 cost 높은 거니까 뚫린거
            return this.heap._isWalledUp = false
        }
    }
})