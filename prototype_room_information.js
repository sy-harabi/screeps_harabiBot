Object.defineProperties(Room.prototype, {
    efficiency: {
        get() {
            if (this.controller.level === 8) {
                return false
            }
            const progress = this.controller.totalProgress - this.memory.info[0].progress
            const tick = Game.time - this.memory.info[0].tick
            return progress / tick / 20
        }
    },
    progressTime: {
        get() {
            return (new Date().getTime() - this.memory.info[0].time) / 1000 / 60 / 60
        }
    },
    progressPerHour: {
        get() {
            if (this.controller.level === 8) {
                return false
            }
            const progress = this.controller.totalProgress - this.memory.info[0].progress
            const time = this.progressTime //시간으로 계산
            return progress / time
        }
    },
    hoursToNextRCL: {
        get() {
            return (this.controller.progressTotal - this.controller.progress) / this.progressPerHour
        }
    }
})