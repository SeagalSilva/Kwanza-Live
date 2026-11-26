// ─────────────────────────────────────────────────────────────
//  Mandatory Ad System & VIP Ad Exemption
//  - Displays mandatory AdSlab Interstitial every 10 minutes
//  - Admin can summon the interstitial anytime by pressing "P"
//  - Players can buy 1-month VIP exemption for 30 gold coins
// ─────────────────────────────────────────────────────────────
import { S, bal, isAdExempt } from "../state.js";
import { t } from "../i18n.js";
import { toast } from "../ui/toast.js";
import { emit, on } from "../bus.js";
import { commit, savePath } from "./db.js";
import { increment } from "../firebase.js";
import { isAdmin } from "./government.js";
import { AD_SIGNS, GRID, T } from "../world/map.js";
import {
  ADSLAB_INT_ID,
  ADSLAB_SDK_URL,
  AD_MIN_INTERVAL_MS,
  AD_MAX_INTERVAL_MS,
  AD_EXEMPTION_COST_GOLD
} from "../config.js";

let adTimer = null;
let sdkLoadPromise = null;
let interstitialBusy = false;

export function getRandomAdInterval() {
  if (AD_MAX_INTERVAL_MS <= AD_MIN_INTERVAL_MS) return AD_MIN_INTERVAL_MS;
  return Math.floor(Math.random() * (AD_MAX_INTERVAL_MS - AD_MIN_INTERVAL_MS + 1)) + AD_MIN_INTERVAL_MS;
}

function waitForInterstitialFn(timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (typeof window.adslabShowInterstitial === "function") {
      resolve(true);
      return;
    }
    const deadline = Date.now() + timeoutMs;
    const iv = setInterval(() => {
      if (typeof window.adslabShowInterstitial === "function") {
        clearInterval(iv);
        resolve(true);
      } else if (Date.now() >= deadline) {
        clearInterval(iv);
        resolve(false);
      }
    }, 100);
  });
}

export function ensureAdSlabSdk(uid = S.uid) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(false);
  }

  window.ADSLAB_INT = ADSLAB_INT_ID;
  window.ADSLAB_USER = String(uid || S.uid || "guest");

  if (typeof window.adslabShowInterstitial === "function") {
    return Promise.resolve(true);
  }

  if (sdkLoadPromise) {
    return sdkLoadPromise;
  }

  sdkLoadPromise = new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${ADSLAB_SDK_URL}"]`);
    if (existing) {
      if (existing.dataset.adslabFailed === "1") {
        existing.remove();
      } else if (existing.dataset.adslabLoaded === "1") {
        waitForInterstitialFn().then((ok) => {
          if (!ok) sdkLoadPromise = null;
          resolve(ok);
        });
        return;
      } else {
        existing.addEventListener("load", () => {
          existing.dataset.adslabLoaded = "1";
          waitForInterstitialFn().then((ok) => {
            if (!ok) sdkLoadPromise = null;
            resolve(ok);
          });
        }, { once: true });
        existing.addEventListener("error", () => {
          existing.dataset.adslabFailed = "1";
          sdkLoadPromise = null;
          resolve(false);
        }, { once: true });
        return;
      }
    }

    const s = document.createElement("script");
    s.src = ADSLAB_SDK_URL;
    s.async = true;
    s.onload = () => {
      s.dataset.adslabLoaded = "1";
      waitForInterstitialFn().then((ok) => {
        if (!ok) sdkLoadPromise = null;
        resolve(ok);
      });
    };
    s.onerror = () => {
      s.dataset.adslabFailed = "1";
      sdkLoadPromise = null;
      resolve(false);
    };
    document.head.appendChild(s);
  });

  return sdkLoadPromise;
}

export function startAdScheduler() {
  stopAdScheduler();
  if (S.uid) {
    ensureAdSlabSdk(S.uid);
    verifyAdExemptionOnLogin(S.uid);
  }
  scheduleNextAd();
}

export async function verifyAdExemptionOnLogin(uid) {
  if (!uid) return;
  try {
    const clientUntil = Number(S.save?.adExemptUntil) || 0;
    const res = await fetch("/api/economy/ad-exemption/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, exemptUntil: clientUntil })
    });
    if (res.ok) {
      const data = await res.json();
      const serverUntil = Number(data.exemptUntil) || 0;
      if (serverUntil > clientUntil) {
        if (!S.save) S.save = {};
        S.save.adExemptUntil = serverUntil;
        await commit({
          [savePath(uid, "adExemptUntil")]: serverUntil
        });
        emit("save");
        emit("adExemptChanged", serverUntil);
      }
    }
  } catch (err) {
    console.warn("[ads] Exemption login check:", err);
  }
}

export function stopAdScheduler() {
  if (adTimer) {
    clearTimeout(adTimer);
    adTimer = null;
  }
}

export function scheduleNextAd(customDelayMs = null) {
  if (adTimer) {
    clearTimeout(adTimer);
    adTimer = null;
  }
  const delay = customDelayMs !== null ? customDelayMs : getRandomAdInterval();
  adTimer = setTimeout(() => {
    adTimer = null;
    triggerMandatoryAd();
  }, delay);
}

export function formatExemptionTime(untilMs) {
  if (!untilMs || untilMs <= Date.now()) return null;
  const d = new Date(untilMs);
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const diffDays = Math.ceil((untilMs - Date.now()) / (24 * 60 * 60 * 1000));
  return { dateStr, diffDays };
}

export async function buyAdExemption() {
  if (!S.uid) return false;
  const goldBal = bal("gold");
  if (goldBal < AD_EXEMPTION_COST_GOLD) {
    toast(t("ad.notEnoughGold"), "bad");
    return false;
  }

  try {
    const res = await fetch("/api/economy/ad-exemption/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, goldBalance: goldBal })
    });
    const data = await res.json();
    if (!res.ok || !data.allowed) {
      toast(t("ad.notEnoughGold"), "bad");
      return false;
    }

    const ok = await commit({
      [savePath(S.uid, "wallet/gold")]: increment(-AD_EXEMPTION_COST_GOLD),
      [savePath(S.uid, "adExemptUntil")]: data.exemptUntil
    });

    if (ok) {
      S.save.adExemptUntil = data.exemptUntil;
      if (S.save.wallet) {
        S.save.wallet.gold = Math.max(0, (S.save.wallet.gold || 0) - AD_EXEMPTION_COST_GOLD);
      }
      emit("save");
      emit("adExemptChanged", data.exemptUntil);
      toast(t("ad.exemptBought"), "good", 6000);
      return true;
    }

    // Rollback on server if Firebase commit failed
    await fetch("/api/economy/ad-exemption/rollback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, prevExemptUntil: data.prevExemptUntil || 0 })
    }).catch(() => {});
  } catch (err) {
    console.error("[buyAdExemption]", err);
    toast(t("msg.error"), "bad");
  }
  return false;
}

async function showInterstitialAd({ force = false } = {}) {
  if (interstitialBusy) return false;
  interstitialBusy = true;
  try {
    const uid = S.uid || (force ? "admin" : "guest");
    const ready = await ensureAdSlabSdk(uid);
    window.ADSLAB_INT = ADSLAB_INT_ID;
    window.ADSLAB_USER = String(uid);

    if (ready && typeof window.adslabShowInterstitial === "function") {
      window.dispatchEvent(new Event("blur"));
      await Promise.resolve(window.adslabShowInterstitial());
      return true;
    }

    toast(t("ad.sdkUnavailable"), "bad");
    return false;
  } catch (err) {
    console.warn("[ads] Interstitial call failed:", err);
    toast(t("ad.sdkUnavailable"), "bad");
    return false;
  } finally {
    interstitialBusy = false;
  }
}

export async function triggerMandatoryAd() {
  // Always double-check VIP exemption against server & Firebase before showing ad
  if (S.uid && !isAdExempt()) {
    await verifyAdExemptionOnLogin(S.uid);
  }
  // If player is exempt, do not display ad
  if (isAdExempt()) {
    scheduleNextAd();
    return;
  }
  // If not logged in or during sensitive roulette spin, delay briefly
  if (!S.uid || !S.profile) {
    scheduleNextAd(30000);
    return;
  }
  if (S.casino?.roulette?.lockedBet > 0) {
    scheduleNextAd(15000);
    return;
  }

  const shown = await showInterstitialAd({ force: false });
  // Mandatory: if SDK failed/blocked, retry in 60s; otherwise wait the 10-minute interval
  scheduleNextAd(shown ? null : 60000);
}

export async function triggerAdminInterstitial() {
  if (!isAdmin()) return false;
  return showInterstitialAd({ force: true });
}

// ─────────────────────────────────────────────────────────────
//  In-game Appearing Signboard Banners (AdsLab unit-n271qherh)
// ─────────────────────────────────────────────────────────────
const ADSLAB_BANNER_UNIT_ID = "unit-n271qherh";
const ADSLAB_BANNER_CONTAINER = "adslab-banner-unit-n271qherh";
const ADSLAB_BANNER_SCRIPT_URL = "https://serve.adslab.me/api/banner/js";
const GAME_SIGN_FIRST_DELAY_MS = 9000;
const GAME_SIGN_INTERVAL_MS = 75000;
const GAME_SIGN_DURATION_MS = 22000;

let signCycleTimer = null;
let signHideTimer = null;
let signListenersReady = false;
let signBannerRetryCount = 0;
let lastProximitySignId = null;

function getGameSignEl() {
  return typeof document !== "undefined" ? document.getElementById("game-ad-sign") : null;
}

function ensureGameBannerLoaded() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const container = document.getElementById(ADSLAB_BANNER_CONTAINER);
  if (!container) return;

  window.adslab_banners = window.adslab_banners || [];
  if (!window.adslab_banners.some((b) => b && b.container === ADSLAB_BANNER_CONTAINER)) {
    window.adslab_banners.push({
      id: ADSLAB_BANNER_UNIT_ID,
      container: ADSLAB_BANNER_CONTAINER
    });
  }

  // If the script ran before #screen-game became active and left the container empty, re-trigger once
  if (container.childElementCount === 0 && signBannerRetryCount < 2) {
    signBannerRetryCount += 1;
    const s = document.createElement("script");
    s.src = ADSLAB_BANNER_SCRIPT_URL;
    s.async = true;
    document.head.appendChild(s);
  }
}

export function hideGameAdSign() {
  if (signHideTimer) {
    clearTimeout(signHideTimer);
    signHideTimer = null;
  }
  const el = getGameSignEl();
  if (el) {
    el.classList.remove("visible");
    el.setAttribute("aria-hidden", "true");
  }
}

export function showGameAdSign(label = null, { manual = false } = {}) {
  if (!manual && isAdExempt()) return;
  if (!S.uid || !S.profile) return;

  const el = getGameSignEl();
  if (!el) return;

  ensureGameBannerLoaded();

  const titleEl = document.getElementById("game-ad-sign-title");
  if (titleEl) {
    titleEl.textContent = `🪧 ${label || t("ad.signTitle")}`;
  }
  const closeEl = document.getElementById("game-ad-sign-close");
  if (closeEl) {
    closeEl.setAttribute("aria-label", t("ad.signDismiss"));
  }

  el.classList.add("visible");
  el.setAttribute("aria-hidden", "false");

  if (signHideTimer) clearTimeout(signHideTimer);
  signHideTimer = setTimeout(() => {
    hideGameAdSign();
  }, GAME_SIGN_DURATION_MS);
}

function scheduleNextGameSign(delayMs = GAME_SIGN_INTERVAL_MS) {
  if (signCycleTimer) {
    clearTimeout(signCycleTimer);
    signCycleTimer = null;
  }
  signCycleTimer = setTimeout(() => {
    signCycleTimer = null;
    if (S.uid && S.profile) {
      showGameAdSign(t("ad.signTitle"), { manual: false });
      scheduleNextGameSign(GAME_SIGN_INTERVAL_MS);
    }
  }, delayMs);
}

export function initGameAdSign() {
  if (!signListenersReady && typeof document !== "undefined") {
    signListenersReady = true;
    const closeBtn = document.getElementById("game-ad-sign-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => hideGameAdSign());
    }
    on("modal", (open) => {
      const el = getGameSignEl();
      if (el) el.classList.toggle("modal-hidden", !!open);
    });
  }
  lastProximitySignId = null;
  signBannerRetryCount = 0;
  scheduleNextGameSign(GAME_SIGN_FIRST_DELAY_MS);
}

export function stopGameAdSign() {
  if (signCycleTimer) {
    clearTimeout(signCycleTimer);
    signCycleTimer = null;
  }
  lastProximitySignId = null;
  hideGameAdSign();
}

export function syncGameAdSignProximity(me) {
  if (!me || S.room !== "world") return;
  let nearSign = null;
  for (const s of AD_SIGNS) {
    if (GRID[s.y]?.[s.x] !== T.GRASS) continue;
    const d = Math.hypot(me.x - (s.x + 0.5), me.y - (s.y + 0.5));
    if (d < 1.85) {
      nearSign = s;
      break;
    }
  }
  if (nearSign) {
    if (lastProximitySignId !== nearSign.id) {
      lastProximitySignId = nearSign.id;
      showGameAdSign(t(nearSign.labelKey), { manual: true });
    }
  } else if (lastProximitySignId) {
    const prev = AD_SIGNS.find((s) => s.id === lastProximitySignId);
    if (!prev || Math.hypot(me.x - (prev.x + 0.5), me.y - (prev.y + 0.5)) > 2.6) {
      lastProximitySignId = null;
    }
  }
}
