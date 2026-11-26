import { Router } from "express";
import crypto from "crypto";
import { saveDb } from "../db.js";
import {
  recordDailyPoints,
  getDailyPoolView,
  beginDailyPoolClaim,
  confirmDailyPoolClaim,
  rollbackDailyPoolClaim
} from "../services/dailyPool.js";
import {
  RATE_PERCENT,
  calcShiftBronze,
  getOrUpdateWorkstationUser,
  getShiftPoolView,
  beginShiftClaim,
  confirmShiftClaim,
  rollbackShiftClaim
} from "../services/workstationShift.js";

const router = Router();

export { calcShiftBronze, getOrUpdateWorkstationUser, getShiftPoolView };

router.get("/status", (req, res) => {
  const uid = String(req.query.uid || "");
  if (!uid) return res.status(400).json({ error: "UID is required" });
  const name = req.query.name ? String(req.query.name) : null;
  const knownDailyDates = req.query.claimedDates ? String(req.query.claimedDates) : null;
  const knownShiftCycles = req.query.claimedShifts ? String(req.query.claimedShifts) : null;

  const { state, currentCycleId, cycleRemainingMs } = getOrUpdateWorkstationUser(uid, name, knownShiftCycles);
  const shiftPool = getShiftPoolView(uid);
  const dailyPool = getDailyPoolView(uid, Date.now(), knownDailyDates);

  res.json({
    cycleId: currentCycleId,
    cycleDurationMs: shiftPool.cycleDurationMs,
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

  recordDailyPoints(String(uid), name || state.name, depositAmt, now, "deposit");

  const shiftPool = getShiftPoolView(String(uid), now);
  const dailyPool = getDailyPoolView(String(uid), now);
  res.json({
    success: true,
    cycleId: currentCycleId,
    cycleRemainingMs,
    depositedPP: state.depositedPP,
    estimatedBronze: calcShiftBronze(state.depositedPP),
    readyToClaimBronze: state.readyToClaimBronze,
    shiftPool,
    dailyPool
  });
});

// Claim completed 30m shift bronze reward (idempotent confirm / rollback)
router.post("/claim", (req, res) => {
  const { uid, claimedShiftCycles } = req.body || {};
  if (!uid) return res.status(400).json({ error: "UID is required" });

  const result = beginShiftClaim(String(uid), claimedShiftCycles);
  res.json({
    success: result.allowed,
    ...result
  });
});

router.post("/claim-confirm", (req, res) => {
  const { uid, claimId } = req.body || {};
  confirmShiftClaim(uid, claimId);
  res.json({ success: true });
});

router.post("/claim-rollback", (req, res) => {
  const { uid, claimId } = req.body || {};
  rollbackShiftClaim(uid, claimId);
  res.json({ success: true });
});

// Claim completed Daily Pool bronze reward (single-use per UTC date, idempotent confirm / rollback)
router.post("/daily-claim", (req, res) => {
  const { uid, claimedDailyDates } = req.body || {};
  if (!uid) return res.status(400).json({ error: "UID is required" });

  const result = beginDailyPoolClaim(String(uid), claimedDailyDates);
  res.json({
    success: result.allowed,
    ...result
  });
});

router.post("/daily-claim-confirm", (req, res) => {
  const { uid, claimId } = req.body || {};
  confirmDailyPoolClaim(uid, claimId);
  res.json({ success: true });
});

router.post("/daily-claim-rollback", (req, res) => {
  const { uid, claimId } = req.body || {};
  rollbackDailyPoolClaim(uid, claimId);
  res.json({ success: true });
});

export default router;
