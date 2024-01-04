Room.prototype.operatePowerSpawn = function () {
    const powerSpawn = this.structures.powerSpawn[0]

    if (!powerSpawn) {
        return
    }

    if (powerSpawn.store[RESOURCE_POWER] > 0 && powerSpawn.store[RESOURCE_ENERGY] >= 50) {
        powerSpawn.processPower()
        this.heap.powerProcessing = true
    }

    const terminal = this.terminal

    const researcher = this.creeps.researcher[0]

    if (powerSpawn.store[RESOURCE_POWER] < 10) {
        if (terminal.store[RESOURCE_POWER] < 100) {
            terminal.gatherResource(RESOURCE_POWER, 1000)
            return
        }
        if (!researcher) {
            this.heap.needResearcher = true
            return
        }
        researcher.getDeliveryRequest(terminal, powerSpawn, RESOURCE_POWER)
        return
    }
}