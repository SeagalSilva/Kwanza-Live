// Multi-phase Dungeon definitions & floor generators.
// Extensible: append new phases to DUNGEON_PHASES as new themes open.

export const CROP_IDS = ["corn", "beans", "peanut", "cassava", "banana", "pineapple"];
export const SEED_MAP = {
  corn: "seed_corn",
  beans: "seed_beans",
  peanut: "seed_peanut",
  cassava: "seed_cassava",
  banana: "seed_banana",
  pineapple: "seed_pineapple"
};

export const DUNGEON_PHASES = [
  {
    id: "forest_entrance",
    number: 1,
    namePt: "A entrada da Dungeon",
    nameEn: "The Dungeon Entrance",
    theme: "forest",
    themeLabelPt: "Floresta",
    themeLabelEn: "Forest",
    descPt: "Uma clareira ancestral tomada por slimes, lobos, goblins e pelo Guardião Ancião da Floresta no 10º andar.",
    descEn: "An ancient woodland clearing overrun by slimes, wolves, goblins, and the Elder Forest Guardian on Floor 10.",
    totalFloors: 10,
    unlockedByDefault: true,
    comingSoon: false
  },
  {
    id: "crystal_caverns",
    number: 2,
    namePt: "Cavernas Cristalinas",
    nameEn: "Crystal Caverns",
    theme: "cave",
    themeLabelPt: "Cristal",
    themeLabelEn: "Crystal",
    descPt: "Galerias subterrâneas repletas de golens de quartzo e morcegos sombrios.",
    descEn: "Subterranean galleries guarded by quartz golems and shadow bats.",
    totalFloors: 10,
    unlockedByDefault: false,
    comingSoon: true
  },
  {
    id: "ember_ruins",
    number: 3,
    namePt: "Ruínas de Brasa",
    nameEn: "Ember Ruins",
    theme: "volcano",
    themeLabelPt: "Vulcão",
    themeLabelEn: "Volcano",
    descPt: "Templos antigos rodeados por lava e cavaleiros de obsidiana.",
    descEn: "Ancient temples surrounded by lava and obsidian knights.",
    totalFloors: 10,
    unlockedByDefault: false,
    comingSoon: true
  }
];

const FOREST_FLOORS = [
  {
    floor: 1,
    namePt: "Trilho das Folhas",
    nameEn: "Leafy Trail",
    enemies: [
      { kind: "moss_slime", namePt: "Slime Musgoso", nameEn: "Moss Slime", hp: 24, atk: 8, speed: 1.45, atkCooldownMs: 2100, x: 8, y: 7 },
      { kind: "moss_slime", namePt: "Slime Musgoso", nameEn: "Moss Slime", hp: 24, atk: 8, speed: 1.45, atkCooldownMs: 2100, x: 14, y: 7 }
    ]
  },
  {
    floor: 2,
    namePt: "Clareira Úmida",
    nameEn: "Damp Clearing",
    enemies: [
      { kind: "moss_slime", namePt: "Slime Musgoso", nameEn: "Moss Slime", hp: 26, atk: 9, speed: 1.5, atkCooldownMs: 2050, x: 7, y: 8 },
      { kind: "moss_slime", namePt: "Slime Musgoso", nameEn: "Moss Slime", hp: 26, atk: 9, speed: 1.5, atkCooldownMs: 2050, x: 15, y: 8 },
      { kind: "wild_boar", namePt: "Javali Silvestre", nameEn: "Wild Boar", hp: 34, atk: 11, speed: 1.9, atkCooldownMs: 1950, x: 11, y: 6 }
    ]
  },
  {
    floor: 3,
    namePt: "Raízes Antigas",
    nameEn: "Ancient Roots",
    enemies: [
      { kind: "wild_boar", namePt: "Javali Silvestre", nameEn: "Wild Boar", hp: 36, atk: 11, speed: 1.95, atkCooldownMs: 1900, x: 7, y: 7 },
      { kind: "wild_boar", namePt: "Javali Silvestre", nameEn: "Wild Boar", hp: 36, atk: 11, speed: 1.95, atkCooldownMs: 1900, x: 15, y: 7 },
      { kind: "canopy_spider", namePt: "Aranha da Copa", nameEn: "Canopy Spider", hp: 38, atk: 12, speed: 2.05, atkCooldownMs: 1850, x: 11, y: 5 }
    ]
  },
  {
    floor: 4,
    namePt: "Bosque dos Lobos",
    nameEn: "Wolf Woods",
    enemies: [
      { kind: "forest_wolf", namePt: "Lobo da Floresta", nameEn: "Forest Wolf", hp: 42, atk: 13, speed: 2.15, atkCooldownMs: 1800, x: 7, y: 8 },
      { kind: "forest_wolf", namePt: "Lobo da Floresta", nameEn: "Forest Wolf", hp: 42, atk: 13, speed: 2.15, atkCooldownMs: 1800, x: 15, y: 8 },
      { kind: "alpha_wolf", namePt: "Lobo Alfa", nameEn: "Alpha Wolf", hp: 52, atk: 14, speed: 2.25, atkCooldownMs: 1750, x: 11, y: 5 }
    ]
  },
  {
    floor: 5,
    namePt: "Teia Sombria (Mini-Chefe)",
    nameEn: "Shadow Web (Mini-Boss)",
    enemies: [
      { kind: "canopy_spider", namePt: "Aranha da Copa", nameEn: "Canopy Spider", hp: 40, atk: 12, speed: 2.0, atkCooldownMs: 1850, x: 7, y: 8 },
      { kind: "canopy_spider", namePt: "Aranha da Copa", nameEn: "Canopy Spider", hp: 40, atk: 12, speed: 2.0, atkCooldownMs: 1850, x: 15, y: 8 },
      { kind: "spider_queen", namePt: "Aranha Rainha", nameEn: "Spider Queen", hp: 82, atk: 16, speed: 1.9, atkCooldownMs: 1700, x: 11, y: 5.5, isMiniBoss: true }
    ]
  },
  {
    floor: 6,
    namePt: "Ruínas Verdes",
    nameEn: "Verdant Ruins",
    enemies: [
      { kind: "forest_wolf", namePt: "Lobo da Floresta", nameEn: "Forest Wolf", hp: 46, atk: 13, speed: 2.1, atkCooldownMs: 1800, x: 6, y: 8 },
      { kind: "goblin_scout", namePt: "Goblin Batedor", nameEn: "Goblin Scout", hp: 50, atk: 14, speed: 2.0, atkCooldownMs: 1750, x: 11, y: 6.5 },
      { kind: "goblin_scout", namePt: "Goblin Batedor", nameEn: "Goblin Scout", hp: 50, atk: 14, speed: 2.0, atkCooldownMs: 1750, x: 16, y: 8 }
    ]
  },
  {
    floor: 7,
    namePt: "Altar do Musgo",
    nameEn: "Moss Altar",
    enemies: [
      { kind: "goblin_guard", namePt: "Goblin Guardião", nameEn: "Goblin Guard", hp: 58, atk: 15, speed: 1.85, atkCooldownMs: 1800, x: 7, y: 8 },
      { kind: "goblin_guard", namePt: "Goblin Guardião", nameEn: "Goblin Guard", hp: 58, atk: 15, speed: 1.85, atkCooldownMs: 1800, x: 15, y: 8 },
      { kind: "forest_wisp", namePt: "Espectro da Mata", nameEn: "Forest Wisp", hp: 54, atk: 16, speed: 2.2, atkCooldownMs: 1700, x: 11, y: 5 }
    ]
  },
  {
    floor: 8,
    namePt: "Troncos Corrompidos",
    nameEn: "Corrupted Trunks",
    enemies: [
      { kind: "goblin_guard", namePt: "Goblin Guardião", nameEn: "Goblin Guard", hp: 60, atk: 15, speed: 1.85, atkCooldownMs: 1800, x: 6.5, y: 8.5 },
      { kind: "young_treant", namePt: "Ente Jovem", nameEn: "Young Treant", hp: 74, atk: 16, speed: 1.65, atkCooldownMs: 1850, x: 11, y: 5.5 },
      { kind: "goblin_guard", namePt: "Goblin Guardião", nameEn: "Goblin Guard", hp: 60, atk: 15, speed: 1.85, atkCooldownMs: 1800, x: 15.5, y: 8.5 }
    ]
  },
  {
    floor: 9,
    namePt: "Guarda do Santuário",
    nameEn: "Sanctuary Guard",
    enemies: [
      { kind: "dark_treant", namePt: "Ente Sombrio", nameEn: "Dark Treant", hp: 82, atk: 17, speed: 1.65, atkCooldownMs: 1800, x: 7, y: 7.5 },
      { kind: "goblin_shaman", namePt: "Xamã Goblin", nameEn: "Goblin Shaman", hp: 68, atk: 18, speed: 1.95, atkCooldownMs: 1700, x: 11, y: 5 },
      { kind: "dark_treant", namePt: "Ente Sombrio", nameEn: "Dark Treant", hp: 82, atk: 17, speed: 1.65, atkCooldownMs: 1800, x: 15, y: 7.5 }
    ]
  },
  {
    floor: 10,
    namePt: "Coração da Floresta (Chefe)",
    nameEn: "Heart of the Forest (Boss)",
    enemies: [
      { kind: "treant_sentinel", namePt: "Sentinela Ente", nameEn: "Treant Sentinel", hp: 62, atk: 14, speed: 1.6, atkCooldownMs: 1900, x: 6.5, y: 7.5 },
      { kind: "elder_forest_guardian", namePt: "Guardião Ancião da Floresta", nameEn: "Elder Forest Guardian", hp: 155, atk: 20, speed: 1.7, atkCooldownMs: 1650, x: 11, y: 5.2, isBoss: true },
      { kind: "treant_sentinel", namePt: "Sentinela Ente", nameEn: "Treant Sentinel", hp: 62, atk: 14, speed: 1.6, atkCooldownMs: 1900, x: 15.5, y: 7.5 }
    ]
  }
];

export function createEmptyBag() {
  return { bronze: 0, silver: 0, pp: 0, seeds: {} };
}

export function addLootToBag(bag, loot) {
  if (!bag || !loot) return bag;
  if (loot.bronze > 0) bag.bronze = (bag.bronze || 0) + Number(loot.bronze);
  if (loot.silver > 0) bag.silver = (bag.silver || 0) + Number(loot.silver);
  if (loot.pp > 0) bag.pp = (bag.pp || 0) + Number(loot.pp);
  if (loot.seeds && typeof loot.seeds === "object") {
    if (!bag.seeds || typeof bag.seeds !== "object") bag.seeds = {};
    for (const [sid, qty] of Object.entries(loot.seeds)) {
      if (qty > 0) bag.seeds[sid] = (bag.seeds[sid] || 0) + Number(qty);
    }
  }
  return bag;
}

export function hasBagLoot(bag) {
  if (!bag) return false;
  if ((bag.bronze || 0) > 0 || (bag.silver || 0) > 0 || (bag.pp || 0) > 0) return true;
  if (bag.seeds && typeof bag.seeds === "object") {
    for (const qty of Object.values(bag.seeds)) {
      if (qty > 0) return true;
    }
  }
  return false;
}

export function getPhaseConfig(phaseId) {
  return DUNGEON_PHASES.find((p) => p.id === phaseId) || null;
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function buildFloorRunState(phaseId, floorNum, carryBag = null) {
  const phase = getPhaseConfig(phaseId);
  if (!phase || phase.comingSoon) return null;

  const floorIdx = Math.max(1, Math.min(phase.totalFloors, Math.floor(Number(floorNum) || 1)));
  const template = FOREST_FLOORS[floorIdx - 1] || FOREST_FLOORS[0];

  const enemies = template.enemies.map((e, idx) => ({
    id: `f${floorIdx}_e${idx + 1}`,
    kind: e.kind,
    namePt: e.namePt,
    nameEn: e.nameEn,
    hp: e.hp,
    maxHp: e.hp,
    atk: e.atk,
    speed: e.speed || 1.7,
    atkCooldownMs: e.atkCooldownMs || 1900,
    lastHitAt: 0,
    x: e.x,
    y: e.y,
    isBoss: !!e.isBoss,
    isMiniBoss: !!e.isMiniBoss
  }));

  const bag = createEmptyBag();
  if (carryBag) addLootToBag(bag, carryBag);

  return {
    phaseId: phase.id,
    phaseNumber: phase.number,
    phaseNamePt: phase.namePt,
    phaseNameEn: phase.nameEn,
    theme: phase.theme,
    totalFloors: phase.totalFloors,
    floor: floorIdx,
    floorNamePt: template.namePt,
    floorNameEn: template.nameEn,
    isBossFloor: floorIdx === phase.totalFloors,
    hp: 120,
    maxHp: 120,
    atkMin: 16,
    atkMax: 24,
    springUsed: false,
    bag,
    enemies,
    chest: {
      x: 11,
      y: 3.4,
      opened: false,
      loot: null
    },
    cleared: false,
    phaseCompleted: false
  };
}

export function rollEnemyDrop(floorNum, enemy) {
  const f = Math.max(1, Number(floorNum) || 1);
  if (enemy.isBoss) {
    return {
      bronze: randomInt(35, 60),
      pp: randomInt(120, 200)
    };
  }
  if (enemy.isMiniBoss) {
    return {
      bronze: randomInt(15, 28),
      pp: randomInt(45, 80)
    };
  }
  return {
    bronze: randomInt(2 + f, 5 + f * 2),
    pp: randomInt(4 + f * 2, 10 + f * 4)
  };
}

export function rollChestLoot(floorNum) {
  const f = Math.max(1, Number(floorNum) || 1);
  const loot = {
    bronze: 0,
    silver: 0,
    pp: 0,
    seeds: {}
  };

  const addSeed = (count = 1) => {
    const cropId = CROP_IDS[Math.floor(Math.random() * CROP_IDS.length)];
    const seedId = SEED_MAP[cropId] || "seed_corn";
    loot.seeds[seedId] = (loot.seeds[seedId] || 0) + count;
  };

  if (f >= 10) {
    loot.bronze = randomInt(85, 140);
    loot.silver = randomInt(1, 2);
    loot.pp = randomInt(260, 420);
    addSeed(3);
    addSeed(3);
  } else if (f === 5) {
    loot.bronze = randomInt(30, 55);
    loot.pp = randomInt(80, 140);
    addSeed(2);
    addSeed(1);
  } else {
    loot.bronze = randomInt(6 + f * 3, 12 + f * 5);
    loot.pp = randomInt(15 + f * 8, 25 + f * 12);
    addSeed(f >= 6 ? 2 : 1);
  }

  return loot;
}
