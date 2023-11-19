Object.defineProperties(Structure.prototype, {
    RCLActionable: {
        get() {
            if (this._RCLActionable !== undefined) {
                return this._RCLActionable
            }
            if (!this.room.controller) {
                return this._RCLActionable = true
            }
            if (this.room.isMy && this.room.GRCL === this.room.controller.level) {
                return this._RCLActionable = true
            }
            return this._RCLActionable = this.isActive()
        }
    }
})

Object.defineProperties(StructureController.prototype, {
    available: {
        get() {
            if (Game.time % 127 === 0) {
                delete this.room.memory.controllerAvailable
            }

            if (this.room.memory.controllerAvailable) {
                return this.room.memory.controllerAvailable
            }

            const area = this.pos.getInRange(3)
            const filteredArea = area.filter(pos => pos.workable)
            return this.room.memory.controllerAvailable = filteredArea.length
        }
    },
    container: {
        get() {
            if (this._container !== undefined) {
                return this._container
            }
            if (Game.getObjectById(this.room.heap.controllerContainerId)) {
                return this._container = Game.getObjectById(this.room.heap.controllerContainerId)
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
            if (!this.link || !this.link.RCLActionable) {
                return false
            }
            if (!this.room.storage) {
                return false
            }
            if (!this.room.storage.link || !this.room.storage.link.RCLActionable) {
                return false
            }
            return true
        }
    },
    linkFlow: {
        get() {
            if (Game.time%41===0) {
                delete this.room.heap.controllerLinkFlow
            }
            if (this.room.heap.controllerLinkFlow) {
                return this.room.heap.controllerLinkFlow
            }
            if (!this.linked) {
                return this.room.heap.controllerLinkFlow = 0
            }
            const range = this.link.pos.getRangeTo(this.room.storage.link.pos)
            return this.room.heap.controllerLinkFlow = Math.floor(800/range)
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