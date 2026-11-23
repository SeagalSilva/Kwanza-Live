// Procedural 2D vector sprites for Dungeon enemies, Bosses, Player HP bar, and Death Loot Bags.

const UI_FONT = "system-ui,-apple-system,Segoe UI,Roboto,sans-serif";

export function drawPlayerDungeonHpBar(ctx, cx, topY, hp, maxHp) {
  const safeMax = Math.max(1, Number(maxHp) || 120);
  const safeHp = Math.max(0, Math.min(safeMax, Number(hp) || 0));
  const ratio = safeHp / safeMax;

  const w = 52;
  const h = 8;
  const x = cx - w / 2;
  const y = topY;

  ctx.save();
  // Dark rounded pill frame
  ctx.fillStyle = "rgba(8, 16, 12, 0.88)";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - 1, y - 1, w + 2, h + 2, 4);
  else ctx.rect(x - 1, y - 1, w + 2, h + 2);
  ctx.fill();

  const barColor = ratio > 0.5 ? "#2ecc71" : ratio > 0.25 ? "#f39c12" : "#e74c3c";
  if (safeHp > 0) {
    ctx.fillStyle = barColor;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, Math.max(4, w * ratio), h, 3);
    else ctx.rect(x, y, Math.max(4, w * ratio), h);
    ctx.fill();
  }

  // Gloss highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.24)";
  ctx.fillRect(x + 1, y + 1, Math.max(0, w * ratio - 2), 2);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - 1, y - 1, w + 2, h + 2, 4);
  else ctx.rect(x - 1, y - 1, w + 2, h + 2);
  ctx.stroke();

  // Numeric HP label
  ctx.font = `800 9.5px ${UI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.fillText(`❤️ ${safeHp}/${safeMax}`, cx + 0.8, y - 6.2);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`❤️ ${safeHp}/${safeMax}`, cx, y - 7);
  ctx.restore();
}

export function drawDungeonDropBag(ctx, drop, cx, cy, time, isMine) {
  const pulse = 0.6 + Math.sin(time * 4.5) * 0.35;
  ctx.save();

  // Ground glow
  ctx.fillStyle = isMine
    ? `rgba(217, 83, 79, ${0.28 * pulse})`
    : `rgba(245, 197, 24, ${0.34 * pulse})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 8, 18, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 7, 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Leather loot satchel
  ctx.fillStyle = isMine ? "#6b3838" : "#8b5a2b";
  ctx.strokeStyle = isMine ? "#ff8e8b" : "#f5c518";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, cy + 1, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Bag tied neck
  ctx.fillStyle = "#c89d54";
  ctx.fillRect(cx - 5, cy - 10, 10, 4);
  ctx.fillStyle = "#5c3a1d";
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - 10);
  ctx.lineTo(cx - 8, cy - 15);
  ctx.lineTo(cx + 8, cy - 15);
  ctx.lineTo(cx + 6, cy - 10);
  ctx.closePath();
  ctx.fill();

  // Skull emblem on front
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy + 1, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1b1500";
  ctx.fillRect(cx - 2.2, cy, 1.4, 1.4);
  ctx.fillRect(cx + 0.8, cy, 1.4, 1.4);

  ctx.restore();
}

export function drawDungeonEnemy(ctx, enemy, cx, cy, time, opts = {}) {
  const { isFocused = false, lungeX = 0, lungeY = 0, chargeRatio = 0, facing = 1 } = opts;
  const isBoss = !!enemy.isBoss;
  const isMiniBoss = !!enemy.isMiniBoss;
  const scale = isBoss ? 1.48 : isMiniBoss ? 1.24 : 1.0;

  const px = cx + lungeX;
  const py = cy + lungeY;
  const bob = Math.sin(time * 4.2 + (enemy.x || 0) * 1.7) * 1.8;

  ctx.save();

  // Aggro / melee attack telegraph ring
  if (chargeRatio > 0.25) {
    ctx.strokeStyle = `rgba(231, 76, 60, ${0.35 + chargeRatio * 0.6})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 11 * scale, 16 * scale, 7 * scale, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * chargeRatio);
    ctx.stroke();
  }

  // Target lock highlight
  if (isFocused) {
    ctx.strokeStyle = "#f5c518";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 11 * scale, 18 * scale, 8 * scale, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Boss rune circle
  if (isBoss) {
    ctx.fillStyle = `rgba(245, 197, 24, ${0.14 + Math.sin(time * 3) * 0.06})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 10, 28, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(89, 209, 122, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Drop shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  ctx.beginPath();
  ctx.ellipse(px, cy + 11 * scale, 13 * scale, 5.2 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(px, py + bob);
  ctx.scale(scale * facing, scale);

  const kind = enemy.kind || "moss_slime";

  if (kind === "moss_slime") {
    drawSlime(ctx, time);
  } else if (kind === "wild_boar") {
    drawBoar(ctx);
  } else if (kind === "canopy_spider" || kind === "spider_queen") {
    drawSpider(ctx, time, kind === "spider_queen");
  } else if (kind === "forest_wolf" || kind === "alpha_wolf") {
    drawWolf(ctx, time, kind === "alpha_wolf");
  } else if (kind === "goblin_scout" || kind === "goblin_guard" || kind === "goblin_shaman") {
    drawGoblin(ctx, kind);
  } else if (kind === "forest_wisp") {
    drawWisp(ctx, time);
  } else if (kind === "elder_forest_guardian") {
    drawElderBoss(ctx, time);
  } else {
    // young_treant, dark_treant, treant_sentinel
    drawTreant(ctx, kind === "dark_treant");
  }

  ctx.restore();

  // Enemy HP Bar above sprite
  const barW = isBoss ? 48 : 32;
  const barH = isBoss ? 6 : 5;
  const bx = px - barW / 2;
  const by = py - (isBoss ? 34 : 23) + bob;
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
  ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
  const ratio = Math.max(0, Math.min(1, enemy.hp / Math.max(1, enemy.maxHp)));
  ctx.fillStyle = isBoss ? "#f5c518" : "#e74c3c";
  ctx.fillRect(bx, by, Math.max(2, barW * ratio), barH);
  ctx.restore();
}

function drawSlime(ctx, time) {
  const squish = 1 + Math.sin(time * 5) * 0.06;
  ctx.save();
  ctx.scale(squish, 2 - squish);
  const grad = ctx.createRadialGradient(-3, -4, 2, 0, 2, 14);
  grad.addColorStop(0, "#7cf59b");
  grad.addColorStop(1, "#1e7a3b");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "#0b2e16";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-12, 8);
  ctx.quadraticCurveTo(-13, -10, 0, -11);
  ctx.quadraticCurveTo(13, -10, 12, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Leaf sprout on head
  ctx.fillStyle = "#59d17a";
  ctx.beginPath();
  ctx.ellipse(2, -13, 5, 2.5, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Angry eyes
  ctx.fillStyle = "#ff4d4d";
  ctx.fillRect(-6, -2, 3.5, 3);
  ctx.fillRect(2.5, -2, 3.5, 3);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-5, -1.5, 1.2, 1.2);
  ctx.fillRect(3.5, -1.5, 1.2, 1.2);
  ctx.restore();
}

function drawBoar(ctx) {
  // Legs
  ctx.fillStyle = "#3b2316";
  ctx.fillRect(-9, 5, 4, 6);
  ctx.fillRect(4, 5, 4, 6);

  // Bristled body
  ctx.fillStyle = "#6e4228";
  ctx.strokeStyle = "#24130a";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(0, 1, 13, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Dark dorsal mane
  ctx.fillStyle = "#3a2114";
  ctx.beginPath();
  ctx.ellipse(-2, -6, 8, 3.5, -0.15, 0, Math.PI * 2);
  ctx.fill();

  // Snout
  ctx.fillStyle = "#d99b82";
  ctx.beginPath();
  ctx.ellipse(11, 2, 4.5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Curved ivory tusks
  ctx.fillStyle = "#fff9e6";
  ctx.beginPath();
  ctx.moveTo(9, 4);
  ctx.quadraticCurveTo(16, 4, 15, -2);
  ctx.lineTo(12.5, 1);
  ctx.closePath();
  ctx.fill();

  // Red eye
  ctx.fillStyle = "#ff3b3b";
  ctx.beginPath();
  ctx.arc(6, -2, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpider(ctx, time, isQueen) {
  // 8 articulated legs
  ctx.strokeStyle = isQueen ? "#2d1338" : "#181a1c";
  ctx.lineWidth = 2.2;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i++) {
      const wiggle = Math.sin(time * 9 + i * 1.3 + side) * 1.8;
      const startY = -3 + i * 2.5;
      const kneeX = side * (11 + (i % 2) * 2);
      const kneeY = startY - 5 + wiggle * 0.4;
      const footX = side * (15 + (i % 2) * 2);
      const footY = startY + 5 + wiggle;
      ctx.beginPath();
      ctx.moveTo(side * 4, startY);
      ctx.lineTo(kneeX, kneeY);
      ctx.lineTo(footX, footY);
      ctx.stroke();
    }
  }

  // Abdomen
  ctx.fillStyle = isQueen ? "#4a1c5c" : "#272b30";
  ctx.strokeStyle = "#0e0f12";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, -3, 9, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Venom markings
  ctx.fillStyle = isQueen ? "#e056fd" : "#c0392b";
  ctx.beginPath();
  ctx.arc(0, -4, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Head + multi-eyes
  ctx.fillStyle = isQueen ? "#381447" : "#1d2024";
  ctx.beginPath();
  ctx.arc(0, 5, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ff2e4c";
  for (const ex of [-3, -1, 1, 3]) {
    ctx.beginPath();
    ctx.arc(ex, 6.5, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWolf(ctx, time, isAlpha) {
  const wag = Math.sin(time * 8) * 2;
  // Tail
  ctx.strokeStyle = isAlpha ? "#b8860b" : "#5a6670";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-10, 2);
  ctx.quadraticCurveTo(-16, -2 + wag, -14, -6 + wag);
  ctx.stroke();

  // Body
  ctx.fillStyle = isAlpha ? "#464d57" : "#687480";
  ctx.strokeStyle = "#1a2026";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(-1, 3, 11, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Head
  ctx.fillStyle = isAlpha ? "#373e47" : "#596570";
  ctx.beginPath();
  ctx.arc(7, -3, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Pointed ears
  ctx.fillStyle = isAlpha ? "#f5c518" : "#49535c";
  ctx.beginPath();
  ctx.moveTo(3, -8); ctx.lineTo(5, -15); ctx.lineTo(8, -8);
  ctx.moveTo(8, -8); ctx.lineTo(11, -15); ctx.lineTo(12, -7);
  ctx.fill();

  // Muzzle + Fangs
  ctx.fillStyle = "#8a96a3";
  ctx.beginPath();
  ctx.ellipse(12, -1, 4.5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(12, 1, 1.5, 2.5);

  // Amber/Red eye
  ctx.fillStyle = isAlpha ? "#ff3838" : "#ffd32a";
  ctx.beginPath();
  ctx.arc(9, -4, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawGoblin(ctx, kind) {
  const isShaman = kind === "goblin_shaman";
  const isGuard = kind === "goblin_guard";

  // Body armor / tunic
  ctx.fillStyle = isShaman ? "#5b2c6f" : "#6d4c3d";
  ctx.strokeStyle = "#1b1410";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(-7, -1, 14, 12, 4) : ctx.rect(-7, -1, 14, 12);
  ctx.fill();
  ctx.stroke();

  // Pointed ears
  ctx.fillStyle = "#4fa34d";
  ctx.beginPath();
  ctx.moveTo(-6, -7); ctx.lineTo(-14, -10); ctx.lineTo(-6, -4);
  ctx.moveTo(6, -7); ctx.lineTo(14, -10); ctx.lineTo(6, -4);
  ctx.fill();
  ctx.stroke();

  // Goblin Head
  ctx.fillStyle = "#5bbd58";
  ctx.beginPath();
  ctx.arc(0, -6, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Glowing eyes
  ctx.fillStyle = "#ffe600";
  ctx.fillRect(-4, -8, 2.8, 2.5);
  ctx.fillRect(1.2, -8, 2.8, 2.5);

  // Weapon (Shield / Staff / Spear)
  if (isGuard) {
    ctx.fillStyle = "#795548";
    ctx.strokeStyle = "#d4ac0d";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(-9, 3, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = "#8d6e63";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(9, 10);
  ctx.lineTo(11, -13);
  ctx.stroke();

  if (isShaman) {
    ctx.fillStyle = "#59d17a";
    ctx.beginPath();
    ctx.arc(11, -14, 3.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "#cfd8dc";
    ctx.beginPath();
    ctx.moveTo(9, -12); ctx.lineTo(11.5, -18); ctx.lineTo(13, -12);
    ctx.closePath();
    ctx.fill();
  }
}

function drawWisp(ctx, time) {
  const glow = 0.75 + Math.sin(time * 6) * 0.25;
  ctx.fillStyle = `rgba(46, 213, 115, ${0.28 * glow})`;
  ctx.beginPath();
  ctx.arc(0, -3, 14, 0, Math.PI * 2);
  ctx.fill();

  // Wispy tail
  ctx.fillStyle = "#1abc9c";
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.quadraticCurveTo(0, 14 + Math.sin(time * 7) * 3, 7, 0);
  ctx.arc(0, -3, 8, 0, Math.PI * 2);
  ctx.fill();

  // Carved forest mask
  ctx.fillStyle = "#e8f8f5";
  ctx.beginPath();
  ctx.ellipse(0, -3, 6, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0b241d";
  ctx.fillRect(-3.5, -5, 2.3, 3);
  ctx.fillRect(1.2, -5, 2.3, 3);
}

function drawTreant(ctx, isDark) {
  // Bark trunk + roots
  ctx.fillStyle = isDark ? "#3b2621" : "#5d4037";
  ctx.strokeStyle = "#1a110e";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-9, 10);
  ctx.lineTo(-6, -6);
  ctx.lineTo(6, -6);
  ctx.lineTo(9, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Leaf canopy crown
  ctx.fillStyle = isDark ? "#1e5631" : "#2e7d32";
  for (const [cx, cy, r] of [[-8, -6, 6.5], [8, -6, 6.5], [0, -10, 10]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Knot eyes
  ctx.fillStyle = isDark ? "#ff5252" : "#ffca28";
  ctx.fillRect(-4, -3, 2.5, 2.5);
  ctx.fillRect(1.5, -3, 2.5, 2.5);
}

function drawElderBoss(ctx, time) {
  // Towering gnarled trunk
  ctx.fillStyle = "#3e2723";
  ctx.strokeStyle = "#120a07";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-12, 11);
  ctx.lineTo(-9, -8);
  ctx.lineTo(9, -8);
  ctx.lineTo(12, 11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Glowing emerald chest core
  const pulse = 0.7 + Math.sin(time * 4.5) * 0.3;
  ctx.fillStyle = `rgba(89, 209, 122, ${pulse})`;
  ctx.beginPath();
  ctx.arc(0, 2, 4.2, 0, Math.PI * 2);
  ctx.fill();

  // Leafy shoulders & crown
  ctx.fillStyle = "#1b5e20";
  for (const [cx, cy, r] of [[-10, -7, 7], [10, -7, 7], [0, -12, 11]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Massive Antler Horns
  ctx.strokeStyle = "#d7ccc8";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-6, -15); ctx.lineTo(-14, -22); ctx.lineTo(-12, -26);
  ctx.moveTo(6, -15); ctx.lineTo(14, -22); ctx.lineTo(12, -26);
  ctx.stroke();

  // Golden Boss Crown
  ctx.fillStyle = "#f5c518";
  ctx.beginPath();
  ctx.moveTo(-5, -18);
  ctx.lineTo(-6, -24);
  ctx.lineTo(-2, -20);
  ctx.lineTo(0, -25);
  ctx.lineTo(2, -20);
  ctx.lineTo(6, -24);
  ctx.lineTo(5, -18);
  ctx.closePath();
  ctx.fill();

  // Glowing crimson eyes
  ctx.fillStyle = "#ff1744";
  ctx.fillRect(-5, -6, 3.2, 2.8);
  ctx.fillRect(1.8, -6, 3.2, 2.8);
}
