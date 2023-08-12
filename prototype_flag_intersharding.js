Flag.prototype.sendIntershardingCreeps = function () {
    const roomName = this.pos.roomName
    this.memory.state = this.memory.state || 'init'
    const myRoom = this.findClosestMyRoom(4)
    const claimer = Overlord.getCreepsByRole(roomName, 'claimer')[0]
    const pioneers = Overlord.getCreepsByRole(roomName, 'pioneer')

    if (this.memory.state === 'init') {
        if (!claimer) {
            myRoom.requestClaimer(roomName)
        } else {
            this.memory.state = 'pioneer'
            return
        }
    }
    if (this.memory.state === 'pioneer') {
        if (this.memory.numPioneer === undefined) {
            this.memory.numPioneer = 0
        }
        for (const pioneer of pioneers) {
            if (pioneer.memory.number > this.memory.numPioneer) {
                this.memory.numPioneer = pioneer.memory.number
            }
        }
        if (this.memory.numPioneer < 12) {
            myRoom.requestPioneer(roomName, this.memory.numPioneer + 1)
        }
    }
    if (claimer && claimer.room.name === roomName) {
        claimer.moveMy(this.pos)
    }
    for (const pioneer of pioneers) {
        if (pioneer.room.name === roomName) {
            pioneer.moveMy(this.pos)
        }
    }
}

Flag.prototype.claimIntershard = function () {
    const roomName = this.pos.roomName
    const creeps = Object.values(Game.creeps)
    const blankCreeps = creeps.filter(creep => !creep.memory.role)
    for (const creep of blankCreeps) {
        if (creep.checkBodyParts('claim')) {
            creep.memory = {
                role: 'claimer',
                targetRoom: roomName
            }
            continue
        }
        if (creep.checkBodyParts('work')) {
            creep.memory = {
                role: 'pioneer',
                targetRoom: roomName,
                working: false,
                number: Math.floor(2 * Math.random())
            }
            continue
        }
        if (creep.checkBodyParts('heal')) {
            creep.memory = {
                role: 'colonyDefender',
                base: roomName,
                colony: roomName
            }
            continue
        }
    }
}