Flag.prototype.dismantleRoom = function () {
    const closestMyRoom = this.findClosestMyRoom()
    const targetRoomName = this.pos.roomName
    const targetRoom = Game.rooms[targetRoomName]

    const dismantler = getCreepsByRole()

}

Room.prototype.requestLaborer = function (numWork) {
    let body = []
    for (let i = 0; i < numWork; i++) {
        body.push(MOVE, CARRY, WORK)
    }

    const name = `${this.name} laborer ${Game.time}_${this.spawnQueue.length}`

    const memory = {
        role: 'laborer',
        controller: this.controller.id,
        working: false
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['laborer'] })
    this.spawnQueue.push(request)
}


Creep.prototype.dismantleToController = function (roomName) {
    if (!(this.heap.dismantleToController && this.heap.dismantleToController.targetPos && this.heap.dismantleToController.path.length)) {
        if (this.room.name !== roomName) {
            return this.moveToRoom(roomName)
        }
        this.heap.dismantleToController = this.heap.dismantleToController || {}

        const controller = this.room.controller

        const path = PathFinder.search(this.pos, { pos: controller.pos, range: 1 }, {
            plainCost: 2,
            swampCost: 10,
            maxRooms: 1,
            roomCallback: function (roomName) {
                return Game.rooms[roomName].costmatrixForBattle
            }
        }).path

        this.heap.dismantleToController.path = path
        this.heap.dismantleToController.targetPos = controller.pos
    }

    const path = this.heap.dismantleToController.path
    this.room.visual.poly(path)

    if (this.room.name !== roomName) {
        if (this.moveByPath(path) !== OK) {
            delete this.heap.dismantleToController
            return
        }
        path.shift()
    }

    if (this.getRangeTo(this.room.controller) <= 1) {
        return OK
    }

    if (this.pos.isEqualTo(path[0])) {
        path.shift()
    }

    let structureOnPath = path[0].lookFor(LOOK_STRUCTURES).filter(obj => OBSTACLE_OBJECT_TYPES.includes(obj.structureType))[0]
    let rampartOnPath = path[0].lookFor(LOOK_STRUCTURES).filter(obj => obj.structureType === 'rampart')[0]
    if (rampartOnPath) {
        this.dismantle(rampartOnPath)
        return
    }
    if (structureOnPath) {
        this.dismantle(structureOnPath)
        return
    }
    this.move(this.pos.getDirectionTo(path[0]))
    return
}
