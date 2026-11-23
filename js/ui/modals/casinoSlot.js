import { S, bal } from "../../state.js";
import { t } from "../../i18n.js";
import { esc } from "../../utils.js";
import { money } from "../../data/currencies.js";
import {
  SLOT_MACHINES,
  spinSlotMachine,
  heartbeatSlotMachine,
  releaseSlotMachine
} from "../../systems/casino.js";
import {
  playSlotLever,
  playReelStop,
  playHarvest,
  playCasinoLoss,
  playBonusTrigger,
  playScatterTrigger,
  playMegaWin
} from "../../systems/audio.js";
import { playSlotCelebration } from "./casinoFx.js";
import { openModal } from "../modal.js";
import { toast } from "../toast.js";

const BONUS_SYM = "🎁";
const WILD_SYM = "🌟";
const SCATTER_SYM = "💠";
const EXTRA_SPIN_SYM = "🎟️";

const PAYLINES_5 = [
  [0, 0, 0],
  [1, 1, 1],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0]
];

const PAYLINES_20 = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0], [2, 2, 1, 2, 2], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2], [1, 0, 1, 0, 1], [1, 2, 1, 2, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 2, 0, 2, 0], [2, 0, 2, 0, 2], [0, 0, 2, 0, 0]
];

function computeWinCellSet(machine, winningLines) {
  const set = new Set();
  if (!Array.isArray(winningLines) || !winningLines.length) return set;
  for (const w of winningLines) {
    if (machine.set === 1) {
      for (let c = 0; c < 3; c++) set.add(`0,${c}`);
    } else if (machine.set === 2) {
      const pattern = PAYLINES_5[(w.line || 1) - 1];
      if (pattern) pattern.forEach((r, c) => set.add(`${r},${c}`));
    } else {
      const pattern = PAYLINES_20[(w.line || 1) - 1];
      const len = w.matchLen || 5;
      if (pattern) {
        for (let c = 0; c < len; c++) set.add(`${pattern[c]},${c}`);
      }
    }
  }
  return set;
}

function buildInitialGrid(machine) {
  const syms = machine.symbols;
  return Array.from({ length: machine.rows }, (_, r) =>
    Array.from({ length: machine.cols }, (__, c) => syms[(r + c) % syms.length])
  );
}

function setBadgeInfo(machine) {
  if (machine.set === 1) return { odds: t("cas.set1Odds"), desc: t("cas.set1Desc") };
  if (machine.set === 2) return { odds: t("cas.set2Odds"), desc: t("cas.set2Desc") };
  return { odds: t("cas.set3Odds"), desc: t("cas.set3Desc") };
}

function modeLabel(mode) {
  if (mode === "scatter") return t("cas.slotModeScatter");
  if (mode === "extra") return t("cas.slotModeExtra");
  return t("cas.slotModeBonus");
}

function cellClassFor(sym, isWin) {
  let cls = "";
  if (sym === BONUS_SYM) cls += " bonus";
  else if (sym === WILD_SYM) cls += " wild";
  else if (sym === SCATTER_SYM || sym === EXTRA_SPIN_SYM) cls += " scatter";
  if (isWin) cls += " win-line";
  return cls;
}

export function openCasinoSlot(machineId) {
  const machine = SLOT_MACHINES.find((m) => m.id === machineId);
  if (!machine) return;

  let betAmount = 1;
  let spinning = false;
  let grid = buildInitialGrid(machine);
  let wildMults = null;
  let winCells = new Set();
  let lastMsg = null;
  let cycleTimer = null;
  let pendingResult = null;
  let celebratingUntil = 0;

  const hbTimer = setInterval(() => {
    heartbeatSlotMachine(machine.id);
  }, 20_000);

  openModal({
    title: () => `${machine.symbols[0]} ${machine.name}`,
    events: ["save", "lang", "casino"],
    shouldRepaint: (evt) => !spinning && ((evt !== "save" && evt !== "casino") || Date.now() >= celebratingUntil),
    onClose() {
      clearInterval(hbTimer);
      if (cycleTimer) { clearInterval(cycleTimer); cycleTimer = null; }
      if (pendingResult?.settle) {
        const p = pendingResult;
        pendingResult = null;
        p.settle();
      }
      releaseSlotMachine();
    },
    render(body, api) {
      const sess = S.casino.slotSession?.machineId === machine.id ? S.casino.slotSession : null;
      const freeSpins = sess?.freeSpins || 0;
      const lockedBet = sess?.lockedBet || 0;
      const betLocked = freeSpins > 0 && lockedBet > 0;
      const activeBet = betLocked ? lockedBet : betAmount;
      const myBronze = bal("bronze");
      const info = setBadgeInfo(machine);
      const maxMult = machine.set === 1 ? 8 : machine.set === 2 ? 3 : 5;

      const spinPool = [...machine.symbols];
      if (machine.set === 1) spinPool.push(EXTRA_SPIN_SYM);
      if (machine.set >= 2) spinPool.push(BONUS_SYM);
      if (machine.set === 3) spinPool.push(WILD_SYM, SCATTER_SYM);

      body.innerHTML = `
        <div class="cas-wrap">
          <div class="cas-slot-head" style="border-color: ${machine.color};">
            <span class="cas-slot-badge" style="background: ${machine.color};">🎰 ${esc(machine.name)}</span>
            <span class="muted" style="font-size: 11px;">${esc(info.odds)}</span>
          </div>

          <div class="cas-set-info">${esc(info.desc)}</div>

          ${betLocked ? `
            <div class="cas-fs-banner">
              <strong>🎟️ ${esc(t("cas.slotFreeSpinsActive", { n: freeSpins, bet: lockedBet, mode: modeLabel(sess.mode) }))}</strong>
              <small>${esc(t("cas.freeSpinsWarn"))}</small>
            </div>
          ` : ""}

          <div class="cas-stage">
            <div class="cas-grid c${machine.cols}">
              ${grid.map((row, r) =>
                row.map((sym, c) => {
                  const wMult = wildMults?.[r]?.[c] || 1;
                  const badge = sym === WILD_SYM && wMult > 1 ? `<span class="cas-wild-mult">×${wMult}</span>` : "";
                  return `<div class="cas-cell${cellClassFor(sym, winCells.has(`${r},${c}`))}" data-r="${r}" data-c="${c}">${sym}${badge}</div>`;
                }).join("")
              ).join("")}
            </div>
          </div>

          <button id="cas-slot-spin" class="btn gold big cas-spin-primary" type="button" ${spinning || (!betLocked && myBronze < activeBet) ? "disabled" : ""}>
            ${betLocked
              ? `🎟️ ${esc(t("cas.slotBtnFree", { n: freeSpins }))}`
              : `🎰 ${esc(t("cas.btnSpin"))} (${activeBet} 🥉 · ${machine.lines === 1 ? "8×" : `${machine.lines}L · ${maxMult}×`})`}
          </button>

          <div id="cas-slot-msg" class="cas-outcome ${lastMsg ? lastMsg.kind : ""}">
            ${lastMsg ? esc(lastMsg.text) : esc(t("cas.slotHint"))}
          </div>

          <div class="cas-bet-card">
            <div class="cas-bet-bar">
              <span class="money">${money(myBronze, "bronze")}</span>
              <div class="cas-bet-row">
                <span class="muted" style="font-size:12px;">${esc(t("cas.betAmount"))}${betLocked ? " 🔒" : ""}:</span>
                <input id="cas-slot-bet" type="number" min="1" max="10000" value="${activeBet}" ${betLocked || spinning ? "disabled" : ""} />
                <span>🥉</span>
              </div>
            </div>
            <div class="cas-presets">
              ${[1, 5, 10, 25, 50, 100].map((v) => `
                <button type="button" class="btn alt small${activeBet === v ? " on" : ""}" data-sbet="${v}" ${betLocked || spinning ? "disabled" : ""}>${v} 🥉</button>
              `).join("")}
            </div>
          </div>
        </div>
      `;

      const betInput = body.querySelector("#cas-slot-bet");
      const spinBtn = body.querySelector("#cas-slot-spin");
      const msgEl = body.querySelector("#cas-slot-msg");

      const syncBet = () => {
        if (betLocked) return;
        betAmount = Math.max(1, Math.min(10000, Math.floor(Number(betInput.value) || 1)));
        if (spinBtn) {
          spinBtn.disabled = spinning || bal("bronze") < betAmount;
          spinBtn.textContent = `🎰 ${t("cas.btnSpin")} (${betAmount} 🥉 · ${machine.lines === 1 ? "8×" : `${machine.lines}L · ${maxMult}×`})`;
        }
      };
      if (betInput && !betLocked) betInput.oninput = syncBet;

      body.querySelectorAll("[data-sbet]").forEach((b) => {
        b.onclick = () => {
          if (betLocked || spinning) return;
          betAmount = Number(b.dataset.sbet);
          if (betInput) betInput.value = betAmount;
          body.querySelectorAll("[data-sbet]").forEach((x) => x.classList.toggle("on", Number(x.dataset.sbet) === betAmount));
          syncBet();
        };
      });

      if (spinBtn) {
        spinBtn.onclick = async () => {
          if (spinning) return;
          const chosenBet = betLocked ? lockedBet : Math.max(1, Math.min(10000, Math.floor(Number(betInput?.value) || betAmount)));
          if (!betLocked && bal("bronze") < chosenBet) {
            toast(t("msg.notEnough"), "bad");
            return;
          }

          spinning = true;
          winCells = new Set();
          celebratingUntil = 0;
          spinBtn.disabled = true;
          if (betInput) betInput.disabled = true;
          body.querySelectorAll("[data-sbet]").forEach((x) => { x.disabled = true; });
          if (msgEl) { msgEl.className = "cas-outcome"; msgEl.textContent = t("cas.spinning"); }
          playSlotLever();

          const cells = Array.from(body.querySelectorAll(".cas-cell"));
          cells.forEach((el) => {
            el.classList.remove("bonus", "wild", "scatter", "win-line", "landed");
            el.classList.add("spinning");
          });

          if (cycleTimer) clearInterval(cycleTimer);
          cycleTimer = setInterval(() => {
            if (!body.isConnected) { clearInterval(cycleTimer); cycleTimer = null; return; }
            cells.forEach((el) => {
              if (el.classList.contains("spinning")) {
                el.textContent = spinPool[Math.floor(Math.random() * spinPool.length)];
              }
            });
          }, 65);

          const res = await spinSlotMachine(machine.id, chosenBet);
          if (!res) {
            if (cycleTimer) { clearInterval(cycleTimer); cycleTimer = null; }
            cells.forEach((el) => el.classList.remove("spinning"));
            spinning = false;
            if (body.isConnected) api.repaint();
            return;
          }
          pendingResult = res;

          // Staggered column stops left-to-right with bounce landing & reel lock sound
          const stopCol = (colIdx, delayMs) =>
            new Promise((resolve) =>
              setTimeout(() => {
                if (!body.isConnected) return resolve();
                playReelStop(colIdx);
                for (let r = 0; r < machine.rows; r++) {
                  const el = body.querySelector(`.cas-cell[data-r="${r}"][data-c="${colIdx}"]`);
                  if (!el) continue;
                  el.classList.remove("spinning");
                  el.classList.add("landed");
                  const sym = res.grid[r][colIdx];
                  const cls = cellClassFor(sym, false).trim();
                  if (cls) cls.split(" ").forEach((c) => el.classList.add(c));
                  const wMult = res.wildMults?.[r]?.[colIdx] || 1;
                  el.innerHTML = sym + (sym === WILD_SYM && wMult > 1 ? `<span class="cas-wild-mult">×${wMult}</span>` : "");
                }
                resolve();
              }, delayMs)
            );

          for (let c = 0; c < machine.cols; c++) {
            await stopCol(c, c === 0 ? 380 : 180);
          }
          if (cycleTimer) { clearInterval(cycleTimer); cycleTimer = null; }

          // All reels have stopped: settle coins/session & reveal winning highlights
          const settled = pendingResult;
          pendingResult = null;
          if (settled?.settle) await settled.settle();

          grid = res.grid;
          wildMults = res.wildMults || null;
          winCells = computeWinCellSet(machine, res.winningLines);

          const isMega = res.payout > 0 && res.bet > 0 && res.payout >= res.bet * 10;
          const isScatter = res.freeSpinType === "scatter";
          const isBonus = res.freeSpinType === "bonus" || res.freeSpinType === "extra";

          if (res.payout > 0 || res.freeSpinsAdded > 0) {
            if (isMega) playMegaWin();
            else if (isScatter) playScatterTrigger();
            else if (isBonus) playBonusTrigger();
            else playHarvest();

            const parts = [];
            if (res.payout > 0) {
              parts.push(
                machine.set === 1
                  ? t("cas.slotWin", { amount: res.payout })
                  : t("cas.slotWinMulti", { lines: res.winningLines?.length || 1, amount: res.payout })
              );
            }
            if (res.freeSpinsAdded > 0) {
              parts.push(t("cas.slotFreeTriggered", { n: res.freeSpinsAdded, mode: modeLabel(res.freeSpinType) }));
            }
            lastMsg = { kind: "win", text: parts.join(" · ") };
            celebratingUntil = Date.now() + 1900;
          } else {
            playCasinoLoss();
            lastMsg = { kind: "lose", text: t("cas.slotLose") };
          }

          spinning = false;
          if (body.isConnected) {
            api.repaint();
            if (res.payout > 0 || res.freeSpinsAdded > 0) {
              playSlotCelebration(body.querySelector(".cas-stage"), {
                set: machine.set,
                payout: res.payout,
                bet: res.bet,
                freeSpinsAdded: res.freeSpinsAdded,
                freeSpinType: res.freeSpinType
              });
            }
          }
        };
      }
    }
  });
}
