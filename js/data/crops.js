// Crops of the game. Admin-configurable values (packPrice, packSize, yield, sell)
// are synced live from /api/economy/market-config.
//   grow      seconds until ripe
//   yield     items harvested per planted seed
//   packPrice bronze coins for one seed pack (buys packSize seeds automatically, min 5)
//   packSize  seeds included per pack (minimum 5)
//   sell      pool points paid by the Game Market for one harvested item
export const MIN_SEED_PACK = 5;

export const CROPS = {
  corn:      { emoji: "🌽", grow: 30,  yield: 2, packPrice: 25,  packSize: 5, seedCost: 5,  sell: 4  },
  beans:     { emoji: "🫘", grow: 45,  yield: 2, packPrice: 40,  packSize: 5, seedCost: 8,  sell: 7  },
  peanut:    { emoji: "🥜", grow: 60,  yield: 3, packPrice: 60,  packSize: 5, seedCost: 12, sell: 6  },
  cassava:   { emoji: "🥔", grow: 90,  yield: 3, packPrice: 100, packSize: 5, seedCost: 20, sell: 12 },
  banana:    { emoji: "🍌", grow: 150, yield: 4, packPrice: 175, packSize: 5, seedCost: 35, sell: 15 },
  pineapple: { emoji: "🍍", grow: 240, yield: 4, packPrice: 300, packSize: 5, seedCost: 60, sell: 28 }
};

export const CROP_IDS = Object.keys(CROPS);

export function applyMarketConfig(serverCrops) {
  if (!serverCrops || typeof serverCrops !== "object") return false;
  let changed = false;
  for (const id of CROP_IDS) {
    const incoming = serverCrops[id];
    const target = CROPS[id];
    if (!incoming || !target) continue;

    const nextPackPrice = Math.max(1, Math.round(Number(incoming.packPrice) || target.packPrice));
    const nextPackSize = Math.max(MIN_SEED_PACK, Math.round(Number(incoming.packSize) || target.packSize));
    const nextYield = Math.max(1, Math.round(Number(incoming.yield) || target.yield));
    const nextSell = Math.max(1, Math.round(Number(incoming.sell) || target.sell));

    if (
      target.packPrice !== nextPackPrice ||
      target.packSize !== nextPackSize ||
      target.yield !== nextYield ||
      target.sell !== nextSell
    ) {
      target.packPrice = nextPackPrice;
      target.packSize = nextPackSize;
      target.seedCost = nextPackPrice / nextPackSize;
      target.yield = nextYield;
      target.sell = nextSell;
      changed = true;
    }
  }
  return changed;
}
