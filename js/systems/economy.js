// Game Market (NPC) and coin exchange.
// All actions validate with the server first; free seed visits are timed server-side.
import { S, inv, bal } from "../state.js";
import { emit } from "../bus.js";
import { increment } from "../firebase.js";
import { FREE_SEED_STAY_MS } from "../config.js";
import { CROPS, MIN_SEED_PACK, applyMarketConfig } from "../data/crops.js";
import { EXCHANGES } from "../data/currencies.js";
import { RESOURCES } from "../data/resources.js";
import { seedId, cropItemId, itemName } from "../data/items.js";
import { t } from "../i18n.js";
import { toast } from "../ui/toast.js";
import { commit, savePath } from "./db.js";
import { playHarvest } from "./audio.js";

let pendingSeedVisit = null;
let lastFreeSeedStatus = null;
let listenersBound = false;

export const getFreeSeedStatus = () => lastFreeSeedStatus;

export async function syncMarketConfigFromServer() {
  try {
    const res = await fetch("/api/economy/market-config");
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.crops && applyMarketConfig(data.crops)) {
      emit("marketConfig");
      return true;
    }
    return !!data?.success;
  } catch (_) {
    return false;
  }
}

export async function updateMarketConfigAdmin(cropsPayload) {
  if (!S.user?.email || !cropsPayload) return false;
  try {
    const res = await fetch("/api/economy/admin/update-market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminEmail: S.user.email,
        crops: cropsPayload
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      toast(data.error || t("msg.error"), "bad");
      return false;
    }
    if (data.crops) applyMarketConfig(data.crops);
    emit("marketConfig");
    emit("save");
    toast(t("gm.adminSaved"), "good");
    return true;
  } catch (_) {
    toast(t("msg.error"), "bad");
    return false;
  }
}

async function handleReturnFromLink() {
  if (!pendingSeedVisit || !S.uid) return;
  const elapsedLocal = Date.now() - pendingSeedVisit.startedAt;
  if (elapsedLocal < 300 && !pendingSeedVisit.leftPage) return;

  pendingSeedVisit = null;

  try {
    const res = await fetch("/api/economy/free-seed/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid })
    });
    const data = await res.json();

    if (data.allowed) {
      const qty = data.qty || 3;
      const cropId = data.cropId || "corn";
      const ok = await commit({
        [savePath(S.uid, `inv/${seedId(cropId)}`)]: increment(qty)
      });
      if (ok) {
        playHarvest();
        lastFreeSeedStatus = { kind: "rewarded", n: qty, crop: cropId };
        toast(t("gm.linkRewardSuccess", { n: qty, crop: t(`crop.${cropId}`) }), "good", 5000);
      } else {
        lastFreeSeedStatus = { kind: "error" };
      }
    } else {
      const sec = (Math.max(0, data.elapsedMs ?? elapsedLocal) / 1000).toFixed(1);
      lastFreeSeedStatus = { kind: "tooEarly", sec };
      toast(t("gm.linkTooEarly", { s: sec }), "bad", 5000);
    }
  } catch (err) {
    const sec = (elapsedLocal / 1000).toFixed(1);
    if (elapsedLocal < FREE_SEED_STAY_MS) {
      lastFreeSeedStatus = { kind: "tooEarly", sec };
      toast(t("gm.linkTooEarly", { s: sec }), "bad", 5000);
    } else {
      lastFreeSeedStatus = { kind: "error" };
      toast(t("msg.error"), "bad");
    }
  }
  emit("freeSeedStatus", lastFreeSeedStatus);
}

function ensureVisitListeners() {
  if (listenersBound) return;
  listenersBound = true;

  document.addEventListener("visibilitychange", () => {
    if (!pendingSeedVisit) return;
    if (document.visibilityState === "hidden") {
      pendingSeedVisit.leftPage = true;
    } else if (document.visibilityState === "visible") {
      setTimeout(() => handleReturnFromLink(), 120);
    }
  });

  window.addEventListener("blur", () => {
    if (pendingSeedVisit) pendingSeedVisit.leftPage = true;
  });

  window.addEventListener("focus", () => {
    if (!pendingSeedVisit) return;
    setTimeout(() => handleReturnFromLink(), 120);
  });
}

export async function startFreeSeedVisit() {
  ensureVisitListeners();
  pendingSeedVisit = { startedAt: Date.now(), leftPage: false };
  lastFreeSeedStatus = { kind: "waiting" };
  emit("freeSeedStatus", lastFreeSeedStatus);
  if (S.uid) {
    await fetch("/api/economy/free-seed/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid })
    }).catch(() => {});
  }
}

export async function buySeeds(cropId, packs = 1) {
  const c = CROPS[cropId];
  const packCount = Math.max(1, Math.floor(Number(packs) || 1));
  if (!c || !S.uid) return false;

  const localPackSize = Math.max(MIN_SEED_PACK, Math.floor(Number(c.packSize) || MIN_SEED_PACK));
  const localCost = c.packPrice * packCount;
  if (bal("bronze") < localCost) { toast(t("msg.notEnough"), "bad"); return false; }

  let finalCost = localCost;
  let finalQty = localPackSize * packCount;

  try {
    const valRes = await fetch("/api/economy/validate-buy-seeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: S.uid,
        cropId,
        packs: packCount,
        qty: finalQty,
        bronzeBalance: bal("bronze")
      })
    });
    const valData = await valRes.json();
    if (!valRes.ok || !valData.allowed) {
      toast(t("msg.notEnough"), "bad");
      return false;
    }
    finalCost = Number(valData.cost) || localCost;
    finalQty = Math.max(MIN_SEED_PACK, Number(valData.qty) || finalQty);
  } catch (_) {
    toast(t("msg.error"), "bad");
    return false;
  }

  const ok = await commit({
    [savePath(S.uid, "wallet/bronze")]: increment(-finalCost),
    [savePath(S.uid, `inv/${seedId(cropId)}`)]: increment(finalQty)
  });
  if (ok) toast(t("msg.boughtSeeds", { n: finalQty, crop: t(`crop.${cropId}`) }), "good");
  return ok;
}

export async function sellCrops(cropId, qty) {
  if (!S.uid) return false;
  const owned = inv(cropItemId(cropId));
  qty = Math.min(qty, owned);
  if (qty < 1) return false;

  let sellTxId = null;
  let gain = CROPS[cropId].sell * qty;
  try {
    const valRes = await fetch("/api/economy/validate-sell-crops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, cropId, qty, ownedQty: owned })
    });
    const valData = await valRes.json();
    if (!valRes.ok || !valData.allowed || !valData.txId) {
      toast(t("msg.notEnough"), "bad");
      return false;
    }
    sellTxId = valData.txId;
    if (Number.isFinite(Number(valData.gain))) {
      gain = Math.max(1, Math.floor(Number(valData.gain)));
    }
  } catch (err) {
    console.error("[economy validate-sell]", err);
    toast(t("msg.error"), "bad");
    return false;
  }

  const ok = await commit({
    [savePath(S.uid, `inv/${cropItemId(cropId)}`)]: increment(-qty),
    [savePath(S.uid, "wallet/pp")]: increment(gain)
  });
  if (ok) {
    const confirmPayload = JSON.stringify({
      uid: S.uid,
      name: S.profile?.username || "Jogador",
      txId: sellTxId
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("/api/economy/confirm-sell-crops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: confirmPayload
        });
        if (res.ok) break;
      } catch (_) {}
    }
    toast(t("msg.soldCrops", { n: qty, crop: t(`crop.${cropId}`), gain }), "good");
  }
  return ok;
}

export async function sellResource(itemId, qty) {
  const resCfg = RESOURCES[itemId];
  if (!S.uid || !resCfg) return false;
  const owned = inv(itemId);
  qty = Math.min(qty, owned);
  if (qty < 1) return false;

  let sellTxId = null;
  let gain = resCfg.sellPp * qty;
  try {
    const valRes = await fetch("/api/economy/validate-sell-crops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, itemId, qty, ownedQty: owned })
    });
    const valData = await valRes.json();
    if (!valRes.ok || !valData.allowed || !valData.txId) {
      toast(t("msg.notEnough"), "bad");
      return false;
    }
    sellTxId = valData.txId;
    if (Number.isFinite(Number(valData.gain))) {
      gain = Math.max(1, Math.floor(Number(valData.gain)));
    }
  } catch (err) {
    console.error("[economy validate-sell-resource]", err);
    toast(t("msg.error"), "bad");
    return false;
  }

  const ok = await commit({
    [savePath(S.uid, `inv/${itemId}`)]: increment(-qty),
    [savePath(S.uid, "wallet/pp")]: increment(gain)
  });
  if (ok) {
    const confirmPayload = JSON.stringify({
      uid: S.uid,
      name: S.profile?.username || "Jogador",
      txId: sellTxId
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("/api/economy/confirm-sell-crops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: confirmPayload
        });
        if (res.ok) break;
      } catch (_) {}
    }
    toast(t("msg.soldCrops", { n: qty, crop: itemName(itemId), gain }), "good");
  }
  return ok;
}

export async function exchange(from, to) {
  const rule = EXCHANGES.find((x) => x.from === from && x.to === to);
  if (!S.uid || !rule || bal(from) < rule.cost) { toast(t("msg.notEnough"), "bad"); return false; }

  try {
    const valRes = await fetch("/api/economy/validate-exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, from, to, balance: bal(from) })
    });
    const valData = await valRes.json();
    if (!valRes.ok || !valData.allowed) {
      toast(t("msg.notEnough"), "bad");
      return false;
    }
  } catch (_) {}

  const ok = await commit({
    [savePath(S.uid, `wallet/${from}`)]: increment(-rule.cost),
    [savePath(S.uid, `wallet/${to}`)]: increment(rule.gain)
  });
  if (ok) toast(t("msg.exchanged"), "good");
  return ok;
}
