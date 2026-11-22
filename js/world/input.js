// Keyboard, touch d-pad and pointer input.
import { emit } from "../bus.js";
import { CROP_IDS } from "../data/crops.js";
import { isModalOpen, closeModal } from "../ui/modal.js";

export const input = { up: false, down: false, left: false, right: false };

const KEYS = {
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right"
};

let active = false;
let bound = false;

export const setInputActive = (v) => { active = v; if (!v) clearInput(); };
export function clearInput() { input.up = input.down = input.left = input.right = false; }

const typing = (e) => /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || "");

export function initInput(canvas, { onInteract, onTap }) {
  if (bound) return;
  bound = true;

  window.addEventListener("keydown", (e) => {
    if (!active || typing(e)) return;
    if (e.code === "Escape") { if (isModalOpen()) closeModal(); return; }
    if (isModalOpen()) return;
    if (KEYS[e.code]) { input[KEYS[e.code]] = true; e.preventDefault(); return; }
    if (e.code === "KeyE" || e.code === "Space" || e.code === "Enter") { e.preventDefault(); if (!e.repeat) onInteract(); return; }
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m && +m[1] <= CROP_IDS.length) emit("selectSlot", +m[1] - 1);
  });

  window.addEventListener("keyup", (e) => { if (KEYS[e.code]) input[KEYS[e.code]] = false; });
  window.addEventListener("blur", clearInput);

  canvas.addEventListener("pointerdown", (e) => {
    if (!active || isModalOpen()) return;
    const r = canvas.getBoundingClientRect();
    onTap(e.clientX - r.left, e.clientY - r.top);
  });

  document.querySelectorAll("#dpad [data-dir]").forEach((b) => {
    const dir = b.dataset.dir;
    const down = (e) => { e.preventDefault(); if (active && !isModalOpen()) input[dir] = true; };
    const up = (e) => { e.preventDefault(); input[dir] = false; };
    b.addEventListener("pointerdown", down);
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, up));
    b.addEventListener("contextmenu", (e) => e.preventDefault());
  });
}
