global.allies = []

if (Game.shard.name = 'swc') {
  allies = [
    'Yoner',
    'Trepidimous',
    'MadDokMike',
    'Modus',
    'Robalian',
    'asdpof',
    'Mirroar',
    'SBense',
    'Nightdragon'
  ];
}

const wordShards = ['shard0', 'shard1', 'shard2', 'shard3']

if (wordShards.includes(Game.shard.name)) {
  allies = []
}

Room.prototype.findHostileCreeps = function () {
  if (this._hostileCreeps !== undefined) {
    return this._hostileCreeps
  }
  const hostileCreeps = this.find(FIND_HOSTILE_CREEPS)
  const hostileCreepsFiltered = hostileCreeps.filter(creep => {
    return !creep.isAlly()
  })
  return this._hostileCreeps = hostileCreepsFiltered
}

Creep.prototype.isAlly = function () {
  return allies.includes(this.owner.username)
}