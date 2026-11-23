// Planting and harvesting, on the public farm and on private lands.
import { S, now, inv } from "../state.js";
import { serverTimestamp, increment } from "../firebase.js";
import { CROPS } from "../data/crops.js";
import { seedId, cropItemId } from "../data/items.js";
import { PUBLIC_FARM_LIMIT, WITHER_AFTER_RIPE_MS } from "../config.js";
import { t } from "../i18n.js";
import { toast } from "../ui/toast.js";
import { fmtTime } from "../utils.js";
import { commit, savePath } from "./db.js";
import { playPlant, playHarvest } from "./audio.js";

export const tilePath = (scope, key) =>
  scope === "public" ? `world/publicFarm/${key}` : `world/landTiles/${scope}/${key}`;

export const tileData = (scope, key) =>
  scope === "public" ? S.farm[key] : (S.landTiles[scope] || {})[key];

/** empty | growing | ripe | withered  (+ progress / seconds left) */
export function cropState(tile) {
  if (!tile || !CROPS[tile.crop]) return { stage: "empty" };
  const grow = CROPS[tile.crop].grow * 1000;
  const at = typeof tile.at === "number" ? tile.at : now();
  const elapsed = now() - at;
  if (elapsed < grow) return { stage: "growing", progress: Math.max(0, elapsed / grow), left: (grow - elapsed) / 1000 };
  if (tile.ttl && elapsed > tile.ttl) return { stage: "withered" };
  return { stage: "ripe", progress: 1 };
}

/** Public land is open to everybody; a private land only to its owner. */
export const canUseScope = (scope) => scope === "public" || S.lands[scope]?.owner === S.uid;

export const landModeOf = (scope) =>
  scope === "public" ? "farm" : (S.landOps?.[scope]?.mode || S.lands?.[scope]?.mode || "farm");

const busy = new Set();
async function guarded(key, fn) {
  if (busy.has(key)) return;
  busy.add(key);
  try { await fn(); } finally { busy.delete(key); }
}

export async function interactTile(scope, key) {
  if (!canUseScope(scope)) { toast(t("msg.notYourLand"), "bad"); return; }
  const tile = tileData(scope, key);
  const st = cropState(tile);

  if (st.stage === "empty") {
    if (scope !== "public" && landModeOf(scope) !== "farm") {
      toast(t("msg.landNotFarmMode"), "bad");
      return;
    }
    return plant(scope, key);
  }

  const crop = t(`crop.${tile.crop}`);
  const owner = tile.byName || "?";
  if (st.stage === "growing") { toast(t("msg.growing", { crop, time: fmtTime(st.left), name: owner })); return; }
  if (st.stage === "withered") return clearTile(scope, key);
  if (tile.by !== S.uid) { toast(t("msg.belongsTo", { crop, name: owner }), "bad"); return; }
  return harvest(scope, key, tile);
}

async function plant(scope, key) {
  const cropId = S.selectedSeed;
  const c = CROPS[cropId];
  const seed = seedId(cropId);
  if (!c || inv(seed) < 1) { toast(t("msg.noSeeds", { crop: t(`crop.${cropId}`) }), "bad"); return; }

  if (scope === "public") {
    const mine = Object.values(S.farm).filter((x) => x && x.by === S.uid).length;
    if (mine >= PUBLIC_FARM_LIMIT) { toast(t("msg.limitPublic", { n: PUBLIC_FARM_LIMIT }), "bad"); return; }
  }

  await guarded(key, async () => {
    const ok = await commit({
      [tilePath(scope, key)]: {
        crop: cropId, by: S.uid, byName: S.profile.username,
        at: serverTimestamp(), ttl: c.grow * 1000 + WITHER_AFTER_RIPE_MS
      },
      [savePath(S.uid, `inv/${seed}`)]: increment(-1)
    }, "msg.tileTaken");
    if (ok) {
      playPlant();
      toast(t("msg.planted", { crop: t(`crop.${cropId}`) }), "good");
    }
  });
}

async function harvest(scope, key, tile) {
  const c = CROPS[tile.crop];
  await guarded(key, async () => {
    const ok = await commit({
      [tilePath(scope, key)]: null,
      [savePath(S.uid, `inv/${cropItemId(tile.crop)}`)]: increment(c.yield)
    });
    if (ok) {
      playHarvest();
      toast(t("msg.harvested", { n: c.yield, crop: t(`crop.${tile.crop}`), icon: c.emoji }), "good");
    }
  });
}

/** Abandoned (withered) crops can be cleared by anybody — it frees the tile. */
async function clearTile(scope, key) {
  await guarded(key, async () => {
    const ok = await commit({ [tilePath(scope, key)]: null });
    if (ok) toast(t("msg.cleared"));
  });
}
