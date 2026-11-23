import { Router } from "express";
import crypto from "crypto";
import { dbState, saveDb } from "../db.js";

const router = Router();

const LAND_MODES = ["farm", "animals", "bulkShop", "luckShop"];
const COINS = ["bronze", "silver", "gold"];
const MAX_ANIMALS_PER_LAND = 6;
const MAX_LISTING_PRICE = 1_000_000;
const MODE_CHANGE_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours in UTC ms

const ANIMAL_TYPES = {
  chicken: { costBronze: 250, yieldItem: "crop_corn", yieldQty: 2, cooldownMs: 60_000 },
  goat:    { costBronze: 600, yieldItem: "crop_beans", yieldQty: 3, cooldownMs: 90_000 },
  cow:     { costBronze: 1500, yieldItem: "crop_banana", yieldQty: 4, cooldownMs: 120_000 }
};

function getLandOp(landId, fallbackOwner = null, fallbackName = null) {
  let op = dbState.landOperations[landId];
  if (!op) {
    op = {
      owner: fallbackOwner,
      ownerName: fallbackName,
      mode: "farm",
      modeChangedAt: null,
      animals: {},
      stock: {},
      luckPrice: 5,
      luckCurrency: "bronze",
      pendingEarnings: { bronze: 0, silver: 0, gold: 0 }
    };
    dbState.landOperations[landId] = op;
    saveDb();
  } else {
    if (op.modeChangedAt === undefined) op.modeChangedAt = null;
    if (fallbackOwner && !op.owner) { op.owner = fallbackOwner; saveDb(); }
    if (fallbackName && !op.ownerName) { op.ownerName = fallbackName; saveDb(); }
  }
  return op;
}

router.get("/state", (req, res) => {
  res.json({
    landOperations: dbState.landOperations,
    serverNow: Date.now(),
    modeCooldownMs: MODE_CHANGE_COOLDOWN_MS
  });
});

router.post("/sync-owner", (req, res) => {
  const { landId, owner, ownerName } = req.body || {};
  if (!landId || !owner) return res.status(400).json({ error: "Missing landId or owner" });
  const op = getLandOp(String(landId), String(owner), String(ownerName || "Player"));
  res.json({
    success: true,
    land: op,
    serverNow: Date.now(),
    modeCooldownMs: MODE_CHANGE_COOLDOWN_MS
  });
});

router.post("/mode", (req, res) => {
  const { landId, uid, ownerName, mode } = req.body || {};
  if (!landId || !uid || !LAND_MODES.includes(mode)) {
    return res.status(400).json({ allowed: false, error: "Invalid land mode" });
  }
  const op = getLandOp(String(landId), String(uid), ownerName);
  if (op.owner !== uid) return res.status(403).json({ allowed: false, error: "Not land owner" });

  const nowMs = Date.now();
  if (op.mode === mode) {
    return res.json({
      allowed: true,
      unchanged: true,
      land: op,
      serverNow: nowMs,
      modeCooldownMs: MODE_CHANGE_COOLDOWN_MS
    });
  }

  const lastChangedAt = Number(op.modeChangedAt) || 0;
  if (lastChangedAt > 0 && nowMs - lastChangedAt < MODE_CHANGE_COOLDOWN_MS) {
    const nextAllowedAt = lastChangedAt + MODE_CHANGE_COOLDOWN_MS;
    const remainingMs = nextAllowedAt - nowMs;
    return res.status(429).json({
      allowed: false,
      error: "Mode change cooldown",
      remainingMs,
      nextAllowedAt,
      serverNow: nowMs,
      modeCooldownMs: MODE_CHANGE_COOLDOWN_MS,
      land: op
    });
  }

  op.mode = mode;
  op.modeChangedAt = nowMs;
  saveDb();
  res.json({
    allowed: true,
    land: op,
    nextAllowedAt: nowMs + MODE_CHANGE_COOLDOWN_MS,
    serverNow: nowMs,
    modeCooldownMs: MODE_CHANGE_COOLDOWN_MS
  });
});

router.post("/animal/validate-buy", (req, res) => {
  const { landId, uid, ownerName, type, bronzeBalance } = req.body || {};
  const cfg = ANIMAL_TYPES[type];
  if (!landId || !uid || !cfg) return res.status(400).json({ allowed: false, error: "Invalid animal" });
  const op = getLandOp(String(landId), String(uid), ownerName);
  if (op.owner !== uid) return res.status(403).json({ allowed: false, error: "Not land owner" });
  if (Object.keys(op.animals || {}).length >= MAX_ANIMALS_PER_LAND) {
    return res.status(400).json({ allowed: false, error: "Max animals reached" });
  }
  if (Number(bronzeBalance) < cfg.costBronze) {
    return res.status(400).json({ allowed: false, error: "Insufficient bronze coins" });
  }
  res.json({ allowed: true, costBronze: cfg.costBronze });
});

router.post("/animal/buy", (req, res) => {
  const { landId, uid, ownerName, type } = req.body || {};
  const cfg = ANIMAL_TYPES[type];
  if (!landId || !uid || !cfg) return res.status(400).json({ error: "Invalid animal" });
  const op = getLandOp(String(landId), String(uid), ownerName);
  if (op.owner !== uid) return res.status(403).json({ error: "Not land owner" });
  if (Object.keys(op.animals || {}).length >= MAX_ANIMALS_PER_LAND) {
    return res.status(400).json({ error: "Max animals reached" });
  }
  const key = crypto.randomUUID().slice(0, 8);
  op.animals[key] = { type, lastAt: Date.now() };
  saveDb();
  res.json({ success: true, animalKey: key, land: op });
});

router.post("/animal/collect", (req, res) => {
  const { landId, uid, animalKey } = req.body || {};
  const op = landId && dbState.landOperations[String(landId)];
  if (!op || op.owner !== uid) return res.status(403).json({ allowed: false, error: "Not land owner" });
  const animal = op.animals?.[animalKey];
  const cfg = animal && ANIMAL_TYPES[animal.type];
  if (!cfg) return res.status(404).json({ allowed: false, error: "Animal not found" });

  const elapsed = Date.now() - (animal.lastAt || 0);
  if (elapsed < cfg.cooldownMs) {
    return res.status(400).json({ allowed: false, error: "Not ready yet", leftMs: cfg.cooldownMs - elapsed });
  }

  animal.lastAt = Date.now();
  saveDb();
  res.json({ allowed: true, yieldItem: cfg.yieldItem, yieldQty: cfg.yieldQty, land: op });
});

router.post("/shop/stock", (req, res) => {
  const { landId, uid, ownerName, item, qty, price, currency } = req.body || {};
  const q = Math.floor(Number(qty));
  const p = Math.floor(Number(price));
  if (!landId || !uid || !item || !COINS.includes(currency) || !(q >= 1) || !(p >= 1 && p <= MAX_LISTING_PRICE)) {
    return res.status(400).json({ allowed: false, error: "Invalid stock request" });
  }
  const op = getLandOp(String(landId), String(uid), ownerName);
  if (op.owner !== uid) return res.status(403).json({ allowed: false, error: "Not land owner" });

  const key = crypto.randomUUID().slice(0, 8);
  op.stock[key] = { item: String(item), qty: q, price: p, currency };
  saveDb();
  res.json({ allowed: true, stockKey: key, land: op });
});

router.post("/shop/unstock", (req, res) => {
  const { landId, uid, stockKey } = req.body || {};
  const op = landId && dbState.landOperations[String(landId)];
  if (!op || op.owner !== uid) return res.status(403).json({ allowed: false, error: "Not land owner" });
  const entry = op.stock?.[stockKey];
  if (!entry) return res.status(404).json({ allowed: false, error: "Stock item not found" });
  delete op.stock[stockKey];
  saveDb();
  res.json({ allowed: true, item: entry.item, qty: entry.qty, land: op });
});

router.post("/shop/luck-config", (req, res) => {
  const { landId, uid, price, currency } = req.body || {};
  const p = Math.floor(Number(price));
  const op = landId && dbState.landOperations[String(landId)];
  if (!op || op.owner !== uid) return res.status(403).json({ allowed: false, error: "Not land owner" });
  if (!COINS.includes(currency) || !(p >= 1 && p <= MAX_LISTING_PRICE)) {
    return res.status(400).json({ allowed: false, error: "Invalid price" });
  }
  op.luckPrice = p;
  op.luckCurrency = currency;
  saveDb();
  res.json({ allowed: true, land: op });
});

router.post("/shop/buy-bulk", (req, res) => {
  const { landId, buyerUid, stockKey, buyerBalance } = req.body || {};
  const op = landId && dbState.landOperations[String(landId)];
  if (!op) return res.status(404).json({ allowed: false, error: "Shop not found" });
  if (op.owner === buyerUid) return res.status(400).json({ allowed: false, error: "Cannot buy from own shop" });
  const entry = op.stock?.[stockKey];
  if (!entry || entry.qty < 1) return res.status(404).json({ allowed: false, error: "Out of stock" });
  if (Number(buyerBalance) < entry.price) {
    return res.status(400).json({ allowed: false, error: "Insufficient coins" });
  }

  delete op.stock[stockKey];
  op.pendingEarnings = op.pendingEarnings || { bronze: 0, silver: 0, gold: 0 };
  op.pendingEarnings[entry.currency] = (op.pendingEarnings[entry.currency] || 0) + entry.price;
  saveDb();

  res.json({
    allowed: true,
    item: entry.item,
    qty: entry.qty,
    price: entry.price,
    currency: entry.currency,
    land: op
  });
});

router.post("/shop/spin-luck", (req, res) => {
  const { landId, buyerUid, buyerBalance } = req.body || {};
  const op = landId && dbState.landOperations[String(landId)];
  if (!op) return res.status(404).json({ allowed: false, error: "Shop not found" });
  if (op.owner === buyerUid) return res.status(400).json({ allowed: false, error: "Cannot spin own luck shop" });

  const price = Math.max(1, Number(op.luckPrice) || 5);
  const currency = COINS.includes(op.luckCurrency) ? op.luckCurrency : "bronze";
  if (Number(buyerBalance) < price) {
    return res.status(400).json({ allowed: false, error: "Insufficient coins" });
  }

  const entries = Object.entries(op.stock || {}).filter(([, s]) => s && s.qty > 0);
  if (entries.length === 0) return res.status(400).json({ allowed: false, error: "Out of stock" });

  const [winKey, winEntry] = entries[Math.floor(Math.random() * entries.length)];
  delete op.stock[winKey];
  op.pendingEarnings = op.pendingEarnings || { bronze: 0, silver: 0, gold: 0 };
  op.pendingEarnings[currency] = (op.pendingEarnings[currency] || 0) + price;
  saveDb();

  res.json({
    allowed: true,
    item: winEntry.item,
    qty: winEntry.qty,
    price,
    currency,
    land: op
  });
});

router.post("/shop/claim-earnings", (req, res) => {
  const { landId, uid } = req.body || {};
  const op = landId && dbState.landOperations[String(landId)];
  if (!op || op.owner !== uid) return res.status(403).json({ allowed: false, error: "Not land owner" });
  const earned = {
    bronze: op.pendingEarnings?.bronze || 0,
    silver: op.pendingEarnings?.silver || 0,
    gold: op.pendingEarnings?.gold || 0
  };
  if (earned.bronze <= 0 && earned.silver <= 0 && earned.gold <= 0) {
    return res.json({ allowed: false, earned });
  }
  op.pendingEarnings = { bronze: 0, silver: 0, gold: 0 };
  saveDb();
  res.json({ allowed: true, earned, land: op });
});

export default router;
