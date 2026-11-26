// ─────────────────────────────────────────────────────────────
//  Correio Central (Post Office) Modal
//  - View letters, shift rewards, and daily pool prizes
//  - Claim individual rewards or "Receber Tudo" in 1 click
// ─────────────────────────────────────────────────────────────
import { openModal } from "../modal.js";
import { t, fmtNum } from "../../i18n.js";
import { esc } from "../../utils.js";
import { getMailState, fetchInbox, claimMail, claimAllMail, markMailRead } from "../../systems/mail.js";

export function openPostOffice() {
  fetchInbox(); // Refresh fresh mail data from server
  let filter = "all"; // "all" | "rewards" | "unread"
  let expandedMailId = null;

  openModal({
    title: () => t("place.postOffice"),
    events: ["mail", "save", "lang"],
    render(body, api) {
      const state = getMailState();
      const allMails = state.mails || [];
      const totalClaimable = state.totalClaimableBronze || 0;
      const isClaiming = !!state.claiming;

      let filtered = allMails;
      if (filter === "rewards") {
        filtered = allMails.filter((m) => m.reward && !m.claimed);
      } else if (filter === "unread") {
        filtered = allMails.filter((m) => !m.read);
      }

      const rewardCount = allMails.filter((m) => m.reward && !m.claimed).length;
      const unreadCount = allMails.filter((m) => !m.read).length;

      // Claim all banner
      let claimAllBanner = "";
      if (totalClaimable > 0) {
        claimAllBanner = `
          <div class="mail-claim-all-box">
            <div class="mail-claim-info">
              <span class="mail-gift-icon">🎁</span>
              <div>
                <strong>${esc(t("mail.claimAllTitle", { n: fmtNum(totalClaimable) }))}</strong>
                <p>${esc(t("mail.claimAllDesc"))}</p>
              </div>
            </div>
            <button id="mail-claim-all-btn" class="btn good small" type="button" style="white-space: nowrap; font-weight: 700;" ${isClaiming ? "disabled" : ""}>
              📥 ${esc(t("mail.claimAllBtn", { n: fmtNum(totalClaimable) }))}
            </button>
          </div>
        `;
      }

      // Tabs
      const tabsHtml = `
        <div class="tabs mail-tabs">
          <button class="${filter === "all" ? "on" : ""}" data-tab="all" type="button">
            ${esc(t("mail.tabAll"))} (${allMails.length})
          </button>
          <button class="${filter === "rewards" ? "on" : ""}" data-tab="rewards" type="button">
            🎁 ${esc(t("mail.tabRewards"))} ${rewardCount > 0 ? `<span class="mail-badge-count">${rewardCount}</span>` : ""}
          </button>
          <button class="${filter === "unread" ? "on" : ""}" data-tab="unread" type="button">
            ✉️ ${esc(t("mail.tabUnread"))} ${unreadCount > 0 ? `<span class="mail-badge-count">${unreadCount}</span>` : ""}
          </button>
        </div>
      `;

      // Letters list
      let listHtml = "";
      if (filtered.length === 0) {
        listHtml = `
          <div class="mail-empty-state">
            <span style="font-size: 38px;">📭</span>
            <p>${esc(t("mail.empty"))}</p>
          </div>
        `;
      } else {
        listHtml = filtered.map((m) => {
          const isExpanded = expandedMailId === m.id;
          const hasReward = m.reward && (m.reward.bronze > 0 || m.reward.items);
          const isClaimed = !!m.claimed;
          const isVip = m.type === "vip_status";

          let rewardBadge = "";
          if (hasReward) {
            const b = m.reward.bronze || 0;
            rewardBadge = `
              <div class="mail-reward-row">
                <span class="mail-reward-chip">+${fmtNum(b)} 🥉</span>
                <button class="btn ${isClaimed ? "alt" : "good"} small mail-claim-one-btn" data-claim-id="${esc(m.id)}" type="button" ${isClaimed || isClaiming ? "disabled" : ""}>
                  ${isClaimed ? "✅ " + esc(t("mail.alreadyClaimed")) : "🎁 " + esc(t("mail.claimBtn"))}
                </button>
              </div>
            `;
          }

          const dateStr = m.createdAt ? new Date(m.createdAt).toLocaleDateString("pt-PT", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

          return `
            <div class="mail-card ${!m.read ? "unread" : ""} ${isVip ? "vip-letter" : ""}" data-mail-id="${esc(m.id)}">
              <div class="mail-header-row">
                <div class="mail-sender-group">
                  <span class="mail-sender-icon">${m.senderIcon || "📨"}</span>
                  <div>
                    <strong class="mail-sender-name">${esc(m.sender || t("mail.systemSender"))}</strong>
                    <div class="mail-subject">${esc(m.subject || "")}</div>
                  </div>
                </div>
                <div class="mail-date-meta">
                  <span class="mail-date">${dateStr}</span>
                  ${!m.read ? `<span class="mail-unread-pip"></span>` : ""}
                </div>
              </div>

              <div class="mail-body-content ${isExpanded ? "expanded" : ""}">
                <p>${esc(m.body || "")}</p>
              </div>

              ${rewardBadge}
            </div>
          `;
        }).join("");
      }

      body.innerHTML = `
        <div class="mail-modal-container">
          <div class="mail-banner-header">
            <span>📮</span>
            <div>
              <b>${esc(t("mail.bannerTitle"))}</b>
              <small>${esc(t("mail.bannerSub"))}</small>
            </div>
          </div>
          ${claimAllBanner}
          ${tabsHtml}
          <div class="mail-list-wrap">
            ${listHtml}
          </div>
        </div>
      `;

      // Event bindings
      const claimAllBtn = body.querySelector("#mail-claim-all-btn");
      if (claimAllBtn) {
        claimAllBtn.onclick = () => {
          if (getMailState().claiming) return;
          claimAllBtn.disabled = true;
          claimAllMail();
        };
      }

      body.querySelectorAll("[data-tab]").forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          filter = btn.dataset.tab;
          api.repaint();
        };
      });

      body.querySelectorAll(".mail-claim-one-btn").forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          if (getMailState().claiming) return;
          const mid = btn.dataset.claimId;
          if (mid) {
            btn.disabled = true;
            claimMail(mid);
          }
        };
      });

      body.querySelectorAll(".mail-card").forEach((card) => {
        card.onclick = (e) => {
          if (e.target.closest("button")) return;
          const mid = card.dataset.mailId;
          expandedMailId = (expandedMailId === mid) ? null : mid;
          markMailRead(mid);
          api.repaint();
        };
      });
    }
  });
}
