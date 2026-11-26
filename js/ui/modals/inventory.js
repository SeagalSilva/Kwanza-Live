import { S, inv, selectSeed } from "../../state.js";
import { t, fmtNum } from "../../i18n.js";
import { esc } from "../../utils.js";
import { CROP_IDS } from "../../data/crops.js";
import { ORE_IDS, WOOD_IDS } from "../../data/resources.js";
import { seedId, cropItemId, itemIcon, itemName } from "../../data/items.js";
import { openModal } from "../modal.js";

export function openInventory() {
  openModal({
    title: () => t("inv.title"),
    events: ["save", "lang", "selected"],
    render(body) {
      const row = (id, isSeed) => {
        const n = inv(id);
        if (n < 1) return "";
        const crop = id.split("_")[1];
        const sel = isSeed && S.selectedSeed === crop;
        return `<div class="row">
          <span class="ico-lg">${itemIcon(id)}</span>
          <div class="grow"><b>${esc(itemName(id))}</b></div>
          <span class="qty">×${fmtNum(n)}</span>
          ${isSeed ? `<button class="btn small ${sel ? "gold" : ""}" data-sel="${crop}" type="button">${sel ? "✔" : esc(t("inv.use"))}</button>` : ""}
        </div>`;
      };
      const seeds = CROP_IDS.map((c) => row(seedId(c), true)).join("");
      const crops = CROP_IDS.map((c) => row(cropItemId(c), false)).join("");
      const ores = ORE_IDS.map((id) => row(id, false)).join("");
      const woods = WOOD_IDS.map((id) => row(id, false)).join("");

      body.innerHTML = `
        <h3>${esc(t("inv.seeds"))}</h3>${seeds || `<p class="muted">${esc(t("inv.none"))}</p>`}
        <h3>${esc(t("inv.crops"))}</h3>${crops || `<p class="muted">${esc(t("inv.none"))}</p>`}
        <h3>${esc(t("inv.ores"))}</h3>${ores || `<p class="muted">${esc(t("inv.none"))}</p>`}
        <h3>${esc(t("inv.woods"))}</h3>${woods || `<p class="muted">${esc(t("inv.none"))}</p>`}
        <p class="muted small-note">${esc(t("inv.tip"))}</p>`;
      body.onclick = (e) => {
        const b = e.target.closest("[data-sel]");
        if (b) selectSeed(b.dataset.sel);
      };
    }
  });
}
