global.Heap = {
  rooms: new Map(),
  creeps: new Map(),
  sources: new Map(),
  quads: new Map(),
  overlord: {}
}

Object.defineProperties(Room.prototype, {
  heap: {
    get() {
      if (!Heap.rooms.has(this.name)) {
        Heap.rooms.set(this.name, {})
      }
      return Heap.rooms.get(this.name)
    },
  }
})

Object.defineProperties(Creep.prototype, {
  heap: {
    get() {
      if (!Heap.creeps.has(this.name)) {
        Heap.creeps.set(this.name, {})
      }
      return Heap.creeps.get(this.name)
    },
  }
})

Object.defineProperties(Source.prototype, {
  heap: {
    get() {
      if (!Heap.sources.has(this.id)) {
        Heap.sources.set(this.id, {})
      }
      return Heap.sources.get(this.id)
    },
  }
})