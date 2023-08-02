const ROAD_COST = 1
const DISCONNECTED_COST = 199
const WORKSPACE_COST = 50
const NEAR_WORKSPACE_COST = 30
const STRUCTURE_COST = 255
const WALL_COST = 255
const EDGE_COST = 255
const NEAR_EXIT_COST = 200

const CLUSTER_STAMP = [
    { x: -1, y: -1, structureType: 'spawn' },
    { x: 0, y: -1, structureType: 'spawn' },
    { x: 1, y: -1, structureType: 'spawn' },
    { x: -1, y: 0, structureType: 'terminal' },
    { x: 1, y: 0, structureType: 'link' },
    { x: -1, y: 1, structureType: 'storage' },
    { x: +1, y: 1, structureType: 'powerSpawn' },
    { x: 0, y: 0, structureType: 'road' },
    { x: 0, y: 1, structureType: 'road' },
]

const CLUSTER_BORDER_STAMP = [
    { x: -2, y: -1, structureType: 'road' },
    { x: -2, y: 0, structureType: 'road' },
    { x: -2, y: 1, structureType: 'road' },
    { x: -1, y: -2, structureType: 'road' },
    { x: -1, y: 2, structureType: 'road' },
    { x: 0, y: -2, structureType: 'road' },
    { x: 1, y: -2, structureType: 'road' },
    { x: 1, y: 2, structureType: 'road' },
    { x: 2, y: -1, structureType: 'road' },
    { x: 2, y: 0, structureType: 'road' },
    { x: 2, y: 1, structureType: 'road' },
]

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

function mod(m, n) {
    return ((m % n) + n) % n
}

Room.prototype.getBasePlan = function (firstAnchor, inputCosts) {
    const costs = inputCosts.clone()
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
    const linkPositions = {}

    // fill First anchor

    const firstSpawnPos = new RoomPosition(firstAnchor.pos.x, firstAnchor.pos.y - 1, this.name)
    for (const stamp of CLUSTER_STAMP) {
        const pos = new RoomPosition(firstAnchor.pos.x + stamp.x, firstAnchor.pos.y + stamp.y, this.name)
        structures[stamp.structureType].push(pos)
        mincutSources.push(pos)
        if (stamp.structureType === 'road') {
            basePlan[`lv3`].push(pos.packPos('road'))
            costs.set(pos.x, pos.y, ROAD_COST)
            continue
        }
        costs.set(pos.x, pos.y, STRUCTURE_COST)
    }
    for (const stamp of CLUSTER_BORDER_STAMP) {
        const pos = new RoomPosition(firstAnchor.pos.x + stamp.x, firstAnchor.pos.y + stamp.y, this.name)
        mincutSources.push(pos)
        if (costs.get(pos.x, pos.y) < NEAR_WORKSPACE_COST) {
            basePlan[`lv3`].push(pos.packPos('road'))
            costs.set(pos.x, pos.y, ROAD_COST)
        }
    }
    linkPositions.storage = structures.link[0].pack()

    // choose controller, source, mineral container & link positions

    // source
    // find closest position by Path
    const containerPositions = {}
    for (const source of this.sources.sort((a, b) => b.range.spawn - a.range.spawn)) {
        const containerPos = firstAnchor.pos.getClosestByPath(source.pos.getAtRange(1).filter(pos => costs.get(pos.x, pos.y) <= NEAR_EXIT_COST))
        if (!containerPos) {
            console.log(`cannot find container pos of ${source.id}`)
            return { basePlan: basePlan, cost: Infinity }
        }
        containerPositions[source.id] = containerPos
        structures.container.push(containerPos)
        basePlan[`lv3`].push(containerPos.packPos('container'))
        costs.set(containerPos.x, containerPos.y, STRUCTURE_COST)

        if (containerPos.available >= 3) {
            const linkPos = firstAnchor.pos.findClosestByRange(containerPos.getAtRange(1).filter(pos => costs.get(pos.x, pos.y) <= NEAR_EXIT_COST))

            if (!linkPos) {
                continue
            }

            structures.link.push(linkPos)
            linkPositions[source.id] = linkPos.pack()
            costs.set(linkPos.x, linkPos.y, STRUCTURE_COST)
        }
    }

    //mineral
    // find closest position by Path
    const mineralContainerPos = firstAnchor.pos.getClosestByPath(this.mineral.pos.getAtRange(1).filter(pos => costs.get(pos.x, pos.y) <= NEAR_EXIT_COST))
    structures.container.push(mineralContainerPos)
    basePlan[`lv3`].push(mineralContainerPos.packPos('container'))
    costs.set(mineralContainerPos.x, mineralContainerPos.y, STRUCTURE_COST)

    // controller
    // sort possible positions by path and iterate
    const possiblePositions = this.controller.pos.getInRange(2).filter(pos => costs.get(pos.x, pos.y) <= NEAR_EXIT_COST).sort((a, b) => a.getClosestPathLength([this.controller]) - b.getClosestPathLength([this.controller]))

    let controllerLinkPos = undefined
    for (const posClosestToController of possiblePositions) {
        // use floodfill to expand
        const nearClosestPositions = this.floodFill([posClosestToController], { maxLevel: 2, costMatrix: inputCosts }).allPositions
        nearClosestPositions.push(posClosestToController)

        // filter by range to controller<=2 and sort by num of available spots
        let controllerLinkCandidates = nearClosestPositions.filter(pos => pos.getRangeTo(this.controller.pos) <= 2 && costs.get(pos.x, pos.y) <= NEAR_EXIT_COST)
        controllerLinkCandidates = controllerLinkCandidates.sort((a, b) => {
            const aResult = a.getInRange(1).filter(pos => costs.get(pos.x, pos.y) <= NEAR_EXIT_COST).length
            const bResult = b.getInRange(1).filter(pos => costs.get(pos.x, pos.y) <= NEAR_EXIT_COST).length
            return bResult - aResult
        })

        controllerLinkPos = controllerLinkCandidates[0]
        if (!controllerLinkPos) {
            continue
        }
        structures.link.unshift(controllerLinkPos)
        linkPositions.controller = controllerLinkPos.pack()
        costs.set(controllerLinkPos.x, controllerLinkPos.y, STRUCTURE_COST)
        for (const pos of controllerLinkPos.getAtRange(1)) {
            if (costs.get(pos.x, pos.y) < WORKSPACE_COST)
                costs.set(pos.x, pos.y, WORKSPACE_COST)
        }
        break
    }

    if (!controllerLinkPos) {
        console.log(`cannot find container pos of controller`)
    }
    this.visual.circle(controllerLinkPos, { fill: 'green', radius: 0.5 })

    // Flood fill labs && extensions && observer, factory, nuker
    const floodFill = this.floodFill(structures.road, { costMatrix: inputCosts })

    const floodFillCosts = floodFill.costMatrix
    const floodFillPositions = floodFill.positions

    const cross = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
    ]

    let floodFillResults = []
    const CENTER_SUM = mod(firstAnchor.pos.x + firstAnchor.pos.y + 1, 4)
    const CENTER_DIFF = mod(firstAnchor.pos.x - firstAnchor.pos.y - 1, 4)
    const ROAD_SUM = mod(CENTER_SUM + 2, 4)
    const ROAD_DIFF = mod(CENTER_DIFF + 2, 4)

    outer:
    for (let level = 1; level <= 20; level++) {
        const positions = floodFillPositions[level]
        if (!positions) {
            console.log(`not enough extensions.`)
            break
        }
        for (const pos of positions) {
            // 73개 찾았으면 끝내자
            if (floodFillResults.length >= 73) {
                break outer
            }
            // 길 깔아야 되는 위치면 넘어가자
            if ((mod(pos.x + pos.y, 4) === ROAD_SUM) || (mod(pos.x - pos.y, 4) === ROAD_DIFF)) {
                continue
            }
            // costs가 0이 아니면 넘어가자
            if (costs.get(pos.x, pos.y) > 0) {
                continue
            }
            // 위 1칸 아래 1칸 또는 왼쪽 1칸 오른쪽 1칸이 모두 cost가 200 이상이면 지나다닐 수가 없는거니까 길 깔고 넘어가
            if (costs.get(pos.x + 1, pos.y) >= 200 && costs.get(pos.x - 1, pos.y) >= 200) {
                structures.road.push(pos)
                costs.set(pos.x, pos.y, ROAD_COST)
                continue
            }
            if (costs.get(pos.x, pos.y + 1) >= 200 && costs.get(pos.x, pos.y - 1) >= 200) {
                structures.road.push(pos)
                costs.set(pos.x, pos.y, ROAD_COST)
                continue
            }

            // 중앙일 때 위 2칸 아래 2칸 또는 왼쪽 2칸 오른쪽 2칸이 모두 cost가 200 이상이면 지나다닐 수가 없는거니까 제외

            if (mod(pos.x + pos.y, 4) === CENTER_SUM) {
                if (costs.get(pos.x + 2, pos.y) >= 200 && costs.get(pos.x - 2, pos.y) >= 200) {
                    continue
                }
                if (costs.get(pos.x, pos.y + 2) >= 200 && costs.get(pos.x, pos.y - 2) >= 200) {
                    continue
                }
            }

            floodFillResults.push(pos)
            costs.set(pos.x, pos.y, STRUCTURE_COST)
            mincutSources.push(pos)
        }
    }
    structures.factory.push(floodFillResults.shift())

    const sourceLabPositions = []
    const sourceLabCosts = new PathFinder.CostMatrix

    for (const pos of floodFillResults) {
        sourceLabCosts.set(pos.x, pos.y, 1)
        // center에 있는 위치면 주변에 길 안깔아도 됨
        if (mod(pos.x + pos.y, 4) === CENTER_SUM) {
            continue
        }
        // 주변 확인하자
        sourceLabPositions.push(pos)
        for (const vector of cross) {
            const roadPos = new RoomPosition(pos.x + vector.x, pos.y + vector.y, this.name)
            // 중앙일때, 건물 있으면 길 깔지 말고 건물 없으면 길 깔자
            if (mod(roadPos.x + roadPos.y, 4) === CENTER_SUM && mod(roadPos.x - roadPos.y, 4) === CENTER_DIFF) {
                if (costs.get(roadPos.x, roadPos.y) <= NEAR_WORKSPACE_COST) {
                    structures.road.push(roadPos)
                    costs.set(roadPos.x, roadPos.y, ROAD_COST)
                }
                continue
            }
            // 중앙 아니면 주변에 길 깔자
            if (costs.get(roadPos.x, roadPos.y) <= NEAR_WORKSPACE_COST) {
                structures.road.push(roadPos)
                costs.set(roadPos.x, roadPos.y, ROAD_COST)
            }
        }
    }

    const SECOND_SOURCE_LAB = [
        { x: 0, y: -1 },
        { x: 0, y: -2 },
        { x: 1, y: -1 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 0 },
    ]

    let isLab = false
    outerLab:
    for (const firstSourceLab of sourceLabPositions) {
        let secondSourceLabCandidates = []
        SECOND_SOURCE_LAB.forEach(vector => {
            const x = firstSourceLab.x + vector.x
            const y = firstSourceLab.y + vector.y
            if (isValidCoord(x, y)) {
                secondSourceLabCandidates.push(new RoomPosition(x, y, this.name))
            }
        })
        for (const secondSourceLab of secondSourceLabCandidates) {
            if (sourceLabCosts.get(secondSourceLab.x, secondSourceLab.y) < 1) {
                continue
            }
            let numReactionLab = 0
            let labPositions = []
            for (const pos of firstSourceLab.getInRange(2)) {
                if (numReactionLab >= 10) {
                    break
                }
                if (sourceLabCosts.get(pos.x, pos.y) < 1) {
                    continue
                }
                if (pos.getRangeTo(secondSourceLab) > 2) {
                    continue
                }
                numReactionLab++
                labPositions.push(pos)
            }
            if (numReactionLab === 10) {
                isLab = true
                for (const pos of labPositions) {
                    structures.lab.push(pos)
                    floodFillResults = floodFillResults.filter(element => element.getRangeTo(pos) > 0)
                }
                break outerLab
            }
        }
    }

    if (!isLab) {
        console.log('cannot find lab position')
        return { basePlan: basePlan, cost: Infinity }
    }

    structures.observer.push(floodFillResults.pop())
    structures.nuker.push(floodFillResults.shift())

    // roads to controller
    let pathCost = 0

    const controllerPathSearch = PathFinder.search(firstSpawnPos, { pos: controllerLinkPos, range: 1 }, {
        plainCost: 2,
        swampCost: 2,
        roomCallback: function (roomName) {
            return costs
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

    for (const pos of path) {
        structures.road.push(pos)
        basePlan[`lv3`].push(pos.packPos('road'))
        costs.set(pos.x, pos.y, ROAD_COST)
    }

    // roads to sources
    const sources = this.sources.sort((a, b) => b.info.maxCarry - a.info.maxCarry)
    for (const source of sources) {
        this.visual.circle(containerPositions[source.id], { fill: 'red', radius: 0.5 })
        const sourcePathSearch = PathFinder.search(firstSpawnPos, { pos: containerPositions[source.id], range: 1 }, {
            plainCost: 2,
            swampCost: 2,
            roomCallback: function (roomName) {
                return costs
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

        structures.road.push(...path)
        for (const pos of path) {
            basePlan[`lv3`].push(pos.packPos('road'))
            costs.set(pos.x, pos.y, ROAD_COST)
        }
    }

    // remove roads which are not connected
    for (const pos of structures.road) {
        const adjacents = pos.getAtRange(1)
        let connected = false
        for (const adjacent of adjacents) {
            if (costs.get(adjacent.x, adjacent.y) === 1) {
                connected = true
                break
            }
        }
        if (connected) {
            basePlan['lv4'].push(pos.packPos('road'))
        }
    }

    // roads to mineral + extractor
    structures.extractor.push(this.mineral.pos)
    const mineralPathSearch = PathFinder.search(firstSpawnPos, { pos: mineralContainerPos, range: 1 }, {
        plainCost: 2,
        swampCost: 2,
        roomCallback: function (roomName) {
            return costs
        },
        maxOps: 10000,
        maxRooms: 1
    })
    if (mineralPathSearch.incomplete) {
        console.log('cannot find roads')
        return { basePlan: basePlan, cost: Infinity }
    }

    const mineralPath = mineralPathSearch.path

    structures.road.push(...mineralPath)
    for (const pos of mineralPath) {
        basePlan[`lv6`].push(pos.packPos('road'))
        costs.set(pos.x, pos.y, ROAD_COST)
    }

    // min-cut
    const mincutFloodFill = this.floodFill(mincutSources, { maxLevel: 3, costMatrix: inputCosts })
    const sourcePositions = [...mincutSources, ...mincutFloodFill.positions[1], ...mincutFloodFill.positions[2], ...mincutFloodFill.positions[3]]

    const nearPoses = []
    for (const pos of sourcePositions) {

        // this.visual.circle(pos, { fill: 'blue', radius: 0.5, opacity: 0.3 })
        for (const posNear of pos.getAtRange(3)) {
            nearPoses.push(posNear)
        }
    }

    const mincutCostMap = new PathFinder.CostMatrix
    const terrain = this.getTerrain()
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            if (terrain.get(x, y) === 1) {
                mincutCostMap.set(x, y, WALL_COST)
                continue
            }
            // this.visual.text(floodFillCosts.get(x, y), x, y)
            const cost = 1 + (floodFillCosts.get(x, y) >> 2)
            mincutCostMap.set(x, y, Math.min(cost, 254))
        }
    }

    const mincut = this.mincutToExit(nearPoses, mincutCostMap)
    const cuts = mincut.cuts.map((cut) => {
        const coord = parseVerticeToPos(cut)
        return new RoomPosition(coord.x, coord.y, this.name)
    })
    const insides = mincut.insides
    const outsides = mincut.outsides.map((outside) => {
        const coord = parseVerticeToPos(outside)
        return new RoomPosition(coord.x, coord.y, this.name)
    })

    let cost = 0
    const checkRampart = new PathFinder.CostMatrix
    const storagePos = structures.storage[0]
    const costsForRampart = costs.clone()
    const RAMPART_ROAD_COST = 5
    for (let x = 0; x <= 49; x++) {
        for (let y = 0; y <= 49; y++) {
            // this.visual.text(costs.get(x, y), x, y,{font:0.5})
            if (costsForRampart.get(x, y) === ROAD_COST) {
                costsForRampart.set(x, y, RAMPART_ROAD_COST)
            }
            // this.visual.text(costsForRampart.get(x, y), x, y, { font: 0.5 })
        }
    }

    for (const pos of outsides) {
        costsForRampart.set(pos.x, pos.y, 255)
        // this.visual.circle(pos, { fill: 'red', radius:0.5 })
    }

    for (const pos of cuts) {
        // this.visual.circle(pos, { fill: 'yellow', radius: 0.5 })
        structures.road.push(pos)
        basePlan[`lv6`].push(pos.packPos('road'))
        costsForRampart.set(pos.x, pos.y, ROAD_COST)
        costs.set(pos.x, pos.y, ROAD_COST)
    }

    for (const pos of cuts) {
        const rampartPathSearch = PathFinder.search(storagePos, { pos: pos, range: 0 }, {
            plainCost: 15,
            swampCost: 15,
            roomCallback: function (roomName) {
                return costsForRampart
            },
            maxOps: 10000,
            maxRooms: 1
        })
        if (rampartPathSearch.incomplete) {
            console.log('cannot find roads to rampart')
            return { basePlan: basePlan, cost: Infinity }
        }
        const rampartPath = rampartPathSearch.path
        for (const pathPos of rampartPath) {
            structures.road.push(pathPos)
            costs.set(pathPos.x, pathPos.y, ROAD_COST)
            basePlan[`lv6`].push(pathPos.packPos('road'))
            costsForRampart.set(pathPos.x, pathPos.y, ROAD_COST)
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
    const ramparts = [...structures.rampart]
    const towerPosCandidates = [...mincutFloodFill.positions[1].filter(pos => {
        if (costs.get(pos.x, pos.y) > 0) {
            return false
        }
        for (const posNear of pos.getAtRange(1)) {
            if (costs.get(posNear.x, posNear.y) === 1) {
                return true
            }
        }
        return false
    }),
    ...floodFillResults
    ]

    while (structures.tower.length < 6) {
        if (structures.tower.length === 0) {
            const rampartPos = ramparts[0]
            const towerPos = rampartPos.findClosestByRange(towerPosCandidates)
            structures.tower.push(towerPos)
            const index = towerPosCandidates.indexOf(towerPos)
            towerPosCandidates.splice(index, 1)
            continue
        }
        let rampartMin = undefined
        let minDamage = Infinity
        for (const rampartPos of ramparts) {
            let damage = 0
            for (const pos of structures.tower) {
                damage += pos.calcTowerDamage(rampartPos)
            }
            if (damage < minDamage) {
                minDamage = damage
                rampartMin = rampartPos
            }
        }
        if (rampartMin) {
            const towerPos = rampartMin.findClosestByRange(towerPosCandidates)
            structures.tower.push(towerPos)
            const index = towerPosCandidates.indexOf(towerPos)
            towerPosCandidates.splice(index, 1)
        }
    }

    structures.extension.push(...towerPosCandidates.filter(pos => costs.get(pos.x, pos.y) === 255).splice(0, 60))

    // sort extensions by range to first spawn
    structures.extension.sort((a, b) => a.getRangeTo(firstSpawnPos) - b.getRangeTo(firstSpawnPos))

    // packPos
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

Room.prototype.getBasePlanByPos = function (pos) {
    const costs = this.getCostMatrixForBasePlan()

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

Room.prototype.getCostMatrixForBasePlan = function () {
    if (this.heap._getCostMatrixForBasePlan) {
        return this.heap._getCostMatrixForBasePlan
    }
    const costs = this.basicCostMatrixForRoomPlan.clone()

    for (let x = 0; x <= 49; x++) {
        for (let y = 0; y <= 49; y++) {
            const pos = new RoomPosition(x, y, this.name)
            if (!pos.isConnected()) {
                this.visual.circle(x, y, { fill: 'yellow', radius: 0.5 })
                if (costs.get(x, y) < DISCONNECTED_COST) {
                    costs.set(x, y, DISCONNECTED_COST)
                }
            }
        }
    }

    return this.heap._getCostMatrixForBasePlan = costs
}

Room.prototype.getFirstAnchorsByDT = function (costs, numFirstAnchor) {
    if (this.heap.possibleAnchors && this.heap.possibleAnchors.length > 0) {
        return this.heap.possibleAnchors
    }

    const DT = this.getDistanceTransform()
    const result = []

    for (i = 25; i > 2; i--) {
        for (const pos of DT[i]) {
            const anchor = pos.getClusterAnchor(costs)
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

RoomPosition.prototype.getLabAnchor = function (costs, LABS_STAMP) {
    const anchor = {}
    anchor.pos = this

    const area = [this]
    for (const vector of LABS_STAMP) {
        const x = this.x + vector.x
        const y = this.y + vector.y
        if (!isValidCoord(x, y) || costs.get(x, y) > 0) {
            return false
        }
        area.push(new RoomPosition(x, y, this.roomName))
    }

    this.area = area

    return anchor
}

RoomPosition.prototype.getClusterAnchor = function (costs) {
    const anchor = {}
    anchor.pos = this

    const area = [this]
    for (const vector of CLUSTER_STAMP) {
        const x = this.x + vector.x
        const y = this.y + vector.y
        if (!isValidCoord(x, y) || costs.get(x, y) > 0) {
            return false
        }
        area.push(new RoomPosition(x, y, this.roomName))
    }

    this.area = area

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
            if (this.heap.basePlan) {
                return this.heap.basePlan
            }
            if (!this.memory.basePlan) {
                return undefined
            }
            return this.heap.basePlan = this.unpackBasePlan(this.memory.basePlan)
        }
    },
    basicCostMatrixForRoomPlan: {
        get() {
            if (this.heap.basicCostMatrixForRoomPlan) {
                return this.heap.basicCostMatrixForRoomPlan
            }
            const costs = new PathFinder.CostMatrix;
            const terrain = this.getTerrain()
            for (const exit of this.find(FIND_EXIT)) {
                for (const pos of exit.getInRange(4)) {
                    costs.set(pos.x, pos.y, NEAR_EXIT_COST)
                }
            }
            for (let x = 0; x < 50; x++) {
                for (let y = 0; y < 50; y++) {
                    if (terrain.get(x, y) === 1) {
                        costs.set(x, y, WALL_COST)
                    }
                }
            }
            return this.heap.basicCostMatrixForRoomPlan = costs
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

    const positionsByLevel = {}

    const START_COST = 150

    // Set the initial costMatrix values for each position in the room
    for (let x = 0; x <= 49; x++) {
        for (let y = 0; y <= 49; y++) {
            // set 255 to wall
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                costMatrix.set(x, y, WALL_COST);
                continue;
            }

            // set 255 to room edges
            if (x === 0 || x === 49 || y === 0 || y === 49) {
                costMatrix.set(x, y, EDGE_COST);
                continue;
            }

            // set START_COST to everything else
            if (costMatrix.get(x, y) < START_COST) {
                costMatrix.set(x, y, START_COST);
            }
        }
    }

    // Set the cost to 0 for each source position and add them to the queue
    const allPositions = []

    for (const source of sources) {
        allPositions.push(source)
        costMatrix.set(source.x, source.y, 0);
        queue.push(source);
    }

    // Start the flood-fill algorithm
    while (queue.length) {
        const currentPos = queue.shift();

        // Get neighboring positions
        for (const vector of adjacents) {
            const x = currentPos.x + vector.x
            const y = currentPos.y + vector.y
            if (!isValidCoord(x, y)) {
                continue
            }

            if (costMatrix.get(x, y) === START_COST && costMatrix.get(currentPos.x, currentPos.y) < maxLevel) {
                // Set the cost to the current position's cost plus 1
                const neighbor = new RoomPosition(x, y, this.name)
                const level = costMatrix.get(currentPos.x, currentPos.y) + 1
                positionsByLevel[level] = positionsByLevel[level] || []
                costMatrix.set(x, y, level);
                queue.push(neighbor);
                allPositions.push(neighbor)
                positionsByLevel[level].push(neighbor)
            }
        }
    }

    return { positions: positionsByLevel, allPositions: allPositions, costMatrix: costMatrix }
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

RoomPosition.prototype.calcTowerDamage = function (target) { //target은 roomPosition 혹은 roomPosition 가지는 Object
    const targetPos = target.pos || target
    const range = this.getRangeTo(targetPos)
    if (range <= 5) {
        return 600
    }
    if (range >= 20) {
        return 150
    }
    return 750 - 30 * range
}