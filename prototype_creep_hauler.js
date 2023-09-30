Object.defineProperties(Creep.prototype, {
    supplying: {
        get() {
            if (this.memory.supplying && this.store.getUsedCapacity() <= 0) {
                this.memory.supplying = false
            }
            if (!this.memory.supplying && this.store.getFreeCapacity() <= 0) {
                this.memory.supplying = true;
            }
            return this.memory.supplying
        }
    }
})

Creep.prototype.giveEnergyTo = function (id) {
    const target = Game.getObjectById(id)
    if (!target) {
        return ERR_INVALID_TARGET
    }

    if (this.pos.getRangeTo(target) > 1) {
        this.moveMy({ pos: target.pos, range: 1 })
        return ERR_NOT_IN_RANGE
    }

    return this.transfer(target, RESOURCE_ENERGY)
}