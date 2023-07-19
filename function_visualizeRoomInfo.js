global.roomInfo = function () {
    const startPos = { x: 0, y: 0.5 }
    new RoomVisual().rect(startPos.x, startPos.y - 1, 37, OVERLORD.myRooms.length + 3, { fill: 'black', opacity: 0.5 }); // 틀 만들기

    new RoomVisual().text("Time " + Game.time, 0.5, startPos.y, { color: 'cyan', strokeWidth: 0.2, align: 'left' })
    new RoomVisual().text("CPU " + Game.cpu.getUsed().toFixed(2), 6.5, startPos.y, { color: 'cyan', strokeWidth: 0.2, align: 'left' })
    new RoomVisual().text("Bucket " + Game.cpu.bucket, 11, startPos.y, { color: 'cyan', strokeWidth: 0.2, align: 'left' });
    new RoomVisual().text("Avg " + Math.round(100 * (_.sum(CPU) / CPU.length)) / 100, 16, startPos.y, { color: 'cyan', strokeWidth: 0.2, align: 'left' });
    new RoomVisual().text("# ticks " + CPU.length, 20, startPos.y, { color: 'cyan', strokeWidth: 0.2, align: 'left' });
    new RoomVisual().text("Labs: " + data.okCPU, 24, startPos.y, { color: data.okCPU ? 'lime' : 'magenta', strokeWidth: 0.2, align: 'left' });
    new RoomVisual().text("Market: " + data.enoughCPU, 28, startPos.y, { color: data.enoughCPU ? 'lime' : 'magenta', strokeWidth: 0.2, align: 'left' });

    new RoomVisual().text('|', startPos.x + 4, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('|', startPos.x + 7, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('|', startPos.x + 11, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('|', startPos.x + 15, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('|', startPos.x + 20, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('|', startPos.x + 24, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('|', startPos.x + 28, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('|', startPos.x + 32, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('|', startPos.x + 36, startPos.y + 1, { color: 'cyan' })

    new RoomVisual().text('Name', startPos.x + 2, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('RCL', startPos.x + 5.5, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('Efficiency', startPos.x + 9, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('next RCL', startPos.x + 13, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('Energy stored', startPos.x + 17.5, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('numWork', startPos.x + 22, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('Lab', startPos.x + 26, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('Factory', startPos.x + 30, startPos.y + 1, { color: 'cyan' })
    new RoomVisual().text('Protect', startPos.x + 34, startPos.y + 1, { color: 'cyan' })

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
        new RoomVisual().text('|', startPos.x + 32, startPos.y + line + 2, { color: 'cyan' })
        new RoomVisual().text('|', startPos.x + 36, startPos.y + line + 2, { color: 'cyan' })

        const name = `${room.name}(${room.mineral.mineralType})`
        new RoomVisual().text(name, startPos.x + 0.3, startPos.y + line + 2, { color: 'cyan', align: 'left' })
        new RoomVisual().text(room.controller.level, startPos.x + 5.5, startPos.y + line + 2, { color: room.controller.level > 7 ? 'lime' : room.controller.level > 3 ? 'yellow' : 'magenta' })
        new RoomVisual().text(room.controller.level === 8 ? '-' : `${(room.efficiency * 100).toFixed(0)}%(${room.progressTime.toFixed(0)}h)`, startPos.x + 9, startPos.y + line + 2, { color: room.efficiency > 0.7 ? 'lime' : room.efficiency > 0.4 ? 'yellow' : 'magenta' })

        const day = Math.floor(room.hoursToNextRCL / 24)
        const hour = (room.hoursToNextRCL % 24).toFixed(1)
        const leftTime = day === Infinity ? "-" : day > 0 ? `${day}d ${hour}h` : `${hour}h`
        new RoomVisual().text(room.controller.level === 8 ? '-' : leftTime, startPos.x + 13, startPos.y + line + 2, { color: 'cyan' })

        new RoomVisual().text(room.storage ? room.storage.store[RESOURCE_ENERGY] : '-', startPos.x + 17.5, startPos.y + line + 2, { color: room.memory.savingMode ? 'magenta' : 'lime' })

        new RoomVisual().text(`${room.laborer.numWork}/${room.maxWork}`, startPos.x + 22, startPos.y + line + 2, { color: room.laborer.numWork >= 15 ? 'lime' : room.laborer.numWork >= 5 ? 'yellow' : 'magenta' })

        if (room.memory.boost) {
            new RoomVisual().text(this.memory.boostState, startPos.x + 26, startPos.y + line + 2, { color: 'lime' })
        } else {
            new RoomVisual().text(`${room.memory.labTargetCompound ? room.memory.labTargetCompound : '-'}`, startPos.x + 26, startPos.y + line + 2, { color: room.memory.labTargetCompound ? 'lime' : room.memory.labs ? 'yellow' : 'magenta' })
        }
        new RoomVisual().text(`${room.memory.factoryObjective ? room.memory.factoryObjective : '-'}`, startPos.x + 30, startPos.y + line + 2, { color: room.memory.factoryObjective ? 'lime' : 'magenta' })

        new RoomVisual().text(`${Math.round(room.structures.minProtectionHits / 10000) / 100}M`, startPos.x + 34, startPos.y + line + 2, { color: room.structures.minProtectionHits > 20000000 ? 'lime' : 'magenta' })

    }
}