// PTC Task Wall modal (inside Posto de Trabalho): complete AdsLab PTC tasks for bronze coins,
// persist progress across mobile tab switches/reloads, and display completed & withdrawn status.
import { bal } from "../../state.js";
import { t, fmtNum } from "../../i18n.js";
import { esc } from "../../utils.js";
import { money } from "../../data/currencies.js";
import {
  fetchPtcTasks,
  startPtcTask,
  claimPtcTask,
  getActivePtcSession,
  getPtcHistory,
  getPtcStatsSummary,
  markPtcClickPending,
  setPtcModalOpen,
  installPtcRefreshGuard
} from "../../systems/ptc.js";
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

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function openPtcTasksModal() {
  let loaded = false;
  let loading = false;
  let busy = false;
  let result = null;
  let activeTab = "tasks";
  let tickTimer = null;
  let lastReadyState = null;
  let resumeCleanup = null;

  installPtcRefreshGuard();
  setPtcModalOpen(true);

  openModal({
    title: () => `📋 ${t("ptc.modalTitle")}`,
    events: ["save", "lang", "ptcUpdated"],
    shouldRepaint(evt) {
      if (evt === "lang") return true;
      if (busy) return false;
      return true;
    },
    onClose() {
      setPtcModalOpen(false);
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
      if (resumeCleanup) {
        resumeCleanup();
        resumeCleanup = null;
      }
    },
    async render(body) {
      let activeSession = getActivePtcSession();

      async function loadTasks() {
        if (loading) return;
        loading = true;
        try {
          result = await fetchPtcTasks();
          loaded = true;
          activeSession = getActivePtcSession();
        } finally {
          loading = false;
        }
      }

      if (!loaded) {
        body.innerHTML = `<div class="center muted" style="padding: 28px;">${esc(t("loading"))}</div>`;
        await loadTasks();
        if (!body.isConnected) return;
      }

      function computeActiveProgress(sess) {
        if (!sess) return { elapsedSec: 0, remaining: 0, pct: 0, ready: false };
        const elapsedSec = Math.max(0, Math.floor((Date.now() - (Number(sess.startedAtMs) || 0)) / 1000));
        const dur = Math.max(1, Number(sess.durationSec) || 10);
        const remaining = Math.max(0, dur - elapsedSec);
        const pct = Math.min(100, Math.round((elapsedSec / dur) * 100));
        return { elapsedSec, remaining, pct, ready: remaining <= 0 };
      }

      function renderActiveBanner() {
        activeSession = getActivePtcSession();
        if (!activeSession) {
          lastReadyState = null;
          return "";
        }
        const { remaining, pct, ready } = computeActiveProgress(activeSession);
        lastReadyState = ready;

        return `
          <div id="ptc-active-box" class="ptc-active-box ${ready ? "ready" : ""}">
            <div class="ptc-active-head">
              <strong>${ready ? "✅" : "⏳"} ${esc(activeSession.title || t("ptc.activeTask"))}</strong>
              <span id="ptc-active-timer" class="ptc-active-timer">${ready ? esc(t("ptc.readyLabel")) : `${remaining}s`}</span>
            </div>
            <div class="ad-progress-bar">
              <div id="ptc-active-fill" class="ad-progress-fill" style="width: ${pct}%;"></div>
            </div>
            <div class="ptc-active-actions">
              <button id="ptc-claim-active-btn" type="button" class="btn ${ready ? "good" : "alt"} small" ${ready && !busy ? "" : "disabled"}>
                🪙 ${esc(t("ptc.claimBtn", { n: activeSession.bronzeReward }))}
              </button>
            </div>
          </div>
        `;
      }

      function renderTasksTab(history) {
        const tasks = Array.isArray(result?.tasks) ? result.tasks : [];
        const errorCode = result?.errorCode;

        if (!result?.success) {
          const msgKey = errorCode === "ADSLAB_NOT_CONFIGURED" ? "ptc.notConfigured" : "ptc.fetchError";
          const detail = errorCode !== "ADSLAB_NOT_CONFIGURED" && result?.error
            ? `<small class="muted" style="display:block;margin-top:6px;">${esc(result.error)}</small>`
            : "";
          return `
            <div class="ptc-empty-box">
              <p>${esc(t(msgKey))}</p>
              ${detail}
            </div>
          `;
        }

        if (tasks.length === 0) {
          return `<div class="ptc-empty-box"><p>${esc(t("ptc.noTasks"))}</p></div>`;
        }

        const todayStr = new Date().toISOString().slice(0, 10);

        return tasks.map((task) => {
          const safeUrl = isSafeHttpUrl(task.url) ? task.url : "";
          const safeIcon = isSafeHttpUrl(task.icon) ? task.icon : "";
          const isRunningThis = activeSession && activeSession.taskId === task.id;
          const matchingHist = history.filter((h) => h.taskId === task.id);
          const hasWithdrawnToday = matchingHist.some(
            (h) => h.status === "withdrawn" && h.claimedAt && new Date(h.claimedAt).toISOString().slice(0, 10) === todayStr
          );
          const hasPending = matchingHist.some(
            (h) => h.status === "pending" && h.sessionToken && Date.now() - (h.startedAt || 0) <= 20 * 60 * 1000
          );

          const disabledReason = task.dailyLimitReached
            ? t("ptc.limitReached")
            : task.cooldownRemainingMs > 0
              ? t("ptc.cooldownWait", { time: formatCooldown(task.cooldownRemainingMs) })
              : "";
          const canClick = !!safeUrl && task.canStart && !isRunningThis && !hasPending && !busy;
          const visitsText = task.visitsPerUser > 0
            ? `${Math.max(task.completedToday, hasWithdrawnToday ? 1 : 0)}/${task.visitsPerUser}`
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
                    ${hasWithdrawnToday ? `<span style="color: var(--ok); font-weight: 700;">✅ ${esc(t("ptc.statusWithdrawn"))}</span>` : ""}
                  </div>
                </div>
              </div>
              <div class="ptc-task-footer">
                ${disabledReason
                  ? `<span class="ptc-status-note">${esc(disabledReason)}</span>`
                  : (isRunningThis || hasPending)
                    ? `<span class="ptc-status-note running">${esc(t("ptc.inProgress"))}</span>`
                    : safeUrl && canClick
                      ? `<a class="btn gold small ptc-go-btn" data-ptc-start="${esc(task.id)}" href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">🌐 ${esc(t("ptc.startBtn"))}</a>`
                      : `<button type="button" class="btn alt small" disabled>${esc(t("ptc.startBtn"))}</button>`}
              </div>
            </div>
          `;
        }).join("");
      }

      function renderHistoryTab(history) {
        if (!history || history.length === 0) {
          return `<div class="ptc-empty-box"><p>${esc(t("ptc.historyEmpty"))}</p></div>`;
        }

        const now = Date.now();
        return history.map((item) => {
          const isWithdrawn = item.status === "withdrawn";
          const canWithdrawSession = !isWithdrawn && item.sessionToken && now - (item.startedAt || 0) <= 20 * 60 * 1000;
          const elapsedSec = Math.max(0, Math.floor((now - (item.startedAt || 0)) / 1000));
          const remSec = Math.max(0, (item.durationSec || 10) - elapsedSec);
          const readyToClaim = canWithdrawSession && remSec <= 0;

          let badgeHtml = "";
          if (isWithdrawn) {
            badgeHtml = `<span class="ptc-badge withdrawn">✅ ${esc(t("ptc.statusWithdrawn"))}</span>`;
          } else if (readyToClaim) {
            badgeHtml = `
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="ptc-badge ready">🪙 ${esc(t("ptc.statusPendingWithdraw"))}</span>
                <button type="button" class="btn good small" data-ptc-claim-token="${esc(item.sessionToken)}" ${busy ? "disabled" : ""}>
                  ${esc(t("ptc.claimShortBtn", { n: item.bronzeReward }))}
                </button>
              </div>`;
          } else if (canWithdrawSession) {
            badgeHtml = `<span class="ptc-badge counting" data-ptc-hist-id="${esc(item.id)}" data-started="${item.startedAt}" data-dur="${item.durationSec}">⏳ ${esc(t("ptc.statusCounting", { s: remSec }))}</span>`;
          } else {
            badgeHtml = `<span class="ptc-badge">${esc(t("ptc.statusExpired"))}</span>`;
          }

          return `
            <div class="ptc-history-card ${!isWithdrawn && canWithdrawSession ? "pending" : ""}">
              <div class="ptc-history-top">
                <strong>${esc(item.title)}</strong>
                <span class="ptc-reward-pill">+${fmtNum(item.bronzeReward)} 🥉</span>
              </div>
              <div class="ptc-history-bottom">
                <span class="ptc-history-date">🕒 ${esc(formatDateTime(item.claimedAt || item.startedAt))}</span>
                ${badgeHtml}
              </div>
            </div>
          `;
        }).join("");
      }

      function paintView() {
        if (!body.isConnected) return;
        const prevScroll = body.scrollTop;
        const listEl = body.querySelector(".ptc-list");
        const prevListScroll = listEl ? listEl.scrollTop : 0;

        activeSession = getActivePtcSession();
        const history = getPtcHistory();
        const localSummary = getPtcStatsSummary();
        const stats = {
          totalCompleted: Math.max(Number(result?.stats?.totalCompleted) || 0, localSummary.totalCompleted),
          totalBronzeEarned: Math.max(Number(result?.stats?.totalBronzeEarned) || 0, localSummary.totalBronzeEarned)
        };
        const pendingCount = history.filter(
          (h) => h.status === "pending" && h.sessionToken && Date.now() - (h.startedAt || 0) <= 20 * 60 * 1000
        ).length;

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
              <span>✅ ${esc(t("ptc.statsCompleted"))}: <b>${fmtNum(stats.totalCompleted)}</b></span>
              <span>🥉 ${esc(t("ptc.statsEarned"))}: <b>${fmtNum(stats.totalBronzeEarned)}</b></span>
            </div>

            ${renderActiveBanner()}

            <div class="tabs">
              <button type="button" data-ptc-tab="tasks" class="${activeTab === "tasks" ? "on" : ""}">
                📋 ${esc(t("ptc.tabTasks"))}
              </button>
              <button type="button" data-ptc-tab="history" class="${activeTab === "history" ? "on" : ""}">
                📜 ${esc(t("ptc.tabHistory"))}${pendingCount > 0 ? `<span class="ws-tab-badge">${pendingCount}</span>` : ""}
              </button>
            </div>

            <div class="ptc-list">
              ${activeTab === "history" ? renderHistoryTab(history) : renderTasksTab(history)}
            </div>
          </div>
        `;

        body.scrollTop = prevScroll;
        const nextList = body.querySelector(".ptc-list");
        if (nextList && prevListScroll > 0) nextList.scrollTop = prevListScroll;

        body.querySelectorAll("[data-ptc-tab]").forEach((tabBtn) => {
          tabBtn.onclick = () => {
            activeTab = tabBtn.dataset.ptcTab;
            paintView();
          };
        });

        const refreshBtn = body.querySelector("#ptc-refresh-btn");
        if (refreshBtn) {
          refreshBtn.onclick = async () => {
            if (loading || busy) return;
            refreshBtn.disabled = true;
            await loadTasks();
            paintView();
          };
        }

        async function handleClaimToken(token) {
          if (busy || !token) return;
          busy = true;
          paintView();
          try {
            const claimRes = await claimPtcTask(token);
            if (claimRes?.allowed) {
              await loadTasks();
            }
          } finally {
            busy = false;
            paintView();
          }
        }

        const claimActiveBtn = body.querySelector("#ptc-claim-active-btn");
        if (claimActiveBtn && activeSession) {
          claimActiveBtn.onclick = () => handleClaimToken(activeSession.sessionToken);
        }

        body.querySelectorAll("[data-ptc-claim-token]").forEach((btn) => {
          btn.onclick = () => handleClaimToken(btn.dataset.ptcClaimToken);
        });

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
            const tasks = Array.isArray(result?.tasks) ? result.tasks : [];
            const taskObj = tasks.find((x) => x.id === taskId);
            // Save click synchronously before mobile switches tabs
            markPtcClickPending(taskObj || { id: taskId });
            busy = true;
            try {
              await startPtcTask(taskId, taskObj?.taskToken || "", taskObj);
            } finally {
              busy = false;
              paintView();
            }
          };
        });
      }

      paintView();

      function updateTimersInPlace() {
        if (!body.isConnected) return;
        const sess = getActivePtcSession();
        if (sess) {
          const { remaining, pct, ready } = computeActiveProgress(sess);
          if (lastReadyState !== ready) {
            paintView();
            return;
          }
          const timerEl = body.querySelector("#ptc-active-timer");
          if (timerEl) timerEl.textContent = ready ? t("ptc.readyLabel") : `${remaining}s`;
          const fillEl = body.querySelector("#ptc-active-fill");
          if (fillEl) fillEl.style.width = `${pct}%`;
        }

        const now = Date.now();
        let needsHistoryRepaint = false;
        body.querySelectorAll("[data-ptc-hist-id]").forEach((el) => {
          const started = Number(el.dataset.started) || 0;
          const dur = Number(el.dataset.dur) || 10;
          const rem = Math.max(0, dur - Math.floor((now - started) / 1000));
          if (rem <= 0) {
            needsHistoryRepaint = true;
          } else {
            el.textContent = `⏳ ${t("ptc.statusCounting", { s: rem })}`;
          }
        });
        if (needsHistoryRepaint) paintView();
      }

      if (tickTimer) clearInterval(tickTimer);
      tickTimer = setInterval(() => {
        if (!body.isConnected) {
          clearInterval(tickTimer);
          tickTimer = null;
          return;
        }
        updateTimersInPlace();
      }, 1000);

      if (resumeCleanup) {
        resumeCleanup();
        resumeCleanup = null;
      }
      const onResume = () => {
        if (body.isConnected && document.visibilityState !== "hidden") {
          updateTimersInPlace();
        }
      };
      document.addEventListener("visibilitychange", onResume);
      window.addEventListener("pageshow", onResume);
      resumeCleanup = () => {
        document.removeEventListener("visibilitychange", onResume);
        window.removeEventListener("pageshow", onResume);
      };
    }
  });
}
