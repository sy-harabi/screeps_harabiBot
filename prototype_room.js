const RAMPART_HIT_THRESHOLD = 5000000
const MAX_WORK = 80
const COST_FOR_HUB_CENTER = 30

Object.defineProperties(Room.prototype, {
    GRCL: {
        get() {
            if (this._GRCL !== undefined) {
                return this._GRCL
            }
            if ((!this.memory.GRCL) || (this.memory.GRCL < this.controller.level)) {
                this.memory.GRCLhistory = this.memory.GRCLhistory || {}
                this.memory.GRCLhistory[this.controller.level] = Game.time
                data.recordLog(`RCL: ${this.name} got RCL ${this.controller.level}`, this.name)
            }
            this.memory.GRCL = Math.max((this.memory.GRCL || 0), this.controller.level)
            return this._GRCL = this.memory.GRCL
        }
    },
    sources: {
        get() {
            if (this._sources) {
                return this._sources
            }
            const thisRoom = this
            if (this.memory.sources) {
                this._sources = this.memory.sources.map(id => {
                    const source = Game.getObjectById(id)
                    if (!source) {
                        delete thisRoom.memory.sources
                        return undefined
                    }
                    return source
                })
                return this._sources
            }
            this._sources = this.find(FIND_SOURCES)
            if (this.controller) {
                this._sources = this._sources.sort((a, b) => a.info.maxCarry - b.info.maxCarry)
                this.memory.sources = this._sources.map(source => source.id)
                return this._sources
            }
            this.memory.sources = this._sources.map(source => source.id)
            return this._sources
        }
    },
    structures: {
        get() {
            if (this._structures) {
                return this._structures
            }
            this._structures = {}
            for (const structureType of STRUCTURE_TYPES) {
                this._structures[structureType] = []
            }
            this._structures.obstacles = []
            this._structures.damaged = []
            this._structures.weakProtection = []
            this._structures.minProtectionHits = 0
            for (const structure of this.find(FIND_STRUCTURES)) {
                if (structure.structureType !== STRUCTURE_RAMPART && structure.structureType !== STRUCTURE_WALL && structure.hits / structure.hitsMax < 0.8) {
                    this._structures.damaged.push(structure)
                }
                if ((structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL)) {
                    if (structure.hits < RAMPART_HIT_THRESHOLD) {
                        this._structures.weakProtection.push(structure)
                    }
                    if (structure.hits < this._structures.minProtectionHits || this._structures.minProtectionHits === 0) {
                        this._structures.minProtectionHits = structure.hits
                    }
                }
                if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
                    this._structures.obstacles.push(structure)
                }
                this._structures[structure.structureType].push(structure)
            }
            return this._structures
        }
    },
    mineral: {
        get() {
            if (this._mineral) {
                return this._mineral
            }
            this._mineral = this.find(FIND_MINERALS)[0]
            return this._mineral
        }
    },
    creeps: {
        get() {
            if (this._creeps) {
                return this._creeps
            }
            const creeps = Overlord.classifyCreeps()
            this._creeps = creeps[this.name]
            return this._creeps
        }
    },
    laborer: {
        get() {
            if (this._laborer) {
                return this._laborer
            }
            this._laborer = {}
            this._laborer.numWork = 0
            this._laborer.numWorkEach = Math.min(Math.floor(this.energyCapacityAvailable / 300), 12) * 2
            for (const laborer of this.creeps.laborer.filter(creep => (creep.ticksToLive || 1500) > 3 * creep.body.length)) {
                this._laborer.numWork += laborer.body.filter(part => part.type === WORK).length
            }
            return this._laborer
        }
    },
    energy: {
        get() {
            if (!this._energy) {
                this._energy = 0
                if (this.storage) {
                    this._energy = this.storage.store[RESOURCE_ENERGY]
                }
            }
            return this._energy
        }
    },
    energyLevel: {
        get() {
            if (this._energyLevel) {
                return this._energyLevel
            }
            if (!this.controller) {
                return undefined
            }
            const level = this.controller.level
            const economyStandard = ECONOMY_STANDARD[level]
            const buffer = BUFFER[level]
            return this._energyLevel = (this.energy - economyStandard) / buffer
        }
    },
    constructionSites: {
        get() {
            if (!this._constructionSites) {
                this._constructionSites = this.find(FIND_MY_CONSTRUCTION_SITES)
            }
            return this._constructionSites
        }
    },
    basicCostmatrix: {
        get() {
            if (Game.time % 29 === 0) {
                delete this.heap.basicCostmatrix
            }

            if (this.heap.basicCostmatrix) {
                return this.heap.basicCostmatrix
            }

            const costs = new PathFinder.CostMatrix
            for (const structure of this.structures[STRUCTURE_ROAD]) {
                costs.set(structure.pos.x, structure.pos.y, 1)
            }
            for (const source of this.sources) {
                for (const pos of source.pos.getAtRange(1)) {
                    if (pos.terrain !== 1) {
                        costs.set(pos.x, pos.y, 10)
                    }
                }
            }
            for (const structure of this.structures.obstacles) {
                costs.set(structure.pos.x, structure.pos.y, 255)
            }
            for (const cs of this.constructionSites) {
                if (OBSTACLE_OBJECT_TYPES.includes(cs.structureType)) {
                    costs.set(cs.pos.x, cs.pos.y, 255)
                }
            }
            for (const rampart of this.structures.rampart) {
                if (!rampart.my && !rampart.isPublic) {
                    costs.set(rampart.pos.x, rampart.pos.y, 255)
                }
            }

            const hubCenterPos = this.getHubCenterPos()
            if (hubCenterPos && costs.get(hubCenterPos.x, hubCenterPos.y) < COST_FOR_HUB_CENTER) {
                costs.set(hubCenterPos.x, hubCenterPos.y, COST_FOR_HUB_CENTER)
            }

            return this.heap.basicCostmatrix = costs
        }
    },
    basicCostMatrixWithCreeps: {
        get() {
            if (this._basicCostMatrixWithCreeps) {
                return this._basicCostMatrixWithCreeps
            }
            const costs = this.basicCostmatrix.clone()
            for (const creep of this.find(FIND_CREEPS)) {
                costs.set(creep.pos.x, creep.pos.y, 255,)
            }
            for (const powerCreep of this.find(FIND_POWER_CREEPS)) {
                costs.set(powerCreep.pos.x, powerCreep.pos.y, 255)
            }
            return this._basicCostMatrixWithCreeps = costs
        }
    },
    costmatrixForBattle: {
        get() {
            const costs = new PathFinder.CostMatrix
            for (const structure of this.structures[STRUCTURE_ROAD]) {
                costs.set(structure.pos.x, structure.pos.y, 1)
            }
            for (const structure of this.structures.obstacles) {
                if (structure.structureType === STRUCTURE_WALL) {
                    costs.set(structure.pos.x, structure.pos.y, Math.max(20, Math.min(254, Math.ceil(structure.hits / 100000))))
                    continue
                }
                costs.set(structure.pos.x, structure.pos.y, 10)
            }
            for (const structure of this.structures.rampart) {
                if (structure.my || structure.isPublic) {
                    continue
                }
                costs.set(structure.pos.x, structure.pos.y, Math.max(20, Math.min(254, Math.ceil(costs.get(structure.pos.x, structure.pos.y) + structure.hits / 100000))))
            }
            for (const creep of this.find(FIND_MY_CREEPS)) {
                costs.set(creep.pos.x, creep.pos.y, 255)
            }
            return this._costmatrixForBattle = costs
        }
    },
    isMy: {
        get() {
            return this.controller && this.controller.my
        }
    },
    isMyRemote: {
        get() {
            return this.controller && this.controller.reservation && this.controller.reservation.username === MY_NAME
        }
    },
    savingMode: {
        get() {
            if (!this._savingMode) {
                if (this.storage) {
                    if (this.energyLevel >= 0 && this.memory.savingMode) {
                        this._savingMode = this.memory.savingMode = false
                    } else if (this.energyLevel < -1 && !this.memory.savingMode) {
                        this._savingMode = this.memory.savingMode = true
                    }
                } else {
                    if (this.memory.savingMode && !this.constructionSites.length) {
                        this._savingMode = this.memory.savingMode = false
                    } else if ((this.constructionSites.length) && !this.memory.savingMode) {
                        this._savingMode = this.memory.savingMode = true
                    }
                }
            }
            return this._savingMode = this.memory.savingMode
        }
    },
    maxWork: {
        get() {
            if (this.controller.level === 1) {
                return 4
            }
            if (Game.time % 11 === 0) {
                delete this.heap.maxWork
            }

            if (this.heap.maxWork !== undefined) {
                return this.heap.maxWork
            }

            const numWorkEach = this.laborer.numWorkEach

            if (!this.storage) {
                if (this.constructionSites.length) {
                    const basicNumWork = (this.storage ? 1 : (this.heap.sourceUtilizationRate || 0)) * Math.max(numWorkEach, 4)
                    const remoteSurplusNumWork = Math.max(0, (this.heap.remoteIncome || 0))
                    return this.heap.maxWork = Math.floor(basicNumWork + remoteSurplusNumWork / 3)
                }
                // former is spawn limit. latter is income limit
                const basicNumWork = (this.storage ? 1 : (this.heap.sourceUtilizationRate || 0)) * 16
                const remoteSurplusNumWork = Math.max(0, (this.heap.remoteIncome || 0))
                const numUpgradeSpot = this.controller.available
                return this.heap.maxWork = Math.min(numUpgradeSpot * numWorkEach, Math.floor(basicNumWork + remoteSurplusNumWork))
            }

            const level = this.controller.level

            if (level === 8) {
                // if downgrade is close, upgrade
                if (this.controller.ticksToDowngrade < 5000) {
                    this.heap.upgrading = true
                    return this.heap.maxWork = 15
                }

                // if constructing, maxWork = energyLevel * 5
                if (this.heap.constructing) {
                    this.heap.upgrading = false
                    return this.heap.maxWork = Math.max(0, 5 * Math.ceil(this.energyLevel))
                }

                // if savingMode, don't upgrade
                if (this.savingMode) {
                    this.heap.upgrading = false
                    return this.heap.maxWork = 0
                }

                // else upgrade
                this.heap.upgrading = true
                return this.heap.maxWork = 15
            }

            if (this.energyLevel < 0) {
                return this.heap.maxWork = 5
            }

            const max = this.controller.linkFlow || MAX_WORK

            const extra = Math.max(0, Math.ceil(this.energyLevel))
            return this.heap.maxWork = Math.min(max, numWorkEach * (1 + extra))
        }
    },
    terrain: {
        get() {
            if (!this._terrain) {
                this._terrain = new Room.Terrain(this.name)
            }
            return this._terrain
        }
    },
    weakestRampart: {
        get() {
            if (this._weakestRampart) {
                return this._weakestRampart
            }
            const ramparts = this.structures.rampart
            if (ramparts.length) {
                this._weakestRampart = ramparts.sort((a, b) => a.hits - b.hits)[0]
            }
            return this._weakestRampart
        }
    },
    hyperLink: {
        get() {
            const URL = `https://screeps.com/a/#!/room/${SHARD}/${this.name}`
            return `<a href="${URL}" target="_blank">${this.name}</a>`
        }
    }
})

Room.prototype.getBasicSpawnCapacity = function () {
    if (!this.isMy) {
        return 0
    }

    if (this._basicSpawnCapacity !== undefined) {
        return this._basicSpawnCapacity
    }

    const level = this.controller.level

    // 2 miners, 13 parts each
    let result = 20

    // haulers
    for (const source of this.sources) {
        if (source.linked) {
            continue
        }
        const maxCarry = source.info.maxCarry
        result += Math.ceil(maxCarry * 1.5)
    }

    // manager + researcher
    const numManager = this.getMaxNumManager()
    result += 3 * Math.min(12, Math.floor(this.energyCapacityAvailable / 150), 16) * numManager

    //laborer
    const basicNumWork = (this.storage ? 1 : (this.heap.sourceUtilizationRate || 0)) * 16
    const remoteSurplusNumWork = Math.max(0, (this.heap.remoteIncome || 0))
    result += Math.floor(basicNumWork + remoteSurplusNumWork) * 2

    //extractor
    if (level >= 6 && this.structures.extractor.length > 0) {
        result += 50
    }

    return this._basicSpawnCapacity = result
}

Room.prototype.getRemoteSpawnCapacity = function (remoteName) {
    if (this._remotesSpawncapacity && this._remotesSpawncapacity[remoteName] !== undefined) {
        return this._remotesSpawncapacity[remoteName]
    }

    const status = this.getRemoteStatus(remoteName)

    if (!status || !status.infraPlan) {
        return 0
    }

    let result = 0

    for (const info of Object.values(status.infraPlan)) {
        result += 13 // miner
        result += Math.floor(info.pathLength * 0.45 * 1.5) // hauler
    }

    const reserving = this.getRemoteReserveTick(remoteName) > 0

    if (!reserving) {
        result = result * 0.5
    } else if (result > 0) {
        result += 10 // reserver. 2/tick
    }

    this._remotesSpawncapacity = this._remotesSpawncapacity || {}

    return this._remotesSpawncapacity[remoteName] = result
}

Room.prototype.getDepositSpawnCapacity = function (depositRequest) {
    return depositRequest.available * 50 + 100
}

Room.prototype.getSpawnCapacity = function () {
    let result = 0

    result += this.getBasicSpawnCapacity()

    if (this.memory.activeRemotes) {
        for (const remoteName of this.memory.activeRemotes) {
            result += this.getRemoteSpawnCapacity(remoteName)
        }
    }


    if (this.memory.depositRequests) {
        for (const depositRequest of Object.values(this.memory.depositRequests)) {
            result += this.getDepositSpawnCapacity(depositRequest)
        }
    }

    return result
}

Room.prototype.getSpawnCapacityRatio = function () {
    const spawnCapacity = this.getSpawnCapacity()
    const spawnCapacityAvailable = this.structures.spawn.length * 500
    return spawnCapacity / spawnCapacityAvailable
}