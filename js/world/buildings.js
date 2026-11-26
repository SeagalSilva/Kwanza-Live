// 2.5D Oblique Top-Down Building & Landmark Renderers for the Town World.
// Sun direction: upper-left -> highlights on top/left, shaded right bevels, shadows cast down-right.
import { TILE } from "../config.js";

const UI_FONT = "system-ui,-apple-system,Segoe UI,Roboto,sans-serif";

function shadeHex(hex, factor) {
  if (!hex || typeof hex !== "string" || !hex.startsWith("#") || (hex.length !== 7 && hex.length !== 4)) {
    return hex || "#888888";
  }
  let r, g, b;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(r * factor)}, ${clamp(g * factor)}, ${clamp(b * factor)})`;
}

function drawCastShadow(ctx, x, y, w, h, offX = 14, offY = 10) {
  ctx.fillStyle = "rgba(8, 14, 10, 0.28)";
  ctx.beginPath();
  ctx.moveTo(x + 4, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w, y + TILE * 0.65);
  ctx.lineTo(x + w + offX, y + TILE * 0.65 + offY);
  ctx.lineTo(x + w + offX, y + h + offY);
  ctx.lineTo(x + 4 + offX * 0.7, y + h + offY);
  ctx.closePath();
  ctx.fill();
}

function draw3DWindow(ctx, x, y, w, h, warmGlow = false) {
  // Outer recessed sill & shadow
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(x - 1, y + h, w + 3, 3);
  ctx.fillStyle = "#5c4028";
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);

  // Recessed glass pane
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  if (warmGlow) {
    grad.addColorStop(0, "#ffeaa7");
    grad.addColorStop(1, "#e67e22");
  } else {
    grad.addColorStop(0, "#5ea3cf");
    grad.addColorStop(1, "#2f5f85");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);

  // Diagonal sky reflection
  ctx.fillStyle = "rgba(255,255,255,0.34)";
  ctx.beginPath();
  ctx.moveTo(x + 2, y + 2);
  ctx.lineTo(x + w * 0.55, y + 2);
  ctx.lineTo(x + 2, y + h * 0.65);
  ctx.closePath();
  ctx.fill();

  // Muntin crossbars
  ctx.fillStyle = "#5c4028";
  ctx.fillRect(x + w / 2 - 0.8, y + 1, 1.6, h - 2);
  ctx.fillRect(x + 1, y + h / 2 - 0.8, w - 2, 1.6);

  // Bottom ledge highlight
  ctx.fillStyle = "#d9c2a3";
  ctx.fillRect(x - 2, y + h - 1, w + 4, 2.5);
}

function draw3DDoor(ctx, dx, wallBottom, doorW, doorH, archColor = "#3b2312", goldTrim = false) {
  const dw = doorW;
  const dh = doorH;
  const left = dx - dw / 2;
  const top = wallBottom - dh;

  // Stone doorstep extending forward onto path
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(left - 3, wallBottom + 4, dw + 8, 3);
  ctx.fillStyle = "#9aa5a0";
  ctx.fillRect(left - 4, wallBottom - 1, dw + 8, 5);
  ctx.fillStyle = "#b8c2bd";
  ctx.fillRect(left - 4, wallBottom - 1, dw + 8, 2);

  // Recessed dark timber frame
  ctx.fillStyle = archColor;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(left - 2, top - 2, dw + 4, dh + 2, [5, 5, 0, 0]);
  else ctx.rect(left - 2, top - 2, dw + 4, dh + 2);
  ctx.fill();

  // Inner recessed door panel
  const dGrad = ctx.createLinearGradient(left, top, left + dw, top);
  dGrad.addColorStop(0, "#6b4222");
  dGrad.addColorStop(1, "#4a2c15");
  ctx.fillStyle = dGrad;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(left, top, dw, dh, [4, 4, 0, 0]);
  else ctx.rect(left, top, dw, dh);
  ctx.fill();

  // Vertical plank grooves
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(dx - 0.6, top + 2, 1.2, dh - 3);
  ctx.fillRect(left + dw * 0.25, top + 3, 1, dh - 4);
  ctx.fillRect(left + dw * 0.75, top + 3, 1, dh - 4);

  // Handle / gold trim
  ctx.fillStyle = goldTrim ? "#f5c518" : "#e5b82e";
  ctx.beginPath();
  ctx.arc(left + dw - 5, top + dh * 0.56, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawPitchedRoof25D(ctx, x, y, w, roofH, roofColor, rightDepth = 12) {
  const rx = x - 6;
  const rw = w + 10 - rightDepth;
  const ridgeY = y + 3;
  const eaveY = y + roofH;

  // Under-eave drop shadow onto walls
  ctx.fillStyle = "rgba(0,0,0,0.26)";
  ctx.fillRect(x, eaveY, w - rightDepth, 6);
  ctx.beginPath();
  ctx.moveTo(x + w - rightDepth, eaveY);
  ctx.lineTo(x + w + 2, eaveY - 9);
  ctx.lineTo(x + w + 2, eaveY - 3);
  ctx.lineTo(x + w - rightDepth, eaveY + 6);
  ctx.closePath();
  ctx.fill();

  // Main sunlit front roof slope (trapezoid hipped roof)
  const fGrad = ctx.createLinearGradient(rx, ridgeY, rx, eaveY);
  fGrad.addColorStop(0, shadeHex(roofColor, 1.15));
  fGrad.addColorStop(1, roofColor);
  ctx.fillStyle = fGrad;
  ctx.beginPath();
  ctx.moveTo(rx + 12, ridgeY);
  ctx.lineTo(rx + rw - 10, ridgeY);
  ctx.lineTo(rx + rw + 4, eaveY);
  ctx.lineTo(rx, eaveY);
  ctx.closePath();
  ctx.fill();

  // Shingle / tile horizontal courses
  ctx.strokeStyle = "rgba(0,0,0,0.16)";
  ctx.lineWidth = 1;
  for (let row = 1; row <= 3; row++) {
    const ry = ridgeY + ((eaveY - ridgeY) * row) / 4;
    const inset = (1 - row / 4) * 10;
    ctx.beginPath();
    ctx.moveTo(rx + inset, ry);
    ctx.lineTo(rx + rw + 2 - inset * 0.6, ry);
    ctx.stroke();
  }

  // Shaded right hipped roof plane (creates immediate 2.5D volume!)
  ctx.fillStyle = shadeHex(roofColor, 0.68);
  ctx.beginPath();
  ctx.moveTo(rx + rw - 10, ridgeY);
  ctx.lineTo(rx + rw + rightDepth - 2, ridgeY + 5);
  ctx.lineTo(rx + rw + rightDepth + 6, eaveY - 9);
  ctx.lineTo(rx + rw + 4, eaveY);
  ctx.closePath();
  ctx.fill();

  // Bright ridge beam highlight
  ctx.strokeStyle = shadeHex(roofColor, 1.32);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(rx + 12, ridgeY);
  ctx.lineTo(rx + rw - 10, ridgeY);
  ctx.stroke();

  // Crisp roof outline
  ctx.strokeStyle = shadeHex(roofColor, 0.45);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(rx, eaveY);
  ctx.lineTo(rx + 12, ridgeY);
  ctx.lineTo(rx + rw - 10, ridgeY);
  ctx.lineTo(rx + rw + rightDepth - 2, ridgeY + 5);
  ctx.lineTo(rx + rw + rightDepth + 6, eaveY - 9);
  ctx.lineTo(rx + rw + 4, eaveY);
  ctx.closePath();
  ctx.stroke();
}

function draw3DBlockShell(ctx, x, y, w, h, bodyColor, rightDepth = 12, wallTopRatio = 1.05) {
  const wallTop = y + TILE * wallTopRatio;
  const frontW = w - rightDepth;
  const wallH = h - TILE * wallTopRatio;

  // Front lit facade
  const fGrad = ctx.createLinearGradient(x, wallTop, x, y + h);
  fGrad.addColorStop(0, bodyColor);
  fGrad.addColorStop(1, shadeHex(bodyColor, 0.9));
  ctx.fillStyle = fGrad;
  ctx.fillRect(x, wallTop, frontW, wallH);

  // Shaded right extrusion wall (oblique 2.5D depth)
  ctx.fillStyle = shadeHex(bodyColor, 0.72);
  ctx.beginPath();
  ctx.moveTo(x + frontW, wallTop);
  ctx.lineTo(x + w, wallTop - 9);
  ctx.lineTo(x + w, y + h - 9);
  ctx.lineTo(x + frontW, y + h);
  ctx.closePath();
  ctx.fill();

  // Stone foundation plinth on front + right
  ctx.fillStyle = "#6c757d";
  ctx.fillRect(x, y + h - 7, frontW, 7);
  ctx.fillStyle = "#4d545b";
  ctx.beginPath();
  ctx.moveTo(x + frontW, y + h - 7);
  ctx.lineTo(x + w, y + h - 16);
  ctx.lineTo(x + w, y + h - 9);
  ctx.lineTo(x + frontW, y + h);
  ctx.closePath();
  ctx.fill();

  // Crisp edge outline
  ctx.strokeStyle = "rgba(18, 16, 12, 0.45)";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x, wallTop, frontW, wallH);
}

function draw3DAwning(ctx, x, ay, aw, c1, c2) {
  const stripes = Math.max(4, Math.round(aw / 14));
  const sw = aw / stripes;
  // Underside shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(x + 2, ay + 11, aw - 4, 4);
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? c1 : c2;
    ctx.beginPath();
    ctx.moveTo(x + 4 + i * ((aw - 8) / stripes), ay);
    ctx.lineTo(x + 4 + (i + 1) * ((aw - 8) / stripes), ay);
    ctx.lineTo(x + (i + 1) * sw, ay + 11);
    ctx.lineTo(x + i * sw, ay + 11);
    ctx.closePath();
    ctx.fill();

    // Scalloped front lip
    ctx.fillStyle = shadeHex(i % 2 === 0 ? c1 : c2, 0.85);
    ctx.beginPath();
    ctx.arc(x + i * sw + sw / 2, ay + 11, sw / 2, 0, Math.PI);
    ctx.fill();
  }
}

export function drawMineBuilding(ctx, b, time = 0) {
  const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
  ctx.save();

  // Heavy cast shadow & rocky gravel apron
  ctx.fillStyle = "rgba(8, 12, 14, 0.34)";
  ctx.beginPath();
  ctx.ellipse(x + w / 2 + 8, y + h + 2, w * 0.56, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#59524c";
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h + 1, w * 0.45, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2.5D Stepped Cliff Mountain:
  // Back shaded right flank
  ctx.fillStyle = "#2b353d";
  ctx.beginPath();
  ctx.moveTo(x + w - 26, y + 6);
  ctx.lineTo(x + w + 2, y + 26);
  ctx.lineTo(x + w + 6, y + h - 8);
  ctx.lineTo(x + w - 14, y + h);
  ctx.closePath();
  ctx.fill();

  // Front steep rocky cliff strata
  const cliffGrad = ctx.createLinearGradient(x, y + 18, x, y + h);
  cliffGrad.addColorStop(0, "#4e5c66");
  cliffGrad.addColorStop(0.55, "#3a454d");
  cliffGrad.addColorStop(1, "#2a3238");
  ctx.fillStyle = cliffGrad;
  ctx.beginPath();
  ctx.moveTo(x + 2, y + h);
  ctx.lineTo(x + 10, y + 24);
  ctx.lineTo(x + 32, y + 6);
  ctx.lineTo(x + w - 24, y + 6);
  ctx.lineTo(x + w - 12, y + h);
  ctx.closePath();
  ctx.fill();

  // Sunlit top rock plateau
  ctx.fillStyle = "#6c7c87";
  ctx.beginPath();
  ctx.moveTo(x + 26, y + 16);
  ctx.lineTo(x + 34, y + 2);
  ctx.lineTo(x + w - 26, y + 2);
  ctx.lineTo(x + w - 16, y + 16);
  ctx.lineTo(x + w * 0.6, y + 22);
  ctx.lineTo(x + w * 0.35, y + 20);
  ctx.closePath();
  ctx.fill();

  // Rock strata bevel lines
  ctx.strokeStyle = "rgba(0,0,0,0.32)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x + 12, y + 48); ctx.lineTo(x + w * 0.34, y + 44);
  ctx.moveTo(x + w * 0.68, y + 52); ctx.lineTo(x + w - 16, y + 46);
  ctx.stroke();

  // Deep recessed cavern entrance
  const tunX = x + TILE * 1.45;
  const tunY = y + TILE * 1.55;
  const tunW = w - TILE * 3.1;
  const tunH = h - TILE * 1.55;

  const tunGrad = ctx.createLinearGradient(tunX, tunY, tunX, y + h);
  tunGrad.addColorStop(0, "#050709");
  tunGrad.addColorStop(1, "#181410");
  ctx.fillStyle = tunGrad;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(tunX, tunY, tunW, tunH, [24, 24, 0, 0]);
  else ctx.rect(tunX, tunY, tunW, tunH);
  ctx.fill();

  // Projecting 3D Timber Archway Props (left post, right post, shaded side, header beam)
  ctx.fillStyle = "#3d2412";
  ctx.fillRect(tunX - 8, tunY + 4, 11, tunH - 4);
  ctx.fillRect(tunX + tunW - 3, tunY + 4, 11, tunH - 4);
  ctx.fillStyle = "#6e4423";
  ctx.fillRect(tunX - 10, tunY + 6, 9, tunH - 6);
  ctx.fillRect(tunX + tunW - 5, tunY + 6, 9, tunH - 6);
  // Top timber lintel + upper bevel
  ctx.fillStyle = "#7a4c28";
  ctx.fillRect(tunX - 14, tunY - 4, tunW + 28, 12);
  ctx.fillStyle = "#4d2d15";
  ctx.fillRect(tunX - 14, tunY + 6, tunW + 28, 4);

  // Hanging glowing mine lantern inside tunnel roof
  const lanternGlow = 0.72 + Math.sin(time * 5) * 0.22;
  const lx = tunX + tunW / 2;
  const ly = tunY + 14;
  ctx.fillStyle = `rgba(255, 196, 70, ${0.26 * lanternGlow})`;
  ctx.beginPath();
  ctx.arc(lx, ly + 4, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffe082";
  ctx.fillRect(lx - 3, ly, 6, 7);

  // 3D Steel mine-cart rails leading out of tunnel
  const railCenter = tunX + tunW / 2;
  for (let i = 0; i < 4; i++) {
    const sy = y + h - 22 + i * 8;
    ctx.fillStyle = "#5c3b1e";
    ctx.fillRect(railCenter - 15, sy, 30, 3);
  }
  ctx.strokeStyle = "#adb5bd";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(railCenter - 9, y + h - 24); ctx.lineTo(railCenter - 11, y + h + 8);
  ctx.moveTo(railCenter + 9, y + h - 24); ctx.lineTo(railCenter + 11, y + h + 8);
  ctx.stroke();

  // 3D Faceted glowing ore crystals on cliff slopes
  const drawCrystalCluster = (cx, cy, cMain, cHi) => {
    ctx.fillStyle = cMain;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy + 4); ctx.lineTo(cx - 2, cy - 8); ctx.lineTo(cx + 3, cy - 3); ctx.lineTo(cx + 4, cy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = cHi;
    ctx.beginPath();
    ctx.moveTo(cx - 2, cy - 8); ctx.lineTo(cx, cy + 4); ctx.lineTo(cx - 5, cy + 4);
    ctx.closePath();
    ctx.fill();
  };
  drawCrystalCluster(x + 22, y + TILE * 2.25, "#00acc1", "#80deea");
  drawCrystalCluster(x + w - 28, y + TILE * 2.55, "#8e24aa", "#ea80fc");
  drawCrystalCluster(x + 28, y + TILE * 3.15, "#8e24aa", "#ea80fc");

  // Framed wooden sign
  ctx.fillStyle = "#4a2e17";
  ctx.fillRect(x + w / 2 - 35, y + 10, 70, 17);
  ctx.strokeStyle = "#f5c518";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + w / 2 - 35, y + 10, 70, 17);
  ctx.fillStyle = "#f5c518";
  ctx.font = `700 9px ${UI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⛏️ MINAS", x + w / 2, y + 18.5);

  ctx.restore();
}

export function drawDungeonBuilding(ctx, b, time = 0) {
  const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
  const rightDepth = 12;
  const frontW = w - rightDepth;
  ctx.save();

  drawCastShadow(ctx, x, y, w, h, 14, 10);

  // Ancient mossy stone temple body + shaded right side
  const sGrad = ctx.createLinearGradient(x, y + 20, x, y + h);
  sGrad.addColorStop(0, "#46594c");
  sGrad.addColorStop(1, "#2f3d33");
  ctx.fillStyle = sGrad;
  ctx.fillRect(x + 4, y + 24, frontW - 4, h - 24);

  // Shaded right wall plane
  ctx.fillStyle = "#222d25";
  ctx.beginPath();
  ctx.moveTo(x + frontW, y + 24);
  ctx.lineTo(x + w, y + 14);
  ctx.lineTo(x + w, y + h - 10);
  ctx.lineTo(x + frontW, y + h);
  ctx.closePath();
  ctx.fill();

  // Stepped mossy roof terrace on top (2.5D top plane!)
  ctx.fillStyle = "#566b5c";
  ctx.beginPath();
  ctx.moveTo(x + 2, y + 26);
  ctx.lineTo(x + 14, y + 8);
  ctx.lineTo(x + w - 2, y + 8);
  ctx.lineTo(x + frontW + 2, y + 26);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#1b261e";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Overhanging 3D forest canopy moss clusters
  const mossPuffs = [
    [x + 18, y + 20, 12, "#246629"],
    [x + frontW * 0.5, y + 15, 15, "#2e7d32"],
    [x + frontW - 10, y + 20, 12, "#246629"],
    [x + frontW * 0.44, y + 12, 10, "#43a047"]
  ];
  for (const [mx, my, mr, mc] of mossPuffs) {
    ctx.fillStyle = mc;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Twin carved front buttress pillars
  for (const px of [x + 8, x + frontW - 20]) {
    ctx.fillStyle = "#5b7061";
    ctx.fillRect(px, y + 32, 12, h - 32);
    ctx.fillStyle = "#36453b";
    ctx.fillRect(px + 9, y + 32, 3, h - 32);
  }

  // Stepped stone threshold leading up to portal
  ctx.fillStyle = "#536358";
  ctx.fillRect(x + frontW / 2 - 22, y + h - 4, 44, 6);

  // Recessed glowing emerald portal archway
  const pX = x + frontW / 2 - 19;
  const pY = y + TILE * 1.6;
  const pW = 38;
  const pH = h - TILE * 1.6;
  ctx.fillStyle = "#08140d";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(pX, pY, pW, pH, [19, 19, 0, 0]);
  else ctx.rect(pX, pY, pW, pH);
  ctx.fill();

  const aura = 0.55 + Math.sin(time * 3.5) * 0.25;
  const pGrad = ctx.createRadialGradient(x + frontW / 2, pY + pH * 0.55, 2, x + frontW / 2, pY + pH * 0.55, 22);
  pGrad.addColorStop(0, `rgba(120, 255, 175, ${0.72 * aura})`);
  pGrad.addColorStop(1, "rgba(25, 95, 55, 0.15)");
  ctx.fillStyle = pGrad;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(pX + 4, pY + 5, pW - 8, pH - 5, [15, 15, 0, 0]);
  else ctx.rect(pX + 4, pY + 5, pW - 8, pH - 5);
  ctx.fill();

  // Twin flickering 3D torch sconces
  const flicker = 0.82 + Math.sin(time * 9) * 0.18;
  for (const tx of [x + 14, x + frontW - 14]) {
    const ty = y + TILE * 2.45;
    ctx.fillStyle = `rgba(255, 167, 38, ${0.28 * flicker})`;
    ctx.beginPath();
    ctx.arc(tx, ty - 2, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5c3a21";
    ctx.fillRect(tx - 2, ty, 4, 8);
    ctx.fillStyle = "#ffca28";
    ctx.beginPath();
    ctx.arc(tx, ty - 2, 3.6 * flicker, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crest plaque
  ctx.fillStyle = "#16261c";
  ctx.fillRect(x + frontW / 2 - 33, y + 10, 66, 16);
  ctx.strokeStyle = "#59d17a";
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x + frontW / 2 - 33, y + 10, 66, 16);
  ctx.fillStyle = "#d4ffdf";
  ctx.font = `700 8.5px ${UI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🌲 DUNGEON", x + frontW / 2, y + 18);

  ctx.restore();
}

export function drawBuilding(ctx, b, time = 0) {
  if (b.id === "mines") return drawMineBuilding(ctx, b, time);
  if (b.id === "dungeon") return drawDungeonBuilding(ctx, b, time);

  const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
  const rightDepth = 12;
  const frontW = w - rightDepth;
  const doorCx = x + frontW / 2;

  ctx.save();
  drawCastShadow(ctx, x, y, w, h, 14, 10);
  draw3DBlockShell(ctx, x, y, w, h, b.body, rightDepth, 1.05);

  if (b.id === "government") {
    // Neoclassical roof + pediment + 3D dome
    drawPitchedRoof25D(ctx, x, y + 6, w, TILE * 0.92, b.roof, rightDepth);

    // 3D Dome on roof center
    const dcx = x + frontW / 2, dcy = y + 14;
    const domeGrad = ctx.createRadialGradient(dcx - 6, dcy - 6, 3, dcx, dcy, 22);
    domeGrad.addColorStop(0, "#d2a8eb");
    domeGrad.addColorStop(0.55, "#8e44ad");
    domeGrad.addColorStop(1, "#4a235a");
    ctx.fillStyle = domeGrad;
    ctx.beginPath();
    ctx.arc(dcx, dcy + 4, 20, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#f5c518";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Golden cupola spire
    ctx.fillStyle = "#f5c518";
    ctx.fillRect(dcx - 3, dcy - 18, 6, 4);
    ctx.beginPath();
    ctx.arc(dcx, dcy - 20, 3, 0, Math.PI * 2);
    ctx.fill();

    // 4 Fluted white marble columns with cast shadows
    const colOffsets = [16, 42, frontW - 48, frontW - 22];
    for (const ox of colOffsets) {
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(x + ox + 4, y + TILE * 1.28, 7, h - TILE * 1.28 - 4);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + ox, y + TILE * 1.25, 8, h - TILE * 1.25 - 6);
      ctx.fillStyle = "#d5dbe0";
      ctx.fillRect(x + ox + 5, y + TILE * 1.25, 3, h - TILE * 1.25 - 6);
      ctx.fillStyle = "#e8ecef";
      ctx.fillRect(x + ox - 2, y + TILE * 1.22, 12, 4);
      ctx.fillRect(x + ox - 2, y + h - 8, 12, 4);
    }

    draw3DDoor(ctx, doorCx, y + h, 26, 28, "#3e224f", true);
    draw3DWindow(ctx, x + 26, y + TILE * 2.1, 13, 18);
    draw3DWindow(ctx, x + frontW - 39, y + TILE * 2.1, 13, 18);
  } else if (b.id === "casino") {
    // Art-Deco stepped 2.5D roof + gold trim
    drawPitchedRoof25D(ctx, x, y + 6, w, TILE * 0.95, b.roof, rightDepth);

    // Illuminated 2.5D Marquee pediment
    const mw = Math.min(110, frontW - 24);
    const mx = doorCx - mw / 2;
    ctx.fillStyle = "#4d0b1a";
    ctx.fillRect(mx, y + TILE * 1.18, mw, 20);
    ctx.strokeStyle = "#f5c518";
    ctx.lineWidth = 2;
    ctx.strokeRect(mx, y + TILE * 1.18, mw, 20);

    // Animated marquee bulbs
    for (let i = 0; i <= 8; i++) {
      const bx = mx + 5 + (i * (mw - 10)) / 8;
      const lit = (Math.floor(time * 6) + i) % 2 === 0;
      ctx.fillStyle = lit ? "#fff3a6" : "#d9822b";
      ctx.beginPath();
      ctx.arc(bx, y + TILE * 1.18 + 3, 1.8, 0, Math.PI * 2);
      ctx.arc(bx, y + TILE * 1.18 + 17, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#f5c518";
    ctx.font = `800 8.5px ${UI_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("★ CASINO ★", doorCx, y + TILE * 1.18 + 10.5);

    // Red VIP carpet leading out from entrance
    ctx.fillStyle = "#b81d3a";
    ctx.fillRect(doorCx - 14, y + h, 28, 10);
    ctx.fillStyle = "#f5c518";
    ctx.fillRect(doorCx - 14, y + h, 2, 10);
    ctx.fillRect(doorCx + 12, y + h, 2, 10);

    draw3DDoor(ctx, doorCx, y + h, 26, 28, "#7d1227", true);
    draw3DWindow(ctx, x + 14, y + TILE * 2.2, 20, 17, true);
    draw3DWindow(ctx, x + frontW - 34, y + TILE * 2.2, 20, 17, true);
  } else if (b.id === "workstation") {
    // Workshop slate/amber roof + 3D brick chimney with gentle smoke
    drawPitchedRoof25D(ctx, x, y, w, TILE * 1.12, b.roof, rightDepth);

    // Brick chimney on right roof
    const chX = x + frontW - 28;
    const chY = y - 4;
    ctx.fillStyle = "#8d493a";
    ctx.fillRect(chX, chY, 14, 18);
    ctx.fillStyle = "#5c2e24";
    ctx.fillRect(chX + 10, chY - 2, 5, 18);
    ctx.fillStyle = "#a85c4b";
    ctx.fillRect(chX - 2, chY - 2, 17, 4);
    // Gentle rising smoke puffs
    for (let i = 0; i < 2; i++) {
      const p = ((time * 0.45 + i * 0.5) % 1);
      ctx.fillStyle = `rgba(225, 232, 230, ${(1 - p) * 0.35})`;
      ctx.beginPath();
      ctx.arc(chX + 7 + Math.sin(time * 2 + i) * 3, chY - 6 - p * 14, 3.5 + p * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    draw3DAwning(ctx, x, y + TILE * 1.12, frontW, "#e67e22", "#fff5db");
    draw3DDoor(ctx, doorCx, y + h, 24, 27, "#4a2e17", true);
    draw3DWindow(ctx, x + 14, y + TILE * 2.15, 22, 17);
    draw3DWindow(ctx, x + frontW - 36, y + TILE * 2.15, 22, 17);

    // Outdoor crate + 3D anvil props beside door
    ctx.fillStyle = "#8c5626";
    ctx.fillRect(x + 12, y + h - 14, 16, 14);
    ctx.fillStyle = "#b5763c";
    ctx.fillRect(x + 12, y + h - 16, 16, 4);
    ctx.fillStyle = "#3a4046";
    ctx.fillRect(x + frontW - 26, y + h - 10, 14, 10);
    ctx.fillStyle = "#6c757d";
    ctx.fillRect(x + frontW - 29, y + h - 13, 18, 4);
  } else if (b.id === "postOffice") {
    drawPitchedRoof25D(ctx, x, y, w, TILE * 1.12, b.roof, rightDepth);
    draw3DAwning(ctx, x, y + TILE * 1.12, frontW, "#2980b9", "#ffffff");
    draw3DDoor(ctx, doorCx, y + h, 24, 27, "#1e4d6e", true);
    draw3DWindow(ctx, x + 22, y + TILE * 2.15, 20, 17);
    draw3DWindow(ctx, x + frontW - 42, y + TILE * 2.15, 20, 17);

    // 3D Cylindrical Red Pillar Mailbox with curved cap & drop shadow
    const pbx = x + 10, pby = y + h - 25;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(pbx + 10, y + h + 1, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b03224";
    ctx.fillRect(pbx, pby + 4, 15, 21);
    ctx.fillStyle = "#d94635";
    ctx.fillRect(pbx, pby + 4, 10, 21);
    ctx.fillStyle = "#8e251a";
    ctx.beginPath();
    ctx.arc(pbx + 7.5, pby + 4, 7.5, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#f5c518";
    ctx.fillRect(pbx + 3, pby + 7, 9, 3);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(pbx + 4, pby + 13, 7, 5);
  } else {
    // Game Market & Bazaar: vibrant 2.5D merchant halls with crates & barrels
    drawPitchedRoof25D(ctx, x, y, w, TILE * 1.12, b.roof, rightDepth);
    draw3DAwning(ctx, x, y + TILE * 1.12, frontW, b.roof, "#fff8e7");
    draw3DDoor(ctx, doorCx, y + h, 24, 27, "#4a2e17", true);

    // Symmetrical 3D windows
    for (let i = 0; i < b.w - 1; i++) {
      const wx = x + i * TILE + 12;
      if (Math.abs(wx + 9 - doorCx) < 24) continue;
      if (wx + 20 > x + frontW - 6) continue;
      draw3DWindow(ctx, wx, y + TILE * 2.15, 19, 17);
    }

    // Merchant display barrels & seed crate out front
    ctx.fillStyle = "#7d4c22";
    ctx.fillRect(x + 9, y + h - 13, 15, 13);
    ctx.fillStyle = "#e0b646";
    ctx.fillRect(x + 11, y + h - 15, 11, 3);
    ctx.fillStyle = "#5c3518";
    ctx.beginPath();
    ctx.ellipse(x + frontW - 15, y + h - 6, 7, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#915c2d";
    ctx.beginPath();
    ctx.ellipse(x + frontW - 15, y + h - 11, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
