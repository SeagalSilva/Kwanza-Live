import { Router } from "express";
import { dbState, saveDb } from "../db.js";
import { recordDailyPoints } from "../services/dailyPool.js";

const router = Router();

// Rock tiers configuration (ONLY Pool Points and seeds):
// - common: cost 3 energy, 1-3 hits. Loot: 2-10 PP and 35% chance of 1 random seed.
// - uncommon: cost 5 energy, 1-4 hits. Loot: 8-22 PP and 1 random seed.
// - rare: cost 7 energy, 2-5 hits. Loot: 25-55 PP and 2 random seeds.
// - epic: cost 10 energy, 4-5 hits. Loot: 100-250 PP and 4 random seeds.
// - legendary: cost 15 energy, 4-5 hits. Loot: 300-500 PP and 10 random seeds.

const CROP_IDS = ["corn", "beans", "peanut", "cassava", "banana", "pineapple"];
const SEED_MAP = {
  corn: "seed_corn",
  beans: "seed_beans",
  peanut: "seed_peanut",
  cassava: "seed_cassava",
  banana: "seed_banana",
  pineapple: "seed_pineapple"
};

const ROCK_CONFIGS = {
  common:    { name: "Comum", cost: 3, minHits: 1, maxHits: 3, emoji: "🪨" },
  uncommon:  { name: "Incomum", cost: 5, minHits: 1, maxHits: 4, emoji: "🗿" },
  rare:      { name: "Rara", cost: 7, minHits: 2, maxHits: 5, emoji: "💎" },
  epic:      { name: "Épica", cost: 10, minHits: 4, maxHits: 5, emoji: "🔮" },
  legendary: { name: "Lendária", cost: 15, minHits: 4, maxHits: 5, emoji: "🌟" }
};

const INITIAL_ROCKS_COUNT = 14;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomTier() {
  const roll = Math.random();
  if (roll < 0.45) return "common";
  if (roll < 0.75) return "uncommon";
  if (roll < 0.92) return "rare";
  if (roll < 0.98) return "epic";
  return "legendary";
}

function createRock(id) {
  const tier = generateRandomTier();
  const cfg = ROCK_CONFIGS[tier];
  const maxHp = randomInt(cfg.minHits, cfg.maxHits);
  return {
    id,
    tier,
    hp: maxHp,
    maxHp,
    x: randomInt(2, 22),
    y: randomInt(3, 13),
    respawnAt: 0,
    spawnedAt: 0
  };
}

function ensureMinesState() {
  if (!dbState.mines) dbState.mines = { rocks: {} };
  const rocks = dbState.mines.rocks;
  if (Object.keys(rocks).length === 0) {
    for (let i = 1; i <= INITIAL_ROCKS_COUNT; i++) {
      const rockId = `rock_${i}`;
      rocks[rockId] = createRock(rockId);
    }
    saveDb();
  }
}

function rollLoot(tier) {
  const loot = { pp: 0, seeds: {} };
  const addSeed = (count = 1) => {
    for (let i = 0; i < count; i++) {
      const cropId = CROP_IDS[Math.floor(Math.random() * CROP_IDS.length)];
      const seedId = SEED_MAP[cropId] || "seed_corn";
      loot.seeds[seedId] = (loot.seeds[seedId] || 0) + 1;
    }
  };

  if (tier === "common") {
    loot.pp = randomInt(2, 10);
    if (Math.random() < 0.35) addSeed(1);
  } else if (tier === "uncommon") {
    loot.pp = randomInt(8, 22);
    addSeed(1);
  } else if (tier === "rare") {
    loot.pp = randomInt(25, 55);
    addSeed(2);
  } else if (tier === "epic") {
    loot.pp = randomInt(100, 250);
    addSeed(4);
  } else if (tier === "legendary") {
    loot.pp = randomInt(300, 500);
    addSeed(10);
  }
  return loot;
}

router.get("/state", (req, res) => {
  ensureMinesState();
  const now = Date.now();
  let changed = false;

  for (const rock of Object.values(dbState.mines.rocks)) {
    if (rock.hp <= 0 && rock.respawnAt > 0 && now >= rock.respawnAt) {
      const fresh = createRock(rock.id);
      rock.tier = fresh.tier;
      rock.hp = fresh.maxHp;
      rock.maxHp = fresh.maxHp;
      rock.respawnAt = 0;
      rock.spawnedAt = now;
      changed = true;
    }
  }
  if (changed) saveDb();

  res.json({
    rocks: dbState.mines.rocks,
    rockConfigs: ROCK_CONFIGS,
    serverNow: now
  });
});

router.post("/hit", (req, res) => {
  const { rockId, uid, name, energyCurrent } = req.body || {};
  if (!rockId || !uid) return res.status(400).json({ error: "Missing rockId or uid" });

  ensureMinesState();
  const now = Date.now();
  const rock = dbState.mines.rocks[rockId];
  if (!rock) return res.status(404).json({ error: "Rock not found" });
  if (rock.hp <= 0) return res.status(400).json({ error: "Rock already broken" });

  const cfg = ROCK_CONFIGS[rock.tier];
  const energyCost = cfg.cost;

  if (Number(energyCurrent) < energyCost) {
    return res.status(400).json({ allowed: false, error: "Insufficient energy", energyCost });
  }

  rock.hp -= 1;
  let loot = null;
  let dailyPoints = null;

  if (rock.hp <= 0) {
    rock.respawnAt = now + 35_000; // 35 seconds respawn
    loot = rollLoot(rock.tier);
    if (loot.pp > 0) {
      const updated = recordDailyPoints(String(uid), name, loot.pp, now);
      dailyPoints = updated?.points ?? null;
    }
  }

  saveDb();

  res.json({
    allowed: true,
    energyCost,
    rock,
    broken: rock.hp <= 0,
    loot,
    dailyPoints
  });
});

export default router;
