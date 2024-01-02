const DEFENSE_TEST = false
const REQUIRED_DAMAGE_RATIO = 0.2
const RAMPART_COST = 10
const VISUALIZE_DANGER_AREA = true
const RAMPART_HITS_TO_REPAIR_WITH_TOWERS = 5000
global.DANGER_TILE_COST = 254

Room.prototype.manageDefense = function () {
    this.memory.defense = this.memory.defense || {}

    const status = this.memory.defense
    status.state = status.state || 'normal'

    const targets = this.findHostileCreeps()

    if (targets.length > 0) {
        this.memory.lastHostileTick = Game.time
    }

    if (this.memory.level >= 4) {
        if (this.memory.publicRampart && targets.length > 0) {
            for (const rampart of this.structures.rampart) {
                rampart.setPublic(false)
            }
            this.memory.publicRampart = false
        } else if (!this.memory.publicRampart && Game.time > (this.memory.lastHostileTick || 0) + 10) {
            for (const rampart of this.structures.rampart) {
                rampart.setPublic(true)
            }
            this.memory.publicRampart = true
        }
    }

    const targetPowerCreeps = this.find(FIND_POWER_CREEPS).filter(creep => !creep.my)

    const aggressiveTargets = targets.filter(creep => creep.checkBodyParts(INVADER_BODY_PARTS))

    aggressiveTargets.push(...targetPowerCreeps)

    if (aggressiveTargets.length === 0 && status.state === 'normal') {
        this.manageTower(targets)
        return
    }
    this.visual.text(`⚔️${status.state}`, this.controller.pos.x + 0.75, this.controller.pos.y - 1.5, { align: 'left' })

    const invulnerables = this.getInvulnerables(aggressiveTargets)

    let attackPowerTotal = 0
    for (const target of aggressiveTargets) {
        attackPowerTotal += target.attackPower || 0
        attackPowerTotal += target.dismantlePower || 0
    }

    if (invulnerables.length > 0 && status.state === 'normal' && this.isWalledUp && attackPowerTotal > 0) {
        const invaderName = invulnerables[0].owner.username
        status.state = 'emergency'
        status.startTick = Game.time
        data.recordLog(`WAR: Emergency occured by ${invaderName}`, this.name, 0)
        this.memory.militaryThreat = true
        for (const hauler of this.creeps.hauler) {
            hauler.memory.role = 'manager'
        }
    } else if (status.state === 'emergency' && invulnerables.length === 0 && (attackPowerTotal === 0 || this.controller.safeMode)) {
        data.recordLog('WAR: Emergency ended', this.name)
        status.state = 'normal'
        delete status.startTick
        this.memory.militaryThreat = false
        this.memory.level = this.memory.level - 1
        for (const creep of this.find(FIND_MY_CREEPS)) {
            if (creep.memory.assignedRoom) {
                delete creep.memory.assignedRoom
            }
            if (creep.originalRole && creep.memory.role && creep.originalRole !== creep.memory.role) {
                creep.memory.role = creep.originalRole
                creep.say('🔄', true)
            }
        }
        const repairingForNuke = this.memory.defenseNuke && ['build', 'repair'].includes(this.memory.defenseNuke.state) && this.energyLevel > 50
        if (!repairingForNuke) {
            const laborers = this.creeps.laborer
            for (const laborer of laborers) {
                laborer.memory.role = 'wallMaker'
            }
        }
    }

    if (invulnerables.length > 0 && !this.isWalledUp && this.controller.level >= 2 && !this.controller.safeMode && !this.controller.safeModeCooldown) {
        const invaderName = invulnerables[0].owner.username
        data.recordLog(`WAR: Emergency occured by ${invaderName}. safemode activated`, this.name, 0)
        this.controller.activateSafeMode()
        return
    }

    if (status.state === 'emergency') {
        const spawn = this.structures.spawn[0]
        for (const creep of this.find(FIND_MY_CREEPS)) {
            if (creep.memory.role === 'recycle') {
                creep.getRecycled()
            }
            if (creep.assignedRoom === this.name) {
                if (spawn && this.defenseCostMatrix.get(creep.pos.x, creep.pos.y) >= DANGER_TILE_COST) {
                    creep.heap.backToBase = 3
                }
                if (creep.heap.backToBase > 0) {
                    creep.heap.backToBase--
                    creep.moveMy({ pos: spawn.pos, range: 1 }, { staySafe: false })
                }
                if (creep.memory.role === 'wallMaker') {
                    creep.memory.assignedRoom = this.name
                    creep.memory.role = 'laborer'
                }
                continue
            }
            creep.memory.assignedRoom = this.name
            if (creep.getActiveBodyparts(WORK) > 5) {
                creep.memory.role = 'laborer'
                continue
            }
            if (creep.attackPower > 500) {
                creep.memory.role = 'roomDefender'
                continue
            }
            if (creep.getActiveBodyparts(CARRY) > 5) {
                creep.memory.role = 'manager'
                continue
            }
            creep.memory.role = 'recycle'
        }
        if (Game.time > (status.startTick + 10 || 0)) {
            this.manageEmergency()
        }
    }

    this.manageTowerAttack(aggressiveTargets)
}

Room.prototype.getSurvivability = function (target) {
    const totalHealPower = target.totalHealPower
    const damage = this.getTowersDamageFor(target)
    return totalHealPower / damage
}

Room.prototype.manageTower = function (targets) {
    // tagets : 위협 안되는 hostile creep

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

    // 위협 안돼도 공격
    if (targets.length) {
        this.towerAttack(targets[0])
    }

    // rampart 없으면 종료
    if (this.structures.rampart.length === 0) {
        return
    }

    const threshold = (this.controller.level - 3) * RAMPART_HITS_PER_RCL
    const weakestRampart = this.weakestRampart

    // 제일 약한 rampart도 threshold 넘으면 종료
    if (weakestRampart.hits >= threshold) {
        this.heap.rampartOK = true
        return
    }

    this.heap.rampartOK = false

    // 제일 약한 rampart가 RAMPART_HITS_TO_REPAIR_WITH_TOWERS 안되면 수리
    if (weakestRampart.hits < RAMPART_HITS_TO_REPAIR_WITH_TOWERS && this.storage && this.storage.store[RESOURCE_ENERGY] > 5000) {
        const weakRamparts = this.structures.rampart.filter(ramart => ramart.hits < 20000).sort((a, b) => a.hits - b.hits)
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

Room.prototype.manageEmergency = function () {
    if (!this.isWalledUp) {
        return
    }

    // get rampart anchors and visualize
    const rampartAnchors = this.rampartAnchors
    for (const pos of rampartAnchors) {
        this.visual.circle(pos, { fill: 'yellow', radius: 0.7 })
    }

    // assign defenders to rampartAnchors for every tick
    if (Game.time > (this.memory.assignAnchorsTick || 0)) {
        this.assignRampartAnchors()
        this.memory.assignAnchorsTick = Game.time
    }

    // get rampartAnchors status
    const rampartAnchorsStatus = this.getRampartAnchorsStatus()

    // assign roomDefenders to each anchor (it is needed since we don't assign defenders to anchor every tick)
    for (const roomDefender of this.creeps.roomDefender) {
        const status = rampartAnchorsStatus[roomDefender.memory.assign]
        if (!status) {
            continue
        }
        status.defenders = status.defenders || []
        status.defenders.push(roomDefender)
    }

    // manage defender movement
    for (const status of Object.values(rampartAnchorsStatus)) {
        // get positions to sit
        const rampartPositions = this.defensiveAssessment.frontRampartPositions
        const positionsToSit = rampartPositions.filter(pos => pos.getTaxiRangeTo(status.closestIntruder.pos) <= status.closestRange + 1)
        // visualize positions to sit
        for (const pos of positionsToSit) {
            this.visual.rect(pos.x - 0.5, pos.y - 0.5, 1, 1, { fill: 'transparent', stroke: 'cyan' })
        }

        // get defenders
        const defenders = status.defenders
        if (!defenders) {
            continue
        }

        // get CostMatrix for check defender positions
        const costsForOut = barrierCosts.clone()

        // classify defenders by path length to sit positions
        defenders.forEach(defender => {
            // set 0s to costsForOut.
            costsForOut.set(defender.pos.x, defender.pos.y, 0)

            // return if will be boosted
            if (defender.memory.boosted === false) {
                return
            }

            // get range to sitPositions.
            const range = defender.pos.getClosestRange(positionsToSit)
            defender.rangeToSitPosition = range
            // if range > 1, move to positionsToSit
            if (range > 1) {
                defender.moveMy(positionsToSit[0])
                return
            }

            // else attack nearby hostile creeps if possible
            defender.holdBunker()
        })

        const goal = positionsToSit.map(pos => { return { pos, range: 1 } })
        for (const pos of positionsToSit) {
            if (costsForOut.get(pos.x, pos.y) === 0) {
                continue
            }

            // if position is empty, check if defenders can fill empty positions
            // if there is a path from empty position to outside of sitPositions which consists of defenders,
            // make defenders on path to move toward empty position
            // than empty positions can be filled with defenders
            const searchToOut = PathFinder.search(pos, goal, {
                roomCallback: (roomName) => costsForOut,
                flee: true,
                maxOps: 200
            })

            if (searchToOut.incomplete) {
                continue
            }

            const path = searchToOut.path
            this.visual.poly(path, { stroke: 'lime' })

            for (const pathPos of path) {
                if (pathPos.creep) {
                    pathPos.creep.moveMy(pos)
                }
            }
            break
        }

    }
}

Room.prototype.assignDefenders = function () {
    // get anchors which nees defenders
    const anchorStatusesObject = this.getRampartAnchorsStatus()
    const anchorStatusesArray = Object.values(anchorStatusesObject)
    const anchorStatusesFiltered = anchorStatusesArray.filter(status => status.requiredDamageMax > 0)
    const anchorStatusesSorted = anchorStatusesFiltered.sort((a, b) => b.threatValue - a.threatValue)

    // keys for anchors
    const keys = anchorStatusesSorted.map(status => packCoord(status.pos.x, status.pos.y))

    // get freeDefenders
    const defenders = [...this.creeps.roomDefender]
    const freeDefenders = defenders.filter(defender => {
        if (!defender.memory.assign) {
            return true
        }
        if (!keys.includes(defender.memory.assign)) {
            return true
        }
        const status = anchorStatusesObject[defender.memory.assign]
        if (!status) {
            return true
        }
        if (status.requiredDamageMax > 0) {
            status.requiredDamageMax -= defender.attackPower
            status.numAssignedDefender++
            return false
        }
        return true
    })

    // check anchors
    outer:
    for (const status of anchorStatusesSorted) {
        if (status.requiredDamageMax <= 0) {
            continue
        }
        const packed = packCoord(status.pos.x, status.pos.y)
        freeDefenders.sort((a, b) => {
            const aValue = a.spawning ? 100 : a.pos.getRangeTo(status.pos)
            const bValue = b.spawning ? 100 : b.pos.getRangeTo(status.pos)
            return aValue - bValue
        })
        while (status.requiredDamageMax > 0 && status.numAssignedDefender < 3) {
            const defender = freeDefenders.shift()
            if (defender) {
                defender.memory.assign = packed
                status.requiredDamageMax -= defender.attackPower
                status.numAssignedDefender++
                continue
            }

            // check if we need defender

            if (!this._requestedRoomDefender) {
                const boost = Math.ceil(status.requiredDamageMax / this.meleeDefenderMaxAttackPower)
                this.requestRoomDefender(boost)
                status.numAssignedDefender++
                this._requestedRoomDefender = true
            }
            break outer
        }
    }

    outer:
    while (freeDefenders.length > 0 && anchorStatusesSorted.length > 0) {
        for (const status of anchorStatusesSorted) {
            if (freeDefenders.length > 0) {
                freeDefenders.sort((a, b) => a.pos.getRangeTo(status.pos) - b.pos.getRangeTo(status.pos))
                const defender = freeDefenders.shift()

                const packed = packCoord(status.pos.x, status.pos.y)
                defender.memory.assign = packed
                continue
            }
            break outer
        }
    }
}


Room.prototype.assignLaborers = function () {
    // get anchors which needs defenders
    const anchorStatusesObject = this.getRampartAnchorsStatus()
    const anchorStatusesArray = Object.values(anchorStatusesObject)
    const anchorStatusesFiltered = anchorStatusesArray.filter(status => status.totalAttackPower > 0)
    const anchorStatusesSorted = anchorStatusesFiltered.sort((a, b) => b.totalAttackPower - a.totalAttackPower)

    // keys for anchors
    const keys = anchorStatusesSorted.map(status => packCoord(status.pos.x, status.pos.y))

    // get freeLaborers
    const laborers = [...this.creeps.laborer]
    const freeLaborers = laborers.filter(laborer => {
        if (!laborer.memory.assign) {
            return true
        }
        if (!keys.includes(laborer.memory.assign)) {
            return true
        }
        const status = anchorStatusesObject[laborer.memory.assign]
        if (status.totalAttackPower > 0) {
            status.totalAttackPower -= laborer.repairPower
            return false
        }
        return true
    })

    // check anchors
    outer:
    for (const status of anchorStatusesSorted) {
        if (status.totalAttackPower <= 0) {
            continue
        }
        const packed = packCoord(status.pos.x, status.pos.y)
        freeLaborers.sort((a, b) => {
            const aValue = a.spawning ? 100 : a.pos.getRangeTo(status.pos)
            const bValue = b.spawning ? 100 : b.pos.getRangeTo(status.pos)
            return aValue - bValue
        })
        while (status.totalAttackPower > 0) {
            const laborer = freeLaborers.shift()
            if (laborer) {
                laborer.memory.assign = packed
                status.totalAttackPower -= laborer.repairPower
                continue
            }
            if (!this._requestedLaborer && this.laborer.numWork < EMERGENCY_WORK_MAX) {
                this._requestedLaborer = true
                this.requestLaborer(this.laborer.numWorkEach)
            }
            break outer
        }
    }

    outer:
    while (freeLaborers.length > 0 && anchorStatusesSorted.length > 0) {
        for (const status of anchorStatusesSorted) {
            if (freeLaborers.length > 0) {
                freeLaborers.sort((a, b) => a.pos.getRangeTo(status.pos) - b.pos.getRangeTo(status.pos))
                const laborer = freeLaborers.shift()

                const packed = packCoord(status.pos.x, status.pos.y)
                laborer.memory.assign = packed
                continue
            }
            break outer
        }
    }
}

Room.prototype.assignRampartAnchors = function () {
    this.assignDefenders()
    this.assignLaborers()
}

/**
 * Returns an object containing the status of rampart anchors.
 * 
 * @returns {Array} An array of the statuses of each anchor.
 * @returns {Object} returns[packed] - An object containing status of anchor
 * @returns {Array} returns[packed].intruders - Array of intruders
 * @returns {RoomPosition} returns[packed].pos - position of anchor
 * @returns {number} returns[packed].requiredDamageMax - largest required damage of active defenders to harm intruders
 * @returns {number} returns[packed].closestRange - closest range to intruders
 * @returns {number} returns[packed].closestIntruder - the intruder closest to ramparts
 * @returns {number} returns[packed].threatValue - (requiredDamageMax/closestRange).
 * @returns {Boolean} returns[packed].needBoost - if true, defenders should be boosted.
 */
Room.prototype.getRampartAnchorsStatus = function () {
    if (this._rampartAnchorsStatus) {
        return this._rampartAnchorsStatus
    }
    const intruders = this.findHostileCreeps().filter(creep => creep.checkBodyParts(['work', 'attack', 'ranged_attack', 'heal']))
    const result = {}
    const rampartAnchors = this.rampartAnchors

    if (DEFENSE_TEST) {
        intruders.push(...this.find(FIND_FLAGS))
    }
    for (const intruder of intruders) {
        const closestAnchor = intruder.pos.findClosestByRange(rampartAnchors)
        const packed = packCoord(closestAnchor.x, closestAnchor.y)

        result[packed] = result[packed] || {}
        result[packed].intruders = result[packed].intruders || []

        result[packed].intruders.push(intruder)
    }

    const ramparts = this.structures.rampart

    for (const rampartAnchor of rampartAnchors) {
        const packed = packCoord(rampartAnchor.x, rampartAnchor.y)
        const status = result[packed]
        if (!status || !status.intruders) {
            continue
        }

        let requiredDamageMax = 0
        let closestRange = Infinity
        let closestIntruder = undefined
        let totalAttackPower = 0

        for (const intruder of status.intruders) {
            const netDamage = Math.ceil(intruder.hitsMax * REQUIRED_DAMAGE_RATIO)
            const requiredDamage = this.getRequiredDamageFor(intruder, { netDamage: netDamage, assumeFullPower: true }) - this.frontLineTowersDamageMin

            requiredDamageMax = Math.max(requiredDamageMax, requiredDamage)

            totalAttackPower += (intruder.attackPower + intruder.dismantlePower)

            const range = intruder.pos.getClosestTaxiRange(ramparts)
            if (range < closestRange) {
                closestRange = range
                closestIntruder = intruder
            }
        }
        status.closestIntruder = closestIntruder
        status.pos = rampartAnchor
        status.requiredDamageMax = requiredDamageMax
        if (DEFENSE_TEST) {
            status.requiredDamageMax = 200
        }
        status.closestRange = closestRange
        status.threatValue = Math.ceil(totalAttackPower / closestRange)
        status.totalAttackPower = totalAttackPower
        status.numAssignedDefender = 0

        if (DEFENSE_TEST) {
            status.totalAttackPower = 1000
        }

        this.visual.text(`👿🗡️${status.totalAttackPower}`, rampartAnchor.x, rampartAnchor.y - 0.5, { color: 'magenta', font: 0.5 })
        this.visual.text(`👿🛡️${status.requiredDamageMax}`, rampartAnchor.x, rampartAnchor.y, { color: 'lime', font: 0.5 })
        this.visual.text(`🚶${status.closestRange}`, rampartAnchor.x, rampartAnchor.y + 0.5, { color: 'cyan', font: 0.5 })
    }
    return this._rampartAnchorsStatus = result
}

Room.prototype.getRampartAnchors = function () {
    if (Game.time % 10 === 0) {
        delete this.heap._rampartAnchors
    }

    if (this.heap._rampartAnchors) {
        this.heap._rampartAnchors
    }

    const costsForGroupingRampart = new PathFinder.CostMatrix
    const rampartPositions = new Set()

    const ramparts = this.frontRampartPositions
    ramparts.forEach(pos => {
        costsForGroupingRampart.set(pos.x, pos.y, 2)
        rampartPositions.add(packCoord(pos.x, pos.y))
    })

    const rampartClusters = []
    const rampartAnchors = []
    const CLUSTER_SIZE = 10 //assume double layer

    for (const rampartPos of rampartPositions) {
        const cluster = []

        const coord = parseCoord(rampartPos)
        if (costsForGroupingRampart.get(coord.x, coord.y) < 2) {
            continue
        }
        costsForGroupingRampart.set(coord.x, coord.y, 1)

        cluster.push(new RoomPosition(coord.x, coord.y, this.name))
        rampartAnchors.push(new RoomPosition(coord.x, coord.y, this.name))

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
    return this.heap._rampartAnchors = rampartAnchors
}

Room.prototype.towerAttackRandomly = function (targets) {
    const index = Math.floor(Math.random() * targets.length)
    const target = targets[index]
    const towers = this.structures.tower
    for (const tower of towers) {
        tower.attack(target)
    }
}

Room.prototype.getTowersDamageFor = function (target) {//target은 hostile creep
    let damage = target.pos.getTowerDamageAt()
    if (target instanceof PowerCreep) {
        return damage
    }
    let netDamage = target.getEffectiveDamage(damage)
    return netDamage
}

RoomPosition.prototype.getTowerDamageAt = function () {
    const towers = Game.rooms[this.roomName].structures.tower.filter(tower => !tower.my || tower.store[RESOURCE_ENERGY] > 0)

    let result = 0
    for (const tower of towers) {
        result += tower.getAttackDamageTo(this)
    }
    return result
}

StructureTower.prototype.getAttackDamageTo = function (target) { //target은 roomPosition 혹은 roomPosition 가지는 Object
    const targetPos = target.pos || target
    const range = this.pos.getRangeTo(targetPos)
    if (DEFENSE_TEST) {
        return 0
    }

    const effectiveRange = Math.min(TOWER_FALLOFF_RANGE, Math.max(range, TOWER_OPTIMAL_RANGE))
    const fallOffRatio = TOWER_FALLOFF * (effectiveRange - TOWER_OPTIMAL_RANGE) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE)

    let effectRatio = 1

    const effects = this.effects
    if (effects) {
        for (const effectInfo of effects) {
            if (effectInfo.effect === PWR_OPERATE_TOWER) {
                effectRatio += effectInfo.level * 0.1
            }
        }
    }

    return TOWER_POWER_ATTACK * (1 - fallOffRatio) * effectRatio
}

Object.defineProperties(Room.prototype, {
    defensiveAssessment: {
        get() {
            return this.getDefensiveAssessment()
        }
    },
    defenseCostMatrix: {
        get() {
            if (VISUALIZE_DANGER_AREA && !this._visualizeDefenseCostMatrix) {
                for (let x = 0; x < 50; x++) {
                    for (let y = 0; y < 50; y++) {
                        if (this.defensiveAssessment.costs.get(x, y) === DANGER_TILE_COST) {
                            this.visual.rect(x - 0.5, y - 0.5, 1, 1, { fill: 'red', opacity: 0.15 })
                        }
                    }
                }
                this._visualizeDefenseCostMatrix = true
            }
            return this.defensiveAssessment.costs
        }
    },
    frontLine: {
        get() {
            if (!this.isWalledUp) {
                return []
            }
            return this.defensiveAssessment.frontLine
        }
    },
    frontRampartPositions: {
        get() {
            if (!this.isWalledUp) {
                return []
            }
            return this.defensiveAssessment.frontRampartPositions
        }
    },
    rampartAnchors: {
        get() {
            if (!this.isWalledUp) {
                return []
            }
            return this.getRampartAnchors()
        }
    },
    isWalledUp: {
        get() {
            if (this._isWalledUp !== undefined) {
                return this._isWalledUp
            }
            if (Game.time % 10 === 0) {
                delete this.heap._isWalledUp
            }
            if (this.heap._isWalledUp !== undefined) {
                return this.heap._isWalledUp
            }
            const spawn = this.structures.spawn[0]
            // spawn 없으면 false
            if (!spawn) {
                return this.heap._isWalledUp = this._isWalledUp = false
            }
            // spawn 주변 위치 확인
            const nearSpawnPositions = spawn.pos.getAtRange(1)
            const defenseCostMatrix = this.defenseCostMatrix
            for (const pos of nearSpawnPositions) {
                if (defenseCostMatrix.get(pos.x, pos.y) < DANGER_TILE_COST) {
                    // spawn 주변 위치에 하나라도 defenseCostMatrix cost 낮은 위치 있으면 막혀있는거
                    return this.heap._isWalledUp = this._isWalledUp = true
                }
            }
            //여기까지 왔으면 spawn 주변 위치 모두 cost 높은 거니까 뚫린거
            return this.heap._isWalledUp = this._isWalledUp = false
        }
    },
    frontLineTowersDamageMin: {
        get() {
            if (!this.isWalledUp) {
                return undefined
            }
            if (this._frontLineTowersDamageMin) {
                return this._frontLineTowersDamageMin
            }
            if (Game.time % 100 === 0) {
                delete this.heap._frontLineTowersDamageMin
            }
            if (this.heap._frontLineTowersDamageMin) {
                return this.heap._frontLineTowersDamageMin
            }
            return this._frontLineTowersDamageMin = this.heap._frontLineTowersDamageMin = this.getFrontLineTowersDamageMin()
        }
    },
    meleeDefenderMaxAttackPower: {
        get() {
            if (DEFENSE_TEST) {
                return 60
            }
            if (this._roomDefenderMaxAttackPower) {
                return this._roomDefenderMaxAttackPower
            }
            const blockLength = Math.min(Math.floor((this.energyCapacityAvailable) / 210), 16)
            return this._roomDefenderMaxAttackPower = blockLength * 60
        }
    }
})

/**
 * get things neeeded to defense.
 * calculate is done once for every 10 ticks.
 * normally use cached results.
 * 
 * @returns {Object} an object containing belows
 * @returns {CostMatrix} returns.costs - a CostMatrix which has safe zone as cost < DANGER_TILE_COST and danger zone as cost === DANGER_TILE_COST
 * @returns {Array} returns.frontLine - an array of outer positions adjacent to ramparts
 * @returns {Array} returns.frontRampartPosition - an array of positions of outermost ramparts
 */
Room.prototype.getDefensiveAssessment = function () {
    if (this._defensiveAssessment) {
        return this._defensiveAssessment
    }

    if (Game.time % 10 === 0) {
        delete this.heap._defensiveAssessment
    }

    if (this.heap._defensiveAssessment) {
        return this.heap._defensiveAssessment
    }

    const costMatrix = this.basicCostmatrix.clone()

    const sources = []

    // positions of creeps which can kill mine are sources
    const killerCreeps = this.findHostileCreeps().filter(creep => creep.checkBodyParts(['attack', 'ranged_attack', 'work', 'heal']))
    for (const creep of killerCreeps) {
        sources.push(creep.pos)
    }

    if (sources.length === 0) {
        const exits = this.find(FIND_EXIT)
        sources.push(...exits)
    }

    const queue = [];

    // Set the cost to DANGER_TILE_COST for each source position and add them to the queue
    for (const source of sources) {
        costMatrix.set(source.x, source.y, DANGER_TILE_COST);
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
            if (costMatrix.get(x, y) < DANGER_TILE_COST) {
                costMatrix.set(x, y, DANGER_TILE_COST)
                queue.push(neighbor)
            }
        })
        if (isLeaf) {
            leafNodes.push(currentPos)
        }
        if (isFront) {
            if (costMatrix.get(currentPos.x, currentPos.y) < RAMPART_COST) {
                costMatrix.set(currentPos.x, currentPos.y, RAMPART_COST)
            }
            frontLine.push(currentPos)
        }
    }

    for (const leafPos of leafNodes) {
        for (const pos of leafPos.getAtRange(3)) {
            if (pos.isWall) {
                continue
            }
            if (!pos.isRampart && costMatrix.get(pos.x, pos.y) < DANGER_TILE_COST) {
                costMatrix.set(pos.x, pos.y, DANGER_TILE_COST)
            }
        }
        for (const pos of leafPos.getAtRange(2)) {
            if (pos.isWall) {
                continue
            }
            if (!pos.isRampart && costMatrix.get(pos.x, pos.y) < DANGER_TILE_COST) {
                costMatrix.set(pos.x, pos.y, DANGER_TILE_COST)
            }
        }
    }

    const frontRampartPositions = [...frontRampart].map(packed => {
        const coord = parseCoord(packed)
        return new RoomPosition(coord.x, coord.y, this.name)
    })

    return this._defensiveAssessment = this.heap._defensiveAssessment = { costs: costMatrix, frontLine, frontRampartPositions }
}

Room.prototype.getFrontLineTowersDamageMin = function () {
    let frontLineTowersDamageMin = Infinity

    for (const pos of this.frontLine) {
        const towersDamage = pos.getTowerDamageAt()
        if (towersDamage < frontLineTowersDamageMin) {
            frontLineTowersDamageMin = towersDamage
        }
    }
    return frontLineTowersDamageMin
}

Object.defineProperties(PowerCreep.prototype, {
    totalHealPower: {
        get() {
            if (this._totalHealPower) {
                return this._totalHealPower
            }
            return this._totalHealPower = this.room.getTotalHealPower(this)
        }
    },
})

Object.defineProperties(Creep.prototype, {
    healPower: {
        get() {
            if (this._healPower) {
                return this._healPower
            }
            return this._healPower = this.getHealPower()
        }
    },
    attackPower: {
        get() {
            if (this._attackPower) {
                return this._attackPower
            }
            return this._attackPower = this.getAttackPower()
        }
    },
    rangedAttackPower: {
        get() {
            if (this._rangedAttackPower) {
                return this._rangedAttackPower
            }
            return this._rangedAttackPower = this.getRangedAttackPower()
        }
    },
    totalHealPower: {
        get() {
            if (this._totalHealPower) {
                return this._totalHealPower
            }
            return this._totalHealPower = this.room.getTotalHealPower(this)
        }
    },
    repairPower: {
        get() {
            if (this._repairPower) {
                return this._repairPower
            }
            return this._repairPower = this.getRepairPower()
        }
    },
    dismantlePower: {
        get() {
            if (this._dismantlePower) {
                return this._dismantlePower
            }
            return this._dismantlePower = this.getDismantlePower()
        }
    }
})

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

Creep.prototype.getRepairPower = function () {
    const body = this.body
    let result = 0
    for (const part of body) {
        if (part.type !== 'work') {
            continue
        }
        if (part.hits <= 0) {
            continue
        }
        if (!part.boost) {
            result += 100
            continue
        }
        if (part.boost === 'LH') {
            result += 150 // +50%
            continue
        }
        if (part.boost === 'LH2O') {
            result += 180 // +80%
            continue
        }
        if (part.boost === 'XLH2O') {
            result += 200 // +100%
            continue
        }
    }
    return result
}

Creep.prototype.getDismantlePower = function () {
    const body = this.body
    let result = 0
    for (const part of body) {
        if (part.type !== 'work') {
            continue
        }
        if (part.hits <= 0) {
            continue
        }
        if (!part.boost) {
            result += 50
            continue
        }
        if (part.boost === 'ZH') {
            result += 100 // +100%
            continue
        }
        if (part.boost === 'ZH2O') {
            result += 150 // +200%
            continue
        }
        if (part.boost === 'XZH2O') {
            result += 200 // +300%
            continue
        }
    }
    return result
}

Creep.prototype.getRangedAttackPower = function () {
    const body = this.body
    let result = 0

    //copy boostRequest.requiredResources since we doesn't want to change request
    const boostrequiredResources = (this.room.isMy && this.room.boostQueue[this.name]) ? this.room.boostQueue[this.name].requiredResources : undefined
    const boostResources = {}
    for (const resourceType in boostrequiredResources) {
        boostResources[resourceType] = boostrequiredResources[resourceType].mineralAmount
    }

    for (const part of body) {
        if (part.type !== 'ranged_attack') {
            continue
        }

        if (part.hits <= 0) {
            continue
        }

        if (!part.boost && boostResources) {
            if (boostResources['KO'] && boostResources['KO'] >= 30) {
                result += 20 // +100%
                boostResources['KO'] -= 30
                continue
            }

            if (boostResources['KHO2'] && boostResources['KHO2'] >= 30) {
                result += 30 // +200%
                boostResources['KHO2'] -= 30
                continue
            }

            if (boostResources['XKHO2'] && boostResources['XKHO2'] >= 30) {
                result += 40 // +300%
                boostResources['XKHO2'] -= 30
                continue
            }
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
    return result
}

Creep.prototype.getAttackPower = function () {
    const body = this.body
    let result = 0

    //copy boostRequest.requiredResources since we doesn't want to change request
    const boostrequiredResources = (this.room.isMy && this.room.boostQueue[this.name]) ? this.room.boostQueue[this.name].requiredResources : undefined
    const boostResources = {}
    for (const resourceType in boostrequiredResources) {
        boostResources[resourceType] = boostrequiredResources[resourceType].mineralAmount
    }

    for (const part of body) {
        if (part.type === 'attack') {
            if (part.hits <= 0) {
                continue
            }

            if (!part.boost && boostResources) {
                if (boostResources['UH'] && boostResources['UH'] >= 30) {
                    result += 60 // +100%
                    boostResources['UH'] -= 30
                    continue
                }

                if (boostResources['UH2O'] && boostResources['UH2O'] >= 30) {
                    result += 90 // +200%
                    boostResources['UH2O'] -= 30
                    continue
                }

                if (boostResources['XUH2O'] && boostResources['XUH2O'] >= 30) {
                    result += 120 // +300%
                    boostResources['XUH2O'] -= 30
                    continue
                }
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

            if (!part.boost && boostResources) {
                if (boostResources['KO'] && boostResources['KO'] >= 30) {
                    result += 20 // +100%
                    boostResources['KO'] -= 30
                    continue
                }

                if (boostResources['KHO2'] && boostResources['KHO2'] >= 30) {
                    result += 30 // +200%
                    boostResources['KHO2'] -= 30
                    continue
                }

                if (boostResources['XKHO2'] && boostResources['XKHO2'] >= 30) {
                    result += 40 // +300%
                    boostResources['XKHO2'] -= 30
                    continue
                }
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

Room.prototype.requestRoomDefender = function (boost) {
    if (!this.hasAvailableSpawn()) {
        return
    }

    let body = []
    const bodyLength = Math.min(Math.floor((this.energyCapacityAvailable) / 210), 16)
    for (let i = 0; i < bodyLength; i++) {
        body.push(ATTACK, ATTACK)
    }
    for (let i = 0; i < bodyLength; i++) {
        body.push(MOVE)
    }

    if (DEFENSE_TEST) {
        body = [ATTACK, ATTACK, MOVE]
    }

    const name = `${this.name} roomDefender ${Game.time}_${this.spawnQueue.length}`
    const memory = {
        role: 'roomDefender'
    }

    const options = { priority: SPAWN_PRIORITY['attacker'] }
    const terminal = (this.terminal && this.terminal.RCLActionable) ? this.terminal : undefined
    const amount = bodyLength * 60
    if (boost > 3 && terminal) {
        const boosts = ['XUH2O', 'UH2O', 'UH']
        for (const resourceType of boosts) {
            if (terminal.gatherResource(resourceType, amount) === OK) {
                options.boostResources = [resourceType]
                memory.boosted = false
                break
            }
        }
    } else if (boost > 2 && terminal) {
        const boosts = ['UH2O', 'XUH2O', 'UH']
        for (const resourceType of boosts) {
            if (terminal.gatherResource(resourceType, amount) === OK) {
                options.boostResources = [resourceType]
                memory.boosted = false
                break
            }
        }
    } else if (boost > 1 && terminal) {
        const boosts = ['UH', 'UH2O', 'XUH2O']
        for (const resourceType of boosts) {
            if (terminal.gatherResource(resourceType, amount) === OK) {
                options.boostResources = [resourceType]
                memory.boosted = false
                break
            }
        }
    }
    const request = new RequestSpawn(body, name, memory, options)
    this.spawnQueue.push(request)
}

Creep.prototype.holdBunker = function () {
    const hostileCreeps = this.room.findHostileCreeps()
    const adjacentTargets = this.pos.findInRange(hostileCreeps, 1).sort((a, b) => a.hits - b.hits)
    if (adjacentTargets.length > 0) {
        if (this.attack(adjacentTargets[0]) === OK) {
            this.say('⚔️', true)
            return OK
        }
    }
    return ERR_NOT_FOUND
}

Room.prototype.getTotalHealPower = function (target) { //target은 hostile creep
    let result = 0
    const nearbyCreeps = target.pos.findInRange(FIND_CREEPS, 3) //본인도 포함
    for (const creep of nearbyCreeps) {
        if (target.owner.username !== creep.owner.username) {
            continue
        }
        if (target.pos.getRangeTo(creep.pos) <= 1) {
            result += creep.healPower
            continue
        }
        result += creep.healPower / 3
    }
    return result
}