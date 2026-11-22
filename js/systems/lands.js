// Buying private lands with pool points.
import { S, bal } from "../state.js";
import { serverTimestamp, increment } from "../firebase.js";
import { LAND_META } from "../world/map.js";
import { MAX_LANDS_PER_PLAYER } from "../config.js";
import { t } from "../i18n.js";
import { toast } from "../ui/toast.js";
import { commit, savePath } from "./db.js";

export const ownedLandsCount = () => Object.values(S.lands).filter((l) => l.owner === S.uid).length;

export async function buyLand(id) {
  const meta = LAND_META.find((l) => l.id === id);
  if (!meta) return false;
  if (S.lands[id]) { toast(t("msg.landTaken"), "bad"); return false; }
  if (ownedLandsCount() >= MAX_LANDS_PER_PLAYER) { toast(t("msg.maxLands", { n: MAX_LANDS_PER_PLAYER }), "bad"); return false; }
  if (bal("pp") < meta.price) { toast(t("msg.notEnough"), "bad"); return false; }

  const ok = await commit({
    [`world/lands/${id}`]: { owner: S.uid, ownerName: S.profile.username, at: serverTimestamp() },
    [savePath(S.uid, "wallet/pp")]: increment(-meta.price)
  }, "msg.landTaken");
  if (ok) toast(t("msg.landBought", { id }), "good");
  return ok;
}
