Room.prototype.operatePowerSpawn = function () {

    const powerSpawn = this.structures.powerSpawn[0]
    powerSpawn.processPower()

    const terminal = this.terminal
    const storage = this.storage

    const researcher = this.creeps.researcher[0]

    if (powerSpawn.store[RESOURCE_POWER] < 10) {
        if (!researcher) {
            this.heap.needResearcher = true
            return
        }
        researcher.getDeliveryRequest(terminal, powerSpawn, RESOURCE_POWER)
        return
    }

    if (powerSpawn.store[RESOURCE_ENERGY] < powerSpawn.store[RESOURCE_POWER] * 50) {
        if (!researcher) {
            this.heap.needResearcher = true
            return
        }
        researcher.getDeliveryRequest(storage, powerSpawn, RESOURCE_ENERGY)
        return
    }

    // 여기서부터는 재료 다 있는거임

}