import { bal } from "../../state.js";
import { on } from "../../bus.js";
import { t } from "../../i18n.js";
import { esc } from "../../utils.js";
import {
  getWorkstationStatus,
  depositWorkstationPP,
  claimWorkstationBronze,
  claimDailyPoolBronze
} from "../../systems/workstation.js";
import { openModal } from "../modal.js";
import { formatMs } from "./workstation/shared.js";
import { renderShiftTab } from "./workstation/shiftTab.js";
import { renderDailyTab } from "./workstation/dailyTab.js";

const BOUNDARY_REFRESH_COOLDOWN_MS = 5000;

export function openWorkstation() {
  let timerInterval = null;
  let offSave = null;
  let cachedStatus = null;
  let remainingLocalMs = 0;
  let dailyResetLocalMs = 0;
  let lastFetchTime = Date.now();
  let lastBoundaryRefreshAt = 0;
  let activeTab = "shift";
  let isBusyAction = false;
  let isRefreshing = false;

  openModal({
    title: () => `🔨 ${t("place.workstation")}`,
    events: ["lang"],
    onClose() {
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      if (offSave) { offSave(); offSave = null; }
    },
    async render(body) {
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      if (offSave) { offSave(); offSave = null; }

      async function refreshStatus() {
        if (isRefreshing) return;
        isRefreshing = true;
        try {
          cachedStatus = await getWorkstationStatus();
          remainingLocalMs = Math.max(1000, cachedStatus.cycleRemainingMs || 0);
          dailyResetLocalMs = Math.max(1000, cachedStatus.dailyPool?.nextResetMs || 0);
          lastFetchTime = Date.now();
        } finally {
          isRefreshing = false;
        }
      }

      if (!cachedStatus) {
        body.innerHTML = `<div class="center muted" style="padding: 24px;">${esc(t("loading"))}</div>`;
        await refreshStatus();
        if (!body.isConnected) return;
      }

      function updateView() {
        if (!body.isConnected) return;
        const prevInputEl = body.querySelector("#ws-deposit-input");
        const prevInputVal = prevInputEl ? prevInputEl.value : "";
        const wasInputFocused = prevInputEl && document.activeElement === prevInputEl;

        const myPP = bal("pp");
        const shiftClaim = cachedStatus.readyToClaimBronze || 0;
        const dailyClaim = cachedStatus.dailyPool?.dailyReadyToClaimBronze || 0;

        body.innerHTML = `
          <div class="tabs">
            <button type="button" data-ws-tab="shift" class="${activeTab === "shift" ? "on" : ""}">
              ${esc(t("ws.tabShift"))}${shiftClaim > 0 ? `<span class="ws-tab-badge">+${shiftClaim}</span>` : ""}
            </button>
            <button type="button" data-ws-tab="daily" class="${activeTab === "daily" ? "on" : ""}">
              ${esc(t("ws.tabDaily"))}${dailyClaim > 0 ? `<span class="ws-tab-badge">+${dailyClaim}</span>` : ""}
            </button>
          </div>
          ${activeTab === "daily"
            ? renderDailyTab(cachedStatus, dailyResetLocalMs)
            : renderShiftTab(cachedStatus, remainingLocalMs)}
        `;

        const nextInputEl = body.querySelector("#ws-deposit-input");
        if (nextInputEl && prevInputVal) {
          nextInputEl.value = prevInputVal;
          if (wasInputFocused) nextInputEl.focus();
        }

        body.querySelectorAll("[data-ws-tab]").forEach((btn) => {
          btn.onclick = async () => {
            if (isBusyAction) return;
            activeTab = btn.dataset.wsTab;
            await refreshStatus();
            updateView();
          };
        });

        const input = body.querySelector("#ws-deposit-input");
        const depositBtn = body.querySelector("#ws-deposit-btn");
        const claimBtn = body.querySelector("#ws-claim-btn");
        const dailyClaimBtn = body.querySelector("#ws-daily-claim-btn");

        body.querySelectorAll("[data-pct]").forEach((b) => {
          b.onclick = () => {
            const pct = parseFloat(b.dataset.pct);
            if (input) input.value = Math.max(1, Math.floor(myPP * pct));
          };
        });

        if (depositBtn && input) {
          depositBtn.onclick = async () => {
            if (isBusyAction) return;
            const val = parseInt(input.value, 10);
            if (!val || val <= 0) return;
            isBusyAction = true;
            depositBtn.disabled = true;
            try {
              const res = await depositWorkstationPP(val);
              if (res) await refreshStatus();
            } finally {
              isBusyAction = false;
              updateView();
            }
          };
        }

        if (claimBtn) {
          claimBtn.onclick = async () => {
            if (isBusyAction) return;
            isBusyAction = true;
            claimBtn.disabled = true;
            try {
              const res = await claimWorkstationBronze();
              if (res) await refreshStatus();
            } finally {
              isBusyAction = false;
              updateView();
            }
          };
        }

        if (dailyClaimBtn) {
          dailyClaimBtn.onclick = async () => {
            if (isBusyAction) return;
            isBusyAction = true;
            dailyClaimBtn.disabled = true;
            try {
              const res = await claimDailyPoolBronze();
              if (res) await refreshStatus();
            } finally {
              isBusyAction = false;
              updateView();
            }
          };
        }
      }

      updateView();

      offSave = on("save", () => {
        if (isBusyAction || !body.isConnected) return;
        refreshStatus().then(() => updateView());
      });

      timerInterval = setInterval(async () => {
        if (!body.isConnected) { clearInterval(timerInterval); timerInterval = null; return; }
        const nowMs = Date.now();
        const delta = nowMs - lastFetchTime;
        lastFetchTime = nowMs;
        remainingLocalMs = Math.max(0, remainingLocalMs - delta);
        dailyResetLocalMs = Math.max(0, dailyResetLocalMs - delta);

        const utcEl = body.querySelector("#ws-utc");
        if (utcEl) utcEl.textContent = `${new Date(nowMs).toISOString().slice(11, 19)} UTC`;

        const timerEl = body.querySelector("#ws-timer");
        if (timerEl) timerEl.textContent = formatMs(remainingLocalMs);

        const dailyTimerEl = body.querySelector("#ws-daily-timer");
        if (dailyTimerEl) dailyTimerEl.textContent = formatMs(dailyResetLocalMs);

        const boundaryHit = remainingLocalMs <= 0 || dailyResetLocalMs <= 0;
        if (!isRefreshing && !isBusyAction && boundaryHit && nowMs - lastBoundaryRefreshAt >= BOUNDARY_REFRESH_COOLDOWN_MS) {
          lastBoundaryRefreshAt = nowMs;
          await refreshStatus();
          updateView();
        }
      }, 1000);
    }
  });
}
