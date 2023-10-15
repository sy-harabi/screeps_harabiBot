const profiler = require('screeps-profiler');

Object.defineProperties(Room.prototype, {
    progressHour: {
        get() {
            return (new Date().getTime() - this.memory.info[0].time) / 1000 / 60 / 60
        }
    },
    progressPerHour: {
        get() {
            if (this.controller.level === 8) {
                return undefined
            }
            const progress = this.controller.totalProgress - this.memory.info[0].progress
            const time = this.progressHour //시간으로 계산
            return progress / time
        }
    },
    hoursToNextRCL: {
        get() {
            return (this.controller.progressTotal - this.controller.progress) / this.progressPerHour
        }
    }
})

Room.prototype.getControlPointsPerTick = function () {
    if (this.controller.level === 8) {
        return undefined
    }
    if (!this.memory.info) {
        return undefined
    }
    if (!this.memory.info[0]) {
        return undefined
    }
    const progressBefore = this.memory.info[0].progress || 0
    const tickBefore = this.memory.info[0].tick || 0
    const progress = this.controller.totalProgress - progressBefore
    const tick = Game.time - tickBefore
    return progress / tick
}

global.X_ENTIRE = {
    start: 0,
    end: 0
}

const OPACITY = 0.8

// item prototype
function VisualItem(name, length, text) {
    // textFunction : (Room) => {text, option}
    this.name = name
    this.start = X_ENTIRE.end
    this.end = X_ENTIRE.end = X_ENTIRE.end + length
    this.mid = (this.start + this.end) / 2
    this.text = text
}

// 방 이름
const roomName = new VisualItem('Name', 5, (room) => {
    let emoji = undefined
    let color = undefined
    if (room.memory.militaryThreat) {
        emoji = '⚠️'
        color = 'magenta'
    } else if (room.heap.constructing) {
        emoji = '🧱'
        color = 'yellow'
    } else {
        emoji = '🔼'
        color = 'cyan'
    }
    if (room.memory.defenseNuke) {
        emoji = '☢️' + emoji
    }
    const content = `${emoji}${room.name}(${room.mineral.mineralType})`
    const option = { color }
    return { content, option }
})


// RCL
const rcl = new VisualItem('RCL', 3.5, (room) => {
    if (room.controller.level === 8) {
        const content = '8'
        const option = { color: 'lime' }
        return { content, option }
    }
    const content = `${room.controller.level}(${Math.round(100 * room.controller.progress / room.controller.progressTotal)}%)`
    const option = { color: room.controller.level > 3 ? 'yellow' : 'magenta' }
    return { content, option }
})

// Spawn
const spawnCapacity = new VisualItem('Spawn', 3, (room) => {
    const spawnCapacityRatio = room.getSpawnCapacityRatio()
    const content = `${Math.round(100 * spawnCapacityRatio)}%`
    const option = { color: spawnCapacityRatio < SPAWN_CAPACITY_THRESHOLD ? 'lime' : spawnCapacityRatio < 0.9 ? 'yellow' : 'magenta' }
    return { content, option }
})

// Upgrade Rate
const control = new VisualItem('Control', 3.5, (room) => {
    if (room.controller.level === 8) {
        const content = room.heap.upgrading ? '15e/t' : '-'
        const option = { color: 'lime' }
        return { content, option }
    }
    const controlPointsPerTick = room.getControlPointsPerTick()
    const content = `${Math.floor(10 * controlPointsPerTick) / 10}e/t`
    const option = { color: controlPointsPerTick > 14 ? 'lime' : controlPointsPerTick > 8 ? 'yellow' : 'magenta' }
    return { content, option }
})

// next RCL
const nextRCL = new VisualItem('next RCL', 4, (room) => {
    const day = Math.floor(room.hoursToNextRCL / 24)
    const hour = Math.floor(10 * (room.hoursToNextRCL % 24)) / 10
    const leftTime = day === Infinity ? "-" : day > 0 ? `${day}d ${hour}h` : `${hour}h`
    const content = room.controller.level === 8 ? '-' : leftTime
    const option = { color: 'cyan' }
    return { content, option }
})

// Storage
const storedEnergy = new VisualItem('Storage', 3, (room) => {
    const energyStored = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0
    const content = energyStored ? `${Math.floor(energyStored / 1000)}K` : '-'
    const option = { color: room.memory.savingMode ? 'magenta' : 'lime' }
    return { content, option }
})

// Harvest
const harvest = new VisualItem('Harvest', 3, (room) => {
    const rate = room.heap.sourceUtilizationRate
    const content = `${Math.floor(rate * 100)}%`
    const option = { color: rate > 0.9 ? 'lime' : 'magenta' }
    return { content, option }
})

// Remote
const remoteIncome = new VisualItem('Remote', 5, (room) => {
    const num = (() => {
        if (!room.memory.remotes) {
            return 0
        }
        let result = 0
        for (const remoteStatus of Object.values(room.memory.remotes)) {
            const numSource =
                remoteStatus.infraPlan
                    ? Object.keys(remoteStatus.infraPlan).length
                    : 0
            result += numSource
        }
        return result
    })()

    room.memory.numRemoteSource = num

    if (num === 0) {
        const content = '-'
        const option = { color: 'magenta' }
        return { content, option }
    }

    let income = 0
    for (const remoteName in room.memory.remotes) {
        const status = room.memory.remotes[remoteName]
        if (!status) {
            continue
        }
        if (status.construction === 'proceed') {
            continue
        }
        const remoteIncome = ((status.lastProfit || 0) + status.profit - (status.lastCost || 0) - status.cost) / (Game.time - (status.lastTick || status.tick))
        if (isNaN(remoteIncome)) {
            continue
        }

        const visualPos = new RoomPosition(25, 5, remoteName)

        const color = remoteIncome > 5 ? '#000000' : '#740001'
        Game.map.visual.text(`📊${remoteIncome.toFixed(1)}e/t`, visualPos, { fontSize: 5, backgroundColor: color, opacity: 1 })

        income += remoteIncome
    }
    room.heap.remoteIncome = income
    const content = `${Math.floor(10 * income) / 10}e/t (S:${num})`
    const option = { color: income / num >= 5 ? 'lime' : 'magenta' }
    return { content, option }
})

// Lab
const lab = new VisualItem('Lab', 3, (room) => {
    if (room.memory.boostState) {
        const content = room.memory.boostState
        const option = { color: 'lime' }
        return { content, option }
    } else {
        const content = `${room.memory.labTarget ? room.memory.labTarget : '-'}`
        const option = { color: room.memory.labTarget ? 'lime' : room.memory.labs ? 'yellow' : 'magenta' }
        return { content, option }
    }
})

// Factory
const factory = new VisualItem('Factory', 6, (room) => {
    const content = `${room.memory.factoryTarget ? room.memory.factoryTarget.commodity : '-'}`
    const option = { color: room.memory.factoryTarget ? 'lime' : 'magenta' }
    return { content, option }
})

// Rampart
const rampart = new VisualItem('Rampart', 4, (room) => {
    const content = `${Math.round(room.structures.minProtectionHits / 10000) / 100}M`
    const option = { color: room.heap.rampartOK ? 'lime' : 'magenta' }
    return { content, option }
})

// 표시할 정보 목록
const items = [
    roomName,
    rcl,
    spawnCapacity,
    control,
    nextRCL,
    storedEnergy,
    harvest,
    remoteIncome,
    lab,
    factory,
    rampart
]

Overlord.visualizeRoomInfo = function () {
    const startPos = { x: 0, y: 0.5 }
    new RoomVisual().rect(startPos.x + X_ENTIRE.start, startPos.y - 1, startPos.x + X_ENTIRE.end + 0.5, this.myRooms.length + 3, { fill: 'black', opacity: 0.3 }); // 틀 만들기

    const option = { color: 'cyan', strokeWidth: 0.2, align: 'left', opacity: OPACITY }
    new RoomVisual().text("Time " + Game.time, 0.5, startPos.y, option)
    new RoomVisual().text("CPU " + Math.floor(10 * Game.cpu.getUsed()) / 10, 6.5, startPos.y, option)
    new RoomVisual().text("Bucket " + Game.cpu.bucket, 11, startPos.y, option);
    new RoomVisual().text("Avg " + Math.round(100 * (_.sum(CPU) / CPU.length)) / 100, 16.5, startPos.y, option);
    new RoomVisual().text("# ticks " + CPU.length, 20.5, startPos.y, option);
    new RoomVisual().text(`Room: ${this.myRooms.length}`, 25, startPos.y, option)
    new RoomVisual().text(`Remote: ${Memory.info ? Memory.info.numRemotes || 0 : '-'}(sources)`, 29.5, startPos.y, option)
    new RoomVisual().text(`Creep: ${Object.keys(Game.creeps).length}`, 37.5, startPos.y, option)

    // 각 방마다 표시
    for (let i = -1; i < this.myRooms.length; i++) {
        const room = i >= 0 ? this.myRooms[i] : undefined
        // 각 item마다 표시
        for (const item of items) {
            // 구분선 삽입
            new RoomVisual().text('|', startPos.x + item.end, startPos.y + i + 2, { color: 'cyan', opacity: OPACITY })
            // 처음에는 item 이름
            if (i === -1) {
                new RoomVisual().text(item.name, startPos.x + item.mid, startPos.y + i + 2, { color: 'cyan', opacity: OPACITY })
                continue
            }
            // 그다음부터는 내용
            const text = item.text(room)
            const option = text.option
            option.opacity = OPACITY
            new new RoomVisual().text(text.content, startPos.x + item.mid, startPos.y + i + 2, text.option)
        }
    }
}

profiler.registerObject(Overlord, 'Overlord')