// Generic modal window. Only one is open at a time.
// render(body, api) is called on open and again whenever one of `events` fires.
import { on, emit } from "../bus.js";
import { esc } from "../utils.js";

let current = null;

export const isModalOpen = () => !!current;

export function closeModal(force = false) {
  if (!current) return;
  if (!current.closable && !force) return;
  const prev = current;
  current = null;
  prev.offs.forEach((off) => off());
  prev.root.remove();
  if (typeof prev.onClose === "function") {
    try { prev.onClose(); } catch (_) {}
  }
  emit("modal", false);
}

/**
 * openModal({ title: () => string, render(body, api), events: ['save','lang'], shouldRepaint(evt), onClose, closable })
 */
export function openModal({ title, render, events = ["lang"], shouldRepaint = () => true, onClose = null, closable = true }) {
  closeModal(true);
  const root = document.createElement("div");
  root.className = `modal-backdrop${closable ? "" : " unclosable"}`;
  root.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <header><h2></h2><button class="x" type="button" aria-label="Close"${closable ? "" : ' style="display:none;"'}>✕</button></header>
      <div class="modal-body"></div>
    </div>`;
  document.getElementById("modal-root").appendChild(root);

  const h2 = root.querySelector("h2");
  const body = root.querySelector(".modal-body");
  const api = { close: () => closeModal(true), repaint: () => paint() };

  function paint() {
    h2.innerHTML = esc(title());
    const scroll = body.scrollTop;
    body.onclick = null;
    body.replaceChildren();
    render(body, api);
    body.scrollTop = scroll;
  }

  root.addEventListener("pointerdown", (e) => { if (closable && e.target === root) closeModal(); });
  if (closable) {
    root.querySelector(".x").onclick = () => closeModal();
  }

  const offs = events.map((evt) => on(evt, () => { if (shouldRepaint(evt)) paint(); }));
  current = { root, offs, onClose, closable };
  paint();
  emit("modal", true);
  return api;
}
