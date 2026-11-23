import { Router } from "express";
import crypto from "crypto";
import { dbState, saveDb } from "../db.js";
import { ensureWorkstationUserRecord, getDailyPoolView } from "../dailyPool.js";

const router = Router();
const CYCLE_DURATION_MS = 30 * 60 * 1000;
const RATE_PERCENT = 5;

function getOrUpdateWorkstationUser(uid) {
  const now = Date.now();
  const currentCycleId = Math.floor(now / CYCLE_DURATION_MS);
  const cycleRemainingMs = CYCLE_DURATION_MS - (now % CYCLE_DURATION_MS);

  let state = dbState.workstationUsers[uid];
  let dirty = false;

  if (!state) {
    state = {
      cycleId: currentCycleId,
      depositedPP: 0,
      readyToClaimBronze: 0,
      history: [],
      pendingTx: {},
      pendingClaim: null
    };
    dbState.workstationUsers[uid] = state;
    dirty = true;
  } else {
    if (!Array.isArray(state.history)) state.history = [];
    if (!state.pendingTx || typeof state.pendingTx !== "object") state.pendingTx = {};
    if (state.cycleId < currentCycleId) {
      if (state.depositedPP > 0) {
        const bronzeEarned = Math.floor(state.depositedPP * (RATE_PERCENT / 100));
        state.readyToClaimBronze = (state.readyToClaimBronze || 0) + bronzeEarned;
        state.history.unshift({
          cycleId: state.cycleId,
          depositedPP: state.depositedPP,
          bronzeEarned,
          completedAt: now
        });
        if (state.history.length > 10) state.history.pop();
      }
      state.cycleId = currentCycleId;
      state.depositedPP = 0;
      dirty = true;
    }
  }

  if (dirty) saveDb();
  return { state, currentCycleId, cycleRemainingMs };
}

router.get("/status", (req, res) => {
  const uid = String(req.query.uid || "");
  if (!uid) return res.status(400).json({ error: "UID is required" });

  const { state, currentCycleId, cycleRemainingMs } = getOrUpdateWorkstationUser(uid);
  const dailyPool = getDailyPoolView(uid);

  res.json({
    cycleId: currentCycleId,
    cycleDurationMs: CYCLE_DURATION_MS,
    cycleRemainingMs,
    depositedPP: state.depositedPP,
    estimatedBronze: Math.floor(state.depositedPP * (RATE_PERCENT / 100)),
    readyToClaimBronze: state.readyToClaimBronze,
    ratePercent: RATE_PERCENT,
    history: state.history,
    dailyPool,
    serverTimeUtc: Date.now()
  });
});

// Step 1: Ask the server whether the deposit action is allowed before deducting client wallet
router.post("/validate-deposit", (req, res) => {
  const { uid, amount, clientBalancePP } = req.body || {};
  const depositAmt = Math.floor(Number(amount));
  const balPP = Math.floor(Number(clientBalancePP));

  if (!uid || isNaN(depositAmt) || depositAmt <= 0) {
    return res.status(400).json({ allowed: false, error: "Valid positive amount is required" });
  }
  if (isNaN(balPP) || balPP < depositAmt) {
    return res.status(400).json({ allowed: false, error: "Insufficient Pool Points" });
  }

  const { state, currentCycleId, cycleRemainingMs } = getOrUpdateWorkstationUser(String(uid));
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
  const { uid, amount, txId } = req.body || {};
  const depositAmt = Math.floor(Number(amount));
  if (!uid || isNaN(depositAmt) || depositAmt <= 0) {
    return res.status(400).json({ error: "Valid amount is required" });
  }

  const { state, currentCycleId, cycleRemainingMs } = getOrUpdateWorkstationUser(String(uid));

  if (txId) {
    const tx = state.pendingTx[txId];
    if (!tx || tx.amount !== depositAmt) {
      return res.status(400).json({ error: "Invalid or expired deposit authorization" });
    }
    delete state.pendingTx[txId];
  }

  state.depositedPP += depositAmt;
  state.updatedAt = Date.now();
  saveDb();

  res.json({
    success: true,
    cycleId: currentCycleId,
    cycleRemainingMs,
    depositedPP: state.depositedPP,
    estimatedBronze: Math.floor(state.depositedPP * (RATE_PERCENT / 100)),
    readyToClaimBronze: state.readyToClaimBronze
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
