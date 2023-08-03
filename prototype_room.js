Object.defineProperties(Room.prototype, {
    GRCL: {
        get() {
            if (this._GRCL !== undefined) {
                return this._GRCL
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
                    if (structure.hits < 20000000) {
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
            const creeps = classifyCreeps()
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
                const level = this.controller.level
                const economyStandard = ECONOMY_STANDARD[level]
                const buffer = BUFFER[level]
                if (this.storage) {
                    if (this.energy >= economyStandard && this.memory.savingMode) {
                        this._savingMode = this.memory.savingMode = false
                    } else if ((this.energy < (economyStandard - buffer)) && !this.memory.savingMode) {
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
            if (!this._maxWork) {
                const level = this.controller.level
                if (level === 8) {
                    if (!this.savingMode && !this.structures.weakProtection.length) {
                        this._maxWork = 15
                    } else if (this.constructionSites.length) {
                        this._maxWork = 15
                    } else if (this.controller.ticksToDowngrade < 10000) {
                        this._maxWork = 15
                    } else {
                        this._maxWork = 0
                    }
                } else {
                    if (this.savingMode) {
                        this._maxWork = WORK_BY_CONTROLLER_LEVEL[level].min
                    } else {
                        this._maxWork = WORK_BY_CONTROLLER_LEVEL[level].max
                    }
                }
            }
            return this._maxWork
        }
    },
    closeHighways: {
        get() {
            if (this.memory.closeHighways) {
                return this.memory.closeHighways
            }

            const roomCoord = this.name.match(/[a-zA-Z]+|[0-9]+/g)
            roomCoord[1] = Number(roomCoord[1])
            roomCoord[3] = Number(roomCoord[3])
            const x = roomCoord[1]
            const y = roomCoord[3]

            let numSided = []
            if (roomCoord[1] % 10 === 1 || roomCoord[1] % 10 === 9) {
                roomCoord[1] = Math.round(roomCoord[1] / 10) * 10
            }
            if (roomCoord[3] % 10 === 1 || roomCoord[3] % 10 === 9) {
                roomCoord[3] = Math.round(roomCoord[3] / 10) * 10
            }

            if (roomCoord[1] % 10 !== 0 && roomCoord[3] % 10 !== 0) {
                this._closeHighways = []
                this.memory.closeHighways = this._closeHighways
                return this._closeHighways
            }

            if (roomCoord[1] % 10 === 0 && roomCoord[3] % 10 === 0) {
                this._closeHighways = []
                const dx = x - roomCoord[1]
                const dy = y - roomCoord[3]

                let isExit = false
                if (dx < 0) {
                    if (this.find(FIND_EXIT_RIGHT).length) {
                        isExit = true
                    }
                } else {
                    if (this.find(FIND_EXIT_LEFT).length) {
                        isExit = true
                    }
                }
                if (dy > 0) {
                    if (this.find(FIND_EXIT_TOP).length) {
                        isExit = true
                    }
                } else {
                    if (this.find(FIND_EXIT_BOTTOM).length) {
                        isExit = true
                    }
                }

                if (!isExit) {
                    this.memory.closeHighways = this._closeHighways
                    return this._closeHighways
                }

                this._closeHighways.push(roomCoord.join(''))
                for (let i = 1; i < 3; i++) {
                    roomCoord[1] += dx * i
                    this._closeHighways.push(roomCoord.join(''))
                    roomCoord[1] -= dx * i
                }
                for (let i = 1; i < 3; i++) {
                    roomCoord[3] += dy * i
                    this._closeHighways.push(roomCoord.join(''))
                    roomCoord[3] -= dy * i
                }
                this.memory.closeHighways = this._closeHighways
                return this._closeHighways
            }

            if (roomCoord[1] % 10 === 0) {
                this._closeHighways = []
                const dx = x - roomCoord[1]

                let isExit = false
                if (dx < 0) {
                    if (this.find(FIND_EXIT_RIGHT).length) {
                        isExit = true
                    }
                } else {
                    if (this.find(FIND_EXIT_LEFT).length) {
                        isExit = true
                    }
                }
                if (!isExit) {
                    this.memory.closeHighways = this._closeHighways
                    return this._closeHighways
                }

                for (let i = -2; i < 3; i++) {
                    roomCoord[3] += i
                    this._closeHighways.push(roomCoord.join(''))
                    roomCoord[3] -= i
                }
                this.memory.closeHighways = this._closeHighways
                return this._closeHighways
            }

            if (roomCoord[3] % 10 === 0) {
                this._closeHighways = []
                const dy = y - roomCoord[3]

                let isExit = false
                if (dy > 0) {
                    if (this.find(FIND_EXIT_TOP).length) {
                        isExit = true
                    }
                } else {
                    if (this.find(FIND_EXIT_BOTTOM).length) {
                        isExit = true
                    }
                }

                if (!isExit) {
                    this.memory.closeHighways = this._closeHighways
                    return this._closeHighways
                }

                for (let i = -2; i < 3; i++) {
                    roomCoord[1] += i
                    this._closeHighways.push(roomCoord.join(''))
                    roomCoord[1] -= i
                }
                this.memory.closeHighways = this._closeHighways
                return this._closeHighways
            }
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
    }
})