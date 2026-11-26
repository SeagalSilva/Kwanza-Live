import { S, bal } from "../../../state.js";
import { t } from "../../../i18n.js";
import { esc } from "../../../utils.js";
import { money } from "../../../data/currencies.js";
import { formatMs, rankBadge, statusBadge } from "./shared.js";

export function renderShiftTab(cachedStatus, remainingLocalMs) {
  const myPP = bal("pp");
  const readyClaim = cachedStatus.readyToClaimBronze || 0;
  const deposited = cachedStatus.depositedPP || 0;
  const estBronze = cachedStatus.estimatedBronze ?? Math.floor(deposited * 0.05);
  const sp = cachedStatus.shiftPool || {};
  const shiftParticipants = sp.participantsCount || 0;
  const shiftTotalPP = sp.totalDepositedPP || 0;
  const shiftLb = Array.isArray(sp.leaderboard) ? sp.leaderboard : [];
  const history = Array.isArray(cachedStatus.history) ? cachedStatus.history.slice(0, 6) : [];

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
                <span style="display: flex; align-items: center; gap: 6px;">
                  <span class="money">${money(h.bronzeEarned, "bronze")}</span>
                  ${statusBadge(!!h.claimed, h.bronzeEarned)}
                </span>
              </div>
            `).join("")}
          </div>
        </div>
      ` : ""}
    </div>
  `;
}
