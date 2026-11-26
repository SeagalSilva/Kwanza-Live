// Dynamic world layout: tiles, roads, public farm, buildings and private lands.
import { MAP_W, MAP_H } from "../config.js";
import { LANDS, LAND_SIZE, LAND_PRICE_GOLD } from "../data/lands.js";
import { hash2 } from "../utils.js";
import { emit } from "../bus.js";

export const T = { GRASS: 0, PATH: 1, WATER: 2, TREE: 3, BUILDING: 4, FENCE: 5, GATE: 6, SOIL: 7 };

export const mapSize = { w: MAP_W, h: MAP_H };
export const PUBLIC_FARM = { x0: 12, y0: 12, w: 7, h: 6 };
export const SPAWN = { x: 24, y: 22.5 };

export const AD_SIGNS = [
  { id: "sign_center", x: 25, y: 19, labelKey: "ad.signCenter" },
  { id: "sign_west",   x: 11, y: 19, labelKey: "ad.signWest" },
  { id: "sign_east",   x: 31, y: 19, labelKey: "ad.signEast" },
  { id: "sign_north",  x: 25, y: 9,  labelKey: "ad.signNorth" },
  { id: "sign_south",  x: 25, y: 30, labelKey: "ad.signSouth" }
];

const BASE_BUILDINGS = [
  { id: "workstation", x: 6,  y: 12, w: 6, h: 4, roof: "#e67e22", body: "#f5e6cb" },
  { id: "government",  x: 18, y: 4,  w: 6, h: 4, roof: "#8e44ad", body: "#f3e5f5" },
  { id: "gameMarket",  x: 27, y: 12, w: 5, h: 4, roof: "#cc092f", body: "#ead9b0" },
  { id: "bazaar",      x: 34, y: 12, w: 7, h: 4, roof: "#2e86de", body: "#efe2c2" },
  { id: "casino",      x: 30, y: 4,  w: 6, h: 4, roof: "#b81d3a", body: "#2c1e2e" },
  { id: "mines",       x: 6,  y: 4,  w: 6, h: 4, roof: "#4f5d65", body: "#bfc9ca" },
  { id: "postOffice",  x: 38, y: 4,  w: 6, h: 4, roof: "#2980b9", body: "#fef9e7" },
  { id: "dungeon",     x: 42, y: 12, w: 4, h: 4, roof: "#1e5631", body: "#354a3a" }
];

export const BUILDINGS = [];
export const LAND_META = [];
export const GRID = [];
let reserved = [];

/** "x_y" → { scope: "public" | landId }   (every farmable tile) */
export const farmIndex = new Map();
/** "x_y" → landId (fence + gate tiles) */
export const fenceIndex = new Map();
/** "x_y" → landId (gate tiles only) */
export const gateIndex = new Map();

const inBounds = (x, y) => x >= 0 && y >= 0 && x < mapSize.w && y < mapSize.h;

function fill(x, y, w, h, type) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inBounds(i, j)) GRID[j][i] = type;
}

function reserve(x, y, w, h, pad = 1) {
  for (let j = y - pad; j < y + h + pad; j++) for (let i = x - pad; i < x + w + pad; i++) if (inBounds(i, j)) reserved[j][i] = true;
}

function rebuildGrid() {
  const W = mapSize.w, H = mapSize.h;

  GRID.length = 0;
  reserved = [];
  for (let y = 0; y < H; y++) {
    GRID.push(new Array(W).fill(T.GRASS));
    reserved.push(new Array(W).fill(false));
  }

  farmIndex.clear();
  fenceIndex.clear();
  gateIndex.clear();

  // Roads
  fill(2, 20, W - 4, 2, T.PATH); reserve(2, 20, W - 4, 2);
  fill(23, 2, 2, H - 4, T.PATH); reserve(23, 2, 2, H - 4);

  // Public farm
  {
    const f = PUBLIC_FARM;
    fill(f.x0, f.y0, f.w, f.h, T.SOIL);
    for (let j = f.y0; j < f.y0 + f.h; j++) {
      for (let i = f.x0; i < f.x0 + f.w; i++) {
        if (inBounds(i, j)) farmIndex.set(`${i}_${j}`, { scope: "public" });
      }
    }
    reserve(f.x0, f.y0, f.w, f.h, 2);
    const pathX = f.x0 + Math.floor(f.w / 2);
    if (f.y0 + f.h <= 20) {
      fill(pathX, f.y0 + f.h, 2, 20 - (f.y0 + f.h), T.PATH);
    } else if (f.y0 >= 22) {
      fill(pathX, 22, 2, f.y0 - 22, T.PATH);
    }
  }

  // Buildings + path to the main road (paths drawn first so buildings stay intact)
  for (const b of BUILDINGS) {
    const col = b.x + Math.floor(b.w / 2);
    if (b.y + b.h <= 20) {
      fill(col, b.y + b.h, 1, 20 - (b.y + b.h), T.PATH);
    } else if (b.y >= 22) {
      fill(col, b.y - 1, 1, 1, T.PATH);
    }
  }
  for (const b of BUILDINGS) {
    fill(b.x, b.y, b.w, b.h, T.BUILDING);
    reserve(b.x, b.y, b.w, b.h, 1);
  }

  // Private lands
  for (const l of LAND_META) {
    const { x0, y0 } = l;
    for (let j = y0; j < y0 + LAND_SIZE; j++) {
      for (let i = x0; i < x0 + LAND_SIZE; i++) {
        if (!inBounds(i, j)) continue;
        const edge = i === x0 || j === y0 || i === x0 + LAND_SIZE - 1 || j === y0 + LAND_SIZE - 1;
        const key = `${i}_${j}`;
        if (edge) {
          const isGate = j === y0 && l.gateTiles.includes(i);
          GRID[j][i] = isGate ? T.GATE : T.FENCE;
          fenceIndex.set(key, l.id);
          if (isGate) gateIndex.set(key, l.id);
        } else {
          GRID[j][i] = T.SOIL;
          farmIndex.set(key, { scope: l.id });
        }
      }
    }
    reserve(x0, y0, LAND_SIZE, LAND_SIZE, 1);
    fill(l.gateTiles[0], y0 - 1, 2, 1, T.PATH);
    if (y0 === 24) fill(l.gateTiles[0], 22, 2, 2, T.PATH);
  }

  // Pond
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - 5) / 3.6, dy = (y - 29) / 5;
    if (dx * dx + dy * dy <= 1 && GRID[y][x] === T.GRASS) {
      GRID[y][x] = T.WATER;
      reserved[y][x] = true;
    }
  }

  // Spawn area stays clear
  reserve(Math.floor(SPAWN.x) - 2, Math.floor(SPAWN.y) - 2, 5, 5, 0);

  // Roadside billboard signs stay clear of trees
  for (const s of AD_SIGNS) reserve(s.x, s.y, 1, 1, 0);

  // Border forest + scattered trees
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const border = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
    if (border) GRID[y][x] = T.TREE;
    else if (GRID[y][x] === T.GRASS && !reserved[y][x] && hash2(x, y) < 0.05) GRID[y][x] = T.TREE;
  }
}

export function applyMapConfig(mapConfig = null, customLands = []) {
  mapSize.w = Math.max(20, Math.min(200, Number(mapConfig?.width) || MAP_W));
  mapSize.h = Math.max(20, Math.min(200, Number(mapConfig?.height) || MAP_H));

  if (mapConfig?.publicFarm) {
    PUBLIC_FARM.x0 = Number(mapConfig.publicFarm.x0 ?? 12);
    PUBLIC_FARM.y0 = Number(mapConfig.publicFarm.y0 ?? 12);
  } else {
    PUBLIC_FARM.x0 = 12;
    PUBLIC_FARM.y0 = 12;
  }

  const nextBuildings = BASE_BUILDINGS.map((b) => {
    const ov = mapConfig?.buildings?.[b.id];
    const x = ov && typeof ov.x === "number" ? ov.x : b.x;
    const y = ov && typeof ov.y === "number" ? ov.y : b.y;
    return {
      ...b,
      x,
      y,
      front: { x: x + Math.floor(b.w / 2) + 0.5, y: y + b.h + 0.6 }
    };
  });
  BUILDINGS.splice(0, BUILDINGS.length, ...nextBuildings);

  const combinedLands = [...LANDS];
  if (Array.isArray(customLands)) {
    for (const cl of customLands) {
      if (!cl || !cl.id) continue;
      if (!combinedLands.some((l) => l.id === cl.id)) {
        combinedLands.push({
          id: cl.id,
          x0: Number(cl.x0) || 20,
          y0: Number(cl.y0) || 20,
          priceGold: cl.priceGold || LAND_PRICE_GOLD,
          price: cl.priceGold || LAND_PRICE_GOLD
        });
      }
    }
  }

  const nextLands = combinedLands.map((l) => {
    const ov = mapConfig?.lands?.[l.id];
    const x0 = ov && typeof ov.x0 === "number" ? ov.x0 : l.x0;
    const y0 = ov && typeof ov.y0 === "number" ? ov.y0 : l.y0;
    return {
      ...l,
      x0,
      y0,
      gateTiles: [x0 + 2, x0 + 3],
      sign: { x: x0 + 3, y: y0 - 0.6 }
    };
  });
  LAND_META.splice(0, LAND_META.length, ...nextLands);

  rebuildGrid();
  emit("mapUpdated");
}

// Initial build
applyMapConfig();

export const isBlockedStatic = (tx, ty) => {
  if (!inBounds(tx, ty)) return true;
  const g = GRID[ty][tx];
  if (g === T.WATER || g === T.TREE || g === T.BUILDING || g === T.FENCE) return true;
  if (g === T.GRASS && AD_SIGNS.some((s) => s.x === tx && s.y === ty)) return true;
  return false;
};

export const adSignAtTile = (tx, ty) =>
  AD_SIGNS.find((s) => s.x === tx && s.y === ty && GRID[ty]?.[tx] === T.GRASS) || null;

export const buildingAtTile = (tx, ty) =>
  BUILDINGS.find((b) => tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) || null;

/** Land whose 6x6 footprint contains this tile. */
export const landAtTile = (tx, ty) =>
  LAND_META.find((l) => tx >= l.x0 && tx < l.x0 + LAND_SIZE && ty >= l.y0 && ty < l.y0 + LAND_SIZE) || null;
