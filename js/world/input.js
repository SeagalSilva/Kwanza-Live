// Keyboard, touch d-pad and pointer input.
import { emit } from "../bus.js";
import { CROP_IDS } from "../data/crops.js";
import { isModalOpen, closeModal } from "../ui/modal.js";
import { isAdmin } from "../systems/government.js";
import { triggerAdminInterstitial } from "../systems/ads.js";

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

export function initInput(canvas, { onInteract, onTap, onPointerDown, onPointerMove, onPointerUp }) {
  if (bound) return;
  bound = true;
  let dragging = false;

  window.addEventListener("keydown", (e) => {
    if (!active || typing(e)) return;
    if (e.code === "Escape") { if (isModalOpen()) closeModal(); return; }
    if ((e.code === "KeyP" || e.key?.toLowerCase() === "p") && !e.repeat && isAdmin()) {
      e.preventDefault();
      triggerAdminInterstitial();
      return;
    }
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
    const px = e.clientX - r.left, py = e.clientY - r.top;
    if (onPointerDown && onPointerDown(px, py, e)) {
      dragging = true;
      try { canvas.setPointerCapture?.(e.pointerId); } catch (_) {}
      return;
    }
    onTap(px, py);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragging || !active || !onPointerMove) return;
    const r = canvas.getBoundingClientRect();
    onPointerMove(e.clientX - r.left, e.clientY - r.top, e);
  });

  const stopDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try { canvas.releasePointerCapture?.(e.pointerId); } catch (_) {}
    if (onPointerUp) {
      const r = canvas.getBoundingClientRect();
      onPointerUp(e.clientX - r.left, e.clientY - r.top, e);
    }
  };
  canvas.addEventListener("pointerup", stopDrag);
  canvas.addEventListener("pointercancel", stopDrag);

  document.querySelectorAll("#dpad [data-dir]").forEach((b) => {
    const dir = b.dataset.dir;
    const down = (e) => { e.preventDefault(); if (active && !isModalOpen()) input[dir] = true; };
    const up = (e) => { e.preventDefault(); input[dir] = false; };
    b.addEventListener("pointerdown", down);
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, up));
    b.addEventListener("contextmenu", (e) => e.preventDefault());
  });
}
