// Game Market (NPC) and coin exchange.
import { S, inv, bal } from "../state.js";
import { increment } from "../firebase.js";
import { CROPS } from "../data/crops.js";
import { EXCHANGES } from "../data/currencies.js";
import { seedId, cropItemId } from "../data/items.js";
import { t } from "../i18n.js";
import { toast } from "../ui/toast.js";
import { commit, savePath } from "./db.js";

export async function buySeeds(cropId, qty) {
  const c = CROPS[cropId];
  const cost = c.seedCost * qty;
  if (bal("pp") < cost) { toast(t("msg.notEnough"), "bad"); return false; }
  const ok = await commit({
    [savePath(S.uid, "wallet/pp")]: increment(-cost),
    [savePath(S.uid, `inv/${seedId(cropId)}`)]: increment(qty)
  });
  if (ok) toast(t("msg.boughtSeeds", { n: qty, crop: t(`crop.${cropId}`) }), "good");
  return ok;
}

export async function sellCrops(cropId, qty) {
  qty = Math.min(qty, inv(cropItemId(cropId)));
  if (qty < 1) return false;
  const gain = CROPS[cropId].sell * qty;
  const ok = await commit({
    [savePath(S.uid, `inv/${cropItemId(cropId)}`)]: increment(-qty),
    [savePath(S.uid, "wallet/pp")]: increment(gain)
  });
  if (ok) toast(t("msg.soldCrops", { n: qty, crop: t(`crop.${cropId}`), gain }), "good");
  return ok;
}

export async function exchange(from, to) {
  const rule = EXCHANGES.find((x) => x.from === from && x.to === to);
  if (!rule || bal(from) < rule.cost) { toast(t("msg.notEnough"), "bad"); return false; }
  const ok = await commit({
    [savePath(S.uid, `wallet/${from}`)]: increment(-rule.cost),
    [savePath(S.uid, `wallet/${to}`)]: increment(rule.gain)
  });
  if (ok) toast(t("msg.exchanged"), "good");
  return ok;
}
