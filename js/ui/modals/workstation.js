import { S, bal } from "../../state.js";
import { t } from "../../i18n.js";
import { esc } from "../../utils.js";
import { money } from "../../data/currencies.js";
import { getWorkstationStatus, depositWorkstationPP, claimWorkstationBronze } from "../../systems/workstation.js";
import { openModal } from "../modal.js";

function formatMs(ms) {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s < 10 ? "0" + s : s}s`;
}

export function openWorkstation() {
  let timerInterval = null;
  let cachedStatus = null;
  let remainingLocalMs = 0;
  let lastFetchTime = Date.now();

  openModal({
    title: () => `🔨 ${t("place.workstation")}`,
    events: ["save", "lang"],
    async render(body, api) {
      if (!cachedStatus) {
        body.innerHTML = `<div class="center muted" style="padding: 24px;">${esc(t("loading"))}</div>`;
        cachedStatus = await getWorkstationStatus();
        remainingLocalMs = cachedStatus.cycleRemainingMs;
        lastFetchTime = Date.now();
      }

      function updateView() {
        const myPP = bal("pp");
        const readyClaim = cachedStatus.readyToClaimBronze || 0;
        const deposited = cachedStatus.depositedPP || 0;
        const estBronze = Math.floor(deposited * 0.05);

        body.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <p class="muted" style="font-size: 13px; line-height: 1.4; padding: 2px 0 0;">
              ${esc(t("ws.desc"))}
            </p>

            ${readyClaim > 0 ? `
              <div style="background: rgba(89, 209, 122, 0.12); border: 1px solid var(--ok); border-radius: 12px; padding: 12px; text-align: center;">
                <strong style="color: var(--ok); display: block; font-size: 14px; margin-bottom: 4px;">
                  🎉 ${esc(t("ws.readyClaimTitle"))}
                </strong>
                <p style="font-size: 18px; margin: 6px 0;">${money(readyClaim, "bronze")}</p>
                <button id="ws-claim-btn" class="btn gold big" type="button" style="margin-top: 6px;">
                  ${esc(t("ws.btnClaim"))}
                </button>
              </div>
            ` : ""}

            <div style="background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px; padding: 12px; display: grid; gap: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,.06); padding-bottom: 6px;">
                <span class="muted" style="font-size: 12px;">⏱️ ${esc(t("ws.shiftTimer"))}:</span>
                <strong id="ws-timer" style="color: var(--gold); font-size: 15px; font-variant-numeric: tabular-nums;">
                  ${formatMs(remainingLocalMs)}
                </strong>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="muted" style="font-size: 12px;">🌾 ${esc(t("ws.yourPP"))}:</span>
                <span class="money">${money(myPP, "pp")}</span>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="muted" style="font-size: 12px;">📥 ${esc(t("ws.currentDeposited"))}:</span>
                <span class="money">${money(deposited, "pp")}</span>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="muted" style="font-size: 12px;">🥉 ${esc(t("ws.estReward"))}:</span>
                <span class="money">${money(estBronze, "bronze")}</span>
              </div>
            </div>

            <div style="background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px; padding: 12px; display: grid; gap: 10px;">
              <strong style="font-size: 14px;">${esc(t("ws.depositTitle"))}</strong>
              <div style="display: flex; gap: 8px;">
                <input id="ws-deposit-input" type="number" min="1" max="${myPP}" placeholder="${esc(t("ws.amountPlaceholder"))}" style="flex: 1;" />
                <button id="ws-deposit-btn" class="btn gold" type="button" ${myPP < 1 ? "disabled" : ""}>
                  ${esc(t("ws.btnDeposit"))}
                </button>
              </div>
              <div style="display: flex; gap: 6px;">
                <button class="btn alt small" type="button" data-pct="0.25">25%</button>
                <button class="btn alt small" type="button" data-pct="0.5">50%</button>
                <button class="btn alt small" type="button" data-pct="1.0">${esc(t("ws.maxAll"))}</button>
              </div>
            </div>
          </div>
        `;

        const input = body.querySelector("#ws-deposit-input");
        const depositBtn = body.querySelector("#ws-deposit-btn");
        const claimBtn = body.querySelector("#ws-claim-btn");

        body.querySelectorAll("[data-pct]").forEach((b) => {
          b.onclick = () => {
            const pct = parseFloat(b.dataset.pct);
            if (input) input.value = Math.max(1, Math.floor(myPP * pct));
          };
        });

        if (depositBtn && input) {
          depositBtn.onclick = async () => {
            const val = parseInt(input.value, 10);
            if (!val || val <= 0) return;
            depositBtn.disabled = true;
            const res = await depositWorkstationPP(val);
            depositBtn.disabled = false;
            if (res) {
              cachedStatus = await getWorkstationStatus();
              remainingLocalMs = cachedStatus.cycleRemainingMs;
              lastFetchTime = Date.now();
              updateView();
            }
          };
        }

        if (claimBtn) {
          claimBtn.onclick = async () => {
            claimBtn.disabled = true;
            const res = await claimWorkstationBronze();
            claimBtn.disabled = false;
            if (res) {
              cachedStatus = await getWorkstationStatus();
              updateView();
            }
          };
        }
      }

      updateView();

      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(async () => {
        const now = Date.now();
        const delta = now - lastFetchTime;
        lastFetchTime = now;
        remainingLocalMs = Math.max(0, remainingLocalMs - delta);

        const timerEl = body.querySelector("#ws-timer");
        if (timerEl) timerEl.textContent = formatMs(remainingLocalMs);

        // If cycle elapsed, poll fresh status from server
        if (remainingLocalMs <= 0) {
          cachedStatus = await getWorkstationStatus();
          remainingLocalMs = cachedStatus.cycleRemainingMs;
          lastFetchTime = Date.now();
          updateView();
        }
      }, 1000);
    }
  });
}
