// Always-on heads-up display: character portrait, wallet, seed hotbar, buttons.
import { S, inv, bal, selectSeed } from "../state.js";
import { on, emit } from "../bus.js";
import { t, fmtNum } from "../i18n.js";
import { $, esc, isTouch } from "../utils.js";
import { CROPS, CROP_IDS } from "../data/crops.js";
import { ALL_CURRENCIES, curIcon } from "../data/currencies.js";
import { seedId } from "../data/items.js";
import { sanitizeLook } from "../data/character.js";
import { drawCharacter } from "../world/character.js";
import { openInventory } from "./modals/inventory.js";
import { openWallet } from "./modals/wallet.js";

let lastLabel = null;

export function initHud() {
  $("#btn-inv").onclick = openInventory;
  $("#btn-wallet").onclick = openWallet;
  $("#btn-interact").onclick = () => emit("interact");
  $("#dpad").hidden = !isTouch;
  $("#hud-hint").hidden = isTouch;

  const bar = $("#hotbar");
  bar.innerHTML = CROP_IDS.map((id, i) =>
    `<button class="slot" data-crop="${id}" type="button">
       <span class="key">${i + 1}</span><span class="ico">${CROPS[id].emoji}</span><b class="n"></b>
     </button>`).join("");
  bar.onclick = (e) => {
    const b = e.target.closest(".slot");
    if (b) selectSeed(b.dataset.crop);
  };

  on("save", refreshHud);
  on("lang", refreshHud);
  on("selected", refreshHud);
  on("selectSlot", (i) => selectSeed(CROP_IDS[i]));
  refreshHud();
}

export function refreshHud() {
  if (!S.profile) return;
  $("#hud-name").textContent = S.profile.username;
  $("#hud-wallet").innerHTML = ALL_CURRENCIES.map((c) =>
    `<span class="chip" title="${esc(t(`cur.${c}`))}">${curIcon(c)}<b>${fmtNum(bal(c))}</b></span>`).join("");

  document.querySelectorAll("#hotbar .slot").forEach((el) => {
    const id = el.dataset.crop;
    const n = inv(seedId(id));
    el.querySelector(".n").textContent = n > 0 ? fmtNum(n) : "";
    el.classList.toggle("on", S.selectedSeed === id);
    el.classList.toggle("empty", n < 1);
    el.title = t("hud.seedSlot", { crop: t(`crop.${id}`) });
  });
}

/** Contextual action label on the interact button (null hides it). */
export function setInteractLabel(text) {
  if (text === lastLabel) return;
  lastLabel = text;
  const b = $("#btn-interact");
  b.hidden = !text;
  b.textContent = text || "";
}
export const resetInteractLabel = () => { lastLabel = undefined; };

/** Draw the character portrait in the HUD (called a few times per second). */
export function drawPortrait(time) {
  if (!S.profile) return;
  const c = $("#hud-portrait");
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  drawCharacter(ctx, c.width / 2, c.height - 8, sanitizeLook(S.profile.look), { dir: "down", phase: time * 2, scale: 2.4 });
}
