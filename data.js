global.data = {}
data.creeps = {}
data.time = new Date().getTime()
data.tick = Game.time
data.terminalOrder = 0
data.enoughCPU = true
data.okCPU = true
data.cpuEmergency = false
data.isEnoughCredit = false
data.info = true

data.recordLog = function (text) {
  if (!this._log) {
    this._log = []
  }
  const now = new Date()
  const utcNow = now.getTime() + (now.getTimezoneOffset() * 60 * 1000)
  const koreaNow = utcNow + (9 * 60 * 60 * 1000)
  const koreaDate = new Date(koreaNow)
  const koreaDateText = `${koreaDate.getFullYear()}.${koreaDate.getMonth() + 1}.${koreaDate.getDate()}. ${koreaDate.getHours()}:${koreaDate.getMinutes()}:${koreaDate.getSeconds()}`

  const logContents = `[${koreaDateText}] ${text} at tick ${Game.time}`
  this._log.push(logContents)
  Game.notify(logContents, 180)
  if (this._log.length > 100) {
    this._log.splice(0, this._log.length - 50)
  }
}

global.log = function () {
  if (!data._log) {
    return
  }

  for (const text of data._log) {
    console.log(text)
  }
  return 'end.'
}