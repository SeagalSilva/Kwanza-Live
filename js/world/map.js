// Static world layout: tiles, roads, public farm, buildings and private lands.
import { MAP_W, MAP_H } from "../config.js";
import { LANDS, LAND_SIZE } from "../data/lands.js";
import { hash2 } from "../utils.js";

export const T = { GRASS: 0, PATH: 1, WATER: 2, TREE: 3, BUILDING: 4, FENCE: 5, GATE: 6, SOIL: 7 };

export const PUBLIC_FARM = { x0: 14, y0: 12, w: 8, h: 6 };
export const SPAWN = { x: 24, y: 22.5 };

export const BUILDINGS = [
  { id: "workstation", x: 6,  y: 12, w: 6, h: 4, roof: "#e67e22", body: "#f5e6cb" },
  { id: "gameMarket",  x: 27, y: 12, w: 5, h: 4, roof: "#cc092f", body: "#ead9b0" },
  { id: "bazaar",      x: 34, y: 12, w: 7, h: 4, roof: "#2e86de", body: "#efe2c2" }
].map((b) => ({ ...b, front: { x: b.x + Math.floor(b.w / 2) + 0.5, y: b.y + b.h + 0.6 } }));

export const LAND_META = LANDS.map((l) => ({
  ...l,
  gateTiles: [l.x0 + 2, l.x0 + 3],
  sign: { x: l.x0 + 3, y: l.y0 - 0.6 }
}));

export const GRID = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(T.GRASS));
const reserved = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(false));

/** "x_y" → { scope: "public" | landId }   (every farmable tile) */
export const farmIndex = new Map();
/** "x_y" → landId (fence + gate tiles) */
export const fenceIndex = new Map();
/** "x_y" → landId (gate tiles only) */
export const gateIndex = new Map();

const inBounds = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

function fill(x, y, w, h, type) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inBounds(i, j)) GRID[j][i] = type;
}
function reserve(x, y, w, h, pad = 1) {
  for (let j = y - pad; j < y + h + pad; j++) for (let i = x - pad; i < x + w + pad; i++) if (inBounds(i, j)) reserved[j][i] = true;
}

// Roads
fill(2, 20, MAP_W - 4, 2, T.PATH); reserve(2, 20, MAP_W - 4, 2);
fill(23, 2, 2, MAP_H - 4, T.PATH); reserve(23, 2, 2, MAP_H - 4);

// Public farm
{
  const f = PUBLIC_FARM;
  fill(f.x0, f.y0, f.w, f.h, T.SOIL);
  for (let j = f.y0; j < f.y0 + f.h; j++) for (let i = f.x0; i < f.x0 + f.w; i++) farmIndex.set(`${i}_${j}`, { scope: "public" });
  reserve(f.x0, f.y0, f.w, f.h, 2);
  fill(17, f.y0 + f.h, 2, 20 - (f.y0 + f.h), T.PATH);
}

// Buildings + path to the main road
for (const b of BUILDINGS) {
  fill(b.x, b.y, b.w, b.h, T.BUILDING);
  reserve(b.x, b.y, b.w, b.h, 1);
  const col = b.x + Math.floor(b.w / 2);
  fill(col, b.y + b.h, 1, 20 - (b.y + b.h), T.PATH);
}

// Private lands
for (const l of LAND_META) {
  const { x0, y0 } = l;
  for (let j = y0; j < y0 + LAND_SIZE; j++) {
    for (let i = x0; i < x0 + LAND_SIZE; i++) {
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
for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
  const dx = (x - 5) / 3.6, dy = (y - 29) / 5;
  if (dx * dx + dy * dy <= 1) { GRID[y][x] = T.WATER; reserved[y][x] = true; }
}

// Spawn area stays clear
reserve(Math.floor(SPAWN.x) - 2, Math.floor(SPAWN.y) - 2, 5, 5, 0);

// Border forest + scattered trees
for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
  const border = x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2;
  if (border) GRID[y][x] = T.TREE;
  else if (GRID[y][x] === T.GRASS && !reserved[y][x] && hash2(x, y) < 0.05) GRID[y][x] = T.TREE;
}

export const isBlockedStatic = (tx, ty) => {
  if (!inBounds(tx, ty)) return true;
  const g = GRID[ty][tx];
  return g === T.WATER || g === T.TREE || g === T.BUILDING || g === T.FENCE;
};

export const buildingAtTile = (tx, ty) =>
  BUILDINGS.find((b) => tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) || null;

/** Land whose 6x6 footprint contains this tile. */
export const landAtTile = (tx, ty) =>
  LAND_META.find((l) => tx >= l.x0 && tx < l.x0 + LAND_SIZE && ty >= l.y0 && ty < l.y0 + LAND_SIZE) || null;
