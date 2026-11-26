import { Router } from "express";
import { dbState, saveDb } from "../db.js";
import { recordDailyPoints } from "../services/dailyPool.js";

const router = Router();

// Tree tiers configuration for the Forest woodcutting area:
// - pine:     cost 3 energy, 2-3 hits. Drops 1-2 Madeira de Pinheiro + 3-9 PP
// - oak:      cost 5 energy, 2-4 hits. Drops 1-2 Madeira de Carvalho + 8-20 PP
// - mahogany: cost 8 energy, 3-5 hits. Drops 1-2 Madeira de Mogno + 22-48 PP (+20% random seed)
// - elder:    cost 12 energy, 4-5 hits. Drops 1-2 Madeira Anciã + 60-130 PP (+1-2 random seeds)

const CROP_IDS = ["corn", "beans", "peanut", "cassava", "banana", "pineapple"];
const SEED_MAP = {
  corn: "seed_corn",
  beans: "seed_beans",
  peanut: "seed_peanut",
  cassava: "seed_cassava",
  banana: "seed_banana",
  pineapple: "seed_pineapple"
};

export const TREE_CONFIGS = {
  pine:     { name: "Pinheiro",      cost: 3,  minHits: 2, maxHits: 3, woodId: "wood_pine" },
  oak:      { name: "Carvalho",      cost: 5,  minHits: 2, maxHits: 4, woodId: "wood_oak" },
  mahogany: { name: "Mogno",         cost: 8,  minHits: 3, maxHits: 5, woodId: "wood_mahogany" },
  elder:    { name: "Árvore Anciã",  cost: 12, minHits: 4, maxHits: 5, woodId: "wood_elder" }
};

const INITIAL_TREES_COUNT = 16;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomTier() {
  const roll = Math.random();
  if (roll < 0.48) return "pine";
  if (roll < 0.80) return "oak";
  if (roll < 0.94) return "mahogany";
  return "elder";
}

function pickTreeSpot(occupied) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = randomInt(5, 23);
    const y = randomInt(2, 13);
    // Keep west arrival road (x<=5, y=6..9) and NPC camp (x<=5, y<=6) unobstructed
    if (x <= 6 && y >= 5 && y <= 10) continue;
    const key = `${x}_${y}`;
    if (!occupied.has(key)) {
      occupied.add(key);
      return { x, y };
    }
  }
  return { x: randomInt(6, 23), y: randomInt(2, 13) };
}

function createTree(id, occupied = new Set()) {
  const tier = generateRandomTier();
  const cfg = TREE_CONFIGS[tier];
  const maxHp = randomInt(cfg.minHits, cfg.maxHits);
  const pos = pickTreeSpot(occupied);
  return {
    id,
    tier,
    hp: maxHp,
    maxHp,
    x: pos.x,
    y: pos.y,
    respawnAt: 0,
    spawnedAt: 0
  };
}

function ensureForestState() {
  if (!dbState.forest) dbState.forest = { trees: {} };
  if (!dbState.forest.trees) dbState.forest.trees = {};
  const trees = dbState.forest.trees;
  if (Object.keys(trees).length === 0) {
    const occupied = new Set();
    for (let i = 1; i <= INITIAL_TREES_COUNT; i++) {
      const treeId = `tree_${i}`;
      trees[treeId] = createTree(treeId, occupied);
    }
    saveDb();
  }
}

function rollTreeLoot(tier) {
  const loot = { pp: 0, woods: {}, seeds: {} };
  const addWood = (woodId, count = 1) => {
    if (count > 0) loot.woods[woodId] = (loot.woods[woodId] || 0) + count;
  };
  const addSeed = (count = 1) => {
    for (let i = 0; i < count; i++) {
      const cropId = CROP_IDS[Math.floor(Math.random() * CROP_IDS.length)];
      const sid = SEED_MAP[cropId] || "seed_corn";
      loot.seeds[sid] = (loot.seeds[sid] || 0) + 1;
    }
  };

  if (tier === "pine") {
    loot.pp = randomInt(3, 9);
    addWood("wood_pine", randomInt(1, 2));
  } else if (tier === "oak") {
    loot.pp = randomInt(8, 20);
    addWood("wood_oak", randomInt(1, 2));
    if (Math.random() < 0.35) addWood("wood_pine", 1);
  } else if (tier === "mahogany") {
    loot.pp = randomInt(22, 48);
    addWood("wood_mahogany", randomInt(1, 2));
    if (Math.random() < 0.25) addSeed(1);
  } else if (tier === "elder") {
    loot.pp = randomInt(60, 130);
    addWood("wood_elder", randomInt(1, 2));
    addWood("wood_mahogany", 1);
    addSeed(randomInt(1, 2));
  }
  return loot;
}

router.get("/state", (req, res) => {
  ensureForestState();
  const now = Date.now();
  let changed = false;

  const occupied = new Set(
    Object.values(dbState.forest.trees)
      .filter((t) => t && t.hp > 0)
      .map((t) => `${t.x}_${t.y}`)
  );

  for (const tree of Object.values(dbState.forest.trees)) {
    if (tree && tree.hp <= 0 && tree.respawnAt > 0 && now >= tree.respawnAt) {
      const fresh = createTree(tree.id, occupied);
      tree.tier = fresh.tier;
      tree.hp = fresh.maxHp;
      tree.maxHp = fresh.maxHp;
      tree.x = fresh.x;
      tree.y = fresh.y;
      tree.respawnAt = 0;
      tree.spawnedAt = now;
      changed = true;
    }
  }
  if (changed) saveDb();

  res.json({
    trees: dbState.forest.trees,
    treeConfigs: TREE_CONFIGS,
    serverNow: now
  });
});

router.post("/chop", (req, res) => {
  const { treeId, uid, name, energyCurrent } = req.body || {};
  if (!treeId || !uid) return res.status(400).json({ error: "Missing treeId or uid" });

  ensureForestState();
  const now = Date.now();
  const tree = dbState.forest.trees[treeId];
  if (!tree) return res.status(404).json({ error: "Tree not found" });
  if (tree.hp <= 0) return res.status(400).json({ error: "Tree already felled" });

  const cfg = TREE_CONFIGS[tree.tier] || TREE_CONFIGS.pine;
  const energyCost = cfg.cost;

  if (Number(energyCurrent) < energyCost) {
    return res.status(400).json({ allowed: false, error: "Insufficient energy", energyCost });
  }

  tree.hp -= 1;
  let loot = null;
  let dailyPoints = null;

  if (tree.hp <= 0) {
    tree.respawnAt = now + 35_000;
    loot = rollTreeLoot(tree.tier);
    if (loot.pp > 0) {
      const updated = recordDailyPoints(String(uid), name, loot.pp, now);
      dailyPoints = updated?.points ?? null;
    }
  }

  saveDb();

  res.json({
    allowed: true,
    energyCost,
    tree,
    felled: tree.hp <= 0,
    loot,
    dailyPoints
  });
});

export default router;
