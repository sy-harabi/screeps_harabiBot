const DT_VISUAL = false
const REGION_VISUAL = true
const MINCUT_COSTS_VISUAL = false
const MINCUT_VISUAL = false
const COSTS_VISUAL = false
const CANDIDATE_VISUAL = false
const BASE_PLAN_VISUAL = true

const FAST_OPTIMIZE = true

const REGION_SIZE_MIN = 1
const REGION_SIZE_MAX = 10
const REGION_NUM_MAX = 15

const DOUBLE_LAYER = true

const REPAIR_POS_RANGE = 4
const NUM_INSIDE = 140

const RAMPART_NUM_MAX = 100
const RAMPART_NUM_MIN = 20

const ENOUGH_DISTANCE_TO_EXIT = 15

const WALL_COST = 255
const STRUCTURE_COST = 255
const EXIT_COST = 255

const NEAR_EXIT_COST = 153
const OUTSIDE_COST = 152
const CUT_COST = 151
const DANGER_POS_COST = 150
const REPAIR_POS_COST = 149

const WORKSPACE_COST = 5
const ROAD_COST = 1
const INSIDE_COST = 0

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

Room.prototype.optimizeBasePlan = function () {

  if (this._optimizeBasePlan === true) {
    return
  }
  this._optimizeBasePlan = true

  data.info = false

  if (this.heap.regions === undefined) {
    this.heap.regions = this.getRegions()
    if (!FAST_OPTIMIZE) {
      return
    }
  }

  this.heap.basePlanScore = this.heap.basePlanScore || 0
  this.heap.bestBasePlan = this.heap.bestBasePlan || undefined

  if (this.heap.region || this.heap.regions.length) {
    this.heap.region = this.heap.region || this.heap.regions.shift()
    const region = this.heap.region
    if (region.length > 1) {
      this.visual.softShell(region, { fill: 'magenta', strokeWidth: 0.1, opacity: 0.6 })
    } else {
      this.visual.circle(region[0], { fill: 'magenta', radius: 0.5, opacity: 0.6 })
    }

    if (this.heap.regions.length) {
      if (REGION_VISUAL) {
        for (const region of this.heap.regions) {
          if (region.length > 1) {
            this.visual.softShell(region, { fill: 'grey', stroke: 'grey', opacity: 0.2 })
          } else {
            this.visual.circle(region[0], { fill: 'grey', radius: 0.5 })
          }
        }
        this.regionVisual = true
      }
    }

    const result = this.getBasePlanByRegion(this.heap.region)

    if (result === ERR_TIRED) {
      return
    }

    if (result === ERR_NOT_FOUND) {
      delete this.heap.basePlan
      delete this.memory.basePlan
    }

    this.memory.basePlan = result.basePlan
    this.memory.basePlanScore = result.score

    if (BASE_PLAN_VISUAL) {
      delete this.heap.basePlan
      this.visual.text('score: ' + this.memory.basePlanScore, 25, 48)
      this.visualizeBasePlan()
    }

    if (result.score > this.heap.basePlanScore) {
      this.heap.bestBasePlan = result.basePlan
      this.heap.basePlanScore = result.score
    }

    delete this.heap.basePlan
    delete this.memory.basePlan

    return ERR_BUSY
  }

  this.memory.basePlan = this.heap.bestBasePlan
  this.memory.basePlanScore = this.heap.basePlanScore

  if (BASE_PLAN_VISUAL && this.memory.basePlanScore > 0) {
    delete this.heap.basePlan
    this.visual.text('score: ' + this.memory.basePlanScore, 25, 48)
    this.visualizeBasePlan()
  }
  return OK
}

Room.prototype.getBasePlanBySpawn = function () {
  const spawn = this.structures.spawn[0]
  if (!spawn) {
    return ERR_INVALID_TARGET
  }
  return this.getBasePlanByPos(spawn.pos)
}

Room.prototype.getBasePlanByPos = function (pos) {
  const costs = this.getCostsForMincut(ENOUGH_DISTANCE_TO_EXIT)

  const mincut = this.mincutWithSufficientInside([pos], costs, NUM_INSIDE)
  delete this.heap.mincut
  delete this.heap.region

  if (COSTS_VISUAL) {
    for (let x = 0; x < 50; x++) {
      for (let y = 0; y < 50; y++) {
        this.visual.text(mincut.costsForBasePlan.get(x, y), x, y, { font: 0.5 })
      }
    }
  }
  const anchorPos = new RoomPosition(pos.x + 1, pos.y + 1, this.name)

  let result = this.getBasePlanAfterMincut(anchorPos, mincut.costsForBasePlan, mincut, costs)

  if (result.score === 0) {
    const region = [pos]
    this.getBasePlanByRegion(region)
    result = this.getBasePlanByRegion(region)
  }

  this.memory.basePlan = result.basePlan

  if (BASE_PLAN_VISUAL) {
    delete this.heap.basePlan
    this.visual.text('score: ' + result.score, 25, 48)
    this.visualizeBasePlan()
  }

  return OK
}

Room.prototype.getBasePlanByRegion = function (region) {
  const costs = this.getCostsForMincut(ENOUGH_DISTANCE_TO_EXIT)

  if (!this.heap.mincut) {
    const mincut = this.mincutWithSufficientInside(region, costs, NUM_INSIDE)
    if (!mincut) {
      delete this.heap.region
      return ERR_NOT_FOUND
    }
    this.heap.mincut = mincut
    if (!FAST_OPTIMIZE) {
      return ERR_TIRED
    }
  }

  const mincut = this.heap.mincut
  delete this.heap.mincut
  delete this.heap.region

  if (COSTS_VISUAL) {
    for (let x = 0; x < 50; x++) {
      for (let y = 0; y < 50; y++) {
        this.visual.text(mincut.costsForBasePlan.get(x, y), x, y, { font: 0.5 })
      }
    }
  }

  const insidesDT = this.getDistanceTransform(false, mincut.insides)
  const positionsByLevel = insidesDT.positions
  const levels = Object.keys(positionsByLevel).sort((a, b) => b - a)

  let candidates = []
  for (const level of levels) {
    if (level < 3) {
      break
    }
    candidates.push(...positionsByLevel[level])
  }

  candidates = _.shuffle(candidates).slice(0, 20)

  let candidate = undefined
  let minPathSum = Infinity

  for (const pos of candidates) {
    const floodFill = this.floodFill([pos])
    const costs = floodFill.costs
    let pathSum = 0
    for (const cut of mincut.cuts) {
      pathSum += costs.get(cut.x, cut.y)
    }
    if (CANDIDATE_VISUAL) {
      this.visual.text(pathSum, pos, { font: 0.5 })
    }
    if (pathSum < minPathSum) {
      candidate = pos
      minPathSum = pathSum
    }
  }
  if (CANDIDATE_VISUAL) {
    this.visual.circle(candidate, { fill: 'green', radius: 1 })
  }

  return this.getBasePlanAfterMincut(candidate, mincut.costsForBasePlan, mincut, costs)
}

Room.prototype.getCostsForMincut = function (maxLevel) {
  if (this.heap._costsForMincut) {
    return this.heap._costsForMincut
  }

  const costs = new PathFinder.CostMatrix
  const terrain = this.getTerrain()

  const floodFill = this.floodFill(this.find(FIND_EXIT))
  const positionsByLevel = floodFill.positions
  maxLevel = maxLevel || Math.max(...Object.keys(positionsByLevel))
  const floodFillCosts = floodFill.costs

  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
        costs.set(x, y, WALL_COST)
        continue
      }
      const cost = 1 + Math.max(1 + maxLevel - floodFillCosts.get(x, y), 0)
      costs.set(x, y, cost)
    }
  }

  for (const exitPos of this.find(FIND_EXIT)) {
    for (const pos of exitPos.getInRange(1)) {
      if (costs.get(pos.x, pos.y) === WALL_COST) {
        continue
      }
      costs.set(pos.x, pos.y, EXIT_COST)
    }
  }

  if (MINCUT_COSTS_VISUAL) {
    for (let x = 0; x < 50; x++) {
      for (let y = 0; y < 50; y++) {
        this.visual.text(costs.get(x, y), x, y, { font: 0.5 })
      }
    }

  }

  return this.heap._costsForMincut = costs
}

Room.prototype.mincutWithSufficientInside = function (sources, costs, numPositions) {
  const weightedFloodFill = this.getWeightedFloodFill(sources, costs)

  const positionsByLevel = weightedFloodFill.positions
  const levels = Object.keys(positionsByLevel).sort((a, b) => a - b)

  let mincutSources = [...sources]

  for (const level of levels) {
    if (mincutSources.length >= numPositions) {
      break
    }
    const positions = positionsByLevel[level]
    mincutSources.push(...positions)
  }

  const costsForFloodFill = new PathFinder.CostMatrix
  for (const exitPos of this.find(FIND_EXIT)) {
    for (const pos of exitPos.getInRange(2)) {
      costsForFloodFill.set(pos.x, pos.y, EXIT_COST)
    }
  }

  const floodFill = this.floodFill(mincutSources, { maxLevel: 5, costMatrix: costsForFloodFill })
  mincutSources = floodFill.allPositions

  const terrain = this.terrain

  let i = 0
  while (true) {

    const mincut = this.mincutToExit(mincutSources, costs)

    if (mincut === ERR_NOT_FOUND) {
      return false
    }

    i++

    if (i > 10) {
      break
    }

    const cuts = []
    const insides = []
    const outsides = []

    const regionCosts = new PathFinder.CostMatrix
    const costsForBasePlan = new PathFinder.CostMatrix

    mincut.outsides.forEach(pos => {
      if (costs.get(pos.x, pos.y) > OUTSIDE_COST) {
        regionCosts.set(pos.x, pos.y, costs.get(pos.x, pos.y))
        costsForBasePlan.set(pos.x, pos.y, costs.get(pos.x, pos.y))
        return
      }
      regionCosts.set(pos.x, pos.y, OUTSIDE_COST)
      costsForBasePlan.set(pos.x, pos.y, OUTSIDE_COST)

      outsides.push(pos)
    });

    mincut.cuts.forEach(pos => {
      costsForBasePlan.set(pos.x, pos.y, CUT_COST)
      regionCosts.set(pos.x, pos.y, CUT_COST)
      cuts.push(pos)
    })

    const secondLayer = []
    for (const cut of cuts) {
      for (const near of cut.getInRange(REPAIR_POS_RANGE)) {
        if (terrain.get(near.x, near.y) === TERRAIN_MASK_WALL) {
          continue
        }
        const cost = regionCosts.get(near.x, near.y)
        if (cost >= CUT_COST) {
          continue
        }
        const range = near.getRangeTo(cut)

        // second layer
        if (range === 1) {
          secondLayer.push(near)
          regionCosts.set(near.x, near.y, CUT_COST)
          costsForBasePlan.set(near.x, near.y, CUT_COST)
          continue
        }

        if (cost >= DANGER_POS_COST) {
          continue
        }
        if (range <= 2) {
          regionCosts.set(near.x, near.y, DANGER_POS_COST)
          costsForBasePlan.set(near.x, near.y, DANGER_POS_COST)
          continue
        }
        regionCosts.set(near.x, near.y, REPAIR_POS_COST)
        costsForBasePlan.set(near.x, near.y, REPAIR_POS_COST)
      }
    }

    mincut.insides.forEach(pos => {
      if ([REPAIR_POS_COST, DANGER_POS_COST, CUT_COST].includes(regionCosts.get(pos.x, pos.y))) {
        return
      }
      for (const near of pos.getAtRange(2)) {
        if ([OUTSIDE_COST, NEAR_EXIT_COST].includes(regionCosts.get(near.x, near.y))) {
          costsForBasePlan.set(pos.x, pos.y, WALL_COST)
          return
        }
      }
      for (const near of pos.getAtRange(3)) {
        if ([OUTSIDE_COST, NEAR_EXIT_COST].includes(regionCosts.get(near.x, near.y))) {
          costsForBasePlan.set(pos.x, pos.y, WALL_COST)
          return
        }
      }
      insides.push(pos)
    })

    if (insides.length >= NUM_INSIDE) {

      if (MINCUT_VISUAL) {
        for (const cut of cuts) {
          this.visual.rect(cut.x - 0.5, cut.y - 0.5, 1, 1, { fill: 'yellow', radius: 0.5, opacity: 0.3 })
        }

        for (const inside of insides) {
          this.visual.rect(inside.x - 0.5, inside.y - 0.5, 1, 1, { fill: 'blue', radius: 0.5, opacity: 0.3 })
        }

        for (const outside of outsides) {
          this.visual.rect(outside.x - 0.5, outside.y - 0.5, 1, 1, { fill: 'red', radius: 0.5, opacity: 0.3 })
        }
      }

      return { cuts, secondLayer, outsides, insides, costsForBasePlan }
    }

    mincutSources = this.floodFill(mincutSources, { maxLevel: 3, costMatrix: costsForFloodFill }).allPositions
  }
}

Room.prototype.getRegions = function () {
  const result = []

  const importantRegions = []

  const importantPoints = [this.controller.pos, ...this.sources.map(source => source.pos)]

  for (const importantPoint of importantPoints) {
    const newRegions = importantRegions.map(region => {
      const res = [...region]
      res.push(importantPoint)
      return res
    })
    importantRegions.push(...newRegions)
    importantRegions.push([importantPoint])
  }

  importantRegions.forEach(region => {
    if (region.length === 1) {
      result.push(region)
      return
    }
    const regionConnected = []
    for (i = 0; i < region.length; i++) {
      for (j = i + 1; j < region.length; j++) {
        const start = region[i]
        const end = region[j]
        const path = PathFinder.search(start, { pos: end, range: 1 }, {
          plainCost: 1,
          swampCost: 1,
          maxRooms: 1,
        }).path
        regionConnected.push(...path)
      }
    }
    result.push(regionConnected)
  })

  // create CostMatrix for scoring points

  const DT = this.distanceTransform
  DT.maxLevel = Math.max(...Object.keys(DT.positions))

  const exitFF = this.floodFill(this.find(FIND_EXIT))
  exitFF.maxLevel = Math.max(...Object.keys(exitFF.positions))

  const sourceFF = {}
  sourceFF.costs = new PathFinder.CostMatrix
  sourceFF.positions = {}
  for (let i = 0; i < this.sources.length; i++) {
    const source = this.sources[i]
    const FF = this.floodFill([source.pos])
    for (let x = 0; x < 50; x++) {
      for (let y = 0; y < 50; y++) {
        const cost = sourceFF.costs.get(x, y) + FF.costs.get(x, y)
        sourceFF.costs.set(cost)
        if (i === this.sources.length - 1) {
          sourceFF.positions[cost] = sourceFF.positions[cost] || []
          sourceFF.positions[cost].push(new RoomPosition(x, y, this.name))
        }
      }
    }
  }
  sourceFF.maxLevel = Math.max(...Object.keys(sourceFF.positions))

  const controllerFF = this.floodFill([this.controller.pos])
  controllerFF.maxLevel = Math.max(...Object.keys(controllerFF.positions))

  DT.weight = 1
  exitFF.weight = 1
  sourceFF.weight = -1
  controllerFF.weight = -2

  const items = [
    DT,
    exitFF,
    sourceFF,
    controllerFF
  ]

  const weightSum = items.map(a => Math.abs(a.weight)).reduce((a, b) => a + b)

  const costs = new PathFinder.CostMatrix
  const positions = {}
  const terrain = this.terrain
  let max = 0
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
        continue
      }
      if (exitFF.costs.get(x, y) === 0) {
        continue
      }
      let cost = 0
      for (const item of items) {
        if (item.weight > 0) {
          cost += Math.abs(item.weight) * item.costs.get(x, y) / item.maxLevel
          continue
        }
        cost += Math.abs(item.weight) * (item.maxLevel - item.costs.get(x, y)) / item.maxLevel
      }
      cost = Math.floor(cost * 50 / weightSum)

      costs.set(x, y, cost)
      if (cost < 255 && cost > max) {
        max = cost
      }
      positions[cost] = positions[cost] || []
      positions[cost].push(new RoomPosition(x, y, this.name))
    }
  }

  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      const cost = costs.get(x, y)
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
        continue
      }
      const hue = 180 * (1 - cost / max)
      const color = `hsl(${hue},100%,60%)`
      this.visual.text(cost, x, y, { font: 0.5 })
      this.visual.rect(x - 0.5, y - 0.5, 1, 1, { fill: color, opacity: 0.4 })
    }
  }

  const levels = Object.keys(positions).sort((a, b) => b - a)

  const costsForCheck = new PathFinder.CostMatrix
  outer:
  for (const level of levels) {
    if (level < 3) {
      break
    }

    for (const pos of positions[level]) {
      if (costsForCheck.get(pos.x, pos.y) > 0) {
        continue
      }
      const region = []
      let queue = [pos]
      let nextQueue = []
      let levelNow = level
      const costMatrixForCheckRegion = new PathFinder.CostMatrix
      getRegion:
      while (levelNow > 0) {
        if (region.length >= REGION_SIZE_MAX) {
          break
        }
        const floodFillResult = []
        const costMatrixForCheck = new PathFinder.CostMatrix
        if (levelNow < level) {
          queue = nextQueue
        }
        nextQueue = []

        for (const pos of queue) {
          costMatrixForCheck.set(pos.x, pos.y, 1)
          costMatrixForCheckRegion.set(pos.x, pos.y, 1)
          floodFillResult.push(pos)
        }

        let isRegion = true
        floodFill:
        while (queue.length > 0) {
          const node = queue.shift()
          const adjacents = node.getAtRange(1)
          for (const adjacent of adjacents) {
            if (costMatrixForCheck.get(adjacent.x, adjacent.y) > 0) {
              continue
            }
            costMatrixForCheck.set(adjacent.x, adjacent.y, 1)
            if (costMatrixForCheckRegion.get(adjacent.x, adjacent.y) > 0) {
              continue
            }
            const adjacentCost = costs.get(adjacent.x, adjacent.y)
            if (adjacentCost === 255) {
              continue
            }
            if (adjacentCost > levelNow) {
              isRegion = false
              break floodFill
            }
            if (adjacentCost < levelNow) {
              nextQueue.push(adjacent)
              continue
            }
            floodFillResult.push(adjacent)
            queue.push(adjacent)
            costMatrixForCheckRegion.set(adjacent.x, adjacent.y, 1)
            costsForCheck.set(adjacent.x, adjacent.y, 1)
          }
        }
        if (!isRegion) {
          break getRegion
        } else {
          for (const pos of floodFillResult) {
            if (region.length >= REGION_SIZE_MAX) {
              break
            }
            region.push(pos)
          }
        }
        levelNow--
      }
      if (region.length > 1) {
        this.visual.text(region.length, pos)
        result.push(region)
      }
      if (result.length >= REGION_NUM_MAX) {
        break outer
      }
    }
  }

  if (REGION_VISUAL && !this.regionVisual) {
    for (const region of result) {
      this.visual.softShell(region, { fill: 'lime', stroke: 'lime' })
    }
    this.regionVisual = true
  }

  return this.heap._regions = result
}

Room.prototype.getBasePlanAfterMincut = function (pos, inputCosts, mincut, costsForMincut) {
  console.log('---------------------------------------------------')
  console.log('basePlan start')

  const basePlan = {}
  for (let i = 1; i <= 8; i++) {
    basePlan[`lv${i}`] = []
  }

  if (!pos) {
    console.log('cannot find cluster anchor')
    return { basePlan, score: 0 }
  }
  const firstAnchor = pos.getClusterAnchor(inputCosts)

  if (!firstAnchor) {
    return { basePlan, score: 0 }
  }
  const costs = inputCosts.clone()

  const costsForRoad = new PathFinder.CostMatrix

  if (Game.cpu.bucket < 1000) {
    console.log(`bucket is not enough`)
    return { basePlan: basePlan, score: 0 }
  }

  if (!firstAnchor) {
    console.log('cannot get 1st anchor')
    return { basePlan: basePlan, score: 0 }
  }

  //variable and array settings
  const structures = {}
  for (const structureType of Object.keys(CONSTRUCTION_COST)) {
    structures[structureType] = []
  }
  const linkPositions = {}

  //mincut
  const outsides = mincut.outsides

  const secondLayer = mincut.secondLayer

  const cuts = mincut.cuts

  const insides = mincut.insides
  // fill First anchor

  const firstSpawnPos = new RoomPosition(firstAnchor.pos.x, firstAnchor.pos.y - 1, this.name)
  for (const stamp of CLUSTER_STAMP) {
    const pos = new RoomPosition(firstAnchor.pos.x + stamp.x, firstAnchor.pos.y + stamp.y, this.name)
    structures[stamp.structureType].push(pos)
    if (stamp.structureType === 'road') {
      basePlan[`lv3`].push(pos.packStructurePlan('road'))
      costs.set(pos.x, pos.y, ROAD_COST)
      costsForRoad.set(pos.x, pos.y, ROAD_COST)
      continue
    }
    costs.set(pos.x, pos.y, STRUCTURE_COST)
    costsForRoad.set(pos.x, pos.y, STRUCTURE_COST)
  }
  for (const stamp of CLUSTER_BORDER_STAMP) {
    const pos = new RoomPosition(firstAnchor.pos.x + stamp.x, firstAnchor.pos.y + stamp.y, this.name)
    if (costs.get(pos.x, pos.y) < NEAR_EXIT_COST) {
      basePlan[`lv3`].push(pos.packStructurePlan('road'))
      costs.set(pos.x, pos.y, ROAD_COST)
      costsForRoad.set(pos.x, pos.y, ROAD_COST)
    }
  }
  linkPositions.storage = structures.link[0].pack()

  // choose controller, source, mineral container & link positions

  // source
  // find closest position by Path
  const containerPositions = {}
  for (const source of this.sources.sort((a, b) => b.range.spawn - a.range.spawn)) {
    const containerPos = firstAnchor.pos.getClosestByPath(source.pos.getAtRange(1).filter(pos => !pos.isWall && costs.get(pos.x, pos.y) !== ROAD_COST))
    if (!containerPos) {
      console.log(`cannot find container pos of ${source.id}`)
      return { basePlan: basePlan, score: 0 }
    }
    containerPositions[source.id] = containerPos
    structures.container.push(containerPos)
    basePlan[`lv3`].push(containerPos.packStructurePlan('container'))
    costs.set(containerPos.x, containerPos.y, STRUCTURE_COST)
    costsForRoad.set(containerPos.x, containerPos.y, STRUCTURE_COST)

    if (containerPos.available >= 3) {
      const linkPos = firstAnchor.pos.findClosestByRange(containerPos.getAtRange(1).filter(pos => !pos.isWall && costs.get(pos.x, pos.y) !== ROAD_COST))

      if (!linkPos) {
        continue
      }

      structures.link.push(linkPos)
      linkPositions[source.id] = linkPos.pack()
      costs.set(linkPos.x, linkPos.y, STRUCTURE_COST)
      costsForRoad.set(linkPos.x, linkPos.y, STRUCTURE_COST)
    }
  }

  //mineral
  // find closest position by Path
  const mineralContainerPos = firstAnchor.pos.getClosestByPath(this.mineral.pos.getAtRange(1).filter(pos => !pos.isWall && costs.get(pos.x, pos.y) !== ROAD_COST))
  if (!mineralContainerPos) {
    console.log('no mineral container')
    return { basePlan, score: 0 }
  }
  structures.container.push(mineralContainerPos)
  basePlan[`lv6`].push(mineralContainerPos.packStructurePlan('container'))
  costs.set(mineralContainerPos.x, mineralContainerPos.y, STRUCTURE_COST)
  costsForRoad.set(mineralContainerPos.x, mineralContainerPos.y, STRUCTURE_COST)

  // controller
  // sort possible positions by path and iterate
  const possiblePositions = this.controller.pos.getInRange(2).filter(pos => !pos.isWall).sort((a, b) => a.getClosestPathLength([firstAnchor.pos]) - b.getClosestPathLength([firstAnchor.pos]))

  let controllerLinkPos = undefined
  for (const posClosestToController of possiblePositions) {
    // use floodfill to expand
    const nearClosestPositions = this.floodFill([posClosestToController], { maxLevel: 8, costMatrix: costsForRoad }).allPositions
    nearClosestPositions.push(posClosestToController)

    // filter by range to controller<=2 and sort by num of available spots
    let controllerLinkCandidates = nearClosestPositions.filter(pos => pos.getRangeTo(this.controller.pos) <= 2 && !pos.isWall && costs.get(pos.x, pos.y) !== ROAD_COST)
    controllerLinkCandidates = controllerLinkCandidates.sort((a, b) => {
      const aResult = a.getInRange(1).filter(pos => !pos.isWall).length
      const bResult = b.getInRange(1).filter(pos => !pos.isWall).length
      return bResult - aResult
    })

    controllerLinkPos = controllerLinkCandidates[0]
    if (!controllerLinkPos) {
      continue
    }
    structures.link.unshift(controllerLinkPos)
    linkPositions.controller = controllerLinkPos.pack()
    costs.set(controllerLinkPos.x, controllerLinkPos.y, STRUCTURE_COST)
    costsForRoad.set(controllerLinkPos.x, controllerLinkPos.y, STRUCTURE_COST)
    for (const pos of controllerLinkPos.getAtRange(1)) {
      if (costs.get(pos.x, pos.y) < WORKSPACE_COST) {
        costs.set(pos.x, pos.y, WORKSPACE_COST)
        costsForRoad.set(pos.x, pos.y, WORKSPACE_COST)
      }
    }
    break
  }

  if (!controllerLinkPos) {
    console.log(`cannot find container pos of controller`)
  }

  // Flood fill labs && extensions && observer, factory, nuker
  const floodFill = this.floodFill(structures.road, { costMatrix: costs, visual: false })

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

  const levels = Object.keys(floodFillPositions).sort((a, b) => a - b)
  outer:
  for (const level of levels) {
    const positions = floodFillPositions[level]
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
      // 위 1칸 아래 1칸 또는 왼쪽 1칸 오른쪽 1칸이 모두 cost가 REPAIR_POS_COST 이상이면 지나다닐 수가 없는거니까 길 깔고 넘어가
      if (costs.get(pos.x + 1, pos.y) >= REPAIR_POS_COST && costs.get(pos.x - 1, pos.y) >= REPAIR_POS_COST) {
        structures.road.push(pos)
        costs.set(pos.x, pos.y, ROAD_COST)
        costsForRoad.set(pos.x, pos.y, ROAD_COST)
        continue
      }
      if (costs.get(pos.x, pos.y + 1) >= REPAIR_POS_COST && costs.get(pos.x, pos.y - 1) >= REPAIR_POS_COST) {
        structures.road.push(pos)
        costs.set(pos.x, pos.y, ROAD_COST)
        costsForRoad.set(pos.x, pos.y, ROAD_COST)
        continue
      }

      // 중앙일 때 위 2칸 아래 2칸 또는 왼쪽 2칸 오른쪽 2칸이 모두 cost가 REPAIR_POS_COST 이상이면 지나다닐 수가 없는거니까 제외

      if (mod(pos.x + pos.y, 4) === CENTER_SUM) {
        if (costs.get(pos.x + 2, pos.y) >= REPAIR_POS_COST && costs.get(pos.x - 2, pos.y) >= REPAIR_POS_COST) {
          continue
        }
        if (costs.get(pos.x, pos.y + 2) >= REPAIR_POS_COST && costs.get(pos.x, pos.y - 2) >= REPAIR_POS_COST) {
          continue
        }
        if (costs.get(pos.x + 1, pos.y + 1) >= REPAIR_POS_COST && costs.get(pos.x - 1, pos.y - 1) >= REPAIR_POS_COST) {
          continue
        }
        if (costs.get(pos.x + 1, pos.y - 1) >= REPAIR_POS_COST && costs.get(pos.x - 1, pos.y + 1) >= REPAIR_POS_COST) {
          continue
        }
      }

      floodFillResults.push(pos)
      costs.set(pos.x, pos.y, STRUCTURE_COST)
      costsForRoad.set(pos.x, pos.y, STRUCTURE_COST)
    }
  }
  if (floodFillResults.length < 63) {
    console.log(`not enough extensions`)
    return { basePlan: basePlan, score: 0 }
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
        if (costs.get(roadPos.x, roadPos.y) <= REPAIR_POS_COST) {
          structures.road.push(roadPos)
          costs.set(roadPos.x, roadPos.y, ROAD_COST)
          costsForRoad.set(roadPos.x, roadPos.y, ROAD_COST)
        }
        continue
      }
      // 중앙 아니면 주변에 길 깔자
      if (costs.get(roadPos.x, roadPos.y) <= REPAIR_POS_COST) {
        structures.road.push(roadPos)
        costs.set(roadPos.x, roadPos.y, ROAD_COST)
        costsForRoad.set(roadPos.x, roadPos.y, ROAD_COST)
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
      const labPositions = [firstSourceLab, secondSourceLab]
      for (const pos of firstSourceLab.getInRange(2)) {
        if (numReactionLab >= 8) {
          break
        }
        if (pos.isEqualTo(firstSourceLab) || pos.isEqualTo(secondSourceLab)) {
          continue
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
      if (labPositions.length === 10) {
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
    return { basePlan: basePlan, score: 0 }
  }

  structures.observer.push(floodFillResults.pop())
  structures.nuker.push(floodFillResults.shift())

  // roads to controller
  let pathCost = 0

  const controllerPathSearch = PathFinder.search(firstSpawnPos, { pos: controllerLinkPos, range: 1 }, {
    plainCost: 2,
    swampCost: 2,
    roomCallback: function (roomName) {
      return costsForRoad
    },
    maxOps: 10000,
    maxRooms: 1
  })

  if (controllerPathSearch.incomplete) {
    console.log('cannot find roads to controller')
    return { basePlan: basePlan, score: 0 }
  }

  const path = controllerPathSearch.path
  pathCost += path.length

  for (const pos of path) {
    structures.road.push(pos)
    basePlan[`lv3`].push(pos.packStructurePlan('road'))
    costs.set(pos.x, pos.y, ROAD_COST)
    costsForRoad.set(pos.x, pos.y, ROAD_COST)
  }

  // roads to sources
  const sources = this.sources.sort((a, b) => b.info.maxCarry - a.info.maxCarry)
  for (const source of sources) {
    const sourcePathSearch = PathFinder.search(firstSpawnPos, { pos: containerPositions[source.id], range: 1 }, {
      plainCost: 2,
      swampCost: 2,
      roomCallback: function (roomName) {
        return costsForRoad
      },
      maxOps: 10000,
      maxRooms: 1
    })

    if (sourcePathSearch.incomplete) {
      console.log('cannot find roads to source')
      return { basePlan: basePlan, score: 0 }
    }

    const path = sourcePathSearch.path
    pathCost += path.length

    structures.road.push(...path)
    for (const pos of path) {
      basePlan[`lv3`].push(pos.packStructurePlan('road'))
      costs.set(pos.x, pos.y, ROAD_COST)
      costsForRoad.set(pos.x, pos.y, ROAD_COST)
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
      basePlan['lv4'].push(pos.packStructurePlan('road'))
    }
  }

  // roads to mineral + extractor
  structures.extractor.push(this.mineral.pos)
  const mineralPathSearch = PathFinder.search(firstSpawnPos, { pos: mineralContainerPos, range: 1 }, {
    plainCost: 2,
    swampCost: 2,
    roomCallback: function (roomName) {
      return costsForRoad
    },
    maxOps: 10000,
    maxRooms: 1
  })
  if (mineralPathSearch.incomplete) {
    console.log('cannot find roads to mineral')
    return { basePlan: basePlan, score: 0 }
  }

  const mineralPath = mineralPathSearch.path

  structures.road.push(...mineralPath)
  for (const pos of mineralPath) {
    basePlan[`lv6`].push(pos.packStructurePlan('road'))
    costs.set(pos.x, pos.y, ROAD_COST)
    costsForRoad.set(pos.x, pos.y, ROAD_COST)
  }

  // rampart
  const costsForGroupingRampart = new PathFinder.CostMatrix
  const rampartPositions = new Set()

  const costsForRampartRoad = costsForRoad.clone()
  for (const exit of this.find(FIND_EXIT)) {
    for (const pos of exit.getInRange(1)) {
      costsForRampartRoad.set(pos.x, pos.y, EXIT_COST)
    }
  }
  const checkRampart = new PathFinder.CostMatrix
  const storagePos = structures.storage[0]

  for (const pos of outsides) {
    costsForRampartRoad.set(pos.x, pos.y, 255)
    // this.visual.circle(pos, { fill: 'red', radius:0.5 })
  }

  let maxRampartCost = 0
  for (const pos of cuts) {
    if (costsForMincut.get(pos.x, pos.y) > maxRampartCost) {
      maxRampartCost = costsForMincut.get(pos.x, pos.y)
    }

    structures.rampart.push(pos)

    checkRampart.set(pos.x, pos.y, 1)
    costsForGroupingRampart.set(pos.x, pos.y, 2)

    rampartPositions.add(packCoord(pos.x, pos.y))
    costsForRampartRoad.set(pos.x, pos.y, ROAD_COST)
    // this.visual.circle(pos, { fill: 'yellow', radius: 0.5 })
  }

  // get rampart clusters
  const rampartClusters = []
  const CLUSTER_SIZE = 10

  for (const rampartPos of rampartPositions) {
    const cluster = []

    const coord = parseCoord(rampartPos)
    if (costsForGroupingRampart.get(coord.x, coord.y) < 2) {
      continue
    }
    costsForGroupingRampart.set(coord.x, coord.y, 1)

    cluster.push(new RoomPosition(coord.x, coord.y, this.name))
    rampartPositions.delete(rampartPos)

    const queue = [rampartPos]

    outer:
    while (queue.length > 0) {
      const node = queue.shift()
      const coord = parseCoord(node)
      const pos = new RoomPosition(coord.x, coord.y, this.name)
      const adjacents = pos.getAtRange(1)
      for (const adjacent of adjacents) {
        if (costsForGroupingRampart.get(adjacent.x, adjacent.y) < 2) {
          continue
        }

        costsForGroupingRampart.set(adjacent.x, adjacent.y, 1)

        rampartPositions.delete(packCoord(adjacent.x, adjacent.y))

        cluster.push(adjacent)
        queue.push(packCoord(adjacent.x, adjacent.y))

        if (cluster.length >= CLUSTER_SIZE) {
          break outer
        }
      }
    }
    rampartClusters.push(cluster)
  }

  rampartClusters.sort((a, b) => storagePos.getAverageRange(b) - storagePos.getAverageRange(a))

  // rampart road
  let maxRampartTravelDistance = 0
  for (const cluster of rampartClusters) {
    const rampartPathSearch = PathFinder.search(storagePos, cluster, {
      plainCost: 2,
      swampCost: 10,
      roomCallback: function (roomName) {
        return costsForRampartRoad
      },
      maxOps: 10000,
      maxRooms: 1
    })
    if (rampartPathSearch.incomplete) {
      console.log('cannot find roads to rampart')
      return { basePlan: basePlan, score: 0 }
    }
    const rampartPath = rampartPathSearch.path

    if (rampartPath.length > maxRampartTravelDistance) {
      maxRampartTravelDistance = rampartPath.length
    }

    for (const pathPos of rampartPath) {

      if (checkRampart.get(pathPos.x, pathPos.y) > 0) {
        continue
      }

      if (costs.get(pathPos.x, pathPos.y) !== ROAD_COST) {
        basePlan[`lv5`].push(pathPos.packStructurePlan('road'))
        costs.set(pathPos.x, pathPos.y, ROAD_COST)
        costsForRoad.set(pathPos.x, pathPos.y, ROAD_COST)
        costsForRampartRoad.set(pathPos.x, pathPos.y, ROAD_COST)
      }

      if (inputCosts.get(pathPos.x, pathPos.y) >= DANGER_POS_COST) {
        structures.rampart.push(pathPos)
        checkRampart.set(pathPos.x, pathPos.y, 1)
        costsForRampartRoad.set(pathPos.x, pathPos.y, ROAD_COST)
      }

    }
  }

  if (DOUBLE_LAYER) {
    for (const pos of secondLayer) {

      if (checkRampart.get(pos.x, pos.y) > 0) {
        continue
      }

      structures.rampart.push(pos)
      checkRampart.set(pos.x, pos.y, 1)
    }

    for (const pos of secondLayer) {
      if (costs.get(pos.x, pos.y) === ROAD_COST) {
        continue
      }

      for (const vector of CROSS) {
        if (checkRampart.get(pos.x + vector.x, pos.y + vector.y) === 0) {
          basePlan[`lv5`].push(pos.packStructurePlan('road'))
          costs.set(pos.x, pos.y, ROAD_COST)
          costsForRoad.set(pos.x, pos.y, ROAD_COST)
          break
        }
      }
    }
  }

  // place towers
  const ramparts = [...cuts]
  let towerPosCandidates = insides.filter(pos => costs.get(pos.x, pos.y) === 0)
  towerPosCandidates.push(...floodFillResults)

  while (structures.tower.length < 6) {
    if (structures.tower.length === 0) {
      const rampartPos = ramparts[0]

      const range = rampartPos.getClosestRange(towerPosCandidates)
      const candidates = towerPosCandidates.filter(pos => pos.getRangeTo(rampartPos) <= range)
      const towerPos = candidates.sort((a, b) => a.getAverageRange(ramparts) - b.getAverageRange(ramparts))[0]

      structures.tower.push(towerPos)

      costs.set(towerPos.x, towerPos.y, STRUCTURE_COST)
      costsForRoad.set(towerPos.x, towerPos.y, STRUCTURE_COST)

      towerPosCandidates = towerPosCandidates.filter(pos => !pos.isEqualTo(towerPos))
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

      const range = rampartMin.getClosestRange(towerPosCandidates)
      const candidates = towerPosCandidates.filter(pos => pos.getRangeTo(rampartMin) <= range)

      const towerPos = candidates.sort((a, b) => a.getAverageRange(ramparts) - b.getAverageRange(ramparts))[0]

      structures.tower.push(towerPos)

      costs.set(towerPos.x, towerPos.y, STRUCTURE_COST)
      costsForRoad.set(towerPos.x, towerPos.y, STRUCTURE_COST)

      towerPosCandidates = towerPosCandidates.filter(pos => !pos.isEqualTo(towerPos))
    }
  }

  // road to tower
  for (const towerPos of structures.tower) {
    const towerPathSearch = PathFinder.search(firstSpawnPos, { pos: towerPos, range: 1 }, {
      plainCost: 2,
      swampCost: 2,
      roomCallback: function (roomName) {
        return costsForRoad
      },
      maxOps: 10000,
      maxRooms: 1
    })

    if (towerPathSearch.incomplete) {
      console.log('cannot find roads to tower')
      return { basePlan: basePlan, score: 0 }
    }

    const path = towerPathSearch.path

    structures.road.push(...path)
    for (const pos of path) {
      basePlan[`lv4`].push(pos.packStructurePlan('road'))
      costs.set(pos.x, pos.y, ROAD_COST)
      costsForRoad.set(pos.x, pos.y, ROAD_COST)
    }
  }

  const extensionPositions = towerPosCandidates.filter(pos => costs.get(pos.x, pos.y) === STRUCTURE_COST)
  structures.extension.push(...extensionPositions)
  this.visual.text('numExtension: ' + structures.extension.length, 25, 47)



  // sort extensions by range to first spawn
  structures.extension.sort((a, b) => a.getRangeTo(firstSpawnPos) - b.getRangeTo(firstSpawnPos))

  // packStructurePlan
  basePlan.linkPositions = linkPositions

  for (const structureType of Object.keys(CONTROLLER_STRUCTURES)) {
    const structurePositions = structures[structureType]

    if (structureType === 'road') {
      continue
    }

    if (structureType === 'rampart') {
      for (const pos of structurePositions) {
        basePlan[`lv5`].push(pos.packStructurePlan('rampart'))
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
          basePlan[`lv${i}`].push(pos.packStructurePlan(structureType))
        }
      }
    }
  }

  for (let i = 1; i <= 8; i++) {
    basePlan[`lv${i}`] = [...new Set(basePlan[`lv${i}`])]
    for (let j = 1; j < i; j++) {
      basePlan[`lv${i}`] = basePlan[`lv${i}`].filter(packed => !basePlan[`lv${j}`].includes(packed))
    }
  }

  const numRamparts = Math.floor(structures.rampart.length / (DOUBLE_LAYER ? 2 : 1))
  const rampartEfficiency = Math.max(0, Math.min(1, (RAMPART_NUM_MAX - numRamparts) / (RAMPART_NUM_MAX - RAMPART_NUM_MIN)))
  // rampart가 최대 RAMPART_NUM_MAX개쯤 있다고 생각하고 계산한 비율. 높으면 좋음
  // rampart 최소는 RAMPART_NUM_MIN개라고 생각
  const distanceToExits = (16 - maxRampartCost) / 15
  // 가장 exit으로부터 가까운 rampart의 거리. 최대 15라고 생각함.
  // 1에 가까울수록 제일 가까운 rampart도 거리가 15에 가까운 것.

  const maxTravelDistance = Math.max(0, Math.min(1, (30 - maxRampartTravelDistance) / (20)))

  let controllerScore = 0
  for (const adjacent of this.controller.pos.getAtRange(1)) {
    if (adjacent.isWall) {
      continue
    }
    if (inputCosts.get(adjacent.x, adjacent.y) < OUTSIDE_COST) {
      controllerScore += 1
      this.visual.circle(adjacent, { fill: 'cyan', radius: 1 })
      break
    }
  }

  let sourceScore = 0
  for (const source of this.sources) {
    inner:
    for (const adjacent of source.pos.getAtRange(1)) {
      if (adjacent.isWall) {
        continue
      }
      if (inputCosts.get(adjacent.x, adjacent.y) < OUTSIDE_COST) {
        sourceScore += (1 / this.sources.length)
        this.visual.circle(adjacent, { fill: 'cyan', radius: 1 })
        break inner
      }
    }
  }

  const score = ((rampartEfficiency + distanceToExits + maxTravelDistance + controllerScore + sourceScore) / 5).toFixed(3)
  console.log('rampart efficiency score: ' + rampartEfficiency)
  console.log('distance to exits score: ' + distanceToExits)
  console.log('compactness score: ' + maxTravelDistance)
  console.log('controller protection score: ' + controllerScore)
  console.log('source protection score: ' + sourceScore)
  console.log(`<span style = "color: lime">score: ${score}</span>`)
  console.log('numExtension: ' + extensionPositions.length)
  console.log('CPU used: ' + Game.cpu.getUsed())
  console.log('basePlan ends')
  return { basePlan, score }
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
      basePlan[`lv${i}`].push(this.unpackStructurePlan(packed))
    }
  }
  return basePlan
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

RoomPosition.prototype.packStructurePlan = function (structureType) {
  return structureType + ' ' + (50 * this.x + this.y)
}

Room.prototype.unpackStructurePlan = function (packed) {
  const result = {}
  const splitedPacked = packed.split(` `)
  result.structureType = splitedPacked[0]

  const x = Math.floor(splitedPacked[1] / 50)
  const y = splitedPacked[1] % 50
  result.pos = new RoomPosition(x, y, this.name)

  return result
}

function mod(m, n) {
  return ((m % n) + n) % n
}