import { S } from "../../state.js";
import { t } from "../../i18n.js";
import { esc } from "../../utils.js";
import {
  isAdmin,
  getGovernmentState,
  voteForCandidate,
  registerCandidate,
  chooseCity,
  issuePresidentDecree,
  adminAddLand,
  adminUpdateMap,
  adminCreateCity,
  adminRenameCity,
  adminDeleteCity
} from "../../systems/government.js";
import { enterMapEditMode } from "../../world/editor.js";
import { openModal } from "../modal.js";
import { toast } from "../toast.js";

export function openGovernment() {
  let cachedState = null;

  openModal({
    title: () => `🏛️ ${t("place.government")}`,
    events: ["save", "lang"],
    async render(body, api) {
      if (!cachedState) {
        body.innerHTML = `<div class="center muted" style="padding: 24px;">${esc(t("loading"))}</div>`;
        cachedState = await getGovernmentState();
      }

      const admin = isAdmin();
      const pres = cachedState.president;
      const isPresident = !!pres && pres.uid === S.uid;
      const candidates = cachedState.candidates || [];
      const cities = cachedState.cities || [{ id: "kwanza_central", name: "Kwanza Central" }];
      const rawCityId = (cachedState.playerCities && cachedState.playerCities[S.uid]) || S.currentCity || cities[0]?.id || "kwanza_central";
      const currentCityObj = cities.find((c) => c.id === rawCityId) || cities[0];
      const currentCityId = currentCityObj?.id || rawCityId;
      const activeCityMap = (cachedState.cityMaps && cachedState.cityMaps[currentCityId]) || cachedState.mapConfig || {};
      const decree = (cachedState.cityDecrees && cachedState.cityDecrees[currentCityId]) || null;

      body.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <div style="background: var(--panel-2); border: 1px solid var(--line); border-radius: 14px; padding: 14px; text-align: center;">
            <div style="font-size: 36px; margin-bottom: 4px;">👑</div>
            <span class="muted" style="font-size: 12px; text-transform: uppercase; letter-spacing: .06em;">${esc(t("gov.presidentTitle"))}</span>
            <h3 style="font-size: 18px; color: var(--gold); margin: 4px 0;">${esc(pres ? pres.name : t("gov.noPresident"))}</h3>
            <p class="muted" style="font-size: 12px; margin: 0;">${esc(t("gov.presidentDesc"))}</p>
          </div>

          <div style="background: var(--panel-2); border: 1px solid var(--line); border-radius: 14px; padding: 14px; display: grid; gap: 8px;">
            <h3 style="margin: 0; font-size: 14px;">🏙️ ${esc(t("gov.cityTitle"))}</h3>
            <p class="muted" style="font-size: 12px; margin: 0;">${esc(t("gov.currentCity"))}: <b style="color: var(--txt);">${esc(currentCityObj?.name || currentCityId)}</b></p>
            <div style="display: flex; gap: 8px;">
              <select id="gov-city-select" style="flex: 1;">
                ${cities.map((c) => `<option value="${esc(c.id)}" ${c.id === currentCityId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
              </select>
              <button id="gov-city-btn" class="btn alt small" type="button">${esc(t("gov.btnMoveCity"))}</button>
            </div>
            ${decree ? `
              <div style="background: rgba(245, 197, 24, 0.08); border: 1px solid rgba(245, 197, 24, 0.35); border-radius: 10px; padding: 10px; margin-top: 4px;">
                <div style="font-size: 12px; color: var(--gold); font-weight: 700;">📜 ${esc(decree.title)}</div>
                <div style="font-size: 12px; margin-top: 3px;">${esc(decree.message)}</div>
                <div class="muted" style="font-size: 11px; margin-top: 4px;">— ${esc(decree.byName || "?")}</div>
              </div>
            ` : `<p class="muted" style="font-size: 12px; margin: 0;">${esc(t("gov.noDecree"))}</p>`}
          </div>

          ${isPresident ? `
            <div style="background: rgba(89, 209, 122, 0.08); border: 1px solid var(--good); border-radius: 14px; padding: 14px; display: grid; gap: 8px;">
              <h3 style="margin: 0; font-size: 14px; color: var(--good);">📜 ${esc(t("gov.presidentActions"))}</h3>
              <input id="pres-decree-title" type="text" maxlength="60" placeholder="${esc(t("gov.decreeTitlePh"))}" />
              <textarea id="pres-decree-msg" rows="2" maxlength="200" placeholder="${esc(t("gov.decreeMsgPh"))}"></textarea>
              <button id="pres-decree-btn" class="btn small" type="button">${esc(t("gov.btnPublishDecree"))}</button>
            </div>
          ` : ""}

          <div style="background: var(--panel-2); border: 1px solid var(--line); border-radius: 14px; padding: 14px; display: grid; gap: 10px;">
            <h3 style="margin: 0; font-size: 14px;">🗳️ ${esc(t("gov.electionsTitle"))}</h3>
            ${candidates.length === 0 ? `<p class="muted" style="font-size: 13px;">${esc(t("gov.noCandidates"))}</p>` :
              candidates.map((c) => `
                <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 10px;">
                  <div>
                    <b>${esc(c.name)}</b>
                    <span class="muted" style="font-size: 12px; margin-left: 8px;">(${c.votes || 0} ${esc(t("gov.votes"))})</span>
                  </div>
                  <button class="btn gold small" data-vote="${c.uid}" type="button">${esc(t("gov.btnVote"))}</button>
                </div>
              `).join("")}
            <button id="gov-run-btn" class="btn alt small" type="button" style="margin-top: 4px;">
              ${esc(t("gov.btnRun"))}
            </button>
          </div>

          ${admin ? `
            <div style="background: rgba(245, 197, 24, 0.08); border: 1px solid var(--gold); border-radius: 14px; padding: 14px; display: grid; gap: 10px;">
              <h3 style="color: var(--gold); margin: 0; font-size: 14px;">🛡️ ${esc(t("gov.adminPanel"))}</h3>
              <p class="muted" style="font-size: 12px; margin: 0;">${esc(t("gov.adminDesc"))}</p>
              <div style="font-size: 12px; color: var(--gold); font-weight: 700;">🏙️ ${esc(t("gov.editingCityLabel", { city: currentCityObj?.name || currentCityId }))}</div>

              <div style="display: grid; gap: 6px; border-top: 1px solid rgba(255,255,255,.1); padding-top: 8px;">
                <label style="font-size: 12px; margin: 0;">${esc(t("gov.mapSizeLabel"))}</label>
                <div style="display: flex; gap: 8px;">
                  <input id="admin-map-w" type="number" min="20" max="200" placeholder="Width" value="${activeCityMap.width || 48}" style="width: 50%;" />
                  <input id="admin-map-h" type="number" min="20" max="200" placeholder="Height" value="${activeCityMap.height || 40}" style="width: 50%;" />
                </div>
                <button id="admin-update-size" class="btn alt small" type="button">${esc(t("gov.btnUpdateSize"))}</button>
              </div>

              <div style="display: grid; gap: 6px; border-top: 1px solid rgba(255,255,255,.1); padding-top: 8px;">
                <label style="font-size: 12px; margin: 0;">${esc(t("gov.dragEditLabel"))}</label>
                <p class="muted" style="font-size: 11px; margin: 0;">${esc(t("gov.dragEditDesc"))}</p>
                <button id="admin-edit-map-mode" class="btn gold small" type="button">✋ ${esc(t("gov.btnEnterEditMode"))}</button>
              </div>

              <div style="display: grid; gap: 8px; border-top: 1px solid rgba(255,255,255,.1); padding-top: 8px;">
                <label style="font-size: 12px; margin: 0;">${esc(t("gov.addLandLabel"))}</label>
                <input id="admin-land-id" type="text" placeholder="${esc(t("gov.landIdPlaceholder"))}" />
                <div style="display: flex; gap: 8px;">
                  <input id="admin-land-x" type="number" placeholder="X" value="20" style="width: 50%;" />
                  <input id="admin-land-y" type="number" placeholder="Y" value="20" style="width: 50%;" />
                </div>
                <button id="admin-add-land" class="btn gold" type="button">${esc(t("gov.btnAddLand"))}</button>
              </div>

              <div style="display: grid; gap: 8px; border-top: 1px solid rgba(255,255,255,.1); padding-top: 8px;">
                <label style="font-size: 12px; margin: 0;">🏙️ ${esc(t("gov.adminCitiesLabel"))}</label>
                <div style="display: flex; gap: 6px;">
                  <input id="admin-new-city-name" type="text" maxlength="32" placeholder="${esc(t("gov.cityNamePh"))}" style="flex: 1;" />
                  <button id="admin-create-city" class="btn gold small" type="button">${esc(t("gov.btnCreateCity"))}</button>
                </div>
                ${cities.map((c) => `
                  <div style="display: flex; gap: 6px; align-items: center;">
                    <input type="text" maxlength="32" value="${esc(c.name)}" data-city-name="${esc(c.id)}" style="flex: 1; padding: 7px 10px; font-size: 13px;" />
                    <button class="btn alt small" data-rename-city="${esc(c.id)}" type="button">${esc(t("gov.btnRenameCity"))}</button>
                    <button class="btn small" data-delete-city="${esc(c.id)}" type="button" ${cities.length <= 1 ? "disabled" : ""}>🗑️</button>
                  </div>
                `).join("")}
              </div>
            </div>
          ` : ""}
        </div>
      `;

      body.onclick = async (e) => {
        const voteBtn = e.target.closest("[data-vote]");
        if (voteBtn) {
          const res = await voteForCandidate(voteBtn.dataset.vote);
          if (res) {
            cachedState = await getGovernmentState();
            api.repaint();
          }
          return;
        }

        if (e.target.id === "gov-run-btn") {
          const res = await registerCandidate();
          if (res) {
            cachedState = await getGovernmentState();
            api.repaint();
          }
          return;
        }

        if (e.target.id === "gov-city-btn") {
          const cityId = body.querySelector("#gov-city-select").value;
          const res = await chooseCity(cityId);
          if (res) {
            cachedState = await getGovernmentState();
            api.repaint();
          }
          return;
        }

        if (e.target.id === "pres-decree-btn") {
          const title = body.querySelector("#pres-decree-title").value.trim();
          const msg = body.querySelector("#pres-decree-msg").value.trim();
          if (!title || !msg) { toast(t("msg.error"), "bad"); return; }
          const res = await issuePresidentDecree(currentCityId, title, msg);
          if (res) {
            cachedState = await getGovernmentState();
            api.repaint();
          }
          return;
        }

        if (e.target.id === "admin-update-size") {
          const width = parseInt(body.querySelector("#admin-map-w").value, 10);
          const height = parseInt(body.querySelector("#admin-map-h").value, 10);
          if (isNaN(width) || isNaN(height) || width < 20 || height < 20 || width > 200 || height > 200) {
            toast(t("msg.badPrice"), "bad");
            return;
          }
          const res = await adminUpdateMap({ cityId: currentCityId, width, height });
          if (res) {
            cachedState = await getGovernmentState();
            api.repaint();
          }
          return;
        }

        if (e.target.id === "admin-edit-map-mode") {
          api.close();
          enterMapEditMode();
          return;
        }

        if (e.target.id === "admin-add-land") {
          const id = body.querySelector("#admin-land-id").value.trim();
          const x0 = parseInt(body.querySelector("#admin-land-x").value, 10);
          const y0 = parseInt(body.querySelector("#admin-land-y").value, 10);
          if (!id || isNaN(x0) || isNaN(y0)) {
            toast(t("msg.badPrice"), "bad");
            return;
          }
          const res = await adminAddLand({ id, x0, y0, priceGold: 10 }, currentCityId);
          if (res) {
            cachedState = await getGovernmentState();
            api.repaint();
          }
          return;
        }

        if (e.target.id === "admin-create-city") {
          const name = body.querySelector("#admin-new-city-name").value.trim();
          if (!name) { toast(t("msg.error"), "bad"); return; }
          const res = await adminCreateCity(name);
          if (res) {
            cachedState = await getGovernmentState();
            api.repaint();
          }
          return;
        }

        const renameBtn = e.target.closest("[data-rename-city]");
        if (renameBtn) {
          const cid = renameBtn.dataset.renameCity;
          const inp = body.querySelector(`[data-city-name="${cid}"]`);
          const name = inp ? inp.value.trim() : "";
          if (!name) { toast(t("msg.error"), "bad"); return; }
          const res = await adminRenameCity(cid, name);
          if (res) {
            cachedState = await getGovernmentState();
            api.repaint();
          }
          return;
        }

        const delBtn = e.target.closest("[data-delete-city]");
        if (delBtn && !delBtn.disabled) {
          const res = await adminDeleteCity(delBtn.dataset.deleteCity);
          if (res) {
            cachedState = await getGovernmentState();
            api.repaint();
          }
        }
      };
    }
  });
}
