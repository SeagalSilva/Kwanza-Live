// PTC Task Wall modal (inside Posto de Trabalho): complete AdsLab PTC tasks for bronze coins.
import { bal } from "../../state.js";
import { t, fmtNum } from "../../i18n.js";
import { esc } from "../../utils.js";
import { money } from "../../data/currencies.js";
import { fetchPtcTasks, startPtcTask, claimPtcTask } from "../../systems/ptc.js";
import { openModal } from "../modal.js";

function isSafeHttpUrl(url) {
  return typeof url === "string" && (url.startsWith("https://") || url.startsWith("http://"));
}

function formatCooldown(ms) {
  const sec = Math.max(1, Math.ceil(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.ceil(sec / 60);
  return `${min}m`;
}

export function openPtcTasksModal() {
  let loaded = false;
  let loading = false;
  let busy = false;
  let result = null;
  let activeSession = null;
  let tickTimer = null;

  openModal({
    title: () => `📋 ${t("ptc.modalTitle")}`,
    events: ["save", "lang"],
    onClose() {
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
    },
    async render(body, api) {
      async function loadTasks() {
        if (loading) return;
        loading = true;
        try {
          result = await fetchPtcTasks();
          loaded = true;
          if (result.activeSession && !activeSession) {
            const s = result.activeSession;
            activeSession = {
              sessionToken: s.sessionToken,
              taskId: s.taskId,
              title: s.title,
              url: s.url,
              durationSec: s.durationSec,
              bronzeReward: s.bronzeReward,
              startedAtMs: Date.now() - (s.elapsedSec || 0) * 1000
            };
          }
        } finally {
          loading = false;
        }
      }

      if (!loaded) {
        body.innerHTML = `<div class="center muted" style="padding: 28px;">${esc(t("loading"))}</div>`;
        await loadTasks();
        if (!body.isConnected) return;
      }

      function renderActiveBanner() {
        if (!activeSession) return "";
        const elapsedSec = Math.floor((Date.now() - activeSession.startedAtMs) / 1000);
        const remaining = Math.max(0, activeSession.durationSec - elapsedSec);
        const pct = Math.min(100, Math.round((elapsedSec / Math.max(1, activeSession.durationSec)) * 100));
        const ready = remaining <= 0;

        return `
          <div class="ptc-active-box ${ready ? "ready" : ""}">
            <div class="ptc-active-head">
              <strong>${ready ? "✅" : "⏳"} ${esc(activeSession.title || t("ptc.activeTask"))}</strong>
              <span class="ptc-active-timer">${ready ? esc(t("ptc.readyLabel")) : `${remaining}s`}</span>
            </div>
            <div class="ad-progress-bar">
              <div class="ad-progress-fill" style="width: ${pct}%;"></div>
            </div>
            <div class="ptc-active-actions">
              <button id="ptc-claim-active-btn" type="button" class="btn ${ready ? "good" : "alt"} small" ${ready && !busy ? "" : "disabled"}>
                🪙 ${esc(t("ptc.claimBtn", { n: activeSession.bronzeReward }))}
              </button>
            </div>
          </div>
        `;
      }

      function paintView() {
        if (!body.isConnected) return;
        const tasks = Array.isArray(result?.tasks) ? result.tasks : [];
        const stats = result?.stats || {};
        const errorCode = result?.errorCode;

        let listHtml = "";
        if (!result?.success) {
          const msgKey = errorCode === "ADSLAB_NOT_CONFIGURED" ? "ptc.notConfigured" : "ptc.fetchError";
          listHtml = `
            <div class="ptc-empty-box">
              <p>${esc(t(msgKey))}</p>
            </div>
          `;
        } else if (tasks.length === 0) {
          listHtml = `
            <div class="ptc-empty-box">
              <p>${esc(t("ptc.noTasks"))}</p>
            </div>
          `;
        } else {
          listHtml = tasks.map((task) => {
            const safeUrl = isSafeHttpUrl(task.url) ? task.url : "";
            const safeIcon = isSafeHttpUrl(task.icon) ? task.icon : "";
            const isRunningThis = activeSession && activeSession.taskId === task.id;
            const disabledReason = task.dailyLimitReached
              ? t("ptc.limitReached")
              : task.cooldownRemainingMs > 0
                ? t("ptc.cooldownWait", { time: formatCooldown(task.cooldownRemainingMs) })
                : "";
            const canClick = !!safeUrl && task.canStart && !isRunningThis && !busy;
            const visitsText = task.visitsPerUser > 0
              ? `${task.completedToday}/${task.visitsPerUser}`
              : `${task.completedToday}`;

            return `
              <div class="ptc-task-card ${!task.canStart ? "done" : ""}">
                <div class="ptc-task-main">
                  <div class="ptc-task-icon">
                    ${safeIcon
                      ? `<img src="${esc(safeIcon)}" alt="" referrerpolicy="no-referrer" /><span style="display:none;">🌐</span>`
                      : `<span>🌐</span>`}
                  </div>
                  <div class="ptc-task-info">
                    <div class="ptc-task-title-row">
                      <strong>${esc(task.title)}</strong>
                      <span class="ptc-reward-pill">+${fmtNum(task.bronzeReward)} 🥉</span>
                    </div>
                    ${task.description ? `<p class="ptc-task-desc">${esc(task.description)}</p>` : ""}
                    <div class="ptc-task-meta">
                      <span>⏱️ ${task.duration}s</span>
                      <span>🔁 ${esc(t("ptc.visitsLabel"))}: ${esc(visitsText)}</span>
                    </div>
                  </div>
                </div>
                <div class="ptc-task-footer">
                  ${disabledReason
                    ? `<span class="ptc-status-note">${esc(disabledReason)}</span>`
                    : isRunningThis
                      ? `<span class="ptc-status-note running">${esc(t("ptc.inProgress"))}</span>`
                      : safeUrl && canClick
                        ? `<a class="btn gold small ptc-go-btn" data-ptc-start="${esc(task.id)}" href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">🌐 ${esc(t("ptc.startBtn"))}</a>`
                        : `<button type="button" class="btn alt small" disabled>${esc(t("ptc.startBtn"))}</button>`}
                </div>
              </div>
            `;
          }).join("");
        }

        body.innerHTML = `
          <div class="ptc-wrap">
            <div class="ptc-header-bar">
              <div class="balance" style="margin: 0;">
                <span>${esc(t("gm.balance"))}</span>
                ${money(bal("bronze"), "bronze")}
              </div>
              <button id="ptc-refresh-btn" type="button" class="btn alt small" ${loading || busy ? "disabled" : ""}>
                🔄 ${esc(t("ptc.refresh"))}
              </button>
            </div>

            <p class="muted ptc-intro">${esc(t("ptc.intro"))}</p>

            <div class="ptc-stats-row">
              <span>✅ ${esc(t("ptc.statsCompleted"))}: <b>${fmtNum(stats.totalCompleted || 0)}</b></span>
              <span>🥉 ${esc(t("ptc.statsEarned"))}: <b>${fmtNum(stats.totalBronzeEarned || 0)}</b></span>
            </div>

            ${renderActiveBanner()}

            <div class="ptc-list">${listHtml}</div>
          </div>
        `;

        const refreshBtn = body.querySelector("#ptc-refresh-btn");
        if (refreshBtn) {
          refreshBtn.onclick = async () => {
            if (loading || busy) return;
            refreshBtn.disabled = true;
            await loadTasks();
            paintView();
          };
        }

        const claimActiveBtn = body.querySelector("#ptc-claim-active-btn");
        if (claimActiveBtn && activeSession) {
          claimActiveBtn.onclick = async () => {
            if (busy || !activeSession) return;
            busy = true;
            claimActiveBtn.disabled = true;
            try {
              const claimRes = await claimPtcTask(activeSession.sessionToken);
              if (claimRes?.allowed) {
                activeSession = null;
                await loadTasks();
              }
            } finally {
              busy = false;
              paintView();
            }
          };
        }

        body.querySelectorAll(".ptc-task-icon img").forEach((imgEl) => {
          imgEl.addEventListener("error", () => {
            imgEl.style.display = "none";
            if (imgEl.nextElementSibling) imgEl.nextElementSibling.style.display = "inline";
          }, { once: true });
        });

        body.querySelectorAll("[data-ptc-start]").forEach((linkEl) => {
          linkEl.onclick = async () => {
            if (busy) return;
            const taskId = linkEl.dataset.ptcStart;
            const taskObj = tasks.find((x) => x.id === taskId);
            busy = true;
            try {
              const started = await startPtcTask(taskId);
              if (started) {
                activeSession = {
                  ...started,
                  title: taskObj?.title || "PTC"
                };
              }
            } finally {
              busy = false;
              paintView();
            }
          };
        });
      }

      paintView();

      if (tickTimer) clearInterval(tickTimer);
      tickTimer = setInterval(() => {
        if (!body.isConnected) {
          clearInterval(tickTimer);
          tickTimer = null;
          return;
        }
        if (activeSession) {
          paintView();
        }
      }, 1000);
    }
  });
}
