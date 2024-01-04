Room.prototype.defenseNuke = function () {
  const nukes = this.find(FIND_NUKES)
  if (nukes.length === 0) {
    if (this.memory.defenseNuke) {
      delete this.memory.defenseNuke
      this.memory.level = this.controller.level - 1
    }
    return
  }

  if (!this.memory.defenseNuke) {
    this.memory.defenseNuke = {}
    data.recordLog(`WARNING: ${nukes.length} nuke${nukes.length > 1 ? 's' : ''} detected`, this.name)
  }

  const status = this.memory.defenseNuke

  status.state = status.state || 'init'
  this.visual.text(`☢️${status.state}`, this.controller.pos.x + 0.75, this.controller.pos.y + 1.5, { align: 'left' })

  const structureTypeToDefend = ['storage', 'terminal', 'powerSpawn', 'nuker', 'factory', 'spawn', 'tower', 'lab', 'rampart']

  if (status.state === 'init') {
    // 모든 nuke에 대해 실행
    for (const nuke of nukes) {
      status.nukes = status.nukes || []
      if (!status.nukes.includes(nuke.id)) {
        status.nukes.push(nuke.id)
      }
      // nuke 기준 5*5 pos에 대해 실행
      const landingPositions = nuke.pos.getInRange(2)
      for (const pos of landingPositions) {
        const structures = pos.lookFor(LOOK_STRUCTURES)
        let isRampart = false
        let toProtect = false
        status.toProtect = status.toProtect || []
        // 해당 자리에 있는 structure 확인 : 보호해야되면 rampart 설치. rampart 이미 있으면 넘어감.
        for (const structure of structures) {
          const structureType = structure.structureType
          if (structureTypeToDefend.includes(structureType)) {
            toProtect = true
            const packed = packCoord(structure.pos.x, structure.pos.y)
            if (!status.toProtect.includes(packed)) {
              status.toProtect.push(packed)
            }
            pos.createConstructionSite('rampart')
          }
          if (structureType === 'rampart') {
            isRampart = true
          }
        }
        if (toProtect && !isRampart) {
          //여기까지 왔으면 보호해야되는데 rampart 없는거임.
          const constructionSite = pos.lookFor(LOOK_CONSTRUCTION_SITES)[0]
          // rampart construction site 있는지 확인
          if (constructionSite && constructionSite.structureType === 'rampart') {
            // 있으면 문제 없으니 넘어가
            continue
          }
          //여기 왔으면 문제가 있는거임
          return
        }
      }
    }
    // 여기까지 왔으면 문제가 없는거임
    status.state = 'build'
    return
  }

  if (status.state === 'build') {
    const constructionSites = this.find(FIND_CONSTRUCTION_SITES)
    // 아직 constructionSite 있으면 멈춰
    if (constructionSites.length) {
      this.heap.constructing = true
      return
    }
    // 없으면 이제 rampart 다 지은거임
    status.state = 'repair'
    return
  }

  if (status.state === 'repair') {
    this.heap.constructing = true
    // status.nukes 확인
    for (let i = 0; i < status.nukes.length; i++) {
      const id = status.nukes[i]
      const nuke = Game.getObjectById(id)
      if (!nuke || !nuke.room || nuke.room.name !== this.name) {
        status.nukes.splice(i, 1)
        i--
        console.log(i)
      }
    }

    // 모든 rampart 마다 확인
    if (status.toProtect === undefined) {
      status.state = 'init'
      return
    }
    const ramparts = []
    for (const packed of status.toProtect) {
      const coord = parseCoord(packed)
      const pos = new RoomPosition(coord.x, coord.y, this.name)

      this.visual.circle(pos, { fill: 'red', radius: 0.5 })

      const rampart = pos.lookFor(LOOK_STRUCTURES).filter(structure => structure.structureType === 'rampart')[0]
      if (!rampart) {
        status.state = 'init'
        return
      }
      ramparts.push(rampart)
    }
    for (const rampart of ramparts) {
      const nukesNear = rampart.pos.findInRange(FIND_NUKES, 2)
      let threshold = 0
      let closestTimeToLand = Infinity
      for (const nuke of nukesNear) {
        if (nuke.timeToLand < closestTimeToLand) {
          closestTimeToLand = nuke.timeToLand
        }
        if (nuke.pos.isEqualTo(rampart.pos)) {
          threshold += 10150000
          continue
        }
        threshold += 5150000
      }
      const structures = rampart.pos.lookFor(LOOK_STRUCTURES)
      const isExistingRampart = !structures.some(structure => structure.structureType !== 'rampart' && structureTypeToDefend.includes(structure.structureType))
      if (isExistingRampart) {
        threshold += 2000000
      }
      if (rampart.hits < threshold) {
        this.visual.text(`${Math.floor(100 * rampart.hits / threshold)}%`, rampart.pos)
        return this.repairStructure(rampart)
      } else {
        this.visual.text(`✅`, rampart.pos)
      }
    }
    // 여기까지 왔다는 건 수리 끝났다는 거
    const laborers = this.creeps.laborer
    for (const laborer of laborers) {
      laborer.memory.role = 'wallMaker'
    }

    status.state = 'end'
    return
  }

  if (status.state === 'end') {
    for (const nuke of nukes) {
      if (!status.nukes || status.nukes.length === 0) {
        status.state = 'init'
        return
      }
      if (!status.nukes.includes(nuke.id)) {
        status.state = 'init'
        return
      }
    }
    return this.manageWork()
  }
}

Room.prototype.repairStructure = function (rampart) {
  let laborers = this.creeps.laborer
  const rampartLowest = rampart
  this.laborersNeedDelivery = true
  for (const laborer of laborers) {
    // energy 없으면 energy 받아라
    if (!laborer.working) {
      //storage가 가까우면 storage에서 energy 받자
      if (this.storage) {
        laborer.getEnergyFrom(this.storage.id)
        continue
      }
      // 그게 아니면 hauler들이 갖다주길 기다리자
      this.laborersNeedDelivery = true
    }
    // energy 있으면 일해라
    laborer.repairMy(rampartLowest)
  }
}

Room.prototype.isReactingToNukes = function () {
  if (!this.memory.defenseNuke) {
    return false
  }
  if (!['build', 'repair'].includes(this.memory.defenseNuke.state)) {
    return false
  }
  return true
}