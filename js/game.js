// Game loop: input → update → render, plus HUD and multiplayer ticks.
import { S } from "./state.js";
import { on } from "./bus.js";
import { $ } from "./utils.js";
import { resize, render, screenToWorld } from "./world/renderer.js";
import { me, resetMe, updateMe } from "./world/player.js";
import { input, initInput, setInputActive } from "./world/input.js";
import { computeFocus, focusLabel, perform, handleTap, tickPending } from "./world/interactions.js";
import { startPresence, stopPresence, publishPosition, isFresh } from "./systems/presence.js";
import { drawPortrait, setInteractLabel, resetInteractLabel } from "./ui/hud.js";
import { closeModal } from "./ui/modal.js";

let running = false;
let raf = 0;
let last = 0;
let focus = null;
let lastPublish = 0;
let lastPortrait = 0;
let listening = false;
let canvas, ctx;

const onResize = () => canvas && resize(canvas);

export function startGame() {
  canvas = $("#world");
  ctx = canvas.getContext("2d");
  resize(canvas);
  window.addEventListener("resize", onResize);

  resetMe();
  resetInteractLabel();

  initInput(canvas, {
    onInteract: () => perform(focus),
    onTap: (px, py) => { const w = screenToWorld(px, py); handleTap(w.x, w.y); }
  });
  if (!listening) {
    listening = true;
    on("interact", () => perform(focus));
    on("modal", (open) => { if (open) { input.up = input.down = input.left = input.right = false; me.target = null; } });
    on("lang", () => resetInteractLabel());
    on("selected", () => resetInteractLabel());
  }

  setInputActive(true);
  startPresence(me);
  running = true;
  last = performance.now();
  raf = requestAnimationFrame(loop);
}

export function stopGame() {
  running = false;
  cancelAnimationFrame(raf);
  setInputActive(false);
  closeModal();
  stopPresence();
  window.removeEventListener("resize", onResize);
}

function loop(ts) {
  if (!running) return;
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (ts - last) / 1000 || 0);
  last = ts;
  const time = ts / 1000;

  updateMe(dt, input);
  tickPending();

  focus = computeFocus();
  setInteractLabel(focusLabel(focus));

  // smooth other players
  const others = [];
  for (const [id, p] of Object.entries(S.players)) {
    if (!isFresh(p)) continue;
    const k = Math.min(1, dt * 10);
    const px = p.dx, py = p.dy;
    p.dx += (p.x - p.dx) * k; p.dy += (p.y - p.dy) * k;
    if (Math.hypot(p.dx - px, p.dy - py) > 0.002) p.phase += dt * 11;
    p.m = Math.hypot(p.x - p.dx, p.y - p.dy) > 0.05 ? 1 : 0;
    others.push({ id, p });
  }

  if (ts - lastPublish > 130) { lastPublish = ts; publishPosition(me); }
  if (ts - lastPortrait > 120) { lastPortrait = ts; drawPortrait(time); }

  render(ctx, { me, others, focus, time });
}
