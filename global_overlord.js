// global.Overlord = {
//   get map() {
//     if (this._map && this._mapTick === Game.time) {
//       return this._map
//     }
//     this._mapTick = Game.time
//     console.log(`get map`)
//     return this._map = Memory.map = Memory.map || {}
//   },
//   get myRooms() {
//     if (this._myRooms && this._myRoomsTick === Game.time) {
//       return this._myRooms
//     }
//     this._myRoomsTick = Game.time
//     console.log(`get myRooms`)
//     return this._myRooms = Object.values(Game.rooms).filter(room => room.isMy).sort((a, b) => b.controller.totalProgress - a.controller.totalProgress)
//   },
//   get structures() {
//     if (this._structures && this._structuresTick === Game.time) {
//       return this._structures
//     }
//     this._structures = {}
//     const overlordStructureTypes = ['terminal', 'observer']
//     for (const structureType of overlordStructureTypes) {
//       this._structures[structureType] = []
//     }
//     for (const room of this.myRooms) {
//       for (const structureType of overlordStructureTypes) {
//         if (room.structures[structureType].length) {
//           this._structures[structureType].push(room.structures[structureType][0])
//         }
//       }

//     }
//     this._structuresTick = Game.time
//     console.log(`get structures`)
//     return this._structures
//   },
//   get colonies() {
//     if (this._colonies && this._coloniesTick === Game.time) {
//       return this._colonies
//     }
//     this._colonies = []
//     for (const myRoom of this.myRooms) {
//       if (!myRoom.memory.colony) {
//         continue
//       }
//       for (const colonyName of Object.keys(myRoom.memory.colony)) {
//         this._colonies.push(colonyName)
//       }
//     }
//     this._coloniesTick = Game.time
//     console.log(`get colonies`)
//     return this._colonies
//   },
// }


global.Overlord = function () {
  Object.defineProperties(this, {
    map: {
      get() {
        if (this._map && this._mapTick === Game.time) {
          return this._map
        }
        this._mapTick = Game.time
        return this._map = Memory.map = Memory.map || {}
      }
    },
    myRooms: {
      get() {
        if (this._myRooms && this._myRoomsTick === Game.time) {
          return this._myRooms
        }
        this._myRoomsTick = Game.time
        return this._myRooms = Object.values(Game.rooms).filter(room => room.isMy).sort((a, b) => b.controller.totalProgress - a.controller.totalProgress)
      }
    },
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