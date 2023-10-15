Room.prototype.manageConstruction = function () {
    if (!this.memory.level || Game.time % 5000 === 0) { // 16000 tick은 대략 하루
        this.memory.level = this.controller.level - 1
    }

    if (this.controller.level < this.memory.level) {
        return this.memory.level = 0
    }

    if (this.controller.level === this.memory.level) {
        return
    }

    this.GRCL

    if (this.memory.doOptimizeBasePlan) {
        if (this.optimizeBasePlan() === OK) {
            delete this.memory.doOptimizeBasePlan
        }
        return
    }

    if (Game.time % 20 === 0 && this.constructByBasePlan(this.memory.level + 1)) {
        this.memory.level++
    }
}

Room.prototype.constructByBasePlan = function (level) {
    const basePlan = this.basePlan
    if (!basePlan) {
        if (Game.cpu.bucket < 2000) {
            return false
        }
        const spawn = this.structures.spawn[0]
        if (!spawn) {
            this.memory.doOptimizeBasePlan = true
            return false
        }
        if (!this.getBasePlanBySpawn(spawn)) {
            return false
        }
    }
    let numConstructionSites = Object.keys(Game.constructionSites).length
    let newConstructionSites = 0
    let numConstructionSitesThisRoom = this.constructionSites.length

    if (this.controller.level < 5) { // rcl 5 이전에는 controller container
        if (this.controller.level > 1) {
            const linkPos = this.parsePos(this.memory.basePlan.linkPositions.controller)
            linkPos.createConstructionSite('container')
        }
    } else {
        const controllerContainer = this.controller.container
        if (controllerContainer) {
            controllerContainer.destroy()
        }
    }

    for (let i = 1; i <= level; i++) {
        basePlan[`lv${i}`].sort((a, b) => BUILD_PRIORITY[a.structureType] - BUILD_PRIORITY[b.structureType])
        for (const structure of basePlan[`lv${i}`]) {
            if (numConstructionSitesThisRoom >= 10) {
                return false
            }
            if (structure.structureType === 'spawn') {
                if (structure.pos.createConstructionSite(structure.structureType, `${this.name} Spawn ${structure.pos.pack()}`) === OK) {
                    numConstructionSites++
                    newConstructionSites++
                    numConstructionSitesThisRoom++
                }
                continue
            }
            if (structure.structure === 'rampart') {
                if (!this.storage || this.storage[RESOURCE_ENERGY] < 10000) {
                    return false
                }
            }
            if (structure.pos.createConstructionSite(structure.structureType) === OK) {
                numConstructionSites++
                newConstructionSites++
                numConstructionSitesThisRoom++
            }
            this.visual.structure(structure.pos.x, structure.pos.y, structure.structureType)
        }
    }


    if (newConstructionSites === 0 && numConstructionSitesThisRoom === 0 && numConstructionSites < 90) {
        return true
    }
    return false
}