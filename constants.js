global.MY_NAME = 'Harabi'

global.SHARD = Game.shard.name

global.MILLION = 1000000

global.KILO = 1000

global.barrierCosts = new PathFinder.CostMatrix
for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
        barrierCosts.set(x, y, 255)
    }
}

global.STRUCTURE_TYPES = [
    STRUCTURE_SPAWN,
    STRUCTURE_EXTENSION,
    STRUCTURE_ROAD,
    STRUCTURE_WALL,
    STRUCTURE_RAMPART,
    STRUCTURE_KEEPER_LAIR,
    STRUCTURE_PORTAL,
    STRUCTURE_CONTROLLER,
    STRUCTURE_LINK,
    STRUCTURE_STORAGE,
    STRUCTURE_TOWER,
    STRUCTURE_OBSERVER,
    STRUCTURE_POWER_BANK,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_EXTRACTOR,
    STRUCTURE_LAB,
    STRUCTURE_TERMINAL,
    STRUCTURE_CONTAINER,
    STRUCTURE_NUKER,
    STRUCTURE_FACTORY,
    STRUCTURE_INVADER_CORE,
]

global.BUILD_PRIORITY = {
    spawn: 0,
    link: 1,
    storage: 1,
    tower: 2,
    extension: 3,
    road: 4,
    extractor: 5,
    container: 5,
    lab: 6,
    terminal: 6,
    wall: 7,
    rampart: 7,
    observer: 7,
    powerSpawn: 8,
    nuker: 9,
    factory: 9,
}

global.CREEP_ROELS = [
    'miner',
    'hauler',
    'laborer',
    'extractor',
    'researcher',
    'reserver',
    'claimer',
    'pioneer',
    'colonyLaborer',
    'colonyMiner',
    'colonyHauler',
    'colonyDefender',
    'colonyCoreDefender',
    'wallMaker',
    'attacker',
    'healer',
    'depositWorker',
    'looter',
    'scouter',
    'filler',
    'manager',
    'dismantler',
    'roomDefender',
]

global.SELF_DIRECTED_CREEP_ROELS = [
    'miner',
    'extractor',
    'reserver',
    'claimer',
    'pioneer',
    'colonyLaborer',
    'colonyMiner',
    'colonyHauler',
    'colonyDefender',
    'colonyCoreDefender',
    'wallMaker',
    'researcher'
]

global.CROSS = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
]

global.NEAR = [
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
]

global.ECONOMY_STANDARD = {
    1: 10000,
    2: 10000,
    3: 10000,
    4: 10000,
    5: 20000,
    6: 50000,
    7: 100000,
    8: 150000,
}

global.BUFFER = {
    1: 1000,
    2: 1000,
    3: 1000,
    4: 2000,
    5: 3000,
    6: 5000,
    7: 7000,
    8: 10000,
}

global.WORK_BY_CONTROLLER_LEVEL = [
    { min: 0, max: 0 },
    { min: 4, max: 4 },
    { min: 4, max: 16 },
    { min: 4, max: 20 },
    { min: 6, max: 24 },
    { min: 9, max: 27 },
    { min: 10, max: 33 },
    { min: 10, max: 32 },
]

global.ROOMNAMES_TO_AVOID = [

]

global.BASIC_MINERALS = ['H', 'O', 'Z', 'K', 'U', 'L', 'X']

global.ATTACK_BOOST_COMPOUNDS_TIER2 = {
    UH2O: { ratio: 2, resourceType0: 'UH', resourceType1: 'OH' },
    KHO2: { ratio: 2, resourceType0: 'KO', resourceType1: 'OH' },
    LHO2: { ratio: 2, resourceType0: 'LO', resourceType1: 'OH' },
    ZHO2: { ratio: 2, resourceType0: 'ZO', resourceType1: 'OH' },
    GHO2: { ratio: 2, resourceType0: 'GO', resourceType1: 'OH' },
}

global.ATTACK_BOOST_COMPOUNDS_TIER3 = {
    XUH2O: { ratio: 2, resourceType0: 'UH2O', resourceType1: 'X' },
    XKHO2: { ratio: 2, resourceType0: 'KHO2', resourceType1: 'X' },
    XLHO2: { ratio: 2, resourceType0: 'LHO2', resourceType1: 'X' },
    XZHO2: { ratio: 2, resourceType0: 'ZHO2', resourceType1: 'X' },
    XGHO2: { ratio: 2, resourceType0: 'GHO2', resourceType1: 'X' },
}

global.BASE_COMPOUNDS = {
    OH: { ratio: 2, resourceType0: 'O', resourceType1: 'H' },
    ZK: { ratio: 2, resourceType0: 'Z', resourceType1: 'K' },
    UL: { ratio: 2, resourceType0: 'U', resourceType1: 'L' },
    G: { ratio: 2, resourceType0: 'ZK', resourceType1: 'UL' },
}

global.TIER1_COMPOUNDS = {
    UH: { ratio: 2, resourceType0: 'U', resourceType1: 'H' },
    UO: { ratio: 2, resourceType0: 'U', resourceType1: 'O' },
    KH: { ratio: 2, resourceType0: 'K', resourceType1: 'H' },
    KO: { ratio: 2, resourceType0: 'K', resourceType1: 'O' },
    LH: { ratio: 2, resourceType0: 'L', resourceType1: 'H' },
    LO: { ratio: 2, resourceType0: 'L', resourceType1: 'O' },
    ZH: { ratio: 2, resourceType0: 'Z', resourceType1: 'H' },
    ZO: { ratio: 2, resourceType0: 'Z', resourceType1: 'O' },
    GH: { ratio: 2, resourceType0: 'G', resourceType1: 'H' },
    GO: { ratio: 2, resourceType0: 'G', resourceType1: 'O' },
}

global.TIER2_COMPOUNDS = {
    UH2O: { ratio: 2, resourceType0: 'UH', resourceType1: 'OH' },
    UHO2: { ratio: 2, resourceType0: 'UO', resourceType1: 'OH' },
    KH2O: { ratio: 2, resourceType0: 'KH', resourceType1: 'OH' },
    KHO2: { ratio: 2, resourceType0: 'KO', resourceType1: 'OH' },
    LH2O: { ratio: 2, resourceType0: 'LH', resourceType1: 'OH' },
    LHO2: { ratio: 2, resourceType0: 'LO', resourceType1: 'OH' },
    ZH2O: { ratio: 2, resourceType0: 'ZH', resourceType1: 'OH' },
    ZHO2: { ratio: 2, resourceType0: 'ZO', resourceType1: 'OH' },
    GH2O: { ratio: 2, resourceType0: 'GH', resourceType1: 'OH' },
    GHO2: { ratio: 2, resourceType0: 'GO', resourceType1: 'OH' },
}

global.TIER3_COMPOUNDS = {
    XUH2O: { ratio: 2, resourceType0: 'UH2O', resourceType1: 'X' },
    XUHO2: { ratio: 2, resourceType0: 'UHO2', resourceType1: 'X' },
    XKH2O: { ratio: 2, resourceType0: 'KH2O', resourceType1: 'X' },
    XKHO2: { ratio: 2, resourceType0: 'KHO2', resourceType1: 'X' },
    XLH2O: { ratio: 2, resourceType0: 'LH2O', resourceType1: 'X' },
    XLHO2: { ratio: 2, resourceType0: 'LHO2', resourceType1: 'X' },
    XZH2O: { ratio: 2, resourceType0: 'ZH2O', resourceType1: 'X' },
    XZHO2: { ratio: 2, resourceType0: 'ZHO2', resourceType1: 'X' },
    XGH2O: { ratio: 2, resourceType0: 'GH2O', resourceType1: 'X' },
    XGHO2: { ratio: 2, resourceType0: 'GHO2', resourceType1: 'X' },
}

global.COMPOUNDS_FORMULA = {
    OH: { ratio: 10, resourceType0: 'O', resourceType1: 'H' },
    ZK: { ratio: 2, resourceType0: 'Z', resourceType1: 'K' },
    UL: { ratio: 2, resourceType0: 'U', resourceType1: 'L' },
    G: { ratio: 2, resourceType0: 'ZK', resourceType1: 'UL' },

    UH: { ratio: 2, resourceType0: 'U', resourceType1: 'H' },
    UO: { ratio: 2, resourceType0: 'U', resourceType1: 'O' },
    KH: { ratio: 2, resourceType0: 'K', resourceType1: 'H' },
    KO: { ratio: 2, resourceType0: 'K', resourceType1: 'O' },
    LH: { ratio: 2, resourceType0: 'L', resourceType1: 'H' },
    LO: { ratio: 2, resourceType0: 'L', resourceType1: 'O' },
    ZH: { ratio: 2, resourceType0: 'Z', resourceType1: 'H' },
    ZO: { ratio: 2, resourceType0: 'Z', resourceType1: 'O' },
    GH: { ratio: 2, resourceType0: 'G', resourceType1: 'H' },
    GO: { ratio: 2, resourceType0: 'G', resourceType1: 'O' },

    UH2O: { ratio: 2, resourceType0: 'UH', resourceType1: 'OH' },
    UHO2: { ratio: 2, resourceType0: 'UO', resourceType1: 'OH' },
    KH2O: { ratio: 2, resourceType0: 'KH', resourceType1: 'OH' },
    KHO2: { ratio: 2, resourceType0: 'KO', resourceType1: 'OH' },
    LH2O: { ratio: 2, resourceType0: 'LH', resourceType1: 'OH' },
    LHO2: { ratio: 2, resourceType0: 'LO', resourceType1: 'OH' },
    ZH2O: { ratio: 2, resourceType0: 'ZH', resourceType1: 'OH' },
    ZHO2: { ratio: 2, resourceType0: 'ZO', resourceType1: 'OH' },
    GH2O: { ratio: 2, resourceType0: 'GH', resourceType1: 'OH' },
    GHO2: { ratio: 2, resourceType0: 'GO', resourceType1: 'OH' },

    XUH2O: { ratio: 2, resourceType0: 'UH2O', resourceType1: 'X' },
    XUHO2: { ratio: 2, resourceType0: 'UHO2', resourceType1: 'X' },
    XKH2O: { ratio: 2, resourceType0: 'KH2O', resourceType1: 'X' },
    XKHO2: { ratio: 2, resourceType0: 'KHO2', resourceType1: 'X' },
    XLH2O: { ratio: 2, resourceType0: 'LH2O', resourceType1: 'X' },
    XLHO2: { ratio: 2, resourceType0: 'LHO2', resourceType1: 'X' },
    XZH2O: { ratio: 2, resourceType0: 'ZH2O', resourceType1: 'X' },
    XZHO2: { ratio: 2, resourceType0: 'ZHO2', resourceType1: 'X' },
    XGH2O: { ratio: 2, resourceType0: 'GH2O', resourceType1: 'X' },
    XGHO2: { ratio: 2, resourceType0: 'GHO2', resourceType1: 'X' },
}

global.BOOSTS_EFFECT = {
    UH: { type: ATTACK },
    UO: { type: WORK },
    KH: { type: CARRY },
    KO: { type: RANGED_ATTACK },
    LH: { type: WORK },
    LO: { type: HEAL },
    ZH: { type: WORK },
    ZO: { type: MOVE },
    GH: { type: WORK },
    GO: { type: TOUGH },

    UH2O: { type: ATTACK },
    UHO2: { type: WORK },
    KH2O: { type: CARRY },
    KHO2: { type: RANGED_ATTACK },
    LH2O: { type: WORK },
    LHO2: { type: HEAL },
    ZH2O: { type: WORK },
    ZHO2: { type: MOVE },
    GH2O: { type: WORK },
    GHO2: { type: TOUGH },

    XUH2O: { type: ATTACK },
    XUHO2: { type: WORK },
    XKH2O: { type: CARRY },
    XKHO2: { type: RANGED_ATTACK },
    XLH2O: { type: WORK },
    XLHO2: { type: HEAL },
    XZH2O: { type: WORK },
    XZHO2: { type: MOVE },
    XGH2O: { type: WORK },
    XGHO2: { type: TOUGH },
}

global.USEFULL_COMPOUNDS = [
    'XUH2O',
    'UH2O',
    'UH',
    'XKHO2',
    'XLHO2',
    'XZH2O',
    'XZHO2',
    'XGHO2',
    'XGH2O',
]

global.COMPOUNDS_MANUFACTURING_TIME = {
    ZO: 10,
    KO: 10,
    UH: 10,
    LO: 10,
    OH: 20,
    ZK: 5,
    UL: 5,
    UO: 10,
    UH2O: 35,
    UHO2: 35,
    KHO2: 35,
    LHO2: 35,
    ZHO2: 35,
    G: 15,
    GO: 25,
    GH: 25,
    GHO2: 75,
    GH2O: 60,
    XUH2O: 95,
    XUHO2: 95,
    XKHO2: 95,
    XLHO2: 95,
    XZHO2: 95,
    XGH2O: 140,
    XGHO2: 225,
}

global.CONTROLLER_PROGRESS_TO_LEVELS = {
    1: 0,
    2: 200,
    3: 45200,
    4: 180200,
    5: 585200,
    6: 1800200,
    7: 5445200,
    8: 16380200
}

global.RAW_RESOURCES = [
    'metal', 'biomass', 'silicon', 'mist'
]

global.BASIC_REGIONAL_COMMODITIES = {
    wire: { utrium_bar: 20, silicon: 100, energy: 40 },
    cell: { lemergium_bar: 20, biomass: 100, energy: 40 },
    alloy: { zynthium_bar: 20, metal: 100, energy: 40 },
    condensate: { keanium_bar: 20, mist: 100, energy: 40 },
}

global.FACTORY_COMPONENTS = {
    wire: { silicon: 100, utrium_bar: 20, energy: 40 },
    cell: { biomass: 100, lemergium_bar: 20, energy: 40 },
    alloy: { metal: 100, zynthium_bar: 20, energy: 40 },
    condensate: { mist: 100, keanium_bar: 20, energy: 40 },

    phlegm: { cell: 20, oxidant: 36, lemergium_bar: 16, energy: 8 },

    utrium_bar: { U: 500, energy: 200 },
    lemergium_bar: { L: 500, energy: 200 },
    zynthium_bar: { Z: 500, energy: 200 },
    keanium_bar: { K: 500, energy: 200 },
    oxidant: { O: 500, energy: 200 }
}

global.FACTORY_OBJECTIVES = {
    biological: ['cell', 'phlegm', 'tissue', 'muscle', 'organoid', 'organism', 'biomass'],
    mystical: ['condensate', 'concentrate', 'extract', 'spirit', 'emanation', 'essence', 'mist'],
    mechanical: ['alloy', 'tube', 'fixtures', 'frame', 'hydraulics', 'machine', 'metal'],
    electronical: ['wire', 'switch', 'transistor', 'microchip', 'circuit', 'device', 'silicon']
}

global.COMMODITIES_TO_SELL = [
    'biomass', 'mist', 'metal', 'silicon',
    'cell', 'phlegm', 'tissue', 'muscle', 'organoid', 'organism',
    'condensate', 'concentrate', 'extract', 'spirit', 'emanation', 'essence',
    'alloy', 'tube', 'fixtures', 'frame', 'hydraulics', 'machine',
    'wire', 'switch', 'transistor', 'microchip', 'circuit', 'device',
]

global.COMMODITIES_AMOUNT_TO_KEEP = [5000, 300, 30, 10, 5, 5]

global.RESOURCES_TO_FACTORY = {
    RESOURCE_SILICON: 'silicon',
    RESOURCE_METAL: 'metal',
    RESOURCE_BIOMASS: 'biomass',
    RESOURCE_MIST: 'mist',

    RESOURCE_UTRIUM_BAR: 'utrium_bar',
    RESOURCE_LEMERGIUM_BAR: 'lemergium_bar',
    RESOURCE_ZYNTHIUM_BAR: 'zynthium_bar',
    RESOURCE_KEANIUM_BAR: 'keanium_bar',
    RESOURCE_GHODIUM_MELT: 'ghodium_melt',
    RESOURCE_OXIDANT: 'oxidant',
    RESOURCE_REDUCTANT: 'reductant',
    RESOURCE_PURIFIER: 'purifier',
    RESOURCE_BATTERY: 'battery',

    RESOURCE_COMPOSITE: 'composite',
    RESOURCE_CRYSTAL: 'crystal',
    RESOURCE_LIQUID: 'liquid',

    RESOURCE_WIRE: 'wire',
    RESOURCE_SWITCH: 'switch',
    RESOURCE_TRANSISTOR: 'transistor',
    RESOURCE_MICROCHIP: 'microchip',
    RESOURCE_CIRCUIT: 'circuit',
    RESOURCE_DEVICE: 'device',

    RESOURCE_CELL: 'cell',
    RESOURCE_PHLEGM: 'phlegm',
    RESOURCE_TISSUE: 'tissue',
    RESOURCE_MUSCLE: 'muscle',
    RESOURCE_ORGANOID: 'organoid',
    RESOURCE_ORGANISM: 'organism',

    RESOURCE_ALLOY: 'alloy',
    RESOURCE_TUBE: 'tube',
    RESOURCE_FIXTURES: 'fixtures',
    RESOURCE_FRAME: 'frame',
    RESOURCE_HYDRAULICS: 'hydraulics',
    RESOURCE_MACHINE: 'machine',

    RESOURCE_CONDENSATE: 'condensate',
    RESOURCE_CONCENTRATE: 'concentrate',
    RESOURCE_EXTRACT: 'extract',
    RESOURCE_SPIRIT: 'spirit',
    RESOURCE_EMANATION: 'emanation',
    RESOURCE_ESSENCE: 'essence',
}

global.RESOURCES_TO_TERMINAL = {
    RESOURCE_POWER: "power",

    RESOURCE_HYDROGEN: "H",
    RESOURCE_OXYGEN: "O",
    RESOURCE_UTRIUM: "U",
    RESOURCE_LEMERGIUM: "L",
    RESOURCE_KEANIUM: "K",
    RESOURCE_ZYNTHIUM: "Z",
    RESOURCE_CATALYST: "X",
    RESOURCE_GHODIUM: "G",

    RESOURCE_HYDROXIDE: "OH",
    RESOURCE_ZYNTHIUM_KEANITE: "ZK",
    RESOURCE_UTRIUM_LEMERGITE: "UL",

    RESOURCE_UTRIUM_HYDRIDE: "UH",
    RESOURCE_UTRIUM_OXIDE: "UO",
    RESOURCE_KEANIUM_HYDRIDE: "KH",
    RESOURCE_KEANIUM_OXIDE: "KO",
    RESOURCE_LEMERGIUM_HYDRIDE: "LH",
    RESOURCE_LEMERGIUM_OXIDE: "LO",
    RESOURCE_ZYNTHIUM_HYDRIDE: "ZH",
    RESOURCE_ZYNTHIUM_OXIDE: "ZO",
    RESOURCE_GHODIUM_HYDRIDE: "GH",
    RESOURCE_GHODIUM_OXIDE: "GO",

    RESOURCE_UTRIUM_ACID: "UH2O",
    RESOURCE_UTRIUM_ALKALIDE: "UHO2",
    RESOURCE_KEANIUM_ACID: "KH2O",
    RESOURCE_KEANIUM_ALKALIDE: "KHO2",
    RESOURCE_LEMERGIUM_ACID: "LH2O",
    RESOURCE_LEMERGIUM_ALKALIDE: "LHO2",
    RESOURCE_ZYNTHIUM_ACID: "ZH2O",
    RESOURCE_ZYNTHIUM_ALKALIDE: "ZHO2",
    RESOURCE_GHODIUM_ACID: "GH2O",
    RESOURCE_GHODIUM_ALKALIDE: "GHO2",

    RESOURCE_CATALYZED_UTRIUM_ACID: "XUH2O",
    RESOURCE_CATALYZED_UTRIUM_ALKALIDE: "XUHO2",
    RESOURCE_CATALYZED_KEANIUM_ACID: "XKH2O",
    RESOURCE_CATALYZED_KEANIUM_ALKALIDE: "XKHO2",
    RESOURCE_CATALYZED_LEMERGIUM_ACID: "XLH2O",
    RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE: "XLHO2",
    RESOURCE_CATALYZED_ZYNTHIUM_ACID: "XZH2O",
    RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE: "XZHO2",
    RESOURCE_CATALYZED_GHODIUM_ACID: "XGH2O",
    RESOURCE_CATALYZED_GHODIUM_ALKALIDE: "XGHO2",
}

global.INVADER_BODY_PARTS = ['attack', 'ranged_attack', 'heal', 'work']