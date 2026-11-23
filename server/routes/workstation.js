import { Router } from "express";
import crypto from "crypto";
import { dbState, saveDb } from "../db.js";
import { ensureWorkstationUserRecord, getDailyPoolView } from "../dailyPool.js";

const router = Router();
const CYCLE_DURATION_MS = 30 * 60 * 1000;
const RATE_PERCENT = 5;

export function calcShiftBronze(depositedPP) {
  const pp = Math.max(0, Math.floor(Number(depositedPP) || 0));
  if (pp <= 0) return 0;
  const exact = Math.floor(pp * (RATE_PERCENT / 100));
  if (exact === 0 && pp >= 10) return 1;
  return exact;
}

export function settleAllExpiredWorkstationShifts(now = Date.now()) {
  const currentCycleId = Math.floor(now / CYCLE_DURATION_MS);
  if (!dbState.workstationUsers || typeof dbState.workstationUsers !== "object") {
    dbState.workstationUsers = {};
  }

  let dirty = false;
  for (const [uid, u] of Object.entries(dbState.workstationUsers)) {
    if (!u || typeof u !== "object") continue;
    if (!Array.isArray(u.history)) { u.history = []; dirty = true; }
    if (!u.pendingTx || typeof u.pendingTx !== "object") { u.pendingTx = {}; dirty = true; }
    if (typeof u.readyToClaimBronze !== "number") { u.readyToClaimBronze = 0; dirty = true; }
    if (typeof u.depositedPP !== "number") { u.depositedPP = 0; dirty = true; }
    if (typeof u.cycleId !== "number") { u.cycleId = currentCycleId; dirty = true; }

    if (u.cycleId < currentCycleId) {
      if (u.depositedPP > 0) {
        const bronzeEarned = calcShiftBronze(u.depositedPP);
        u.readyToClaimBronze = (u.readyToClaimBronze || 0) + bronzeEarned;
        u.history.unshift({
          cycleId: u.cycleId,
          depositedPP: u.depositedPP,
          bronzeEarned,
          completedAt: now
        });
        if (u.history.length > 10) u.history.length = 10;
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

export function getOrUpdateWorkstationUser(uid, name = null) {
  const now = Date.now();
  const { currentCycleId, cycleRemainingMs } = settleAllExpiredWorkstationShifts(now);
  const state = ensureWorkstationUserRecord(uid);
  let dirty = false;

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

router.get("/status", (req, res) => {
  const uid = String(req.query.uid || "");
  if (!uid) return res.status(400).json({ error: "UID is required" });
  const name = req.query.name ? String(req.query.name) : null;

  const { state, currentCycleId, cycleRemainingMs } = getOrUpdateWorkstationUser(uid, name);
  const shiftPool = getShiftPoolView(uid);
  const dailyPool = getDailyPoolView(uid);

  res.json({
    cycleId: currentCycleId,
    cycleDurationMs: CYCLE_DURATION_MS,
    cycleRemainingMs,
    depositedPP: state.depositedPP,
    estimatedBronze: calcShiftBronze(state.depositedPP),
    readyToClaimBronze: state.readyToClaimBronze,
    ratePercent: RATE_PERCENT,
    history: state.history,
    shiftPool,
    dailyPool,
    serverTimeUtc: Date.now()
  });
});

// Step 1: Ask the server whether the deposit action is allowed before deducting client wallet
router.post("/validate-deposit", (req, res) => {
  const { uid, name, amount, clientBalancePP } = req.body || {};
  const depositAmt = Math.floor(Number(amount));
  const balPP = Math.floor(Number(clientBalancePP));

  if (!uid || isNaN(depositAmt) || depositAmt <= 0) {
    return res.status(400).json({ allowed: false, error: "Valid positive amount is required" });
  }
  if (isNaN(balPP) || balPP < depositAmt) {
    return res.status(400).json({ allowed: false, error: "Insufficient Pool Points" });
  }

  const { state, currentCycleId, cycleRemainingMs } = getOrUpdateWorkstationUser(String(uid), name);
  const txId = crypto.randomUUID();
  state.pendingTx[txId] = {
    amount: depositAmt,
    cycleId: currentCycleId,
    createdAt: Date.now()
  };

  // Prune expired pending transactions (>5 min)
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, tx] of Object.entries(state.pendingTx)) {
    if (tx.createdAt < cutoff) delete state.pendingTx[id];
  }
  saveDb();

  res.json({
    allowed: true,
    txId,
    cycleId: currentCycleId,
    cycleRemainingMs
  });
});

// Step 2: Confirm deposit after wallet deduction & persist to server DB
router.post("/deposit", (req, res) => {
  const { uid, name, amount, txId } = req.body || {};
  const depositAmt = Math.floor(Number(amount));
  if (!uid || isNaN(depositAmt) || depositAmt <= 0) {
    return res.status(400).json({ error: "Valid amount is required" });
  }

  const { state, currentCycleId, cycleRemainingMs } = getOrUpdateWorkstationUser(String(uid), name);

  if (txId) {
    const tx = state.pendingTx[txId];
    if (!tx || tx.amount !== depositAmt) {
      return res.status(400).json({ error: "Invalid or expired deposit authorization" });
    }
    delete state.pendingTx[txId];
  }

  const now = Date.now();
  state.depositedPP += depositAmt;
  if (!state.firstDepositedAt) state.firstDepositedAt = now;
  state.updatedAt = now;
  saveDb();

  const shiftPool = getShiftPoolView(String(uid), now);
  res.json({
    success: true,
    cycleId: currentCycleId,
    cycleRemainingMs,
    depositedPP: state.depositedPP,
    estimatedBronze: calcShiftBronze(state.depositedPP),
    readyToClaimBronze: state.readyToClaimBronze,
    shiftPool
  });
});

// Claim completed bronze reward (persisted, with rollback support if client commit fails)
router.post("/claim", (req, res) => {
  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: "UID is required" });

  const { state, currentCycleId, cycleRemainingMs } = getOrUpdateWorkstationUser(String(uid));
  const claimed = state.readyToClaimBronze || 0;
  if (claimed <= 0) {
    return res.json({
      success: false,
      allowed: false,
      claimedBronze: 0,
      cycleId: currentCycleId,
      cycleRemainingMs,
      depositedPP: state.depositedPP,
      readyToClaimBronze: 0
    });
  }

  const claimId = crypto.randomUUID();
  state.readyToClaimBronze = 0;
  state.pendingClaim = { claimId, amount: claimed, at: Date.now() };
  saveDb();

  res.json({
    success: true,
    allowed: true,
    claimId,
    claimedBronze: claimed,
    cycleId: currentCycleId,
    cycleRemainingMs,
    depositedPP: state.depositedPP,
    readyToClaimBronze: 0
  });
});

router.post("/claim-confirm", (req, res) => {
  const { uid, claimId } = req.body || {};
  const state = uid && dbState.workstationUsers[String(uid)];
  if (state && state.pendingClaim && state.pendingClaim.claimId === claimId) {
    state.pendingClaim = null;
    saveDb();
  }
  res.json({ success: true });
});

router.post("/claim-rollback", (req, res) => {
  const { uid, claimId } = req.body || {};
  const state = uid && dbState.workstationUsers[String(uid)];
  if (state && state.pendingClaim && state.pendingClaim.claimId === claimId) {
    state.readyToClaimBronze = (state.readyToClaimBronze || 0) + state.pendingClaim.amount;
    state.pendingClaim = null;
    saveDb();
  }
  res.json({ success: true });
});

// Claim completed Daily Pool bronze reward (atomic confirm / rollback)
router.post("/daily-claim", (req, res) => {
  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: "UID is required" });

  getDailyPoolView(String(uid)); // Ensure any completed UTC days are settled first
  const state = ensureWorkstationUserRecord(String(uid));
  const claimed = state.dailyReadyToClaimBronze || 0;
  if (claimed <= 0) {
    return res.json({
      success: false,
      allowed: false,
      claimedBronze: 0,
      dailyReadyToClaimBronze: 0
    });
  }

  const claimId = crypto.randomUUID();
  state.dailyReadyToClaimBronze = 0;
  state.pendingDailyClaim = { claimId, amount: claimed, at: Date.now() };
  saveDb();

  res.json({
    success: true,
    allowed: true,
    claimId,
    claimedBronze: claimed,
    dailyReadyToClaimBronze: 0
  });
});

router.post("/daily-claim-confirm", (req, res) => {
  const { uid, claimId } = req.body || {};
  const state = uid && dbState.workstationUsers[String(uid)];
  if (state && state.pendingDailyClaim && state.pendingDailyClaim.claimId === claimId) {
    state.pendingDailyClaim = null;
    saveDb();
  }
  res.json({ success: true });
});

router.post("/daily-claim-rollback", (req, res) => {
  const { uid, claimId } = req.body || {};
  const state = uid && dbState.workstationUsers[String(uid)];
  if (state && state.pendingDailyClaim && state.pendingDailyClaim.claimId === claimId) {
    state.dailyReadyToClaimBronze = (state.dailyReadyToClaimBronze || 0) + state.pendingDailyClaim.amount;
    state.pendingDailyClaim = null;
    saveDb();
  }
  res.json({ success: true });
});

export default router;
