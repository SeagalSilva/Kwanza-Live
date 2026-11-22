// Buying private lands with coins equivalent to 10 gold coins (100,000 bronze).
import { S, bal } from "../state.js";
import { serverTimestamp, increment } from "../firebase.js";
import { LAND_META } from "../world/map.js";
import { MAX_LANDS_PER_PLAYER } from "../config.js";
import { LAND_PRICE_GOLD, LAND_PRICE_BRONZE_EQUIV } from "../data/lands.js";
import { t } from "../i18n.js";
import { toast } from "../ui/toast.js";
import { commit, savePath } from "./db.js";

export const ownedLandsCount = () => Object.values(S.lands).filter((l) => l.owner === S.uid).length;

export const totalCoinsInBronze = () =>
  (bal("gold") || 0) * 10000 + (bal("silver") || 0) * 100 + (bal("bronze") || 0);

export function computeLandCoinDeductions(neededBronze = LAND_PRICE_BRONZE_EQUIV) {
  let needed = neededBronze;
  const g = bal("gold") || 0;
  const s = bal("silver") || 0;
  const b = bal("bronze") || 0;

  let takeGold = Math.min(g, Math.floor(needed / 10000));
  needed -= takeGold * 10000;

  let takeSilver = Math.min(s, Math.floor(needed / 100));
  needed -= takeSilver * 100;

  let takeBronze = Math.min(b, needed);
  needed -= takeBronze;

  if (needed > 0) {
    if (s > takeSilver) {
      takeSilver += 1;
      const refundBronze = 100 - needed;
      takeBronze -= refundBronze;
    } else if (g > takeGold) {
      takeGold += 1;
      const refundBronze = 10000 - needed;
      takeBronze -= refundBronze;
    }
  }

  return { takeGold, takeSilver, takeBronze };
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
    [`world/lands/${id}`]: { owner: S.uid, ownerName: S.profile.username, at: serverTimestamp() }
  };
  if (takeGold !== 0) updates[savePath(S.uid, "wallet/gold")] = increment(-takeGold);
  if (takeSilver !== 0) updates[savePath(S.uid, "wallet/silver")] = increment(-takeSilver);
  if (takeBronze !== 0) updates[savePath(S.uid, "wallet/bronze")] = increment(-takeBronze);

  const ok = await commit(updates, "msg.landTaken");
  if (ok) toast(t("msg.landBought", { id }), "good");
  return ok;
}
