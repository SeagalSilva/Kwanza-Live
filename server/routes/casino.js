import { Router } from "express";
import crypto from "crypto";
import { dbState, saveDb } from "../db.js";
import { SLOT_MACHINES, evaluateSlotSpin } from "../slotEngine.js";

export { SLOT_MACHINES };

const router = Router();

const SLOT_OCCUPANCY_TTL_MS = 120_000; // Auto-release after 2m inactivity
const MAX_BET_BRONZE = 10_000;

// 15 possibilities: 8 loss, 1 super bonus (3rd wheel), 2 (+2 free spins), 2 (+50% / 1.5x), 1 (2x), 1 (side bonus wheel)
export const MAIN_ROULETTE_SLICES = [
  { index: 0,  type: "loss",              label: "Derrota",      color: "#2a1b24" },
  { index: 1,  type: "win_50pct",         label: "+50%",         color: "#1e7e4f" },
  { index: 2,  type: "loss",              label: "Derrota",      color: "#2a1b24" },
  { index: 3,  type: "free_spin_2",       label: "+2 Free Spin", color: "#2266aa" },
  { index: 4,  type: "loss",              label: "Derrota",      color: "#2a1b24" },
  { index: 5,  type: "super_bonus_wheel", label: "Novo Bónus",   color: "#c0392b" },
  { index: 6,  type: "loss",              label: "Derrota",      color: "#2a1b24" },
  { index: 7,  type: "win_2x",            label: "2× Dobro",     color: "#b9770e" },
  { index: 8,  type: "loss",              label: "Derrota",      color: "#2a1b24" },
  { index: 9,  type: "win_50pct",         label: "+50%",         color: "#1e7e4f" },
  { index: 10, type: "loss",              label: "Derrota",      color: "#2a1b24" },
  { index: 11, type: "free_spin_2",       label: "+2 Free Spin", color: "#2266aa" },
  { index: 12, type: "loss",              label: "Derrota",      color: "#2a1b24" },
  { index: 13, type: "bonus_wheel",       label: "Roleta Bónus", color: "#8e44ad" },
  { index: 14, type: "loss",              label: "Derrota",      color: "#2a1b24" }
];

// Side Bonus Wheel (4 positive values)
export const BONUS_ROULETTE_SLICES = [
  { index: 0, type: "refund_1fs", label: "Devolve + 1 FS", color: "#2980b9" },
  { index: 1, type: "refund",     label: "Devolve Aposta", color: "#16a085" },
  { index: 2, type: "free_3fs",   label: "+3 Free Spins",  color: "#8e44ad" },
  { index: 3, type: "win_3x",     label: "3× Triplo!",     color: "#d4ac0d" }
];

// 3rd Roulette Wheel (12 new possibilities: up to +5 FS, up to 5x bet, and 2 Nada)
export const SUPER_ROULETTE_SLICES = [
  { index: 0,  type: "nada",    value: 0,   label: "Nada",          color: "#251822" },
  { index: 1,  type: "fs",      value: 1,   label: "+1 Free Spin",  color: "#1f6fb2" },
  { index: 2,  type: "mult",    value: 1.5, label: "1.5× Aposta",   color: "#1e8449" },
  { index: 3,  type: "fs",      value: 2,   label: "+2 Free Spins", color: "#2874a6" },
  { index: 4,  type: "mult",    value: 2,   label: "2× Aposta",     color: "#b7950b" },
  { index: 5,  type: "fs",      value: 4,   label: "+4 Free Spins", color: "#6c3483" },
  { index: 6,  type: "nada",    value: 0,   label: "Nada",          color: "#251822" },
  { index: 7,  type: "mult",    value: 3,   label: "3× Aposta",     color: "#d68910" },
  { index: 8,  type: "fs",      value: 3,   label: "+3 Free Spins", color: "#2e86c1" },
  { index: 9,  type: "mult",    value: 4,   label: "4× Aposta",     color: "#ca6f1e" },
  { index: 10, type: "fs",      value: 5,   label: "+5 Free Spins", color: "#884ea0" },
  { index: 11, type: "mult",    value: 5,   label: "5× MEGA!",      color: "#d4ac0d" }
];

function ensureCasinoState() {
  if (!dbState.casino || typeof dbState.casino !== "object") {
    dbState.casino = { machines: {}, rouletteSessions: {}, slotSessions: {}, pendingSpins: {}, pendingPayouts: {}, recentWins: [] };
  }
  const c = dbState.casino;
  if (!c.machines || typeof c.machines !== "object") c.machines = {};
  if (!c.rouletteSessions || typeof c.rouletteSessions !== "object") c.rouletteSessions = {};
  if (!c.slotSessions || typeof c.slotSessions !== "object") c.slotSessions = {};
  if (!c.pendingSpins || typeof c.pendingSpins !== "object") c.pendingSpins = {};
  if (!c.pendingPayouts || typeof c.pendingPayouts !== "object") c.pendingPayouts = {};
  if (!Array.isArray(c.recentWins)) c.recentWins = [];
  return c;
}

function pruneStale(nowMs = Date.now()) {
  const c = ensureCasinoState();
  let dirty = false;
  for (const m of SLOT_MACHINES) {
    const occ = c.machines[m.id];
    if (occ && nowMs - (occ.occupiedAt || 0) > SLOT_OCCUPANCY_TTL_MS) {
      delete c.machines[m.id];
      dirty = true;
    }
  }
  const spinCutoff = nowMs - 5 * 60 * 1000;
  for (const [id, sp] of Object.entries(c.pendingSpins)) {
    if ((sp?.createdAt || 0) < spinCutoff) {
      delete c.pendingSpins[id];
      dirty = true;
    }
  }
  if (dirty) saveDb();
}

function releaseUserMachines(uid) {
  const c = ensureCasinoState();
  let changed = false;
  for (const [mid, occ] of Object.entries(c.machines)) {
    if (occ && occ.uid === uid) {
      delete c.machines[mid];
      changed = true;
    }
  }
  if (c.slotSessions[uid]) {
    delete c.slotSessions[uid];
    changed = true;
  }
  if (changed) saveDb();
}

function pushWinLog(entry) {
  const c = ensureCasinoState();
  c.recentWins.unshift({ ...entry, at: Date.now() });
  if (c.recentWins.length > 15) c.recentWins.length = 15;
}

router.get("/state", (req, res) => {
  const uid = String(req.query.uid || "");
  pruneStale();
  const c = ensureCasinoState();
  const session = uid ? (c.rouletteSessions[uid] || { freeSpins: 0, lockedBet: 0 }) : { freeSpins: 0, lockedBet: 0 };
  const slotSession = uid ? (c.slotSessions[uid] || { machineId: null, freeSpins: 0, lockedBet: 0, mode: null }) : { machineId: null, freeSpins: 0, lockedBet: 0, mode: null };

  res.json({
    machines: c.machines,
    roulette: session,
    slotSession,
    recentWins: c.recentWins,
    serverTimeUtc: Date.now()
  });
});

// ── Slot Machine Occupancy ───────────────────────────────────
router.post("/slot/occupy", (req, res) => {
  const { uid, name, machineId } = req.body || {};
  const m = SLOT_MACHINES.find((x) => x.id === machineId);
  if (!uid || !m) return res.status(400).json({ allowed: false, error: "Invalid machine or player" });

  pruneStale();
  const c = ensureCasinoState();
  const uidStr = String(uid);
  const existing = c.machines[m.id];
  if (existing && existing.uid !== uidStr) {
    return res.status(409).json({
      allowed: false,
      error: "Machine occupied",
      occupiedBy: existing.name
    });
  }

  for (const [mid, occ] of Object.entries(c.machines)) {
    if (occ && occ.uid === uidStr && mid !== m.id) {
      delete c.machines[mid];
    }
  }
  if (c.slotSessions[uidStr] && c.slotSessions[uidStr].machineId !== m.id) {
    delete c.slotSessions[uidStr];
  }

  c.machines[m.id] = {
    uid: uidStr,
    name: String(name || "Jogador").slice(0, 24),
    occupiedAt: Date.now()
  };
  saveDb();

  res.json({ allowed: true, machine: c.machines[m.id], machines: c.machines });
});

router.post("/slot/heartbeat", (req, res) => {
  const { uid, machineId } = req.body || {};
  const c = ensureCasinoState();
  const uidStr = String(uid || "");
  if (uidStr && machineId && c.machines[machineId]?.uid === uidStr) {
    c.machines[machineId].occupiedAt = Date.now();
    saveDb();
    return res.json({ ok: true });
  }
  res.status(409).json({ ok: false });
});

router.post("/slot/release", (req, res) => {
  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: "UID required" });
  releaseUserMachines(String(uid));
  res.json({ success: true, machines: ensureCasinoState().machines });
});

// ── 3-Set Slot Machine Spin ──────────────────────────────────
router.post("/slot/validate-spin", (req, res) => {
  const { uid, machineId, bet, bronzeBalance } = req.body || {};
  const m = SLOT_MACHINES.find((x) => x.id === machineId);
  if (!uid || !m) {
    return res.status(400).json({ allowed: false, error: "Invalid machine or UID" });
  }

  pruneStale();
  const c = ensureCasinoState();
  const uidStr = String(uid);
  const occ = c.machines[m.id];
  if (occ && occ.uid !== uidStr) {
    return res.status(409).json({ allowed: false, error: "Machine occupied by another player" });
  }

  const slotSession = c.slotSessions[uidStr];
  const isFreeSpin = !!(slotSession && slotSession.machineId === m.id && slotSession.freeSpins > 0 && slotSession.lockedBet > 0);
  const effectiveBet = isFreeSpin ? slotSession.lockedBet : Math.floor(Number(bet));
  if (isNaN(effectiveBet) || effectiveBet < 1 || effectiveBet > MAX_BET_BRONZE) {
    return res.status(400).json({ allowed: false, error: "Invalid bet amount" });
  }

  const cost = isFreeSpin ? 0 : effectiveBet;
  const bal = Math.floor(Number(bronzeBalance));
  if (cost > 0 && (isNaN(bal) || bal < cost)) {
    return res.status(400).json({ allowed: false, error: "Insufficient bronze coins" });
  }

  // Ensure exclusive lock on this machine
  if (!occ) {
    c.machines[m.id] = { uid: uidStr, name: "Jogador", occupiedAt: Date.now() };
  } else {
    occ.occupiedAt = Date.now();
  }

  const txId = crypto.randomUUID();
  c.pendingSpins[txId] = {
    kind: "slot",
    uid: uidStr,
    machineId: m.id,
    bet: effectiveBet,
    cost,
    isFreeSpin,
    mode: isFreeSpin ? slotSession.mode : null,
    createdAt: Date.now()
  };
  saveDb();

  res.json({
    allowed: true,
    txId,
    bet: effectiveBet,
    cost,
    isFreeSpin,
    freeSpins: isFreeSpin ? slotSession.freeSpins : 0,
    mode: isFreeSpin ? slotSession.mode : null
  });
});

router.post("/slot/spin", (req, res) => {
  const { uid, name, txId } = req.body || {};
  const c = ensureCasinoState();
  const uidStr = String(uid || "");
  const tx = c.pendingSpins[txId];
  if (!uidStr || !tx || tx.kind !== "slot" || tx.uid !== uidStr) {
    return res.status(400).json({ success: false, error: "Invalid or expired spin token" });
  }
  delete c.pendingSpins[txId];

  const m = SLOT_MACHINES.find((x) => x.id === tx.machineId);
  if (!m) return res.status(400).json({ success: false, error: "Unknown machine" });

  // Double-check machine is not occupied by someone else
  if (c.machines[m.id] && c.machines[m.id].uid !== uidStr) {
    return res.status(409).json({ success: false, error: "Machine occupied by another player" });
  }
  if (c.machines[m.id]?.uid === uidStr) {
    c.machines[m.id].occupiedAt = Date.now();
  }

  let session = c.slotSessions[uidStr] || { machineId: m.id, freeSpins: 0, lockedBet: 0, mode: null };
  if (session.machineId !== m.id) {
    session = { machineId: m.id, freeSpins: 0, lockedBet: 0, mode: null };
  }
  if (tx.isFreeSpin) {
    session.freeSpins = Math.max(0, (session.freeSpins || 0) - 1);
  }

  const evalRes = evaluateSlotSpin(m, tx.bet, tx.isFreeSpin ? tx.mode : null);

  if (evalRes.freeSpinsAdded > 0) {
    session.freeSpins = (session.freeSpins || 0) + evalRes.freeSpinsAdded;
    session.lockedBet = tx.bet;
    session.mode = evalRes.freeSpinType || session.mode || "bonus";
  } else if (session.freeSpins <= 0) {
    session = { machineId: m.id, freeSpins: 0, lockedBet: 0, mode: null };
  }
  c.slotSessions[uidStr] = session;

  let payoutId = null;
  if (evalRes.payout > 0) {
    payoutId = crypto.randomUUID();
    c.pendingPayouts[payoutId] = { uid: uidStr, amount: evalRes.payout, at: Date.now() };
    pushWinLog({
      uid: uidStr,
      name: String(name || c.machines[m.id]?.name || "Jogador"),
      game: m.name,
      payout: evalRes.payout
    });
  }
  saveDb();

  res.json({
    success: true,
    machineId: m.id,
    set: m.set,
    bet: tx.bet,
    wasFreeSpin: tx.isFreeSpin,
    win: evalRes.win,
    payout: evalRes.payout,
    payoutId,
    grid: evalRes.grid,
    wildMults: evalRes.wildMults,
    winningLines: evalRes.winningLines,
    freeSpinsAdded: evalRes.freeSpinsAdded,
    freeSpinType: evalRes.freeSpinType,
    bonusCount: evalRes.bonusCount,
    scatterCount: evalRes.scatterCount,
    session
  });
});

// ── Roulette (12 main slices + 4 positive side bonus wheel) ─
router.post("/roulette/validate-spin", (req, res) => {
  const { uid, bet, bronzeBalance } = req.body || {};
  if (!uid) return res.status(400).json({ allowed: false, error: "UID required" });

  const c = ensureCasinoState();
  const uidStr = String(uid);
  const session = c.rouletteSessions[uidStr] || { freeSpins: 0, lockedBet: 0 };
  const isFreeSpin = session.freeSpins > 0 && session.lockedBet > 0;

  // Bet cannot be changed while holding free spins
  const effectiveBet = isFreeSpin ? session.lockedBet : Math.floor(Number(bet));
  if (isNaN(effectiveBet) || effectiveBet < 1 || effectiveBet > MAX_BET_BRONZE) {
    return res.status(400).json({ allowed: false, error: "Invalid bet amount" });
  }

  const cost = isFreeSpin ? 0 : effectiveBet;
  const bal = Math.floor(Number(bronzeBalance));
  if (cost > 0 && (isNaN(bal) || bal < cost)) {
    return res.status(400).json({ allowed: false, error: "Insufficient bronze coins" });
  }

  const txId = crypto.randomUUID();
  c.pendingSpins[txId] = {
    kind: "roulette",
    uid: uidStr,
    bet: effectiveBet,
    cost,
    isFreeSpin,
    createdAt: Date.now()
  };
  saveDb();

  res.json({
    allowed: true,
    txId,
    bet: effectiveBet,
    cost,
    isFreeSpin,
    freeSpins: session.freeSpins,
    lockedBet: session.lockedBet
  });
});

router.post("/roulette/spin", (req, res) => {
  const { uid, name, txId } = req.body || {};
  const c = ensureCasinoState();
  const uidStr = String(uid || "");
  const tx = c.pendingSpins[txId];
  if (!uidStr || !tx || tx.kind !== "roulette" || tx.uid !== uidStr) {
    return res.status(400).json({ success: false, error: "Invalid or expired roulette token" });
  }
  delete c.pendingSpins[txId];

  const session = c.rouletteSessions[uidStr] || { freeSpins: 0, lockedBet: 0 };
  if (tx.isFreeSpin) {
    session.freeSpins = Math.max(0, (session.freeSpins || 0) - 1);
  }

  const mainIndex = crypto.randomInt(MAIN_ROULETTE_SLICES.length);
  const mainSlice = MAIN_ROULETTE_SLICES[mainIndex];
  let bonusSlice = null;
  let superSlice = null;
  let payout = 0;
  let freeSpinsAdded = 0;

  if (mainSlice.type === "loss") {
    payout = 0;
  } else if (mainSlice.type === "win_50pct") {
    payout = Math.round(tx.bet * 1.5);
  } else if (mainSlice.type === "win_2x") {
    payout = tx.bet * 2;
  } else if (mainSlice.type === "free_spin_2") {
    freeSpinsAdded = 2;
  } else if (mainSlice.type === "bonus_wheel") {
    const bonusIndex = crypto.randomInt(BONUS_ROULETTE_SLICES.length);
    bonusSlice = BONUS_ROULETTE_SLICES[bonusIndex];
    if (bonusSlice.type === "refund_1fs") {
      payout = tx.bet;
      freeSpinsAdded = 1;
    } else if (bonusSlice.type === "refund") {
      payout = tx.bet;
    } else if (bonusSlice.type === "free_3fs") {
      freeSpinsAdded = 3;
    } else if (bonusSlice.type === "win_3x") {
      payout = tx.bet * 3;
    }
  } else if (mainSlice.type === "super_bonus_wheel") {
    const superIndex = crypto.randomInt(SUPER_ROULETTE_SLICES.length);
    superSlice = SUPER_ROULETTE_SLICES[superIndex];
    if (superSlice.type === "mult") {
      payout = Math.round(tx.bet * superSlice.value);
    } else if (superSlice.type === "fs") {
      freeSpinsAdded = superSlice.value;
    }
  }

  if (freeSpinsAdded > 0) {
    session.freeSpins = (session.freeSpins || 0) + freeSpinsAdded;
    session.lockedBet = tx.bet;
  } else if ((session.freeSpins || 0) <= 0) {
    session.freeSpins = 0;
    session.lockedBet = 0;
  }

  c.rouletteSessions[uidStr] = session;

  let payoutId = null;
  if (payout > 0) {
    payoutId = crypto.randomUUID();
    c.pendingPayouts[payoutId] = { uid: uidStr, amount: payout, at: Date.now() };
    if (payout >= tx.bet * 2) {
      pushWinLog({
        uid: uidStr,
        name: String(name || "Jogador"),
        game: "Roleta",
        payout
      });
    }
  }
  saveDb();

  res.json({
    success: true,
    bet: tx.bet,
    wasFreeSpin: tx.isFreeSpin,
    mainIndex,
    mainSlice,
    bonusSlice,
    superSlice,
    payout,
    payoutId,
    freeSpinsAdded,
    session
  });
});

// If player exits roulette / leaves casino while holding free spins, they forfeit remaining free spins
router.post("/roulette/forfeit", (req, res) => {
  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: "UID required" });
  const c = ensureCasinoState();
  const uidStr = String(uid);
  const hadFree = c.rouletteSessions[uidStr]?.freeSpins || 0;
  c.rouletteSessions[uidStr] = { freeSpins: 0, lockedBet: 0 };
  saveDb();
  res.json({ success: true, forfeited: hadFree });
});

// Shared payout confirm / rollback for slots & roulette
router.post("/payout-confirm", (req, res) => {
  const { uid, payoutId } = req.body || {};
  const c = ensureCasinoState();
  if (payoutId && c.pendingPayouts[payoutId]?.uid === String(uid)) {
    delete c.pendingPayouts[payoutId];
    saveDb();
  }
  res.json({ success: true });
});

router.post("/payout-rollback", (req, res) => {
  const { uid, payoutId } = req.body || {};
  const c = ensureCasinoState();
  if (payoutId && c.pendingPayouts[payoutId]?.uid === String(uid)) {
    delete c.pendingPayouts[payoutId];
    saveDb();
  }
  res.json({ success: true });
});

export default router;
