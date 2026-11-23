// Always-on heads-up display: character portrait, wallet, seed hotbar, UTC clock, sound toggle, coin FX, buttons.
import { S, now, inv, bal, selectSeed } from "../state.js";
import { on, emit } from "../bus.js";
import { t, fmtNum } from "../i18n.js";
import { $, esc, isTouch } from "../utils.js";
import { CROPS, CROP_IDS } from "../data/crops.js";
import { ALL_CURRENCIES, curIcon } from "../data/currencies.js";
import { seedId } from "../data/items.js";
import { sanitizeLook } from "../data/character.js";
import { drawCharacter } from "../world/character.js";
import { initAudio, isMuted, toggleMute, playCoin, playPoolPoints } from "../systems/audio.js";
import { openInventory } from "./modals/inventory.js";
import { openWallet } from "./modals/wallet.js";
import { initChatUI } from "./chat.js";

let lastLabel = null;
let utcTimer = null;

function formatUtcClock() {
  const d = new Date(now());
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `🕒 ${hh}:${mm}:${ss} UTC`;
}

function updateUtcClock() {
  const el = $("#hud-utc");
  if (el) {
    el.textContent = formatUtcClock();
    el.title = t("hud.utcNote");
  }
}

function updateSoundButton() {
  const btn = $("#btn-sound");
  if (!btn) return;
  btn.textContent = isMuted() ? "🔇" : "🔊";
}

function pulseWalletCard() {
  const card = $(".hud-me");
  if (!card) return;
  card.classList.remove("wallet-pop");
  void card.offsetWidth;
  card.classList.add("wallet-pop");
}

function animateCoinsReceived({ bronze = 0, silver = 0, gold = 0 }, { suppressCenterBadge = false } = {}) {
  const layer = $("#coin-fx-layer");
  const wallet = $("#hud-wallet");
  if (!layer || !wallet) return;

  pulseWalletCard();

  const wr = wallet.getBoundingClientRect();
  const destX = wr.left + Math.min(wr.width * 0.5, 80);
  const destY = wr.top + wr.height * 0.5;
  const startX = suppressCenterBadge ? destX - 40 : window.innerWidth * 0.5;
  const startY = suppressCenterBadge ? wr.bottom + 54 : window.innerHeight * 0.56;

  // Build list of flying coins proportional to types gained
  const queue = [];
  const pushCoins = (type, amount, maxN) => {
    if (amount <= 0) return;
    const count = Math.min(maxN, Math.max(2, Math.ceil(Math.log10(amount + 1) * 3)));
    for (let i = 0; i < count; i++) queue.push(type);
  };
  pushCoins("gold", gold, 6);
  pushCoins("silver", silver, 6);
  pushCoins("bronze", bronze, suppressCenterBadge ? 5 : 8);

  queue.slice(0, 14).forEach((type, idx) => {
    const coin = document.createElement("div");
    coin.className = `fx-coin ${type}`;
    const sx = startX + (Math.random() - 0.5) * (suppressCenterBadge ? 34 : 90);
    const sy = startY + (Math.random() - 0.5) * (suppressCenterBadge ? 18 : 40);
    coin.style.left = `${sx}px`;
    coin.style.top = `${sy}px`;
    coin.style.setProperty("--bx", `${(Math.random() - 0.5) * 40}px`);
    coin.style.setProperty("--by", `${-16 - Math.random() * 20}px`);
    coin.style.setProperty("--tx", `${destX - sx}px`);
    coin.style.setProperty("--ty", `${destY - sy}px`);
    coin.style.setProperty("--delay", `${idx * 45}ms`);
    coin.style.setProperty("--dur", `${650 + Math.random() * 160}ms`);
    layer.appendChild(coin);
    setTimeout(() => coin.remove(), 1100);
  });

  if (suppressCenterBadge) return;

  // Floating "+N" summary badge (for non-casino rewards like Workstation / Market)
  const parts = [];
  if (gold > 0) parts.push(`+${fmtNum(gold)} 🥇`);
  if (silver > 0) parts.push(`+${fmtNum(silver)} 🥈`);
  if (bronze > 0) parts.push(`+${fmtNum(bronze)} 🥉`);
  if (parts.length) {
    const badge = document.createElement("div");
    badge.className = "fx-gain-badge";
    badge.textContent = parts.join(" · ");
    badge.style.left = `${startX}px`;
    badge.style.top = `${startY - 24}px`;
    layer.appendChild(badge);
    setTimeout(() => badge.remove(), 1300);
  }
}

function animatePpReceived({ pp = 0 }) {
  if (pp <= 0) return;
  const layer = $("#coin-fx-layer");
  const wallet = $("#hud-wallet");
  if (!layer || !wallet) return;

  pulseWalletCard();
  const wr = wallet.getBoundingClientRect();
  const badge = document.createElement("div");
  badge.className = "fx-gain-badge pp";
  badge.textContent = `+${fmtNum(pp)} 🌾`;
  badge.style.left = `${wr.left + Math.max(60, wr.width * 0.5)}px`;
  badge.style.top = `${wr.bottom + 26}px`;
  layer.appendChild(badge);
  setTimeout(() => badge.remove(), 1300);
}

export function initHud() {
  initAudio();
  $("#btn-inv").onclick = openInventory;
  $("#btn-wallet").onclick = openWallet;
  $("#btn-interact").onclick = () => emit("interact");

  const soundBtn = $("#btn-sound");
  if (soundBtn) {
    updateSoundButton();
    soundBtn.onclick = () => {
      toggleMute();
      updateSoundButton();
    };
  }

  initChatUI();
  document.body.classList.toggle("is-touch", isTouch);
  if ($("#dpad")) $("#dpad").hidden = true;
  $("#hud-hint").hidden = isTouch;

  const bar = $("#hotbar");
  bar.innerHTML =
    CROP_IDS.map((id, i) =>
      `<button class="slot" data-crop="${id}" type="button">
         <span class="key">${i + 1}</span><span class="ico">${CROPS[id].emoji}</span><b class="n"></b>
       </button>`).join("") +
    `<div id="hotbar-empty" class="hotbar-empty" hidden>${esc(t("hud.hotbarEmpty"))}</div>`;

  bar.onclick = (e) => {
    const b = e.target.closest(".slot");
    if (b) selectSeed(b.dataset.crop);
  };

  updateUtcClock();
  if (!utcTimer) utcTimer = setInterval(updateUtcClock, 1000);

  on("coinsReceived", (coins) => {
    const fromCasino = (S._casinoHudSuppressUntil || 0) > Date.now();
    if (!fromCasino) playCoin();
    animateCoinsReceived(coins, { suppressCenterBadge: fromCasino });
  });
  on("ppReceived", (data) => {
    playPoolPoints();
    animatePpReceived(data);
  });

  on("save", refreshHud);
  on("lang", () => { refreshHud(); updateUtcClock(); });
  on("selected", refreshHud);
  on("selectSlot", (i) => selectSeed(CROP_IDS[i]));
  refreshHud();
}

export function refreshHud() {
  if (!S.profile) return;
  $("#hud-name").textContent = S.profile.username;
  $("#hud-wallet").innerHTML = ALL_CURRENCIES.map((c) =>
    `<span class="chip" title="${esc(t(`cur.${c}`))}">${curIcon(c)}<b>${fmtNum(bal(c))}</b></span>`).join("");

  let availableCount = 0;
  document.querySelectorAll("#hotbar .slot").forEach((el) => {
    const id = el.dataset.crop;
    const n = inv(seedId(id));
    if (n > 0) availableCount++;
    el.querySelector(".n").textContent = n > 0 ? fmtNum(n) : "";
    el.classList.toggle("on", S.selectedSeed === id);
    el.classList.toggle("empty", n < 1);
    el.style.display = n < 1 ? "none" : "";
    el.title = t("hud.seedSlot", { crop: t(`crop.${id}`) });
  });

  const emptyEl = $("#hotbar-empty");
  if (emptyEl) {
    emptyEl.textContent = t("hud.hotbarEmpty");
    emptyEl.hidden = availableCount > 0;
  }
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
