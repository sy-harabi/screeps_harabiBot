Room.prototype.manageSpawn = function () {
    if (Game.time % MY_ROOMS.length !== MY_ROOMS.indexOf(this)) {
        return
    }

    if (!this.structures.spawn.find(s => !s.spawining)) {
        return ERR_BUSY
    }

    if (!this.structures.tower.length && this.find(FIND_HOSTILE_CREEPS).length) {
        return this.spawnColonyDefender(this.name)
    }

    for (const source of this.sources) {
        if (this.storage && source.link && this.storage.link) {
            if (source.info.numMiner < source.available && source.info.numWork < 5) { // miner 개수 부족하면 생산
                return this.spawnMiner(true, source)
            }
            const managers = this.creeps.manager.filter(creep => (creep.ticksToLive || 1500) > 3 * creep.body.length)
            let managerCarry = 0
            for (const creep of managers) {
                managerCarry += (creep.body.filter(part => part.type === CARRY).length)
            }
            if (managerCarry < 24 || this.creeps.manager.filter(creep => (creep.ticksToLive || 1500) > 3 * creep.body.length).length === 0) {
                return this.spawnHauler(24, managerCarry > 0 ? false : true, true, this.storage.link)
            }
            if (source.container && source.container.store[RESOURCE_ENERGY] > 1900 && source.info.numCarry === 0) {
                return this.spawnHauler(10, false, false, source)
            }
            if (this.memory.isLaborerNeedEnergy && source.info.numCarry < source.info.maxCarry) { // laborer들이 hauler 필요로 하면 생산
                return this.spawnHauler(source.info.maxCarry, false, false, source)
            }
        } else {
            if (source.info.numWork === 0) {
                return this.spawnMiner(false, source)
            }
            if (source.info.numCarry === 0) {
                return this.spawnHauler(source.info.maxCarry, true, false, source)
            }
            if (source.info.numMiner < source.available && source.info.numWork < 5) {
                return this.spawnMiner(false, source)
            }
            if (source.info.numCarry < source.info.maxCarry && source.info.numHauler < source.info.maxNumHauler) {
                return this.spawnHauler(source.info.maxCarry - source.info.numCarry, false, false, source)
            }
        }
    }

    if (this.memory.runFastFiller) {
        if (this.creeps.filler.length < 4) {
            return this.spawnFiller()
        }
    }

    // laborer 생산
    const maxWork = this.maxWork
    const maxLaborer = Math.ceil(maxWork / (this.laborer.numWorkEach))
    if (this.laborer.numWork < maxWork && this.creeps.laborer.filter(creep => (creep.ticksToLive || 1500) > 3 * creep.body.length).length < maxLaborer) {
        return this.spawnLaborer(Math.min((maxWork - this.laborer.numWork), this.laborer.numWorkEach))
    }

    // extractor 생산
    if (this.terminal && this.structures.extractor.length && this.mineral.mineralAmount > 0 && this.heap.extract) {
        if (this.creeps.extractor.filter(creep => (creep.ticksToLive || 1500 > 3) * creep.body.length).length === 0) {
            return this.spawnExtractor()
        }
    }

    // wallMaker 생산
    if (this.controller.level === 8 && !this.savingMode && this.structures.weakProtection.length) {
        if (this.creeps.wallMaker.filter(creep => (creep.ticksToLive || 1500 > 3) * creep.body.length).length < 1) {
            return this.spawnWallMaker()
        }
    }

    // researcher 생산
    if (this.heap.needResearcher) {
        if (this.creeps.researcher.filter(creep => (creep.ticksToLive || 1500 > 3) * creep.body.length).length < 1) {
            return this.spawnResearcher()
        }
    }

}

Room.prototype.spawnFiller = function () {
    const spawn = office.pos.findClosestByRange(this.structures.spawn.filter(s => !s.spawning))
    if (!spawn) {
        return false
    }
    let body = []
    if (this.energyAvailable > 250) {
        body.push(CARRY, CARRY, CARRY, CARRY, MOVE)
    }
    body.push(CARRY, CARRY, MOVE)
    const memory = { role: 'filler' }
    if (spawn.spawnCreep(body, `${this.name} ${spawn.name} filler ${Game.time}`, {
        memory: memory
    }) === OK) {
        return true;
    } else {
        return false;
    }
}

Room.prototype.spawnMiner = function (linked, source) {
    let body = []
    const spawn = source.pos.findClosestByRange(this.structures.spawn.filter(s => !s.spawning))
    if (!spawn) {
        return false
    }
    const maxEnergy = this.energyAvailable
    if (maxEnergy >= 800) {
        body = [WORK, WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, CARRY]
    } else if (maxEnergy >= 700 && linked) { //여력이 되면
        body = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, CARRY]
    } else if (maxEnergy >= 650) { //여력이 되면
        body = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE]
    } else if (maxEnergy >= 550) {
        body = [WORK, WORK, WORK, WORK, WORK, MOVE]
    } else {
        body = [WORK, WORK, MOVE, MOVE]
    }
    if (spawn.spawnCreep(body, `${this.name} ${spawn.name} miner ${Game.time}`, { //마이너 생산
        memory: {
            role: 'miner',
            sourceId: source.id
        }
    }) === OK) {
        return true;
    } else {
        return false;
    }
}

Room.prototype.spawnHauler = function (numCarry, isUrgent, isManager, office) {
    const spawn = office.pos.findClosestByRange(this.structures.spawn.filter(s => !s.spawning))
    if (!spawn) {
        return false
    }
    let body = []
    const maxEnergy = isUrgent ? this.energyAvailable : this.energyCapacityAvailable
    for (let i = 0; i < Math.min(Math.ceil(numCarry / 2), Math.floor(maxEnergy / 150), 16); i++) {
        body.push(CARRY, CARRY, MOVE)
    }
    const memory = isManager ? { role: 'hauler', manager: true, storageLinkId: office.id } : { role: 'hauler', manager: false, sourceId: office.id }
    if (spawn.spawnCreep(body, `${this.name} ${spawn.name} hauler ${Game.time}`, {
        memory: memory
    }) === OK) {
        return true;
    } else {
        return false;
    }
}

Room.prototype.spawnLaborer = function (numWork) {
    const spawn = this.controller.pos.findClosestByRange(this.structures.spawn.filter(s => !s.spawning))
    if (!spawn) {
        return false
    }
    let body = []
    for (let i = 0; i < numWork; i++) {
        body.push(MOVE, CARRY, WORK)
    }
    if (spawn.spawnCreep(body, `${this.name} ${spawn.name} laborer ${Game.time}`, {
        memory: {
            role: 'laborer',
            controller: this.controller.id,
            working: false
        }
    }) === OK) {
        return true;
    } else {
        return false;
    }
}

Room.prototype.spawnWallMaker = function () {
    const spawn = this.structures.spawn.find(s => !s.spawning)
    if (!spawn) {
        return false
    }
    let body = []
    for (let i = 0; i < Math.min(16, Math.floor(this.energyAvailable / 200)); i++) {
        body.push(MOVE, CARRY, WORK)
    }
    if (spawn.spawnCreep(body, `${this.name} ${spawn.name} wallMaker ${Game.time}`, {
        memory: {
            role: 'wallMaker',
            working: false
        }
    }) === OK) {
        return true;
    } else {
        return false;
    }
}

Room.prototype.spawnExtractor = function () {
    const spawn = this.mineral.pos.findClosestByRange(this.structures.spawn.filter(s => !s.spawning))
    if (!spawn) {
        return false
    }
    const body = []
    for (i = 0; i < Math.min(10, Math.floor(this.energyAvailable / 450)); i++) {
        body.push(WORK, WORK, WORK, WORK, MOVE)
    }
    if (spawn.spawnCreep(body, `${this.name} ${spawn.name} extractor ${Game.time}`, {
        memory: {
            role: 'extractor',
            terminal: this.terminal.id,
            extractor: this.structures.extractor[0].id,
            mineral: this.mineral.id,
            resourceType: this.mineralType
        }
    }) === OK) {
        return true;
    } else {
        return false;
    }
}

Room.prototype.spawnResearcher = function () {
    const spawn = this.structures.spawn.find(s => !s.spawning)
    if (!spawn) {
        return false
    }
    const body = []
    for (i = 0; i < Math.min(10, Math.floor(this.energyAvailable / 150)); i++) {
        body.push(MOVE, CARRY, CARRY)
    }
    if (spawn.spawnCreep(body, `${this.name} ${spawn.name} researcher ${Game.time}`, {
        memory: {
            role: 'researcher'
        }
    }) === OK) {
        return true;
    } else {
        return false;
    }
}

Room.prototype.spawnReserver = function (colonyName) {
    const spawn = this.structures.spawn.find(s => !s.spawning)
    if (!spawn) {
        return false
    }
    let body = []
    for (i = 0; i < Math.min(5, Math.floor(this.energyAvailable / 650)); i++) {
        body.push(CLAIM, MOVE)
    }
    spawn.spawnCreep(body, `${colonyName} reserver`, {
        memory: {
            role: 'reserver',
            base: this.name,
            colony: colonyName
        }
    })
}

Room.prototype.spawnColonyLaborer = function (colonyName, sourceId) {
    const spawn = this.structures.spawn.find(s => !s.spawning)
    if (!spawn) {
        return false
    }
    let body = []
    let cost = 0
    for (let i = 0; i < Math.min(Math.floor(this.energyCapacityAvailable / 250), 5); i++) {
        body.push(WORK, MOVE, CARRY, MOVE)
        cost += 250
    }
    if (spawn.spawnCreep(body, `${colonyName} colonyLaborer ${Game.time}`, {
        memory: {
            role: 'colonyLaborer',
            base: this.name,
            colony: colonyName,
            sourceId: sourceId
        }
    }) === OK) {
        this.addColonyCost(colonyName, cost)
    }
}

Room.prototype.spawnColonyMiner = function (colonyName, sourceId) {
    const spawn = this.structures.spawn.find(s => !s.spawning)
    if (!spawn) {
        return false
    }
    let body = [CARRY]
    let cost = 0
    for (let i = 0; i < Math.min(Math.floor((this.energyCapacityAvailable - 50) / 150), 6); i++) {
        body.push(WORK, MOVE)
        cost += 150
    }
    if (spawn.spawnCreep(body, `${colonyName} colonyMiner ${Game.time}`, {
        memory: {
            role: 'colonyMiner',
            base: this.name,
            colony: colonyName,
            sourceId: sourceId
        }
    }) === OK) {
        this.addColonyCost(colonyName, cost)
    }
}

Room.prototype.spawnColonyDefender = function (colonyName) {
    const spawn = this.structures.spawn.find(s => !s.spawning)
    if (!spawn) {
        return false
    }
    let body = []
    let cost = 0
    const bodyLength = Math.min(Math.floor((this.energyCapacityAvailable) / 200), 10)
    for (let i = 0; i < bodyLength; i++) {
        body.push(MOVE)
        cost += 50
    }
    for (let i = 0; i < Math.floor(bodyLength / 2); i++) {
        body.push(ATTACK, RANGED_ATTACK)
        cost += 230
    }
    if (spawn.spawnCreep(body, `${colonyName} colonyDefender`, {
        memory: {
            role: 'colonyDefender',
            base: this.name,
            colony: colonyName
        }
    }) === OK) {
        this.addColonyCost(colonyName, cost)
    }
}

Room.prototype.spawnColonyCoreDefender = function (colonyName) {
    const spawn = this.structures.spawn.find(s => !s.spawning)
    if (!spawn) {
        return false
    }
    let body = []
    let cost = 0
    const bodyLength = Math.min(Math.floor((this.energyCapacityAvailable) / 130), 25)
    for (let i = 0; i < bodyLength; i++) {
        body.push(MOVE)
        cost += 50
    }
    for (let i = 0; i < bodyLength; i++) {
        body.push(ATTACK)
        cost += 80
    }
    if (spawn.spawnCreep(body, `${colonyName} colonyCoreDefender`, {
        memory: {
            role: 'colonyDefender',
            base: this.name,
            colony: colonyName
        }
    }) === OK) {
        this.addColonyCost(colonyName, cost)
    }
}

Room.prototype.spawnColonyHauler = function (colonyName, sourceId, maxCarry, sourcePathLength) {
    const spawn = this.structures.spawn.find(s => !s.spawning)
    if (!spawn) {
        return false
    }
    let body = [WORK, MOVE]
    let cost = 0
    for (let i = 0; i < Math.min(Math.floor((this.energyCapacityAvailable - 150) / 150), 16, Math.ceil(maxCarry / 2)); i++) {
        body.push(CARRY, CARRY, MOVE)
        cost += 150
    }
    if (spawn.spawnCreep(body, `${colonyName} colonyHauler ${Game.time}`, {
        memory: {
            role: 'colonyHauler',
            base: this.name,
            colony: colonyName,
            sourceId: sourceId,
            sourcePathLength: sourcePathLength
        }
    }) === OK) {
        this.addColonyCost(colonyName, cost)
    }
}

Room.prototype.spawnClaimer = function (targetRoomName) {
    const spawn = this.structures.spawn.find(s => !s.spawning)
    if (!spawn) {
        return false
    }
    let body = [CLAIM, MOVE, MOVE, MOVE, MOVE, MOVE,]
    spawn.spawnCreep(body, `${targetRoomName} claimer`, {
        memory: {
            role: 'claimer',
            base: this.name,
            targetRoom: targetRoomName
        }
    })
}

Room.prototype.spawnDepositWorker = function (depositRequest, number) {
    const spawn = this.structures.spawn.find(s => !s.spawning)
    if (!spawn) {
        return false
    }

    let body = []
    for (let i = 0; i < 5; i++) {
        body.push(MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, WORK, WORK, WORK)
    }

    spawn.spawnCreep(body, `deposit ${depositRequest.depositId} worker ${number}`, {
        memory: {
            role: 'depositWorker',
            base: this.name,
            targetRoom: depositRequest.roomName
        }
    })
}