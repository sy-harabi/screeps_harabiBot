global.Heap = {
  rooms: {},
  creeps: {}
}

Object.defineProperties(Room.prototype, {
  heap: {
    get() {
      Heap.rooms[this.name] = Heap.rooms[this.name] || {}
      return Heap.rooms[this.name]
    },
  }
})

Object.defineProperties(Creep.prototype, {
  heap: {
    get() {
      Heap.creeps[this.name] = Heap.creeps[this.name] || {}
      return Heap.creeps[this.name]
    },
  }
})