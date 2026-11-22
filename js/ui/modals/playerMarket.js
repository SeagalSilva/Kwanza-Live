// The Bazaar: players trade with each other using bronze / silver / gold coins.
import { S, inv, bal } from "../../state.js";
import { t, fmtNum } from "../../i18n.js";
import { esc } from "../../utils.js";
import { COINS, money, curName } from "../../data/currencies.js";
import { ALL_ITEM_IDS, itemIcon, itemName } from "../../data/items.js";
import { MAX_LISTING_PRICE } from "../../config.js";
import { createListing, cancelListing, buyListing } from "../../systems/market.js";
import { openModal } from "../modal.js";

export function openPlayerMarket() {
  let tab = "browse";
  let filter = "all";

  openModal({
    title: () => t("place.bazaar"),
    events: ["listings", "save", "lang"],
    // The "sell" form must not be rebuilt while the player is typing.
    shouldRepaint: (evt) => !(tab === "sell" && evt !== "lang"),
    render(body, api) {
      const all = Object.entries(S.listings)
        .map(([id, l]) => ({ id, ...l }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const open = all.filter((l) => !l.soldTo);

      const card = (l, mine) => `
        <div class="row">
          <span class="ico-lg">${itemIcon(l.item)}</span>
          <div class="grow"><b>${esc(itemName(l.item))}</b> <span class="qty">×${fmtNum(l.qty)}</span>
            <small>${esc(t("pm.seller"))}: ${esc(l.sellerName || "?")}</small></div>
          <div class="btns col">
            ${money(l.price, l.currency)}
            ${mine
              ? `<button class="btn small alt" data-cancel="${l.id}" type="button">${esc(t("act.cancel"))}</button>`
              : `<button class="btn small" data-buy="${l.id}" type="button" ${bal(l.currency) < l.price ? "disabled" : ""}>${esc(t("act.buy"))}</button>`}
          </div>
        </div>`;

      let content = "";
      if (tab === "browse") {
        const list = open.filter((l) => filter === "all" || l.item === filter);
        const opts = [`<option value="all">${esc(t("pm.filterAll"))}</option>`]
          .concat(ALL_ITEM_IDS.map((id) => `<option value="${id}" ${filter === id ? "selected" : ""}>${esc(itemName(id))}</option>`)).join("");
        content = `<select id="pm-filter">${opts}</select>` +
          (list.length ? list.map((l) => card(l, l.seller === S.uid)).join("") : `<p class="muted">${esc(t("pm.empty"))}</p>`);
      } else if (tab === "mine") {
        const mine = all.filter((l) => l.seller === S.uid);
        content = mine.length
          ? mine.map((l) => l.soldTo
              ? `<div class="row"><span class="ico-lg">${itemIcon(l.item)}</span><div class="grow"><b>${esc(itemName(l.item))}</b> <span class="qty">×${fmtNum(l.qty)}</span><small>✔ ${esc(t("pm.sold"))}</small></div>${money(l.price, l.currency)}</div>`
              : card(l, true)).join("")
          : `<p class="muted">${esc(t("pm.noneMine"))}</p>`;
      } else {
        const items = ALL_ITEM_IDS.filter((id) => inv(id) > 0);
        content = items.length ? `
          <label>${esc(t("pm.item"))}</label>
          <select id="pm-item">${items.map((id) => `<option value="${id}">${esc(itemName(id))} (×${fmtNum(inv(id))})</option>`).join("")}</select>
          <div class="grid2">
            <div><label>${esc(t("pm.qty"))}</label><input id="pm-qty" type="number" min="1" step="1" value="1" inputmode="numeric"></div>
            <div><label>${esc(t("pm.price"))}</label><input id="pm-price" type="number" min="1" max="${MAX_LISTING_PRICE}" step="1" value="10" inputmode="numeric"></div>
          </div>
          <label>${esc(t("pm.currency"))}</label>
          <select id="pm-cur">${COINS.map((c) => `<option value="${c}">${esc(curName(c))}</option>`).join("")}</select>
          <button class="btn" id="pm-create" type="button">${esc(t("pm.create"))}</button>
          <p class="muted small-note">${esc(t("pm.escrow"))}</p>`
          : `<p class="muted">${esc(t("pm.noItems"))}</p>`;
      }

      body.innerHTML = `
        <div class="tabs">
          ${["browse", "sell", "mine"].map((k) => `<button class="${tab === k ? "on" : ""}" data-tab="${k}" type="button">${esc(t(`pm.tab.${k}`))}</button>`).join("")}
        </div>${content}`;

      const filterEl = body.querySelector("#pm-filter");
      if (filterEl) filterEl.onchange = () => { filter = filterEl.value; api.repaint(); };

      body.onclick = async (e) => {
        const tabBtn = e.target.closest("[data-tab]");
        if (tabBtn) { tab = tabBtn.dataset.tab; api.repaint(); return; }
        const buy = e.target.closest("[data-buy]");
        if (buy && !buy.disabled) { buyListing(buy.dataset.buy); return; }
        const cancel = e.target.closest("[data-cancel]");
        if (cancel) { cancelListing(cancel.dataset.cancel); return; }
        if (e.target.id === "pm-create") {
          const ok = await createListing({
            item: body.querySelector("#pm-item").value,
            qty: +body.querySelector("#pm-qty").value,
            price: +body.querySelector("#pm-price").value,
            currency: body.querySelector("#pm-cur").value
          });
          if (ok) { tab = "mine"; api.repaint(); }
        }
      };
    }
  });
}
