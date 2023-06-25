Room.prototype.getFirstAnchor = function (costs) {
    for (let range = 4; range < 10; range++) {
        const possibleAnchors = []
        for (const pos of this.controller.pos.getAtRange(range)) {
            const anchor = new Anchor(pos, 2, costs)
            if (!anchor || !anchor.area || !anchor.border) {
                continue
            }
            possibleAnchors.push(anchor)
        }
        if (!possibleAnchors.length) {
            continue
        }
        for (const anchor of possibleAnchors) {
            this.visual.circle(anchor.pos)
        }
        possibleAnchors.sort((a, b) => a.pos.getAverageRange(this.sources) - b.pos.getAverageRange(this.sources))
        for (const pos of possibleAnchors[0].area) {
            costs.set(pos.x, pos.y, 255)
        }
        for (const pos of possibleAnchors[0].border) {
            costs.set(pos.x, pos.y, 5)
        }
        return possibleAnchors[0]
    }
    return false
}

Room.prototype.getBasePlan = function () {
    //variable and array settings
    const basePlan = {}
    const mincutSources = []

    for (i = 1; i <= 8; i++) {
        basePlan[`lv${i}`] = []
    }

    const structures = {}
    for (const structureType of Object.keys(CONSTRUCTION_COST)) {
        structures[structureType] = []
    }

    //make cost matrix
    const costs = this.basicCostMatrixForRoomPlan.clone()
    for (const pos of this.controller.pos.getAtDiagonalRange(2)) {
        if (costs.get(pos.x, pos.y) < 10) {
            costs.set(pos.x, pos.y, 30)
        }
    }
    for (const pos of this.controller.pos.getAtDiagonalRange(1)) {
        if (costs.get(pos.x, pos.y) < 10) {
            costs.set(pos.x, pos.y, 30)
        }
    }
    for (const source of this.sources) {
        for (pos of source.pos.getInRange(1)) {
            if (costs.get(pos.x, pos.y) < 10) {
                costs.set(pos.x, pos.y, 30)
            }
        }
        for (pos of source.pos.getAtRange(2)) {
            if (costs.get(pos.x, pos.y) < 10) {
                costs.set(pos.x, pos.y, 4)
            }
        }
    }
    for (const pos of this.mineral.pos.getInRange(1)) {
        if (costs.get(pos.x, pos.y) < 10) {
            costs.set(pos.x, pos.y, 30)
        }
    }

    // get First anchor
    const anchors = []
    anchors.push(this.getFirstAnchor(costs))

    if (!anchors[0]) {
        console.log('cannot get 1st anchor')
        return ERR_NOT_FOUND
    }

    // get second anchor
    anchors.push(this.lookForAnchorPos(anchors, 2, costs))
    if (!anchors[1]) {
        console.log('fail to get 2nd anchor')
        return ERR_NOT_FOUND
    }

    // fill First anchor
    let edge0 = []
    let corner0 = []
    let inner0 = []
    for (const pos of anchors[0].area) {
        mincutSources.push(pos)
        if (pos.x !== anchors[0].pos.x && pos.y !== anchors[0].pos.y) {
            edge0.push(pos)
            continue
        }
        if (pos.getRangeTo(anchors[0].pos) === 2) {
            corner0.push(pos)
            continue
        }
        inner0.push(pos)
    }

    // exit road
    const anchor0ExitPos = edge0.sort((a, b) => { return (b.getRangeTo(anchors[1].pos) + b.getRangeTo(this.controller.pos) - a.getRangeTo(anchors[1].pos) - a.getRangeTo(this.controller.pos)) })[0]
    structures.road.push(anchor0ExitPos)
    edge0 = edge0.filter(pos => !pos.isEqualTo(anchor0ExitPos))
    basePlan[`lv2`].push(anchor0ExitPos.packPos(`road`))

    structures.road.push(anchors[0].pos)
    inner0 = inner0.filter(pos => !pos.isEqualTo(anchors[0].pos))
    basePlan[`lv2`].push(anchors[0].pos.packPos(`road`))
    basePlan.managerPos = (anchors[0].pos.packPos('manager'))

    // storagePos
    const storagePos = this.controller.pos.findClosestByRange(edge0)
    structures.storage.push(storagePos)
    edge0 = edge0.filter(pos => !pos.isEqualTo(storagePos))
    basePlan['lv4'].push(storagePos.packPos('storage'))

    // PowerSpawn
    const powerSpawnPos = storagePos.findClosestByRange(inner0)
    structures.powerSpawn.push(powerSpawnPos)
    inner0 = inner0.filter(pos => !pos.isEqualTo(powerSpawnPos))
    basePlan['lv8'].push(powerSpawnPos.packPos('powerSpawn'))

    // factory
    const factoryPos = anchors[1].pos.findClosestByRange(corner0)
    structures.factory.push(factoryPos)
    corner0 = corner0.filter(pos => !pos.isEqualTo(factoryPos))
    basePlan['lv7'].push(factoryPos.packPos('factory'))

    // Nuker
    const nukerPos = corner0.find(pos => pos.getRangeTo(anchor0ExitPos) === 3)
    structures.nuker.push(nukerPos)
    corner0 = corner0.filter(pos => !pos.isEqualTo(nukerPos))
    basePlan['lv8'].push(nukerPos.packPos('nuker'))

    // PowerCreepPos
    const powerCreepPos = powerSpawnPos.findClosestByRange(corner0)
    corner0 = corner0.filter(pos => !pos.isEqualTo(powerCreepPos))
    basePlan.powerCreepPos = (powerCreepPos.packPos('powerCreep'))

    // Spawn
    const spawn0Pos = edge0.sort((a, b) => { return a.getAverageRange(this.sources) - b.getAverageRange(this.sources) })[0]
    structures.spawn.push(spawn0Pos)
    edge0 = edge0.filter(pos => !pos.isEqualTo(spawn0Pos))
    basePlan['lv1'].push(spawn0Pos.packPos('spawn'))

    const spawn1Pos = edge0[0]
    structures.spawn.push(spawn1Pos)
    edge0 = edge0.filter(pos => !pos.isEqualTo(spawn1Pos))
    basePlan['lv7'].push(spawn1Pos.packPos('spawn'))

    const spawn2Pos = inner0[0]
    structures.spawn.push(spawn2Pos)
    inner0 = inner0.filter(pos => !pos.isEqualTo(spawn2Pos))
    basePlan['lv8'].push(spawn2Pos.packPos('spawn'))

    // Towers and Link

    const tower0Pos = inner0[0]
    structures.tower.push(tower0Pos)
    inner0 = inner0.filter(pos => !pos.isEqualTo(tower0Pos))
    basePlan[`lv3`].push(tower0Pos.packPos('tower'))

    const tower1Pos = corner0[0]
    structures.tower.push(tower1Pos)
    corner0 = corner0.filter(pos => !pos.isEqualTo(tower1Pos))
    basePlan[`lv5`].push(tower1Pos.packPos('tower'))

    const linkPos = inner0[0]
    structures.link.push(linkPos)
    basePlan['lv5'].push(linkPos.packPos('link'))


    for (const pos of anchors[0].border) {
        structures.road.push(pos)
        basePlan[`lv2`].push(pos.packPos(`road`))

        mincutSources.push(pos)
        costs.set(pos.x, pos.y, 5)
    }

    // fill second anchor
    let area1 = anchors[1].area

    for (const pos of area1) {
        mincutSources.push(pos)
    }
    for (const pos of anchors[1].border) {
        mincutSources.push(pos)
    }
    let corner1 = [
        new RoomPosition(anchors[1].pos.x + 2, anchors[1].pos.y, this.name),
        new RoomPosition(anchors[1].pos.x - 2, anchors[1].pos.y, this.name),
        new RoomPosition(anchors[1].pos.x, anchors[1].pos.y + 2, this.name),
        new RoomPosition(anchors[1].pos.x, anchors[1].pos.y - 2, this.name)
    ]

    structures.terminal.push(structures.factory[0].findClosestByRange(corner1))
    basePlan[`lv6`].push(structures.terminal[0].packPos(`terminal`))
    area1 = area1.filter(pos => !pos.isEqualTo(structures.terminal[0]))

    const fromLabToTerminalDirection = anchors[1].pos.getDirectionTo(structures.terminal[0])
    if (fromLabToTerminalDirection % 4 === 1) {
        const pos1 = new RoomPosition(anchors[1].pos.x + 1, anchors[1].pos.y, this.name)
        structures.road.push(pos1)
        area1 = area1.filter(pos => !pos.isEqualTo(pos1))
        basePlan[`lv6`].push(pos1.packPos(`road`))

        const pos2 = new RoomPosition(anchors[1].pos.x - 1, anchors[1].pos.y, this.name)
        structures.road.push(pos2)
        area1 = area1.filter(pos => !pos.isEqualTo(pos2))
        basePlan[`lv6`].push(pos2.packPos(`road`))

    } else {
        const pos1 = new RoomPosition(anchors[1].pos.x, anchors[1].pos.y + 1, this.name)
        structures.road.push(pos1)
        area1 = area1.filter(pos => !pos.isEqualTo(pos1))
        basePlan[`lv6`].push(pos1.packPos(`road`))

        const pos2 = new RoomPosition(anchors[1].pos.x, anchors[1].pos.y - 1, this.name)
        structures.road.push(pos2)
        area1 = area1.filter(pos => !pos.isEqualTo(pos2))
        basePlan[`lv6`].push(pos2.packPos(`road`))
    }

    area1 = area1.sort((a, b) => a.getRangeTo(structures.terminal[0]) - b.getRangeTo(structures.terminal[0]))
    for (let i = 0; i < area1.length; i++) {
        structures.lab.push(area1[i])
        const level = i < 3 ? 6 : i < 6 ? 7 : 8
        basePlan[`lv${level}`].push(area1[i].packPos(`lab`))
    }

    for (const pos of anchors[1].border) {
        structures.road.push(pos)
        basePlan[`lv3`].push(pos.packPos(`road`))
        costs.set(pos.x, pos.y, 5)
    }

    // roads
    let costsForRoad = costs.clone()

    for (const pos of structures.road) {
        costsForRoad.set(pos.x, pos.y, 1)
    }

    const path = PathFinder.search(storagePos, { pos: this.controller.pos, range: 1 }, {
        plainCost: 2,
        swampCost: 2,
        roomCallback: function (roomName) {
            return costsForRoad
        },
        maxOps: 10000,
        maxRooms: 1
    }).path
    if (path.length > 10) {
        const controllerLinkPos = path[path.length - 2]
        structures.link.push(controllerLinkPos)
        basePlan['lv7'].push(controllerLinkPos.packPos('link'))
        costs.set(controllerLinkPos.x, controllerLinkPos.y, 255)
        costsForRoad.set(controllerLinkPos.x, controllerLinkPos.y, 255)
    }
    structures.road.push(...path)
    for (const pos of path) {
        costs.set(pos.x, pos.y, 5)
        costsForRoad.set(pos.x, pos.y, 1)
        if (this.controller.pos.getRangeTo(pos) < 3) {
            continue
        }
        basePlan[`lv3`].push(pos.packPos(`road`))
    }

    // roads to sources
    for (const source of this.sources.sort((a, b) => b.info.maxCarry - a.info.maxCarry)) {
        const path = PathFinder.search(spawn0Pos, { pos: source.pos, range: 1 }, {
            plainCost: 2,
            swampCost: 2,
            roomCallback: function (roomName) {
                return costsForRoad
            },
            maxOps: 10000,
            maxRooms: 1
        }).path
        const containerPos = path.pop()
        structures.container.push(containerPos)
        basePlan[`lv3`].push(containerPos.packPos(`container`))
        costs.set(containerPos.x, containerPos.y, 255)
        costsForRoad.set(containerPos.x, containerPos.y, 255)
        structures.road.push(...path)
        for (const pos of path) {
            costs.set(pos.x, pos.y, 5)
            costsForRoad.set(pos.x, pos.y, 1)
            basePlan[`lv3`].push(pos.packPos(`road`))
        }
        const linkPos = structures.link[0].findClosestByRange(containerPos.getAtRange(1).filter(pos => (pos.getRangeTo(source) < 2 && pos.walkable) || costs.get(pos.x, pos.y) < 5))
        structures.link.push(linkPos)
        if (!linkPos) {
            continue
        }
        basePlan[`lv${3 + structures.link.length}`].push(linkPos.packPos('link'))
        costs.set(linkPos.x, linkPos.y, 255)
        costsForRoad.set(linkPos.x, linkPos.y, 255)
    }

    const mineralPath = PathFinder.search(structures.terminal[0], { pos: this.mineral.pos, range: 1 }, {
        plainCost: 2,
        swampCost: 2,
        roomCallback: function (roomName) {
            return costsForRoad
        },
        maxOps: 10000,
        maxRooms: 1
    }).path
    structures.road.push(...mineralPath)
    for (const pos of mineralPath) {
        costs.set(pos.x, pos.y, 5)
        basePlan[`lv6`].push(pos.packPos(`road`))
    }


    // extensions and towers
    outer:
    for (i = 0; i < 10; i++) {
        const possiblePoses = []
        const extraPoses = []
        for (const anchor of anchors) {
            const smallerDiagonalPoses = anchor.pos.getAtDiagonalRange(anchor.size + 2)
            for (const pos of smallerDiagonalPoses) {
                if (costs.get(pos.x, pos.y) === 0) {
                    extraPoses.push(pos)
                }
            }
            const diagonalPoses = anchor.pos.getAtDiagonalRangeWithoutVertices(anchor.size + 3)
            for (const pos of diagonalPoses) {
                if (costs.get(pos.x, pos.y) === 0) {
                    possiblePoses.push(pos)
                }
            }

        }
        for (const pos of possiblePoses) {
            if (structures.extension.length > 59) {
                break
            }
            const anchor = new Anchor(pos, 1, costs)
            if (!anchor || !anchor.area || !anchor.border) {
                continue
            }
            anchors.push(anchor)
            for (const pos of anchor.area) {
                structures.extension.push(pos)
                mincutSources.push(pos)
                costs.set(pos.x, pos.y, 255)
            }
            for (const pos of anchor.border) {
                structures.road.push(pos)
                basePlan[`lv3`].push(pos.packPos(`road`))
                mincutSources.push(pos)
                costs.set(pos.x, pos.y, 5)
            }
            if (structures.extension.length >= 64) {
                break outer
            }
        }
        for (const pos of extraPoses) {
            if (costs.get(pos.x, pos.y) === 0) {
                structures.extension.push(pos)

                mincutSources.push(pos)
                costs.set(pos.x, pos.y, 255)
            }
            if (structures.extension.length >= 64) {
                break outer
            }
        }
        for (const pos of possiblePoses) {
            if (costs.get(pos.x, pos.y) === 0) {
                structures.extension.push(pos)

                mincutSources.push(pos)
                costs.set(pos.x, pos.y, 255)
            }
            if (structures.extension.length >= 64) {
                break outer
            }
        }
    }

    if (structures.extension.length < 64) {
        console.log('not enough extensions')
        return ERR_NOT_FOUND
    }

    structures.extension.sort(function (a, b) { return a.getRangeTo(anchor0ExitPos) - b.getRangeTo(anchor0ExitPos) })
    for (i = 0; i < structures.extension.length; i++) {
        if (i < 1) {
            basePlan['lv7'].push(structures.extension[i].packPos('tower'))
            continue
        }
        if (i < 4) {
            basePlan['lv8'].push(structures.extension[i].packPos('tower'))
            continue
        }
        if (i < 9) {
            basePlan['lv2'].push(structures.extension[i].packPos('extension'))
            continue
        }
        if (i < 14) {
            basePlan['lv3'].push(structures.extension[i].packPos('extension'))
            continue
        }
        if (i < 24) {
            basePlan['lv4'].push(structures.extension[i].packPos('extension'))
            continue
        }
        if (i < 34) {
            basePlan['lv5'].push(structures.extension[i].packPos('extension'))
            continue
        }
        if (i < 44) {
            basePlan['lv6'].push(structures.extension[i].packPos('extension'))
            continue
        }
        if (i < 54) {
            basePlan['lv7'].push(structures.extension[i].packPos('extension'))
            continue
        }
        if (i < 64) {
            basePlan['lv8'].push(structures.extension[i].packPos('extension'))
            continue
        }
    }


    // min-cut
    const nearPoses = new Set()
    for (const pos of mincutSources) {
        for (const posNear of pos.getAtRange(3)) {
            nearPoses.add(posNear)
        }
    }
    const mincutCostMap = new PathFinder.CostMatrix
    const terrain = this.getTerrain()
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            if (terrain.get(x, y) === 1) {
                mincutCostMap.set(x, y, 255)
                continue
            }
            const pos = new RoomPosition(x, y, this.name)
            const range = pos.getRangeTo(anchors[0].pos)
            const cost = 1 + (range >> 2)
            mincutCostMap.set(x, y, Math.min(cost, 254))
        }
    }
    console.log(Game.cpu.getUsed())

    const cuts = this.mincutToExit(nearPoses, mincutCostMap)

    for (const cut of cuts) {
        const coord = parseVerticeToPos(cut)
        const pos = new RoomPosition(coord.x, coord.y, this.name)
        basePlan['lv7'].push(pos.packPos('rampart'))
    }

    console.log(Game.cpu.getUsed())

    this.memory.basePlan = basePlan
    return OK
}

global.Anchor = function (pos, size, costs) {
    this.pos = pos
    this.size = size
    const area = [pos]
    for (let i = 1; i <= size; i++) {
        for (let x = 0; x <= i; x++) {
            const X = x === 0 ? [0] : [x, -x]
            const Y = x === i ? [0] : [x - i, i - x]
            for (const x of X) {
                for (const y of Y) {
                    if (!isValidCoord(pos.x + x, pos.y + y) || costs.get(pos.x + x, pos.y + y) > 0) {
                        return false
                    }
                    area.push(new RoomPosition(pos.x + x, pos.y + y, pos.roomName))
                }
            }
        }
    }
    this.area = area
    const border = []
    const i = size + 1
    for (let x = 0; x <= i; x++) {
        const X = x === 0 ? [0] : [x, -x]
        const Y = x === i ? [0] : [x - i, i - x]
        for (const x of X) {
            for (const y of Y) {
                if (!isValidCoord(pos.x + x, pos.y + y) || costs.get(pos.x + x, pos.y + y) > 5) {
                    return false
                }
                border.push(new RoomPosition(pos.x + x, pos.y + y, pos.roomName))
            }
        }
    }
    this.border = border
}

Room.prototype.lookForAnchorPos = function (anchors, size, costs, maxRange = 20) {
    let range = 3;
    while (range < maxRange) {
        for (const pos of anchors[0].pos.getAtDiagonalRange(range)) {
            const anchor = new Anchor(pos, size, costs)
            if (!anchor || !anchor.area || !anchor.border) {
                continue
            }
            for (const pos of anchor.area) {
                costs.set(pos.x, pos.y, 255)
            }
            for (const pos of anchor.border) {
                costs.set(pos.x, pos.y, 5)
            }
            return anchor
        }
        range++
    }
    return false
}

RoomPosition.prototype.packPos = function (structureType) {
    return structureType + ' ' + (50 * this.x + this.y)
}

Room.prototype.unpack = function (packed) {
    const result = {}
    const splitedPacked = packed.split(` `)
    result.structureType = splitedPacked[0]

    const x = Math.floor(splitedPacked[1] / 50)
    const y = splitedPacked[1] % 50
    result.pos = new RoomPosition(x, y, this.name)

    return result
}

Room.prototype.unpackBasePlan = function () {
    const basePlan = {}
    for (i = 1; i <= 8; i++) {
        basePlan[`lv${i}`] = []
        for (const packed of this.memory.basePlan[`lv${i}`]) {
            basePlan[`lv${i}`].push(this.unpack(packed))
        }
    }
    return basePlan
}

Object.defineProperties(Room.prototype, {
    basePlan: {
        get() {
            if (!data.rooms[this.name]) {
                data.rooms[this.name] = {}
            }
            if (!data.rooms[this.name].basePlan) {
                if (!this.memory.basePlan) {
                    this.getBasePlan()
                }
                data.rooms[this.name].basePlan = this.unpackBasePlan(this.memory.basePlan)
            }
            return data.rooms[this.name].basePlan
        }
    },
    basicCostMatrixForRoomPlan: {
        get() {
            if (!this._basicCostMatrixForRoomPlan) {
                this._basicCostMatrixForRoomPlan = new PathFinder.CostMatrix;
                const terrain = this.getTerrain()
                for (const exit of this.find(FIND_EXIT)) {
                    for (const pos of exit.getAtRange(4)) {
                        this._basicCostMatrixForRoomPlan.set(pos.x, pos.y, 100)
                    }
                }
                for (let x = 0; x < 50; x++) {
                    for (let y = 0; y < 50; y++) {
                        if (terrain.get(x, y) === 1) {
                            this._basicCostMatrixForRoomPlan.set(x, y, 255)
                        }
                    }
                }
            }
            return this._basicCostMatrixForRoomPlan
        }
    },
    basicCostMatrixForRoadPlan: {
        get() {
            if (!this._basicCostMatrixForRoadPlan) {
                this._basicCostMatrixForRoadPlan = new PathFinder.CostMatrix;
                const terrain = this.getTerrain()
                for (const exitPos of this.find(FIND_EXIT)) {
                    this._basicCostMatrixForRoadPlan.set(exitPos.x, exitPos.y, 255)
                }
                for (let x = 0; x < 50; x++) {
                    for (let y = 0; y < 50; y++) {
                        if (terrain.get(x, y) === 1) {
                            this._basicCostMatrixForRoadPlan.set(x, y, 255)
                        }
                    }
                }
            }
            return this._basicCostMatrixForRoadPlan
        }
    }
})

Room.prototype.constructByBasePlan = function (level) {
    const basePlan = this.basePlan
    if (!basePlan) {
        return false
    }
    let numConstructionSites = Object.keys(Game.constructionSites).length
    let newConstructionSites = 0
    for (let i = 1; i <= level; i++) {
        for (const structure of basePlan[`lv${i}`]) {
            if (structure.structureType === 'spawn') {
                structure.pos.createConstructionSite(structure.structureType, `Spawn${Object.keys(Game.spawns).length + 1}`)
            }
            if (structure.pos.createConstructionSite(structure.structureType) === OK) {
                numConstructionSites++
                newConstructionSites++
            }
            this.visual.structure(structure.pos.x, structure.pos.y, structure.structureType)
        }
    }

    if (newConstructionSites === 0 && numConstructionSites < 90) {
        return true
    }
    return false
}

Room.prototype.visualizeBasePlan = function () {
    const basePlan = this.basePlan
    if (!basePlan) {
        return false
    }
    let j = 1;
    for (let i = 1; i <= 8; i++) {
        for (const structure of basePlan[`lv${i}`]) {
            this.visual.structure(structure.pos.x, structure.pos.y, structure.structureType)
        }
    }
    this.visual.connectRoads()
}