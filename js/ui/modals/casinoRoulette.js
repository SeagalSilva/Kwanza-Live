import { S, bal } from "../../state.js";
import { t } from "../../i18n.js";
import { esc } from "../../utils.js";
import { money } from "../../data/currencies.js";
import {
  MAIN_ROULETTE_SLICES,
  BONUS_ROULETTE_SLICES,
  SUPER_ROULETTE_SLICES,
  spinRoulette,
  forfeitRouletteFreeSpins
} from "../../systems/casino.js";
import {
  playRouletteTick,
  playRouletteWin,
  playCasinoLoss,
  playBonusTrigger,
  playMegaWin
} from "../../systems/audio.js";
import { playRouletteCelebration } from "./casinoFx.js";
import { openModal } from "../modal.js";
import { toast } from "../toast.js";

function drawWheelCanvas(canvas, slices, angleRad, activeGlow = false, tickMs = 0) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 5;
  const r = outerR - 11;
  const n = slices.length;
  const step = (Math.PI * 2) / n;

  ctx.clearRect(0, 0, size, size);
  ctx.save();

  // Outer drop shadow & metallic mahogany/brass bezel
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  const rimGrad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.3, cx, cy, outerR);
  if (activeGlow) {
    rimGrad.addColorStop(0, "#fff2a8");
    rimGrad.addColorStop(0.75, "#f5c518");
    rimGrad.addColorStop(1, "#9a6b00");
  } else {
    rimGrad.addColorStop(0, "#7c5223");
    rimGrad.addColorStop(0.72, "#462910");
    rimGrad.addColorStop(1, "#211206");
  }
  ctx.fillStyle = rimGrad;
  ctx.fill();
  ctx.strokeStyle = activeGlow ? "#ffe680" : "rgba(245, 197, 24, .55)";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Marquee LED bulbs around bezel
  const bulbCount = n <= 4 ? 12 : Math.max(24, n * 2);
  const phase = Math.floor(tickMs / 240) % 2;
  const bulbR = outerR - 5.5;
  for (let i = 0; i < bulbCount; i++) {
    const ba = (i * Math.PI * 2) / bulbCount;
    const bx = cx + Math.cos(ba) * bulbR;
    const by = cy + Math.sin(ba) * bulbR;
    const lit = (i % 2) === phase || activeGlow;
    ctx.beginPath();
    ctx.arc(bx, by, n <= 4 ? 1.9 : 2.3, 0, Math.PI * 2);
    ctx.fillStyle = lit ? "#fff4b8" : "#6e4e18";
    ctx.fill();
  }

  // Inner golden track border
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2);
  ctx.strokeStyle = "#f5c518";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Slices with subtle radial sheen
  for (let i = 0; i < n; i++) {
    const start = angleRad + i * step;
    const end = start + step;
    const sl = slices[i];

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();

    const wGrad = ctx.createRadialGradient(cx, cy, r * 0.14, cx, cy, r);
    wGrad.addColorStop(0, sl.color);
    wGrad.addColorStop(0.75, sl.color);
    wGrad.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = sl.color;
    ctx.fill();
    ctx.fillStyle = wGrad;
    ctx.globalAlpha = 0.28;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = "rgba(255, 224, 130, 0.45)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Label rotated radially
    const mid = start + step / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(mid) * (r * 0.66), cy + Math.sin(mid) * (r * 0.66));
    ctx.rotate(mid + Math.PI / 2);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 2;
    ctx.font = n <= 4 ? "800 10.5px system-ui,sans-serif" : (size < 160 ? "800 9px system-ui,sans-serif" : "800 10.5px system-ui,sans-serif");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(sl.short, 0, 0);
    ctx.restore();
  }

  // Brass pegs on slice boundaries
  for (let i = 0; i < n; i++) {
    const pa = angleRad + i * step;
    const px = cx + Math.cos(pa) * (r - 2);
    const py = cy + Math.sin(pa) * (r - 2);
    ctx.beginPath();
    ctx.arc(px, py, size < 150 ? 1.8 : 2.3, 0, Math.PI * 2);
    ctx.fillStyle = "#ffe58f";
    ctx.fill();
    ctx.strokeStyle = "#5c3d00";
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  // Inner metallic hub
  const hubR = n <= 4 ? 12 : (size < 160 ? 14 : 18);
  const hubGrad = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, hubR);
  hubGrad.addColorStop(0, "#ffe896");
  hubGrad.addColorStop(0.55, "#b7830b");
  hubGrad.addColorStop(1, "#3b2304");
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
  ctx.fillStyle = hubGrad;
  ctx.fill();
  ctx.strokeStyle = "#fff1b5";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, hubR * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = "#9b1c31";
  ctx.fill();

  // Top pointer clapper with subtle peg deflection
  const relTop = (((-Math.PI / 2 - angleRad) % step) + step) % step;
  const nearPeg = relTop < 0.14 ? (0.14 - relTop) * 2.1 : 0;
  ctx.save();
  ctx.translate(cx, 2);
  ctx.rotate(nearPeg);
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(7, 0);
  ctx.lineTo(0, 15);
  ctx.closePath();
  ctx.fillStyle = "#ffe066";
  ctx.fill();
  ctx.strokeStyle = "#3b2300";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

export function openCasinoRoulette() {
  let betAmount = 1;
  let spinning = false;
  let mainAngle = -Math.PI / 2;
  let bonusAngle = -Math.PI / 2;
  let superAngle = -Math.PI / 2;
  let lastOutcome = null;
  let bonusGlow = false;
  let superGlow = false;
  let idleRaf = null;
  let pendingResult = null;
  let celebratingUntil = 0;

  openModal({
    title: () => `🎡 ${t("cas.rouletteTitle")}`,
    events: ["save", "lang"],
    shouldRepaint: (evt) => !spinning && (evt !== "save" || Date.now() >= celebratingUntil),
    onClose() {
      if (idleRaf) { cancelAnimationFrame(idleRaf); idleRaf = null; }
      const earlyRes = pendingResult;
      if (earlyRes?.settle) {
        pendingResult = null;
        earlyRes.settle();
      }
      if ((S.casino.roulette?.freeSpins || 0) > 0 || (earlyRes?.session?.freeSpins || 0) > 0) {
        forfeitRouletteFreeSpins();
        toast(t("cas.freeSpinsLost"), "bad");
      }
    },
    render(body, api) {
      const freeSpins = S.casino.roulette?.freeSpins || 0;
      const lockedBet = S.casino.roulette?.lockedBet || 0;
      const betLocked = freeSpins > 0 && lockedBet > 0;
      const activeBet = betLocked ? lockedBet : betAmount;
      const myBronze = bal("bronze");

      body.innerHTML = `
        <div class="cas-wrap">
          <div class="cas-wheels">
            <div class="cas-wheel-main">
              <div class="cas-wheel-lbl">🎡 ${esc(t("cas.mainWheel"))}</div>
              <canvas id="cas-main-wheel" width="194" height="194"></canvas>
            </div>
            <div class="cas-wheels-side">
              <div class="cas-wheel-box${bonusGlow ? " active" : ""}" id="cas-box-bonus">
                <div class="cas-wheel-lbl">✨ ${esc(t("cas.bonusWheel"))}</div>
                <canvas id="cas-bonus-wheel" width="106" height="106"></canvas>
              </div>
              <div class="cas-wheel-box${superGlow ? " active" : ""}" id="cas-box-super">
                <div class="cas-wheel-lbl">⚡ ${esc(t("cas.superWheel"))}</div>
                <canvas id="cas-super-wheel" width="128" height="128"></canvas>
              </div>
            </div>
          </div>

          ${betLocked ? `
            <div class="cas-fs-banner">
              <strong>🎟️ ${esc(t("cas.freeSpinsActive", { n: freeSpins, bet: lockedBet }))}</strong>
              <small>${esc(t("cas.freeSpinsWarn"))}</small>
            </div>
          ` : ""}

          <button id="cas-spin-btn" class="btn gold big cas-spin-primary" type="button" ${spinning || (!betLocked && myBronze < activeBet) ? "disabled" : ""}>
            ${betLocked ? `🎟️ ${esc(t("cas.btnSpinFree", { n: freeSpins }))}` : `🎡 ${esc(t("cas.btnSpin"))} (${activeBet} 🥉)`}
          </button>

          <div id="cas-roulette-msg" class="cas-outcome ${lastOutcome ? lastOutcome.kind : ""}">
            ${lastOutcome ? esc(lastOutcome.text) : esc(t("cas.rouletteHint"))}
          </div>

          <div class="cas-bet-card">
            <div class="cas-bet-bar">
              <span class="money">${money(myBronze, "bronze")}</span>
              <div class="cas-bet-row">
                <span class="muted" style="font-size:12px;">${esc(t("cas.betAmount"))}${betLocked ? " 🔒" : ""}:</span>
                <input id="cas-bet-input" type="number" min="1" max="10000" value="${activeBet}" ${betLocked || spinning ? "disabled" : ""} />
                <span>🥉</span>
              </div>
            </div>
            <div class="cas-presets">
              ${[1, 5, 10, 25, 50, 100].map((v) => `
                <button type="button" class="btn alt small${activeBet === v ? " on" : ""}" data-bet="${v}" ${betLocked || spinning ? "disabled" : ""}>${v} 🥉</button>
              `).join("")}
            </div>
          </div>

          <div class="cas-legend">
            <span><b>8×</b> ${esc(t("cas.sliceLoss"))}</span>
            <span><b>2×</b> +2 FS</span>
            <span><b>2×</b> +50%</span>
            <span><b>1×</b> 2×</span>
            <span><b>1×</b> 🎡 ${esc(t("cas.bonusLegend"))}</span>
            <span><b>1×</b> ⚡ ${esc(t("cas.superLegend"))}</span>
          </div>
        </div>
      `;

      const mainCanvas = body.querySelector("#cas-main-wheel");
      const bonusCanvas = body.querySelector("#cas-bonus-wheel");
      const superCanvas = body.querySelector("#cas-super-wheel");
      const boxBonus = body.querySelector("#cas-box-bonus");
      const boxSuper = body.querySelector("#cas-box-super");
      const betInput = body.querySelector("#cas-bet-input");
      const spinBtn = body.querySelector("#cas-spin-btn");
      const msgEl = body.querySelector("#cas-roulette-msg");

      if (idleRaf) cancelAnimationFrame(idleRaf);
      const startIdleLoop = () => {
        const tick = (now) => {
          if (!mainCanvas?.isConnected) return;
          if (!spinning) {
            drawWheelCanvas(mainCanvas, MAIN_ROULETTE_SLICES, mainAngle, false, now);
            drawWheelCanvas(bonusCanvas, BONUS_ROULETTE_SLICES, bonusAngle, bonusGlow, now);
            drawWheelCanvas(superCanvas, SUPER_ROULETTE_SLICES, superAngle, superGlow, now);
          }
          idleRaf = requestAnimationFrame(tick);
        };
        idleRaf = requestAnimationFrame(tick);
      };
      startIdleLoop();

      const syncBetUi = () => {
        if (betLocked) return;
        const v = Math.max(1, Math.min(10000, Math.floor(Number(betInput.value) || 1)));
        betAmount = v;
        if (spinBtn) {
          spinBtn.disabled = spinning || bal("bronze") < betAmount;
          spinBtn.textContent = `🎡 ${t("cas.btnSpin")} (${betAmount} 🥉)`;
        }
      };

      if (betInput && !betLocked) betInput.oninput = syncBetUi;

      body.querySelectorAll("[data-bet]").forEach((btn) => {
        btn.onclick = () => {
          if (betLocked || spinning) return;
          betAmount = Number(btn.dataset.bet);
          if (betInput) betInput.value = betAmount;
          body.querySelectorAll("[data-bet]").forEach((b) => b.classList.toggle("on", Number(b.dataset.bet) === betAmount));
          syncBetUi();
        };
      });

      const animateWheel = (canvas, slices, fromAngle, targetSliceIdx, durationMs, glow) =>
        new Promise((resolve) => {
          const step = (Math.PI * 2) / slices.length;
          const desiredMod = -Math.PI / 2 - (targetSliceIdx + 0.5) * step;
          const curMod = ((fromAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          const wantMod = ((desiredMod % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          let delta = wantMod - curMod;
          if (delta <= 0) delta += Math.PI * 2;
          const totalDelta = delta + 6 * Math.PI * 2;
          const start = performance.now();
          let lastPegIdx = Math.floor((-Math.PI / 2 - fromAngle) / step);

          function frame(now) {
            if (!canvas.isConnected) return resolve(fromAngle + totalDelta);
            const p = Math.min(1, (now - start) / durationMs);
            const ease = 1 - Math.pow(1 - p, 3.4);
            const cur = fromAngle + totalDelta * ease;
            const pegIdx = Math.floor((-Math.PI / 2 - cur) / step);
            if (pegIdx !== lastPegIdx) {
              lastPegIdx = pegIdx;
              playRouletteTick();
            }
            drawWheelCanvas(canvas, slices, cur, glow, now);
            if (p < 1) requestAnimationFrame(frame);
            else resolve(cur);
          }
          requestAnimationFrame(frame);
        });

      if (spinBtn) {
        spinBtn.onclick = async () => {
          if (spinning) return;
          const chosenBet = betLocked ? lockedBet : Math.max(1, Math.floor(Number(betInput?.value) || betAmount));
          if (!betLocked && bal("bronze") < chosenBet) {
            toast(t("msg.notEnough"), "bad");
            return;
          }

          spinning = true;
          celebratingUntil = 0;
          bonusGlow = false;
          superGlow = false;
          boxBonus?.classList.remove("active");
          boxSuper?.classList.remove("active");
          spinBtn.disabled = true;
          if (betInput) betInput.disabled = true;
          body.querySelectorAll("[data-bet]").forEach((b) => { b.disabled = true; });
          if (msgEl) {
            msgEl.className = "cas-outcome";
            msgEl.textContent = t("cas.spinning");
          }

          const res = await spinRoulette(chosenBet);
          if (!res) {
            spinning = false;
            if (body.isConnected) api.repaint();
            return;
          }
          pendingResult = res;

          mainAngle = await animateWheel(mainCanvas, MAIN_ROULETTE_SLICES, mainAngle, res.mainIndex, 2300, false);

          if (res.bonusSlice) {
            bonusGlow = true;
            boxBonus?.classList.add("active");
            playBonusTrigger();
            if (msgEl) msgEl.textContent = t("cas.bonusTriggered");
            bonusAngle = await animateWheel(bonusCanvas, BONUS_ROULETTE_SLICES, bonusAngle, res.bonusSlice.index, 2000, true);
          } else if (res.superSlice) {
            superGlow = true;
            boxSuper?.classList.add("active");
            playBonusTrigger();
            if (msgEl) msgEl.textContent = t("cas.superTriggered");
            superAngle = await animateWheel(superCanvas, SUPER_ROULETTE_SLICES, superAngle, res.superSlice.index, 2300, true);
          }

          // Only commit payout coins and update session state after ALL wheel animations have finished
          const settled = pendingResult;
          pendingResult = null;
          if (settled?.settle) await settled.settle();

          const isMega = res.payout > 0 && res.bet > 0 && res.payout >= res.bet * 10;
          if (res.payout > 0 || res.freeSpinsAdded > 0) {
            if (isMega) playMegaWin();
            else if (res.payout > 0) playRouletteWin();
            else playBonusTrigger();

            let text = "";
            if (res.bonusSlice) {
              const bLbl = t(BONUS_ROULETTE_SLICES[res.bonusSlice.index].labelKey);
              text = res.payout > 0
                ? t("cas.winPayout", { amount: res.payout, detail: bLbl })
                : t("cas.winFreeSpins", { n: res.freeSpinsAdded, detail: bLbl });
            } else if (res.superSlice) {
              const sl = res.superSlice;
              text = sl.type === "mult"
                ? t("cas.winPayout", { amount: res.payout, detail: `${sl.short} (${t("cas.superWheel")})` })
                : t("cas.winFreeSpins", { n: res.freeSpinsAdded, detail: `${sl.short} (${t("cas.superWheel")})` });
            } else if (res.freeSpinsAdded > 0) {
              text = t("cas.winFreeSpins", { n: res.freeSpinsAdded, detail: t("cas.slice2FS") });
            } else {
              text = t("cas.winPayout", { amount: res.payout, detail: t(MAIN_ROULETTE_SLICES[res.mainIndex].labelKey) });
            }
            lastOutcome = { kind: "win", text };
            celebratingUntil = Date.now() + 1900;
          } else if (res.superSlice) {
            playCasinoLoss();
            lastOutcome = { kind: "lose", text: t("cas.superLoss") };
          } else {
            playCasinoLoss();
            lastOutcome = { kind: "lose", text: t("cas.rouletteLost") };
          }

          spinning = false;
          if (body.isConnected) {
            api.repaint();
            if (res.payout > 0 || res.freeSpinsAdded > 0) {
              playRouletteCelebration(body.querySelector(".cas-wheels"), {
                payout: res.payout,
                bet: res.bet,
                freeSpinsAdded: res.freeSpinsAdded,
                isBonusWheel: !!res.bonusSlice,
                isSuperWheel: !!res.superSlice
              });
            }
          }
        };
      }
    }
  });
}
