import { S, bal } from "../../state.js";
import { on } from "../../bus.js";
import { t } from "../../i18n.js";
import { esc } from "../../utils.js";
import { money } from "../../data/currencies.js";
import {
  getWorkstationStatus,
  depositWorkstationPP,
  claimWorkstationBronze,
  claimDailyPoolBronze
} from "../../systems/workstation.js";
import { openModal } from "../modal.js";

function formatMs(ms) {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => (n < 10 ? "0" + n : String(n));
  return h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${m}m ${pad(s)}s`;
}

function rankBadge(rank) {
  if (rank === 1) return "🥇 #1";
  if (rank === 2) return "🥈 #2";
  if (rank === 3) return "🥉 #3";
  return `#${rank}`;
}

export function openWorkstation() {
  let timerInterval = null;
  let offSave = null;
  let cachedStatus = null;
  let remainingLocalMs = 0;
  let dailyResetLocalMs = 0;
  let lastFetchTime = Date.now();
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

      function renderDailyTab() {
        const dp = cachedStatus.dailyPool || {};
        const dailyClaim = dp.dailyReadyToClaimBronze || 0;
        const participants = dp.participantsCount || 0;
        const topCount = dp.topCount || 0;
        const ruleText =
          dp.ruleTier === "top10pct"
            ? t("ws.ruleTop10Pct", { top: topCount })
            : dp.ruleTier === "top10"
            ? t("ws.ruleTop10", { top: topCount })
            : t("ws.ruleUnder11");

        const myTierText = !dp.myRank
          ? "—"
          : dp.ruleTier === "under11"
          ? t("ws.tierAll4")
          : dp.myInTop
          ? t("ws.tierTop", { top: topCount })
          : t("ws.tierRest");

        const lb = Array.isArray(dp.leaderboard) ? dp.leaderboard : [];
        let lbRowsHtml = "";
        let cutoffShown = false;
        for (const row of lb) {
          if (dp.ruleTier !== "under11" && !row.inTop && !cutoffShown) {
            cutoffShown = true;
            lbRowsHtml += `<div class="ws-lb-cutoff">${esc(t("ws.dailyCutoffLabel", { top: topCount }))}</div>`;
          }
          const isMe = row.uid === S.uid;
          lbRowsHtml += `
            <div class="ws-lb-row${isMe ? " me" : ""}">
              <span class="ws-lb-rank">${rankBadge(row.rank)}</span>
              <span class="ws-lb-name">${esc(row.name)}</span>
              <span class="ws-lb-pts">${row.points} PP</span>
              <span class="money">${money(row.estimatedBronze, "bronze")}</span>
            </div>
          `;
        }

        return `
          <div class="ws-stack">
            <p class="muted" style="font-size: 12.5px; line-height: 1.45;">
              ${esc(t("ws.dailyDesc"))}
            </p>

            ${dailyClaim > 0 ? `
              <div class="ws-claim-box">
                <strong style="color: var(--ok); display: block; font-size: 14px; margin-bottom: 4px;">
                  🎉 ${esc(t("ws.dailyReadyTitle"))}
                </strong>
                <p style="font-size: 18px; margin: 6px 0;">${money(dailyClaim, "bronze")}</p>
                <button id="ws-daily-claim-btn" class="btn gold big" type="button" style="margin-top: 6px;">
                  ${esc(t("ws.btnClaimDaily"))}
                </button>
              </div>
            ` : ""}

            <div class="ws-rule-banner">⚖️ ${esc(ruleText)}</div>

            <div class="ws-card">
              <div class="ws-kv sep">
                <span class="muted">📅 ${esc(t("ws.dailyReset"))}:</span>
                <strong id="ws-daily-timer" style="color: var(--gold); font-variant-numeric: tabular-nums;">
                  ${formatMs(dailyResetLocalMs)}
                </strong>
              </div>
              <div class="ws-kv">
                <span class="muted">👥 ${esc(t("ws.dailyParticipants"))}:</span>
                <strong>${participants}</strong>
              </div>
              <div class="ws-kv sep">
                <span class="muted">🏆 ${esc(t("ws.dailyPoolTotal"))}:</span>
                <span class="money">${money(dp.poolBronze || 0, "bronze")}</span>
              </div>
              <div class="ws-kv">
                <span class="muted">🌾 ${esc(t("ws.dailyMyPoints"))}:</span>
                <span class="money">${money(dp.myPoints || 0, "pp")}</span>
              </div>
              <div class="ws-kv">
                <span class="muted">📊 ${esc(t("ws.dailyMyRank"))}:</span>
                <strong>${dp.myRank ? `#${dp.myRank} / ${participants}` : "—"} · ${esc(myTierText)}</strong>
              </div>
              <div class="ws-kv">
                <span class="muted">🥉 ${esc(t("ws.dailyEstReward"))}:</span>
                <span class="money">${money(dp.myEstimatedBronze || 0, "bronze")}</span>
              </div>
            </div>

            <div class="ws-card">
              <strong style="font-size: 13px;">🏅 ${esc(t("ws.dailyLeaderboard"))}</strong>
              ${lb.length > 0
                ? `<div class="ws-lb">${lbRowsHtml}</div>`
                : `<p class="muted" style="font-size: 12px;">${esc(t("ws.dailyEmpty"))}</p>`}
            </div>
          </div>
        `;
      }

      function renderShiftTab() {
        const myPP = bal("pp");
        const readyClaim = cachedStatus.readyToClaimBronze || 0;
        const deposited = cachedStatus.depositedPP || 0;
        const estBronze = cachedStatus.estimatedBronze ?? Math.floor(deposited * 0.05);
        const sp = cachedStatus.shiftPool || {};
        const shiftParticipants = sp.participantsCount || 0;
        const shiftTotalPP = sp.totalDepositedPP || 0;
        const shiftLb = Array.isArray(sp.leaderboard) ? sp.leaderboard : [];
        const history = Array.isArray(cachedStatus.history) ? cachedStatus.history.slice(0, 5) : [];

        const shiftRowsHtml = shiftLb.map((row) => {
          const isMe = row.uid === S.uid;
          return `
            <div class="ws-lb-row${isMe ? " me" : ""}">
              <span class="ws-lb-rank">${rankBadge(row.rank)}</span>
              <span class="ws-lb-name">${esc(row.name)}</span>
              <span class="ws-lb-pts">${row.depositedPP} PP</span>
              <span class="money">${money(row.estimatedBronze, "bronze")}</span>
            </div>
          `;
        }).join("");

        return `
          <div class="ws-stack">
            <p class="muted" style="font-size: 13px; line-height: 1.4; padding: 2px 0 0;">
              ${esc(t("ws.desc"))}
            </p>

            ${readyClaim > 0 ? `
              <div class="ws-claim-box">
                <strong style="color: var(--ok); display: block; font-size: 14px; margin-bottom: 4px;">
                  🎉 ${esc(t("ws.readyClaimTitle"))}
                </strong>
                <p style="font-size: 18px; margin: 6px 0;">${money(readyClaim, "bronze")}</p>
                <button id="ws-claim-btn" class="btn gold big" type="button" style="margin-top: 6px;">
                  ${esc(t("ws.btnClaim"))}
                </button>
              </div>
            ` : ""}

            <div class="ws-card">
              <div class="ws-kv sep">
                <span class="muted">🌐 ${esc(t("hud.utcNote"))}:</span>
                <strong id="ws-utc" style="color: var(--txt); font-variant-numeric: tabular-nums;">
                  ${new Date().toISOString().slice(11, 19)} UTC
                </strong>
              </div>
              <div class="ws-kv sep">
                <span class="muted">⏱️ ${esc(t("ws.shiftTimer"))}:</span>
                <strong id="ws-timer" style="color: var(--gold); font-size: 15px; font-variant-numeric: tabular-nums;">
                  ${formatMs(remainingLocalMs)}
                </strong>
              </div>
              <div class="ws-kv">
                <span class="muted">👥 ${esc(t("ws.shiftParticipants"))}:</span>
                <strong>${shiftParticipants}</strong>
              </div>
              <div class="ws-kv sep">
                <span class="muted">📦 ${esc(t("ws.shiftTotalDeposited"))}:</span>
                <span class="money">${money(shiftTotalPP, "pp")}</span>
              </div>
              <div class="ws-kv">
                <span class="muted">🌾 ${esc(t("ws.yourPP"))}:</span>
                <span class="money">${money(myPP, "pp")}</span>
              </div>
              <div class="ws-kv">
                <span class="muted">📥 ${esc(t("ws.currentDeposited"))}:</span>
                <span class="money">${money(deposited, "pp")}</span>
              </div>
              <div class="ws-kv">
                <span class="muted">📊 ${esc(t("ws.shiftMyRank"))}:</span>
                <strong>${sp.myRank ? `#${sp.myRank} / ${shiftParticipants}` : "—"}</strong>
              </div>
              <div class="ws-kv">
                <span class="muted">🥉 ${esc(t("ws.estReward"))}:</span>
                <span class="money">${money(estBronze, "bronze")}</span>
              </div>
              ${deposited > 0 && deposited < 10 ? `
                <p class="muted" style="font-size: 11.5px; color: var(--gold); margin: 2px 0 0;">
                  💡 ${esc(t("ws.shiftMinHint"))}
                </p>
              ` : ""}
            </div>

            <div class="ws-card">
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

            <div class="ws-card">
              <strong style="font-size: 13px;">🏅 ${esc(t("ws.shiftLeaderboard"))}</strong>
              ${shiftLb.length > 0
                ? `<div class="ws-lb">${shiftRowsHtml}</div>`
                : `<p class="muted" style="font-size: 12px;">${esc(t("ws.shiftEmpty"))}</p>`}
            </div>

            ${history.length > 0 ? `
              <div class="ws-card">
                <strong style="font-size: 13px;">📜 ${esc(t("ws.shiftHistory"))}</strong>
                <div class="ws-lb">
                  ${history.map((h) => `
                    <div class="ws-kv" style="font-size: 12px;">
                      <span class="muted">${h.depositedPP} PP</span>
                      <span class="money">${money(h.bronzeEarned, "bronze")}</span>
                    </div>
                  `).join("")}
                </div>
              </div>
            ` : ""}
          </div>
        `;
      }

      function updateView() {
        if (!body.isConnected) return;
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
          ${activeTab === "daily" ? renderDailyTab() : renderShiftTab()}
        `;

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
              if (res) {
                await refreshStatus();
              }
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
              if (res) {
                await refreshStatus();
              }
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
              if (res) {
                await refreshStatus();
              }
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

        if (!isRefreshing && !isBusyAction && (remainingLocalMs <= 0 || dailyResetLocalMs <= 0)) {
          await refreshStatus();
          updateView();
        }
      }, 1000);
    }
  });
}
