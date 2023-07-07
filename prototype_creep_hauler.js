Object.defineProperties(Creep.prototype, {
    supplying: {
        get() {
            if (this.memory.supplying && this.store.getUsedCapacity() < 1) {
                this.memory.supplying = false
            }
            if (!this.memory.supplying && this.store.getFreeCapacity() < 1) {
                this.memory.supplying = true;
            }
            return this.memory.supplying
        }
    }
})

Creep.prototype.giveEnergyTo = function (id) {
    const target = Game.getObjectById(id)
    if (!target) {
        return
    }

    if (this.transfer(target, RESOURCE_ENERGY) === -9) {
        this.moveMy(target, { range: 1 })
    }
}