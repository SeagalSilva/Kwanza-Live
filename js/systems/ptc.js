// AdsLab PTC Task Wall client system.
// Fetches PTC tasks via server proxy, verifies duration server-side,
// and atomically credits bronze coins to Firebase wallet with rollback support.
import { S } from "../state.js";
import { increment } from "../firebase.js";
import { commit, savePath } from "./db.js";
import { toast } from "../ui/toast.js";
import { t } from "../i18n.js";

export async function fetchPtcTasks() {
  if (!S.uid) {
    return { success: false, errorCode: "NO_UID", tasks: [], stats: { totalCompleted: 0, totalBronzeEarned: 0 } };
  }
  try {
    const params = new URLSearchParams({ uid: S.uid });
    const res = await fetch(`/api/ptc/tasks?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return {
        success: false,
        errorCode: data.errorCode || "FETCH_FAILED",
        error: data.error || "Failed to fetch PTC tasks",
        tasks: [],
        stats: { totalCompleted: 0, totalBronzeEarned: 0 }
      };
    }
    return data;
  } catch (err) {
    console.warn("[ptc] fetch error:", err);
    return {
      success: false,
      errorCode: "NETWORK_ERROR",
      tasks: [],
      stats: { totalCompleted: 0, totalBronzeEarned: 0 }
    };
  }
}

export async function startPtcTask(taskId) {
  if (!S.uid || !taskId) return null;
  try {
    const res = await fetch("/api/ptc/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, taskId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.allowed) {
      if (data.errorCode === "DAILY_LIMIT") toast(t("ptc.dailyLimitReached"), "bad");
      else if (data.errorCode === "COOLDOWN") toast(t("ptc.cooldownActive"), "bad");
      else if (data.errorCode === "TASK_EXPIRED") toast(t("ptc.taskExpired"), "bad");
      else toast(t("msg.error"), "bad");
      return null;
    }
    return {
      sessionToken: data.sessionToken,
      taskId: data.taskId,
      url: data.url,
      durationSec: Number(data.durationSec) || 10,
      bronzeReward: Number(data.bronzeReward) || 5,
      startedAtMs: Date.now()
    };
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, sessionToken })
    });
    const data = await res.json().catch(() => ({}));
    if (!data.allowed) {
      if (data.errorCode === "TOO_EARLY") {
        toast(t("ptc.tooEarly", { s: data.remainingSec || 1 }), "bad");
      } else {
        toast(t("msg.error"), "bad");
      }
      return data;
    }

    const reward = Math.max(1, Math.floor(Number(data.bronzeReward) || 0));
    const ok = await commit({
      [savePath(S.uid, "wallet/bronze")]: increment(reward)
    });

    if (ok) {
      await fetch("/api/ptc/claim-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: S.uid, claimId: data.claimId })
      }).catch(() => {});
      toast(t("ptc.rewardSuccess", { n: reward }), "good", 5000);
      return { allowed: true, bronzeReward: reward, stats: data.stats };
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
