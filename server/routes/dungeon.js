import { Router } from "express";
import { dbState, saveDb } from "../db.js";
import { recordDailyPoints } from "../services/dailyPool.js";
import {
  DUNGEON_PHASES,
  getPhaseConfig,
  buildFloorRunState,
  rollEnemyDrop,
  rollChestLoot,
  createEmptyBag,
  addLootToBag,
  hasBagLoot,
  randomInt
} from "../dungeonData.js";

const router = Router();
const DROP_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function pruneDrops(now = Date.now()) {
  if (!Array.isArray(dbState.dungeonDrops)) dbState.dungeonDrops = [];
  const before = dbState.dungeonDrops.length;
  dbState.dungeonDrops = dbState.dungeonDrops.filter(
    (d) => d && d.bag && hasBagLoot(d.bag) && (d.expiresAt || 0) > now
  );
  return dbState.dungeonDrops.length !== before;
}

function getDropsForFloor(phaseId, floor, now = Date.now()) {
  pruneDrops(now);
  return dbState.dungeonDrops.filter(
    (d) => d.phaseId === phaseId && Number(d.floor) === Number(floor)
  );
}

function getOrCreateUser(uid, name = "Jogador") {
  if (!dbState.dungeonUsers || typeof dbState.dungeonUsers !== "object") {
    dbState.dungeonUsers = {};
  }
  const key = String(uid);
  if (!dbState.dungeonUsers[key]) {
    dbState.dungeonUsers[key] = {
      uid: key,
      name: String(name || "Jogador"),
      highestFloorByPhase: {
        forest_entrance: 1
      },
      clearsByPhase: {
        forest_entrance: 0
      },
      totalKills: 0,
      totalChests: 0,
      totalDeaths: 0,
      activeRun: null,
      updatedAt: Date.now()
    };
  }
  const u = dbState.dungeonUsers[key];
  if (!u.highestFloorByPhase || typeof u.highestFloorByPhase !== "object") {
    u.highestFloorByPhase = { forest_entrance: 1 };
  }
  if (!u.highestFloorByPhase.forest_entrance) {
    u.highestFloorByPhase.forest_entrance = 1;
  }
  if (!u.clearsByPhase || typeof u.clearsByPhase !== "object") {
    u.clearsByPhase = { forest_entrance: 0 };
  }
  if (name && typeof name === "string" && name.trim()) {
    u.name = name.trim();
  }
  return u;
}

function serializePhases(user) {
  return DUNGEON_PHASES.map((p) => {
    const unlocked = !!p.unlockedByDefault && !p.comingSoon;
    const highestFloor = unlocked
      ? Math.max(1, Math.min(p.totalFloors, Number(user?.highestFloorByPhase?.[p.id]) || 1))
      : 0;
    const clears = Number(user?.clearsByPhase?.[p.id]) || 0;
    return {
      ...p,
      unlocked,
      highestFloor,
      clears
    };
  });
}

function handlePlayerDeath(user, run, playerX, playerY, now = Date.now()) {
  const lostBag = run?.bag ? JSON.parse(JSON.stringify(run.bag)) : createEmptyBag();
  let dropCreated = null;

  if (run && hasBagLoot(lostBag)) {
    if (!Array.isArray(dbState.dungeonDrops)) dbState.dungeonDrops = [];
    const px = Number.isFinite(Number(playerX)) ? Math.max(2, Math.min(19.5, Number(playerX))) : 11;
    const py = Number.isFinite(Number(playerY)) ? Math.max(2.5, Math.min(11.5, Number(playerY))) : 8;
    dropCreated = {
      id: `drop_${now}_${Math.random().toString(36).slice(2, 7)}`,
      phaseId: run.phaseId,
      floor: run.floor,
      x: Math.round(px * 10) / 10,
      y: Math.round(py * 10) / 10,
      victimUid: user.uid,
      victimName: user.name || "Jogador",
      bag: lostBag,
      createdAt: now,
      expiresAt: now + DROP_TTL_MS
    };
    dbState.dungeonDrops.push(dropCreated);
  }

  user.totalDeaths = (user.totalDeaths || 0) + 1;
  user.activeRun = null;
  return { lostBag, dropCreated };
}

router.get("/state", (req, res) => {
  const now = Date.now();
  const pruned = pruneDrops(now);
  const uid = req.query.uid ? String(req.query.uid) : "";
  const user = uid ? getOrCreateUser(uid) : null;
  if (uid || pruned) saveDb();

  const phaseId = req.query.phaseId || user?.activeRun?.phaseId || "forest_entrance";
  const floor = req.query.floor || user?.activeRun?.floor || 1;
  const floorDrops = getDropsForFloor(phaseId, floor, now);

  res.json({
    phases: serializePhases(user),
    progress: user
      ? {
          highestFloorByPhase: user.highestFloorByPhase,
          clearsByPhase: user.clearsByPhase,
          totalKills: user.totalKills || 0,
          totalChests: user.totalChests || 0,
          totalDeaths: user.totalDeaths || 0
        }
      : null,
    activeRun: user?.activeRun || null,
    floorDrops,
    serverNow: now
  });
});

router.get("/drops", (req, res) => {
  const now = Date.now();
  const pruned = pruneDrops(now);
  if (pruned) saveDb();
  const phaseId = String(req.query.phaseId || "forest_entrance");
  const floor = Number(req.query.floor || 1);
  res.json({
    floorDrops: getDropsForFloor(phaseId, floor, now),
    serverNow: now
  });
});

router.post("/start", (req, res) => {
  const { uid, name, phaseId = "forest_entrance", startFloor } = req.body || {};
  if (!uid) return res.status(400).json({ error: "Missing uid" });

  const phase = getPhaseConfig(phaseId);
  if (!phase) return res.status(404).json({ error: "Phase not found" });
  if (phase.comingSoon || !phase.unlockedByDefault) {
    return res.status(403).json({ error: "Phase is locked" });
  }

  const now = Date.now();
  const user = getOrCreateUser(uid, name);
  const maxUnlocked = Math.max(1, Math.min(phase.totalFloors, Number(user.highestFloorByPhase[phase.id]) || 1));

  // Resume active run if already live
  if (
    startFloor === undefined &&
    user.activeRun &&
    user.activeRun.phaseId === phase.id &&
    user.activeRun.hp > 0 &&
    !user.activeRun.phaseCompleted
  ) {
    if (!user.activeRun.bag) user.activeRun.bag = createEmptyBag();
    return res.json({
      ok: true,
      resumed: true,
      phases: serializePhases(user),
      activeRun: user.activeRun,
      floorDrops: getDropsForFloor(user.activeRun.phaseId, user.activeRun.floor, now)
    });
  }

  const targetFloor = startFloor !== undefined
    ? Math.max(1, Math.min(maxUnlocked, Math.floor(Number(startFloor) || 1)))
    : 1;

  const run = buildFloorRunState(phase.id, targetFloor);
  run.startedAt = now;
  run.lastActionAt = now;

  user.activeRun = run;
  user.updatedAt = now;
  saveDb();

  res.json({
    ok: true,
    resumed: false,
    phases: serializePhases(user),
    activeRun: user.activeRun,
    floorDrops: getDropsForFloor(run.phaseId, run.floor, now)
  });
});

router.post("/attack", (req, res) => {
  const { uid, name, enemyId, energyCurrent, playerX, playerY } = req.body || {};
  if (!uid || !enemyId) return res.status(400).json({ error: "Missing uid or enemyId" });

  const now = Date.now();
  const user = getOrCreateUser(uid, name);
  const run = user.activeRun;
  if (!run || run.hp <= 0) {
    return res.status(400).json({ allowed: false, error: "No active run" });
  }
  if (!run.bag) run.bag = createEmptyBag();

  const enemy = (run.enemies || []).find((e) => e.id === enemyId);
  if (!enemy || enemy.hp <= 0) {
    return res.status(400).json({ allowed: false, error: "Enemy not available" });
  }

  const energyCost = 1;
  if (Number(energyCurrent) < energyCost) {
    return res.status(400).json({ allowed: false, error: "Insufficient energy", energyCost });
  }

  const isCrit = Math.random() < 0.24;
  const baseDmg = randomInt(run.atkMin || 16, run.atkMax || 24);
  const playerDmg = isCrit ? Math.round(baseDmg * 1.6) : baseDmg;

  enemy.hp = Math.max(0, enemy.hp - playerDmg);

  let enemyKilled = false;
  let enemyDmg = 0;
  let healOnKill = 0;
  let drop = null;

  if (enemy.hp <= 0) {
    enemyKilled = true;
    user.totalKills = (user.totalKills || 0) + 1;
    drop = rollEnemyDrop(run.floor, enemy);
    addLootToBag(run.bag, drop);

    healOnKill = enemy.isMiniBoss ? 22 : enemy.isBoss ? 30 : 10;
    run.hp = Math.min(run.maxHp, run.hp + healOnKill);
  } else {
    enemyDmg = Math.max(1, enemy.atk + randomInt(-2, 2));
    run.hp = Math.max(0, run.hp - enemyDmg);
    enemy.lastHitAt = now;
  }

  const allDead = run.enemies.every((e) => e.hp <= 0);
  if (allDead) {
    run.cleared = true;
    const phase = getPhaseConfig(run.phaseId);
    const maxFloor = phase ? phase.totalFloors : 10;
    const prevHigh = Number(user.highestFloorByPhase[run.phaseId]) || 1;
    if (run.floor < maxFloor && run.floor + 1 > prevHigh) {
      user.highestFloorByPhase[run.phaseId] = run.floor + 1;
    }
    if (run.floor >= maxFloor && !run.phaseCompleted) {
      run.phaseCompleted = true;
      user.highestFloorByPhase[run.phaseId] = maxFloor;
      user.clearsByPhase[run.phaseId] = (user.clearsByPhase[run.phaseId] || 0) + 1;
    }
  }

  let defeated = false;
  let lostBag = null;
  let dropCreated = null;
  if (run.hp <= 0) {
    defeated = true;
    const death = handlePlayerDeath(user, run, playerX, playerY, now);
    lostBag = death.lostBag;
    dropCreated = death.dropCreated;
  } else {
    run.lastActionAt = now;
  }

  user.updatedAt = now;
  saveDb();

  res.json({
    allowed: true,
    energyCost,
    combat: {
      enemyId: enemy.id,
      playerDmg,
      isCrit,
      enemyDmg,
      enemyKilled,
      healOnKill,
      floorCleared: allDead,
      defeated
    },
    drop,
    lostBag,
    dropCreated,
    phases: serializePhases(user),
    activeRun: user.activeRun
  });
});

// Active enemy strike against player in real-time combat
router.post("/enemy-hit", (req, res) => {
  const { uid, name, enemyId, playerX, playerY } = req.body || {};
  if (!uid || !enemyId) return res.status(400).json({ error: "Missing uid or enemyId" });

  const now = Date.now();
  const user = getOrCreateUser(uid, name);
  const run = user.activeRun;
  if (!run || run.hp <= 0) {
    return res.status(400).json({ hit: false, error: "No active run" });
  }

  const enemy = (run.enemies || []).find((e) => e.id === enemyId);
  if (!enemy || enemy.hp <= 0) {
    return res.status(400).json({ hit: false, error: "Enemy not alive" });
  }

  const minInterval = Math.max(1200, (enemy.atkCooldownMs || 1900) - 350);
  if (enemy.lastHitAt && now - enemy.lastHitAt < minInterval) {
    return res.json({ hit: false, reason: "cooldown", activeRun: run });
  }

  enemy.lastHitAt = now;
  const enemyDmg = Math.max(1, enemy.atk + randomInt(-2, 2));
  run.hp = Math.max(0, run.hp - enemyDmg);

  let defeated = false;
  let lostBag = null;
  let dropCreated = null;
  if (run.hp <= 0) {
    defeated = true;
    const death = handlePlayerDeath(user, run, playerX, playerY, now);
    lostBag = death.lostBag;
    dropCreated = death.dropCreated;
  } else {
    run.lastActionAt = now;
  }

  user.updatedAt = now;
  saveDb();

  res.json({
    hit: true,
    enemyId: enemy.id,
    enemyDmg,
    defeated,
    lostBag,
    dropCreated,
    phases: serializePhases(user),
    activeRun: user.activeRun
  });
});

router.post("/heal", (req, res) => {
  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: "Missing uid" });

  const user = getOrCreateUser(uid);
  const run = user.activeRun;
  if (!run || run.hp <= 0) {
    return res.status(400).json({ error: "No active run" });
  }
  if (run.springUsed) {
    return res.status(400).json({ error: "Spring already used on this floor" });
  }

  const healAmt = 45;
  const before = run.hp;
  run.hp = Math.min(run.maxHp, run.hp + healAmt);
  run.springUsed = true;
  run.lastActionAt = Date.now();
  user.updatedAt = Date.now();
  saveDb();

  res.json({
    ok: true,
    healed: run.hp - before,
    activeRun: user.activeRun
  });
});

router.post("/open-chest", (req, res) => {
  const { uid, name } = req.body || {};
  if (!uid) return res.status(400).json({ error: "Missing uid" });

  const user = getOrCreateUser(uid, name);
  const run = user.activeRun;
  if (!run || run.hp <= 0) {
    return res.status(400).json({ error: "No active run" });
  }
  if (!run.cleared) {
    return res.status(400).json({ error: "Defeat all enemies on this floor first" });
  }
  if (!run.chest || run.chest.opened) {
    return res.status(400).json({ error: "Chest already opened" });
  }
  if (!run.bag) run.bag = createEmptyBag();

  const loot = rollChestLoot(run.floor);
  run.chest.opened = true;
  run.chest.loot = loot;
  addLootToBag(run.bag, loot);
  user.totalChests = (user.totalChests || 0) + 1;

  run.lastActionAt = Date.now();
  user.updatedAt = Date.now();
  saveDb();

  res.json({
    ok: true,
    loot,
    phases: serializePhases(user),
    activeRun: user.activeRun
  });
});

router.post("/pickup-drop", (req, res) => {
  const { uid, name, dropId } = req.body || {};
  if (!uid || !dropId) return res.status(400).json({ error: "Missing uid or dropId" });

  const now = Date.now();
  pruneDrops(now);
  const user = getOrCreateUser(uid, name);
  const run = user.activeRun;
  if (!run || run.hp <= 0) {
    return res.status(400).json({ error: "Must be in an active dungeon run" });
  }
  if (!run.bag) run.bag = createEmptyBag();

  const idx = dbState.dungeonDrops.findIndex((d) => d.id === dropId);
  if (idx === -1) {
    return res.status(404).json({ error: "Loot drop already claimed or expired" });
  }
  const drop = dbState.dungeonDrops[idx];
  if (String(drop.victimUid) === String(uid)) {
    return res.status(403).json({ error: "You cannot recover your own lost loot drop" });
  }

  const claimedBag = drop.bag;
  addLootToBag(run.bag, claimedBag);
  dbState.dungeonDrops.splice(idx, 1);

  run.lastActionAt = now;
  user.updatedAt = now;
  saveDb();

  res.json({
    ok: true,
    victimName: drop.victimName,
    claimedBag,
    activeRun: user.activeRun,
    floorDrops: getDropsForFloor(run.phaseId, run.floor, now)
  });
});

router.post("/next-floor", (req, res) => {
  const { uid, name } = req.body || {};
  if (!uid) return res.status(400).json({ error: "Missing uid" });

  const now = Date.now();
  const user = getOrCreateUser(uid, name);
  const run = user.activeRun;
  if (!run || run.hp <= 0) {
    return res.status(400).json({ error: "No active run" });
  }
  if (!run.cleared) {
    return res.status(400).json({ error: "Floor is not cleared yet" });
  }

  const phase = getPhaseConfig(run.phaseId);
  const maxFloors = phase ? phase.totalFloors : 10;

  if (run.floor >= maxFloors) {
    const bankedLoot = run.bag ? JSON.parse(JSON.stringify(run.bag)) : createEmptyBag();
    let dailyPoints = null;
    if ((bankedLoot.pp || 0) > 0) {
      const updated = recordDailyPoints(String(uid), user.name, bankedLoot.pp, now);
      dailyPoints = updated?.points ?? null;
    }

    user.activeRun = null;
    user.updatedAt = now;
    saveDb();
    return res.json({
      ok: true,
      completedPhase: true,
      bankedLoot,
      dailyPoints,
      phases: serializePhases(user),
      activeRun: null
    });
  }

  const nextFloor = run.floor + 1;
  const carryHp = Math.min(run.maxHp, run.hp + 35);
  const nextRun = buildFloorRunState(run.phaseId, nextFloor, run.bag);
  nextRun.hp = carryHp;
  nextRun.startedAt = run.startedAt || now;
  nextRun.lastActionAt = now;

  user.activeRun = nextRun;
  user.updatedAt = now;
  saveDb();

  res.json({
    ok: true,
    completedPhase: false,
    phases: serializePhases(user),
    activeRun: user.activeRun,
    floorDrops: getDropsForFloor(nextRun.phaseId, nextRun.floor, now)
  });
});

// Safe extraction via Dungeon Exit Door: banks run.bag loot to wallet & Daily Pool
router.post("/extract", (req, res) => {
  const { uid, name } = req.body || {};
  if (!uid) return res.status(400).json({ error: "Missing uid" });

  const now = Date.now();
  const user = getOrCreateUser(uid, name);
  const run = user.activeRun;
  if (!run || run.hp <= 0) {
    user.activeRun = null;
    saveDb();
    return res.json({ ok: true, bankedLoot: createEmptyBag(), phases: serializePhases(user), activeRun: null });
  }

  const bankedLoot = run.bag ? JSON.parse(JSON.stringify(run.bag)) : createEmptyBag();
  let dailyPoints = null;
  if ((bankedLoot.pp || 0) > 0) {
    const updated = recordDailyPoints(String(uid), user.name, bankedLoot.pp, now);
    dailyPoints = updated?.points ?? null;
  }

  user.activeRun = null;
  user.updatedAt = now;
  saveDb();

  res.json({
    ok: true,
    bankedLoot,
    dailyPoints,
    phases: serializePhases(user),
    activeRun: null
  });
});

router.post("/abandon", (req, res) => {
  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: "Missing uid" });

  const user = getOrCreateUser(uid);
  user.activeRun = null;
  user.updatedAt = Date.now();
  saveDb();

  res.json({
    ok: true,
    phases: serializePhases(user),
    activeRun: null
  });
});

export default router;
