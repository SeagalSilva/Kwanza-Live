// First-time flow: 1) choose a unique username  2) create the character.
import { S } from "../state.js";
import { on } from "../bus.js";
import { t } from "../i18n.js";
import { $, debounce } from "../utils.js";
import { showScreen } from "./screens.js";
import { USERNAME_RE, usernameFree, createProfile } from "../systems/profile.js";
import { SKINS, HAIRS, SHIRTS, HAIR_STYLES, DEFAULT_LOOK } from "../data/character.js";
import { drawCharacter } from "../world/character.js";

let bound = false;
let look = { ...DEFAULT_LOOK };
let username = "";
let nameOk = false;
let previewRaf = 0;
let previewDir = "down";
let onDone = null;
let currentUser = null;

function setStatus(key, kind) {
  const el = $("#ob-status");
  el.textContent = key ? t(key) : "";
  el.className = `status ${kind || ""}`;
}

const check = debounce(async () => {
  const v = $("#ob-username").value.trim();
  nameOk = false;
  $("#ob-next").disabled = true;
  if (!v) { setStatus("", ""); return; }
  if (!USERNAME_RE.test(v)) { setStatus("ob.username.invalid", "bad"); return; }
  setStatus("ob.username.checking", "");
  try {
    const free = await usernameFree(v);
    if ($("#ob-username").value.trim() !== v) return; // changed meanwhile
    nameOk = free; username = v;
    setStatus(free ? "ob.username.ok" : "ob.username.taken", free ? "ok" : "bad");
    $("#ob-next").disabled = !free;
  } catch (e) {
    console.warn(e);
    setStatus("ob.username.error", "bad");
  }
}, 350);

function swatches(containerId, colors, key) {
  const box = $(containerId);
  box.innerHTML = "";
  colors.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "swatch"; b.style.background = c;
    b.setAttribute("aria-label", `${key} ${i + 1}`);
    b.onclick = () => { look[key] = i; paintOptions(); };
    box.appendChild(b);
  });
}

function paintStyles() {
  const box = $("#ob-styles");
  box.innerHTML = "";
  HAIR_STYLES.forEach((name, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip-btn"; b.textContent = t(`hs.${name}`);
    b.onclick = () => { look.hairStyle = i; paintOptions(); };
    box.appendChild(b);
  });
}

function paintOptions() {
  const mark = (id, idx) => [...$(id).children].forEach((el, i) => el.classList.toggle("on", i === idx));
  mark("#ob-skin", look.skin);
  mark("#ob-hair", look.hairColor);
  mark("#ob-shirt", look.shirt);
  mark("#ob-styles", look.hairStyle);
}

function previewLoop(ts) {
  const c = $("#ob-preview");
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "rgba(255,255,255,.06)";
  ctx.beginPath(); ctx.ellipse(c.width / 2, c.height - 34, 80, 18, 0, 0, Math.PI * 2); ctx.fill();
  drawCharacter(ctx, c.width / 2, c.height - 40, look, { dir: previewDir, phase: ts / 260, moving: true, scale: 5 });
  previewRaf = requestAnimationFrame(previewLoop);
}

function goStep(n) {
  $("#ob-step1").hidden = n !== 1;
  $("#ob-step2").hidden = n !== 2;
  cancelAnimationFrame(previewRaf);
  if (n === 2) previewRaf = requestAnimationFrame(previewLoop);
}

async function submit() {
  const btn = $("#ob-create");
  btn.disabled = true;
  $("#ob-error").textContent = "";
  try {
    S.profile = await createProfile(currentUser.uid, { username, look: { ...look } });
    cancelAnimationFrame(previewRaf);
    onDone();
  } catch (e) {
    console.warn(e);
    const denied = String(e?.code || e?.message || "").toLowerCase().includes("permission");
    if (denied) { goStep(1); setStatus("ob.username.taken", "bad"); $("#ob-next").disabled = true; }
    else $("#ob-error").textContent = t("msg.error");
  } finally {
    btn.disabled = false;
  }
}

export function startOnboarding(user, done) {
  currentUser = user; onDone = done;
  look = { ...DEFAULT_LOOK };
  showScreen("onboard");
  goStep(1);

  const suggestion = (user.displayName || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 16);
  $("#ob-username").value = suggestion;
  $("#ob-next").disabled = true;
  setStatus("", "");
  if (suggestion) check();

  if (bound) { paintOptions(); return; }
  bound = true;

  swatches("#ob-skin", SKINS, "skin");
  swatches("#ob-hair", HAIRS, "hairColor");
  swatches("#ob-shirt", SHIRTS, "shirt");
  paintStyles();
  paintOptions();
  on("lang", () => { paintStyles(); paintOptions(); });

  $("#ob-username").addEventListener("input", check);
  $("#ob-username").addEventListener("keydown", (e) => { if (e.key === "Enter" && nameOk) goStep(2); });
  $("#ob-next").onclick = () => { if (nameOk) goStep(2); };
  $("#ob-back").onclick = () => goStep(1);
  $("#ob-create").onclick = submit;
  $("#ob-preview").onclick = () => {
    const order = ["down", "left", "up", "right"];
    previewDir = order[(order.indexOf(previewDir) + 1) % 4];
  };
}
