// Private plots. Each footprint is 6x6 tiles: a fence ring plus a 4x4 farm inside.
// (x0,y0) = top-left corner. The gate is on the top side. Change prices freely.
export const LAND_SIZE = 6;
export const LAND_PRICE_GOLD = 10;
export const LAND_PRICE_BRONZE_EQUIV = 172_500; // 10 gold = 1,150 silver = 172,500 bronze (150 bronze/silver, 115 silver/gold)

export const LANDS = [
  { id: "L1",  x0: 26, y0: 24, priceGold: LAND_PRICE_GOLD, price: LAND_PRICE_GOLD },
  { id: "L2",  x0: 33, y0: 24, priceGold: LAND_PRICE_GOLD, price: LAND_PRICE_GOLD },
  { id: "L3",  x0: 40, y0: 24, priceGold: LAND_PRICE_GOLD, price: LAND_PRICE_GOLD },
  { id: "L4",  x0: 26, y0: 31, priceGold: LAND_PRICE_GOLD, price: LAND_PRICE_GOLD },
  { id: "L5",  x0: 33, y0: 31, priceGold: LAND_PRICE_GOLD, price: LAND_PRICE_GOLD },
  { id: "L6",  x0: 40, y0: 31, priceGold: LAND_PRICE_GOLD, price: LAND_PRICE_GOLD },
  { id: "L7",  x0: 9,  y0: 24, priceGold: LAND_PRICE_GOLD, price: LAND_PRICE_GOLD },
  { id: "L8",  x0: 16, y0: 24, priceGold: LAND_PRICE_GOLD, price: LAND_PRICE_GOLD },
  { id: "L9",  x0: 9,  y0: 31, priceGold: LAND_PRICE_GOLD, price: LAND_PRICE_GOLD },
  { id: "L10", x0: 16, y0: 31, priceGold: LAND_PRICE_GOLD, price: LAND_PRICE_GOLD }
];
