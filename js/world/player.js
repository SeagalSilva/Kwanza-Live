// The local player: position, movement and collision.
import { SPEED } from "../config.js";
import { S } from "../state.js";
import { SPAWN, isBlockedStatic, gateIndex } from "./map.js";
import { isCasinoBlocked } from "./casinoRoom.js";

export const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export const me = {
  x: SPAWN.x, y: SPAWN.y, dir: "down", moving: false, phase: 0,
  target: null,   // { x, y } click-to-move destination
  pending: null   // action to run when the player arrives
};

export function resetMe() {
  S.room = "world";
  me.x = SPAWN.x; me.y = SPAWN.y; me.dir = "down"; me.moving = false;
  me.target = null; me.pending = null;
}

/** Gates of lands owned by someone else are closed for me. */
function gateClosed(tx, ty) {
  const id = gateIndex.get(`${tx}_${ty}`);
  if (!id) return false;
  const land = S.lands[id];
  return !!land && land.owner !== S.uid;
}

export const blocked = (tx, ty) =>
  S.room === "casino" ? isCasinoBlocked(tx, ty) : (isBlockedStatic(tx, ty) || gateClosed(tx, ty));

function hits(px, py) {
  const r = 0.26, h = 0.18;
  return blocked(Math.floor(px - r), Math.floor(py - h)) || blocked(Math.floor(px + r), Math.floor(py - h)) ||
         blocked(Math.floor(px - r), Math.floor(py + h)) || blocked(Math.floor(px + r), Math.floor(py + h));
}

let stuck = 0;

export function updateMe(dt, input) {
  let vx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let vy = (input.down ? 1 : 0) - (input.up ? 1 : 0);

  if (vx || vy) {
    me.target = null; me.pending = null; stuck = 0;
  } else if (me.target) {
    const dx = me.target.x - me.x, dy = me.target.y - me.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.12) me.target = null;
    else { vx = dx / d; vy = dy / d; }
  }

  let moved = 0;
  if (vx || vy) {
    const len = Math.hypot(vx, vy);
    vx /= len; vy /= len;
    const step = SPEED * dt;
    const ox = me.x, oy = me.y;
    if (!hits(me.x + vx * step, me.y)) me.x += vx * step;
    if (!hits(me.x, me.y + vy * step)) me.y += vy * step;
    moved = Math.hypot(me.x - ox, me.y - oy);
    if (Math.abs(vx) > Math.abs(vy)) me.dir = vx > 0 ? "right" : "left";
    else me.dir = vy > 0 ? "down" : "up";

    if (me.target && moved < step * 0.2) {
      stuck += dt;
      if (stuck > 0.4) { me.target = null; me.pending = null; stuck = 0; }
    } else stuck = 0;
  }
  me.moving = moved > 0.0005;
  if (me.moving) me.phase += dt * 11;
}
