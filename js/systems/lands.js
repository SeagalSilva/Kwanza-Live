// Buying and operating private lands with server-persisted & validated state:
// - Standard Farming (crops inside fence)
// - Animal Husbandry (chickens, goats, cows producing harvests)
// - Bulk Store (owner stocks items & buyers purchase directly; owner claims earnings)
// - Luck Store (owner stocks mystery prize pool & buyers roll for random stocked item)
import { S, inv, bal } from "../state.js";
import { emit } from "../bus.js";
import { serverTimestamp, increment } from "../firebase.js";
import { LAND_META } from "../world/map.js";
import { MAX_LANDS_PER_PLAYER, MAX_LISTING_PRICE } from "../config.js";
import { LAND_PRICE_BRONZE_EQUIV } from "../data/lands.js";
import { COINS } from "../data/currencies.js";
import { parseItem } from "../data/items.js";
import { t } from "../i18n.js";
import { toast } from "../ui/toast.js";
import { commit, savePath } from "./db.js";
import { playHarvest } from "./audio.js";

export const ANIMAL_TYPES = {
  chicken: { emoji: "🐔", costBronze: 250, yieldItem: "crop_corn", yieldQty: 2, cooldownMs: 60_000 },
  goat:    { emoji: "🐐", costBronze: 600, yieldItem: "crop_beans", yieldQty: 3, cooldownMs: 90_000 },
  cow:     { emoji: "🐄", costBronze: 1500, yieldItem: "crop_banana", yieldQty: 4, cooldownMs: 120_000 }
};

export const LAND_MODES = ["farm", "animals", "bulkShop", "luckShop"];
export const MAX_ANIMALS_PER_LAND = 6;
export const LAND_MODE_COOLDOWN_MS = 6 * 60 * 60 * 1000;

let lastLandOpsHash = "";

export function formatUtcDateTime(ms) {
  const d = new Date(ms);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${min}:${ss} UTC`;
}

export function formatCooldownDuration(ms) {
  if (ms <= 0) return "0s";
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m > 0) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

function recordServerNow(data) {
  if (data && typeof data.serverNow === "number") {
    S._landsServerOffset = data.serverNow - Date.now();
  }
}

export function getLandServerNow() {
  return Date.now() + (S._landsServerOffset || 0);
}

export function getLandModeCooldown(op) {
  const serverNow = getLandServerNow();
  const changedAt = Number(op?.modeChangedAt) || 0;
  if (!changedAt) {
    return { locked: false, remainingMs: 0, nextAllowedAt: null, serverNow };
  }
  const nextAllowedAt = changedAt + LAND_MODE_COOLDOWN_MS;
  const remainingMs = Math.max(0, nextAllowedAt - serverNow);
  return { locked: remainingMs > 0, remainingMs, nextAllowedAt, serverNow };
}

export const ownedLandsCount = () => Object.values(S.lands).filter((l) => l.owner === S.uid).length;

const SILVER_IN_BRONZE = 150;
const GOLD_IN_BRONZE = 115 * SILVER_IN_BRONZE; // 17,250

export const totalCoinsInBronze = () =>
  (bal("gold") || 0) * GOLD_IN_BRONZE + (bal("silver") || 0) * SILVER_IN_BRONZE + (bal("bronze") || 0);

export function computeLandCoinDeductions(neededBronze = LAND_PRICE_BRONZE_EQUIV) {
  let needed = neededBronze;
  const g = bal("gold") || 0;
  const s = bal("silver") || 0;
  const b = bal("bronze") || 0;

  let takeGold = Math.min(g, Math.floor(needed / GOLD_IN_BRONZE));
  needed -= takeGold * GOLD_IN_BRONZE;

  let takeSilver = Math.min(s, Math.floor(needed / SILVER_IN_BRONZE));
  needed -= takeSilver * SILVER_IN_BRONZE;

  let takeBronze = Math.min(b, needed);
  needed -= takeBronze;

  if (needed > 0) {
    if (s > takeSilver) {
      takeSilver += 1;
      const refundBronze = SILVER_IN_BRONZE - needed;
      takeBronze -= refundBronze;
    } else if (g > takeGold) {
      takeGold += 1;
      const refundBronze = GOLD_IN_BRONZE - needed;
      takeBronze -= refundBronze;
    }
  }

  return { takeGold, takeSilver, takeBronze };
}

export async function syncLandsFromServer() {
  try {
    const res = await fetch("/api/lands/state");
    if (!res.ok) return;
    const data = await res.json();
    recordServerNow(data);
    if (data && data.landOperations) {
      const nextHash = JSON.stringify(data.landOperations);
      if (nextHash !== lastLandOpsHash) {
        lastLandOpsHash = nextHash;
        S.landOps = data.landOperations;
        emit("lands");
      }
    }
  } catch (_) {}
}

function updateLocalLandOp(landId, op) {
  if (!op) return;
  S.landOps[landId] = op;
  lastLandOpsHash = JSON.stringify(S.landOps);
  emit("lands");
}

export async function ensureLandOpSynced(id) {
  const land = S.lands[id];
  if (!land) return null;
  try {
    const res = await fetch("/api/lands/sync-owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landId: id, owner: land.owner, ownerName: land.ownerName })
    });
    if (res.ok) {
      const data = await res.json();
      recordServerNow(data);
      updateLocalLandOp(id, data.land);
      return data.land;
    }
  } catch (_) {}
  return S.landOps[id] || null;
}

export async function buyLand(id) {
  const meta = LAND_META.find((l) => l.id === id);
  if (!meta) return false;
  if (S.lands[id]) { toast(t("msg.landTaken"), "bad"); return false; }
  if (ownedLandsCount() >= MAX_LANDS_PER_PLAYER) { toast(t("msg.maxLands", { n: MAX_LANDS_PER_PLAYER }), "bad"); return false; }

  if (totalCoinsInBronze() < LAND_PRICE_BRONZE_EQUIV) {
    toast(t("msg.notEnoughCoinsLand"), "bad");
    return false;
  }

  const { takeGold, takeSilver, takeBronze } = computeLandCoinDeductions(LAND_PRICE_BRONZE_EQUIV);

  const updates = {
    [`world/lands/${id}`]: { owner: S.uid, ownerName: S.profile.username, mode: "farm", at: serverTimestamp() }
  };
  if (takeGold !== 0) updates[savePath(S.uid, "wallet/gold")] = increment(-takeGold);
  if (takeSilver !== 0) updates[savePath(S.uid, "wallet/silver")] = increment(-takeSilver);
  if (takeBronze !== 0) updates[savePath(S.uid, "wallet/bronze")] = increment(-takeBronze);

  const ok = await commit(updates, "msg.landTaken");
  if (ok) {
    await fetch("/api/lands/sync-owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landId: id, owner: S.uid, ownerName: S.profile.username })
    }).then((r) => r.json()).then((d) => {
      recordServerNow(d);
      updateLocalLandOp(id, d.land);
    }).catch(() => {});
    toast(t("msg.landBought", { id }), "good");
  }
  return ok;
}

export async function setLandMode(id, mode) {
  const land = S.lands[id];
  if (!land || land.owner !== S.uid || !LAND_MODES.includes(mode)) return false;
  if ((S.landOps[id]?.mode || "farm") === mode) return true;

  try {
    const res = await fetch("/api/lands/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landId: id, uid: S.uid, ownerName: S.profile?.username, mode })
    });
    const data = await res.json();
    recordServerNow(data);
    if (data.land) updateLocalLandOp(id, data.land);

    if (!res.ok || !data.allowed) {
      if (data.remainingMs && data.nextAllowedAt) {
        toast(t("land.modeCooldownToast", {
          time: formatCooldownDuration(data.remainingMs),
          utc: formatUtcDateTime(data.nextAllowedAt)
        }), "bad", 4500);
      } else {
        toast(t("msg.error"), "bad");
      }
      return false;
    }

    // Mirror mode on Firebase so all online players see the land appearance update immediately
    commit({ [`world/lands/${id}/mode`]: mode }).catch(() => {});
    toast(t("land.modeUpdated"), "good");
    return true;
  } catch (_) {
    toast(t("msg.error"), "bad");
    return false;
  }
}

export async function buyAnimal(id, type) {
  const land = S.lands[id];
  const cfg = ANIMAL_TYPES[type];
  if (!land || land.owner !== S.uid || !cfg) return false;

  // Step 1: Validate with server
  try {
    const valRes = await fetch("/api/lands/animal/validate-buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        landId: id,
        uid: S.uid,
        ownerName: S.profile?.username,
        type,
        bronzeBalance: bal("bronze")
      })
    });
    const valData = await valRes.json();
    if (!valRes.ok || !valData.allowed) {
      toast(t(valData.error?.includes("Max") ? "land.animalsFull" : "msg.notEnough"), "bad");
      return false;
    }
  } catch (_) {
    toast(t("msg.error"), "bad");
    return false;
  }

  // Step 2: Deduct bronze in Firebase
  const ok = await commit({ [savePath(S.uid, "wallet/bronze")]: increment(-cfg.costBronze) });
  if (!ok) return false;

  // Step 3: Persist animal on server
  const res = await fetch("/api/lands/animal/buy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ landId: id, uid: S.uid, ownerName: S.profile?.username, type })
  });
  if (res.ok) {
    const data = await res.json();
    updateLocalLandOp(id, data.land);
    toast(t("land.animalBought"), "good");
    return true;
  }
  await commit({ [savePath(S.uid, "wallet/bronze")]: increment(cfg.costBronze) });
  return false;
}

export async function collectAnimal(id, animalKey) {
  const land = S.lands[id];
  if (!land || land.owner !== S.uid) return false;
  try {
    const res = await fetch("/api/lands/animal/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landId: id, uid: S.uid, animalKey })
    });
    const data = await res.json();
    if (!res.ok || !data.allowed) return false;

    const ok = await commit({
      [savePath(S.uid, `inv/${data.yieldItem}`)]: increment(data.yieldQty)
    });
    if (ok) {
      playHarvest();
      updateLocalLandOp(id, data.land);
      toast(t("land.animalCollected", { n: data.yieldQty }), "good");
    }
    return ok;
  } catch (_) {
    return false;
  }
}

export async function stockLandShop(id, { item, qty, price, currency }) {
  const land = S.lands[id];
  if (!land || land.owner !== S.uid) return false;
  qty = Math.floor(qty);
  price = Math.floor(price);
  if (!parseItem(item) || !COINS.includes(currency)) return false;
  if (!(qty >= 1) || qty > inv(item)) { toast(t("msg.notEnough"), "bad"); return false; }
  const mode = (S.landOps[id] && S.landOps[id].mode) || "farm";
  if (mode === "bulkShop" && (!(price >= 1) || price > MAX_LISTING_PRICE)) {
    toast(t("msg.badPrice"), "bad");
    return false;
  }

  // Ask server to validate & persist stock first, then deduct inventory
  try {
    const res = await fetch("/api/lands/shop/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        landId: id,
        uid: S.uid,
        ownerName: S.profile?.username,
        item,
        qty,
        price: Math.max(1, price || 1),
        currency
      })
    });
    const data = await res.json();
    if (!res.ok || !data.allowed) { toast(t("msg.error"), "bad"); return false; }

    const ok = await commit({ [savePath(S.uid, `inv/${item}`)]: increment(-qty) });
    if (ok) {
      updateLocalLandOp(id, data.land);
      toast(t("land.stocked"), "good");
    }
    return ok;
  } catch (_) {
    toast(t("msg.error"), "bad");
    return false;
  }
}

export async function removeLandStock(id, stockKey) {
  const land = S.lands[id];
  if (!land || land.owner !== S.uid) return false;
  try {
    const res = await fetch("/api/lands/shop/unstock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landId: id, uid: S.uid, stockKey })
    });
    const data = await res.json();
    if (!res.ok || !data.allowed) return false;

    const ok = await commit({ [savePath(S.uid, `inv/${data.item}`)]: increment(data.qty) });
    if (ok) {
      updateLocalLandOp(id, data.land);
      toast(t("msg.canceled"));
    }
    return ok;
  } catch (_) {
    return false;
  }
}

export async function setLuckSpinConfig(id, price, currency) {
  const land = S.lands[id];
  if (!land || land.owner !== S.uid) return false;
  price = Math.floor(price);
  if (!COINS.includes(currency) || !(price >= 1) || price > MAX_LISTING_PRICE) {
    toast(t("msg.badPrice"), "bad");
    return false;
  }
  try {
    const res = await fetch("/api/lands/shop/luck-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landId: id, uid: S.uid, price, currency })
    });
    const data = await res.json();
    if (!res.ok || !data.allowed) return false;
    updateLocalLandOp(id, data.land);
    toast(t("land.luckConfigured"), "good");
    return true;
  } catch (_) {
    return false;
  }
}

export async function buyFromBulkShop(id, stockKey) {
  const land = S.lands[id];
  const op = S.landOps[id];
  const entry = op?.stock?.[stockKey];
  if (!land || !entry || entry.qty < 1) { toast(t("land.outOfStock"), "bad"); return false; }
  if (land.owner === S.uid) return false;
  if (bal(entry.currency) < entry.price) { toast(t("msg.notEnough"), "bad"); return false; }

  try {
    const res = await fetch("/api/lands/shop/buy-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        landId: id,
        buyerUid: S.uid,
        stockKey,
        buyerBalance: bal(entry.currency)
      })
    });
    const data = await res.json();
    if (!res.ok || !data.allowed) {
      toast(t("land.outOfStock"), "bad");
      return false;
    }

    const ok = await commit({
      [savePath(S.uid, `wallet/${data.currency}`)]: increment(-data.price),
      [savePath(S.uid, `inv/${data.item}`)]: increment(data.qty)
    });
    if (ok) {
      updateLocalLandOp(id, data.land);
      toast(t("msg.bought"), "good");
    }
    return ok;
  } catch (_) {
    toast(t("msg.error"), "bad");
    return false;
  }
}

export async function spinLuckShop(id) {
  const land = S.lands[id];
  const op = S.landOps[id];
  if (!land || !op || land.owner === S.uid) return false;
  const price = Math.max(1, Number(op.luckPrice) || 5);
  const currency = COINS.includes(op.luckCurrency) ? op.luckCurrency : "bronze";
  if (bal(currency) < price) { toast(t("msg.notEnough"), "bad"); return false; }

  try {
    const res = await fetch("/api/lands/shop/spin-luck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        landId: id,
        buyerUid: S.uid,
        buyerBalance: bal(currency)
      })
    });
    const data = await res.json();
    if (!res.ok || !data.allowed) {
      toast(t("land.outOfStock"), "bad");
      return false;
    }

    const ok = await commit({
      [savePath(S.uid, `wallet/${data.currency}`)]: increment(-data.price),
      [savePath(S.uid, `inv/${data.item}`)]: increment(data.qty)
    });
    if (ok) {
      updateLocalLandOp(id, data.land);
      toast(t("land.luckWon", { qty: data.qty }), "good", 4000);
    }
    return ok;
  } catch (_) {
    toast(t("msg.error"), "bad");
    return false;
  }
}

export async function claimLandShopEarnings(id) {
  const land = S.lands[id];
  if (!land || land.owner !== S.uid) return false;
  try {
    const res = await fetch("/api/lands/shop/claim-earnings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landId: id, uid: S.uid })
    });
    const data = await res.json();
    if (!res.ok || !data.allowed) return false;

    const updates = {};
    if (data.earned.bronze > 0) updates[savePath(S.uid, "wallet/bronze")] = increment(data.earned.bronze);
    if (data.earned.silver > 0) updates[savePath(S.uid, "wallet/silver")] = increment(data.earned.silver);
    if (data.earned.gold > 0) updates[savePath(S.uid, "wallet/gold")] = increment(data.earned.gold);

    const ok = await commit(updates);
    if (ok) {
      updateLocalLandOp(id, data.land);
      toast(t("land.earningsClaimed"), "good");
    }
    return ok;
  } catch (_) {
    return false;
  }
}
