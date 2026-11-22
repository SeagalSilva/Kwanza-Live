// Inventory item helpers. Item ids: "seed_<crop>" and "crop_<crop>".
import { CROPS, CROP_IDS } from "./crops.js";
import { t } from "../i18n.js";

export const seedId = (crop) => `seed_${crop}`;
export const cropItemId = (crop) => `crop_${crop}`;

export function parseItem(id) {
  const [kind, crop] = String(id).split("_");
  return CROPS[crop] && (kind === "seed" || kind === "crop") ? { kind, crop } : null;
}

export function itemIcon(id) {
  const it = parseItem(id);
  if (!it) return "📦";
  return it.kind === "seed" ? `🌱${CROPS[it.crop].emoji}` : CROPS[it.crop].emoji;
}

export function itemName(id) {
  const it = parseItem(id);
  if (!it) return id;
  const name = t(`crop.${it.crop}`);
  return it.kind === "seed" ? t("item.seedOf", { name }) : name;
}

export const ALL_ITEM_IDS = CROP_IDS.flatMap((c) => [seedId(c), cropItemId(c)]);
