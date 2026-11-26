import { Router } from "express";
import { dbState, saveDb } from "../db.js";
import { verifyAdsLabToken } from "./captcha.js";

const router = Router();

function ensureRestaurantState() {
  if (!dbState.restaurant) {
    dbState.restaurant = {
      playerBreadClaims: {}, // uid -> count (max 10)
      playerStock: {} // foodId -> [listings]
    };
  }
  if (!dbState.restaurant.playerBreadClaims) dbState.restaurant.playerBreadClaims = {};
  if (!dbState.restaurant.playerStock) dbState.restaurant.playerStock = {};
}

router.get("/state/:uid", (req, res) => {
  ensureRestaurantState();
  const uid = String(req.params.uid || "");
  const claims = dbState.restaurant.playerBreadClaims[uid] || 0;
  const systemBreadRemaining = Math.max(0, 10 - claims);

  res.json({
    success: true,
    systemBreadRemaining,
    systemBreadCost: 15,
    systemBreadEnergy: 25,
    playerStock: dbState.restaurant.playerStock
  });
});

router.post("/deposit", async (req, res) => {
  ensureRestaurantState();
  const { uid, name, captchaToken, foodId, qty, price } = req.body || {};
  if (!uid || !foodId || !qty || qty <= 0) {
    return res.status(400).json({ success: false, error: "Parâmetros de depósito inválidos" });
  }

  const captchaCheck = await verifyAdsLabToken(captchaToken);
  if (!captchaCheck.valid) {
    return res.status(403).json({ success: false, error: captchaCheck.error || "Captcha não resolvido" });
  }

  const listingId = `listing_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  if (!dbState.restaurant.playerStock[foodId]) {
    dbState.restaurant.playerStock[foodId] = [];
  }

  dbState.restaurant.playerStock[foodId].push({
    id: listingId,
    foodId,
    qty: Number(qty),
    price: Math.max(1, Number(price) || 12),
    sellerUid: String(uid),
    sellerName: name || "Jogador",
    createdAt: Date.now()
  });

  saveDb();
  res.json({ success: true, listingId, playerStock: dbState.restaurant.playerStock });
});

router.post("/buy", async (req, res) => {
  ensureRestaurantState();
  const { uid, name, captchaToken, type, listingId, foodId } = req.body || {};
  if (!uid) return res.status(400).json({ success: false, error: "UID necessário" });

  const captchaCheck = await verifyAdsLabToken(captchaToken);
  if (!captchaCheck.valid) {
    return res.status(403).json({ success: false, error: captchaCheck.error || "Captcha não resolvido" });
  }

  if (type === "system_bread") {
    const claims = dbState.restaurant.playerBreadClaims[uid] || 0;
    if (claims >= 10) {
      return res.status(400).json({ success: false, error: "Esgotou o limite de 10 pães de reposição do sistema!" });
    }
    dbState.restaurant.playerBreadClaims[uid] = claims + 1;
    saveDb();
    return res.json({
      success: true,
      energyGain: 25,
      cost: 15,
      remainingSystemBreads: 9 - claims
    });
  } else if (type === "player_food") {
    const listArr = dbState.restaurant.playerStock[foodId];
    if (!Array.isArray(listArr)) {
      return res.status(404).json({ success: false, error: "Estoque de alimento não encontrado" });
    }
    const idx = listArr.findIndex((item) => item.id === listingId);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: "Anúncio de alimento não encontrado" });
    }
    const listing = listArr[idx];
    listing.qty -= 1;
    const totalCost = listing.price;
    const sellerUid = listing.sellerUid;

    if (listing.qty <= 0) {
      listArr.splice(idx, 1);
    }
    saveDb();

    return res.json({
      success: true,
      energyGain: 35,
      cost: totalCost,
      sellerUid,
      sellerEarnings: totalCost
    });
  }

  return res.status(400).json({ success: false, error: "Tipo de compra desconhecido" });
});

export default router;
