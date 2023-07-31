global.Overlord = function () {
  this.map = Memory.map = Memory.map || {}
  this.myRooms = Object.values(Game.rooms).filter(room => room.isMy).sort((a, b) => b.controller.totalProgress - a.controller.totalProgress)

  Object.defineProperties(this, {
    structures: {
      get() {
        if (this._structures) {
          return this._structures
        }
        this._structures = {}
        const overlordStructureTypes = ['terminal', 'observer']
        for (const structureType of overlordStructureTypes) {
          this._structures[structureType] = []
        }
        for (const room of this.myRooms) {
          for (const structureType of overlordStructureTypes) {
            if (room.structures[structureType].length) {
              this._structures[structureType].push(room.structures[structureType][0])
            }
          }

        }
        return this._structures
      }
    },
    colonies: {
      get() {
        if (this._colonies) {
          return this._colonies
        }
        this._colonies = []
        for (const myRoom of this.myRooms) {
          if (!myRoom.memory.colony) {
            continue
          }
          for (const colonyName of Object.keys(myRoom.memory.colony)) {
            this._colonies.push(colonyName)
          }
        }
        return this._colonies
      }
    }
  })
}