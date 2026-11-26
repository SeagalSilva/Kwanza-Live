import crypto from "crypto";
import { dbState, saveDb } from "../db.js";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PENDING_LOCK_MS = 60 * 1000;
const STALE_PENDING_RECORD_MS = 30 * 60 * 1000;

export function getUtcDateKey(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function msUntilNextUtcDay(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const nextMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
  return Math.max(0, nextMidnight - nowMs);
}

export function parseClaimedDatesInput(input) {
  const out = {};
  if (!input) return out;
  if (typeof input === "string") {
    for (const part of input.split(",")) {
      const k = part.trim();
      if (DATE_KEY_RE.test(k)) out[k] = Date.now();
    }
    return out;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const k = String(item || "").trim();
      if (DATE_KEY_RE.test(k)) out[k] = Date.now();
    }
    return out;
  }
  if (typeof input === "object") {
    for (const [k, v] of Object.entries(input)) {
      if (DATE_KEY_RE.test(k) && v) {
        const ts = Number(v);
        out[k] = Number.isFinite(ts) && ts > 0 ? ts : Date.now();
      }
    }
  }
  return out;
}

function getLockedDatesForUser(user) {
  const locked = new Set();
  if (!user?.pendingDailyClaims || typeof user.pendingDailyClaims !== "object") return locked;
  for (const entry of Object.values(user.pendingDailyClaims)) {
    if (!entry || entry.status !== "pending") continue;
    for (const d of entry.dates || []) locked.add(d);
  }
  return locked;
}

function hasActivePendingDailyClaim(user, nowMs = Date.now()) {
  if (!user?.pendingDailyClaims || typeof user.pendingDailyClaims !== "object") return false;
  for (const entry of Object.values(user.pendingDailyClaims)) {
    if (entry && entry.status === "pending" && nowMs - (entry.createdAt || 0) < PENDING_LOCK_MS) {
      return true;
    }
  }
  return false;
}

function pruneDailyClaimRecords(user, nowMs = Date.now()) {
  if (!user?.pendingDailyClaims || typeof user.pendingDailyClaims !== "object") return;
  for (const [cid, entry] of Object.entries(user.pendingDailyClaims)) {
    if (!entry || (entry.status !== "pending" && nowMs - (entry.updatedAt || entry.createdAt || 0) > STALE_PENDING_RECORD_MS)) {
      delete user.pendingDailyClaims[cid];
    }
  }
}

export function syncUserDailyClaimable(user) {
  if (!user) return 0;
  const lockedDates = getLockedDatesForUser(user);
  const claimedMap = user.claimedDailyDates || {};
  let total = 0;

  for (const row of user.dailyHistory || []) {
    if (!row || !row.date) continue;
    if (claimedMap[row.date]) {
      row.claimed = true;
      if (!row.claimedAt) row.claimedAt = claimedMap[row.date];
      delete row.pendingClaimId;
      continue;
    }
    if (row.claimed) continue;
    if (lockedDates.has(row.date) || row.pendingClaimId) continue;
    const earned = Math.max(0, Math.floor(Number(row.bronzeEarned) || 0));
    if (earned > 0) total += earned;
  }

  user.dailyReadyToClaimBronze = total;
  return total;
}

function normalizeUserDailyLedger(u) {
  let dirty = false;
  if (typeof u.dailyReadyToClaimBronze !== "number") { u.dailyReadyToClaimBronze = 0; dirty = true; }
  if (!Array.isArray(u.dailyHistory)) { u.dailyHistory = []; dirty = true; }
  if (!u.claimedDailyDates || typeof u.claimedDailyDates !== "object") { u.claimedDailyDates = {}; dirty = true; }
  if (!u.pendingDailyClaims || typeof u.pendingDailyClaims !== "object") { u.pendingDailyClaims = {}; dirty = true; }

  // Migrate legacy dailyHistory rows lacking an explicit boolean `claimed` flag.
  // Rows when dailyReadyToClaimBronze === 0 are treated as already withdrawn so old payouts cannot replay.
  const needsLegacyMigration = u.dailyHistory.some((row) => row && typeof row.claimed !== "boolean");
  if (needsLegacyMigration) {
    let rem = Math.max(0, Math.floor(Number(u.dailyReadyToClaimBronze) || 0));
    for (const row of u.dailyHistory) {
      if (!row || !row.date) continue;
      if (typeof row.claimed === "boolean") {
        if (row.claimed && !u.claimedDailyDates[row.date]) {
          u.claimedDailyDates[row.date] = row.claimedAt || row.settledAt || Date.now();
        }
        continue;
      }
      const earned = Math.max(0, Math.floor(Number(row.bronzeEarned) || 0));
      if (u.claimedDailyDates[row.date]) {
        row.claimed = true;
        row.claimedAt = u.claimedDailyDates[row.date];
      } else if (earned <= 0) {
        row.claimed = true;
        row.claimedAt = row.settledAt || Date.now();
      } else if (rem >= earned) {
        row.claimed = false;
        row.claimedAt = null;
        rem -= earned;
      } else {
        row.claimed = true;
        row.claimedAt = row.settledAt || Date.now();
        u.claimedDailyDates[row.date] = row.claimedAt;
      }
      dirty = true;
    }
  }

  const prev = u.dailyReadyToClaimBronze;
  const computed = syncUserDailyClaimable(u);
  if (computed !== prev) dirty = true;
  return dirty;
}

export function ensureWorkstationUserRecord(uid) {
  if (!dbState.workstationUsers[uid]) {
    dbState.workstationUsers[uid] = {
      cycleId: Math.floor(Date.now() / (30 * 60 * 1000)),
      depositedPP: 0,
      readyToClaimBronze: 0,
      history: [],
      claimedShiftCycles: {},
      pendingTx: {},
      pendingClaim: null,
      pendingShiftClaims: {},
      dailyReadyToClaimBronze: 0,
      pendingDailyClaim: null,
      pendingDailyClaims: {},
      claimedDailyDates: {},
      dailyHistory: []
    };
  }
  const u = dbState.workstationUsers[uid];
  if (!Array.isArray(u.history)) u.history = [];
  if (!u.pendingTx || typeof u.pendingTx !== "object") u.pendingTx = {};
  if (!u.claimedShiftCycles || typeof u.claimedShiftCycles !== "object") u.claimedShiftCycles = {};
  if (!u.pendingShiftClaims || typeof u.pendingShiftClaims !== "object") u.pendingShiftClaims = {};

  const changed = normalizeUserDailyLedger(u);
  if (changed) saveDb();
  return u;
}

export function reconcileClientClaimedDailyDates(uid, knownClaimedInput) {
  if (!uid) return false;
  const known = parseClaimedDatesInput(knownClaimedInput);
  const dates = Object.keys(known);
  if (dates.length === 0) return false;

  const user = ensureWorkstationUserRecord(uid);
  let dirty = false;

  for (const dateKey of dates) {
    if (!user.claimedDailyDates[dateKey]) {
      user.claimedDailyDates[dateKey] = known[dateKey];
      dirty = true;
    }
    for (const row of user.dailyHistory) {
      if (row && row.date === dateKey && (!row.claimed || row.pendingClaimId)) {
        row.claimed = true;
        row.claimedAt = row.claimedAt || known[dateKey];
        delete row.pendingClaimId;
        dirty = true;
      }
    }
  }

  // Resolve any pending claims whose dates are already confirmed in Firebase
  for (const [cid, entry] of Object.entries(user.pendingDailyClaims || {})) {
    if (entry && entry.status === "pending" && (entry.dates || []).every((d) => !!user.claimedDailyDates[d])) {
      entry.status = "confirmed";
      entry.updatedAt = Date.now();
      dirty = true;
    }
  }

  const prev = user.dailyReadyToClaimBronze;
  const synced = syncUserDailyClaimable(user);
  if (synced !== prev) dirty = true;

  if (dirty) saveDb();
  return dirty;
}

/**
 * Pure deterministic Daily Pool payout calculator.
 * Rules:
 * - Pool pot = 4% of total accumulated daily points across all participating players.
 * - If participants < 11: each player receives Math.floor(points * 0.04) (requires >= 25 PP for 1 bronze).
 * - If 11 <= participants <= 100: top 10 share the full 4% pool pot weighted by rank
 *   with a guaranteed 1% floor so Top ranks always earn >= non-top (1%) and remain monotonic by rank.
 * - If participants >= 101: top Math.ceil(N / 100) * 10 (~10%) share the 4% pool pot; rest receive 1%.
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

  // Give every Top-N player a 1% base floor (mathematically <= poolBronze since 0.01*topSum <= 0.04*total),
  // then distribute remaining pool surplus strictly descending by rank weights so #1 >= #2 >= ... >= #topCount >= 1%.
  const baseFloors = list.slice(0, topCount).map((p) => Math.floor(p.points * 0.01));
  const baseSum = baseFloors.reduce((s, b) => s + b, 0);
  const surplus = Math.max(0, poolBronze - baseSum);

  const baseLift = Math.ceil(topCount / 2);
  const weights = [];
  let weightSum = 0;
  for (let r = 1; r <= topCount; r++) {
    const w = (topCount - r + 1) + baseLift;
    weights.push(w);
    weightSum += w;
  }

  const topRewards = [...baseFloors];
  let allocatedSurplus = 0;
  for (let i = 0; i < topCount; i++) {
    const extra = weightSum > 0 ? Math.floor((surplus * weights[i]) / weightSum) : 0;
    topRewards[i] += extra;
    allocatedSurplus += extra;
  }
  let remainder = Math.max(0, surplus - allocatedSurplus);
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
      const alreadyHasDate = user.dailyHistory.some((h) => h && h.date === dateKey);
      if (!alreadyHasDate) {
        const alreadyClaimedTs = user.claimedDailyDates?.[dateKey] || null;
        const noPayout = entry.rewardBronze <= 0;
        user.dailyHistory.unshift({
          date: dateKey,
          rank: entry.rank,
          participantsCount: dist.participantsCount,
          points: entry.points,
          bronzeEarned: entry.rewardBronze,
          inTop: entry.inTop,
          tier: dist.ruleTier,
          settledAt: nowMs,
          claimed: Boolean(alreadyClaimedTs || noPayout),
          claimedAt: alreadyClaimedTs || (noPayout ? nowMs : null)
        });
        user.dailyHistory.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
        if (user.dailyHistory.length > 30) user.dailyHistory.length = 30;
      }
      syncUserDailyClaimable(user);
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

function getUtcDayStartMs(nowMs = Date.now()) {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
}

function normalizeDayPlayerRecord(prev) {
  const legacyPts = Math.max(0, Math.floor(Number(prev?.points) || 0));
  const hasStructured = typeof prev?.depositedPoints === "number" && typeof prev?.unspentEarnedPoints === "number";
  return {
    name: prev?.name || "Jogador",
    earnedPoints: typeof prev?.earnedPoints === "number" ? Math.max(0, Math.floor(prev.earnedPoints)) : legacyPts,
    unspentEarnedPoints: hasStructured ? Math.max(0, Math.floor(prev.unspentEarnedPoints)) : legacyPts,
    depositedPoints: typeof prev?.depositedPoints === "number" ? Math.max(0, Math.floor(prev.depositedPoints)) : 0,
    hasDepositSync: hasStructured,
    firstEarnedAt: prev?.firstEarnedAt || 0,
    updatedAt: prev?.updatedAt || 0
  };
}

function reconcilePrePatchWorkstationDepositsToday(uid, nowMs = Date.now()) {
  if (!uid) return;
  const wsUser = dbState.workstationUsers?.[uid];
  if (!wsUser) return;

  const todayUtc = getUtcDateKey(nowMs);
  const day = dbState.dailyPool?.days?.[todayUtc];
  const existing = day?.players?.[uid];
  // Only backfill once if this player's today entry doesn't yet track depositedPoints
  if (existing && typeof existing.depositedPoints === "number") return;

  const dayStartMs = getUtcDayStartMs(nowMs);
  let depositedToday = 0;

  if ((wsUser.depositedPP || 0) > 0 && (wsUser.firstDepositedAt || wsUser.updatedAt || 0) >= dayStartMs) {
    depositedToday += Math.floor(Number(wsUser.depositedPP) || 0);
  }
  for (const h of wsUser.history || []) {
    if (h && (h.completedAt || 0) >= dayStartMs && (h.depositedPP || 0) > 0) {
      depositedToday += Math.floor(Number(h.depositedPP) || 0);
    }
  }

  if (depositedToday > 0) {
    recordDailyPoints(uid, wsUser.name, depositedToday, nowMs, "deposit");
  }
}

export function recordDailyPoints(uid, name, points, nowMs = Date.now(), source = "earned") {
  const amt = Math.floor(Number(points) || 0);
  if (!uid || amt <= 0) return null;

  settlePastDailyPools(nowMs);
  const todayUtc = getUtcDateKey(nowMs);
  if (!dbState.dailyPool.days[todayUtc]) {
    dbState.dailyPool.days[todayUtc] = { settled: false, players: {} };
  }
  const day = dbState.dailyPool.days[todayUtc];
  if (!day.players) day.players = {};

  const prev = normalizeDayPlayerRecord(day.players[uid]);
  const fallbackName = dbState.workstationUsers?.[uid]?.name;
  const cleanName = String(name || prev.name || fallbackName || "Jogador").slice(0, 32);

  let { earnedPoints, unspentEarnedPoints, depositedPoints } = prev;
  if (source === "deposit") {
    const coveredByTodayEarned = Math.min(unspentEarnedPoints, amt);
    unspentEarnedPoints -= coveredByTodayEarned;
    depositedPoints += amt;
  } else {
    earnedPoints += amt;
    unspentEarnedPoints += amt;
  }

  const totalPoints = depositedPoints + unspentEarnedPoints;

  day.players[uid] = {
    name: cleanName,
    points: totalPoints,
    earnedPoints,
    unspentEarnedPoints,
    depositedPoints,
    firstEarnedAt: prev.firstEarnedAt || nowMs,
    updatedAt: nowMs
  };
  if (dbState.workstationUsers?.[uid] && cleanName !== "Jogador") {
    dbState.workstationUsers[uid].name = cleanName;
  }

  saveDb();
  return day.players[uid];
}

export function getDailyPoolView(uid, nowMs = Date.now(), knownClaimedDates = null) {
  settlePastDailyPools(nowMs);
  if (uid && knownClaimedDates) {
    reconcileClientClaimedDailyDates(uid, knownClaimedDates);
  }
  if (uid) {
    reconcilePrePatchWorkstationDepositsToday(uid, nowMs);
  }
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

  const unclaimedDates = user
    ? user.dailyHistory
        .filter((r) => r && !r.claimed && !user.claimedDailyDates?.[r.date] && (r.bronzeEarned || 0) > 0)
        .map((r) => r.date)
    : [];

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
    dailyReadyToClaimBronze: user ? syncUserDailyClaimable(user) : 0,
    unclaimedDates,
    dailyHistory: user ? user.dailyHistory : [],
    leaderboard
  };
}

/**
 * Atomically starts a 1-time withdrawal for all settled, unclaimed UTC daily dates.
 * Shared by both Job Center (Workstation) and Post Office (Mail) so cross-claiming is impossible.
 */
export function beginDailyPoolClaim(uid, knownClaimedDates = null, nowMs = Date.now()) {
  if (!uid) return { allowed: false, claimedBronze: 0, claimedDates: [], claimId: null, pending: false };
  const key = String(uid);

  settlePastDailyPools(nowMs);
  if (knownClaimedDates) {
    reconcileClientClaimedDailyDates(key, knownClaimedDates);
  }
  const user = ensureWorkstationUserRecord(key);
  pruneDailyClaimRecords(user, nowMs);

  if (hasActivePendingDailyClaim(user, nowMs)) {
    return {
      allowed: false,
      pending: true,
      claimedBronze: 0,
      claimedDates: [],
      claimId: null,
      dailyReadyToClaimBronze: syncUserDailyClaimable(user)
    };
  }

  const targetRows = [];
  let totalBronze = 0;
  for (const row of user.dailyHistory) {
    if (!row || !row.date) continue;
    if (row.claimed || user.claimedDailyDates?.[row.date] || row.pendingClaimId) continue;
    const amt = Math.max(0, Math.floor(Number(row.bronzeEarned) || 0));
    if (amt <= 0) continue;
    targetRows.push(row);
    totalBronze += amt;
  }

  if (totalBronze <= 0 || targetRows.length === 0) {
    syncUserDailyClaimable(user);
    saveDb();
    return {
      allowed: false,
      pending: false,
      claimedBronze: 0,
      claimedDates: [],
      claimId: null,
      dailyReadyToClaimBronze: 0
    };
  }

  const claimId = crypto.randomUUID();
  const claimedDates = targetRows.map((r) => r.date);

  for (const row of targetRows) {
    row.claimed = true;
    row.pendingClaimId = claimId;
  }

  user.pendingDailyClaims[claimId] = {
    claimId,
    status: "pending",
    amount: totalBronze,
    dates: claimedDates,
    createdAt: nowMs,
    updatedAt: nowMs
  };
  user.pendingDailyClaim = { claimId, amount: totalBronze, dates: claimedDates, at: nowMs };
  syncUserDailyClaimable(user);
  saveDb();

  return {
    allowed: true,
    pending: false,
    claimId,
    claimedBronze: totalBronze,
    claimedDates,
    dailyReadyToClaimBronze: user.dailyReadyToClaimBronze
  };
}

export function confirmDailyPoolClaim(uid, claimId, nowMs = Date.now()) {
  if (!uid || !claimId) return false;
  const user = ensureWorkstationUserRecord(String(uid));
  const entry = user.pendingDailyClaims?.[claimId];
  if (!entry) {
    if (user.pendingDailyClaim && user.pendingDailyClaim.claimId === claimId) {
      user.pendingDailyClaim = null;
      saveDb();
    }
    return false;
  }
  if (entry.status !== "pending") return entry.status === "confirmed";

  entry.status = "confirmed";
  entry.updatedAt = nowMs;

  const dateSet = new Set(entry.dates || []);
  for (const dateKey of dateSet) {
    user.claimedDailyDates[dateKey] = nowMs;
  }
  for (const row of user.dailyHistory) {
    if (row && (row.pendingClaimId === claimId || dateSet.has(row.date))) {
      row.claimed = true;
      row.claimedAt = row.claimedAt || nowMs;
      delete row.pendingClaimId;
    }
  }
  if (user.pendingDailyClaim && user.pendingDailyClaim.claimId === claimId) {
    user.pendingDailyClaim = null;
  }
  syncUserDailyClaimable(user);
  saveDb();
  return true;
}

export function rollbackDailyPoolClaim(uid, claimId, nowMs = Date.now()) {
  if (!uid || !claimId) return false;
  const user = ensureWorkstationUserRecord(String(uid));
  const entry = user.pendingDailyClaims?.[claimId];
  if (!entry || entry.status !== "pending") return false;

  entry.status = "rolled_back";
  entry.updatedAt = nowMs;

  const dateSet = new Set(entry.dates || []);
  for (const row of user.dailyHistory) {
    if (row && (row.pendingClaimId === claimId || (dateSet.has(row.date) && !user.claimedDailyDates?.[row.date]))) {
      delete row.pendingClaimId;
      if (!user.claimedDailyDates?.[row.date]) {
        row.claimed = false;
        row.claimedAt = null;
      }
    }
  }
  if (user.pendingDailyClaim && user.pendingDailyClaim.claimId === claimId) {
    user.pendingDailyClaim = null;
  }
  syncUserDailyClaimable(user);
  saveDb();
  return true;
}
