// Call this function at the end of your main loop

Overlord.exportStats = function () {
  // Reset stats object
  Memory.stats = {
    gcl: {},
    rooms: {},
    cpu: {},
    gpl: {}
  };

  Memory.stats.time = Game.time;

  // Collect room stats
  const resources = {
    power: 0,
    O: 0,
    H: 0,
    Z: 0,
    L: 0,
    U: 0,
    K: 0,
    X: 0,
    G: 0,
    XKHO2: 0,
    UH: 0,
    UH2O: 0,
    XUH2O: 0,
    XLH2O: 0,
    XLHO2: 0,
    XZH2O: 0,
    XZHO2: 0,
    XGH2O: 0,
    XGHO2: 0,
  }
  for (const room of Overlord.myRooms) {
    let roomStats = Memory.stats.rooms[room.name] = {};
    roomStats.storageEnergy = (room.storage ? room.storage.store.energy : 0);
    roomStats.terminalEnergy = (room.terminal ? room.terminal.store.energy : 0);
    roomStats.terminalUsed = (room.terminal ? room.terminal.store.getUsedCapacity() : 0)
    roomStats.energyAvailable = room.energyAvailable;
    roomStats.energyCapacityAvailable = room.energyCapacityAvailable;
    roomStats.controllerProgress = room.controller.progress;
    roomStats.controllerProgressTotal = room.controller.progressTotal;
    roomStats.controllerLevel = room.controller.level;
    if (room.terminal) {
      for (const resourceType in resources) {
        resources[resourceType] += room.terminal.store[resourceType]
      }
    }
  }

  Memory.stats.resources = resources

  // Collect GCL stats
  Memory.stats.gcl.progress = Game.gcl.progress;
  Memory.stats.gcl.progressTotal = Game.gcl.progressTotal;
  Memory.stats.gcl.level = Game.gcl.level;

  // Collect CPU stats
  Memory.stats.cpu.bucket = Game.cpu.bucket;
  Memory.stats.cpu.limit = Game.cpu.limit;
  Memory.stats.cpu.used = Game.cpu.getUsed();

  // Collect GPL stats
  Memory.stats.gpl.progress = Game.gpl.progress;
  Memory.stats.gpl.progressTotal = Game.gpl.progressTotal;
  Memory.stats.gpl.level = Game.gpl.level;

  // Collect credit stats
  Memory.stats.credit = Game.market.credits
}