import { dbState, saveDb } from "./db.js";

export function getUtcDateKey(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function msUntilNextUtcDay(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const nextMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
  return Math.max(0, nextMidnight - nowMs);
}

export function ensureWorkstationUserRecord(uid) {
  if (!dbState.workstationUsers[uid]) {
    dbState.workstationUsers[uid] = {
      cycleId: Math.floor(Date.now() / (30 * 60 * 1000)),
      depositedPP: 0,
      readyToClaimBronze: 0,
      history: [],
      pendingTx: {},
      pendingClaim: null,
      dailyReadyToClaimBronze: 0,
      pendingDailyClaim: null,
      dailyHistory: []
    };
  }
  const u = dbState.workstationUsers[uid];
  if (typeof u.dailyReadyToClaimBronze !== "number") u.dailyReadyToClaimBronze = 0;
  if (!Array.isArray(u.dailyHistory)) u.dailyHistory = [];
  if (!Array.isArray(u.history)) u.history = [];
  if (!u.pendingTx || typeof u.pendingTx !== "object") u.pendingTx = {};
  return u;
}

/**
 * Pure deterministic Daily Pool payout calculator.
 * Rules:
 * - Pool pot = 4% of total accumulated daily points across all participating players.
 * - If participants < 11: each player receives ~4% of their own daily points.
 * - If 11 <= participants <= 100: top 10 share the full 4% pool pot weighted by rank (favoring #1); rest receive 1% of their own daily points.
 * - If participants >= 101: for every 100 players, +10 top slots are added (Math.ceil(N / 100) * 10, i.e., ~10% of players) sharing the 4% pool pot weighted by rank; rest receive 1% of their own daily points.
 */
export function calculateDailyPoolDistribution(dayObj) {
  const rawPlayers = dayObj?.players || {};
  const list = Object.entries(rawPlayers)
    .map(([uid, p]) => ({
      uid,
      name: String(p?.name || "Jogador"),
      points: Math.max(0, Math.floor(Number(p?.points) || 0)),
      firstEarnedAt: Number(p?.firstEarnedAt) || Number(p?.updatedAt) || 0
    }))
    .filter((p) => p.points > 0);

  list.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.firstEarnedAt !== b.firstEarnedAt) return a.firstEarnedAt - b.firstEarnedAt;
    return a.uid.localeCompare(b.uid);
  });

  const participantsCount = list.length;
  const totalPoints = list.reduce((sum, p) => sum + p.points, 0);
  const poolBronze = Math.floor(totalPoints * 0.04);

  if (participantsCount === 0) {
    return {
      participantsCount: 0,
      totalPoints: 0,
      poolBronze: 0,
      topCount: 0,
      ruleTier: "under11",
      entries: []
    };
  }

  if (participantsCount < 11) {
    const entries = list.map((p, idx) => ({
      ...p,
      rank: idx + 1,
      inTop: true,
      rewardBronze: Math.floor(p.points * 0.04)
    }));
    return {
      participantsCount,
      totalPoints,
      poolBronze,
      topCount: participantsCount,
      ruleTier: "under11",
      entries
    };
  }

  const ruleTier = participantsCount <= 100 ? "top10" : "top10pct";
  const topCount = participantsCount <= 100 ? 10 : Math.ceil(participantsCount / 100) * 10;

  // Rank weights strictly decrease from rank 1 to topCount, with flat floor so rank #K stays comfortably above 1%
  const baseLift = Math.ceil(topCount / 2);
  const weights = [];
  let weightSum = 0;
  for (let r = 1; r <= topCount; r++) {
    const w = (topCount - r + 1) + baseLift;
    weights.push(w);
    weightSum += w;
  }

  const topRewards = [];
  let allocated = 0;
  for (let i = 0; i < topCount; i++) {
    const share = Math.floor((poolBronze * weights[i]) / weightSum);
    topRewards.push(share);
    allocated += share;
  }
  let remainder = Math.max(0, poolBronze - allocated);
  for (let i = 0; i < topCount && remainder > 0; i++) {
    topRewards[i] += 1;
    remainder -= 1;
  }

  const entries = list.map((p, idx) => {
    const inTop = idx < topCount;
    const rewardBronze = inTop ? topRewards[idx] : Math.floor(p.points * 0.01);
    return {
      ...p,
      rank: idx + 1,
      inTop,
      rewardBronze
    };
  });

  return {
    participantsCount,
    totalPoints,
    poolBronze,
    topCount,
    ruleTier,
    entries
  };
}

export function settlePastDailyPools(nowMs = Date.now()) {
  if (!dbState.dailyPool) dbState.dailyPool = { days: {}, pendingSellTx: {} };
  if (!dbState.dailyPool.days) dbState.dailyPool.days = {};

  const todayUtc = getUtcDateKey(nowMs);
  const days = dbState.dailyPool.days;
  let dirty = false;

  const sortedDates = Object.keys(days).sort();
  for (const dateKey of sortedDates) {
    if (dateKey >= todayUtc) continue;
    const dayObj = days[dateKey];
    if (!dayObj || dayObj.settled) continue;

    const dist = calculateDailyPoolDistribution(dayObj);
    for (const entry of dist.entries) {
      const user = ensureWorkstationUserRecord(entry.uid);
      if (entry.rewardBronze > 0) {
        user.dailyReadyToClaimBronze = (user.dailyReadyToClaimBronze || 0) + entry.rewardBronze;
      }
      user.dailyHistory.unshift({
        date: dateKey,
        rank: entry.rank,
        participantsCount: dist.participantsCount,
        points: entry.points,
        bronzeEarned: entry.rewardBronze,
        inTop: entry.inTop,
        tier: dist.ruleTier,
        settledAt: nowMs
      });
      if (user.dailyHistory.length > 14) user.dailyHistory.length = 14;
    }

    dayObj.settled = true;
    dayObj.settledAt = nowMs;
    dayObj.summary = {
      participantsCount: dist.participantsCount,
      totalPoints: dist.totalPoints,
      poolBronze: dist.poolBronze,
      topCount: dist.topCount,
      ruleTier: dist.ruleTier
    };
    dirty = true;
  }

  // Prune settled days older than 30 days
  const cutoffDate = getUtcDateKey(nowMs - 30 * 24 * 60 * 60 * 1000);
  for (const dateKey of Object.keys(days)) {
    if (dateKey < cutoffDate && days[dateKey]?.settled) {
      delete days[dateKey];
      dirty = true;
    }
  }

  if (dirty) saveDb();
}

export function recordDailyPoints(uid, name, points, nowMs = Date.now()) {
  const amt = Math.floor(Number(points) || 0);
  if (!uid || amt <= 0) return null;

  settlePastDailyPools(nowMs);
  const todayUtc = getUtcDateKey(nowMs);
  if (!dbState.dailyPool.days[todayUtc]) {
    dbState.dailyPool.days[todayUtc] = { settled: false, players: {} };
  }
  const day = dbState.dailyPool.days[todayUtc];
  if (!day.players) day.players = {};

  const prev = day.players[uid];
  day.players[uid] = {
    name: String(name || prev?.name || "Jogador").slice(0, 32),
    points: (prev?.points || 0) + amt,
    firstEarnedAt: prev?.firstEarnedAt || nowMs,
    updatedAt: nowMs
  };

  saveDb();
  return day.players[uid];
}

export function getDailyPoolView(uid, nowMs = Date.now()) {
  settlePastDailyPools(nowMs);
  const todayUtc = getUtcDateKey(nowMs);
  const dayObj = dbState.dailyPool.days[todayUtc] || { settled: false, players: {} };
  const dist = calculateDailyPoolDistribution(dayObj);
  const user = uid ? ensureWorkstationUserRecord(uid) : null;

  const myEntry = uid ? dist.entries.find((e) => e.uid === uid) : null;
  const maxShown = Math.max(15, Math.min(50, dist.topCount || 15));
  const leaderboard = dist.entries.slice(0, maxShown).map((e) => ({
    uid: e.uid,
    name: e.name,
    rank: e.rank,
    points: e.points,
    inTop: e.inTop,
    estimatedBronze: e.rewardBronze
  }));

  return {
    utcDate: todayUtc,
    nextResetMs: msUntilNextUtcDay(nowMs),
    participantsCount: dist.participantsCount,
    topCount: dist.topCount,
    ruleTier: dist.ruleTier,
    totalPoints: dist.totalPoints,
    poolBronze: dist.poolBronze,
    myPoints: myEntry ? myEntry.points : 0,
    myRank: myEntry ? myEntry.rank : null,
    myInTop: myEntry ? myEntry.inTop : false,
    myEstimatedBronze: myEntry ? myEntry.rewardBronze : 0,
    dailyReadyToClaimBronze: user ? user.dailyReadyToClaimBronze : 0,
    dailyHistory: user ? user.dailyHistory : [],
    leaderboard
  };
}
