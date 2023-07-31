function XPos(start, end) {
    this.start = start
    this.end = end
    this.mid = (start + end) / 2
}

const X_ENTIRE = new XPos(0, 39)

const X_NAME = new XPos(0, 4)
const X_RCL = new XPos(4, 7)
const X_EFFICIENCY = new XPos(7, 11)
const X_NEXT_RCL = new XPos(11, 15)
const X_ENERGY_STORED = new XPos(20, 1)
const X_NUM_WORK = new XPos(20, 24)
const X_LAB = new XPos(24, 28)
const X_FACTORY = new XPos(28, 34)
const X_PROTECT = new XPos(34, 38)

function visualItem(name, start, end, textFunction) {
    // textFunction은 Room을 인자로 가지게 하자
    this.name = name
    this.start = start
    this.end = end
    this.textFunction = textFunction
}



global.roomInfo = function () {
    const startPos = { x: 0, y: 0.5 }
    new RoomVisual().rect(startPos.x + X_ENTIRE.start, startPos.y - 1, startPos.x + X_ENTIRE.end, OVERLORD.myRooms.length + 3, { fill: 'black', opacity: 0.5 }); // 틀 만들기

    new RoomVisual().text("Time " + Game.time, 0.5, startPos.y, { color: 'cyan', strokeWidth: 0.2, align: 'left' })
    new RoomVisual().text("CPU " + Game.cpu.getUsed().toFixed(2), 6.5, startPos.y, { color: 'cyan', strokeWidth: 0.2, align: 'left' })
    new RoomVisual().text("Bucket " + Game.cpu.bucket, 11, startPos.y, { color: 'cyan', strokeWidth: 0.2, align: 'left' });
    new RoomVisual().text("Avg " + Math.round(100 * (_.sum(CPU) / CPU.length)) / 100, 16.5, startPos.y, { color: 'cyan', strokeWidth: 0.2, align: 'left' });
    new RoomVisual().text("# ticks " + CPU.length, 20.5, startPos.y, { color: 'cyan', strokeWidth: 0.2, align: 'left' });
    new RoomVisual().text(`Room: ${OVERLORD.myRooms.length}`, 30.5, startPos.y, { color: 'lime', strokeWidth: 0.2, align: 'left' })
    new RoomVisual().text(`Remotes: ${Memory.info ? Memory.info.numRemotes || 0 : '-'}`, 34.5, startPos.y, { color: 'lime', strokeWidth: 0.2, align: 'left' })
    new RoomVisual().text('|', startPos.x + 4, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('|', startPos.x + 7, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('|', startPos.x + 11, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('|', startPos.x + 15, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('|', startPos.x + 20, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('|', startPos.x + 24, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('|', startPos.x + 28, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('|', startPos.x + 34, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('|', startPos.x + 38, startPos.y + 1, { color: 'cyan' })

    new RoomVisual().text('Name', startPos.x + 2, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('RCL', startPos.x + 5.5, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('Efficiency', startPos.x + 9, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('next RCL', startPos.x + 13, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('Energy stored', startPos.x + 17.5, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('numWork', startPos.x + 22, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('Lab', startPos.x + 26, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('Factory', startPos.x + 31, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('Protect', startPos.x + 36, startPos.y + 1, { color: 'cyan' })

    for (i = 0; i < OVERLORD.myRooms.length; i++) {
        visualizeRoomInfo(OVERLORD.myRooms[i], i)
    }

    function visualizeRoomInfo(room, line) {
        new RoomVisual().text('|', startPos.x + 4, startPos.y + line + 2, { color: 'cyan' })
        new RoomVisual().text('|', startPos.x + 7, startPos.y + line + 2, { color: 'cyan' })
        new RoomVisual().text('|', startPos.x + 11, startPos.y + line + 2, { color: 'cyan' })
        new RoomVisual().text('|', startPos.x + 15, startPos.y + line + 2, { color: 'cyan' })
        new RoomVisual().text('|', startPos.x + 20, startPos.y + line + 2, { color: 'cyan' })
        new RoomVisual().text('|', startPos.x + 24, startPos.y + line + 2, { color: 'cyan' })
        new RoomVisual().text('|', startPos.x + 28, startPos.y + line + 2, { color: 'cyan' })
        new RoomVisual().text('|', startPos.x + 34, startPos.y + line + 2, { color: 'cyan' })
        new RoomVisual().text('|', startPos.x + 38, startPos.y + line + 2, { color: 'cyan' })

        const name = `${room.name}(${room.mineral.mineralType})`
        new RoomVisual().text(name, startPos.x + 2, startPos.y + line + 2, { color: 'cyan' })
        new RoomVisual().text(room.controller.level === 8 ? '8' : `${room.controller.level}(${Math.round(100 * room.controller.progress / room.controller.progressTotal)}%)`, startPos.x + 5.5, startPos.y + line + 2, { color: room.controller.level > 7 ? 'lime' : room.controller.level > 3 ? 'yellow' : 'magenta' })
        new RoomVisual().text(room.controller.level === 8 ? '-' : `${(room.efficiency * 100).toFixed(0)}%(${room.progressTime.toFixed(0)}h)`, startPos.x + 9, startPos.y + line + 2, { color: room.efficiency > 0.7 ? 'lime' : room.efficiency > 0.4 ? 'yellow' : 'magenta' })

        const day = Math.floor(room.hoursToNextRCL / 24)
        const hour = (room.hoursToNextRCL % 24).toFixed(1)
        const leftTime = day === Infinity ? "-" : day > 0 ? `${day}d ${hour}h` : `${hour}h`
        new RoomVisual().text(room.controller.level === 8 ? '-' : leftTime, startPos.x + 13, startPos.y + line + 2, { color: 'cyan' })


        new RoomVisual().text(`${room.laborer.numWork}/${room.maxWork}`, startPos.x + 22, startPos.y + line + 2, { color: room.laborer.numWork >= 15 ? 'lime' : room.laborer.numWork >= 5 ? 'yellow' : 'magenta' })

        if (room.memory.boost) {
            new RoomVisual().text(this.memory.boostState, startPos.x + 26, startPos.y + line + 2, { color: 'lime' })
        } else {
            new RoomVisual().text(`${room.memory.labTarget ? room.memory.labTarget : '-'}`, startPos.x + 26, startPos.y + line + 2, { color: room.memory.labTarget ? 'lime' : room.memory.labs ? 'yellow' : 'magenta' })
        }
        new RoomVisual().text(`${room.memory.factoryTarget ? room.memory.factoryTarget.commodity : '-'}`, startPos.x + 31, startPos.y + line + 2, { color: room.memory.factoryTarget ? 'lime' : 'magenta' })

        new RoomVisual().text()

    }
}