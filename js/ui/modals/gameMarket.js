// The Game Market (NPC): buy seeds and sell harvested crops for Pool Points.
import { bal, inv } from "../../state.js";
import { t, fmtNum } from "../../i18n.js";
import { esc } from "../../utils.js";
import { CROPS, CROP_IDS } from "../../data/crops.js";
import { cropItemId } from "../../data/items.js";
import { money } from "../../data/currencies.js";
import { buySeeds, sellCrops } from "../../systems/economy.js";
import { openModal } from "../modal.js";

export function openGameMarket() {
  let tab = "buy";
  openModal({
    title: () => t("place.gameMarket"),
    events: ["save", "lang"],
    render(body, api) {
      const buy = CROP_IDS.map((id) => {
        const c = CROPS[id];
        const can = (n) => bal("pp") >= c.seedCost * n;
        return `<div class="row">
          <span class="ico-lg">${c.emoji}</span>
          <div class="grow"><b>${esc(t(`crop.${id}`))}</b>
            <small>${esc(t("gm.info", { time: c.grow, n: c.yield }))}</small></div>
          <div class="btns">
            <button class="btn small" data-buy="${id}" data-n="1" type="button" ${can(1) ? "" : "disabled"}>${money(c.seedCost, "pp")}</button>
            <button class="btn small alt" data-buy="${id}" data-n="5" type="button" ${can(5) ? "" : "disabled"}>×5</button>
          </div></div>`;
      }).join("");

      const owned = CROP_IDS.filter((id) => inv(cropItemId(id)) > 0);
      const sell = owned.map((id) => {
        const c = CROPS[id], n = inv(cropItemId(id));
        return `<div class="row">
          <span class="ico-lg">${c.emoji}</span>
          <div class="grow"><b>${esc(t(`crop.${id}`))}</b> <span class="qty">×${fmtNum(n)}</span>
            <small>${esc(t("gm.each"))} ${money(c.sell, "pp")}</small></div>
          <div class="btns">
            <button class="btn small" data-sell="${id}" data-n="1" type="button">${esc(t("act.sell"))}</button>
            <button class="btn small gold" data-sell="${id}" data-n="all" type="button">${esc(t("act.sellAll"))}</button>
          </div></div>`;
      }).join("");

      body.innerHTML = `
        <div class="balance">${esc(t("gm.balance"))} ${money(bal("pp"), "pp")}</div>
        <div class="tabs">
          <button class="${tab === "buy" ? "on" : ""}" data-tab="buy" type="button">${esc(t("gm.buy"))}</button>
          <button class="${tab === "sell" ? "on" : ""}" data-tab="sell" type="button">${esc(t("gm.sell"))}</button>
        </div>
        ${tab === "buy" ? buy : (sell || `<p class="muted">${esc(t("gm.nothing"))}</p>`)}`;

      body.onclick = (e) => {
        const tabBtn = e.target.closest("[data-tab]");
        if (tabBtn) { tab = tabBtn.dataset.tab; api.repaint(); return; }
        const b = e.target.closest("[data-buy]");
        if (b && !b.disabled) { buySeeds(b.dataset.buy, +b.dataset.n); return; }
        const s = e.target.closest("[data-sell]");
        if (s) sellCrops(s.dataset.sell, s.dataset.n === "all" ? Infinity : +s.dataset.n);
      };
    }
  });
}
