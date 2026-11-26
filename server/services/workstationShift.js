import crypto from "crypto";
import { dbState, saveDb } from "../db.js";
import { ensureWorkstationUserRecord } from "./dailyPool.js";

export const CYCLE_DURATION_MS = 30 * 60 * 1000;
export const RATE_PERCENT = 5;
const PENDING_LOCK_MS = 60 * 1000;
const STALE_PENDING_RECORD_MS = 30 * 60 * 1000;

export function calcShiftBronze(depositedPP) {
  const pp = Math.max(0, Math.floor(Number(depositedPP) || 0));
  if (pp <= 0) return 0;
  const exact = Math.floor(pp * (RATE_PERCENT / 100));
  if (exact === 0 && pp >= 10) return 1;
  return exact;
}

export function parseClaimedShiftCyclesInput(input) {
  const out = {};
  if (!input) return out;
  if (typeof input === "string") {
    for (const part of input.split(",")) {
      const n = Math.floor(Number(part.trim()));
      if (Number.isFinite(n) && n > 0) out[String(n)] = Date.now();
    }
    return out;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const n = Math.floor(Number(item));
      if (Number.isFinite(n) && n > 0) out[String(n)] = Date.now();
    }
    return out;
  }
  if (typeof input === "object") {
    for (const [k, v] of Object.entries(input)) {
      const n = Math.floor(Number(k));
      if (Number.isFinite(n) && n > 0 && v) {
        const ts = Number(v);
        out[String(n)] = Number.isFinite(ts) && ts > 0 ? ts : Date.now();
      }
    }
  }
  return out;
}

function getLockedShiftCyclesForUser(user) {
  const locked = new Set();
  for (const entry of Object.values(user?.pendingShiftClaims || {})) {
    if (!entry || entry.status !== "pending") continue;
    for (const cid of entry.cycleIds || []) locked.add(String(cid));
  }
  return locked;
}

function hasActivePendingShiftClaim(user, nowMs = Date.now()) {
  for (const entry of Object.values(user?.pendingShiftClaims || {})) {
    if (entry && entry.status === "pending" && nowMs - (entry.createdAt || 0) < PENDING_LOCK_MS) {
      return true;
    }
  }
  return false;
}

function pruneShiftClaimRecords(user, nowMs = Date.now()) {
  if (!user?.pendingShiftClaims || typeof user.pendingShiftClaims !== "object") return;
  for (const [cid, entry] of Object.entries(user.pendingShiftClaims)) {
    if (!entry || (entry.status !== "pending" && nowMs - (entry.updatedAt || entry.createdAt || 0) > STALE_PENDING_RECORD_MS)) {
      delete user.pendingShiftClaims[cid];
    }
  }
}

export function syncUserShiftClaimable(user) {
  if (!user) return 0;
  const locked = getLockedShiftCyclesForUser(user);
  const claimedMap = user.claimedShiftCycles || {};

  // Legacy fallback: if there are no history rows with explicit claimed flags (or readyToClaimBronze came from older rows)
  let total = 0;
  let hasHistoryTracking = false;
  for (const row of user.history || []) {
    if (!row || row.cycleId == null) continue;
    hasHistoryTracking = true;
    const key = String(row.cycleId);
    if (claimedMap[key]) {
      row.claimed = true;
      if (!row.claimedAt) row.claimedAt = claimedMap[key];
      delete row.pendingClaimId;
      continue;
    }
    if (row.claimed || locked.has(key) || row.pendingClaimId) continue;
    const earned = Math.max(0, Math.floor(Number(row.bronzeEarned) || 0));
    if (earned > 0) total += earned;
  }

  if (hasHistoryTracking) {
    // Include any legacy unclaimed surplus only if not already accounted for
    if (typeof user.legacyShiftSurplusBronze === "number" && user.legacyShiftSurplusBronze > 0) {
      total += user.legacyShiftSurplusBronze;
    }
    user.readyToClaimBronze = total;
  }
  return user.readyToClaimBronze || 0;
}

function normalizeUserShiftLedger(u) {
  let dirty = false;
  if (typeof u.readyToClaimBronze !== "number") { u.readyToClaimBronze = 0; dirty = true; }
  if (!Array.isArray(u.history)) { u.history = []; dirty = true; }
  if (!u.claimedShiftCycles || typeof u.claimedShiftCycles !== "object") { u.claimedShiftCycles = {}; dirty = true; }
  if (!u.pendingShiftClaims || typeof u.pendingShiftClaims !== "object") { u.pendingShiftClaims = {}; dirty = true; }

  const needsMigration = u.history.some((row) => row && typeof row.claimed !== "boolean");
  if (needsMigration) {
    let rem = Math.max(0, Math.floor(Number(u.readyToClaimBronze) || 0));
    for (const row of u.history) {
      if (!row || row.cycleId == null) continue;
      const cKey = String(row.cycleId);
      if (typeof row.claimed === "boolean") {
        if (row.claimed && !u.claimedShiftCycles[cKey]) {
          u.claimedShiftCycles[cKey] = row.claimedAt || row.completedAt || Date.now();
        }
        continue;
      }
      const earned = Math.max(0, Math.floor(Number(row.bronzeEarned) || 0));
      if (u.claimedShiftCycles[cKey]) {
        row.claimed = true;
        row.claimedAt = u.claimedShiftCycles[cKey];
      } else if (earned <= 0) {
        row.claimed = true;
        row.claimedAt = row.completedAt || Date.now();
      } else if (rem >= earned) {
        row.claimed = false;
        row.claimedAt = null;
        rem -= earned;
      } else {
        row.claimed = true;
        row.claimedAt = row.completedAt || Date.now();
        u.claimedShiftCycles[cKey] = row.claimedAt;
      }
      dirty = true;
    }
    if (rem > 0) {
      u.legacyShiftSurplusBronze = (u.legacyShiftSurplusBronze || 0) + rem;
      dirty = true;
    }
    syncUserShiftClaimable(u);
  }
  return dirty;
}

export function reconcileClientClaimedShiftCycles(uid, knownShiftInput) {
  if (!uid) return false;
  const known = parseClaimedShiftCyclesInput(knownShiftInput);
  const keys = Object.keys(known);
  if (keys.length === 0) return false;

  const user = ensureWorkstationUserRecord(uid);
  normalizeUserShiftLedger(user);
  let dirty = false;

  for (const cKey of keys) {
    if (!user.claimedShiftCycles[cKey]) {
      user.claimedShiftCycles[cKey] = known[cKey];
      dirty = true;
    }
    for (const row of user.history) {
      if (row && String(row.cycleId) === cKey && (!row.claimed || row.pendingClaimId)) {
        row.claimed = true;
        row.claimedAt = row.claimedAt || known[cKey];
        delete row.pendingClaimId;
        dirty = true;
      }
    }
  }

  for (const entry of Object.values(user.pendingShiftClaims || {})) {
    if (entry && entry.status === "pending" && (entry.cycleIds || []).every((c) => !!user.claimedShiftCycles[String(c)])) {
      entry.status = "confirmed";
      entry.updatedAt = Date.now();
      dirty = true;
    }
  }

  const prev = user.readyToClaimBronze;
  const synced = syncUserShiftClaimable(user);
  if (synced !== prev) dirty = true;
  if (dirty) saveDb();
  return dirty;
}

export function settleAllExpiredWorkstationShifts(now = Date.now()) {
  const currentCycleId = Math.floor(now / CYCLE_DURATION_MS);
  if (!dbState.workstationUsers || typeof dbState.workstationUsers !== "object") {
    dbState.workstationUsers = {};
  }

  let dirty = false;
  for (const u of Object.values(dbState.workstationUsers)) {
    if (!u || typeof u !== "object") continue;
    if (!Array.isArray(u.history)) { u.history = []; dirty = true; }
    if (!u.pendingTx || typeof u.pendingTx !== "object") { u.pendingTx = {}; dirty = true; }
    if (typeof u.readyToClaimBronze !== "number") { u.readyToClaimBronze = 0; dirty = true; }
    if (typeof u.depositedPP !== "number") { u.depositedPP = 0; dirty = true; }
    if (typeof u.cycleId !== "number") { u.cycleId = currentCycleId; dirty = true; }
    if (normalizeUserShiftLedger(u)) dirty = true;

    if (u.cycleId < currentCycleId) {
      if (u.depositedPP > 0) {
        const cKey = String(u.cycleId);
        const alreadyHasCycle = u.history.some((h) => h && String(h.cycleId) === cKey);
        if (!alreadyHasCycle) {
          const bronzeEarned = calcShiftBronze(u.depositedPP);
          const alreadyClaimedTs = u.claimedShiftCycles?.[cKey] || null;
          const noPayout = bronzeEarned <= 0;
          u.history.unshift({
            cycleId: u.cycleId,
            depositedPP: u.depositedPP,
            bronzeEarned,
            completedAt: now,
            claimed: Boolean(alreadyClaimedTs || noPayout),
            claimedAt: alreadyClaimedTs || (noPayout ? now : null)
          });
          if (u.history.length > 20) u.history.length = 20;
          syncUserShiftClaimable(u);
        }
      }
      u.cycleId = currentCycleId;
      u.depositedPP = 0;
      u.firstDepositedAt = 0;
      dirty = true;
    }
  }

  if (dirty) saveDb();
  return { currentCycleId, cycleRemainingMs: CYCLE_DURATION_MS - (now % CYCLE_DURATION_MS) };
}

export function getOrUpdateWorkstationUser(uid, name = null, knownClaimedShiftCycles = null) {
  const now = Date.now();
  const { currentCycleId, cycleRemainingMs } = settleAllExpiredWorkstationShifts(now);
  const state = ensureWorkstationUserRecord(uid);
  let dirty = normalizeUserShiftLedger(state);

  if (knownClaimedShiftCycles) {
    reconcileClientClaimedShiftCycles(uid, knownClaimedShiftCycles);
  }

  if (typeof state.cycleId !== "number" || state.cycleId < currentCycleId) {
    state.cycleId = currentCycleId;
    state.depositedPP = 0;
    state.firstDepositedAt = 0;
    dirty = true;
  }

  const cleanName = typeof name === "string" && name.trim() ? name.trim().slice(0, 32) : null;
  if (cleanName && cleanName !== "Jogador" && state.name !== cleanName) {
    state.name = cleanName;
    dirty = true;
  }

  if (dirty) saveDb();
  return { state, currentCycleId, cycleRemainingMs };
}

export function getShiftPoolView(uid, now = Date.now()) {
  const { currentCycleId, cycleRemainingMs } = settleAllExpiredWorkstationShifts(now);
  const list = [];

  for (const [id, u] of Object.entries(dbState.workstationUsers || {})) {
    if (!u || u.cycleId !== currentCycleId) continue;
    const pp = Math.max(0, Math.floor(Number(u.depositedPP) || 0));
    if (pp <= 0) continue;
    list.push({
      uid: id,
      name: String(u.name || "Jogador"),
      depositedPP: pp,
      estimatedBronze: calcShiftBronze(pp),
      firstDepositedAt: Number(u.firstDepositedAt) || Number(u.updatedAt) || 0
    });
  }

  list.sort((a, b) => {
    if (b.depositedPP !== a.depositedPP) return b.depositedPP - a.depositedPP;
    if (a.firstDepositedAt !== b.firstDepositedAt) return a.firstDepositedAt - b.firstDepositedAt;
    return a.uid.localeCompare(b.uid);
  });

  const totalDepositedPP = list.reduce((sum, item) => sum + item.depositedPP, 0);
  const participantsCount = list.length;
  const leaderboard = list.slice(0, 25).map((item, idx) => ({
    uid: item.uid,
    name: item.name,
    rank: idx + 1,
    depositedPP: item.depositedPP,
    estimatedBronze: item.estimatedBronze
  }));

  const myIndex = uid ? list.findIndex((item) => item.uid === uid) : -1;
  const myEntry = myIndex >= 0 ? list[myIndex] : null;

  return {
    cycleId: currentCycleId,
    cycleDurationMs: CYCLE_DURATION_MS,
    cycleRemainingMs,
    participantsCount,
    totalDepositedPP,
    myRank: myIndex >= 0 ? myIndex + 1 : null,
    myDepositedPP: myEntry ? myEntry.depositedPP : 0,
    myEstimatedBronze: myEntry ? myEntry.estimatedBronze : 0,
    leaderboard
  };
}

export function beginShiftClaim(uid, knownShiftCycles = null, nowMs = Date.now()) {
  if (!uid) return { allowed: false, pending: false, claimedBronze: 0, claimedShiftCycles: [], claimId: null };
  const key = String(uid);
  const { state, currentCycleId, cycleRemainingMs } = getOrUpdateWorkstationUser(key, null, knownShiftCycles);
  pruneShiftClaimRecords(state, nowMs);

  if (hasActivePendingShiftClaim(state, nowMs)) {
    return {
      allowed: false,
      pending: true,
      claimedBronze: 0,
      claimedShiftCycles: [],
      claimId: null,
      cycleId: currentCycleId,
      cycleRemainingMs,
      depositedPP: state.depositedPP,
      readyToClaimBronze: syncUserShiftClaimable(state)
    };
  }

  const targetRows = [];
  let totalBronze = 0;
  for (const row of state.history) {
    if (!row || row.cycleId == null) continue;
    const cKey = String(row.cycleId);
    if (row.claimed || state.claimedShiftCycles?.[cKey] || row.pendingClaimId) continue;
    const amt = Math.max(0, Math.floor(Number(row.bronzeEarned) || 0));
    if (amt <= 0) continue;
    targetRows.push(row);
    totalBronze += amt;
  }

  const legacySurplus = Math.max(0, Math.floor(Number(state.legacyShiftSurplusBronze) || 0));
  totalBronze += legacySurplus;

  if (totalBronze <= 0) {
    syncUserShiftClaimable(state);
    saveDb();
    return {
      allowed: false,
      pending: false,
      claimedBronze: 0,
      claimedShiftCycles: [],
      claimId: null,
      cycleId: currentCycleId,
      cycleRemainingMs,
      depositedPP: state.depositedPP,
      readyToClaimBronze: 0
    };
  }

  const claimId = crypto.randomUUID();
  const cycleIds = targetRows.map((r) => String(r.cycleId));
  for (const row of targetRows) {
    row.claimed = true;
    row.pendingClaimId = claimId;
  }
  state.legacyShiftSurplusBronze = 0;

  state.pendingShiftClaims[claimId] = {
    claimId,
    status: "pending",
    amount: totalBronze,
    legacySurplus,
    cycleIds,
    createdAt: nowMs,
    updatedAt: nowMs
  };
  state.pendingClaim = { claimId, amount: totalBronze, cycleIds, at: nowMs };
  syncUserShiftClaimable(state);
  saveDb();

  return {
    allowed: true,
    pending: false,
    claimId,
    claimedBronze: totalBronze,
    claimedShiftCycles: cycleIds,
    cycleId: currentCycleId,
    cycleRemainingMs,
    depositedPP: state.depositedPP,
    readyToClaimBronze: state.readyToClaimBronze
  };
}

export function confirmShiftClaim(uid, claimId, nowMs = Date.now()) {
  if (!uid || !claimId) return false;
  const state = ensureWorkstationUserRecord(String(uid));
  normalizeUserShiftLedger(state);
  const entry = state.pendingShiftClaims?.[claimId];
  if (!entry) {
    if (state.pendingClaim && state.pendingClaim.claimId === claimId) {
      state.pendingClaim = null;
      saveDb();
    }
    return false;
  }
  if (entry.status !== "pending") return entry.status === "confirmed";

  entry.status = "confirmed";
  entry.updatedAt = nowMs;

  const cycleSet = new Set((entry.cycleIds || []).map(String));
  for (const cKey of cycleSet) {
    state.claimedShiftCycles[cKey] = nowMs;
  }
  for (const row of state.history) {
    if (row && (row.pendingClaimId === claimId || cycleSet.has(String(row.cycleId)))) {
      row.claimed = true;
      row.claimedAt = row.claimedAt || nowMs;
      delete row.pendingClaimId;
    }
  }
  if (state.pendingClaim && state.pendingClaim.claimId === claimId) {
    state.pendingClaim = null;
  }
  syncUserShiftClaimable(state);
  saveDb();
  return true;
}

export function rollbackShiftClaim(uid, claimId, nowMs = Date.now()) {
  if (!uid || !claimId) return false;
  const state = ensureWorkstationUserRecord(String(uid));
  normalizeUserShiftLedger(state);
  const entry = state.pendingShiftClaims?.[claimId];
  if (!entry || entry.status !== "pending") return false;

  entry.status = "rolled_back";
  entry.updatedAt = nowMs;

  const cycleSet = new Set((entry.cycleIds || []).map(String));
  for (const row of state.history) {
    const cKey = String(row?.cycleId);
    if (row && (row.pendingClaimId === claimId || (cycleSet.has(cKey) && !state.claimedShiftCycles?.[cKey]))) {
      delete row.pendingClaimId;
      if (!state.claimedShiftCycles?.[cKey]) {
        row.claimed = false;
        row.claimedAt = null;
      }
    }
  }
  if (entry.legacySurplus > 0) {
    state.legacyShiftSurplusBronze = (state.legacyShiftSurplusBronze || 0) + entry.legacySurplus;
  }
  if (state.pendingClaim && state.pendingClaim.claimId === claimId) {
    state.pendingClaim = null;
  }
  syncUserShiftClaimable(state);
  saveDb();
  return true;
}
