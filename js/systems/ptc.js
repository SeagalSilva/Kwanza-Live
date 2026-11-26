// AdsLab PTC Task Wall client system.
// Persists active & completed/withdrawn tasks across mobile tab switches and reloads
// via Firebase Realtime Database + localStorage + server-signed HMAC tokens.
import { S } from "../state.js";
import { increment } from "../firebase.js";
import { commit, savePath } from "./db.js";
import { toast } from "../ui/toast.js";
import { t } from "../i18n.js";
import { emit } from "../bus.js";

const SESSION_TTL_MS = 20 * 60 * 1000;
let guardInstalled = false;
let modalOpenFlag = false;
let cachedServerHistory = [];

export function setPtcModalOpen(open) {
  modalOpenFlag = !!open;
}

function storageKey(uid = S.uid) {
  return uid ? `kwanza_ptc_v1_${uid}` : "";
}

function readLocalStore(uid = S.uid) {
  const key = storageKey(uid);
  if (!key) return { activeSession: null, history: [], pendingClick: null };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { activeSession: null, history: [], pendingClick: null };
    const parsed = JSON.parse(raw);
    return {
      activeSession: parsed?.activeSession || null,
      history: Array.isArray(parsed?.history) ? parsed.history : [],
      pendingClick: parsed?.pendingClick || null
    };
  } catch (_) {
    return { activeSession: null, history: [], pendingClick: null };
  }
}

function writeLocalStore(data, uid = S.uid) {
  const key = storageKey(uid);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({
      activeSession: data.activeSession || null,
      history: Array.isArray(data.history) ? data.history.slice(0, 40) : [],
      pendingClick: data.pendingClick || null
    }));
  } catch (_) {}
}

function sanitizeHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const id = String(entry.id || entry.sessionToken || "").trim();
  if (!id) return null;
  return {
    id,
    taskId: String(entry.taskId || ""),
    title: String(entry.title || "PTC Task").slice(0, 120),
    bronzeReward: Math.max(0, Math.floor(Number(entry.bronzeReward) || 0)),
    durationSec: Math.max(5, Math.floor(Number(entry.durationSec) || 10)),
    startedAt: Number(entry.startedAt) || 0,
    claimedAt: Number(entry.claimedAt) || 0,
    status: entry.status === "withdrawn" || Number(entry.claimedAt) > 0 ? "withdrawn" : "pending",
    sessionToken: entry.sessionToken ? String(entry.sessionToken) : ""
  };
}

function mergeHistoryLists(...lists) {
  const byId = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const item = sanitizeHistoryEntry(raw);
      if (!item) continue;
      const existing = byId.get(item.id);
      if (!existing) {
        byId.set(item.id, item);
      } else {
        const isWithdrawn = existing.status === "withdrawn" || item.status === "withdrawn";
        byId.set(item.id, {
          ...existing,
          ...item,
          status: isWithdrawn ? "withdrawn" : "pending",
          claimedAt: Math.max(existing.claimedAt || 0, item.claimedAt || 0),
          sessionToken: isWithdrawn ? "" : (item.sessionToken || existing.sessionToken || "")
        });
      }
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
    .slice(0, 40);
}

export function getPtcHistory() {
  const local = readLocalStore();
  const fbHistory = Array.isArray(S.save?.ptc?.history) ? S.save.ptc.history : [];
  return mergeHistoryLists(cachedServerHistory, fbHistory, local.history);
}

export function getActivePtcSession() {
  const now = Date.now();
  const local = readLocalStore();
  const fbSession = S.save?.ptc?.activeSession || null;
  const history = getPtcHistory();

  const candidates = [local.activeSession, fbSession].filter(Boolean);
  for (const sess of candidates) {
    if (!sess || !sess.sessionToken) continue;
    if (now - (Number(sess.startedAtMs) || 0) > SESSION_TTL_MS) continue;
    const histMatch = history.find(
      (h) => (h.id && h.id === sess.sessionId) || (h.sessionToken && h.sessionToken === sess.sessionToken)
    );
    if (histMatch && histMatch.status === "withdrawn") continue;
    return sess;
  }

  // Also check if there's an unwithdrawn pending item in history within TTL
  for (const h of history) {
    if (h.status === "pending" && h.sessionToken && now - (h.startedAt || 0) <= SESSION_TTL_MS) {
      return {
        sessionId: h.id,
        sessionToken: h.sessionToken,
        taskId: h.taskId,
        title: h.title,
        url: "",
        durationSec: h.durationSec,
        bronzeReward: h.bronzeReward,
        startedAtMs: h.startedAt
      };
    }
  }

  return null;
}

export function hasUnclaimedPtcTask() {
  return !!getActivePtcSession();
}

export function getPtcStatsSummary() {
  const history = getPtcHistory();
  const withdrawn = history.filter((h) => h.status === "withdrawn");
  return {
    totalCompleted: withdrawn.length,
    totalBronzeEarned: withdrawn.reduce((sum, h) => sum + (h.bronzeReward || 0), 0),
    pendingCount: history.filter((h) => h.status === "pending" && h.sessionToken && Date.now() - (h.startedAt || 0) <= SESSION_TTL_MS).length
  };
}

async function persistPtcState({ activeSession, history, pendingClick = null }, extraUpdates = {}) {
  const cleanHistory = mergeHistoryLists(history).slice(0, 40);
  const cleanActive = activeSession || null;

  writeLocalStore({ activeSession: cleanActive, history: cleanHistory, pendingClick });

  if (!S.save) S.save = {};
  S.save.ptc = { activeSession: cleanActive, history: cleanHistory };

  if (!S.uid) return true;
  const updates = {
    ...extraUpdates,
    [savePath(S.uid, "ptc")]: {
      activeSession: cleanActive,
      history: cleanHistory
    }
  };
  return commit(updates);
}

export function installPtcRefreshGuard() {
  if (guardInstalled || typeof window === "undefined") return;
  guardInstalled = true;

  window.addEventListener("beforeunload", (e) => {
    if (hasUnclaimedPtcTask() || modalOpenFlag) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  window.addEventListener("keydown", (e) => {
    if (!hasUnclaimedPtcTask() && !modalOpenFlag) return;
    const isRefreshKey =
      e.code === "F5" ||
      ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === "r");
    if (isRefreshKey) {
      e.preventDefault();
      toast(t("ptc.refreshBlocked"), "bad");
    }
  });
}

export async function restorePendingPtcOnEnter(openModalFn) {
  installPtcRefreshGuard();
  if (!S.uid) return;

  const local = readLocalStore(S.uid);
  const mergedHistory = getPtcHistory();

  // Recover a clicked link whose start request got interrupted right before mobile suspended tab
  if (!getActivePtcSession() && local.pendingClick && Date.now() - (local.pendingClick.clickedAt || 0) < 120000) {
    const pc = local.pendingClick;
    writeLocalStore({ activeSession: local.activeSession, history: mergedHistory, pendingClick: null });
    await startPtcTask(pc.taskId, pc.taskToken, { title: pc.title, duration: pc.durationSec, bronzeReward: pc.bronzeReward });
  }

  const pendingSession = getActivePtcSession();
  if (pendingSession) {
    // Ensure Firebase has the recovered session & history saved
    await persistPtcState({ activeSession: pendingSession, history: getPtcHistory() });
    toast(t("ptc.pendingRecovered"), "good", 5500);
    if (typeof openModalFn === "function") {
      setTimeout(() => openModalFn(), 300);
    }
  }
}

export function markPtcClickPending(task) {
  if (!S.uid || !task) return;
  const local = readLocalStore(S.uid);
  writeLocalStore({
    activeSession: local.activeSession,
    history: local.history,
    pendingClick: {
      taskId: task.id,
      taskToken: task.taskToken || "",
      title: task.title || "PTC Task",
      durationSec: task.duration || 10,
      bronzeReward: task.bronzeReward || 5,
      clickedAt: Date.now()
    }
  });
}

export async function fetchPtcTasks() {
  if (!S.uid) {
    return { success: false, errorCode: "NO_UID", tasks: [], stats: getPtcStatsSummary() };
  }
  try {
    const params = new URLSearchParams({ uid: S.uid });
    const res = await fetch(`/api/ptc/tasks?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (Array.isArray(data.history)) {
      cachedServerHistory = data.history;
    }
    if (!res.ok || !data.success) {
      return {
        success: false,
        errorCode: data.errorCode || "FETCH_FAILED",
        error: data.error || "Failed to fetch PTC tasks",
        tasks: [],
        stats: getPtcStatsSummary()
      };
    }

    const mergedHistory = getPtcHistory();
    const localSummary = getPtcStatsSummary();
    const serverStats = data.stats || {};

    return {
      ...data,
      history: mergedHistory,
      stats: {
        totalCompleted: Math.max(Number(serverStats.totalCompleted) || 0, localSummary.totalCompleted),
        totalBronzeEarned: Math.max(Number(serverStats.totalBronzeEarned) || 0, localSummary.totalBronzeEarned)
      }
    };
  } catch (err) {
    console.warn("[ptc] fetch error:", err);
    return {
      success: false,
      errorCode: "NETWORK_ERROR",
      tasks: [],
      stats: getPtcStatsSummary()
    };
  }
}

export async function startPtcTask(taskId, taskToken = "", taskMeta = null) {
  if (!S.uid || !taskId) return null;
  installPtcRefreshGuard();
  try {
    const res = await fetch("/api/ptc/start", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, taskId, taskToken })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.allowed) {
      writeLocalStore({ ...readLocalStore(), pendingClick: null });
      if (data.errorCode === "DAILY_LIMIT") toast(t("ptc.dailyLimitReached"), "bad");
      else if (data.errorCode === "COOLDOWN") toast(t("ptc.cooldownActive"), "bad");
      else if (data.errorCode === "TASK_EXPIRED") toast(t("ptc.taskExpired"), "bad");
      else toast(t("msg.error"), "bad");
      return null;
    }

    const startedAtMs = Number(data.startedAt) || Date.now();
    const session = {
      sessionId: data.sessionId || data.sessionToken,
      sessionToken: data.sessionToken,
      taskId: data.taskId,
      title: data.title || taskMeta?.title || "PTC Task",
      url: data.url || "",
      durationSec: Number(data.durationSec) || 10,
      bronzeReward: Number(data.bronzeReward) || 5,
      startedAtMs
    };

    const nextHistory = mergeHistoryLists(
      [
        {
          id: session.sessionId,
          taskId: session.taskId,
          title: session.title,
          bronzeReward: session.bronzeReward,
          durationSec: session.durationSec,
          startedAt: startedAtMs,
          claimedAt: 0,
          status: "pending",
          sessionToken: session.sessionToken
        }
      ],
      getPtcHistory()
    );

    await persistPtcState({ activeSession: session, history: nextHistory, pendingClick: null });
    emit("ptcUpdated");
    return session;
  } catch (err) {
    console.error("[ptc start]", err);
    toast(t("msg.error"), "bad");
    return null;
  }
}

export async function claimPtcTask(sessionToken) {
  if (!S.uid || !sessionToken) return null;
  try {
    const res = await fetch("/api/ptc/claim", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, sessionToken })
    });
    const data = await res.json().catch(() => ({}));
    if (!data.allowed) {
      if (data.errorCode === "TOO_EARLY") {
        toast(t("ptc.tooEarly", { s: data.remainingSec || 1 }), "bad");
      } else if (data.errorCode === "SESSION_INVALID") {
        // Clear stale local pending session if already invalid/claimed
        const curActive = getActivePtcSession();
        if (curActive && curActive.sessionToken === sessionToken) {
          await persistPtcState({ activeSession: null, history: getPtcHistory() });
        }
        toast(t("ptc.sessionInvalid"), "bad");
      } else {
        toast(t("msg.error"), "bad");
      }
      return data;
    }

    const reward = Math.max(1, Math.floor(Number(data.bronzeReward) || 0));
    const claimedAt = Number(data.claimedAt) || Date.now();
    const curActive = getActivePtcSession();
    const nextActive = curActive && curActive.sessionToken === sessionToken ? null : curActive;

    const updatedHistory = getPtcHistory().map((item) => {
      const match =
        (data.sessionId && item.id === data.sessionId) ||
        (item.sessionToken && item.sessionToken === sessionToken);
      if (!match) return item;
      return {
        ...item,
        status: "withdrawn",
        claimedAt,
        sessionToken: ""
      };
    });

    if (!updatedHistory.some((h) => h.id === data.sessionId)) {
      updatedHistory.unshift({
        id: data.sessionId || sessionToken,
        taskId: data.taskId || "",
        title: curActive?.title || "PTC Task",
        bronzeReward: reward,
        durationSec: curActive?.durationSec || 10,
        startedAt: curActive?.startedAtMs || claimedAt,
        claimedAt,
        status: "withdrawn",
        sessionToken: ""
      });
    }

    const ok = await persistPtcState(
      { activeSession: nextActive, history: updatedHistory },
      { [savePath(S.uid, "wallet/bronze")]: increment(reward) }
    );

    if (ok) {
      await fetch("/api/ptc/claim-confirm", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: S.uid, claimId: data.claimId })
      }).catch(() => {});
      toast(t("ptc.rewardSuccess", { n: reward }), "good", 5000);
      emit("ptcUpdated");
      return { allowed: true, bronzeReward: reward, stats: getPtcStatsSummary() };
    }

    await fetch("/api/ptc/claim-rollback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, claimId: data.claimId })
    }).catch(() => {});
    toast(t("msg.error"), "bad");
    return null;
  } catch (err) {
    console.error("[ptc claim]", err);
    toast(t("msg.error"), "bad");
    return null;
  }
}
