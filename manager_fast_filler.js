Object.defineProperties(Room.prototype, {
    fastFiller: {
        get() {
            const fastFiller = { spawn: [], extension: [], container: [], link: [] }
            if (this.heap.fastFiller) {
                for (const key of Object.keys(this.heap.fastFiller)) {
                    const IDs = this.heap.fastFiller[key]
                    for (const id of IDs) {
                        const obj = Game.getObjectById(id)
                        if (!Game.getObjectById(id)) {
                            delete this.heap.fastFiller
                            return this.fastFiller
                        }
                        fastFiller[key].push(obj)
                    }
                }
                return fastFiller
            }
            if (this.memory.fastFillerCenterPos) {
                this.heap.fastFiller = { spawn: [], extension: [], container: [], link: [] }
                const fastFillerCenterPos = this.fastFillerCenterPos
                const structures = fastFillerCenterPos.findInRange(FIND_STRUCTURES, 2)
                const structureTypes = ['extension', 'spawn', 'container', 'link']
                for (const structure of structures) {
                    const structureType = structure.structureType
                    if (structureTypes.includes(structureType)) {
                        this.heap.fastFiller[structureType].push(structure.id)
                    }
                }
                return this.fastFiller
            }
            return undefined
        }
    },
    fastFillerCenterPos: {
        get() {
            if (this.heap.fastFillerCenterPos) {
                return this.heap.fastFillerCenterPos
            }
            if (this.memory.fastFillerCenterPos) {
                this.heap.fastFillerCenterPos = this.parsePos(this.memory.fastFillerCenterPos)
                return this.fastFillerCenterPos
            }
            return undefined
        }
    },
    fillerPositions: {
        get() {
            if (!this.fastFillerCenterPos) {
                return undefined
            }
            if (this.heap.fillerPositions) {
                return this.heap.fillerPositions
            }
            const result = []
            for (const x of [-1, 1]) {
                for (const y of [-1, 1]) {
                    result.push(new RoomPosition(this.fastFillerCenterPos.x + x, this.fastFillerCenterPos.y + y, this.name))
                }
            }
            this.heap.fillerPositions = result
            return this.fillerPositions
        }
    }
})

Room.prototype.manageFastFiller = function () {
    const fastFiller = this.fastFiller
    this.memory.runFastFiller = false
    if (!fastFiller || fastFiller.container.length < 2 || fastFiller.extension.length < 5) {
        return ERR_RCL_NOT_ENOUGH
    }
    this.memory.runFastFiller = true
    const fillers = this.creeps.filler
    for (const filler of fillers) {
        filler.runFastFiller()
    }
}

Creep.prototype.runFastFiller = function () {
    if (!this.memory.role !== 'filler') {
        return ERR_INVALID_ARGS
    }

    const state = thie.memory.state

    if (!state) {
        state = 'init'
    }


    if (state === 'init') {
        if (!this.heap.targetPos) {
            this.heap.targetPos = this.fillerPositions.find(pos => this.isWalkable(pos))
        }
        if (!this.isWalkable(this.heap.targetPos)) {
            delete this.heap.targetPos
            return this.runFastFiller()
        }
        if (this.pos.isEqualTo(this.heap.targetPos)) {
            state = 'prepare'
            return this.runFastFiller()
        }
        return this.moveMy(targetPos)
    }

    if (state === 'prepare') {
        if (!this.store.getFreeCapacity()) {
            state = 'standBy'
            return this.runFastFiller()
        }
        if (!this.memory.containerId) {
            const container = this.pos.findInRange(this.room.structures.container, 1)[0]
            if (!container) {
                return ERR_INVALID_ARG
            }
            this.memory.containerId = container.id
        }
        const container = Game.getObjectById(this.memory.containerId)
        if (!container) {
            delete this.memory.containerId
            return this.runFastFiller()
        }
        if (container.store.getUsedCapacity() < 50) {
            return ERR_NOT_ENOUGH_RESOURCES
        }
        return this.withdrow(container, RESOURCE_ENERGY)
    }

    if (state === 'standBy') {
        if (this.room.energyAvailabe < this.room.energyCapacityAvailable) {
            const nearStructures = this.findInRange(this.room.structures.spawn, 1).push(...this.findInRange(this.room.structures.extension, 1))
            const structureToFill = nearStructures.find(structure => structure.store.getFreeCapacity())
            if (structureToFill) {
                this.memory.targetId = structureToFill.id
                state = 'fill'
                return this.runFastFiller()
            }
        }
        delete this.memory.targetId
        return
    }

    if (state === 'fill') {
        const target = Game.getObjectById(this.memory.targetId)
        state = 'prepare'
        delete this.memory.targetId
        return this.transfer(target, RESOURCE_ENERGY)
    }
}