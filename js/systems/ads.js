// ─────────────────────────────────────────────────────────────
//  Mandatory Ad System & VIP Ad Exemption
//  - Displays mandatory ad every 5–10 minutes
//  - Uses FREE_SEED_LINK with 5s stay requirement (0 in-game rewards)
//  - Players can buy 1-month VIP exemption for 30 gold coins
// ─────────────────────────────────────────────────────────────
import { S, bal, isAdExempt } from "../state.js";
import { openModal, closeModal } from "../ui/modal.js";
import { t, fmtNum } from "../i18n.js";
import { esc } from "../utils.js";
import { toast } from "../ui/toast.js";
import { emit } from "../bus.js";
import { commit, savePath } from "./db.js";
import { increment } from "../firebase.js";
import {
  FREE_SEED_LINK,
  AD_MIN_INTERVAL_MS,
  AD_MAX_INTERVAL_MS,
  AD_REQUIRED_STAY_MS,
  AD_EXEMPTION_COST_GOLD,
  AD_EXEMPTION_DURATION_MS
} from "../config.js";

let adTimer = null;
let isAdModalShowing = false;

export function getRandomAdInterval() {
  return Math.floor(Math.random() * (AD_MAX_INTERVAL_MS - AD_MIN_INTERVAL_MS + 1)) + AD_MIN_INTERVAL_MS;
}

export function startAdScheduler() {
  stopAdScheduler();
  if (S.uid) {
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

export function isAdModalActive() {
  return isAdModalShowing;
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
      if (isAdModalShowing) {
        closeModal(true);
      }
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
  // If not logged in or during sensitive onboarding/spin, delay briefly
  if (!S.uid || !S.profile) {
    scheduleNextAd(30000);
    return;
  }
  if (S.casino?.roulette?.lockedBet > 0 || isAdModalShowing) {
    scheduleNextAd(15000);
    return;
  }

  openMandatoryAdModal();
}

export function openMandatoryAdModal() {
  if (isAdExempt()) return;
  isAdModalShowing = true;

  let adClicked = false;
  let clickTime = 0;
  let verified = false;
  let ticker = null;

  openModal({
    title: () => t("ad.title"),
    closable: false,
    events: ["save", "lang"],
    onClose() {
      if (ticker) {
        clearInterval(ticker);
        ticker = null;
      }
      isAdModalShowing = false;
      scheduleNextAd();
    },
    render(body, api) {
      const now = Date.now();
      const elapsed = adClicked ? (now - clickTime) : 0;
      const remainingSec = Math.max(0, Math.ceil((AD_REQUIRED_STAY_MS - elapsed) / 1000));
      const progressPercent = Math.min(100, Math.round((elapsed / AD_REQUIRED_STAY_MS) * 100));

      if (adClicked && elapsed >= AD_REQUIRED_STAY_MS && !verified) {
        verified = true;
        if (ticker) {
          clearInterval(ticker);
          ticker = null;
        }
      }

      const goldBal = bal("gold");
      const canBuyExempt = goldBal >= AD_EXEMPTION_COST_GOLD;

      let timerStatusHtml = "";
      if (!adClicked) {
        timerStatusHtml = `
          <div class="ad-status-box waiting">
            <span>👆</span>
            <div>${esc(t("ad.instructionPrompt"))}</div>
          </div>`;
      } else if (!verified) {
        timerStatusHtml = `
          <div class="ad-status-box in-progress">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <span>⏳ ${esc(t("ad.verifying"))}</span>
              <strong style="font-size: 14px; color: var(--gold);">${remainingSec}s</strong>
            </div>
            <div class="ad-progress-bar">
              <div class="ad-progress-fill" style="width: ${progressPercent}%;"></div>
            </div>
          </div>`;
      } else {
        timerStatusHtml = `
          <div class="ad-status-box verified">
            <span>✅</span>
            <strong>${esc(t("ad.verifiedNotice"))}</strong>
          </div>`;
      }

      body.innerHTML = `
        <div class="ad-modal-wrap">
          <div class="ad-notice-banner">
            <span class="ad-notice-icon">📢</span>
            <div class="ad-notice-text">
              <b>${esc(t("ad.noticeTitle"))}</b>
              <p>${esc(t("ad.noticeDesc"))}</p>
            </div>
          </div>

          <div class="ad-action-card">
            <div class="ad-card-head">
              <span class="ad-icon">🎬</span>
              <div>
                <strong>${esc(t("ad.sponsorTitle"))}</strong>
                <small>${esc(t("ad.sponsorSub"))}</small>
              </div>
            </div>

            <a id="ad-link-btn" class="btn gold large ad-link-cta" href="${esc(FREE_SEED_LINK)}" target="_blank" rel="noopener noreferrer">
              <span>🌐 ${esc(t("ad.openLinkBtn"))}</span>
              <span class="ad-external-arrow">↗</span>
            </a>

            ${timerStatusHtml}

            <button id="ad-continue-btn" type="button" class="btn good large ad-continue-cta" ${verified ? "" : "disabled"}>
              🎮 ${esc(t("ad.continueBtn"))}
            </button>
          </div>

          <div class="ad-exempt-vip-card">
            <div class="ad-vip-header">
              <div class="ad-vip-title-group">
                <span class="ad-vip-crown">👑</span>
                <div>
                  <strong class="ad-vip-title">${esc(t("ad.exemptTitle"))}</strong>
                  <div class="ad-vip-subtitle">${esc(t("ad.exemptDesc"))}</div>
                </div>
              </div>
              <span class="ad-vip-tag">30 DIAS</span>
            </div>

            <div class="ad-vip-footer">
              <div class="ad-vip-balance">
                <small>${esc(t("ad.yourGold"))}</small>
                <span>${fmtNum(goldBal)} 🥇</span>
              </div>
              <button id="ad-buy-vip-btn" type="button" class="btn gold small" ${canBuyExempt ? "" : "disabled"}>
                👑 ${esc(t("ad.buyExemptBtn", { cost: AD_EXEMPTION_COST_GOLD }))}
              </button>
            </div>
          </div>
        </div>
      `;

      // Event handlers
      const linkBtn = body.querySelector("#ad-link-btn");
      if (linkBtn) {
        linkBtn.onclick = () => {
          if (!adClicked) {
            adClicked = true;
            clickTime = Date.now();
            if (ticker) clearInterval(ticker);
            ticker = setInterval(() => {
              const el = Date.now() - clickTime;
              if (el >= AD_REQUIRED_STAY_MS) {
                verified = true;
                clearInterval(ticker);
                ticker = null;
              }
              api.repaint();
            }, 300);
            api.repaint();
          }
        };
      }

      const contBtn = body.querySelector("#ad-continue-btn");
      if (contBtn) {
        contBtn.onclick = () => {
          if (verified) {
            api.close();
          }
        };
      }

      const buyVipBtn = body.querySelector("#ad-buy-vip-btn");
      if (buyVipBtn) {
        buyVipBtn.onclick = () => {
          if (canBuyExempt) {
            buyAdExemption();
          }
        };
      }
    }
  });
}
