Room.prototype.manageConstruction = function () {
    if (!this.memory.level || Game.time % 16000 === 0) { // 16000 tick은 대략 하루
        this.memory.level = 0
    }

    if (this.controller.level < this.memory.level) {
        return this.memory.level = 0
    }

    if (this.controller.level === this.memory.level) {
        return
    }

    if (this.memory.optimizeBasePlanLeftTick > 0) {
        this.memory.optimizeBasePlanLeftTick--
        return this.optimizeBasePlan(this.memory.optimizeBasePlanLeftTick)
    }

    if (Game.time % 20 === 0 && this.constructByBasePlan(this.memory.level + 1)) {
        this.memory.level++
    }
}

Room.prototype.constructByBasePlan = function (level) {
    const basePlan = this.basePlan
    if (!basePlan) {
        const spawn = this.structures.spawn[0]
        if (!spawn) {
            const TICKS_TO_OPTIMIZE_BASE_PLAN = 50
            this.memory.optimizeBasePlanLeftTick = TICKS_TO_OPTIMIZE_BASE_PLAN
            return false
        }
        if (!this.getBasePlanBySpawn(spawn)) {
            return false
        }
    }
    let numConstructionSites = Object.keys(Game.constructionSites).length
    let newConstructionSites = 0
    let numConstructionSitesThisRoom = this.constructionSites.length

    if (level === 1) { // rcl 5 이전에는 controller container
        const linkPos = this.parsePos(this.memory.basePlan.linkPositions.controller)
        linkPos.createConstructionSite('container')
    } else if (level === 5) {
        const controllerContainer = this.controller.container
        if (controllerContainer) {
            controllerContainer.destroy()
        }
    }

    for (let i = 1; i <= level; i++) {
        basePlan[`lv${i}`].sort((a, b) => BUILD_PRIORITY[a.structureType] - BUILD_PRIORITY[b.structureType])
        for (const structure of basePlan[`lv${i}`]) {
            if (numConstructionSitesThisRoom >= 5) {
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

Room.prototype.visualizeBasePlan = function () {
    const basePlan = this.basePlan
    if (!basePlan) {
        return false
    }
    for (let i = 1; i <= 8; i++) {
        for (const structure of basePlan[`lv${i}`]) {
            this.visual.structure(structure.pos.x, structure.pos.y, structure.structureType)
        }
    }
    this.visual.connectRoads()
    return true
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

Room.prototype.optimizeBasePlan = function (numFirstAnchor = 10) {
    // Make cost matrix
    const costs = this.basicCostMatrixForRoomPlan.clone()
    for (const pos of this.controller.pos.getInRange(3)) {
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

    // get first anchor candidates

    if (!this.heap.possibleAnchors) {
        this.getFirstAnchorsByDT(costs, numFirstAnchor)
    }

    if (!this.heap.possibleAnchors.length) {
        console.log('optimizing end')
        this.visualizeBasePlan()
        return OK
    }

    const possibleAnchors = this.heap.possibleAnchors

    const firstAnchor = possibleAnchors.shift()
    this.visual.circle(firstAnchor.pos, { fill: 'aqua', radius: 0.5, opacity: 1 })

    for (const anchor of possibleAnchors) {
        this.visual.circle(anchor.pos, { fill: 'lime', radius: 0.5 })
    }

    const result = this.getBasePlan(firstAnchor, costs)

    if (result.cost === Infinity) {
        return false
    }

    if (!this.heap.basePlanResult) {
        this.memory.basePlan = result.basePlan
        this.heap.basePlanResult = result
        console.log('first basePlan')
        this.visualizeBasePlan()
        return OK
    }

    console.log(`curruent cost:${this.heap.basePlanResult.cost}`)
    console.log(`new cost:${result.cost}`)

    this.visual.text(`current: ${this.heap.basePlanResult.cost}`, 25, 7)
    this.visual.text(`new: ${result.cost}`, 25, 9)

    if (result.cost < this.heap.basePlanResult.cost) {
        this.visual.text(`change!`, 25, 11)

        this.memory.basePlan = result.basePlan
        this.heap.basePlanResult = result
        this.heap.basePlan = this.unpackBasePlan(this.memory.basePlan)
        console.log(`basePlan changed.`)
        this.visualizeBasePlan()
        return OK
    }
    console.log(`basePlan not changed.`)
    this.visualizeBasePlan()
    return OK
}

Room.prototype.getBasePlan = function (firstAnchor, costs) {
    const basePlan = {}
    for (let i = 1; i <= 8; i++) {
        basePlan[`lv${i}`] = []
    }

    if (!firstAnchor) {
        console.log('cannot get 1st anchor')
        return { basePlan: basePlan, cost: Infinity }
    }

    //variable and array settings
    const mincutSources = []
    const structures = {}
    for (const structureType of Object.keys(CONSTRUCTION_COST)) {
        structures[structureType] = []
    }

    // get First anchor
    const anchors = []
    anchors.push(firstAnchor)

    for (const pos of anchors[0].area) {
        mincutSources.push(pos)
        costs.set(pos.x, pos.y, 255)
    }
    for (const pos of anchors[0].border) {
        mincutSources.push(pos)
        costs.set(pos.x, pos.y, 1)
    }

    // fill First anchor

    const firstSpawnPos = new RoomPosition(firstAnchor.pos.x, firstAnchor.pos.y - 1, this.name)
    for (const stamp of CLUSTER_STAMP) {
        const pos = new RoomPosition(firstAnchor.pos.x + stamp.x, firstAnchor.pos.y + stamp.y, this.name)
        structures[stamp.structureType].push(pos)
    }
    for (const pos of anchors[0].border) {
        structures.road.push(pos)
        basePlan[`lv3`].push(pos.packPos('road'))
    }

    // get third anchor (lab)

    const floodFillForLabs = this.floodFill(structures, 3)[3]

    for (const pos of floodFillForLabs) {
        const anchor = pos.getAnchor(2, costs)
        if (!anchor) {
            continue
        }
        for (const stamp of LABS_STAMP) {
            const areaPos = new RoomPosition(pos.x + stamp.x, pos.y + stamp.y, pos.roomName)
            costs.set(areaPos.x, areaPos.y, 255)
            mincutSources.push(areaPos)
            structures[stamp.structureType].push(areaPos)
            if (stamp.structureType === 'road') {
                basePlan[`lv6`].push(areaPos.packPos('road'))
            }
        }

        for (const borderPos of anchor.border) {
            costs.set(borderPos.x, borderPos.y, 1)
            mincutSources.push(borderPos)
            structures.road.push(borderPos)
            basePlan[`lv6`].push(borderPos.packPos('road'))
        }
        break
    }

    // flood fill spawn && extensions

    let numIterate = 0
    const MAX_ITERATE = 10
    while (structures.extension.length < 60 || structures.spawn.length < 3 || structures.tower.length < 6 || structures.observer.length < 1) {
        if (numIterate >= MAX_ITERATE) {
            console.log('cannot fill extensions')
            return { basePlan: basePlan, cost: Infinity }
        }
        numIterate++
        const floodFill = this.floodFill(structures, 2)
        const level2 = floodFill[2]
        const level1 = floodFill[1]
        for (let i = 0; i <= level1.length; i++) {
            if (structures.extension.length > 55) {
                break
            }
            const pos = level1[i]
            if (!pos) {
                break
            }
            const anchor = pos.getAnchor(1, costs)
            if (!anchor) {
                continue
            }
            i--
            level1.splice(i, 1)
            for (const pos of anchor.area) {
                structures.extension.push(pos)
                costs.set(pos.x, pos.y, 255)
                mincutSources.push(pos)
            }
            for (const pos of anchor.border) {
                structures.road.push(pos)
                basePlan[`lv4`].push(pos.packPos('road'))
                costs.set(pos.x, pos.y, 1)
                mincutSources.push(pos)
            }
            if (structures.extension.length >= 60) {
                break
            }
        }
        for (const pos of level2) {
            if (structures.extension.length > 55) {
                break
            }
            const anchor = pos.getAnchor(1, costs)
            if (!anchor) {
                continue
            }
            for (const pos of anchor.area) {
                structures.extension.push(pos)
                costs.set(pos.x, pos.y, 255)
                mincutSources.push(pos)
            }
            for (const pos of anchor.border) {
                structures.road.push(pos)
                basePlan[`lv5`].push(pos.packPos('road'))
                costs.set(pos.x, pos.y, 1)
                mincutSources.push(pos)
            }
            if (structures.extension.length >= 60) {
                break
            }
        }
        for (const pos of level1.concat(level1)) {
            if (costs.get(pos.x, pos.y) > 0) {
                continue
            }
            if (structures.spawn.length < 3) {
                structures.spawn.push(pos)
                costs.set(pos.x, pos.y, 255)
                mincutSources.push(pos)
                continue
            }
            if (structures.tower.length < 6) {
                structures.tower.push(pos)
                costs.set(pos.x, pos.y, 255)
                mincutSources.push(pos)
                continue
            }
            if (structures.observer.length < 1) {
                structures.observer.push(pos)
                costs.set(pos.x, pos.y, 255)
                mincutSources.push(pos)
                continue
            }
            structures.extension.push(pos)
            costs.set(pos.x, pos.y, 255)
            mincutSources.push(pos)
            if (structures.extension.length >= 60) {
                break
            }
        }
    }

    // sort extensions by range to first spawn
    structures.extension.sort((a, b) => a.getRangeTo(firstSpawnPos) - b.getRangeTo(firstSpawnPos))

    // roads to controller
    let pathCost = 0
    let costsForRoad = costs.clone()

    for (const pos of structures.road) {
        costsForRoad.set(pos.x, pos.y, 1)
    }

    const controllerPathSearch = PathFinder.search(firstSpawnPos, { pos: this.controller.pos, range: 2 }, {
        plainCost: 2,
        swampCost: 2,
        roomCallback: function (roomName) {
            return costsForRoad
        },
        maxOps: 10000,
        maxRooms: 1
    })

    if (controllerPathSearch.incomplete) {
        console.log('cannot find roads')
        return { basePlan: basePlan, cost: Infinity }
    }

    const path = controllerPathSearch.path
    pathCost += path.length

    const controllerLinkPos = path.pop()
    structures.link.push(controllerLinkPos)
    costs.set(controllerLinkPos.x, controllerLinkPos.y, 255)
    costsForRoad.set(controllerLinkPos.x, controllerLinkPos.y, 255)

    structures.road.push(...path)
    for (const pos of path) {
        basePlan[`lv3`].push(pos.packPos('road'))
    }
    for (const pos of path) {
        if (this.controller.pos.getRangeTo(pos) < 3) {
            continue
        }
        costs.set(pos.x, pos.y, 5)
        costsForRoad.set(pos.x, pos.y, 1)
    }

    // roads to sources
    const sources = this.sources.sort((a, b) => b.info.maxCarry - a.info.maxCarry)
    for (const source of sources) {
        const sourcePathSearch = PathFinder.search(firstSpawnPos, { pos: source.pos, range: 1 }, {
            plainCost: 2,
            swampCost: 2,
            roomCallback: function (roomName) {
                return costsForRoad
            },
            maxOps: 10000,
            maxRooms: 1
        })

        if (sourcePathSearch.incomplete) {
            console.log('cannot find roads')
            return { basePlan: basePlan, cost: Infinity }
        }

        const path = sourcePathSearch.path
        pathCost += path.length

        const containerPos = path.pop()
        structures.container.push(containerPos)

        costs.set(containerPos.x, containerPos.y, 255)
        costsForRoad.set(containerPos.x, containerPos.y, 255)

        structures.road.push(...path)
        for (const pos of path) {
            basePlan[`lv3`].push(pos.packPos('road'))
        }
        for (const pos of path) {
            costs.set(pos.x, pos.y, 5)
            costsForRoad.set(pos.x, pos.y, 1)
        }
        const linkPos = structures.link[0].findClosestByRange(containerPos.getAtRange(1).filter(pos => ![1, 5, 255].includes(costs.get(pos.x, pos.y))))
        if (!linkPos) {
            continue
        }
        structures.link.push(linkPos)
        costs.set(linkPos.x, linkPos.y, 255)
        costsForRoad.set(linkPos.x, linkPos.y, 255)
    }

    // roads to mineral + extractor
    structures.extractor.push(this.mineral.pos)
    const mineralPathSearch = PathFinder.search(firstSpawnPos, { pos: this.mineral.pos, range: 1 }, {
        plainCost: 2,
        swampCost: 2,
        roomCallback: function (roomName) {
            return costsForRoad
        },
        maxOps: 10000,
        maxRooms: 1
    })
    if (mineralPathSearch.incomplete) {
        console.log('cannot find roads')
        return { basePlan: basePlan, cost: Infinity }
    }

    const mineralPath = mineralPathSearch.path
    pathCost += mineralPath.length

    const mineralContainerPos = mineralPath.pop()
    structures.container.push(mineralContainerPos)
    costs.set(mineralContainerPos.x, mineralContainerPos.y, 255)
    costsForRoad.set(mineralContainerPos.x, mineralContainerPos.y, 255)
    structures.road.push(...mineralPath)
    for (const pos of mineralPath) {
        basePlan[`lv6`].push(pos.packPos('road'))
    }
    for (const pos of mineralPath) {
        costs.set(pos.x, pos.y, 5)
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
            const cost = 1 + (new RoomPosition(x, y, this.name).getRangeTo(firstSpawnPos) >> 2)
            mincutCostMap.set(x, y, Math.min(cost, 254))
        }
    }

    const cuts = this.mincutToExit(nearPoses, mincutCostMap)

    let cost = 0
    for (const cut of cuts) {
        const coord = parseVerticeToPos(cut)
        const pos = new RoomPosition(coord.x, coord.y, this.name)
        cost += mincutCostMap.get(pos.x, pos.y)
        new RoomVisual(this.name).circle(pos, { fill: 'yellow', radius: 0.5 })
        structures.rampart.push(pos)
    }

    // packPos
    // link : storage -> controller -> 먼 source -> 가까운 source
    const linkPositions = {
        storage: structures.link[0].pack(),
        controller: structures.link[1].pack()
    }
    linkPositions[sources[0].id] = structures.link[2].pack()
    if (sources[1] && structures.link[3]) {
        linkPositions[sources[1].id] = structures.link[3].pack()
    }

    basePlan.linkPositions = linkPositions

    for (const structureType of Object.keys(CONTROLLER_STRUCTURES)) {
        const structurePositions = structures[structureType]

        if (structureType === 'road') {
            continue
        }

        if (structureType === 'rampart') {
            for (const pos of structurePositions) {
                basePlan[`lv5`].push(pos.packPos('rampart'))
            }
            continue
        }

        if (structureType === 'container') {
            basePlan[`lv3`].push(structurePositions[0].packPos('container'))
            basePlan[`lv3`].push(structurePositions[1].packPos('container'))
            basePlan[`lv6`].push(structurePositions[2].packPos('container'))
            continue
        }

        const numStructureTypeByLevel = CONTROLLER_STRUCTURES[structureType]
        for (i = 1; i <= 8; i++) {
            const numStructure = numStructureTypeByLevel[i] - numStructureTypeByLevel[i - 1]
            if (numStructure > 0) {
                for (j = 0; j < numStructure; j++) {
                    const pos = structurePositions.shift()
                    if (!pos) {
                        continue
                    }
                    basePlan[`lv${i}`].push(pos.packPos(structureType))
                }
            }
        }
    }

    cost = cost ? cost + pathCost : Infinity

    console.log('CPU used: ' + Game.cpu.getUsed())

    return { basePlan: basePlan, cost: cost }
}

Room.prototype.getBasePlanBySpawn = function () {
    const spawn = this.structures.spawn[0]
    if (!spawn) {
        console.log('no spawn in this room')
        return
    }
    const pos = new RoomPosition(spawn.pos.x, spawn.pos.y + 1, this.name)

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
        for (const pos of source.pos.getInRange(1)) {
            if (costs.get(pos.x, pos.y) < 10) {
                costs.set(pos.x, pos.y, 30)
            }
        }
        for (const pos of source.pos.getAtRange(2)) {
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

    const firstAnchor = pos.getClusterAnchor(costs)

    const result = this.getBasePlan(firstAnchor, costs)

    if (result.cost === Infinity) {
        return false
    }

    this.memory.basePlan = result.basePlan
    this.heap.basePlanResult = result
    console.log('first basePlan')
    this.visualizeBasePlan()
    return OK
}

const CLUSTER_STAMP = [
    { x: -1, y: -1, structureType: 'storage' },
    { x: 0, y: -1, structureType: 'spawn' },
    { x: 1, y: -1, structureType: 'powerSpawn' },
    { x: -1, y: 0, structureType: 'terminal' },
    { x: 1, y: 0, structureType: 'nuker' },
    { x: -1, y: 1, structureType: 'factory' },
    { x: +1, y: 1, structureType: 'link' },
    { x: 0, y: 0, structureType: 'road' },
    { x: 0, y: 1, structureType: 'road' },
]

const CLUSTER_STRUCTURETYPE = [
    'link',
    'storage',
    'powerSpawn',
    'terminal',
    'nuker',
    'factory',
    'road',
    'spawn'
]

const LABS_STAMP = [
    { x: -1, y: -1, structureType: 'lab' },
    { x: 0, y: -1, structureType: 'lab' },
    { x: 1, y: -1, structureType: 'lab' },
    { x: -2, y: 0, structureType: 'lab' },
    { x: 0, y: 0, structureType: 'lab' },
    { x: +2, y: 0, structureType: 'lab' },
    { x: -1, y: 1, structureType: 'lab' },
    { x: 0, y: 1, structureType: 'lab' },
    { x: 1, y: 1, structureType: 'lab' },
    { x: 0, y: 2, structureType: 'lab' },
    { x: -1, y: 0, structureType: 'road' },
    { x: +1, y: 0, structureType: 'road' },
]

Room.prototype.getFirstAnchorsByDT = function (costs, numFirstAnchor) {
    if (this.heap.possibleAnchors) {
        return this.heap.possibleAnchors
    }

    const importantPositions = []
    importantPositions.push(this.controller.pos)
    importantPositions.push(...this.sources.map(source => source.pos))
    importantPositions.push(...this.find(FIND_MINERALS).map(mineral => mineral.pos))

    const DT = this.getDistanceTransform()
    const result = []

    for (i = 25; i > 2; i--) {
        for (const pos of DT[i]) {
            const anchor = pos.getClusterAnchor(costs)
            if (!anchor) {
                continue
            }
            result.push(anchor)
            this.visual.text(i, pos)
            this.visual.circle(pos, { fill: 'green' })
        }
    }

    this.heap.possibleAnchors = _.shuffle(result)
    return this.heap.possibleAnchors
}


RoomPosition.prototype.getClusterAnchor = function (costs) {
    const anchor = {
        pos: this,
        size: 2,
    }

    const area = this.getInRange(1)
    for (const pos of area) {
        if (!isValidCoord(pos.x, pos.y) || costs.get(pos.x, pos.y) > 0) {
            return undefined
        }
    }

    const border = []
    for (let x of [-2, 2]) {
        for (let y of [-1, 0, 1]) {
            const pos = new RoomPosition(this.x + x, this.y + y, this.roomName)
            if (!isValidCoord(pos.x, pos.y) || costs.get(pos.x, pos.y) > 1) {
                return undefined
            }
            border.push(new RoomPosition(pos.x, pos.y, this.roomName))
        }
    }
    for (let y of [-2, 2]) {
        for (let x of [-1, 0, 1]) {
            const pos = new RoomPosition(this.x + x, this.y + y, this.roomName)
            if (!isValidCoord(pos.x, pos.y) || costs.get(pos.x, pos.y) > 1) {
                return undefined
            }
            border.push(new RoomPosition(pos.x, pos.y, this.roomName))
        }
    }

    anchor.area = area
    anchor.border = border

    return anchor
}

RoomPosition.prototype.getAnchor = function (size, costs) {
    const anchor = {}
    anchor.pos = this
    anchor.size = size

    const area = [this]
    for (let i = 1; i <= size; i++) {
        for (let x = 0; x <= i; x++) {
            const X = x === 0 ? [0] : [x, -x]
            const Y = x === i ? [0] : [x - i, i - x]
            for (const x of X) {
                for (const y of Y) {
                    if (!isValidCoord(this.x + x, this.y + y) || costs.get(this.x + x, this.y + y) > 0) {
                        return undefined
                    }
                    area.push(new RoomPosition(this.x + x, this.y + y, this.roomName))
                }
            }
        }
    }
    anchor.area = area

    const border = []
    const i = size + 1
    for (let x = 0; x <= i; x++) {
        const X = x === 0 ? [0] : [x, -x]
        const Y = x === i ? [0] : [x - i, i - x]
        for (const x of X) {
            for (const y of Y) {
                if (!isValidCoord(this.x + x, this.y + y) || costs.get(this.x + x, this.y + y) > 5) {
                    return undefined
                }
                border.push(new RoomPosition(this.x + x, this.y + y, this.roomName))
            }
        }
    }
    anchor.border = border

    return anchor
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

Object.defineProperties(Room.prototype, {
    basePlan: {
        get() {
            if (!this.heap.basePlan) {
                if (!this.memory.basePlan) {
                    return undefined
                }
                this.heap.basePlan = this.unpackBasePlan(this.memory.basePlan)
            }
            return this.heap.basePlan
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
})

Room.prototype.floodFill = function (structures, maxLevel) {
    const sources = []
    for (const pos of structures.road) {
        sources.push(pos)
    }

    const costMatrix = new PathFinder.CostMatrix();
    const queue = [];
    const terrain = new Room.Terrain(this.name);
    const exits = this.find(FIND_EXIT);

    const positionsByLevel = new Array(9)
    for (let i = 0; i < positionsByLevel.length; i++) {
        positionsByLevel[i] = []
    }

    // Set the initial costMatrix values for each position in the room
    for (let x = 0; x <= 49; x++) {
        for (let y = 0; y <= 49; y++) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                costMatrix.set(x, y, 255);
                continue;
            }
            if (x === 0 || x === 49 || y === 0 || y === 49) {
                costMatrix.set(x, y, 255);
                continue;
            }
            costMatrix.set(x, y, 200);
        }
    }

    // Set the cost to 255 for positions adjacent to exits
    for (const exit of exits) {
        for (const pos of exit.getInRange(1)) {
            costMatrix.set(pos.x, pos.y, 255);
        }
    }

    // Set the cost to 0 for each source position and add them to the queue
    for (const source of sources) {
        costMatrix.set(source.x, source.y, 0);
        queue.push(source);
    }

    // Make arrays for level 1 and level 2

    const ADJACENT_VECTORS = [
        { x: 0, y: 1 },
        { x: 0, y: -1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: -1 },
        { x: -1, y: 1 },
        { x: -1, y: -1 },

    ]

    // Start the flood-fill algorithm
    while (queue.length) {
        const currentPos = queue.shift();

        // Get neighboring positions
        const neighbors = []

        for (const vector of ADJACENT_VECTORS) {
            neighbors.push(new RoomPosition(currentPos.x + vector.x, currentPos.y + vector.y, this.name))
        }

        for (const neighbor of neighbors) {
            const x = neighbor.x;
            const y = neighbor.y;

            if (costMatrix.get(x, y) === 200 && costMatrix.get(currentPos.x, currentPos.y) < maxLevel) {
                // Set the cost to the current position's cost plus 1
                const level = costMatrix.get(currentPos.x, currentPos.y) + 1
                costMatrix.set(x, y, level);
                queue.push(neighbor);
                positionsByLevel[level].push(neighbor)
            }
        }
    }

    return positionsByLevel
}