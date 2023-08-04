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

data.recordLog = function (text, scope) {
  if (!Memory._log) {
    Memory._log = []
  }

  const scopeText = `<span style = "color: yellow">[${scope === undefined ? 'GLOBAL' : toScopeForm(scope.toUpperCase())}]</span>`

  const now = new Date()
  const utcNow = now.getTime() + (now.getTimezoneOffset() * 60 * 1000)
  const koreaNow = utcNow + (9 * 60 * 60 * 1000)
  const koreaDate = new Date(koreaNow)

  const month = toTwoDigits(koreaDate.getMonth() + 1)
  const date = toTwoDigits(koreaDate.getDate())
  const minutes = toTwoDigits(koreaDate.getMinutes())

  const koreaDateText = `<span style = "color: magenta">[${koreaDate.getFullYear()}.${month}.${date}. ${koreaDate.getHours()}:${minutes}]</span>`

  const tick = `<span style = "color: lime">[tick: ${Game.time}]</span>`

  const content = `<span style = "color: cyan">${text}</span>`
  const URL = scope ? `https://screeps.com/a/#!/history/${SHARD}/${scope}?t=${Game.time - 5}` : undefined
  const hyperLink = URL ? `<A href = ${URL} target = "_blank" >[Link]</A>` : undefined

  const logContents = `<span style = "background-color: rgba(0, 0, 0, 0.68)">${koreaDateText} ${tick} ${scopeText} ${content} ${hyperLink || ``}</span>`

  Memory._log.push(logContents)
  Game.notify(logContents, 180)
  if (Memory._log.length > 100) {
    Memory._log.splice(0, Memory._log.length - 50)
  }
}

function toTwoDigits(string) {
  string = string.toString()
  while (string.length < 2) {
    string = '0' + string
  }
  return string
}

function toScopeForm(string) {
  string = string.toString()
  while (string.length < 6) {
    string = ' ' + string
  }
  return string
}

global.log = function () {
  if (!Memory._log) {
    return 'no log until now'
  }
  let num = 1
  for (const text of Memory._log) {
    console.log(`#${toTwoDigits(num)} ${text}`)
    num++
  }
  return 'end.'
}