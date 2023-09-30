Flag.prototype.dismantleRoom = function () {
    const closestMyRoom = this.findClosestMyRoom()
    const targetRoomName = this.pos.roomName
    const targetRoom = Game.rooms[targetRoomName]
    const dismantlers = Overlord.getCreepsByRole(targetRoomName, 'dismantler').concat(Overlord.getCreepsByRole(closestMyRoom.name, 'dismantler'))

    if (this.memory.completeDismantle === true) {
        closestMyRoom.resetScout()
        this.pos.createFlag(`clear ${this.pos.roomName}`)
        Game.notify(`${this.pos.roomName} dismantle completed`)
        for (const dismantler of dismantlers) {
            dismantler.suicide()
        }
        this.remove()
    }

    if (!dismantlers.length) {
        closestMyRoom.requestDismantler(targetRoomName)
    }

    if (this.memory.lastStructure) {
        const lastStructurePos = new RoomPosition(this.memory.lastStructure.pos.x, this.memory.lastStructure.pos.y, this.memory.lastStructure.pos.roomName)

        if (targetRoom) {
            const lastStructure = lastStructurePos.lookFor(LOOK_STRUCTURES)[0]
            if (!lastStructure) {
                delete this.memory.lastStructure
                return
            }
            targetRoom.visual.circle(lastStructure.pos, { fill: 'blue' })
            targetRoom.visual.text(`⛏️${this.memory.lastStructure.numPositions}`, lastStructure.pos.x, lastStructure.pos.y - 1)

            if (dismantlers.length < this.memory.lastStructure.numPositions) {
                closestMyRoom.requestDismantler(targetRoomName)
            }
            for (const dismantler of dismantlers) {
                if (dismantler.room.name === targetRoomName && dismantler.pos.getRangeTo(lastStructure) <= 1) {
                    dismantler.dismantle(lastStructure)
                    continue
                }
                dismantler.moveMy({ pos: lastStructurePos, range: 1 }, { ignoreMap: 1 })
            }
            return
        }
        for (const dismantler of dismantlers) {
            dismantler.moveMy({ pos: lastStructurePos, range: 1 }, { ignoreMap: 1 })
        }
        return
    }

    if (targetRoom) {
        // 내 방으로 가는 출구 찾기
        const exitDirection = targetRoom.findExitTo(closestMyRoom)
        const exits = targetRoom.find(exitDirection)

        // controller에서 내 방으로 가는 출구로 가는 길 찾기
        const goals = exits.map(exitPos => { return { pos: exitPos, range: 1 } })
        const path = PathFinder.search(targetRoom.controller.pos, goals, {
            plainCost: 2,
            swampCost: 10,
            maxRooms: 1,
            roomCallback: function (roomName) {
                const costs = new PathFinder.CostMatrix
                for (const structure of targetRoom.structures[STRUCTURE_ROAD]) {
                    costs.set(structure.pos.x, structure.pos.y, 1)
                }
                for (const structure of targetRoom.structures.obstacles) {
                    if (structure.structureType === STRUCTURE_WALL) {
                        costs.set(structure.pos.x, structure.pos.y, Math.max(20, Math.min(254, Math.ceil(structure.hits / 100000))))
                        continue
                    }
                    costs.set(structure.pos.x, structure.pos.y, 10)
                }
                for (const structure of targetRoom.structures.rampart) {
                    if (structure.my || structure.isPublic) {
                        continue
                    }
                    costs.set(structure.pos.x, structure.pos.y, Math.max(20, Math.min(254, Math.ceil(costs.get(structure.pos.x, structure.pos.y) + structure.hits / 100000))))
                }
                return costs
            }
        }).path

        // 길 시각화
        for (let i = 0; i < path.length - 1; i++) {
            const posNow = path[i]
            const posNext = path[i + 1]
            if (posNow.roomName === posNext.roomName) {
                new RoomVisual(posNow.roomName).line(posNow, posNext, {
                    color: 'red', width: .15,
                    opacity: .2, lineStyle: 'dashed'
                })
            }
        }

        //마지막 structure 찾기
        let lastStructure = undefined
        for (const pos of path) {
            const rampartOnPos = pos.lookFor(LOOK_STRUCTURES).filter(obj => obj.structureType === 'rampart')[0]
            const structureOnPos = pos.lookFor(LOOK_STRUCTURES).filter(obj => OBSTACLE_OBJECT_TYPES.includes(obj.structureType))[0]
            lastStructure = rampartOnPos || structureOnPos || lastStructure
        }

        // lastStructure 있음
        if (lastStructure) {
            targetRoom.visual.circle(lastStructure.pos, { fill: 'blue' })
            const lastStructurePos = { x: lastStructure.pos.x, y: lastStructure.pos.y, roomName: targetRoomName }
            const costs = targetRoom.getDefenseCostMatrix(0, { checkResult: true, exitDirection: exitDirection })
            const openPositions = lastStructure.pos.getAtRange(1).filter(pos => costs.get(pos.x, pos.y) === 200)
            for (const pos of openPositions) {
                targetRoom.visual.circle(pos, { fill: 'yellow' })
            }
            this.memory.lastStructure = { pos: lastStructurePos, numPositions: openPositions.length }
            return
        }

        // lastStructure 없음
        this.memory.completeDismantle = true
        return
    }

    // lastStructureMemory도 없고 targetRoom도 안보임.
    for (const dismantler of dismantlers) {
        dismantler.moveToRoom(targetRoomName, true)
    }
}

Room.prototype.requestDismantler = function (targetRoomName) {
    let body = []
    for (let i = 0; i < Math.min(16, Math.floor(this.energyAvailable / 250)); i++) {
        body.push(MOVE, WORK, WORK)
    }
    const name = `${targetRoomName} dismantler ${Game.time}_${this.spawnQueue.length}`

    const memory = {
        role: 'dismantler'
    }

    const request = new RequestSpawn(body, name, memory, { priority: SPAWN_PRIORITY['dismantler'] })
    this.spawnQueue.push(request)
}


Creep.prototype.dismantleToController = function (roomName) {
    if (!(this.heap.dismantleToController && this.heap.dismantleToController.targetPos && this.heap.dismantleToController.path.length)) {
        if (this.room.name !== roomName) {
            return this.moveToRoom(roomName, true)
        }
        this.heap.dismantleToController = this.heap.dismantleToController || {}

        const controller = this.room.controller

        const path = PathFinder.search(this.pos, { pos: controller.pos, range: 1 }, {
            plainCost: 2,
            swampCost: 10,
            maxRooms: 3,
            roomCallback: function (callbackRoomName) {
                const room = Game.rooms[callbackRoomName]
                if (!room) {
                    return
                }
                if (callbackRoomName === roomName) {
                    return room.costmatrixForBattle
                }
                return room.basicCostmatrix
            }
        }).path
        this.heap.dismantleToController.path = path
        this.heap.dismantleToController.targetPos = controller.pos
    }

    const path = this.heap.dismantleToController.path
    for (let i = 0; i < path.length - 1; i++) {
        const posNow = path[i]
        const posNext = path[i + 1]
        if (posNow.roomName === posNext.roomName) {
            new RoomVisual(posNow.roomName).line(posNow, posNext, {
                color: 'aqua', width: .15,
                opacity: .2, lineStyle: 'dashed'
            })
        }
    }

    if (this.room.name !== roomName) {
        if (this.fatigue) {
            return
        }
        if (this.moveByPath(path) !== OK) {
            delete this.heap.dismantleToController
            return
        }
        path.shift()
    }

    if (this.pos.getRangeTo(this.room.controller) <= 1) {
        this.room.memory.completeDismantle = true
        return OK
    }

    if (this.pos.isEqualTo(path[0])) {
        path.shift()
    }

    if (!path[0]) {
        return
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
