// Game Market (NPC) and coin exchange.
// All actions validate with the server first; free seed visits are timed server-side.
import { S, inv, bal } from "../state.js";
import { emit } from "../bus.js";
import { increment } from "../firebase.js";
import { FREE_SEED_STAY_MS } from "../config.js";
import { CROPS } from "../data/crops.js";
import { EXCHANGES } from "../data/currencies.js";
import { seedId, cropItemId } from "../data/items.js";
import { t } from "../i18n.js";
import { toast } from "../ui/toast.js";
import { commit, savePath } from "./db.js";
import { playHarvest } from "./audio.js";

let pendingSeedVisit = null;
let lastFreeSeedStatus = null;
let listenersBound = false;

export const getFreeSeedStatus = () => lastFreeSeedStatus;

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

export async function buySeeds(cropId, qty) {
  const c = CROPS[cropId];
  if (!c || !S.uid) return false;
  const cost = c.seedCost * qty;
  if (bal("bronze") < cost) { toast(t("msg.notEnough"), "bad"); return false; }

  try {
    const valRes = await fetch("/api/economy/validate-buy-seeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, cropId, qty, bronzeBalance: bal("bronze") })
    });
    const valData = await valRes.json();
    if (!valRes.ok || !valData.allowed) {
      toast(t("msg.notEnough"), "bad");
      return false;
    }
  } catch (_) {}

  const ok = await commit({
    [savePath(S.uid, "wallet/bronze")]: increment(-cost),
    [savePath(S.uid, `inv/${seedId(cropId)}`)]: increment(qty)
  });
  if (ok) toast(t("msg.boughtSeeds", { n: qty, crop: t(`crop.${cropId}`) }), "good");
  return ok;
}

export async function sellCrops(cropId, qty) {
  if (!S.uid) return false;
  const owned = inv(cropItemId(cropId));
  qty = Math.min(qty, owned);
  if (qty < 1) return false;

  let sellTxId = null;
  try {
    const valRes = await fetch("/api/economy/validate-sell-crops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, cropId, qty, ownedQty: owned })
    });
    const valData = await valRes.json();
    if (!valRes.ok || !valData.allowed) {
      toast(t("msg.notEnough"), "bad");
      return false;
    }
    sellTxId = valData.txId || null;
  } catch (_) {}

  const gain = CROPS[cropId].sell * qty;
  const ok = await commit({
    [savePath(S.uid, `inv/${cropItemId(cropId)}`)]: increment(-qty),
    [savePath(S.uid, "wallet/pp")]: increment(gain)
  });
  if (ok) {
    if (sellTxId) {
      fetch("/api/economy/confirm-sell-crops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: S.uid, name: S.profile?.username || "Jogador", txId: sellTxId })
      }).catch(() => {});
    }
    toast(t("msg.soldCrops", { n: qty, crop: t(`crop.${cropId}`), gain }), "good");
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
