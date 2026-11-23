// Canvas renderer: ground, farms, lands, buildings, trees and characters.
import { TILE } from "../config.js";
import { S } from "../state.js";
import { t, fmtNum } from "../i18n.js";
import { mapSize, GRID, T, PUBLIC_FARM, BUILDINGS, LAND_META, fenceIndex, farmIndex } from "./map.js";
import { LAND_SIZE } from "../data/lands.js";
import { CROPS } from "../data/crops.js";
import { cropState, tileData } from "../systems/farming.js";
import { sanitizeLook } from "../data/character.js";
import { drawCharacter } from "./character.js";
import { renderCasinoRoom } from "./casinoRoom.js";
import { renderMinesRoom } from "./minesRoom.js";
import { renderDungeonRoom } from "./dungeonRoom.js";
import { drawLandFloor, drawLandFenceDecor, pushLandEntities } from "./landVisuals.js";
import { hash2, colorFromString } from "../utils.js";

export const view = { cw: 0, ch: 0, zoom: 1, dpr: 1, camX: 0, camY: 0 };

const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const UI_FONT = "system-ui,-apple-system,Segoe UI,Roboto,sans-serif";

export function resize(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  const tilesAcross = cw < 560 ? 13 : cw < 1000 ? 18 : 24;
  Object.assign(view, { cw, ch, dpr, zoom: cw / (tilesAcross * TILE) });
}

/** Screen pixel → world tile coordinates (floats). */
export const screenToWorld = (px, py) => ({
  x: (px / view.zoom + view.camX) / TILE,
  y: (py / view.zoom + view.camY) / TILE
});

// ── small drawing helpers ────────────────────────────────────
function emoji(ctx, ch, x, y, size) {
  ctx.font = `${size}px ${EMOJI}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(ch, x, y);
}

function pill(ctx, text, x, y, { bg = "rgba(10,18,14,.72)", fg = "#fff", size = 11, border = null } = {}) {
  ctx.font = `600 ${size}px ${UI_FONT}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 12, h = size + 7;
  ctx.fillStyle = bg;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); else ctx.rect(x - w / 2, y - h / 2, w, h);
  ctx.fill();
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1.5; ctx.stroke(); }
  ctx.fillStyle = fg;
  ctx.fillText(text, x, y + 0.5);
}

export function drawSpeechBubble(ctx, text, cx, bottomY, alpha = 1) {
  if (!text || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.font = `600 11px ${UI_FONT}`;

  const maxW = 150;
  const words = text.split(" ");
  const lines = [];
  let curLine = "";
  for (const w of words) {
    const testLine = curLine ? `${curLine} ${w}` : w;
    if (ctx.measureText(testLine).width > maxW && curLine) {
      lines.push(curLine);
      curLine = w;
      if (lines.length >= 2) break;
    } else {
      curLine = testLine;
    }
  }
  if (curLine && lines.length < 3) lines.push(curLine);

  let textW = 0;
  for (const line of lines) {
    textW = Math.max(textW, ctx.measureText(line).width);
  }
  const padX = 9, padY = 5, lineH = 14;
  const bubbleW = Math.max(34, textW + padX * 2);
  const bubbleH = lines.length * lineH + padY * 2;
  const bubbleX = cx - bubbleW / 2;
  const bubbleY = bottomY - bubbleH - 6;

  // Bubble shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bubbleX + 1, bubbleY + 2, bubbleW, bubbleH, 8);
  else ctx.rect(bubbleX + 1, bubbleY + 2, bubbleW, bubbleH);
  ctx.fill();

  // Bubble body
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 8);
  else ctx.rect(bubbleX, bubbleY, bubbleW, bubbleH);
  ctx.fill();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Pointer
  ctx.beginPath();
  ctx.moveTo(cx - 5, bubbleY + bubbleH);
  ctx.lineTo(cx, bottomY);
  ctx.lineTo(cx + 5, bubbleY + bubbleH);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.stroke();

  // Clean boundary over pointer
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(cx - 4, bubbleY + bubbleH - 1, 8, 2);

  // Text
  ctx.fillStyle = "#121b15";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < lines.length; i++) {
    const ly = bubbleY + padY + i * lineH + lineH / 2;
    ctx.fillText(lines[i], cx, ly);
  }

  ctx.restore();
}

const fenceColor = (landId) => {
  const l = S.lands[landId];
  if (!l) return "#a8824a";
  return l.owner === S.uid ? "#f5c518" : "#d9534f";
};

// ── ground ───────────────────────────────────────────────────
function drawGround(ctx, tx, ty, time) {
  const x = tx * TILE, y = ty * TILE, g = GRID[ty][tx];
  if (g === T.PATH) {
    ctx.fillStyle = (tx + ty) % 2 ? "#c8a56b" : "#c2a064";
    ctx.fillRect(x, y, TILE, TILE);
    if (hash2(tx, ty) < 0.4) { ctx.fillStyle = "rgba(0,0,0,.08)"; ctx.fillRect(x + 6 + hash2(ty, tx) * 16, y + 8 + hash2(tx, tx) * 14, 3, 2); }
  } else if (g === T.WATER) {
    ctx.fillStyle = "#3a7fc1"; ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = "rgba(255,255,255,.2)";
    const o = (Math.sin(time * 2 + tx * 0.9 + ty * 0.5) + 1) * 4;
    ctx.fillRect(x + 4 + o, y + 10, 10, 2); ctx.fillRect(x + 14 - o * 0.5, y + 22, 9, 2);
  } else if (g === T.SOIL) {
    ctx.fillStyle = "#6a4627"; ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = "#583a1f";
    for (let i = 0; i < 4; i++) ctx.fillRect(x + 2, y + 5 + i * 7, TILE - 4, 2);
    ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
  } else {
    ctx.fillStyle = (tx + ty) % 2 ? "#5da34f" : "#5a9c4c";
    ctx.fillRect(x, y, TILE, TILE);
    const h = hash2(tx * 7, ty * 13);
    if (h < 0.08) {
      ctx.strokeStyle = "#3f7d36"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + 10, y + 22); ctx.lineTo(x + 12, y + 14); ctx.moveTo(x + 14, y + 22); ctx.lineTo(x + 16, y + 15); ctx.stroke();
    } else if (h < 0.12) {
      ctx.fillStyle = ["#fff", "#ffd93d", "#ff9ecb"][Math.floor(h * 100) % 3];
      ctx.beginPath(); ctx.arc(x + 8 + hash2(tx, ty) * 16, y + 8 + hash2(ty, tx) * 16, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawFence(ctx, tx, ty) {
  const key = `${tx}_${ty}`, id = fenceIndex.get(key);
  const x = tx * TILE, y = ty * TILE, cx = x + TILE / 2, cy = y + TILE / 2;
  const col = fenceColor(id);
  const land = S.lands[id];
  const closed = GRID[ty][tx] === T.GATE && land && land.owner !== S.uid;

  ctx.fillStyle = col;
  if (GRID[ty][tx] === T.GATE && !closed) {
    ctx.fillRect(x + 3, y + 8, 4, 20); ctx.fillRect(x + TILE - 7, y + 8, 4, 20);
    return;
  }
  const nb = (dx, dy) => fenceIndex.get(`${tx + dx}_${ty + dy}`) === id;
  const rail = (rx, ry, w, h) => { ctx.fillStyle = col; ctx.fillRect(rx, ry, w, h); };
  if (nb(-1, 0) || closed) { rail(x, cy - 7, TILE / 2, 3); rail(x, cy + 3, TILE / 2, 3); }
  if (nb(1, 0) || closed) { rail(cx, cy - 7, TILE / 2, 3); rail(cx, cy + 3, TILE / 2, 3); }
  if (nb(0, -1)) { rail(cx - 7, y, 3, TILE / 2); rail(cx + 4, y, 3, TILE / 2); }
  if (nb(0, 1)) { rail(cx - 7, cy, 3, TILE / 2); rail(cx + 4, cy, 3, TILE / 2); }
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(cx - 3, y + 6, 7, 22);
  ctx.fillStyle = col; ctx.fillRect(cx - 3, y + 5, 6, 21);
}

// ── crops ────────────────────────────────────────────────────
function drawCrop(ctx, tx, ty, scope, key, time) {
  const tile = tileData(scope, key);
  if (!tile) return;
  const st = cropState(tile);
  const x = tx * TILE, y = ty * TILE, cx = x + TILE / 2, cy = y + TILE / 2;
  const mine = tile.by === S.uid;

  if (st.stage === "growing") {
    emoji(ctx, st.progress < 0.5 ? "🌱" : "🌿", cx, cy + 1, st.progress < 0.5 ? 15 : 20);
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(x + 5, y + TILE - 7, TILE - 10, 4);
    ctx.fillStyle = "#59d17a"; ctx.fillRect(x + 5, y + TILE - 7, (TILE - 10) * st.progress, 4);
  } else if (st.stage === "ripe") {
    const bob = Math.sin(time * 4 + tx) * 1.5;
    if (mine) { ctx.strokeStyle = `rgba(245,197,24,${0.5 + Math.sin(time * 5) * 0.3})`; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4); }
    emoji(ctx, CROPS[tile.crop].emoji, cx, cy + bob, 22);
    if (mine) emoji(ctx, "✨", x + TILE - 7, y + 8 + bob, 9);
  } else if (st.stage === "withered") {
    emoji(ctx, "🥀", cx, cy, 18);
  }
  // owner marker (public farm only)
  if (scope === "public" && tile.by) {
    ctx.fillStyle = mine ? "#f5c518" : colorFromString(tile.by);
    ctx.beginPath(); ctx.arc(x + 5, y + 5, 2.6, 0, Math.PI * 2); ctx.fill();
  }
}

// ── buildings & trees ────────────────────────────────────────
function drawMineBuilding(ctx, b) {
  const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x + 4, y + h - 4, w, 8);

  // Rocky mountain mound background
  ctx.fillStyle = "#3e4a54";
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + 8, y + TILE * 0.8);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x + w - 8, y + TILE * 0.8);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();

  // Stone face texture
  ctx.fillStyle = "#2c3e50";
  ctx.fillRect(x + 6, y + TILE * 1.2, w - 12, h - TILE * 1.2);

  // Wooden tunnel support frame (Timber archway)
  ctx.fillStyle = "#5c3a21";
  ctx.fillRect(x + TILE * 1.2, y + TILE * 1.2, 10, h - TILE * 1.2);
  ctx.fillRect(x + w - TILE * 1.2 - 10, y + TILE * 1.2, 10, h - TILE * 1.2);
  ctx.fillRect(x + TILE * 1.0, y + TILE * 1.0, w - TILE * 2.0, 12);

  // Dark cavern entrance (tunnel opening)
  ctx.fillStyle = "#11161d";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x + TILE * 1.6, y + TILE * 1.6, w - TILE * 3.2, h - TILE * 1.6, [20, 20, 0, 0]);
  else ctx.rect(x + TILE * 1.6, y + TILE * 1.6, w - TILE * 3.2, h - TILE * 1.6);
  ctx.fill();

  // Glowing ore crystals on rock face (cyan & purple)
  ctx.fillStyle = "#00e5ff";
  ctx.beginPath();
  ctx.arc(x + 16, y + TILE * 2.2, 3, 0, Math.PI * 2);
  ctx.arc(x + w - 18, y + TILE * 2.5, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d500f9";
  ctx.beginPath();
  ctx.arc(x + 24, y + TILE * 3.2, 3, 0, Math.PI * 2);
  ctx.fill();

  // Wooden sign "MINAS" above entrance
  ctx.fillStyle = "#4a2e17";
  ctx.fillRect(x + w / 2 - 34, y + 6, 68, 18);
  ctx.strokeStyle = "#f5c518";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + w / 2 - 34, y + 6, 68, 18);
  ctx.fillStyle = "#f5c518";
  ctx.font = `700 9px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⛏️ MINAS", x + w / 2, y + 15);
}

function drawDungeonBuilding(ctx, b) {
  const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.fillRect(x + 4, y + h - 4, w, 8);

  // Ancient mossy stone sanctuary facade
  ctx.fillStyle = "#2d3b32";
  ctx.beginPath();
  ctx.moveTo(x + 2, y + h);
  ctx.lineTo(x + 6, y + TILE * 0.7);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x + w - 6, y + TILE * 0.7);
  ctx.lineTo(x + w - 2, y + h);
  ctx.closePath();
  ctx.fill();

  // Stone block inner frame
  ctx.fillStyle = "#3c4e42";
  ctx.fillRect(x + 10, y + TILE * 1.15, w - 20, h - TILE * 1.15);

  // Overgrown forest vines & moss on top
  ctx.fillStyle = "#2e7d32";
  ctx.beginPath();
  ctx.arc(x + 16, y + TILE * 1.1, 14, 0, Math.PI * 2);
  ctx.arc(x + w / 2, y + TILE * 0.85, 18, 0, Math.PI * 2);
  ctx.arc(x + w - 16, y + TILE * 1.1, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#43a047";
  ctx.beginPath();
  ctx.arc(x + w / 2 - 8, y + TILE * 0.8, 10, 0, Math.PI * 2);
  ctx.fill();

  // Glowing emerald dungeon portal archway
  ctx.fillStyle = "#0b1710";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x + TILE * 1.1, y + TILE * 1.65, w - TILE * 2.2, h - TILE * 1.65, [18, 18, 0, 0]);
  else ctx.rect(x + TILE * 1.1, y + TILE * 1.65, w - TILE * 2.2, h - TILE * 1.65);
  ctx.fill();

  ctx.fillStyle = "rgba(89, 209, 122, 0.35)";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x + TILE * 1.25, y + TILE * 1.85, w - TILE * 2.5, h - TILE * 1.85, [14, 14, 0, 0]);
  else ctx.rect(x + TILE * 1.25, y + TILE * 1.85, w - TILE * 2.5, h - TILE * 1.85);
  ctx.fill();

  // Twin flickering torches beside doorway
  ctx.fillStyle = "#ff9800";
  ctx.beginPath();
  ctx.arc(x + TILE * 0.75, y + TILE * 2.6, 4, 0, Math.PI * 2);
  ctx.arc(x + w - TILE * 0.75, y + TILE * 2.6, 4, 0, Math.PI * 2);
  ctx.fill();

  // Crest sign
  ctx.fillStyle = "#1a2b20";
  ctx.fillRect(x + w / 2 - 34, y + 8, 68, 17);
  ctx.strokeStyle = "#59d17a";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + w / 2 - 34, y + 8, 68, 17);
  ctx.fillStyle = "#d4ffdf";
  ctx.font = "700 9px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🌲 DUNGEON", x + w / 2, y + 16.5);
}

function drawBuilding(ctx, b) {
  if (b.id === "mines") {
    return drawMineBuilding(ctx, b);
  }
  if (b.id === "dungeon") {
    return drawDungeonBuilding(ctx, b);
  }
  const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
  ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(x + 4, y + h - 4, w, 8);
  ctx.fillStyle = b.body; ctx.fillRect(x, y + TILE * 1.1, w, h - TILE * 1.1);
  ctx.fillStyle = "rgba(0,0,0,.1)"; ctx.fillRect(x, y + h - 6, w, 6);
  // roof
  ctx.fillStyle = b.roof;
  ctx.beginPath(); ctx.moveTo(x - 8, y + TILE * 1.4); ctx.lineTo(x + 12, y); ctx.lineTo(x + w - 12, y); ctx.lineTo(x + w + 8, y + TILE * 1.4); ctx.closePath(); ctx.fill();
  // awning stripes
  for (let i = 0; i < b.w * 2; i++) {
    ctx.fillStyle = i % 2 ? "#fff" : b.roof;
    ctx.fillRect(x + i * (TILE / 2), y + TILE * 1.4, TILE / 2, 10);
  }
  // door
  const dx = (b.front.x - 0.5) * TILE;
  ctx.fillStyle = "#4a2e17"; ctx.fillRect(dx + 4, y + h - 26, TILE - 8, 26);
  ctx.fillStyle = "#f5c518"; ctx.fillRect(dx + TILE - 10, y + h - 14, 3, 3);
  // windows
  ctx.fillStyle = "#9ed0f0";
  for (let i = 0; i < b.w; i++) {
    if (Math.abs(i + 0.5 - b.w / 2) < 1.2) continue;
    ctx.fillRect(x + i * TILE + 7, y + TILE * 2.3, TILE - 14, 16);
  }

  // Post Office specific mailbox pillar on front wall
  if (b.id === "postOffice") {
    const pbx = x + 10, pby = y + h - 24;
    // Red mailbox pillar
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(pbx, pby, 16, 24);
    // Gold mail slot
    ctx.fillStyle = "#f39c12";
    ctx.fillRect(pbx + 3, pby + 4, 10, 3);
    // Envelope icon
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(pbx + 4, pby + 11, 8, 6);
  }
}

function drawTree(ctx, tx, ty) {
  const x = tx * TILE + TILE / 2, y = (ty + 1) * TILE;
  const v = hash2(tx, ty);
  ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(x, y - 2, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#6b4423"; ctx.fillRect(x - 3, y - 16, 6, 16);
  const g1 = v < 0.5 ? "#2f7d32" : "#388e3c", g2 = v < 0.5 ? "#3d9a41" : "#43a047";
  ctx.fillStyle = g1; ctx.beginPath(); ctx.arc(x, y - 26, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x - 4, y - 30, 8, 0, Math.PI * 2); ctx.fill();
}

// ── main render ──────────────────────────────────────────────
/**
 * g = { me, others: [{p, id}], focus, time }
 */
export function render(ctx, g) {
  if (S.room === "casino") {
    return renderCasinoRoom(ctx, view, g, {
      sanitizeLook,
      myLook: sanitizeLook(S.profile?.look)
    });
  }
  if (S.room === "mines") {
    return renderMinesRoom(ctx, view, g, {
      sanitizeLook,
      myLook: sanitizeLook(S.profile?.look)
    });
  }
  if (S.room === "dungeon") {
    return renderDungeonRoom(ctx, view, g, {
      sanitizeLook,
      myLook: sanitizeLook(S.profile?.look)
    });
  }

  const { cw, ch, zoom, dpr } = view;
  const vw = cw / zoom, vh = ch / zoom, worldW = mapSize.w * TILE, worldH = mapSize.h * TILE;
  let cx = g.me.x * TILE - vw / 2, cy = g.me.y * TILE - vh / 2;
  cx = worldW <= vw ? (worldW - vw) / 2 : Math.max(0, Math.min(worldW - vw, cx));
  cy = worldH <= vh ? (worldH - vh) / 2 : Math.max(0, Math.min(worldH - vh, cy));
  view.camX = cx; view.camY = cy;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#0e1712"; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const s = dpr * zoom;
  ctx.setTransform(s, 0, 0, s, -cx * s, -cy * s);

  const x0 = Math.max(0, Math.floor(cx / TILE)), x1 = Math.min(mapSize.w - 1, Math.ceil((cx + vw) / TILE));
  const y0 = Math.max(0, Math.floor(cy / TILE)), y1 = Math.min(mapSize.h - 1, Math.ceil((cy + vh) / TILE));
  const entities = [];

  const visibleLands = [];
  for (const l of LAND_META) {
    if (l.x0 > x1 + 1 || l.x0 + LAND_SIZE < x0 - 1 || l.y0 > y1 + 1 || l.y0 + LAND_SIZE < y0 - 1) continue;
    const owner = S.lands[l.id];
    const op = S.landOps?.[l.id];
    const mode = owner ? (op?.mode || owner.mode || "farm") : "farm";
    visibleLands.push({ l, owner, op, mode });
  }

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      drawGround(ctx, tx, ty, g.time);
    }
  }

  // Custom interior floor for non-farm private lands (pasture, market courtyard, luck plaza)
  for (const { l, mode } of visibleLands) {
    drawLandFloor(ctx, l, mode, g.time);
  }

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const type = GRID[ty][tx];
      if (type === T.FENCE || type === T.GATE) drawFence(ctx, tx, ty);
      if (type === T.TREE) entities.push({ y: (ty + 1) * TILE, draw: () => drawTree(ctx, tx, ty) });
    }
  }

  for (const { l, mode } of visibleLands) {
    drawLandFenceDecor(ctx, l, mode, g.time);
    pushLandEntities(entities, ctx, l, mode, S.landOps?.[l.id], g.time);
  }

  // crops
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const f = farmIndex.get(`${tx}_${ty}`);
    if (f) {
      if (f.scope !== "public") {
        const lMode = S.landOps?.[f.scope]?.mode || S.lands?.[f.scope]?.mode || "farm";
        if (lMode !== "farm") continue;
      }
      drawCrop(ctx, tx, ty, f.scope, `${tx}_${ty}`, g.time);
    }
  }

  // focus highlight
  if (g.focus?.kind === "tile") {
    ctx.strokeStyle = `rgba(255,255,255,${0.6 + Math.sin(g.time * 6) * 0.3})`;
    ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.strokeRect(g.focus.tx * TILE + 1, g.focus.ty * TILE + 1, TILE - 2, TILE - 2);
    ctx.setLineDash([]);
  }

  for (const b of BUILDINGS) entities.push({ y: (b.y + b.h) * TILE, draw: () => drawBuilding(ctx, b) });

  const look = sanitizeLook(S.profile?.look);
  for (const o of g.others) {
    entities.push({
      y: o.p.dy * TILE,
      draw: () => drawCharacter(ctx, o.p.dx * TILE, o.p.dy * TILE, o.p.look, { dir: o.p.d || "down", phase: o.p.phase, moving: !!o.p.m })
    });
  }
  entities.push({
    y: g.me.y * TILE,
    draw: () => drawCharacter(ctx, g.me.x * TILE, g.me.y * TILE, look, { dir: g.me.dir, phase: g.me.phase, moving: g.me.moving })
  });

  entities.sort((a, b) => a.y - b.y).forEach((e) => e.draw());

  // ── labels (drawn on top) ──
  const f = PUBLIC_FARM;
  pill(ctx, `🌾 ${t("place.publicFarm")}`, (f.x0 + f.w / 2) * TILE, (f.y0 - 0.45) * TILE, { size: 12, border: "#59d17a" });
  for (const b of BUILDINGS) {
    const icon = b.id === "gameMarket" ? "🏪" : b.id === "bazaar" ? "🧺" : b.id === "government" ? "🏛️" : b.id === "casino" ? "🎰" : b.id === "mines" ? "⛏️" : b.id === "postOffice" ? "📮" : b.id === "dungeon" ? "🌲" : "🔨";
    pill(ctx, `${icon} ${t(`place.${b.id}`)}`, (b.x + b.w / 2) * TILE, (b.y - 0.35) * TILE, { size: 12, border: b.id === "dungeon" ? "#59d17a" : "#f5c518" });
  }
  for (const l of LAND_META) {
    if (l.x0 > x1 + 1 || l.x0 + LAND_SIZE < x0 - 1 || l.y0 > y1 + 1 || l.y0 + LAND_SIZE < y0 - 1) continue;
    const owner = S.lands[l.id];
    const opMode = S.landOps?.[l.id]?.mode || owner?.mode;
    const modeIcon = opMode === "animals" ? "🐄" : opMode === "bulkShop" ? "🏪" : opMode === "luckShop" ? "🎲" : "👑";
    const text = owner ? `${modeIcon} ${owner.ownerName}` : `🏷️ 10 🥇`;
    pill(ctx, text, (l.x0 + LAND_SIZE / 2) * TILE, (l.y0 - 0.4) * TILE, {
      size: 10, border: owner ? (owner.owner === S.uid ? "#f5c518" : "#d9534f") : null
    });
  }

  // ── admin map edit overlays ──
  if (S.mapEditMode) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    const drawEditable = (rx, ry, rw, rh, col = "rgba(89, 209, 122, 0.85)") => {
      ctx.strokeStyle = col;
      ctx.strokeRect(rx * TILE + 1, ry * TILE + 1, rw * TILE - 2, rh * TILE - 2);
    };
    drawEditable(f.x0, f.y0, f.w, f.h, "rgba(89, 209, 122, 0.9)");
    for (const b of BUILDINGS) drawEditable(b.x, b.y, b.w, b.h, "rgba(245, 197, 24, 0.85)");
    for (const l of LAND_META) {
      if (l.x0 > x1 + 1 || l.x0 + LAND_SIZE < x0 - 1 || l.y0 > y1 + 1 || l.y0 + LAND_SIZE < y0 - 1) continue;
      drawEditable(l.x0, l.y0, LAND_SIZE, LAND_SIZE, "rgba(110, 195, 255, 0.85)");
    }
    ctx.restore();
  }

  // ── active drag preview ──
  if (g.drag) {
    const d = g.drag;
    const dx = d.curX * TILE, dy = d.curY * TILE, dw = d.w * TILE, dh = d.h * TILE;
    ctx.save();
    ctx.fillStyle = "rgba(245, 197, 24, 0.28)";
    ctx.fillRect(dx, dy, dw, dh);
    ctx.strokeStyle = "#f5c518";
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 4]);
    ctx.strokeRect(dx + 1.5, dy + 1.5, dw - 3, dh - 3);
    ctx.setLineDash([]);
    ctx.restore();
    pill(ctx, `✥ ${d.label} (${d.curX}, ${d.curY})`, dx + dw / 2, dy - 16, {
      bg: "#f5c518", fg: "#1b1500", size: 12, border: "#1b1500"
    });
  }
  for (const o of g.others) pill(ctx, o.p.name || "?", o.p.dx * TILE, o.p.dy * TILE - 46, { size: 10 });
  pill(ctx, S.profile?.username || "", g.me.x * TILE, g.me.y * TILE - 46, { size: 11, border: "#f5c518" });

  // ── speech bubbles (above name tag) ──
  const nowTime = Date.now();
  if (S.chat?.bubbles) {
    for (const o of g.others) {
      const b = S.chat.bubbles.get(o.id);
      if (b && b.expiresAt > nowTime) {
        const remaining = b.expiresAt - nowTime;
        const alpha = remaining < 1000 ? remaining / 1000 : 1;
        drawSpeechBubble(ctx, b.text, o.p.dx * TILE, o.p.dy * TILE - 54, alpha);
      }
    }
    const myBubble = S.chat.bubbles.get(S.uid);
    if (myBubble && myBubble.expiresAt > nowTime) {
      const remaining = myBubble.expiresAt - nowTime;
      const alpha = remaining < 1000 ? remaining / 1000 : 1;
      drawSpeechBubble(ctx, myBubble.text, g.me.x * TILE, g.me.y * TILE - 54, alpha);
    }
  }
}
