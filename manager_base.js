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

    if (this.controller.level < 5) { // rcl 5 이전에는 controller container
        const linkPos = this.parsePos(this.memory.basePlan.linkPositions.controller)
        linkPos.createConstructionSite('container')
    } else {
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
    const costs = this.getCostMatrixForBasePlan()

    // get first anchor candidates

    if (!this.heap.possibleAnchors) {
        this.getFirstAnchorsByDT(costs, numFirstAnchor - 5)
    }

    if (!this.heap.possibleAnchors.length) {
        this.getFirstAnchorsByDT(costs, numFirstAnchor - 5)
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

    this.visual.text(`current: ${this.heap.basePlanResult.cost}`, 25, 40)
    this.visual.text(`new: ${result.cost}`, 25, 42)

    if (result.cost < this.heap.basePlanResult.cost) {
        this.visual.text(`change!`, 25, 44)

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
    costs = costs.clone()
    const basePlan = {}
    for (let i = 1; i <= 8; i++) {
        basePlan[`lv${i}`] = []
    }

    if (Game.cpu.bucket < 1000) {
        console.log(`bucket is not enough`)
        return { basePlan: basePlan, cost: Infinity }
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

    // fill First anchor

    const firstSpawnPos = new RoomPosition(firstAnchor.pos.x, firstAnchor.pos.y - 1, this.name)
    for (const stamp of CLUSTER_STAMP) {
        const pos = new RoomPosition(firstAnchor.pos.x + stamp.x, firstAnchor.pos.y + stamp.y, this.name)
        structures[stamp.structureType].push(pos)
        if (stamp.structureType === 'road') {
            basePlan[`lv3`].push(pos.packPos('road'))
        }
        costs.set(pos.x, pos.y, 255)
        mincutSources.push(pos)
    }
    for (const pos of anchors[0].border) {
        structures.road.push(pos)
        basePlan[`lv3`].push(pos.packPos('road'))
        costs.set(pos.x, pos.y, 1)
    }

    // get third anchor (lab)
    const floodFillForLabs = this.floodFill(structures.road, { maxLevel: 4, adjacents: CROSS }).positions
    const labStampCandidats = [...floodFillForLabs[3], ...floodFillForLabs[4]]

    let gotThirdAnchor = false
    for (const pos of labStampCandidats) {
        const anchor = pos.getAnchor(2, costs)
        if (!anchor) {
            continue
        }
        gotThirdAnchor = true
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
            structures.road.push(borderPos)
            basePlan[`lv6`].push(borderPos.packPos('road'))
        }
        break
    }

    if (!gotThirdAnchor) {
        console.log('cannot find lab position')
        return { basePlan: basePlan, cost: Infinity }
    }

    // flood fill spawn && extensions && towers,observer
    const floodFill = this.floodFill(structures.road)
    const floodFillCosts = floodFill.costMatrix
    const floodFillPositions = floodFill.positions
    const floodFillResults = []
    const cross = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
    ]

    const CENTER_X = (firstAnchor.pos.x + firstAnchor.pos.y - 1) % 4
    const CENTER_Y = Math.abs(firstAnchor.pos.x - firstAnchor.pos.y + 1) % 4
    const ROAD_X = (CENTER_X + 2) % 4
    const ROAD_Y = (CENTER_Y + 2) % 4
    outer:
    for (let level = 1; level <= 15; level++) {
        const positions = floodFillPositions[level]
        for (const pos of positions) {
            if (floodFillResults.length >= 67) {
                break outer
            }
            if (Math.abs(pos.x + pos.y) % 4 === ROAD_X || Math.abs(pos.x - pos.y) % 4 === ROAD_Y) {
                continue
            }
            if (costs.get(pos.x, pos.y) > 0) {
                continue
            }
            floodFillResults.push(pos)
            costs.set(pos.x, pos.y, 255)
            mincutSources.push(pos)
            if (Math.abs(pos.x + pos.y) % 4 === CENTER_X) {
                continue
            }
            for (const vector of cross) {
                const roadPos = new RoomPosition(pos.x + vector.x, pos.y + vector.y, this.name)
                if (Math.abs(roadPos.x + roadPos.y) % 4 === CENTER_X && Math.abs(roadPos.x - roadPos.y) % 4 === CENTER_Y) {
                    continue
                }
                if (costs.get(roadPos.x, roadPos.y) <= 10) {
                    structures.road.push(roadPos)
                    basePlan[`lv4`].push(roadPos.packPos('road'))
                    costs.set(roadPos.x, roadPos.y, 1)
                }
            }
        }
    }
    for (let i = 0; i < 1; i++) {
        const pos = floodFillResults.pop()
        structures.observer.push(pos)
    }

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

    for (const pos of path) {
        structures.road.push(pos)
        basePlan[`lv3`].push(pos.packPos('road'))
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
        costs.set(pos.x, pos.y, 5)
        costsForRoad.set(pos.x, pos.y, 1)
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
            const cost = 1 + (floodFillCosts.get(x, y) >> 1)
            mincutCostMap.set(x, y, Math.min(cost, 254))
        }
    }

    const mincut = this.mincutToExit(nearPoses, mincutCostMap)
    const cuts = mincut.cuts
    const insides = mincut.insides
    const outsides = mincut.outsides

    let cost = 0
    const checkRampart = new PathFinder.CostMatrix
    const storagePos = structures.storage[0]
    const costsForRampart = costsForRoad.clone()
    for (let x = 0; x <= 49; x++) {
        for (let y = 0; y <= 49; y++) {
            if (costsForRampart.get(x, y) === 1) {
                costsForRampart.set(x, y, 5)
            }
        }
    }
    for (const cut of cuts) {
        const coord = parseVerticeToPos(cut)
        const pos = new RoomPosition(coord.x, coord.y, this.name)

        this.visual.circle(pos, { fill: 'yellow', radius: 0.5 })
        structures.road.push(pos)
        basePlan[`lv6`].push(pos.packPos('road'))
        costsForRampart.set(pos.x, pos.y, 1)
    }

    for (const inside of insides) {
        const coord = parseVerticeToPos(inside)
        const pos = new RoomPosition(coord.x, coord.y, this.name)
    }

    for (const cut of cuts) {
        const coord = parseVerticeToPos(cut)
        const pos = new RoomPosition(coord.x, coord.y, this.name)
        const rampartPath = PathFinder.search(storagePos, { pos: pos, range: 0 }, {
            plainCost: 15,
            swampCost: 15,
            roomCallback: function (roomName) {
                return costsForRampart
            },
            maxOps: 10000,
            maxRooms: 1
        }).path
        for (const pathPos of rampartPath) {
            structures.road.push(pathPos)
            basePlan[`lv6`].push(pathPos.packPos('road'))
            costsForRampart.set(pathPos.x, pathPos.y, 1)
            if (rampartPath.length - rampartPath.indexOf(pathPos) <= 3) {
                if (checkRampart.get(pathPos.x, pathPos.y) > 0) {
                    continue
                }
                structures.rampart.push(pathPos)
                cost += mincutCostMap.get(pathPos.x, pathPos.y)
                checkRampart.set(pathPos.x, pathPos.y, 1)
            }
        }
    }

    // place towers and extensions
    floodFillResults.sort((a, b) => a.getAverageRange(structures.rampart) - b.getAverageRange(structures.rampart))
    for (let i = 0; i < 6; i++) {
        const pos = floodFillResults.shift()
        structures.tower.push(pos)
    }

    for (let i = 0; i < 60; i++) {
        const pos = floodFillResults.shift()
        structures.extension.push(pos)
    }



    // sort extensions by range to first spawn
    structures.extension.sort((a, b) => a.getRangeTo(firstSpawnPos) - b.getRangeTo(firstSpawnPos))

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
    for (let i = 1; i <= 8; i++) {
        basePlan[`lv${i}`] = [...new Set(basePlan[`lv${i}`])]
        for (let j = 1; j < i; j++) {
            basePlan[`lv${i}`] = basePlan[`lv${i}`].filter(packed => !basePlan[`lv${j}`].includes(packed))
        }
    }
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

    const costs = this.getCostMatrixForBasePlan()

    const firstAnchor = pos.getAnchor(2, costs)

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

Room.prototype.getBasePlanByPos = function (pos) {
    const costs = this.getCostMatrixForBasePlan()

    const firstAnchor = pos.getAnchor(2, costs)

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

Room.prototype.getCostMatrixForBasePlan = function () {
    if (this.heap._getCostMatrixForBasePlan) {
        return this.heap._getCostMatrixForBasePlan
    }
    const costs = this.basicCostMatrixForRoomPlan.clone()
    for (const pos of this.controller.pos.getInRange(4)) {
        if (costs.get(pos.x, pos.y) < 30) {
            costs.set(pos.x, pos.y, 30)
        }
    }
    for (const source of this.sources) {
        for (const pos of source.pos.getInRange(1)) {
            if (costs.get(pos.x, pos.y) < 30) {
                costs.set(pos.x, pos.y, 30)
            }
        }
        for (const pos of source.pos.getAtRange(2)) {
            if (costs.get(pos.x, pos.y) < 4) {
                costs.set(pos.x, pos.y, 4)
            }
        }
    }
    for (const pos of this.mineral.pos.getInRange(1)) {
        if (costs.get(pos.x, pos.y) < 30) {
            costs.set(pos.x, pos.y, 30)
        }
    }

    for (let x = 0; x <= 49; x++) {
        for (let y = 0; y <= 49; y++) {
            const pos = new RoomPosition(x, y, this.name)
            if (!pos.isConnected()) {
                this.visual.circle(x, y, { fill: 'yellow', radius: 0.5 })
                if (costs.get(x, y) < 10) {
                    costs.set(x, y, 10)
                }
            }
        }
    }

    return this.heap._getCostMatrixForBasePlan = costs
}

const CLUSTER_STAMP = [
    { x: -1, y: -1, structureType: 'storage' },
    { x: 0, y: -1, structureType: 'spawn' },
    { x: 1, y: -1, structureType: 'powerSpawn' },
    { x: -2, y: 0, structureType: 'factory' },
    { x: -1, y: 0, structureType: 'terminal' },
    { x: 1, y: 0, structureType: 'spawn' },
    { x: -1, y: 1, structureType: 'spawn' },
    { x: +1, y: 1, structureType: 'link' },
    { x: 0, y: 0, structureType: 'road' },
    { x: 0, y: 1, structureType: 'road' },
    { x: 0, y: 2, structureType: 'nuker' },
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
    if (this.heap.possibleAnchors && this.heap.possibleAnchors.length > 0) {
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
            const anchor = pos.getAnchor(2, costs)
            if (!anchor) {
                continue
            }
            result.push(anchor)
            this.visual.circle(pos, { fill: 'green' })
        }
    }

    this.heap.possibleAnchors = _.shuffle(result).slice(0, numFirstAnchor)
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

Room.prototype.floodFill = function (sources, option = {}) {
    //sources being array of roomPositions. option = {maxLevel, costMatrix, adjacents}
    let { maxLevel, costMatrix, adjacents } = option
    if (maxLevel === undefined) {
        maxLevel = Infinity
    }
    if (costMatrix === undefined) {
        costMatrix = new PathFinder.CostMatrix();
    } else {
        costMatrix = costMatrix.clone()
    }
    if (adjacents === undefined) {
        adjacents = NEAR
    }
    const queue = [];
    const terrain = new Room.Terrain(this.name);
    const exits = this.find(FIND_EXIT);

    const positionsByLevel = {}

    // Set the initial costMatrix values for each position in the room
    for (let x = 0; x <= 49; x++) {
        for (let y = 0; y <= 49; y++) {
            // set 255 to wall
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                costMatrix.set(x, y, 255);
                continue;
            }

            // set 255 to room edges
            if (x === 0 || x === 49 || y === 0 || y === 49) {
                costMatrix.set(x, y, 255);
                continue;
            }

            // set 200 to everything else
            if (costMatrix.get(x, y) < 200) {
                costMatrix.set(x, y, 200);
            }
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

    // Start the flood-fill algorithm
    while (queue.length) {
        const currentPos = queue.shift();

        // Get neighboring positions
        const neighbors = []

        for (const vector of adjacents) {
            const x = currentPos.x + vector.x
            const y = currentPos.y + vector.y
            if (!isValidCoord(x, y)) {
                continue
            }
            neighbors.push(new RoomPosition(x, y, this.name))
        }

        for (const neighbor of neighbors) {
            const x = neighbor.x;
            const y = neighbor.y;

            if (costMatrix.get(x, y) === 200 && costMatrix.get(currentPos.x, currentPos.y) < maxLevel) {
                // Set the cost to the current position's cost plus 1
                const level = costMatrix.get(currentPos.x, currentPos.y) + 1
                positionsByLevel[level] = positionsByLevel[level] || []
                costMatrix.set(x, y, level);
                queue.push(neighbor);
                positionsByLevel[level].push(neighbor)
            }
        }
    }

    return { positions: positionsByLevel, costMatrix: costMatrix }
}

RoomPosition.prototype.isConnected = function () {
    const thisPos = this
    if (this.isWall) {
        return false
    }
    const area = this.getInRange(3)
    const numOpen = area.filter(pos => !pos.isWall).length
    if (numOpen >= 46) {
        return true
    }

    const queue = [this]
    const level = new Array(49)
    level.fill(-1)
    level[7 * 3 + 3] = 0
    while (queue.length) {
        const current = queue.shift()
        NEAR.forEach(vector => {
            const x = current.x + vector.x
            const y = current.y + vector.y
            if (!isValidCoord(x, y)) {
                return
            }
            const neighbor = new RoomPosition(x, y, this.roomName)
            if (neighbor.isWall) {
                return
            }
            const packed = packPos(x, y)
            if (packed === false) {
                return
            }
            if (level[packed] !== -1) {
                return
            }
            level[packed] = level[packPos(current.x, current.y)] + 1
            queue.push(neighbor)
        })
    }
    return numOpen === level.filter(element => element !== -1).length

    function packPos(x, y) {
        const dx = x - thisPos.x + 3
        const dy = y - thisPos.y + 3
        if (dx < 0 || dx > 6 || dy < 0 || dy > 6) {
            return false
        }
        return 7 * dx + dy
    }

}