import { bal, S, isAdExempt } from "../../state.js";
import { t } from "../../i18n.js";
import { esc } from "../../utils.js";
import { ALL_CURRENCIES, EXCHANGES, curIcon, money } from "../../data/currencies.js";
import { exchange } from "../../systems/economy.js";
import { buyAdExemption, formatExemptionTime } from "../../systems/ads.js";
import { AD_EXEMPTION_COST_GOLD } from "../../config.js";
import { openModal } from "../modal.js";

export function openWallet() {
  openModal({
    title: () => t("wal.title"),
    events: ["save", "lang", "adExemptChanged"],
    render(body) {
      const balances = ALL_CURRENCIES.map((c) =>
        `<div class="row"><span class="ico-lg">${curIcon(c)}</span>
           <div class="grow"><b>${esc(t(`cur.${c}`))}</b><small>${esc(t(c === "pp" ? "wal.ppInfo" : "wal.coinInfo"))}</small></div>
           ${money(bal(c), c)}</div>`).join("");

      const ex = EXCHANGES.map((x) =>
        `<button class="btn alt" data-from="${x.from}" data-to="${x.to}" type="button" ${bal(x.from) < x.cost ? "disabled" : ""}>
           ${money(x.cost, x.from)} <span class="arrow">→</span> ${money(x.gain, x.to)}
         </button>`).join("");

      const exempt = isAdExempt();
      const exemptInfo = formatExemptionTime(S.save?.adExemptUntil);
      const goldBal = bal("gold");
      const canBuy = goldBal >= AD_EXEMPTION_COST_GOLD;

      const vipBox = `
        <div class="ad-exempt-vip-card" style="margin-top: 14px;">
          <div class="ad-vip-header">
            <div class="ad-vip-title-group">
              <span class="ad-vip-crown">👑</span>
              <div>
                <strong class="ad-vip-title">${esc(t("ad.exemptTitle"))}</strong>
                <div class="ad-vip-subtitle">${esc(t("ad.exemptDesc"))}</div>
              </div>
            </div>
            <span class="ad-vip-tag ${exempt ? "active" : ""}">
              ${exempt ? esc(t("ad.statusActive")) : esc(t("ad.statusInactive"))}
            </span>
          </div>

          ${exempt && exemptInfo ? `
            <div class="ad-vip-active-info">
              ✨ ${esc(t("ad.activeUntil", { date: exemptInfo.dateStr, days: exemptInfo.diffDays }))}
            </div>
          ` : `
            <div class="ad-vip-inactive-info">
              📢 ${esc(t("ad.mandatoryNote"))}
            </div>
          `}

          <div class="ad-vip-footer">
            <div class="ad-vip-balance">
              <small>${esc(t("ad.yourGold"))}</small>
              <span>${goldBal} 🥇</span>
            </div>
            <button id="wal-buy-vip-btn" type="button" class="btn gold small" ${canBuy ? "" : "disabled"}>
              👑 ${exempt ? esc(t("ad.extendExemptBtn", { cost: AD_EXEMPTION_COST_GOLD })) : esc(t("ad.buyExemptBtn", { cost: AD_EXEMPTION_COST_GOLD }))}
            </button>
          </div>
        </div>
      `;

      body.innerHTML = `${balances}
        <h3>${esc(t("wal.exchange"))}</h3>
        <div class="grid2">${ex}</div>
        <p class="muted small-note">${esc(t("wal.rate"))}</p>
        ${vipBox}`;

      body.onclick = (e) => {
        const b = e.target.closest("[data-from]");
        if (b && !b.disabled) { exchange(b.dataset.from, b.dataset.to); return; }
        const vipBtn = e.target.closest("#wal-buy-vip-btn");
        if (vipBtn && !vipBtn.disabled) { buyAdExemption(); return; }
      };
    }
  });
}
