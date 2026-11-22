// Crops of the game. Add a new crop here and add its name to i18n (crop.<id>).
//   grow     seconds until ripe
//   yield    items harvested
//   seedCost pool points to buy one seed at the Game Market
//   sell     pool points paid by the Game Market for one harvested item
export const CROPS = {
  corn:      { emoji: "🌽", grow: 30,  yield: 2, seedCost: 5,  sell: 4  },
  beans:     { emoji: "🫘", grow: 45,  yield: 2, seedCost: 8,  sell: 7  },
  peanut:    { emoji: "🥜", grow: 60,  yield: 3, seedCost: 12, sell: 6  },
  cassava:   { emoji: "🥔", grow: 90,  yield: 3, seedCost: 20, sell: 12 },
  banana:    { emoji: "🍌", grow: 150, yield: 4, seedCost: 35, sell: 15 },
  pineapple: { emoji: "🍍", grow: 240, yield: 4, seedCost: 60, sell: 28 }
};

export const CROP_IDS = Object.keys(CROPS);
