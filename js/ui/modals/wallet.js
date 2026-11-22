import { bal } from "../../state.js";
import { t } from "../../i18n.js";
import { esc } from "../../utils.js";
import { ALL_CURRENCIES, EXCHANGES, curIcon, money } from "../../data/currencies.js";
import { exchange } from "../../systems/economy.js";
import { openModal } from "../modal.js";

export function openWallet() {
  openModal({
    title: () => t("wal.title"),
    events: ["save", "lang"],
    render(body) {
      const balances = ALL_CURRENCIES.map((c) =>
        `<div class="row"><span class="ico-lg">${curIcon(c)}</span>
           <div class="grow"><b>${esc(t(`cur.${c}`))}</b><small>${esc(t(c === "pp" ? "wal.ppInfo" : "wal.coinInfo"))}</small></div>
           ${money(bal(c), c)}</div>`).join("");

      const ex = EXCHANGES.map((x) =>
        `<button class="btn alt" data-from="${x.from}" data-to="${x.to}" type="button" ${bal(x.from) < x.cost ? "disabled" : ""}>
           ${money(x.cost, x.from)} <span class="arrow">→</span> ${money(x.gain, x.to)}
         </button>`).join("");

      body.innerHTML = `${balances}<h3>${esc(t("wal.exchange"))}</h3><div class="grid2">${ex}</div>
        <p class="muted small-note">${esc(t("wal.rate"))}</p>`;
      body.onclick = (e) => {
        const b = e.target.closest("[data-from]");
        if (b && !b.disabled) exchange(b.dataset.from, b.dataset.to);
      };
    }
  });
}
