// Game-specific visual win animations for Betting House (Set 1, Set 2, Set 3 VIP, Roulette)
// + distinct Bonus, Scatter, and +10x Mega Win celebrations.
import { t, fmtNum } from "../../i18n.js";

function animateCount(el, target, prefix = "+", suffix = " 🥉", durationMs = 520) {
  if (!el || target <= 0) return;
  const start = performance.now();
  function step(now) {
    if (!el.isConnected) return;
    const p = Math.min(1, (now - start) / durationMs);
    const val = Math.round(target * (1 - Math.pow(1 - p, 3)));
    el.textContent = `${prefix}${fmtNum(val)}${suffix}`;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function spawnParticle(overlay, { icon = "✨", dx = 0, dy = -60, rot = 180, delay = 0, dur = 1000, startX = "50%", startY = "50%", chipColor = null } = {}) {
  const el = document.createElement("span");
  el.className = chipColor ? "cas-pt chip" : "cas-pt";
  el.style.left = startX;
  el.style.top = startY;
  el.style.setProperty("--dx", `${dx}px`);
  el.style.setProperty("--dy", `${dy}px`);
  el.style.setProperty("--rot", `${rot}deg`);
  el.style.setProperty("--delay", `${delay}ms`);
  el.style.setProperty("--dur", `${dur}ms`);
  if (chipColor) {
    el.style.background = chipColor;
  } else {
    el.textContent = icon;
  }
  overlay.appendChild(el);
}

function makeOverlay(host) {
  if (!host) return null;
  host.querySelectorAll(".cas-fx-overlay").forEach((n) => n.remove());
  const ov = document.createElement("div");
  ov.className = "cas-fx-overlay";
  host.appendChild(ov);
  setTimeout(() => { if (ov.isConnected) ov.remove(); }, 2100);
  return ov;
}

export function playSlotCelebration(stageEl, { set, payout = 0, bet = 1, freeSpinsAdded = 0, freeSpinType = null }) {
  const ov = makeOverlay(stageEl);
  if (!ov) return;

  const isMega = payout > 0 && bet > 0 && payout >= bet * 10;
  const isScatter = freeSpinType === "scatter";
  const isBonus = freeSpinType === "bonus" || freeSpinType === "extra";

  // 1. 10x+ Mega Win Sunburst & Trophy
  if (isMega) {
    const sun = document.createElement("div");
    sun.className = "cas-fx-sunburst";
    ov.appendChild(sun);

    const mult = Math.round((payout / bet) * 10) / 10;
    const banner = document.createElement("div");
    banner.className = "cas-banner-fx mega";
    banner.textContent = `🏆 ${t("cas.fxMega", { mult })}`;
    ov.appendChild(banner);

    const icons = ["⭐", "🏆", "✨", "💫", "👑"];
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI * 2) / 16;
      const dist = 70 + Math.random() * 55;
      spawnParticle(ov, {
        icon: icons[i % icons.length],
        dx: Math.cos(a) * dist,
        dy: Math.sin(a) * dist * 0.75,
        rot: (Math.random() - 0.5) * 360,
        delay: i * 25,
        dur: 1200
      });
    }
  }

  // 2. Scatter Animation (Set 3 VIP 💠)
  if (isScatter) {
    const prism = document.createElement("div");
    prism.className = "cas-fx-prism";
    ov.appendChild(prism);

    const b = document.createElement("div");
    b.className = "cas-banner-fx scatter";
    b.textContent = `💠 ${t("cas.fxScatter", { n: freeSpinsAdded })}`;
    ov.appendChild(b);

    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12;
      spawnParticle(ov, {
        icon: i % 2 ? "💠" : "🌟",
        dx: Math.cos(a) * 90,
        dy: Math.sin(a) * 60,
        rot: 360,
        delay: i * 35,
        dur: 1150
      });
    }
  } else if (isBonus && freeSpinsAdded > 0) {
    // 3. Bonus Animation (🎁 / 🎟️)
    const ring = document.createElement("div");
    ring.className = "cas-fx-ring";
    ov.appendChild(ring);

    const b = document.createElement("div");
    b.className = "cas-banner-fx bonus";
    b.textContent = `${freeSpinType === "extra" ? "🎟️" : "🎁"} ${t("cas.fxBonus", { n: freeSpinsAdded })}`;
    ov.appendChild(b);

    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI * 2) / 10;
      spawnParticle(ov, {
        icon: freeSpinType === "extra" ? "🎟️" : (i % 2 ? "🎁" : "✨"),
        dx: Math.cos(a) * 82,
        dy: Math.sin(a) * 52,
        rot: 240,
        delay: i * 40,
        dur: 1100
      });
    }
  }

  // 4. Per-Set Distinct Payout Count-Up Animation
  if (payout > 0) {
    const tag = document.createElement("div");
    tag.className = `cas-win-tag set${set}`;
    const prefix = set === 1 ? "🎰 +" : set === 2 ? "⚡ +" : "👑 +";
    tag.textContent = `${prefix}0 🥉`;
    ov.appendChild(tag);
    animateCount(tag, payout, prefix, " 🥉", 560);

    if (set === 1) {
      // Classic Coin Chute Shower rising from bottom tray
      for (let i = 0; i < 8; i++) {
        spawnParticle(ov, {
          icon: i % 2 ? "🪙" : "🍒",
          startX: `${36 + Math.random() * 28}%`,
          startY: "92%",
          dx: (Math.random() - 0.5) * 90,
          dy: -65 - Math.random() * 45,
          delay: i * 45,
          dur: 950
        });
      }
    } else if (set === 2) {
      // Neon 3x3 Streak & Emerald Sparkles
      const streak = document.createElement("div");
      streak.className = "cas-fx-streak";
      ov.appendChild(streak);
      for (let i = 0; i < 9; i++) {
        spawnParticle(ov, {
          icon: i % 2 ? "⚡" : "✨",
          dx: (Math.random() - 0.5) * 140,
          dy: (Math.random() - 0.5) * 90,
          delay: i * 35,
          dur: 950
        });
      }
    } else {
      // Royal Gold VIP Fountain
      for (let i = 0; i < 12; i++) {
        spawnParticle(ov, {
          icon: i % 3 === 0 ? "👑" : i % 3 === 1 ? "💎" : "✨",
          startX: `${30 + Math.random() * 40}%`,
          startY: "60%",
          dx: (Math.random() - 0.5) * 160,
          dy: -65 - Math.random() * 55,
          delay: i * 30,
          dur: 1150
        });
      }
    }
  }
}

export function playRouletteCelebration(wheelsEl, { payout = 0, bet = 1, freeSpinsAdded = 0, isBonusWheel = false, isSuperWheel = false }) {
  const ov = makeOverlay(wheelsEl);
  if (!ov) return;

  const isMega = payout > 0 && bet > 0 && payout >= bet * 10;

  if (isMega) {
    const sun = document.createElement("div");
    sun.className = "cas-fx-sunburst";
    ov.appendChild(sun);

    const mult = Math.round((payout / bet) * 10) / 10;
    const banner = document.createElement("div");
    banner.className = "cas-banner-fx mega";
    banner.textContent = `🏆 ${t("cas.fxMega", { mult })}`;
    ov.appendChild(banner);
  } else if (isBonusWheel || isSuperWheel || freeSpinsAdded > 0) {
    const ring = document.createElement("div");
    ring.className = "cas-fx-ring";
    ov.appendChild(ring);

    if (freeSpinsAdded > 0) {
      const b = document.createElement("div");
      b.className = "cas-banner-fx bonus";
      b.textContent = `${isSuperWheel ? "⚡" : "🎟️"} ${t("cas.fxBonus", { n: freeSpinsAdded })}`;
      ov.appendChild(b);
    }
  }

  // Roulette Poker-Chip Radial Confetti (completely distinct from HUD & Slots)
  const chipColors = ["#e74c3c", "#f1c40f", "#2980b9", "#8e44ad", "#2ecc71"];
  if (payout > 0 || freeSpinsAdded > 0) {
    for (let i = 0; i < 14; i++) {
      const a = (i * Math.PI * 2) / 14;
      const dist = 70 + Math.random() * 65;
      spawnParticle(ov, {
        chipColor: chipColors[i % chipColors.length],
        dx: Math.cos(a) * dist,
        dy: Math.sin(a) * dist * 0.85,
        rot: 360,
        delay: i * 28,
        dur: 1100
      });
    }
  }

  if (payout > 0) {
    const tag = document.createElement("div");
    tag.className = "cas-win-tag roulette";
    tag.textContent = "🎡 +0 🥉";
    ov.appendChild(tag);
    animateCount(tag, payout, "🎡 +", " 🥉", 580);
  }
}
