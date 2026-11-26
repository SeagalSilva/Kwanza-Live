// Procedural character drawing, used by the world, the HUD portrait and the creator.
import { SKINS, HAIRS, SHIRTS } from "../data/character.js";

function shadeHex(hex, amt) {
  const m = String(hex || "").replace("#", "");
  if (m.length !== 6) return hex;
  const num = parseInt(m, 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp(((num >> 16) & 255) + amt);
  const g = clamp(((num >> 8) & 255) + amt);
  const b = clamp((num & 255) + amt);
  return `rgb(${r},${g},${b})`;
}

/**
 * Draw a character with its feet at (x, y).
 * opts: { dir: 'down'|'up'|'left'|'right', phase, moving, scale }
 */
export function drawCharacter(ctx, x, y, look, opts = {}) {
  const { dir = "down", phase = 0, moving = false, scale = 1 } = opts;
  const skin = SKINS[look.skin] ?? SKINS[0];
  const skinDark = shadeHex(skin, -24);
  const skinLight = shadeHex(skin, 14);
  const hair = HAIRS[look.hairColor] ?? HAIRS[0];
  const hairDark = shadeHex(hair, -22);
  const hairLight = shadeHex(hair, 28);
  const shirt = SHIRTS[look.shirt] ?? SHIRTS[0];
  const shirtDark = shadeHex(shirt, -26);
  const shirtLight = shadeHex(shirt, 22);
  const style = look.hairStyle | 0;

  const swing = moving ? Math.sin(phase) * 2.8 : 0;
  const armSwing = moving ? Math.sin(phase) * 2.2 : 0;
  const bob = moving ? Math.abs(Math.sin(phase)) * 1.6 : Math.sin(phase * 0.6) * 0.35;
  const side = dir === "left" || dir === "right";
  const sx = dir === "left" ? -1.4 : dir === "right" ? 1.4 : 0;
  const outline = "rgba(18,14,12,0.78)";

  const rrect = (rx, ry, w, h, r, fill, stroke = null, lw = 0.85) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    if (r && ctx.roundRect) ctx.roundRect(rx, ry, w, h, r);
    else ctx.rect(rx, ry, w, h);
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  };

  const circle = (cx, cy, r, fill, stroke = null, lw = 0.85) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  };

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Ground contact shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath(); ctx.ellipse(0, 0.5, 9.8, 3.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.beginPath(); ctx.ellipse(0, 0.2, 6.2, 2.2, 0, 0, Math.PI * 2); ctx.fill();

  ctx.translate(0, -bob);

  // Back hair layer (afro / long)
  if (style === 1) {
    circle(sx, -29.8, 10.6, hairDark, outline, 0.9);
    circle(sx - 4.2, -33.5, 4.4, hair);
    circle(sx + 4.2, -33.5, 4.4, hair);
    circle(sx, -35.2, 4.5, hair);
  } else if (style === 2) {
    rrect(sx - 8.6, -31.5, 17.2, 18.2, 5.5, hairDark, outline, 0.9);
    ctx.fillStyle = hair;
    ctx.fillRect(sx - 6.8, -28, 13.6, 12.5);
  }

  // Legs + Boots
  const drawLeg = (lx, h, isFront) => {
    const pantCol = isFront ? "#2d4368" : "#223452";
    rrect(lx, -10.5, 4.3, h, 1.5, pantCol, outline, 0.8);
    // Boot + sole highlight
    const by = -10.5 + h - 3.2;
    rrect(lx - 0.5, by, 5.2, 3.4, 1.3, "#3b2416", outline, 0.8);
    ctx.fillStyle = "#19120e";
    ctx.fillRect(lx - 0.2, by + 2.3, 4.6, 1.0);
  };
  if (side) {
    drawLeg(-2.3 + swing * 0.55, 10.2, false);
    drawLeg(-2.0 - swing * 0.55, 10.2, true);
  } else {
    drawLeg(-5.2, 10.2 - Math.max(0, swing), true);
    drawLeg(0.9, 10.2 - Math.max(0, -swing), true);
  }

  // Arms helper
  const drawArm = (ax, yShift) => {
    ctx.save();
    ctx.translate(0, yShift);
    rrect(ax, -21.5, 3.4, 6.2, 1.6, shirtDark, outline, 0.8);
    rrect(ax + 0.1, -16.2, 3.2, 3.2, 1.4, skin, outline, 0.75);
    ctx.restore();
  };

  // Back arm when facing sideways
  if (side) {
    drawArm(-1.7 - sx * 0.8, -armSwing * 0.6);
  } else {
    drawArm(-9.6, armSwing * 0.7);
    drawArm(6.2, -armSwing * 0.7);
  }

  // Torso / Jacket / Shirt
  const bx = -7 + sx * 0.35;
  rrect(bx, -22.2, 14, 12.6, 3.4, shirt, outline, 0.9);
  // Side shadow & chest highlight
  ctx.fillStyle = shirtDark;
  ctx.fillRect(bx + (dir === "left" ? 0.8 : 10.2), -21.2, 3, 9.2);
  ctx.fillStyle = shirtLight;
  ctx.globalAlpha = 0.28;
  ctx.fillRect(bx + 2.2, -21, 5.2, 7);
  ctx.globalAlpha = 1;

  // Shirt neckline / collar
  if (dir !== "up") {
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.moveTo(sx - 3.2, -22.1);
    ctx.lineTo(sx, -19.2);
    ctx.lineTo(sx + 3.2, -22.1);
    ctx.closePath();
    ctx.fill();
  }

  // Leather belt & brass buckle
  rrect(bx + 0.2, -11.9, 13.6, 2.3, 0.8, "#3e2716", outline, 0.65);
  if (dir !== "up") {
    rrect(sx - 1.6, -12.0, 3.2, 2.4, 0.6, "#f5c518", "#5c3b09", 0.55);
  }

  // Neck
  rrect(sx - 2.1, -23.6, 4.2, 2.4, 1, skinDark);

  // Front arm in side view
  if (side) {
    drawArm(-1.6 + sx * 1.15, armSwing * 0.8);
  }

  // Ears
  if (!side) {
    circle(sx - 7.3, -27.2, 2.0, skinDark, outline, 0.7);
    circle(sx + 7.3, -27.2, 2.0, skinDark, outline, 0.7);
  }

  // Head
  circle(sx, -28.0, 7.8, skin, outline, 0.95);
  // Subtle forehead/cheek glow & chin shade
  ctx.fillStyle = skinLight;
  ctx.globalAlpha = 0.28;
  ctx.beginPath(); ctx.ellipse(sx - 1.4, -30.5, 4.2, 2.4, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  if (side) {
    circle(sx + (dir === "left" ? 2.4 : -2.4), -27.2, 1.9, skinDark, outline, 0.65);
  }

  // Hair / Cap (top & back views)
  if (dir === "up") {
    if (style !== 3) {
      circle(sx, -28.6, 8.2, hair, outline, 0.9);
      ctx.strokeStyle = hairLight;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx, -29.5, 5.6, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
    } else {
      circle(sx, -28.6, 8.2, shirt, outline, 0.9);
      rrect(sx - 2.2, -23.5, 4.4, 1.8, 0.8, "#f5c518");
    }
  } else {
    // Face features first so bangs frame the forehead nicely
    if (dir === "down") {
      // Soft cheek blush
      ctx.fillStyle = "rgba(232,102,94,0.26)";
      ctx.beginPath(); ctx.ellipse(sx - 4.4, -25.4, 1.8, 1.0, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(sx + 4.4, -25.4, 1.8, 1.0, 0, 0, Math.PI * 2); ctx.fill();

      // Expressive eyes (sclera + iris + shine)
      for (const ex of [sx - 2.7, sx + 2.7]) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.ellipse(ex, -27.3, 1.45, 1.75, 0, 0, Math.PI * 2); ctx.fill();
        circle(ex, -27.2, 1.08, "#16161b");
        circle(ex - 0.35, -27.7, 0.42, "#ffffff");
      }

      // Eyebrows
      ctx.strokeStyle = hairDark;
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(sx - 4.0, -29.5); ctx.lineTo(sx - 1.5, -29.7);
      ctx.moveTo(sx + 1.5, -29.7); ctx.lineTo(sx + 4.0, -29.5);
      ctx.stroke();

      // Friendly smile
      ctx.strokeStyle = "rgba(45,20,16,0.68)";
      ctx.lineWidth = 0.85;
      ctx.beginPath(); ctx.arc(sx, -25.1, 1.9, 0.18 * Math.PI, 0.82 * Math.PI); ctx.stroke();
    } else if (side) {
      const ex = sx + (dir === "left" ? -3.4 : 3.4);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.ellipse(ex, -27.3, 1.2, 1.65, 0, 0, Math.PI * 2); ctx.fill();
      circle(ex + (dir === "left" ? -0.25 : 0.25), -27.2, 0.95, "#16161b");
      circle(ex + (dir === "left" ? -0.45 : 0.05), -27.7, 0.36, "#ffffff");
    }

    // Front hair / bangs / cap
    if (style === 3) {
      // Hair tufts under cap
      ctx.fillStyle = hair;
      ctx.fillRect(sx - 6.5, -30.5, 2.2, 3.2);
      ctx.fillRect(sx + 4.3, -30.5, 2.2, 3.2);

      // Cap crown
      ctx.fillStyle = shirt;
      ctx.beginPath(); ctx.arc(sx, -29.2, 8.2, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = outline; ctx.lineWidth = 0.9; ctx.stroke();

      // Gold cap emblem
      circle(sx + sx * 0.5, -33.2, 1.5, "#f5c518", "#5c3b09", 0.5);

      // Visor brim
      const brimOffset = dir === "left" ? -2.4 : dir === "right" ? 2.4 : 0;
      rrect(sx - 8.8 + brimOffset, -30.4, 17.6, 2.6, 1.2, shirtDark, outline, 0.8);
    } else {
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(sx, -28.8, 8.2, Math.PI * 0.96, Math.PI * 2.04);
      // Layered bangs curve
      ctx.lineTo(sx + 6.0, -29.0);
      ctx.quadraticCurveTo(sx + 2.5, -31.8, sx, -29.2);
      ctx.quadraticCurveTo(sx - 2.5, -31.8, sx - 6.2, -29.0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = outline; ctx.lineWidth = 0.85; ctx.stroke();

      // Glossy hair highlight arc
      ctx.strokeStyle = hairLight;
      ctx.lineWidth = 1.0;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(sx - 0.5, -30.0, 5.2, Math.PI * 1.18, Math.PI * 1.72);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();
}

