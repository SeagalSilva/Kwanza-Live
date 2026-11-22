// Procedural character drawing, used by the world, the HUD portrait and the creator.
import { SKINS, HAIRS, SHIRTS } from "../data/character.js";

/**
 * Draw a character with its feet at (x, y).
 * opts: { dir: 'down'|'up'|'left'|'right', phase, moving, scale }
 */
export function drawCharacter(ctx, x, y, look, opts = {}) {
  const { dir = "down", phase = 0, moving = false, scale = 1 } = opts;
  const skin = SKINS[look.skin] ?? SKINS[0];
  const hair = HAIRS[look.hairColor] ?? HAIRS[0];
  const shirt = SHIRTS[look.shirt] ?? SHIRTS[0];
  const style = look.hairStyle | 0;

  const swing = moving ? Math.sin(phase) * 3 : 0;
  const bob = moving ? Math.abs(Math.sin(phase)) * 1.5 : 0;
  const side = dir === "left" || dir === "right";
  const sx = dir === "left" ? -1.2 : dir === "right" ? 1.2 : 0;

  const rect = (c, rx, ry, w, h, r = 0) => {
    ctx.fillStyle = c;
    if (r && ctx.roundRect) { ctx.beginPath(); ctx.roundRect(rx, ry, w, h, r); ctx.fill(); }
    else ctx.fillRect(rx, ry, w, h);
  };
  const circle = (c, cx, cy, r) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); };

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // shadow
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 3.5, 0, 0, Math.PI * 2); ctx.fill();

  ctx.translate(0, -bob);

  // legs + shoes
  const l1 = 10 - Math.max(0, swing), l2 = 10 - Math.max(0, -swing);
  rect("#2c3e63", -5, -10, 4, l1, 1);
  rect("#2c3e63", 1, -10, 4, l2, 1);
  rect("#1b1b1b", -5.5, -10 + l1 - 2, 5, 2, 1);
  rect("#1b1b1b", 0.5, -10 + l2 - 2, 5, 2, 1);

  // hair behind the head
  if (style === 1) circle(hair, sx, -30, 10.5);
  if (style === 2) rect(hair, sx - 8.5, -31, 17, 17, 5);

  // arms (behind body for side view)
  const arm = (ax) => { rect(shirt, ax, -21, 3, 8, 1.5); rect(skin, ax, -13.5, 3, 3, 1.5); };
  if (!side) { arm(-9.5); arm(6.5); } else { arm(-1.5 + sx); }

  // body
  rect(shirt, -7 + sx * 0.3, -22, 14, 13, 3);

  // head
  circle(skin, sx, -27.5, 7.5);

  // front hair
  if (dir === "up") {
    if (style !== 3) circle(hair, sx, -27.5, 8);
    else circle(shirt, sx, -28, 8);
  } else {
    ctx.fillStyle = hair;
    if (style === 0 || style === 2 || style === 1) {
      ctx.beginPath(); ctx.arc(sx, -28, 8, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
    }
    if (style === 3) {
      ctx.fillStyle = shirt;
      ctx.beginPath(); ctx.arc(sx, -28.5, 8, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill();
      rect(shirt, sx - 9.5 + (dir === "left" ? -2 : dir === "right" ? 2 : 0), -29, 19, 2.5, 1);
    }
  }

  // face
  if (dir === "down") {
    circle("#1b1b1b", sx - 2.8, -27, 1.1);
    circle("#1b1b1b", sx + 2.8, -27, 1.1);
    ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(sx, -25, 1.8, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  } else if (side) {
    circle("#1b1b1b", sx + (dir === "left" ? -3 : 3), -27, 1.1);
  }

  ctx.restore();
}
