Object.defineProperties(Source.prototype, {
    waitingArea: {
        get() {
            if (this.heap.waitingArea) {
                return this.heap.waitingArea
            }
            const costs = this.room.basicCostmatrix
            const floodFill = this.room.floodFill([this.pos], { maxLevel: 3, costMatrix: costs }).positions
            return this.heap.waitingArea = [...floodFill[2], ...floodFill[3]].filter(pos => costs.get(pos.x, pos.y) < 5)
        }
    },
    available: {
        get() {
            if (this._available) {
                return this._available
            }
            this._available = 9 - this.room.lookForAtArea(LOOK_TERRAIN, this.pos.y - 1, this.pos.x - 1, this.pos.y + 1, this.pos.x + 1, true).filter(position => position.terrain === 'wall').length
            return this._available
        }
    },
    container: {
        get() {
            if (this._container) {
                return this._container
            }
            this._container = this.pos.findInRange(this.room.structures.container, 1)[0]
            return this._container
        }
    },
    energyAmountNear: {
        get() {
            if (this._energyAmountNear) {
                return this._energyAmountNear
            }
            this._energyAmountNear = 0
            const droppedEnergies = this.droppedEnergies
            for (const droppedEnergy of droppedEnergies) {
                this._energyAmountNear += droppedEnergy.amount
            }
            const container = this.container
            if (container) {
                this._energyAmountNear += (container.store[RESOURCE_ENERGY] || 0)
            }
            return this._energyAmountNear
        }
    },
    link: {
        get() {
            if (this._link) {
                return this._link
            }
            if (Game.getObjectById(this.heap.linkId)) {
                this._link = Game.getObjectById(this.heap.linkId)
                return this._link
            }
            try {
                const linkPos = this.room.parsePos(this.room.memory.basePlan.linkPositions[this.id])
                const link = linkPos.lookFor(LOOK_STRUCTURES).filter(structure => structure.structureType === 'link')[0]
                if (!link) {
                    return undefined
                }
                this.heap.linkId = link.id
                return this._link = link
            } catch (error) {
                return undefined
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
    info: {
        get() {
            if (this._info) {
                return this._info
            }
            if (!this.room.controller) {
                return undefined
            }
            this._info = {}
            const miners = this.room.creeps.miner.filter(creep => (creep.ticksToLive || 1500) > (this.range.spawn + 3 * creep.body.length) && creep.memory.sourceId === this.id)
            const haulers = this.room.creeps.hauler.filter(creep => (creep.ticksToLive || 1500) > 3 * creep.body.length && creep.memory.sourceId === this.id)
            this._info.numHauler = haulers.length
            this._info.numMiner = miners.length

            this._info.numWork = 0
            for (const miner of miners) {
                this._info.numWork += (miner.body.filter(part => part.type === WORK).length)
            }

            this._info.numCarry = 0
            for (const hauler of haulers) {
                this._info.numCarry += (hauler.body.filter(part => part.type === CARRY).length)
            }
            this._info.maxCarry = this.linked ? 0 : (this.room.controller.linked || this.room.heap.constructing) ? Math.max(10, Math.ceil(0.6 * this.range.spawn)) : Math.max(10, Math.ceil(0.6 * this.range.controller))
            if (this.energyAmountNear > 1500) {
                this._info.maxCarry += 10
            }

            this._info.maxNumHauler = Math.ceil(this._info.maxCarry / (Math.floor(this.room.energyCapacityAvailable / 150) * 2))

            return this._info
        }
    },
    range: {
        get() {
            if (this.heap.range !== undefined) {
                return this.heap.range
            }
            const spawn = this.room.structures.spawn[0]
            const controller = this.room.controller
            const option = { ignoreCreeps: true, range: 1 }
            const pathLengthToSpawn = spawn ? this.pos.findPathTo(spawn, option).length : 0
            const pathLengthToController = controller ? this.pos.findPathTo(controller, option).length : 0

            return this.heap.range = { spawn: pathLengthToSpawn, controller: pathLengthToController }
        }
    },
    droppedEnergies: {
        get() {
            if (!this._droppedEnergies) {
                this._droppedEnergies = this.pos.findInRange(FIND_DROPPED_RESOURCES, 1).filter(droppedResource => droppedResource.resourceType === RESOURCE_ENERGY)
            }
            return this._droppedEnergies
        }
    }
})