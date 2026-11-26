import { Router } from "express";
import crypto from "crypto";
import { dbState, saveDb } from "../db.js";

const router = Router();

const DEFAULT_PLACEMENT = "task-buwW3kiVwzkt";
const USD_TO_BRONZE_RATE = 10000; // Fallback when AdsLab virtual currency isn't enabled ($0.0010 -> 10 bronze)
const MIN_BRONZE_PER_TASK = 5;
const MIN_DURATION_SEC = 5;
const MAX_DURATION_SEC = 300;
const SESSION_TTL_MS = 20 * 60 * 1000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const EPHEMERAL_FALLBACK_KEY = crypto.randomBytes(32).toString("hex");

function getSigningKey() {
  const secret = (process.env.PTC_TOKEN_SECRET || process.env.ADSLAB_TASKS_API_KEY || "").trim();
  return secret || EPHEMERAL_FALLBACK_KEY;
}

function signPayload(obj) {
  const data = Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSigningKey()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifySignedPayload(token, maxAgeMs) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  if (!data || !sig) return null;
  const expected = crypto.createHmac("sha256", getSigningKey()).update(data).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    if (maxAgeMs && (!parsed.iat || Date.now() - Number(parsed.iat) > maxAgeMs)) {
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

function ensurePtcState() {
  if (!dbState.ptcState || typeof dbState.ptcState !== "object") {
    dbState.ptcState = { users: {}, sessions: {}, pendingClaims: {}, taskCache: {}, claimedJtis: {} };
  }
  if (!dbState.ptcState.users || typeof dbState.ptcState.users !== "object") dbState.ptcState.users = {};
  if (!dbState.ptcState.sessions || typeof dbState.ptcState.sessions !== "object") dbState.ptcState.sessions = {};
  if (!dbState.ptcState.pendingClaims || typeof dbState.ptcState.pendingClaims !== "object") dbState.ptcState.pendingClaims = {};
  if (!dbState.ptcState.taskCache || typeof dbState.ptcState.taskCache !== "object") dbState.ptcState.taskCache = {};
  if (!dbState.ptcState.claimedJtis || typeof dbState.ptcState.claimedJtis !== "object") dbState.ptcState.claimedJtis = {};
  return dbState.ptcState;
}

function getUtcDateStr(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function ensureUserRecord(uid, now = Date.now()) {
  const ptc = ensurePtcState();
  const key = String(uid);
  const today = getUtcDateStr(now);
  let u = ptc.users[key];
  if (!u || typeof u !== "object") {
    u = {
      utcDate: today,
      dailyCounts: {},
      lastCompletedAt: {},
      history: [],
      totalCompleted: 0,
      totalBronzeEarned: 0
    };
    ptc.users[key] = u;
  }
  if (u.utcDate !== today) {
    u.utcDate = today;
    u.dailyCounts = {};
  }
  if (!u.dailyCounts || typeof u.dailyCounts !== "object") u.dailyCounts = {};
  if (!u.lastCompletedAt || typeof u.lastCompletedAt !== "object") u.lastCompletedAt = {};
  if (!Array.isArray(u.history)) u.history = [];
  return u;
}

function upsertUserHistory(userRec, entry) {
  if (!Array.isArray(userRec.history)) userRec.history = [];
  const idx = userRec.history.findIndex((h) => h && h.id === entry.id);
  if (idx >= 0) {
    userRec.history[idx] = { ...userRec.history[idx], ...entry };
  } else {
    userRec.history.unshift(entry);
    if (userRec.history.length > 40) userRec.history.length = 40;
  }
}

function safeHttpUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) return "";
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
  } catch (_) {}
  return "";
}

function extractClientIp(req) {
  const raw =
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    req.headers["x-vercel-forwarded-for"] ||
    req.headers["x-forwarded-for"] ||
    req.socket?.remoteAddress ||
    "127.0.0.1";
  const first = String(raw).split(",")[0].trim().replace(/^::ffff:/, "");
  return /^[a-fA-F0-9:.]+$/.test(first) ? first : "127.0.0.1";
}

function extractCountry(req) {
  const raw = req.headers["cf-ipcountry"] || req.headers["x-vercel-ip-country"] || "US";
  const clean = String(raw).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(clean) ? clean : "US";
}

function pruneExpiredPtcEntries(now = Date.now()) {
  const ptc = ensurePtcState();
  for (const [token, sess] of Object.entries(ptc.sessions)) {
    if (!sess || now - (sess.startedAt || 0) > SESSION_TTL_MS) {
      delete ptc.sessions[token];
    }
  }
  for (const [k, item] of Object.entries(ptc.taskCache)) {
    if (!item || now - (item.cachedAt || 0) > CACHE_TTL_MS) {
      delete ptc.taskCache[k];
    }
  }
  for (const [jti, ts] of Object.entries(ptc.claimedJtis)) {
    if (!ts || now - Number(ts) > SESSION_TTL_MS) {
      delete ptc.claimedJtis[jti];
    }
  }
}

function normalizeTask(raw, uid, userRec, now = Date.now()) {
  const rawId = raw?.id ?? raw?._id;
  if (!rawId) return null;
  const id = String(rawId).slice(0, 128);
  const url = safeHttpUrl(raw?.url);
  if (!url) return null;

  const icon = safeHttpUrl(raw?.icon || raw?.image || "");
  const duration = Math.max(MIN_DURATION_SEC, Math.min(MAX_DURATION_SEC, Math.round(Number(raw?.duration) || 10)));
  const rawReward = Math.max(0, Number(raw?.reward) || 0);
  const rewardUsd = Math.max(0, Number(raw?.reward_usd) || 0);
  const vsingular = String(raw?.vsingular || "$").trim();
  const vplural = String(raw?.vplural || "$").trim();
  const hasVirtualCurrency =
    (vsingular && vsingular !== "$") ||
    (vplural && vplural !== "$") ||
    (rawReward > 0 && rewardUsd > 0 && Math.abs(rawReward - rewardUsd) > 1e-6);

  const bronzeReward = hasVirtualCurrency
    ? Math.max(1, Math.round(rawReward))
    : Math.max(MIN_BRONZE_PER_TASK, Math.round((rewardUsd || rawReward) * USD_TO_BRONZE_RATE));

  const visitsPerUser = Math.max(0, Math.floor(Number(raw?.visitsPerUser) || 0));
  const cooldownMinutes = Math.max(0, Number(raw?.cooldownMinutes) || 0);

  const completedToday = Math.max(0, Math.floor(Number(userRec.dailyCounts[id]) || 0));
  const lastAt = Number(userRec.lastCompletedAt[id]) || 0;
  const cooldownMs = cooldownMinutes * 60 * 1000;
  const cooldownRemainingMs = cooldownMs > 0 && lastAt > 0 ? Math.max(0, cooldownMs - (now - lastAt)) : 0;
  const dailyLimitReached = visitsPerUser > 0 && completedToday >= visitsPerUser;
  const canStart = !dailyLimitReached && cooldownRemainingMs <= 0;
  const title = String(raw?.title || raw?.name || "PTC Task").slice(0, 120);

  // Stateless HMAC-signed token so /start works across Vercel serverless instances
  const taskToken = signPayload({
    uid: String(uid),
    id,
    title,
    url,
    duration,
    bronzeReward,
    visitsPerUser,
    cooldownMinutes,
    iat: now
  });

  return {
    id,
    taskToken,
    type: String(raw?.type || "PTC").slice(0, 24),
    title,
    description: String(raw?.description || "").slice(0, 300),
    url,
    icon,
    duration,
    rawReward,
    rewardUsd,
    vsingular: vsingular.slice(0, 32),
    usingAdsLabVirtualCurrency: hasVirtualCurrency,
    bronzeReward,
    visitsPerUser,
    cooldownMinutes,
    completedToday,
    cooldownRemainingMs,
    dailyLimitReached,
    canStart
  };
}

router.get("/tasks", async (req, res) => {
  const uid = String(req.query.uid || "").trim();
  if (!uid) return res.status(400).json({ error: "UID is required" });

  const placement = (process.env.ADSLAB_TASKS_PLACEMENT || DEFAULT_PLACEMENT).trim();
  const apiKey = (process.env.ADSLAB_TASKS_API_KEY || "").trim();

  if (!apiKey) {
    return res.status(503).json({
      success: false,
      errorCode: "ADSLAB_NOT_CONFIGURED",
      error: "ADSLAB_TASKS_API_KEY is not configured on the server"
    });
  }

  const country = extractCountry(req);
  const userIp = extractClientIp(req);
  const userAgent = String(req.headers["user-agent"] || "KwanzaLive/1.0").slice(0, 300);

  const apiUrl =
    `https://adslab.me/api/tasks-share/${encodeURIComponent(placement)}/${encodeURIComponent(apiKey)}/${encodeURIComponent(country)}/${encodeURIComponent(uid)}/${encodeURIComponent(userIp)}/ptc`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "User-Agent": userAgent,
        "Accept": "application/json"
      },
      signal: controller.signal
    });
    clearTimeout(timer);

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const upstreamMsg = payload?.error || payload?.message || `AdsLab HTTP ${response.status}`;
      console.warn("[ptc/tasks] upstream non-OK:", response.status, upstreamMsg);
      return res.status(502).json({ success: false, errorCode: "UPSTREAM_ERROR", error: String(upstreamMsg).slice(0, 180) });
    }

    if (!payload || !payload.success || !Array.isArray(payload.tasks)) {
      const upstreamMsg = payload?.error || payload?.message || "Invalid AdsLab response";
      console.warn("[ptc/tasks] upstream invalid payload:", upstreamMsg);
      return res.status(502).json({ success: false, errorCode: "UPSTREAM_INVALID", error: String(upstreamMsg).slice(0, 180) });
    }

    const now = Date.now();
    const ptc = ensurePtcState();
    const userRec = ensureUserRecord(uid, now);
    pruneExpiredPtcEntries(now);

    const tasks = [];
    for (const rawTask of payload.tasks) {
      const normalized = normalizeTask(rawTask, uid, userRec, now);
      if (!normalized) continue;
      ptc.taskCache[`${uid}:${normalized.id}`] = {
        ...normalized,
        cachedAt: now
      };
      tasks.push(normalized);
    }

    let activeSession = null;
    for (const [token, sess] of Object.entries(ptc.sessions)) {
      if (sess && sess.uid === uid && !sess.claimed) {
        const elapsedSec = Math.floor((now - sess.startedAt) / 1000);
        activeSession = {
          sessionToken: token,
          taskId: sess.taskId,
          title: sess.title,
          url: sess.url,
          durationSec: sess.durationSec,
          elapsedSec,
          remainingSec: Math.max(0, sess.durationSec - elapsedSec),
          bronzeReward: sess.bronzeReward
        };
        break;
      }
    }

    saveDb();
    res.json({
      success: true,
      tasks,
      activeSession,
      history: userRec.history.slice(0, 40),
      stats: {
        totalCompleted: userRec.totalCompleted || 0,
        totalBronzeEarned: userRec.totalBronzeEarned || 0
      }
    });
  } catch (err) {
    clearTimeout(timer);
    console.error("[ptc/tasks]", err?.message || err);
    res.status(502).json({ success: false, errorCode: "FETCH_FAILED", error: "Failed to fetch PTC tasks" });
  }
});

router.post("/start", (req, res) => {
  const { uid, taskId, taskToken } = req.body || {};
  const cleanUid = String(uid || "").trim();
  const cleanTaskId = String(taskId || "").trim();
  if (!cleanUid || !cleanTaskId) {
    return res.status(400).json({ allowed: false, error: "UID and taskId are required" });
  }

  const now = Date.now();
  const ptc = ensurePtcState();
  const userRec = ensureUserRecord(cleanUid, now);
  pruneExpiredPtcEntries(now);

  let taskMeta = ptc.taskCache[`${cleanUid}:${cleanTaskId}`];
  if (!taskMeta && taskToken) {
    const verified = verifySignedPayload(taskToken, CACHE_TTL_MS);
    if (verified && verified.uid === cleanUid && verified.id === cleanTaskId) {
      taskMeta = verified;
    }
  }

  if (!taskMeta) {
    return res.status(404).json({ allowed: false, errorCode: "TASK_EXPIRED", error: "Task cache expired, please refresh" });
  }

  const completedToday = Math.max(0, Math.floor(Number(userRec.dailyCounts[cleanTaskId]) || 0));
  if (taskMeta.visitsPerUser > 0 && completedToday >= taskMeta.visitsPerUser) {
    return res.status(400).json({ allowed: false, errorCode: "DAILY_LIMIT", error: "Daily visit limit reached for this task" });
  }

  const lastAt = Number(userRec.lastCompletedAt[cleanTaskId]) || 0;
  const cooldownMs = (Number(taskMeta.cooldownMinutes) || 0) * 60 * 1000;
  if (cooldownMs > 0 && lastAt > 0 && now - lastAt < cooldownMs) {
    return res.status(400).json({
      allowed: false,
      errorCode: "COOLDOWN",
      cooldownRemainingMs: cooldownMs - (now - lastAt)
    });
  }

  // Clear any older abandoned session for this user on this instance
  for (const [tok, sess] of Object.entries(ptc.sessions)) {
    if (sess && sess.uid === cleanUid) {
      delete ptc.sessions[tok];
    }
  }

  const jti = crypto.randomUUID();
  const sessionToken = signPayload({
    jti,
    uid: cleanUid,
    taskId: cleanTaskId,
    title: taskMeta.title,
    url: taskMeta.url,
    durationSec: taskMeta.duration,
    bronzeReward: taskMeta.bronzeReward,
    startedAt: now,
    iat: now
  });

  ptc.sessions[jti] = {
    uid: cleanUid,
    taskId: cleanTaskId,
    title: taskMeta.title,
    url: taskMeta.url,
    durationSec: taskMeta.duration,
    bronzeReward: taskMeta.bronzeReward,
    startedAt: now,
    claimed: false
  };

  upsertUserHistory(userRec, {
    id: jti,
    taskId: cleanTaskId,
    title: taskMeta.title,
    bronzeReward: taskMeta.bronzeReward,
    durationSec: taskMeta.duration,
    startedAt: now,
    claimedAt: 0,
    status: "pending",
    sessionToken
  });

  saveDb();

  res.json({
    allowed: true,
    sessionId: jti,
    sessionToken,
    taskId: cleanTaskId,
    title: taskMeta.title,
    url: taskMeta.url,
    durationSec: taskMeta.duration,
    bronzeReward: taskMeta.bronzeReward,
    startedAt: now
  });
});

router.post("/claim", (req, res) => {
  const { uid, sessionToken } = req.body || {};
  const cleanUid = String(uid || "").trim();
  const token = String(sessionToken || "").trim();
  if (!cleanUid || !token) {
    return res.status(400).json({ allowed: false, error: "UID and sessionToken required" });
  }

  const now = Date.now();
  const ptc = ensurePtcState();
  pruneExpiredPtcEntries(now);

  // Verify stateless signed sessionToken (works across Vercel containers) or fallback to local session map
  let sess = verifySignedPayload(token, SESSION_TTL_MS);
  let jti = sess?.jti || token;
  if (sess && sess.uid !== cleanUid) {
    sess = null;
  }
  if (!sess && ptc.sessions[token] && ptc.sessions[token].uid === cleanUid && !ptc.sessions[token].claimed) {
    sess = ptc.sessions[token];
    jti = token;
  }

  if (!sess || ptc.claimedJtis[jti]) {
    return res.status(400).json({ allowed: false, errorCode: "SESSION_INVALID", error: "Task session not found or already claimed" });
  }

  const elapsedMs = now - Number(sess.startedAt || 0);
  const requiredMs = Number(sess.durationSec || MIN_DURATION_SEC) * 1000;
  if (elapsedMs < requiredMs) {
    return res.json({
      allowed: false,
      errorCode: "TOO_EARLY",
      elapsedSec: Math.floor(elapsedMs / 1000),
      requiredSec: sess.durationSec,
      remainingSec: Math.ceil((requiredMs - elapsedMs) / 1000)
    });
  }

  ptc.claimedJtis[jti] = now;
  delete ptc.sessions[jti];

  const userRec = ensureUserRecord(cleanUid, now);
  userRec.dailyCounts[sess.taskId] = (userRec.dailyCounts[sess.taskId] || 0) + 1;
  userRec.lastCompletedAt[sess.taskId] = now;
  userRec.totalCompleted = (userRec.totalCompleted || 0) + 1;
  userRec.totalBronzeEarned = (userRec.totalBronzeEarned || 0) + sess.bronzeReward;

  upsertUserHistory(userRec, {
    id: jti,
    taskId: sess.taskId,
    title: sess.title || "PTC Task",
    bronzeReward: sess.bronzeReward,
    durationSec: sess.durationSec || MIN_DURATION_SEC,
    startedAt: Number(sess.startedAt) || now,
    claimedAt: now,
    status: "withdrawn"
  });

  const claimId = crypto.randomUUID();
  ptc.pendingClaims[claimId] = {
    uid: cleanUid,
    taskId: sess.taskId,
    bronzeReward: sess.bronzeReward,
    jti,
    at: now
  };
  saveDb();

  res.json({
    allowed: true,
    sessionId: jti,
    claimId,
    taskId: sess.taskId,
    bronzeReward: sess.bronzeReward,
    claimedAt: now,
    stats: {
      totalCompleted: userRec.totalCompleted,
      totalBronzeEarned: userRec.totalBronzeEarned
    }
  });
});

router.post("/claim-confirm", (req, res) => {
  const { uid, claimId } = req.body || {};
  const ptc = ensurePtcState();
  const pending = claimId && ptc.pendingClaims[String(claimId)];
  if (pending && pending.uid === String(uid)) {
    delete ptc.pendingClaims[String(claimId)];
    saveDb();
  }
  res.json({ success: true });
});

router.post("/claim-rollback", (req, res) => {
  const { uid, claimId } = req.body || {};
  const ptc = ensurePtcState();
  const pending = claimId && ptc.pendingClaims[String(claimId)];
  if (pending && pending.uid === String(uid)) {
    const userRec = ensureUserRecord(pending.uid);
    userRec.dailyCounts[pending.taskId] = Math.max(0, (userRec.dailyCounts[pending.taskId] || 1) - 1);
    userRec.totalCompleted = Math.max(0, (userRec.totalCompleted || 1) - 1);
    userRec.totalBronzeEarned = Math.max(0, (userRec.totalBronzeEarned || pending.bronzeReward) - pending.bronzeReward);
    if (pending.jti) {
      delete ptc.claimedJtis[pending.jti];
      const entry = userRec.history.find((h) => h && h.id === pending.jti);
      if (entry) {
        entry.status = "pending";
        entry.claimedAt = 0;
      }
    }
    delete ptc.pendingClaims[String(claimId)];
    saveDb();
  }
  res.json({ success: true });
});

export default router;
