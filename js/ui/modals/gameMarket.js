// The Game Market (NPC): buy seed packs (min 5 seeds) with bronze coins, earn free seeds via link (5s stay), sell harvested crops for Pool Points, and allow Admin configuration.
import { bal, inv } from "../../state.js";
import { t, fmtNum } from "../../i18n.js";
import { esc } from "../../utils.js";
import { FREE_SEED_LINK } from "../../config.js";
import { CROPS, CROP_IDS, MIN_SEED_PACK } from "../../data/crops.js";
import { cropItemId } from "../../data/items.js";
import { money } from "../../data/currencies.js";
import {
  buySeeds,
  sellCrops,
  startFreeSeedVisit,
  getFreeSeedStatus,
  syncMarketConfigFromServer,
  updateMarketConfigAdmin
} from "../../systems/economy.js";
import { isAdmin } from "../../systems/government.js";
import { toast } from "../toast.js";
import { openModal } from "../modal.js";

function buildAdminDraft() {
  const out = {};
  for (const id of CROP_IDS) {
    const c = CROPS[id];
    out[id] = {
      packPrice: String(Math.max(1, Math.round(Number(c.packPrice) || 1))),
      packSize: String(Math.max(MIN_SEED_PACK, Math.round(Number(c.packSize) || MIN_SEED_PACK))),
      yield: String(Math.max(1, Math.round(Number(c.yield) || 1))),
      sell: String(Math.max(1, Math.round(Number(c.sell) || 1)))
    };
  }
  return out;
}

export function openGameMarket() {
  let tab = "buy";
  let savingAdmin = false;
  let adminDraft = buildAdminDraft();

  syncMarketConfigFromServer();

  openModal({
    title: () => t("place.gameMarket"),
    events: ["save", "lang", "freeSeedStatus", "marketConfig"],
    shouldRepaint: (evt) => tab !== "admin" || evt === "lang",
    render(body, api) {
      const admin = isAdmin();
      if (!admin && tab === "admin") tab = "buy";

      const status = getFreeSeedStatus();
      let statusHtml = "";
      if (status?.kind === "waiting") {
        statusHtml = `<p style="color: var(--gold); font-size: 12px; margin: 4px 0 0;">⏳ ${esc(t("gm.linkWaiting"))}</p>`;
      } else if (status?.kind === "tooEarly") {
        statusHtml = `<p style="color: var(--bad); font-size: 12px; margin: 4px 0 0;">⚠️ ${esc(t("gm.linkTooEarly", { s: status.sec }))}</p>`;
      } else if (status?.kind === "rewarded") {
        statusHtml = `<p style="color: var(--ok); font-size: 12px; margin: 4px 0 0;">🎉 ${esc(t("gm.linkRewardSuccess", { n: status.n, crop: t(`crop.${status.crop}`) }))}</p>`;
      }

      const freeSeedBox = `
        <div style="background: rgba(245, 197, 24, 0.08); border: 1px solid var(--gold); border-radius: 12px; padding: 12px; margin-bottom: 10px; display: grid; gap: 6px;">
          <strong style="color: var(--gold); font-size: 13px;">🎁 ${esc(t("gm.linkTitle"))}</strong>
          <p class="muted" style="font-size: 12px; padding: 0; line-height: 1.4;">${esc(t("gm.linkRule"))}</p>
          <a id="gm-free-seed-btn" class="btn gold small" href="${esc(FREE_SEED_LINK)}" target="_blank" rel="noopener noreferrer" style="text-decoration: none;">
            🌱 ${esc(t("gm.linkBtn"))}
          </a>
          ${statusHtml}
        </div>`;

      const buy = freeSeedBox + CROP_IDS.map((id) => {
        const c = CROPS[id];
        const packSize = Math.max(MIN_SEED_PACK, Math.floor(Number(c.packSize) || MIN_SEED_PACK));
        const packPrice = Math.max(1, Math.floor(Number(c.packPrice) || 1));
        const can = (packs) => bal("bronze") >= packPrice * packs;
        return `<div class="row">
          <span class="ico-lg">${c.emoji}</span>
          <div class="grow"><b>${esc(t(`crop.${id}`))}</b>
            <small>${esc(t("gm.packInfo", { time: c.grow, yield: c.yield, pack: packSize }))}</small></div>
          <div class="btns">
            <button class="btn small" data-buy="${id}" data-packs="1" type="button" ${can(1) ? "" : "disabled"}>${money(packPrice, "bronze")} · ${esc(t("gm.packBtn", { n: packSize }))}</button>
            <button class="btn small alt" data-buy="${id}" data-packs="2" type="button" ${can(2) ? "" : "disabled"}>×2 (${packSize * 2})</button>
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

      const adminHtml = admin ? `
        <p class="muted" style="padding: 4px 2px 10px; font-size: 12.5px; line-height: 1.45;">
          ${esc(t("gm.adminDesc", { min: MIN_SEED_PACK }))}
        </p>
        <div class="gm-admin-grid">
          ${CROP_IDS.map((id) => {
            const c = CROPS[id];
            const d = adminDraft[id] || {
              packPrice: String(c.packPrice),
              packSize: String(c.packSize),
              yield: String(c.yield),
              sell: String(c.sell)
            };
            return `
              <div class="gm-admin-card" data-crop-card="${id}">
                <div class="gm-admin-head">
                  <span class="ico-lg">${c.emoji}</span>
                  <strong>${esc(t(`crop.${id}`))}</strong>
                  <span class="gm-admin-grow">${c.grow}s</span>
                </div>
                <div class="gm-admin-fields">
                  <label class="gm-admin-field">
                    <span>${esc(t("gm.adminPackPrice"))}</span>
                    <input type="number" min="1" step="1" data-admin-crop="${id}" data-admin-field="packPrice" value="${esc(d.packPrice)}" />
                  </label>
                  <label class="gm-admin-field">
                    <span>${esc(t("gm.adminPackSize", { min: MIN_SEED_PACK }))}</span>
                    <input type="number" min="${MIN_SEED_PACK}" step="1" data-admin-crop="${id}" data-admin-field="packSize" value="${esc(d.packSize)}" />
                  </label>
                  <label class="gm-admin-field">
                    <span>${esc(t("gm.adminYield"))}</span>
                    <input type="number" min="1" step="1" data-admin-crop="${id}" data-admin-field="yield" value="${esc(d.yield)}" />
                  </label>
                  <label class="gm-admin-field">
                    <span>${esc(t("gm.adminSellPp"))}</span>
                    <input type="number" min="1" step="1" data-admin-crop="${id}" data-admin-field="sell" value="${esc(d.sell)}" />
                  </label>
                </div>
              </div>`;
          }).join("")}
        </div>
        <div class="gm-admin-actions">
          <button id="gm-admin-save" class="btn gold" type="button" ${savingAdmin ? "disabled" : ""}>💾 ${esc(t("gm.adminSave"))}</button>
        </div>` : "";

      let contentHtml = "";
      if (tab === "buy") contentHtml = buy;
      else if (tab === "sell") contentHtml = sell || `<p class="muted">${esc(t("gm.nothing"))}</p>`;
      else if (tab === "admin" && admin) contentHtml = adminHtml;

      body.innerHTML = `
        <div class="balance" style="gap: 12px; flex-wrap: wrap;">
          <span>${esc(t("gm.balance"))}</span>
          ${money(bal("bronze"), "bronze")}
          ${money(bal("pp"), "pp")}
        </div>
        <div class="tabs">
          <button class="${tab === "buy" ? "on" : ""}" data-tab="buy" type="button">${esc(t("gm.buy"))}</button>
          <button class="${tab === "sell" ? "on" : ""}" data-tab="sell" type="button">${esc(t("gm.sell"))}</button>
          ${admin ? `<button class="${tab === "admin" ? "on" : ""}" data-tab="admin" type="button">⚙️ ${esc(t("gm.adminTab"))}</button>` : ""}
        </div>
        ${contentHtml}`;

      const linkBtn = body.querySelector("#gm-free-seed-btn");
      if (linkBtn) {
        linkBtn.onclick = () => {
          startFreeSeedVisit();
        };
      }

      if (tab === "admin" && admin) {
        body.querySelectorAll("[data-admin-crop]").forEach((inp) => {
          inp.addEventListener("input", () => {
            const cropId = inp.dataset.adminCrop;
            const field = inp.dataset.adminField;
            if (adminDraft[cropId]) adminDraft[cropId][field] = inp.value;
          });
        });

        const saveBtn = body.querySelector("#gm-admin-save");
        if (saveBtn) {
          saveBtn.onclick = async () => {
            if (savingAdmin) return;
            const payload = {};
            for (const id of CROP_IDS) {
              const d = adminDraft[id] || {};
              const packPrice = Math.floor(Number(d.packPrice));
              const packSize = Math.floor(Number(d.packSize));
              const y = Math.floor(Number(d.yield));
              const sellVal = Math.floor(Number(d.sell));

              if (!Number.isFinite(packSize) || packSize < MIN_SEED_PACK) {
                toast(t("gm.adminMinPackErr", { min: MIN_SEED_PACK }), "bad");
                return;
              }
              if (!Number.isFinite(packPrice) || packPrice < 1 || !Number.isFinite(y) || y < 1 || !Number.isFinite(sellVal) || sellVal < 1) {
                toast(t("msg.badPrice"), "bad");
                return;
              }
              payload[id] = { packPrice, packSize, yield: y, sell: sellVal };
            }

            savingAdmin = true;
            saveBtn.disabled = true;
            try {
              const ok = await updateMarketConfigAdmin(payload);
              if (ok) {
                adminDraft = buildAdminDraft();
                api.repaint();
              }
            } finally {
              savingAdmin = false;
              if (saveBtn.isConnected) saveBtn.disabled = false;
            }
          };
        }
      }

      body.onclick = async (e) => {
        const tabBtn = e.target.closest("[data-tab]");
        if (tabBtn) {
          tab = tabBtn.dataset.tab;
          if (tab === "admin") adminDraft = buildAdminDraft();
          api.repaint();
          return;
        }
        const b = e.target.closest("[data-buy]");
        if (b && !b.disabled) {
          b.disabled = true;
          try { await buySeeds(b.dataset.buy, +b.dataset.packs); } finally { b.disabled = false; }
          return;
        }
        const s = e.target.closest("[data-sell]");
        if (s && !s.disabled) {
          s.disabled = true;
          try { await sellCrops(s.dataset.sell, s.dataset.n === "all" ? Infinity : +s.dataset.n); } finally { s.disabled = false; }
        }
      };
    }
  });
}
