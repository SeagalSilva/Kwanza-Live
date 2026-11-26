// Named natural resources obtained from Mines (ores) and the Forest (woods).
// Item IDs use prefixes "ore_<name>" and "wood_<name>" and are valid RTDB inv keys.

export const RESOURCES = {
  // ── Mines Ores (Minérios das Minas) ─────────────────────────
  ore_coal: {
    id: "ore_coal",
    category: "ore",
    tier: "common",
    emoji: "🪨",
    i18nKey: "res.ore_coal",
    sellPp: 3
  },
  ore_copper: {
    id: "ore_copper",
    category: "ore",
    tier: "common",
    emoji: "🟠",
    i18nKey: "res.ore_copper",
    sellPp: 5
  },
  ore_iron: {
    id: "ore_iron",
    category: "ore",
    tier: "uncommon",
    emoji: "⛓️",
    i18nKey: "res.ore_iron",
    sellPp: 9
  },
  ore_silver: {
    id: "ore_silver",
    category: "ore",
    tier: "rare",
    emoji: "🥈",
    i18nKey: "res.ore_silver",
    sellPp: 16
  },
  ore_gold: {
    id: "ore_gold",
    category: "ore",
    tier: "epic",
    emoji: "🥇",
    i18nKey: "res.ore_gold",
    sellPp: 28
  },
  ore_diamond: {
    id: "ore_diamond",
    category: "ore",
    tier: "legendary",
    emoji: "💎",
    i18nKey: "res.ore_diamond",
    sellPp: 55
  },

  // ── Forest Woods (Madeiras da Floresta) ─────────────────────
  wood_pine: {
    id: "wood_pine",
    category: "wood",
    tier: "pine",
    emoji: "🪵",
    i18nKey: "res.wood_pine",
    sellPp: 3
  },
  wood_oak: {
    id: "wood_oak",
    category: "wood",
    tier: "oak",
    emoji: "🌳",
    i18nKey: "res.wood_oak",
    sellPp: 6
  },
  wood_mahogany: {
    id: "wood_mahogany",
    category: "wood",
    tier: "mahogany",
    emoji: "🟫",
    i18nKey: "res.wood_mahogany",
    sellPp: 14
  },
  wood_elder: {
    id: "wood_elder",
    category: "wood",
    tier: "elder",
    emoji: "✨",
    i18nKey: "res.wood_elder",
    sellPp: 30
  }
};

export const RESOURCE_IDS = Object.keys(RESOURCES);
export const ORE_IDS = RESOURCE_IDS.filter((id) => RESOURCES[id].category === "ore");
export const WOOD_IDS = RESOURCE_IDS.filter((id) => RESOURCES[id].category === "wood");
