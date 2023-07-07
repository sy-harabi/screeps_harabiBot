Object.defineProperties(StructureController.prototype, {
    container: {
        get() {
            if (this._container !== undefined) {
                return this._container
            }
            if (Game.getObjectById(this.room.heap.controllerContainerId)) {
                return this._link = Game.getObjectById(this.room.heap.controllerContainerId)
            }
            try {
                const containerPos = this.room.parsePos(this.room.memory.basePlan.linkPositions.controller)
                const container = containerPos.lookFor(LOOK_STRUCTURES).filter(structure => structure.structureType === 'container')[0]
                if (!container) {
                    return null
                }
                this.room.heap.controllerContainerId = container.id
                return this._container = container
            } catch (error) {
                return undefined
            }
        }
    },
    link: {
        get() {
            if (this._link !== undefined) {
                return this._link
            }
            if (Game.getObjectById(this.room.heap.controllerLinkId)) {
                return this._link = Game.getObjectById(this.room.heap.controllerLinkId)
            }
            try {
                const linkPos = this.room.parsePos(this.room.memory.basePlan.linkPositions.controller)
                const link = linkPos.lookFor(LOOK_STRUCTURES).filter(structure => structure.structureType === 'link')[0]
                if (!link) {
                    return null
                }
                this.room.heap.controllerLinkId = link.id
                return this._link = link
            } catch (error) {
                return this._link = null
            }
        }
    },
    linked: {
        get() {
            if (!this.link || !this.link.isActive()) {
                return false
            }
            if (!this.room.storage) {
                return false
            }
            if (!this.room.storage.link || !this.room.storage.link.isActive()) {
                return false
            }
            return true
        }
    },
    sweetSpots: {
        get() {
            const room = this.room
            if (!this._sweetSpots) {
                this._sweetSpots = []
                for (let i = -5; i <= 5; i++) {
                    if (Math.abs(i) === 5) {
                        for (let j = -4; j <= 4; j++) {
                            if (0 < Math.min(this.pos.x + i, this.pos.y + j) && Math.max(this.pos.x + i, this.pos.y + j) < 49) {
                                const spot = new RoomPosition(this.pos.x + i, this.pos.y + j, room.name)
                                if ((spot.x + spot.y) % 2 === 1 && spot.lookFor(LOOK_TERRAIN)[0] !== 'wall') {
                                    this._sweetSpots.push(spot)
                                    room.visual.circle(spot)
                                }
                            }
                        }
                    } else {
                        for (const j of [-5, 5]) {
                            if (0 < Math.min(this.pos.x + 1 + i, this.pos.y + j) && Math.max(this.pos.x + 1 + i, this.pos.y + j) < 49) {
                                const spot = new RoomPosition(this.pos.x + i, this.pos.y + j, room.name)
                                if ((spot.x + spot.y) % 2 === 1 && spot.lookFor(LOOK_TERRAIN)[0] !== 'wall') {
                                    this._sweetSpots.push(spot)
                                    room.visual.circle(spot)
                                }
                            }
                        }
                    }
                }
                this._sweetSpots = this._sweetSpots.filter(spot => !(spot.getCross().filter(pos => pos.lookFor(LOOK_TERRAIN)[0] === 'wall').length))
                this._sweetSpots = this._sweetSpots.sort((a, b) => { return a.getRangeTo(room.sources[0]) + a.getRangeTo(room.sources[1]) - b.getRangeTo(room.sources[0]) - b.getRangeTo(room.sources[1]) })
            }
            return this._sweetSpots
        }
    },
    totalProgress: {
        get() {
            return CONTROLLER_PROGRESS_TO_LEVELS[this.level] + this.progress
        }
    }
})

Object.defineProperties(StructureStorage.prototype, {
    link: {
        get() {
            if (this._link) {
                return this._link
            }
            const linkByHeap = Game.getObjectById(this.room.heap.storageLinkId)
            if (linkByHeap) {
                return this._link = linkByHeap
            }
            try {
                const linkPos = this.room.parsePos(this.room.memory.basePlan.linkPositions.storage)
                const link = linkPos.lookFor(LOOK_STRUCTURES).filter(structure => structure.structureType === 'link')[0]
                if (!link) {
                    return undefined
                }
                this.room.heap.storageLinkId = link.id
                return this._link = link
            } catch (error) {
                return undefined
            }
        }
    }
})

Object.defineProperties(StructureSpawn.prototype, {
    sources: {
        get() {
            if (this._sources) {
                return this._sources
            }
            if (this.memory.sourceId) {
                this._sources = []
                for (const index in this.memory.sourceId) {
                    const source = Game.getObjectById(this.memory.sourceId[index])
                    if (source)
                        this._sources.push(source)
                    else {
                        break;
                    }
                }
                if (this._sources.length === this.memory.sourceId.length) {
                    return this._sources
                }
            }
            this._sources = this.room.sources.sort((a, b) => { return this.pos.getRangeTo(a) - this.pos.getRangeTo(b) })
            this.memory.sourceId = _.map(this._sources, function (source) { return source.id })
            return this._sources
        }
    }
})

Object.defineProperties(StructureLab.prototype, {
    isSourceLab: {
        get() {
            numberOfLabs = this.room.structures.lab.length
            if (this.pos.findInRange(this.room.structures.lab, 2).length === numberOfLabs) {
                return true
            }
            return false
        }
    },
})