import { S, bal } from "../../state.js";
import { t } from "../../i18n.js";
import { esc } from "../../utils.js";
import { LAND_META } from "../../world/map.js";
import { money } from "../../data/currencies.js";
import { buyLand } from "../../systems/lands.js";
import { openModal } from "../modal.js";

import { totalCoinsInBronze } from "../../systems/lands.js";
import { LAND_PRICE_GOLD, LAND_PRICE_BRONZE_EQUIV } from "../../data/lands.js";

export function openLand(id) {
  const meta = LAND_META.find((l) => l.id === id);
  if (!meta) return;
  openModal({
    title: () => t("land.title", { id }),
    events: ["lands", "save", "lang"],
    render(body, api) {
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
      } else {
        const mine = land.owner === S.uid;
        body.innerHTML = `
          <div class="land-card">
            <div class="big">${mine ? "🌾" : "🔒"}</div>
            <p>${esc(mine ? t("land.yours") : t("land.ownedBy", { name: land.ownerName || "?" }))}</p>
            <p class="muted">${esc(mine ? t("land.yoursInfo") : t("land.closed"))}</p>
          </div>`;
      }
    }
  });
}
