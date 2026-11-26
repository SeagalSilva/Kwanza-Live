// Inventory item helpers. Item ids: "seed_<crop>", "crop_<crop>", "ore_<name>", "wood_<name>".
import { CROPS, CROP_IDS } from "./crops.js";
import { RESOURCES, RESOURCE_IDS } from "./resources.js";
import { t } from "../i18n.js";

export const seedId = (crop) => `seed_${crop}`;
export const cropItemId = (crop) => `crop_${crop}`;

export function parseItem(id) {
  const key = String(id || "");
  if (RESOURCES[key]) {
    const r = RESOURCES[key];
    return { kind: "resource", category: r.category, resource: key };
  }
  const [kind, crop] = key.split("_");
  return CROPS[crop] && (kind === "seed" || kind === "crop") ? { kind, crop } : null;
}

export function itemIcon(id) {
  const it = parseItem(id);
  if (!it) return "📦";
  if (it.kind === "resource") return RESOURCES[it.resource].emoji;
  return it.kind === "seed" ? `🌱${CROPS[it.crop].emoji}` : CROPS[it.crop].emoji;
}

export function itemName(id) {
  const it = parseItem(id);
  if (!it) return id;
  if (it.kind === "resource") return t(RESOURCES[it.resource].i18nKey);
  const name = t(`crop.${it.crop}`);
  return it.kind === "seed" ? t("item.seedOf", { name }) : name;
}

export const ALL_ITEM_IDS = [
  ...CROP_IDS.flatMap((c) => [seedId(c), cropItemId(c)]),
  ...RESOURCE_IDS
];
