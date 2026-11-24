import { Router } from "express";
import crypto from "crypto";
import { dbState, saveDb } from "../db.js";
import { recordDailyPoints } from "../dailyPool.js";

const router = Router();

const CROPS = {
  corn:      { seedCost: 5,  sell: 4  },
  beans:     { seedCost: 8,  sell: 7  },
  peanut:    { seedCost: 12, sell: 6  },
  cassava:   { seedCost: 20, sell: 12 },
  banana:    { seedCost: 35, sell: 15 },
  pineapple: { seedCost: 60, sell: 28 }
};

const EXCHANGES = [
  { from: "bronze", to: "silver", cost: 150, gain: 1 },
  { from: "silver", to: "bronze", cost: 1,   gain: 120 },
  { from: "silver", to: "gold",   cost: 115, gain: 1 },
  { from: "gold",   to: "silver", cost: 1,   gain: 95 }
];

const FREE_SEED_STAY_MS = 5000;

// Validate whether buying seeds is permitted
router.post("/validate-buy-seeds", (req, res) => {
  const { uid, cropId, qty, bronzeBalance } = req.body || {};
  const c = CROPS[cropId];
  const n = Math.floor(Number(qty));
  const bal = Math.floor(Number(bronzeBalance));
  if (!uid || !c || isNaN(n) || n < 1 || n > 1000) {
    return res.status(400).json({ allowed: false, error: "Invalid seed purchase parameters" });
  }
  const cost = c.seedCost * n;
  if (isNaN(bal) || bal < cost) {
    return res.status(400).json({ allowed: false, error: "Insufficient bronze coins" });
  }
  res.json({ allowed: true, cost, qty: n, cropId });
});

// Validate whether selling crops is permitted and issue a confirmation token
router.post("/validate-sell-crops", (req, res) => {
  const { uid, cropId, qty, ownedQty } = req.body || {};
  const c = CROPS[cropId];
  const n = Math.floor(Number(qty));
  const owned = Math.floor(Number(ownedQty));
  if (!uid || !c || isNaN(n) || n < 1 || isNaN(owned) || owned < n) {
    return res.status(400).json({ allowed: false, error: "Invalid crop sale" });
  }
  const gain = c.sell * n;
  if (!dbState.dailyPool) dbState.dailyPool = { days: {}, pendingSellTx: {} };
  if (!dbState.dailyPool.pendingSellTx) dbState.dailyPool.pendingSellTx = {};

  const txId = crypto.randomUUID();
  dbState.dailyPool.pendingSellTx[txId] = {
    uid: String(uid),
    cropId,
    qty: n,
    gain,
    createdAt: Date.now()
  };

  // Prune expired sell tokens (>5 min)
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, tx] of Object.entries(dbState.dailyPool.pendingSellTx)) {
    if (tx.createdAt < cutoff) delete dbState.dailyPool.pendingSellTx[id];
  }
  saveDb();

  res.json({ allowed: true, txId, gain, qty: n, cropId });
});

// Record daily accumulated PP after crop sale commits in Firebase
router.post("/confirm-sell-crops", (req, res) => {
  const { uid, name, txId } = req.body || {};
  if (!uid || !txId) {
    return res.status(400).json({ success: false, error: "UID and txId required" });
  }
  const pending = dbState.dailyPool?.pendingSellTx || {};
  const tx = pending[txId];
  if (!tx || tx.uid !== String(uid)) {
    return res.status(400).json({ success: false, error: "Invalid or expired sell token" });
  }
  delete pending[txId];
  const updated = recordDailyPoints(String(uid), name, tx.gain);
  res.json({ success: true, gain: tx.gain, dailyPoints: updated?.points || tx.gain });
});

// Validate coin exchange
router.post("/validate-exchange", (req, res) => {
  const { uid, from, to, balance } = req.body || {};
  const rule = EXCHANGES.find((x) => x.from === from && x.to === to);
  const bal = Math.floor(Number(balance));
  if (!uid || !rule || isNaN(bal) || bal < rule.cost) {
    return res.status(400).json({ allowed: false, error: "Exchange not possible" });
  }
  res.json({ allowed: true, cost: rule.cost, gain: rule.gain });
});

// Server-verified 5-second link stay for free seeds
router.post("/free-seed/start", (req, res) => {
  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: "UID required" });
  const key = String(uid);
  const prev = dbState.freeSeedVisits[key] || {};
  dbState.freeSeedVisits[key] = {
    startedAt: Date.now(),
    claimedCount: prev.claimedCount || 0
  };
  saveDb();
  res.json({ success: true, startedAt: dbState.freeSeedVisits[key].startedAt });
});

router.post("/free-seed/claim", (req, res) => {
  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ allowed: false, error: "UID required" });
  const key = String(uid);
  const visit = dbState.freeSeedVisits[key];
  if (!visit || !visit.startedAt) {
    return res.status(400).json({ allowed: false, error: "No active visit", elapsedMs: 0 });
  }
  const elapsedMs = Date.now() - visit.startedAt;
  visit.startedAt = 0;

  if (elapsedMs < FREE_SEED_STAY_MS) {
    saveDb();
    return res.json({
      allowed: false,
      elapsedMs,
      requiredMs: FREE_SEED_STAY_MS
    });
  }

  visit.claimedCount = (visit.claimedCount || 0) + 1;
  visit.lastClaimedAt = Date.now();
  saveDb();
  res.json({
    allowed: true,
    elapsedMs,
    cropId: "corn",
    qty: 3
  });
});

const AD_EXEMPTION_COST_GOLD = 30;
const AD_EXEMPTION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (1 month)

// Validate and process ad exemption purchase (30 gold coins for 1 month)
router.post("/ad-exemption/buy", (req, res) => {
  const { uid, goldBalance } = req.body || {};
  if (!uid) return res.status(400).json({ allowed: false, error: "UID required" });
  const bal = Math.floor(Number(goldBalance));
  if (isNaN(bal) || bal < AD_EXEMPTION_COST_GOLD) {
    return res.status(400).json({ allowed: false, error: "Insufficient gold coins", cost: AD_EXEMPTION_COST_GOLD });
  }

  if (!dbState.adExemptions) dbState.adExemptions = {};
  const current = dbState.adExemptions[uid] || {};
  const prevExemptUntil = Number(current.exemptUntil) || 0;
  const now = Date.now();
  const baseTime = (prevExemptUntil > now) ? prevExemptUntil : now;
  const newExemptUntil = baseTime + AD_EXEMPTION_DURATION_MS;

  dbState.adExemptions[uid] = {
    uid: String(uid),
    exemptUntil: newExemptUntil,
    updatedAt: now
  };
  saveDb();

  res.json({
    allowed: true,
    costGold: AD_EXEMPTION_COST_GOLD,
    prevExemptUntil,
    exemptUntil: newExemptUntil,
    durationMs: AD_EXEMPTION_DURATION_MS
  });
});

router.post("/ad-exemption/rollback", (req, res) => {
  const { uid, prevExemptUntil } = req.body || {};
  if (!uid) return res.status(400).json({ error: "UID required" });
  if (!dbState.adExemptions) dbState.adExemptions = {};
  const prev = Number(prevExemptUntil) || 0;
  if (prev > 0) {
    dbState.adExemptions[uid] = {
      uid: String(uid),
      exemptUntil: prev,
      updatedAt: Date.now()
    };
  } else {
    delete dbState.adExemptions[uid];
  }
  saveDb();
  res.json({ success: true, exemptUntil: prev });
});

router.get("/ad-exemption/status/:uid", (req, res) => {
  const uid = String(req.params.uid || "");
  const entry = dbState.adExemptions?.[uid];
  const now = Date.now();
  const exemptUntil = entry?.exemptUntil || 0;
  res.json({
    isExempt: exemptUntil > now,
    exemptUntil,
    remainingMs: Math.max(0, exemptUntil - now)
  });
});

router.post("/ad-exemption/sync", (req, res) => {
  const { uid, exemptUntil } = req.body || {};
  if (!uid) return res.status(400).json({ error: "UID required" });
  const clientUntil = Number(exemptUntil) || 0;
  if (!dbState.adExemptions) dbState.adExemptions = {};
  const current = dbState.adExemptions[uid]?.exemptUntil || 0;

  const bestUntil = Math.max(current, clientUntil);
  if (bestUntil > current) {
    dbState.adExemptions[uid] = {
      uid: String(uid),
      exemptUntil: bestUntil,
      updatedAt: Date.now()
    };
    saveDb();
  }
  const now = Date.now();
  res.json({
    isExempt: bestUntil > now,
    exemptUntil: bestUntil,
    remainingMs: Math.max(0, bestUntil - now)
  });
});

export default router;
