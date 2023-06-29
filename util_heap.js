global.Heap = {
  rooms: {},
  creeps: {},
  sources: {}
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

Object.defineProperties(Source.prototype, {
  heap: {
    get() {
      Heap.sources[this.id] = Heap.sources[this.id] || {}
      return Heap.sources[this.id]
    },
  }
})