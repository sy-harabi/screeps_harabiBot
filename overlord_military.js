Overlord.sendTroops = function (roomNameFrom, roomNameTo, cost, options) {
  const defaultOptions = { distance: 0 }
  const mergedOptions = { ...defaultOptions, ...options }
  let { distance } = mergedOptions

  const roomFrom = Game.rooms[roomNameFrom]
  if (!roomFrom || !roomFrom.isMy) {
    return
  }


}