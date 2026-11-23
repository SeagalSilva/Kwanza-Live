import { Router } from "express";
import { dbState, saveDb } from "../db.js";
import { recordDailyPoints } from "../dailyPool.js";

const router = Router();

// Rock tiers configuration:
// - common: cost 1 energy, 1-3 hits. Loot: 1-10 PP OR up to 1 bronze.
// - uncommon: cost 1 energy, 1-4 hits. Loot: 5-20 PP AND 2-5 bronze.
// - rare: cost 1 energy, 2-5 hits. Loot: 25-50 PP, 1 random seed AND 5-10 bronze.
// - epic: cost 2 energy, 4-5 hits. Loot: 100-250 PP, 3 random seeds AND 25-55 bronze.
// - legendary: cost 3 energy, 4-5 hits. Loot: 300-500 PP, 10 random seeds, 60-95 bronze AND 1-2 silver.

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
  common:    { name: "Comum", cost: 1, minHits: 1, maxHits: 3, emoji: "🪨" },
  uncommon:  { name: "Incomum", cost: 1, minHits: 1, maxHits: 4, emoji: "🗿" },
  rare:      { name: "Rara", cost: 1, minHits: 2, maxHits: 5, emoji: "💎" },
  epic:      { name: "Épica", cost: 2, minHits: 4, maxHits: 5, emoji: "🔮" },
  legendary: { name: "Lendária", cost: 3, minHits: 4, maxHits: 5, emoji: "🌟" }
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
    respawnAt: 0
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
  const loot = { pp: 0, bronze: 0, silver: 0, seeds: {} };
  const addSeed = (count = 1) => {
    const cropId = CROP_IDS[Math.floor(Math.random() * CROP_IDS.length)];
    const seedId = SEED_MAP[cropId] || "seed_corn";
    loot.seeds[seedId] = (loot.seeds[seedId] || 0) + count;
  };

  if (tier === "common") {
    if (Math.random() < 0.5) {
      loot.pp = randomInt(1, 10);
    } else {
      loot.bronze = randomInt(0, 1);
    }
  } else if (tier === "uncommon") {
    loot.pp = randomInt(5, 20);
    loot.bronze = randomInt(2, 5);
  } else if (tier === "rare") {
    loot.pp = randomInt(25, 50);
    loot.bronze = randomInt(5, 10);
    addSeed(1);
  } else if (tier === "epic") {
    loot.pp = randomInt(100, 250);
    loot.bronze = randomInt(25, 55);
    addSeed(3);
  } else if (tier === "legendary") {
    loot.pp = randomInt(300, 500);
    loot.bronze = randomInt(60, 95);
    loot.silver = randomInt(1, 2);
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
