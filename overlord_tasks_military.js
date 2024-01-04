const MILITARY_LINEAR_DISTANCE_THRESHOLD = 5
const MILITARY_DISTANCE_THRESHOLD = 7

Overlord.manageClearAreaTasks = function () {
  const tasks = this.getTasksWithCategory('clearArea')

  for (const clearAreaRequest of Object.values(tasks)) {
    const targetRoomName = clearAreaRequest.targetRoomName
    const roomNamesInCharge = clearAreaRequest.roomNamesInCharge
    if (roomNamesInCharge.length === 0) {
      this.deleteTask(clearAreaRequest)
    }
  }
}

const ClearAreaRequest = function (targetRoom) {
  const targetRoomName = targetRoom.name

  this.category = 'clearArea'
  this.id = 'clearArea' + targetRoomName

  this.targetRoomName = targetRoomName

  const targets = targetRoom.getEnemyCombatants()
  const enemyCosts = targets.reduce((accumulator, current) => accumulator + current.getCost(), 0)
  const maxTicksToLive = Math.max(...targets.map(creep => creep.ticksToLive))

  this.expireTime = Game.time + maxTicksToLive
  this.enemyCosts = enemyCosts

  const roomsAround = Overlord.findMyRoomsInRange(targetRoomName, MILITARY_LINEAR_DISTANCE_THRESHOLD)

  const roomsAvailable = roomsAround.filter(room => {
    if (room.controller.level < 7) {
      return false
    }
    if (room.energyLevel < 100) {
      return false
    }
    if (room.memory.militaryThreat) {
      return false
    }
    return true
  })

  this.roomNamesInCharge = [...roomsAvailable.map(room => room.name)]
}