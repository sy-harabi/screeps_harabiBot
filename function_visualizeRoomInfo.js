// 전체 범위

global.X_ENTIRE = {
    start: 0,
    end: 0
}

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
        emoji = '⚔️'
        color = 'magenta'
    } else if (room.heap.constructing) {
        emoji = '🏗️'
        color = 'yellow'
    } else {
        emoji = '🔄'
        color = 'cyan'
    }
    const content = `${emoji}${room.name}(${room.mineral.mineralType})`
    const option = { color }
    return { content, option }
})

let start = X_ENTIRE.start

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

// Upgrade Rate
const control = new VisualItem('Control', 3.5, (room) => {
    if (room.controller.level === 8) {
        const content = '-'
        const option = { color: 'lime' }
        return { content, option }
    }
    const content = `${room.controlPointsPerTick.toFixed(1)}e/t`
    const option = { color: room.controlPointsPerTick > 14 ? 'lime' : room.controlPointsPerTick > 8 ? 'yellow' : 'magenta' }
    return { content, option }
})

// next RCL
const nextRCL = new VisualItem('next RCL', 4, (room) => {
    const day = Math.floor(room.hoursToNextRCL / 24)
    const hour = (room.hoursToNextRCL % 24).toFixed(1)
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
const remoteIncome = new VisualItem('Remote', 4, (room) => {
    const num =
        room.memory.colony
            ? Object.keys(room.memory.colony).length
            : 0

    if (num === 0) {
        const content = '-'
        const option = { color: 'magenta' }
        return { content, option }
    }

    let income = 0
    for (const colonyName in room.memory.colony) {
        const status = room.memory.colony[colonyName]
        income += (status.profit - status.cost) / (Game.time - status.tick)
    }

    const content = `${num}(${income.toFixed(1)}e/t)`
    const option = { color: income > 0 ? 'lime' : 'magenta' }
    return { content, option }
})

// Lab
const lab = new VisualItem('Lab', 3, (room) => {
    if (room.memory.boost) {
        const content = this.memory.boostState
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
    control,
    nextRCL,
    storedEnergy,
    harvest,
    remoteIncome,
    lab,
    factory,
    rampart
]

Overlord.prototype.visualizeRoomInfo = function () {
    const startPos = { x: 0, y: 0.5 }
    new RoomVisual().rect(startPos.x + X_ENTIRE.start, startPos.y - 1, startPos.x + X_ENTIRE.end + 0.5, OVERLORD.myRooms.length + 3, { fill: 'black', opacity: 0.5 }); // 틀 만들기

    new RoomVisual().text("Time " + Game.time, 0.5, startPos.y, { color: 'cyan', strokeWidth: 0.2, align: 'left' })
    new RoomVisual().text("CPU " + Game.cpu.getUsed().toFixed(2), 6.5, startPos.y, { color: 'cyan', strokeWidth: 0.2, align: 'left' })
    new RoomVisual().text("Bucket " + Game.cpu.bucket, 11, startPos.y, { color: 'cyan', strokeWidth: 0.2, align: 'left' });
    new RoomVisual().text("Avg " + Math.round(100 * (_.sum(CPU) / CPU.length)) / 100, 16.5, startPos.y, { color: 'cyan', strokeWidth: 0.2, align: 'left' });
    new RoomVisual().text("# ticks " + CPU.length, 20.5, startPos.y, { color: 'cyan', strokeWidth: 0.2, align: 'left' });
    new RoomVisual().text(`Room: ${OVERLORD.myRooms.length}`, 25, startPos.y, { color: 'lime', strokeWidth: 0.2, align: 'left' })
    new RoomVisual().text(`Creep: ${Object.keys(Game.creeps).length}`, 29.5, startPos.y, { color: 'lime', strokeWidth: 0.2, align: 'left' })
    new RoomVisual().text(`Remote: ${Memory.info ? Memory.info.numRemotes || 0 : '-'}`, 34.5, startPos.y, { color: 'lime', strokeWidth: 0.2, align: 'left' })

    // 각 방마다 표시
    for (let i = -1; i < OVERLORD.myRooms.length; i++) {
        const room = i >= 0 ? OVERLORD.myRooms[i] : undefined
        // 각 item마다 표시
        for (const item of items) {
            // 구분선 삽입
            new RoomVisual().text('|', startPos.x + item.end, startPos.y + i + 2, { color: 'cyan' })
            // 처음에는 item 이름
            if (i === -1) {
                new RoomVisual().text(item.name, startPos.x + item.mid, startPos.y + i + 2, { color: 'cyan' })
                continue
            }
            // 그다음부터는 내용
            const text = item.text(room)
            new new RoomVisual().text(text.content, startPos.x + item.mid, startPos.y + i + 2, text.option)
        }
    }
}

Object.defineProperties(Room.prototype, {
    controlPointsPerTick: {
        get() {
            if (this.controller.level === 8) {
                return undefined
            }
            const progress = this.controller.totalProgress - this.memory.info[0].progress
            const tick = Game.time - this.memory.info[0].tick
            return progress / tick
        }
    },
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