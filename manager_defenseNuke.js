Room.prototype.defenseNuke = function () {
  const nukes = this.find(FIND_NUKES)
  if (nukes.length === 0) {
    if (this.memory.defenseNuke) {
      delete this.memory.defenseNuke
      this.memory.level = this.controller.level - 1
    }
    return
  }

  this.memory.defenseNuke = this.memory.defenseNuke || {}
  const status = this.memory.defenseNuke

  status.state = status.state || 'init'
  this.visual.text(`☢️${status.state}`, this.controller.pos.x + 0.75, this.controller.pos.y - 1.5, { align: 'left' })

  const structureTypeToDefend = ['storage', 'terminal', 'powerSpawn', 'nuker', 'factory', 'spawn', 'tower']

  if (status.state === 'init') {
    // 일단 짓고있는 거 다 멈춰
    const constructionSites = this.find(FIND_CONSTRUCTION_SITES)
    for (const constructionSite of constructionSites) {
      if (constructionSite.structureType !== 'rampart') {
        constructionSite.remove()
      }
    }

    // 모든 nuke에 대해 실행
    for (const nuke of nukes) {
        status.nukes = status.nukes || []
        if (!status.nukes.includes(nuke.id)) {
            status.nukes.push(nukes.id)
        }
      // nuke 기준 5*5 pos에 대해 실행
      const landingPositions = nuke.pos.getInRange(2)
      for (const pos of landingPositions) {
        const structures = pos.lookFor(LOOK_STRUCTURES)
        let isRampart = false
        let toProtect = false
        status.toProtect = []
        // 해당 자리에 있는 structure 확인 : 보호해야되면 rampart 설치. rampart 이미 있으면 넘어감.
        for (const structure of structures) {
          const structureType = structure.structureType
          if (structureTypeToDefend.includes(structureType)) {
            toProtect = true
            if (!status.toProtect.includes(structure.pos.pack())) {
                status.toProtect.push(structure.pos.pack())
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
      return
    }
    // 없으면 이제 rampart 다 지은거임
    status.state = 'repair'
    return
  }

  if (status.state === 'repair') {
    // 모든 rampart 마다 확인
    if(status.toProtect===undefined) {
        status.state ='init'
        return
    }
    const ramparts = []
    for (const packed of status.toProtect) {
        const pos = this.parsePos(packed)
        const rampart = pos.lookFor(LOOK_STRUCTURES).filter(structure=>structure.structureType==='rampart')[0]
        if (!rampart) {
            status.state ='init'
            return
        }
        ramparts.push(rampart)
    }
    for (const rampart of ramparts) {
        const nukesNear = rampart.pos.findInRange(FIND_NUKES,2)
        let threshold = 0
        for (const nuke of nukesNear) {
            if (nuke.pos.isEqualTo(rampart.pos)) {
                threshold+=10150000
                continue
            }
            threshold+=5150000
        }
        if (rampart.hits<threshold) {
            return this.repairStructure(rampart)
        }
    }
    // 여기까지 왔다는 건 수리 끝났다는 거
    status.state = 'end'
    return
  }
  
  if(status.state === 'end') {
      for (const nuke of nukes) {
          if (!status.nukes || status.nukes.length===0) {
            status.state ='init'
            return
          }
          if (!status.nukes.includes(nuke.id)) {
            status.state ='init'
            return              
          }
      }
      return  this.manageWork()
  }
}
