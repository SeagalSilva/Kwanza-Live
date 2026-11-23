import { S, inv, bal } from "../../state.js";
import { t, fmtNum } from "../../i18n.js";
import { esc, fmtTime } from "../../utils.js";
import { LAND_META } from "../../world/map.js";
import { COINS, money, curName } from "../../data/currencies.js";
import { ALL_ITEM_IDS, itemIcon, itemName } from "../../data/items.js";
import { LAND_PRICE_GOLD, LAND_PRICE_BRONZE_EQUIV } from "../../data/lands.js";
import {
  ANIMAL_TYPES,
  LAND_MODES,
  MAX_ANIMALS_PER_LAND,
  totalCoinsInBronze,
  ensureLandOpSynced,
  getLandModeCooldown,
  getLandServerNow,
  formatUtcDateTime,
  formatCooldownDuration,
  buyLand,
  setLandMode,
  buyAnimal,
  collectAnimal,
  stockLandShop,
  removeLandStock,
  setLuckSpinConfig,
  buyFromBulkShop,
  spinLuckShop,
  claimLandShopEarnings
} from "../../systems/lands.js";
import { openModal } from "../modal.js";

function formatUtcClockOnly(ms) {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss} UTC`;
}

export function openLand(id) {
  const meta = LAND_META.find((l) => l.id === id);
  if (!meta) return;

  if (S.lands[id]) {
    ensureLandOpSynced(id);
  }

  let tickTimer = null;

  openModal({
    title: () => t("land.title", { id }),
    events: ["lands", "save", "lang"],
    onClose() {
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    },
    render(body, api) {
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }

      const land = S.lands[id];
      if (!land) {
        const total = totalCoinsInBronze();
        const can = total >= LAND_PRICE_BRONZE_EQUIV;
        body.innerHTML = `
          <div class="land-card">
            <div class="big">🏡</div>
            <p>${esc(t("land.forSale"))}</p>
            <p class="price">${money(LAND_PRICE_GOLD, "gold")}</p>
            <p class="muted" style="padding: 2px 0 6px; font-size: 13px;">${esc(t("land.coinPriceNote"))}</p>
            <div class="balance" style="justify-content: center; flex-wrap: wrap;">
              <span>${esc(t("land.yourCoins"))}:</span>
              ${money(bal("gold"), "gold")}
              ${money(bal("silver"), "silver")}
              ${money(bal("bronze"), "bronze")}
            </div>
            <p class="muted">${esc(t("land.perks"))}</p>
            <button class="btn gold big" id="land-buy" type="button" ${can ? "" : "disabled"}>${esc(t("act.buy"))}</button>
            ${can ? "" : `<p class="muted" style="color: var(--bad);">${esc(t("msg.notEnoughCoinsLand"))}</p>`}
          </div>`;
        body.querySelector("#land-buy").onclick = async () => { if (await buyLand(id)) api.close(); };
        return;
      }

      const mine = land.owner === S.uid;
      const op = S.landOps[id] || { mode: "farm", animals: {}, stock: {}, pendingEarnings: {} };
      const mode = op.mode || "farm";
      const cd = getLandModeCooldown(op);
      const stockEntries = Object.entries(op.stock || {}).filter(([, s]) => s && s.qty > 0);
      const animalEntries = Object.entries(op.animals || {});
      const pending = op.pendingEarnings || { bronze: 0, silver: 0, gold: 0 };
      const hasEarnings = (pending.bronze || 0) + (pending.silver || 0) + (pending.gold || 0) > 0;

      let html = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div class="land-card" style="padding: 12px;">
            <div class="big">${mode === "animals" ? "🐄" : mode === "bulkShop" ? "🏪" : mode === "luckShop" ? "🎲" : (mine ? "🌾" : "🔒")}</div>
            <p style="margin: 4px 0;">${esc(mine ? t("land.yours") : t("land.ownedBy", { name: land.ownerName || "?" }))}</p>
            <p class="muted" style="font-size: 12px; margin: 0;">${esc(t(`land.modeDesc.${mode}`))}</p>
          </div>`;

      if (mine) {
        html += `
          <div class="tabs">
            ${LAND_MODES.map((m) => {
              const active = mode === m;
              const disabled = cd.locked && !active;
              return `<button class="${active ? "on" : ""}" data-mode="${m}" type="button" ${disabled ? "disabled" : ""}>${disabled ? "🔒 " : ""}${esc(t(`land.mode.${m}`))}</button>`;
            }).join("")}
          </div>`;

        if (cd.locked) {
          html += `
            <div style="background: rgba(245, 197, 24, 0.1); border: 1px solid rgba(245, 197, 24, 0.45); border-radius: 12px; padding: 10px 12px; display: grid; gap: 4px; font-size: 12.5px;">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                <strong style="color: var(--gold);">⏳ ${esc(t("land.modeCooldownTitle"))}</strong>
                <span class="muted" id="land-utc-now" style="font-variant-numeric: tabular-nums;">🕒 ${formatUtcClockOnly(cd.serverNow)}</span>
              </div>
              <div>
                <span class="muted">${esc(t("land.modeCooldownRemaining"))}:</span>
                <strong id="land-cooldown-rem" style="color: var(--txt); font-variant-numeric: tabular-nums;">${formatCooldownDuration(cd.remainingMs)}</strong>
              </div>
              <div>
                <span class="muted">${esc(t("land.modeCooldownUntilUtc"))}:</span>
                <strong style="color: var(--ok); font-variant-numeric: tabular-nums;">${esc(formatUtcDateTime(cd.nextAllowedAt))}</strong>
              </div>
            </div>`;
        } else {
          html += `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; padding: 2px 4px;">
              <span class="muted">ℹ️ ${esc(t("land.modeCooldownHint"))}</span>
              <span class="muted" id="land-utc-now" style="font-variant-numeric: tabular-nums;">🕒 ${formatUtcClockOnly(cd.serverNow)}</span>
            </div>`;
        }

        if (hasEarnings) {
          html += `
            <div style="background: rgba(89, 209, 122, 0.12); border: 1px solid var(--ok); border-radius: 12px; padding: 10px; text-align: center; display: grid; gap: 6px;">
              <strong style="font-size: 13px; color: var(--ok);">💰 ${esc(t("land.pendingEarnings"))}</strong>
              <div class="balance" style="justify-content: center; flex-wrap: wrap;">
                ${pending.gold > 0 ? money(pending.gold, "gold") : ""}
                ${pending.silver > 0 ? money(pending.silver, "silver") : ""}
                ${pending.bronze > 0 ? money(pending.bronze, "bronze") : ""}
              </div>
              <button id="land-claim-earnings" class="btn gold small" type="button">${esc(t("land.btnClaimEarnings"))}</button>
            </div>`;
        }

        if (mode === "farm") {
          html += `<p class="muted center">${esc(t("land.yoursInfo"))}</p>`;
        } else if (mode === "animals") {
          html += `
            <div style="display: grid; gap: 8px;">
              <p class="muted" style="font-size: 12px; margin: 0;">${esc(t("land.animalsCount", { n: animalEntries.length, max: MAX_ANIMALS_PER_LAND }))}</p>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                ${Object.entries(ANIMAL_TYPES).map(([key, cfg]) => `
                  <button class="btn alt small" data-buy-animal="${key}" type="button" ${bal("bronze") < cfg.costBronze || animalEntries.length >= MAX_ANIMALS_PER_LAND ? "disabled" : ""}>
                    ${cfg.emoji} ${esc(t(`land.animal.${key}`))}<br><small>${fmtNum(cfg.costBronze)} 🥉</small>
                  </button>
                `).join("")}
              </div>
              ${animalEntries.length ? animalEntries.map(([aKey, a]) => {
                const cfg = ANIMAL_TYPES[a.type];
                if (!cfg) return "";
                const leftMs = Math.max(0, cfg.cooldownMs - (Date.now() - (a.lastAt || 0)));
                const ready = leftMs <= 0;
                return `
                  <div class="row">
                    <span class="ico-lg">${cfg.emoji}</span>
                    <div class="grow"><b>${esc(t(`land.animal.${a.type}`))}</b>
                      <small>${ready ? t("land.animalReady", { n: cfg.yieldQty, item: itemName(cfg.yieldItem) }) : fmtTime(leftMs / 1000)}</small>
                    </div>
                    <button class="btn small ${ready ? "gold" : "alt"}" data-collect-animal="${aKey}" type="button" ${ready ? "" : "disabled"}>
                      ${esc(t("land.btnCollect"))}
                    </button>
                  </div>`;
              }).join("") : `<p class="muted center">${esc(t("land.noAnimals"))}</p>`}
            </div>`;
        } else {
          const myItems = ALL_ITEM_IDS.filter((itemId) => inv(itemId) > 0);
          if (mode === "luckShop") {
            const lp = Math.max(1, Number(op.luckPrice) || 5);
            const lc = COINS.includes(op.luckCurrency) ? op.luckCurrency : "bronze";
            html += `
              <div style="background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px; padding: 10px; display: grid; gap: 6px;">
                <label style="font-size: 12px; margin: 0;">${esc(t("land.luckTicketTitle"))}</label>
                <div style="display: flex; gap: 6px;">
                  <input id="land-luck-price" type="number" min="1" value="${lp}" style="width: 45%;" />
                  <select id="land-luck-cur" style="width: 55%;">${COINS.map((c) => `<option value="${c}" ${c === lc ? "selected" : ""}>${esc(curName(c))}</option>`).join("")}</select>
                </div>
                <button id="land-save-luck" class="btn alt small" type="button">${esc(t("land.btnSaveLuck"))}</button>
              </div>`;
          }
          html += `
            <div style="background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px; padding: 10px; display: grid; gap: 6px;">
              <label style="font-size: 12px; margin: 0;">${esc(t("land.restockTitle"))}</label>
              ${myItems.length ? `
                <select id="land-stock-item">${myItems.map((iid) => `<option value="${iid}">${esc(itemName(iid))} (×${fmtNum(inv(iid))})</option>`).join("")}</select>
                <div class="grid2">
                  <div><label>${esc(t("pm.qty"))}</label><input id="land-stock-qty" type="number" min="1" value="1" /></div>
                  ${mode === "bulkShop" ? `<div><label>${esc(t("pm.price"))}</label><input id="land-stock-price" type="number" min="1" value="10" /></div>` : `<div></div>`}
                </div>
                ${mode === "bulkShop" ? `<select id="land-stock-cur">${COINS.map((c) => `<option value="${c}">${esc(curName(c))}</option>`).join("")}</select>` : ""}
                <button id="land-add-stock" class="btn gold small" type="button">${esc(t("land.btnAddStock"))}</button>
              ` : `<p class="muted" style="font-size: 12px;">${esc(t("pm.noItems"))}</p>`}
            </div>
            <div>
              <label style="font-size: 12px;">${esc(t("land.currentStock"))} (${stockEntries.length})</label>
              ${stockEntries.length ? stockEntries.map(([sk, s]) => `
                <div class="row">
                  <span class="ico-lg">${itemIcon(s.item)}</span>
                  <div class="grow"><b>${esc(itemName(s.item))}</b> <span class="qty">×${fmtNum(s.qty)}</span></div>
                  <div class="btns">
                    ${mode === "bulkShop" ? money(s.price, s.currency) : ""}
                    <button class="btn small alt" data-unstock="${sk}" type="button">${esc(t("act.cancel"))}</button>
                  </div>
                </div>`).join("") : `<p class="muted" style="font-size: 12px;">${esc(t("land.outOfStock"))}</p>`}
            </div>`;
        }
      } else {
        if (mode === "bulkShop") {
          html += stockEntries.length
            ? stockEntries.map(([sk, s]) => `
                <div class="row">
                  <span class="ico-lg">${itemIcon(s.item)}</span>
                  <div class="grow"><b>${esc(itemName(s.item))}</b> <span class="qty">×${fmtNum(s.qty)}</span></div>
                  <div class="btns col">
                    ${money(s.price, s.currency)}
                    <button class="btn small gold" data-buy-stock="${sk}" type="button" ${bal(s.currency) < s.price ? "disabled" : ""}>${esc(t("act.buy"))}</button>
                  </div>
                </div>`).join("")
            : `<p class="muted center">${esc(t("land.outOfStock"))}</p>`;
        } else if (mode === "luckShop") {
          const lp = Math.max(1, Number(op.luckPrice) || 5);
          const lc = COINS.includes(op.luckCurrency) ? op.luckCurrency : "bronze";
          html += `
            <div class="land-card">
              <p>${esc(t("land.luckPool", { n: stockEntries.length }))}</p>
              <p>${money(lp, lc)}</p>
              <button id="land-spin-luck" class="btn gold big" type="button" ${stockEntries.length === 0 || bal(lc) < lp ? "disabled" : ""}>
                🎲 ${esc(t("land.btnSpinLuck"))}
              </button>
              ${stockEntries.length === 0 ? `<p class="muted">${esc(t("land.outOfStock"))}</p>` : ""}
            </div>`;
        } else {
          html += `<p class="muted center">${esc(t("land.closed"))}</p>`;
        }
      }

      html += `</div>`;
      body.innerHTML = html;

      if (mine) {
        let wasLocked = cd.locked;
        tickTimer = setInterval(() => {
          if (!body.isConnected) { clearInterval(tickTimer); tickTimer = null; return; }
          const utcEl = body.querySelector("#land-utc-now");
          if (utcEl) utcEl.textContent = `🕒 ${formatUtcClockOnly(getLandServerNow())}`;

          const nextCd = getLandModeCooldown(S.landOps[id] || op);
          const remEl = body.querySelector("#land-cooldown-rem");
          if (remEl) remEl.textContent = formatCooldownDuration(nextCd.remainingMs);

          if (wasLocked && !nextCd.locked) {
            wasLocked = false;
            api.repaint();
          }
        }, 1000);
      }

      body.onclick = async (e) => {
        if (e.target.id === "land-claim-earnings") { await claimLandShopEarnings(id); return; }

        const modeBtn = e.target.closest("[data-mode]");
        if (modeBtn && !modeBtn.disabled) { await setLandMode(id, modeBtn.dataset.mode); return; }

        const buyAnimBtn = e.target.closest("[data-buy-animal]");
        if (buyAnimBtn) { await buyAnimal(id, buyAnimBtn.dataset.buyAnimal); return; }

        const colAnimBtn = e.target.closest("[data-collect-animal]");
        if (colAnimBtn) { await collectAnimal(id, colAnimBtn.dataset.collectAnimal); return; }

        if (e.target.id === "land-save-luck") {
          const p = +body.querySelector("#land-luck-price").value;
          const c = body.querySelector("#land-luck-cur").value;
          await setLuckSpinConfig(id, p, c);
          return;
        }

        if (e.target.id === "land-add-stock") {
          const item = body.querySelector("#land-stock-item").value;
          const qty = +body.querySelector("#land-stock-qty").value;
          const priceEl = body.querySelector("#land-stock-price");
          const curEl = body.querySelector("#land-stock-cur");
          await stockLandShop(id, {
            item,
            qty,
            price: priceEl ? +priceEl.value : 1,
            currency: curEl ? curEl.value : "bronze"
          });
          return;
        }

        const unstock = e.target.closest("[data-unstock]");
        if (unstock) { await removeLandStock(id, unstock.dataset.unstock); return; }

        const buyStock = e.target.closest("[data-buy-stock]");
        if (buyStock) { await buyFromBulkShop(id, buyStock.dataset.buyStock); return; }

        if (e.target.id === "land-spin-luck") { await spinLuckShop(id); }
      };
    }
  });
}
