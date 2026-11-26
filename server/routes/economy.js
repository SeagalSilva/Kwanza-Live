import { Router } from "express";
import crypto from "crypto";
import { dbState, saveDb, isAdminEmail, MIN_SEED_PACK, normalizeMarketConfig } from "../db.js";
import { recordDailyPoints } from "../services/dailyPool.js";

const router = Router();

function ensureMarketConfig() {
  dbState.marketConfig = normalizeMarketConfig(dbState.marketConfig);
  return dbState.marketConfig;
}

const EXCHANGES = [
  { from: "bronze", to: "silver", cost: 150, gain: 1 },
  { from: "silver", to: "bronze", cost: 1,   gain: 120 },
  { from: "silver", to: "gold",   cost: 115, gain: 1 },
  { from: "gold",   to: "silver", cost: 1,   gain: 95 }
];

const FREE_SEED_STAY_MS = 5000;

router.get("/market-config", (req, res) => {
  res.json({
    success: true,
    minPackSize: MIN_SEED_PACK,
    crops: ensureMarketConfig()
  });
});

router.post("/admin/update-market", (req, res) => {
  const { adminEmail, crops } = req.body || {};
  if (!isAdminEmail(adminEmail)) {
    return res.status(403).json({ success: false, error: "Unauthorized admin" });
  }
  if (!crops || typeof crops !== "object") {
    return res.status(400).json({ success: false, error: "Invalid crops payload" });
  }

  const current = ensureMarketConfig();
  for (const [id, cur] of Object.entries(current)) {
    const incoming = crops[id];
    if (!incoming || typeof incoming !== "object") continue;

    if (incoming.packPrice !== undefined) {
      const p = Math.floor(Number(incoming.packPrice));
      if (!Number.isFinite(p) || p < 1 || p > 10_000_000) {
        return res.status(400).json({ success: false, error: `Invalid packPrice for ${id}` });
      }
      cur.packPrice = p;
    }
    if (incoming.packSize !== undefined) {
      const ps = Math.floor(Number(incoming.packSize));
      if (!Number.isFinite(ps) || ps < MIN_SEED_PACK || ps > 1000) {
        return res.status(400).json({ success: false, error: `packSize must be at least ${MIN_SEED_PACK}` });
      }
      cur.packSize = ps;
    }
    if (incoming.yield !== undefined) {
      const y = Math.floor(Number(incoming.yield));
      if (!Number.isFinite(y) || y < 1 || y > 1000) {
        return res.status(400).json({ success: false, error: `Invalid yield for ${id}` });
      }
      cur.yield = y;
    }
    if (incoming.sell !== undefined) {
      const s = Math.floor(Number(incoming.sell));
      if (!Number.isFinite(s) || s < 1 || s > 1_000_000) {
        return res.status(400).json({ success: false, error: `Invalid sell PP for ${id}` });
      }
      cur.sell = s;
    }
  }

  dbState.marketConfig = normalizeMarketConfig(current);
  saveDb();
  res.json({
    success: true,
    minPackSize: MIN_SEED_PACK,
    crops: dbState.marketConfig
  });
});

// Validate whether buying seed packs is permitted (minimum 5 seeds per pack)
router.post("/validate-buy-seeds", (req, res) => {
  const { uid, cropId, packs, qty, bronzeBalance } = req.body || {};
  const cfg = ensureMarketConfig();
  const c = cfg[cropId];
  const bal = Math.floor(Number(bronzeBalance));
  if (!uid || !c || isNaN(bal)) {
    return res.status(400).json({ allowed: false, error: "Invalid seed purchase parameters" });
  }

  const packSize = Math.max(MIN_SEED_PACK, Math.floor(Number(c.packSize) || MIN_SEED_PACK));
  let packCount = 0;

  if (packs !== undefined) {
    packCount = Math.floor(Number(packs));
  } else if (qty !== undefined) {
    const n = Math.floor(Number(qty));
    if (!Number.isFinite(n) || n < packSize || n % packSize !== 0) {
      return res.status(400).json({
        allowed: false,
        error: `Minimum seed pack is ${packSize} seeds`
      });
    }
    packCount = n / packSize;
  }

  if (!Number.isFinite(packCount) || packCount < 1 || packCount > 200) {
    return res.status(400).json({ allowed: false, error: "Invalid pack quantity" });
  }

  const totalSeeds = packCount * packSize;
  const cost = packCount * c.packPrice;
  if (totalSeeds < MIN_SEED_PACK) {
    return res.status(400).json({ allowed: false, error: `Minimum ${MIN_SEED_PACK} seeds required` });
  }
  if (bal < cost) {
    return res.status(400).json({ allowed: false, error: "Insufficient bronze coins" });
  }

  res.json({
    allowed: true,
    cost,
    qty: totalSeeds,
    packs: packCount,
    packSize,
    packPrice: c.packPrice,
    cropId
  });
});

const RESOURCE_SELL_PP = {
  ore_coal: 3,
  ore_copper: 5,
  ore_iron: 9,
  ore_silver: 16,
  ore_gold: 28,
  ore_diamond: 55,
  wood_pine: 3,
  wood_oak: 6,
  wood_mahogany: 14,
  wood_elder: 30
};

// Validate whether selling crops or gathered resources (ores/wood) for Pool Points is permitted and issue a confirmation token
router.post("/validate-sell-crops", (req, res) => {
  const { uid, cropId, itemId, qty, ownedQty } = req.body || {};
  const cfg = ensureMarketConfig();
  const c = cropId ? cfg[cropId] : null;
  const resSell = itemId ? RESOURCE_SELL_PP[itemId] : null;
  const unitSell = c ? c.sell : resSell;

  const n = Math.floor(Number(qty));
  const owned = Math.floor(Number(ownedQty));
  if (!uid || !unitSell || isNaN(n) || n < 1 || isNaN(owned) || owned < n) {
    return res.status(400).json({ allowed: false, error: "Invalid item sale" });
  }
  const gain = unitSell * n;
  if (!dbState.dailyPool) dbState.dailyPool = { days: {}, pendingSellTx: {} };
  if (!dbState.dailyPool.pendingSellTx) dbState.dailyPool.pendingSellTx = {};

  const txId = crypto.randomUUID();
  dbState.dailyPool.pendingSellTx[txId] = {
    uid: String(uid),
    cropId: cropId || null,
    itemId: itemId || (cropId ? `crop_${cropId}` : null),
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

  res.json({ allowed: true, txId, gain, qty: n, cropId: cropId || null, itemId: itemId || null });
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
