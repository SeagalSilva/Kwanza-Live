// Visual rendering for private land modes: farm, animals, bulkShop (barraca), and luckShop (barraca da sorte).
import { TILE } from "../config.js";
import { LAND_SIZE } from "../data/lands.js";
import { itemIcon } from "../data/items.js";
import { ANIMAL_TYPES } from "../systems/lands.js";
import { hash2 } from "../utils.js";

const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const UI_FONT = "system-ui,-apple-system,Segoe UI,Roboto,sans-serif";

function drawEmoji(ctx, ch, x, y, size) {
  ctx.font = `${size}px ${EMOJI}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ch, x, y);
}

/**
 * Draw interior floor replacement (4x4 tiles) for non-farm land modes.
 * Runs after drawGround and before drawFence / entities.
 */
export function drawLandFloor(ctx, l, mode, time) {
  if (!mode || mode === "farm") return;

  const ix = (l.x0 + 1) * TILE;
  const iy = (l.y0 + 1) * TILE;
  const iw = (LAND_SIZE - 2) * TILE; // 4 * TILE = 128px
  const ih = (LAND_SIZE - 2) * TILE;

  ctx.save();
  if (mode === "animals") {
    // Lush meadow grass tiles
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        const tx = ix + dx * TILE;
        const ty = iy + dy * TILE;
        ctx.fillStyle = (dx + dy) % 2 ? "#65b152" : "#5ca54b";
        ctx.fillRect(tx, ty, TILE, TILE);
        const h = hash2(l.x0 + dx, l.y0 + dy);
        if (h < 0.35) {
          ctx.fillStyle = "#488c3a";
          ctx.fillRect(tx + 6 + h * 30, ty + 18, 2, 5);
          ctx.fillRect(tx + 10 + h * 30, ty + 17, 2, 6);
        } else if (h > 0.72) {
          ctx.fillStyle = "#ffe066";
          ctx.beginPath();
          ctx.arc(tx + 10 + (h - 0.7) * 45, ty + 12, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Worn dirt patch near gate entrance and barn corner
    ctx.fillStyle = "rgba(154, 114, 72, 0.45)";
    ctx.beginPath();
    ctx.ellipse(ix + 2 * TILE, iy + 8, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Small wooden water trough on top-right pasture
    const trx = ix + 2.75 * TILE;
    const tryy = iy + 0.32 * TILE;
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(trx + 1, tryy + 12, 30, 5);
    ctx.fillStyle = "#6e4726";
    ctx.fillRect(trx, tryy, 30, 14);
    ctx.fillStyle = "#3f8cd1";
    ctx.fillRect(trx + 3, tryy + 3, 24, 8);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    const rOff = (Math.sin(time * 2.5 + l.x0) + 1) * 4;
    ctx.fillRect(trx + 5 + rOff, tryy + 5, 8, 2);

    // Golden hay bale beside trough
    const hx = ix + 2.05 * TILE;
    const hy = iy + 0.28 * TILE;
    ctx.fillStyle = "#d9a938";
    ctx.fillRect(hx, hy, 18, 13);
    ctx.fillStyle = "#f2ca52";
    ctx.fillRect(hx + 1, hy + 1, 16, 7);
    ctx.fillStyle = "#96611b";
    ctx.fillRect(hx + 5, hy, 2, 13);
    ctx.fillRect(hx + 12, hy, 2, 13);
  } else if (mode === "bulkShop") {
    // Market cobblestone courtyard
    ctx.fillStyle = "#8e7350";
    ctx.fillRect(ix, iy, iw, ih);
    const cell = TILE / 2;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = (r + c) % 2 ? "#d6c5a5" : "#c6b390";
        ctx.fillRect(ix + c * cell + 1, iy + r * cell + 1, cell - 2, cell - 2);
      }
    }
    // Emerald & gold welcome mat leading in from the top gate
    ctx.fillStyle = "#196f49";
    ctx.fillRect(ix + TILE * 1.25, iy + 2, TILE * 1.5, 18);
    ctx.strokeStyle = "#f5c518";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ix + TILE * 1.25 + 1.5, iy + 3.5, TILE * 1.5 - 3, 15);
  } else if (mode === "luckShop") {
    // Festive purple & gold star-plaza floor
    ctx.fillStyle = "#2b193d";
    ctx.fillRect(ix, iy, iw, ih);
    const cell = TILE / 2;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = (r + c) % 2 ? "#4b2c6b" : "#3a2154";
        ctx.fillRect(ix + c * cell + 1, iy + r * cell + 1, cell - 2, cell - 2);
      }
    }
    // Gold plaza border
    ctx.strokeStyle = "#f5c518";
    ctx.lineWidth = 2;
    ctx.strokeRect(ix + 1.5, iy + 1.5, iw - 3, ih - 3);
    // Crimson-gold VIP carpet runner from top gate
    ctx.fillStyle = "#9e1c40";
    ctx.fillRect(ix + TILE * 1.35, iy + 2, TILE * 1.3, 22);
    ctx.fillStyle = "#f5c518";
    ctx.fillRect(ix + TILE * 1.35, iy + 2, 2, 22);
    ctx.fillRect(ix + TILE * 2.65 - 2, iy + 2, 2, 22);
  }
  ctx.restore();
}

/**
 * Draw decorative pennants / fairy lights on the front fence of shops & ranches.
 */
export function drawLandFenceDecor(ctx, l, mode, time) {
  if (!mode || mode === "farm") return;
  const x = l.x0 * TILE;
  const y = l.y0 * TILE;
  const w = LAND_SIZE * TILE;

  ctx.save();
  if (mode === "bulkShop") {
    // Market bunting flags on left and right top fence rails
    const colors = ["#1f8a5b", "#f5c518", "#fff5db", "#e67e22"];
    for (let side = 0; side < 2; side++) {
      const startX = side === 0 ? x + 10 : x + 4 * TILE + 6;
      for (let i = 0; i < 4; i++) {
        const fx = startX + i * 12;
        const fy = y + 14;
        ctx.fillStyle = colors[(i + side) % colors.length];
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + 10, fy);
        ctx.lineTo(fx + 5, fy + 8);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Warm lanterns on gate posts
    const glow = 0.65 + Math.sin(time * 4 + l.x0) * 0.2;
    ctx.fillStyle = `rgba(255, 210, 90, ${glow})`;
    ctx.beginPath();
    ctx.arc(x + 2 * TILE + 5, y + 7, 4, 0, Math.PI * 2);
    ctx.arc(x + 4 * TILE - 5, y + 7, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (mode === "luckShop") {
    // Twinkling carnival marquee bulbs along the front fence
    const bulbs = [0.5, 1.5, 2.15, 3.85, 4.5, 5.5];
    bulbs.forEach((bx, idx) => {
      const pulse = (Math.sin(time * 5 + idx * 1.4 + l.x0) + 1) * 0.5;
      ctx.fillStyle = idx % 2 === 0
        ? `rgba(245, 197, 24, ${0.5 + pulse * 0.5})`
        : `rgba(224, 86, 253, ${0.5 + (1 - pulse) * 0.5})`;
      ctx.beginPath();
      ctx.arc(x + bx * TILE, y + 6, 3.5 + pulse * 1.2, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (mode === "animals") {
    // Golden hay tufts at bottom fence corners
    ctx.fillStyle = "#e3b63d";
    ctx.fillRect(x + 6, y + w - 18, 10, 5);
    ctx.fillRect(x + w - 16, y + w - 18, 10, 5);
  }
  ctx.restore();
}

function drawAnimalSprite(ctx, type, cx, cy, flip, ready, bob) {
  ctx.save();
  ctx.translate(cx, cy + bob);

  // Soft shadow
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(0, 6 - bob * 0.5, type === "cow" ? 11 : 7, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.scale(flip ? -1 : 1, 1);

  if (type === "chicken") {
    ctx.fillStyle = "#fff9e8";
    ctx.beginPath();
    ctx.ellipse(0, 0, 6.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(4, -5, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // Red comb & orange beak
    ctx.fillStyle = "#d93829";
    ctx.fillRect(2.5, -9.5, 3, 2.5);
    ctx.fillStyle = "#f39c12";
    ctx.beginPath();
    ctx.moveTo(7, -5.5);
    ctx.lineTo(10, -4.5);
    ctx.lineTo(7, -3.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#1b1b1b";
    ctx.fillRect(5, -6, 1.3, 1.3);
  } else if (type === "goat") {
    // Legs
    ctx.fillStyle = "#8a6845";
    ctx.fillRect(-5, 2, 2, 5);
    ctx.fillRect(3, 2, 2, 5);
    // Body
    ctx.fillStyle = "#d8c3a5";
    ctx.fillRect(-7, -4, 14, 7);
    // Head & horns
    ctx.fillStyle = "#cbb08c";
    ctx.fillRect(4, -9, 6, 6);
    ctx.fillStyle = "#5c4328";
    ctx.fillRect(4, -12, 1.5, 3);
    ctx.fillRect(7, -12, 1.5, 3);
    ctx.fillStyle = "#1b1b1b";
    ctx.fillRect(7.5, -7.5, 1.5, 1.5);
  } else {
    // Cow: legs
    ctx.fillStyle = "#dcdcdc";
    ctx.fillRect(-8, 2, 2.5, 6);
    ctx.fillRect(5, 2, 2.5, 6);
    // Body + spots
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-10, -6, 20, 10);
    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(-6, -5, 5, 5);
    ctx.fillRect(2, -3, 4, 4);
    // Head + muzzle + horns
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(6, -11, 8, 8);
    ctx.fillStyle = "#f5b0b0";
    ctx.fillRect(9, -6, 6, 4);
    ctx.fillStyle = "#d9c29c";
    ctx.fillRect(6, -13, 2, 2.5);
    ctx.fillRect(11, -13, 2, 2.5);
    ctx.fillStyle = "#1b1b1b";
    ctx.fillRect(10.5, -9.5, 1.5, 1.5);
  }

  ctx.restore();

  if (ready) {
    drawEmoji(ctx, "✨", cx + 7, cy - 13 + bob, 10);
  }
}

function drawBarnShelter(ctx, l) {
  const bx = (l.x0 + 1.1) * TILE;
  const by = (l.y0 + 1.08) * TILE;
  const bw = 44;
  const bh = 32;
  const depth = 8;
  const frontW = bw - depth;
  ctx.save();

  // Skewed down-right cast shadow
  ctx.fillStyle = "rgba(8,14,10,0.28)";
  ctx.beginPath();
  ctx.moveTo(bx + 4, by + bh);
  ctx.lineTo(bx + bw, by + bh);
  ctx.lineTo(bx + bw + 8, by + bh + 6);
  ctx.lineTo(bx + 10, by + bh + 6);
  ctx.closePath();
  ctx.fill();

  // Lit timber front body + stone footing
  ctx.fillStyle = "#8a562d";
  ctx.fillRect(bx + 2, by + 12, frontW - 2, bh - 12);
  ctx.fillStyle = "#6c757d";
  ctx.fillRect(bx + 2, by + bh - 4, frontW - 2, 4);

  // Shaded right extrusion wall
  ctx.fillStyle = "#5c361a";
  ctx.beginPath();
  ctx.moveTo(bx + frontW, by + 12);
  ctx.lineTo(bx + bw, by + 6);
  ctx.lineTo(bx + bw, by + bh - 6);
  ctx.lineTo(bx + frontW, by + bh);
  ctx.closePath();
  ctx.fill();

  // Under-eave shadow
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.fillRect(bx + 2, by + 12, frontW - 2, 3);

  // Deep recessed archway + golden hay inside
  ctx.fillStyle = "#241409";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx + 9, by + 17, frontW - 18, bh - 17, [5, 5, 0, 0]);
  else ctx.rect(bx + 9, by + 17, frontW - 18, bh - 17);
  ctx.fill();
  ctx.fillStyle = "#e3b63d";
  ctx.fillRect(bx + 11, by + bh - 5, frontW - 22, 4);

  // 2.5D Hipped red shingle roof (front sunlit slope + shaded right hip)
  ctx.fillStyle = "#c9402b";
  ctx.beginPath();
  ctx.moveTo(bx - 2, by + 13);
  ctx.lineTo(bx + 8, by + 1);
  ctx.lineTo(bx + frontW - 6, by + 1);
  ctx.lineTo(bx + frontW + 2, by + 13);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#8c2617";
  ctx.beginPath();
  ctx.moveTo(bx + frontW - 6, by + 1);
  ctx.lineTo(bx + bw + 2, by + 5);
  ctx.lineTo(bx + bw + 3, by + 8);
  ctx.lineTo(bx + frontW + 2, by + 13);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#f07c65";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(bx + 8, by + 1);
  ctx.lineTo(bx + frontW - 6, by + 1);
  ctx.stroke();

  ctx.restore();
}

function drawBulkShopStall(ctx, l, op) {
  const sx = (l.x0 + 1.24) * TILE;
  const sy = (l.y0 + 1.72) * TILE;
  const sw = 114;
  const sh = 78;
  const depth = 10;
  const frontW = sw - depth;

  ctx.save();
  // Cast oblique shadow down-right
  ctx.fillStyle = "rgba(8,14,10,0.28)";
  ctx.beginPath();
  ctx.moveTo(sx + 6, sy + sh - 4);
  ctx.lineTo(sx + sw, sy + sh - 4);
  ctx.lineTo(sx + sw + 10, sy + sh + 6);
  ctx.lineTo(sx + 14, sy + sh + 6);
  ctx.closePath();
  ctx.fill();

  // Back wooden interior + right shaded extrusion wall
  ctx.fillStyle = "#4d2f18";
  ctx.fillRect(sx + 8, sy + 16, frontW - 14, sh - 22);
  ctx.fillStyle = "#36200f";
  ctx.beginPath();
  ctx.moveTo(sx + frontW - 6, sy + 16);
  ctx.lineTo(sx + sw - 2, sy + 9);
  ctx.lineTo(sx + sw - 2, sy + sh - 13);
  ctx.lineTo(sx + frontW - 6, sy + sh - 6);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#784a25";
  ctx.fillRect(sx + 12, sy + 24, frontW - 22, 6);

  // Wooden support posts
  ctx.fillStyle = "#5c361a";
  ctx.fillRect(sx + 6, sy + 14, 6, sh - 18);
  ctx.fillRect(sx + frontW - 10, sy + 14, 6, sh - 18);

  // 2.5D Front wooden counter with shaded right flank + sunlit top edge
  ctx.fillStyle = "#9c6232";
  ctx.fillRect(sx + 4, sy + 42, frontW - 6, 27);
  ctx.fillStyle = "#6e431f";
  ctx.beginPath();
  ctx.moveTo(sx + frontW - 2, sy + 42);
  ctx.lineTo(sx + sw - 2, sy + 36);
  ctx.lineTo(sx + sw - 2, sy + 63);
  ctx.lineTo(sx + frontW - 2, sy + 69);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c98b50";
  ctx.beginPath();
  ctx.moveTo(sx + 2, sy + 42);
  ctx.lineTo(sx + 8, sy + 36);
  ctx.lineTo(sx + sw, sy + 36);
  ctx.lineTo(sx + frontW - 2, sy + 42);
  ctx.closePath();
  ctx.fill();

  // 3D Side crate + grain sack
  ctx.fillStyle = "#b5783d";
  ctx.fillRect(sx + 10, sy + 52, 16, 15);
  ctx.fillStyle = "#d99d5e";
  ctx.fillRect(sx + 10, sy + 49, 16, 3);
  ctx.strokeStyle = "#6e4219";
  ctx.strokeRect(sx + 10, sy + 52, 16, 15);

  ctx.fillStyle = "#e6d2a2";
  ctx.beginPath();
  ctx.ellipse(sx + frontW - 15, sy + 61, 8, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Stocked items displayed on counter
  const stockItems = Object.values(op?.stock || {}).filter((s) => s && s.qty > 0);
  if (stockItems.length > 0) {
    const shown = stockItems.slice(0, 4);
    const step = (frontW - 34) / Math.max(1, shown.length - 1);
    shown.forEach((entry, idx) => {
      const ix = shown.length === 1 ? sx + frontW / 2 : sx + 20 + idx * step;
      drawEmoji(ctx, itemIcon(entry.item), ix, sy + 33, 13);
    });
  } else {
    ctx.fillStyle = "#8a5a2b";
    ctx.fillRect(sx + frontW / 2 - 12, sy + 31, 24, 9);
  }

  // Under-awning shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(sx + 4, sy + 18, frontW - 6, 4);

  // Striped 2.5D Market Awning + shaded right roof cap
  const stripes = 8;
  const stW = frontW / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#1b8a5a" : "#fff5db";
    ctx.beginPath();
    ctx.moveTo(sx + i * stW, sy + 18);
    ctx.lineTo(sx + (i + 1) * stW, sy + 18);
    ctx.lineTo(sx + 4 + (i + 1) * ((frontW - 8) / stripes), sy + 2);
    ctx.lineTo(sx + 4 + i * ((frontW - 8) / stripes), sy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx + i * stW + stW / 2, sy + 18, stW / 2, 0, Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = "#125c3c";
  ctx.beginPath();
  ctx.moveTo(sx + frontW - 4, sy + 2);
  ctx.lineTo(sx + sw, sy - 2);
  ctx.lineTo(sx + sw + 2, sy + 12);
  ctx.lineTo(sx + frontW, sy + 18);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#4d2b12";
  ctx.fillRect(sx + 2, sy, frontW - 4, 4);

  // Signboard on awning
  ctx.fillStyle = "#3a2210";
  ctx.fillRect(sx + frontW / 2 - 22, sy + 5, 44, 12);
  ctx.strokeStyle = "#f5c518";
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + frontW / 2 - 22, sy + 5, 44, 12);
  ctx.fillStyle = "#fff5db";
  ctx.font = `700 8px ${UI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🏪 LOJA", sx + frontW / 2, sy + 11.5);

  ctx.restore();
}

function drawLuckShopStall(ctx, l, op, time) {
  const sx = (l.x0 + 1.24) * TILE;
  const sy = (l.y0 + 1.7) * TILE;
  const sw = 114;
  const sh = 80;
  const depth = 10;
  const frontW = sw - depth;
  const hasStock = Object.values(op?.stock || {}).some((s) => s && s.qty > 0);

  ctx.save();
  // Cast oblique shadow down-right
  ctx.fillStyle = "rgba(8,14,10,0.3)";
  ctx.beginPath();
  ctx.moveTo(sx + 6, sy + sh - 4);
  ctx.lineTo(sx + sw, sy + sh - 4);
  ctx.lineTo(sx + sw + 10, sy + sh + 6);
  ctx.lineTo(sx + 14, sy + sh + 6);
  ctx.closePath();
  ctx.fill();

  // Velvet curtain backdrop + shaded right extrusion wall
  ctx.fillStyle = "#4a1b6e";
  ctx.fillRect(sx + 8, sy + 16, frontW - 14, sh - 22);
  ctx.fillStyle = "#642594";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(sx + 12 + i * 20, sy + 18, 11, sh - 26);
  }
  ctx.fillStyle = "#2d0f45";
  ctx.beginPath();
  ctx.moveTo(sx + frontW - 6, sy + 16);
  ctx.lineTo(sx + sw - 2, sy + 9);
  ctx.lineTo(sx + sw - 2, sy + sh - 13);
  ctx.lineTo(sx + frontW - 6, sy + sh - 6);
  ctx.closePath();
  ctx.fill();

  // Gold-trimmed wooden posts
  ctx.fillStyle = "#3b1d0f";
  ctx.fillRect(sx + 6, sy + 14, 6, sh - 18);
  ctx.fillRect(sx + frontW - 10, sy + 14, 6, sh - 18);
  ctx.fillStyle = "#f5c518";
  ctx.fillRect(sx + 6, sy + 20, 6, 3);
  ctx.fillRect(sx + frontW - 10, sy + 20, 6, 3);

  // 2.5D Counter (rich purple & gold)
  ctx.fillStyle = "#5c2485";
  ctx.fillRect(sx + 4, sy + 42, frontW - 6, 27);
  ctx.fillStyle = "#3a1457";
  ctx.beginPath();
  ctx.moveTo(sx + frontW - 2, sy + 42);
  ctx.lineTo(sx + sw - 2, sy + 36);
  ctx.lineTo(sx + sw - 2, sy + 63);
  ctx.lineTo(sx + frontW - 2, sy + 69);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f5c518";
  ctx.beginPath();
  ctx.moveTo(sx + 2, sy + 42);
  ctx.lineTo(sx + 8, sy + 36);
  ctx.lineTo(sx + sw, sy + 36);
  ctx.lineTo(sx + frontW - 2, sy + 42);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#f5c518";
  ctx.lineWidth = 1.4;
  ctx.strokeRect(sx + 4, sy + 42, frontW - 6, 27);

  // Mini spinning luck wheel on counter left
  const wx = sx + 25;
  const wy = sy + 32;
  ctx.save();
  ctx.translate(wx, wy);
  ctx.rotate(hasStock ? time * 1.4 : 0);
  const wheelColors = ["#e74c3c", "#f5c518", "#9b59b6", "#2ecc71", "#3498db", "#f39c12"];
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = wheelColors[i];
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 11, (i * Math.PI) / 3, ((i + 1) * Math.PI) / 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Mystery prize gift & dice on counter center/right
  drawEmoji(ctx, "🎁", sx + frontW / 2 + 4, sy + 32, 15);
  drawEmoji(ctx, "🎲", sx + frontW - 20, sy + 33, 13);

  // Under-awning shadow
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.fillRect(sx + 4, sy + 18, frontW - 6, 4);

  // Striped 2.5D Carnival Awning + shaded right roof cap
  const stripes = 8;
  const stW = frontW / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#7a2bc2" : "#f5c518";
    ctx.beginPath();
    ctx.moveTo(sx + i * stW, sy + 18);
    ctx.lineTo(sx + (i + 1) * stW, sy + 18);
    ctx.lineTo(sx + 4 + (i + 1) * ((frontW - 8) / stripes), sy + 2);
    ctx.lineTo(sx + 4 + i * ((frontW - 8) / stripes), sy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx + i * stW + stW / 2, sy + 18, stW / 2, 0, Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = "#4d177d";
  ctx.beginPath();
  ctx.moveTo(sx + frontW - 4, sy + 2);
  ctx.lineTo(sx + sw, sy - 2);
  ctx.lineTo(sx + sw + 2, sy + 12);
  ctx.lineTo(sx + frontW, sy + 18);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#f5c518";
  ctx.fillRect(sx + 2, sy, frontW - 4, 4);

  // Twinkling awning lights
  for (let i = 0; i <= 6; i++) {
    const lx = sx + 8 + i * ((frontW - 16) / 6);
    const pulse = (Math.sin(time * 6 + i * 1.3 + l.x0) + 1) * 0.5;
    ctx.fillStyle = hasStock
      ? `rgba(255, 245, 170, ${0.45 + pulse * 0.55})`
      : "rgba(180, 160, 200, 0.4)";
    ctx.beginPath();
    ctx.arc(lx, sy + 2, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crest sign
  ctx.fillStyle = "#2b1342";
  ctx.fillRect(sx + frontW / 2 - 24, sy + 5, 48, 12);
  ctx.strokeStyle = "#f5c518";
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + frontW / 2 - 24, sy + 5, 48, 12);
  ctx.fillStyle = "#f5c518";
  ctx.font = `700 8px ${UI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🎲 SORTE", sx + frontW / 2, sy + 11.5);

  if (hasStock) {
    const floatY = Math.sin(time * 3.5 + l.x0) * 3;
    drawEmoji(ctx, "✨", sx + frontW - 10, sy - 4 + floatY, 11);
  }

  ctx.restore();
}

/**
 * Push depth-sorted land structures/animals into the world entities list.
 */
export function pushLandEntities(entities, ctx, l, mode, op, time) {
  if (!mode || mode === "farm") return;

  if (mode === "animals") {
    entities.push({
      y: (l.y0 + 2.05) * TILE,
      draw: () => drawBarnShelter(ctx, l)
    });

    const animalEntries = Object.entries(op?.animals || {});
    if (animalEntries.length === 0) {
      // 2.5D Hay bale with cast shadow and side extrusion
      entities.push({
        y: (l.y0 + 3.6) * TILE,
        draw: () => {
          const hx = (l.x0 + 2.8) * TILE;
          const hy = (l.y0 + 3.2) * TILE;
          ctx.fillStyle = "rgba(8,14,10,0.22)";
          ctx.fillRect(hx + 3, hy + 12, 24, 5);
          ctx.fillStyle = "#b88a24";
          ctx.fillRect(hx + 18, hy - 2, 5, 13);
          ctx.fillStyle = "#d9a938";
          ctx.fillRect(hx, hy, 20, 13);
          ctx.fillStyle = "#f5d362";
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(hx + 5, hy - 4);
          ctx.lineTo(hx + 23, hy - 4);
          ctx.lineTo(hx + 20, hy);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#8a5615";
          ctx.fillRect(hx + 5, hy, 2, 13);
          ctx.fillRect(hx + 13, hy, 2, 13);
        }
      });
      return;
    }

    const slots = [
      [1.75, 2.75], [2.95, 2.55], [4.15, 2.85],
      [1.85, 3.95], [3.05, 4.15], [4.2, 3.9]
    ];
    const nowMs = Date.now();
    animalEntries.slice(0, 6).forEach(([key, a], idx) => {
      const cfg = ANIMAL_TYPES[a.type];
      if (!cfg) return;
      const base = slots[idx % slots.length];
      const seed = hash2(l.x0 + idx * 7, l.y0 + key.charCodeAt(0));
      const speed = 0.9 + seed * 0.7;
      const roamX = Math.sin(time * speed + seed * 12) * 10;
      const roamY = Math.cos(time * speed * 0.75 + seed * 9) * 5;
      const cx = (l.x0 + base[0]) * TILE + roamX;
      const cy = (l.y0 + base[1]) * TILE + roamY;
      const flip = Math.cos(time * speed + seed * 12) < 0;
      const bob = Math.abs(Math.sin(time * 4.5 + idx)) * -2;
      const ready = (nowMs - (a.lastAt || 0)) >= cfg.cooldownMs;

      entities.push({
        y: cy + 8,
        draw: () => drawAnimalSprite(ctx, a.type, cx, cy, flip, ready, bob)
      });
    });
  } else if (mode === "bulkShop") {
    entities.push({
      y: (l.y0 + 3.95) * TILE,
      draw: () => drawBulkShopStall(ctx, l, op)
    });
  } else if (mode === "luckShop") {
    entities.push({
      y: (l.y0 + 3.95) * TILE,
      draw: () => drawLuckShopStall(ctx, l, op, time)
    });
  }
}
