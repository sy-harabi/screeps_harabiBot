const RAMPART_HIT_THRESHOLD = 5000000

Object.defineProperties(Room.prototype, {
    spawnCapacity: {
        get() {
            if (this._spawnCapacity !== undefined) {
                return this._spawnCapacity
            }
            return this._spawnCapacity = 0
        },
        set(value) {
            this._spawnCapacity = value
        }
    },
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
            this._laborer.numWorkEach = Math.min(Math.floor(this.energyCapacityAvailable / 200), 16)
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
            if (!this.controller) {
                return undefined
            }
            const level = this.controller.level
            const economyStandard = ECONOMY_STANDARD[level]
            const buffer = BUFFER[level]
            return (this.energy - economyStandard) / buffer
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
            if (!this._basicCostmatrix) {
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
                this._basicCostmatrix = costs
            }
            return this._basicCostmatrix
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
            if (Game.time % 100 === 0) {
                delete this.heap.maxWork
            }

            if (this.heap.maxWork !== undefined) {
                return this.heap.maxWork
            }

            const numWorkEach = this.laborer.numWorkEach
            if (!this.storage) {
                if (this.constructionSites.length) {
                    return this.heap.maxWork = Math.max(numWorkEach, 4)
                }
                // former is spawn limit. latter is income limit
                return this.heap.maxWork = Math.min(numWorkEach * 9, 16 + (this.heap.remoteIncome || 0))
            }
            const level = this.controller.level
            if (level === 8) {
                // if downgrade is close, upgrade
                if (this.controller.ticksToDowngrade < 10000) {
                    this.heap.upgrading = true
                    return this.heap.maxWork = 15
                }

                // if constructing, maxWrok 15
                if (this.heap.constructing) {
                    this.heap.upgrading = false
                    return this.heap.maxWork = 15
                }

                // if savingMode, don't upgrade
                if (this.savingMode) {
                    this.heap.upgrading = false
                    return this.heap.maxWork = 0
                }

                // if energy if more than enough, upgrade
                if (this.energyLevel > 5) {
                    this.heap.upgrading = true
                    return this.heap.maxWork = 15
                }

                // if rampart is enough, upgrade
                if (this.structures.weakProtection.length === 0) {
                    this.heap.upgrading = true
                    return this.heap.maxWork = 15
                }

                this.heap.upgrading = false
                return this.heap.maxWork = 0
            }

            if (this.energyLevel < 0) {
                return this.heap.maxWork = 10
            }

            const extra = Math.min(7, Math.max(0, Math.floor(this.energyLevel)))
            return this.heap.maxWork = Math.min(numWorkEach * (1 + extra))
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