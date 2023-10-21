require('constants')
require('data')
require('global_overlord')
require('function_visualizeRoomInfo')
require('global_business')
require('global_function')
require('manager_attack')
require('manager_base')
require('manager_claim')
require('manager_defense')
require('manager_defenseNuke')
require('manager_dismantleRoom')
require('manager_harass')
require('manager_clearAll')
require('manager_highway_mining')
require('manager_lootRoom')
require('manager_quad')
require('manager_reconstruction')
require('manager_room')
require('manager_remote')
require('manager_scout')
require('manager_traffic')
require('manager_war')
require('prototype_creep_attacker')
require('prototype_creep_hauler')
require('prototype_creep_powerCreep')
require('prototype_creep_researcher')
require('prototype_room')
require('prototype_roomPosition')
require('prototype_roomVisual')
require('prototype_source')
require('prototype_structures')
require('prototype_structures_terminal')
require('prototype_creep')
require('prototype_flag_intersharding')
require('prototype_flag')
require('prototype_room_boost_management')
require('prototype_room_energy_management')
require('prototype_room_factory_operation')
require('prototype_room_lab_operation')
require('prototype_room_spawn_management')
require('prototype_room_work_management')
require('prototype_room_powerSpawn_operation')
require('util_base_planner')
require('util_defenseCostMatrix')
require('util_dijkstra')
require('util_distance_transform')
require('util_flood_fill')
require('util_heap')
require('util_min-cut')

// Any modules that you use that modify the game's prototypes should be require'd
// before you require the profiler.
const profiler = require('screeps-profiler');

// This line monkey patches the global prototypes.
profiler.enable();
global.CPU = new Array
console.log('reset')

// when global reset happens, clean room memory
Overlord.cleanRoomMemory()

module.exports.loop = () => {
    Overlord.memHack.pretick()

    profiler.wrap(function () {
        // bucket check. 8000 5000 2000
        if (Game.cpu.bucket < 100) {
            return
        }

        if (data.enoughCPU && Game.cpu.bucket < 5000) { // stop market, highwaymining
            data.enoughCPU = false
        } else if (!data.enoughCPU && Game.cpu.bucket > 8000) {
            data.enoughCPU = true
        }

        if (data.okCPU && Game.cpu.bucket < 2000) { // stop lab
            data.okCPU = false
        } else if (!data.okCPU && Game.cpu.bucket > 5000) {
            data.okCPU = true
        }

        if (!data.cpuEmergency && Game.cpu.bucket < 1000) {
            data.cpuEmergency = true
        } else if (data.cpuEmergency && Game.cpu.bucket > 2000) {
            data.cpuEmergency = false
        }

        if (data.isEnoughCredit && Game.market.credits < 10000000) {
            data.isEnoughCredit = false
        } else if (!data.isEnoughCredit && Game.market.credits > 20000000) {
            data.isEnoughCredit = true
        }

        // flag 실행

        for (const flag of Object.values(Game.flags)) {
            const name = flag.name.toLowerCase()
            const roomName = flag.pos.roomName
            if (name.includes('colony')) {
                colonize(roomName)
                flag.remove()
                continue
            }
            if (name.includes('claim')) {
                claim(roomName)
                flag.remove()
                continue
            }
            if (name.includes('attack')) {
                flag.attackRoom()
                continue
            }
            if (name.includes('clear')) {
                flag.manageClearAll()
                continue
            }
            if (name.includes('reconstruction')) {
                flag.manageReconstruction()
                continue
            }
            if (name.includes('harass')) {
                const number = name.includes('three') ? 3 : name.includes('two') ? 2 : 1
                flag.harass(number)
                continue
            }
            if (name.includes('loot')) {
                flag.lootRoom()
                continue
            }
            if (name.includes('dismantle')) {
                flag.dismantleRoom()
                continue
            }
            if (name.includes('send')) {
                flag.sendIntershardingCreeps()
                continue
            }
            if (name.includes('intershard')) {
                flag.claimIntershard()
                continue
            }
            if (name.includes('analyze')) {
                Overlord.observeRoom(flag.pos.roomName)
                if (flag.room) {
                    flag.room.optimizeBasePlan()
                }
                continue
            }
            if (name.includes('baseplan')) {
                Overlord.observeRoom(flag.pos.roomName)
                if (flag.room) {
                    flag.room.getBasePlanByPos(flag.pos)
                }
                continue
            }
            if (name.includes('war')) {
                flag.conductWar()
                continue
            }
            if (name.includes('quad')) {
                flag.manageQuad()
            }
        }

        // creeps 방별로, 역할별로 분류

        Overlord.classifyCreeps()

        // 방마다 roomManager 동작
        for (const room of Object.values(Game.rooms)) {
            room.runRoomManager()
        }

        for (const room of Object.values(Game.rooms)) {
            room.manageTraffic()
        }



        // powerCreep 실행
        for (const powerCreep of Object.values(Game.powerCreeps)) {
            const roomName = powerCreep.name.split(' ')[0]
            if (!Game.rooms[roomName]) {
                continue
            }
            if (!powerCreep.room) {
                Game.rooms[roomName].memory.hasOperator = false
                const powerSpawn = Game.rooms[roomName].structures.powerSpawn[0]
                if (!powerSpawn) {
                    continue
                }
                powerCreep.spawn(powerSpawn)
                continue
            }
            Game.rooms[roomName].memory.hasOperator = true
            powerCreep.actRoomOperator()
        }

        // 없어진 flag 메모리 삭제
        if (Memory.flags) {
            Object.keys(Memory.flags).forEach( //메모리에 있는 flag 이름마다 검사
                function (flag) {
                    if (!Game.flags[flag]) //해당 이름을 가진 flag가 존재하지 않으면
                    {
                        delete Memory.flags[flag]; //메모리를 지운다
                    }
                }
            )
        }


        // 완료된 order 및 안보이는 방 memory 삭제 및 pixel 구입
        if (Game.time % 300 === 0) {
            //죽은 크립 메모리 삭제
            if (Object.keys(Memory.creeps).length > Object.keys(Game.creeps).length) {
                Object.keys(Memory.creeps).forEach( //메모리에 있는 크립이름마다 검사
                    function (creep) {
                        if (!Game.creeps[creep]) { //해당 이름을 가진 크립이 존재하지 않으면
                            delete Memory.creeps[creep]; //메모리를 지운다
                        }
                    })
            }

            const finishedOrders = Object.values(Game.market.orders).filter(order => order.active === false)
            for (const order of finishedOrders) {
                Game.market.cancelOrder(order.id)
            }

            // if (Game.market.credits > 20000000) {
            //     Business.buy('pixel', 100)
            // }
        }

        if (data.observe) {
            Overlord.observeRoom(data.observe.roomName, data.observe.tick)
        }

        if (data.enoughCPU) {
            const terminal = Overlord.structures.terminal.sort()[data.terminalOrder]
            data.terminalOrder = (data.terminalOrder + 1) % (Overlord.structures.terminal.length)
            if (terminal && (!Memory.abandon || !Memory.abandon.includes(terminal.room.name))) {
                terminal.run()
            }
        }

        if (data.info) {
            try {
                Overlord.visualizeRoomInfo()
                Overlord.mapInfo()
            } catch (err) {
                console.log(err)
            }
        } else {
            Overlord.purgeMapInfo()
            new RoomVisual().text('time: ' + Game.time, 0, 46, { align: 'left' })
            new RoomVisual().text('CPU: ' + Game.cpu.getUsed(), 0, 47, { align: 'left' })
            new RoomVisual().text("AvgCPU: " + Math.round(100 * (_.sum(CPU) / CPU.length)) / 100 + `(for ${CPU.length} ticks)`, 0, 48, { align: 'left' })
            new RoomVisual().text(`bucket: ${Game.cpu.bucket}(${data.enoughCPU ? 'market, ' : ''}${data.okCPU ? 'lab' : ''})`, 0, 49, { align: 'left' })
        }


        CPU.push(Math.floor(Game.cpu.getUsed()))
        if (CPU.length > 200) {
            CPU.shift()
        }

    });
}

