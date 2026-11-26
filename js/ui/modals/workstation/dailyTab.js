import { S } from "../../../state.js";
import { t } from "../../../i18n.js";
import { esc } from "../../../utils.js";
import { money } from "../../../data/currencies.js";
import { formatMs, rankBadge, statusBadge } from "./shared.js";

export function renderDailyTab(cachedStatus, dailyResetLocalMs) {
  const dp = cachedStatus.dailyPool || {};
  const dailyClaim = dp.dailyReadyToClaimBronze || 0;
  const participants = dp.participantsCount || 0;
  const topCount = dp.topCount || 0;
  const dailyHistory = Array.isArray(dp.dailyHistory) ? dp.dailyHistory.slice(0, 10) : [];

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
        ${dp.ruleTier === "under11" && (dp.myPoints || 0) > 0 && (dp.myPoints || 0) < 25 ? `
          <p class="muted" style="font-size: 11.5px; color: var(--gold); margin: 2px 0 0;">
            💡 ${esc(t("ws.dailyMinHint"))}
          </p>
        ` : ""}
      </div>

      <div class="ws-card">
        <strong style="font-size: 13px;">🏅 ${esc(t("ws.dailyLeaderboard"))}</strong>
        ${lb.length > 0
          ? `<div class="ws-lb">${lbRowsHtml}</div>`
          : `<p class="muted" style="font-size: 12px;">${esc(t("ws.dailyEmpty"))}</p>`}
      </div>

      ${dailyHistory.length > 0 ? `
        <div class="ws-card">
          <strong style="font-size: 13px;">📜 ${esc(t("ws.dailyHistoryTitle"))}</strong>
          <div class="ws-lb">
            ${dailyHistory.map((d) => `
              <div class="ws-kv" style="font-size: 12px;">
                <span class="muted">${esc(d.date)} · #${d.rank} (${d.points} PP)</span>
                <span style="display: flex; align-items: center; gap: 6px;">
                  <span class="money">${money(d.bronzeEarned, "bronze")}</span>
                  ${statusBadge(!!d.claimed, d.bronzeEarned)}
                </span>
              </div>
            `).join("")}
          </div>
        </div>
      ` : ""}
    </div>
  `;
}
