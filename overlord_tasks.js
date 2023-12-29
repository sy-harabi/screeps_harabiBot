METHODS_BY_CATEGORY = {
  powerBank: `managePowerBankTasks`,
  deposit: 'manageDepositTasks',
}

Object.defineProperties(Overlord, {
  tasks: {
    get() {
      if (Memory.tasks) {
        return Memory.tasks
      }
      return Memory.tasks = {}
    }
  }
})

Overlord.getTaskCategories = function () {
  return Object.keys(Overlord.tasks)
}

Overlord.getTasksWithCategory = function (category) {
  Overlord.tasks[category] = Overlord.tasks[category] || {}
  return Overlord.tasks[category]
}

Overlord.registerTask = function (category, task) {
  const tasks = this.getTasksWithCategory(category)
  tasks[task.id] = task
}

Overlord.deleteTask = function (task) {
  const category = task.category
  const tasks = this.getTasksWithCategory(category)
  delete tasks[task.id]
  return
}

Overlord.runTasks = function () {
  const categories = this.getTaskCategories()
  for (const category of categories) {
    const functionName = METHODS_BY_CATEGORY[category]
    Overlord[functionName]()
  }
}