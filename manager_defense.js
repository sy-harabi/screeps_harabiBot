Room.prototype.manageDefense = function () {
    this.memory.defense = this.memory.defense || {}
    const status = this.memory.defense
    status.state = status.state || 'normal'
    const targets = this.find(FIND_HOSTILE_CREEPS)
    const aggressiveTargets = targets.filter(creep => creep.checkBodyParts(INVADER_BODY_PARTS))
    if (aggressiveTargets.length === 0 && status.state === 'normal') {
        this.manageTower(targets)
        return
    }
    this.visual.text(`⚔️${status.state}`, this.controller.pos.x + 0.75, this.controller.pos.y - 1.5, { align: 'left' })

    const strong = []
    const weak = []

    for (const target of aggressiveTargets) {
        if (!this.controller.safeMode && this.calcEnemyHealPower(target) - this.getTowersDamageFor(target) >= 0) {
            strong.push(target)
            continue
        }
        weak.push(target)
    }

    if (strong.length > 0 && status.state === 'normal' && this.isWalledUp) {
        const invaderName = strong[0].owner.username
        status.state = 'emergency'
        data.recordLog(`WAR: Emergency occured by ${invaderName}`, this.name)
        this.memory.militaryThreat = true
        for (const hauler of this.creeps.hauler) {
            hauler.memory.role = 'manager'
        }
    } else if (status.state === 'emergency' && strong.length === 0) {
        data.recordLog('WAR: Emergency ended', this.name)
        status.state = 'normal'
        this.memory.militaryThreat = false

        for (const creep of this.find(FIND_MY_CREEPS)) {
            if (creep.memory.assignedRoom) {
                delete creep.memory.assignedRoom
            }
            if (creep.originalRole && creep.memory.role && creep.originalRole !== creep.memory.role) {
                creep.memory.role = creep.originalRole
                creep.say('🔄', true)
            }
        }
    }

    if (status.state === 'emergency') {
        for (const target of strong) {
            this.getNeededDamageFor(target)
        }
        const spawn = this.structures.spawn[0]
        for (const creep of this.find(FIND_MY_CREEPS)) {
            if (creep.memory.role === 'recycle') {
                creep.getRecycled()
            }
            if (creep.assignedRoom === this.name) {
                if (spawn && this.defenseCostMatrix.get(creep.pos.x, creep.pos.y) >= 254) {
                    creep.heap.backToBase = 10
                }
                if (creep.heap.backToBase > 0) {
                    creep.heap.backToBase--
                    creep.moveMy(spawn, { range: 1, avoidRampart: false })
                }
                continue
            }
            creep.memory.assignedRoom = this.name
            if (creep.getActiveBodyparts(WORK) > 5) {
                creep.memory.role = 'laborer'
                continue
            }
            if (creep.getActiveBodyparts(CARRY) > 5) {
                creep.memory.role = 'manager'
                continue
            }
            creep.memory.role = 'recycle'
        }
        const roomDefenders = this.creeps.roomDefender
        if (roomDefenders.length < Math.ceil(strong.length / 2)) {
            this.requestRoomDefender()
        }
        let towerAttackCall = false
        for (const roomDefender of roomDefenders) {
            const target = roomDefender.pos.findClosestByRange(strong)
            if (roomDefender.holdBunker(target) === OK) {
                towerAttackCall = true
            }
        }
        if (!towerAttackCall) {
            const weakestRampart = this.weakestRampart
            if (this.weakestRampart.hits < 200000) {
                for (const tower of this.structures.tower) {
                    tower.repair(weakestRampart)
                }
                return
            }
            if (this.creeps.wounded.length) {
                const safeWounded = this.creeps.wounded.filter(creep => this.defenseCostMatrix.get(creep.pos.x, creep.pos.y) < 254)
                for (const tower of this.structures.tower) {
                    tower.heal(tower.pos.findClosestByRange(safeWounded))
                }
                return
            }
        }
    }

    if (weak.length > 0) {
        this.towerAttack(weak[0])
    }
}

Room.prototype.requestRoomDefender = function () {
    let body = []
    const bodyLength = Math.min(Math.floor((this.energyCapacityAvailable) / 130), 25)
    for (let i = 0; i < bodyLength; i++) {
        body.push(MOVE)
    }
    for (let i = 0; i < bodyLength; i++) {
        body.push(ATTACK)
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
        this.room.visual.line(this.pos, rampart.pos)
        if (!this.checkEmpty(rampart.pos)) {
            continue
        }
        if (this.pos.getRangeTo(rampart.pos) > 0) {
            return this.moveMy(rampart.pos)
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

Room.prototype.manageTower = function (targets) {
    // tagets : 위협 안되는 enemy creep

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
        outer:
        for (const structure of this.structures.damaged) {
            const towers = this.structures.tower.filter(tower => !tower.busy)
            for (const tower of towers.sort((a, b) => a.pos.getRangeTo(structure.pos) - b.pos.getRangeTo(structure.pos))) {
                if (tower.repair(structure) === OK) {
                    tower.busy = true
                    continue outer
                }
            }
        }
    }

    if (targets.length) {
        this.towerAttack(targets[0], targets[0].hits)
    }

    // rampart 없으면 종료
    if (this.structures.rampart.length === 0) {
        return
    }

    const threshold = (this.controller.level - 4) * 400000 // rcl5에 400K, 6에 800K, 7에 1.2M, 8에 1.6M
    const weakestRampart = this.weakestRampart

    // 제일 약한 rampart도 threshold 넘으면 종료
    if (weakestRampart.hits >= threshold) {
        this.heap.rampartOK = true
        return
    }

    this.heap.rampartOK = false

    // wallMaker 없으면 spawn
    if (!this.creeps.wallMaker.length && this.storage && this.storage.store[RESOURCE_ENERGY] > 10000) {
        this.requestWallMaker()
    }

    // 제일 약한 rampart가 200k 안되면 수리
    if (weakestRampart.hits < 200000 && this.storage && this.storage.store[RESOURCE_ENERGY] > 10000) {
        const weakRamparts = this.structures.rampart.filter(ramart => ramart.hits < 200000).sort((a, b) => a.hits - b.hits)
        outer:
        for (const structure of weakRamparts) {
            const towers = this.structures.tower.filter(tower => !tower.busy)
            if (towers.length === 0) {
                break outer
            }
            const towersSorted = towers.sort((a, b) => a.pos.getRangeTo(structure.pos) - b.pos.getRangeTo(structure.pos))
            for (const tower of towersSorted) {
                if (tower.repair(structure) === OK) {
                    tower.busy = true
                    continue outer
                }
            }
        }
        return
    }
}

Room.prototype.towerAttack = function (target, damageGoal) { //target은 enemy creep
    const towers = this.structures.tower.sort((a, b) => a.pos.getRangeTo(target.pos) - b.pos.getRangeTo(target.pos))
    const goal = damageGoal || target.hits
    const damageNeed = this.getNeededDamageFor(target, { damageGoal: goal, visualize: false })

    let damageExpected = 0
    for (const tower of towers) {
        tower.attack(target)
        damageExpected += tower.getAttackDamage(target)
        if (damageExpected >= damageNeed) {
            return
        }
    }
}

Room.prototype.getTowersDamageFor = function (target) {//target은 enemy creep
    let damage = target.pos.getTowerDamageAt()
    let netDamage = target.getNetDamageFor(damage)
    this.visual.text(netDamage, target.pos.x, target.pos.y + 1, { color: 'magenta' })
    return netDamage
}

Room.prototype.getNeededDamageFor = function (target, option = {}) {
    const { assumeFullPower, damageGoal, visualize } = option
    // target은 enemy creep
    // assumeFullPower : boolean. true면 target이 풀피라고 가정.
    if (!(target instanceof Creep)) {
        console.log('getNeededDamageFor:invalid target')
        return
    }
    const goal = damageGoal || this.calcEnemyHealPower(target)
    let result = 0
    const body = [...target.body]
    while (result <= goal && body.length > 0) {
        const part = body.shift()
        const hits = assumeFullPower ? 100 : part.hits
        if (hits === 0) {
            continue
        }
        if (part.type !== TOUGH) {
            result += hits
            continue
        }
        if (part.boost === undefined) {
            result += hits
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
        result += Math.ceil(hits / ratio)
    }
    if (visualize) {
        this.visual.text(result, target.pos, { color: 'cyan' })
    }
    return result
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
            result += creep.getHealPower()
            continue
        }
        result += (creep.getHealPower() / 3) // short range 아니면 효율 1/3 됨
    }
    this.visual.text(result, target.pos.x, target.pos.y + 2, { color: 'lime' })
    return result
}

RoomPosition.prototype.getTowerDamageAt = function () {
    const towers = Game.rooms[this.roomName].structures.tower.filter(tower => tower.store[RESOURCE_ENERGY] > 0)

    let result = 0
    for (const tower of towers) {
        result += tower.getAttackDamage(this)
    }
    return result
}

StructureTower.prototype.getAttackDamage = function (target) { //target은 roomPosition 혹은 roomPosition 가지는 Object
    const targetPos = target.pos || target
    const range = this.pos.getRangeTo(targetPos)
    // return 0 //for test
    if (range <= 5) {
        return 600
    }
    if (range >= 20) {
        return 150
    }
    return 750 - 30 * range
}

Creep.prototype.getHealPower = function () {
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

Creep.prototype.getAttackPower = function () {
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
                isLeaf = true
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
            if (pos.isWall) {
                continue
            }
            if (!pos.isRampart && costMatrix.get(pos.x, pos.y) < resultCost - 1) {
                costMatrix.set(pos.x, pos.y, resultCost - 1)
            }
        }
        for (const pos of leafPos.getAtRange(2)) {
            if (pos.isWall) {
                continue
            }
            if (!pos.isRampart && costMatrix.get(pos.x, pos.y) < resultCost - 1) {
                costMatrix.set(pos.x, pos.y, resultCost - 1)
            }
        }
    }

    if (checkResult) {
        for (let x = 0; x <= 49; x++) {
            for (let y = 0; y <= 49; y++) {
                this.visual.text(costMatrix.get(x, y), x, y, { font: 0.5 })
            }
        }
    }

    return costMatrix
}

Object.defineProperties(Room.prototype, {
    defensiveAssessment: {
        get() {
            return this.analyzeDefense()
        }
    },
    defenseCostMatrix: {
        get() {
            return this.defensiveAssessment.costs
        }
    },
    frontLine: {
        get() {
            return this.defensiveAssessment.frontLine
        }
    },
    frontRampartPositions: {
        get() {
            return this.defensiveAssessment.frontRampartPositions
        }
    },
    rampartAnchors: {
        get() {
            return this.getRampartAnchors()
        }
    },
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
            const defenseCostMatrix = this.defenseCostMatrix
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

/**
 * calculate once for every 10 ticks.
 * @returns costs: costMatrix which shows safe zone.
 * frontLine: possible positions that enemy creeps stands on for attack.
 * frontRampartPositions: outermost ramparts
 */

Room.prototype.analyzeDefense = function () {
    if (this._defensiveAssessment) {
        return this._defensiveAssessment
    }

    if (Game.time % 10 === 0) {
        delete this.heap._defensiveAssessment
    }

    if (this.heap._defensiveAssessment) {
        return this.heap._defensiveAssessment
    }

    const RESULT_COST = 255
    const costMatrix = this.basicCostmatrix.clone()
    const sources = this.find(FIND_EXIT) // exit에서 시작해서 닿을 수 있는 곳은 모두 outer

    const queue = [];

    // Set the cost to RESULT_COST for each source position and add them to the queue
    for (const source of sources) {
        costMatrix.set(source.x, source.y, RESULT_COST);
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
    const frontLine = []
    const frontRampart = new Set()
    // Start the flood-fill algorithm
    while (queue.length) {
        const currentPos = queue.shift();
        // check neighboring positions
        let isLeaf = false
        let isFront = false
        ADJACENT_VECTORS.forEach(vector => {
            const x = currentPos.x + vector.x
            const y = currentPos.y + vector.y
            if (x < 0 || x > 49 || y < 0 || y > 49) {
                return
            }
            const neighbor = new RoomPosition(x, y, this.name)
            if (neighbor.isWall) {
                isLeaf = true
                return
            }
            if (neighbor.isRampart) {
                isLeaf = true
                isFront = true
                frontRampart.add(packCoord(neighbor.x, neighbor.y))
                return
            }
            if (costMatrix.get(x, y) < RESULT_COST) {
                costMatrix.set(x, y, RESULT_COST)
                queue.push(neighbor)
            }
        })
        if (isLeaf) {
            leafNodes.push(currentPos)
        }
        if (isFront) {
            frontLine.push(currentPos)
        }
    }

    for (const leafPos of leafNodes) {
        for (const pos of leafPos.getAtRange(3)) {
            if (pos.isWall) {
                continue
            }
            if (!pos.isRampart && costMatrix.get(pos.x, pos.y) < RESULT_COST - 1) {
                costMatrix.set(pos.x, pos.y, RESULT_COST - 1)
            }
        }
        for (const pos of leafPos.getAtRange(2)) {
            if (pos.isWall) {
                continue
            }
            if (!pos.isRampart && costMatrix.get(pos.x, pos.y) < RESULT_COST - 1) {
                costMatrix.set(pos.x, pos.y, RESULT_COST - 1)
            }
        }
    }

    const frontRampartPositions = [...frontRampart].map(packed => {
        const coord = parseCoord(packed)
        return new RoomPosition(coord.x, coord.y, this.name)
    })

    return this._defensiveAssessment = this.heap._defensiveAssessment = { costs: costMatrix, frontLine, frontRampartPositions }
}

Room.prototype.defenseTraining = function () {
    let frontLineTowersDamageMin = Infinity
    let frontLineTowersDamageMinPos = undefined

    for (const pos of this.frontLine) {
        const towersDamage = pos.getTowerDamageAt()
        if (towersDamage < frontLineTowersDamageMin) {
            frontLineTowersDamageMin = towersDamage
            frontLineTowersDamageMinPos = pos
        }
        this.visual.text(towersDamage, pos, { font: 0.5 })
        this.visual.rect(pos.x - 0.5, pos.y - 0.5, 1, 1, { fill: 'red', opacity: 0.2 })
    }

    this.visual.circle(frontLineTowersDamageMinPos, { fill: 'yellow', radius: 1 })


    const rampartAnchors = this.rampartAnchors
    for (const pos of rampartAnchors) {
        this.visual.circle(pos)
    }
}

Room.prototype.getFrontLineMinTowersDamage = function () {
    let frontLineTowersDamageMin = Infinity

    for (const pos of this.frontLine) {
        const towersDamage = pos.getTowerDamageAt()
        if (towersDamage < frontLineTowersDamageMin) {
            frontLineTowersDamageMin = towersDamage
        }
    }

    return frontLineTowersDamageMin
}

Room.prototype.assignDefendersToRampartAnchors = function () {
    const anchors = this.assignIntrudersToRampartAnchors(intruders)

}

Room.prototype.assignIntrudersToRampartAnchors = function () {
    const intruders = this.find(FIND_HOSTILE_CREEPS).filter(creep => creep.checkBodyParts(['work', 'attack', 'ranged_attack', 'heal']))
    const result = {}
    const rampartAnchors = this.rampartAnchors
    for (const intruder of intruders) {
        const closestAnchor = intruder.pos.findClosestByRange(rampartAnchors)
        const packed = packCoord(closestAnchor.x, closestAnchor.y)
        result[packed] = result[packed] || []
        result[packed].push(intruder)
    }
    return result
}

Room.prototype.getRampartAnchors = function () {
    if (this._rampartAnchors) {
        return this._rampartAnchors
    }

    if (Game.time % 10 === 0) {
        delete this.heap._rampartAnchors
    }

    if (this.heap._rampartAnchors) {
        return this.heap._rampartAnchors
    }

    const costsForGroupingRampart = new PathFinder.CostMatrix
    const rampartPositions = new Set()

    const ramparts = this.frontRampartPositions
    ramparts.forEach(pos => {
        costsForGroupingRampart.set(pos.x, pos.y, 2)
        rampartPositions.add(packCoord(pos.x, pos.y))
    })

    const rampartClusters = []
    const rampartAnchours = []
    const CLUSTER_SIZE = 10 //assume double layer

    for (const rampartPos of rampartPositions) {
        const cluster = []

        const coord = parseCoord(rampartPos)
        if (costsForGroupingRampart.get(coord.x, coord.y) < 2) {
            continue
        }
        costsForGroupingRampart.set(coord.x, coord.y, 1)

        cluster.push(new RoomPosition(coord.x, coord.y, this.name))
        rampartAnchours.push(new RoomPosition(coord.x, coord.y, this.name))

        rampartPositions.delete(rampartPos)

        const queue = [rampartPos]

        outer:
        while (queue.length > 0) {
            const node = queue.shift()
            const coord = parseCoord(node)
            const pos = new RoomPosition(coord.x, coord.y, this.name)
            const adjacents = pos.getAtRange(1)
            for (const adjacent of adjacents) {
                if (costsForGroupingRampart.get(adjacent.x, adjacent.y) < 2) {
                    continue
                }

                costsForGroupingRampart.set(adjacent.x, adjacent.y, 1)

                rampartPositions.delete(packCoord(adjacent.x, adjacent.y))

                cluster.push(adjacent)
                queue.push(packCoord(adjacent.x, adjacent.y))

                if (cluster.length >= CLUSTER_SIZE) {
                    break outer
                }
            }
        }
        rampartClusters.push(cluster)
    }
    return this._rampartAnchors = this.heap._rampartAnchors = rampartAnchours
}