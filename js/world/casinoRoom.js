// Walkable interior room for the Casa de Apostas (Betting House).
// Contains 4 NPCs with overhead speech bubbles, 12+4 Roulette table, 10 grouped Slot Machines (4 + 4 + 2), and Exit Door.
import { TILE } from "../config.js";
import { S } from "../state.js";
import { t } from "../i18n.js";
import { SLOT_MACHINES, occupySlotMachine, startCasinoSync, stopCasinoSync } from "../systems/casino.js";
import { playEnterBuilding } from "../systems/audio.js";
import { openCasinoRoulette } from "../ui/modals/casinoRoulette.js";
import { openCasinoSlot } from "../ui/modals/casinoSlot.js";
import { toast } from "../ui/toast.js";
import { drawCharacter } from "./character.js";
import { drawSpeechBubble } from "./renderer.js";

export const CASINO_W = 24;
export const CASINO_H = 16;
export const CASINO_SPAWN = { x: 12, y: 13.3 };
export const CASINO_EXIT = { x: 12, y: 14.7 };

const ROULETTE_TABLE = { x: 3, y: 5, w: 4, h: 3, front: { x: 5.0, y: 8.8 } };

// 10 machines organized into 3 sets:
// - Set 1 (4 machines, top left bank): x = 10,12,14,16, y = 4
// - Set 2 (4 machines, bottom left bank): x = 10,12,14,16, y = 9
// - Set 3 VIP (2 machines, right VIP column): x = 20, y = 4 & y = 9
export const CASINO_SLOTS = SLOT_MACHINES.map((m, i) => {
  let tx, ty;
  if (m.set === 1) {
    tx = 10 + i * 2;
    ty = 4;
  } else if (m.set === 2) {
    tx = 10 + (i - 4) * 2;
    ty = 9;
  } else {
    tx = 20;
    ty = m.id === "slot_9" ? 4 : 9;
  }
  return {
    ...m,
    tx,
    ty,
    front: { x: tx + 0.5, y: ty + 1.35 }
  };
});

// 4 NPCs: Crupiê, Atendente, Segurança 1, Segurança 2 (Apostadora removed)
export const CASINO_NPCS = [
  {
    id: "npc_croupier",
    name: "Crupiê Carlos",
    x: 4.5,
    y: 4.6,
    dir: "down",
    look: { skin: 2, hairColor: 1, hairStyle: 0, shirt: 4 },
    lines: ["cas.npcCroupier1", "cas.npcCroupier2", "cas.npcCroupier3", "cas.npcCroupier4"],
    offsetMs: 0
  },
  {
    id: "npc_host",
    name: "Atendente Maya",
    x: 18.2,
    y: 7.2,
    dir: "left",
    look: { skin: 3, hairColor: 2, hairStyle: 2, shirt: 3 },
    lines: ["cas.npcHost1", "cas.npcHost2", "cas.npcHost3", "cas.npcHost4"],
    offsetMs: 5500
  },
  {
    id: "npc_guard1",
    name: "Segurança Bruno",
    x: 9.6,
    y: 13.6,
    dir: "down",
    look: { skin: 1, hairColor: 0, hairStyle: 3, shirt: 0 },
    lines: ["cas.npcGuard1_1", "cas.npcGuard1_2", "cas.npcGuard1_3", "cas.npcGuard1_4"],
    offsetMs: 11000
  },
  {
    id: "npc_guard2",
    name: "Segurança Mateus",
    x: 14.4,
    y: 13.6,
    dir: "down",
    look: { skin: 3, hairColor: 0, hairStyle: 3, shirt: 0 },
    lines: ["cas.npcGuard2_1", "cas.npcGuard2_2", "cas.npcGuard2_3", "cas.npcGuard2_4"],
    offsetMs: 16500
  }
];

const NPC_CYCLE_MS = 22000;
const NPC_SHOW_MS = 5500;
const npcSpeechOverrides = new Map(); // id -> { idx, shownAt }

function getNpcBubble(npc, nowMs) {
  const ov = npcSpeechOverrides.get(npc.id);
  if (ov && nowMs - ov.shownAt < NPC_SHOW_MS) {
    const elapsed = nowMs - ov.shownAt;
    const remaining = NPC_SHOW_MS - elapsed;
    const alpha = elapsed < 350 ? elapsed / 350 : (remaining < 900 ? remaining / 900 : 1);
    return {
      text: t(npc.lines[ov.idx % npc.lines.length]),
      alpha
    };
  }
  const shifted = nowMs + npc.offsetMs;
  const cycleIdx = Math.floor(shifted / NPC_CYCLE_MS);
  const inCycle = shifted % NPC_CYCLE_MS;
  if (inCycle > NPC_SHOW_MS) return null;
  const remaining = NPC_SHOW_MS - inCycle;
  const alpha = inCycle < 350 ? inCycle / 350 : (remaining < 900 ? remaining / 900 : 1);
  return {
    text: t(npc.lines[cycleIdx % npc.lines.length]),
    alpha
  };
}

function triggerNpcSpeak(npc) {
  const cur = npcSpeechOverrides.get(npc.id);
  const nextIdx = cur ? (cur.idx + 1) % npc.lines.length : Math.floor(Math.random() * npc.lines.length);
  npcSpeechOverrides.set(npc.id, { idx: nextIdx, shownAt: Date.now() });
}

const UI_FONT = "system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

export function isCasinoBlocked(tx, ty) {
  if (tx < 1 || ty < 1 || tx >= CASINO_W - 1 || ty >= CASINO_H - 1) {
    if (ty === CASINO_H - 1 && (tx === 11 || tx === 12)) return false;
    return true;
  }
  if (
    tx >= ROULETTE_TABLE.x && tx < ROULETTE_TABLE.x + ROULETTE_TABLE.w &&
    ty >= ROULETTE_TABLE.y && ty < ROULETTE_TABLE.y + ROULETTE_TABLE.h
  ) {
    return true;
  }
  for (const s of CASINO_SLOTS) {
    if (tx === s.tx && ty === s.ty) return true;
  }
  return false;
}

export function enterCasinoRoom(me, exitEditFn) {
  if (exitEditFn) exitEditFn();
  S.room = "casino";
  me.x = CASINO_SPAWN.x;
  me.y = CASINO_SPAWN.y;
  me.dir = "up";
  me.target = null;
  me.pending = null;
  startCasinoSync();
  toast(t("cas.welcomeRoom"), "good");
}

export function exitCasinoRoom(me, casinoBuilding) {
  stopCasinoSync();
  S.room = "world";
  if (casinoBuilding) {
    me.x = casinoBuilding.front.x;
    me.y = casinoBuilding.front.y + 0.35;
  }
  me.dir = "down";
  me.target = null;
  me.pending = null;
  playEnterBuilding();
}

export function computeCasinoFocus(me) {
  if (Math.hypot(me.x - CASINO_EXIT.x, me.y - CASINO_EXIT.y) < 1.8) {
    return { kind: "casinoExit" };
  }
  if (Math.hypot(me.x - ROULETTE_TABLE.front.x, me.y - ROULETTE_TABLE.front.y) < 2.2) {
    return { kind: "roulette" };
  }
  for (const s of CASINO_SLOTS) {
    if (Math.hypot(me.x - s.front.x, me.y - s.front.y) < 1.35) {
      return { kind: "slot", id: s.id, name: s.name };
    }
  }
  for (const n of CASINO_NPCS) {
    if (Math.hypot(me.x - n.x, me.y - n.y) < 1.8) {
      return { kind: "npc", id: n.id, name: n.name };
    }
  }
  return null;
}

export function focusLabelCasino(f) {
  if (!f) return null;
  if (f.kind === "casinoExit") return `🚪 ${t("cas.exitRoom")}`;
  if (f.kind === "roulette") return `🎡 ${t("cas.playRoulette")}`;
  if (f.kind === "slot") return `🎰 ${f.name}`;
  if (f.kind === "npc") return `💬 ${f.name}`;
  return null;
}

export async function performCasinoAction(f, onExitRoom) {
  if (!f) return;
  if (f.kind === "casinoExit") {
    onExitRoom();
    return;
  }
  if (f.kind === "roulette") {
    playEnterBuilding();
    openCasinoRoulette();
    return;
  }
  if (f.kind === "slot") {
    const ok = await occupySlotMachine(f.id);
    if (ok) {
      playEnterBuilding();
      openCasinoSlot(f.id);
    }
    return;
  }
  if (f.kind === "npc") {
    const npc = CASINO_NPCS.find((n) => n.id === f.id);
    if (npc) triggerNpcSpeak(npc);
  }
}

export function handleCasinoTap(wx, wy, me) {
  const tx = Math.floor(wx), ty = Math.floor(wy);

  if (ty >= CASINO_H - 2 && tx >= 10 && tx <= 13) {
    me.target = { ...CASINO_EXIT };
    me.pending = { kind: "casinoExit" };
    return;
  }
  if (
    wx >= ROULETTE_TABLE.x - 0.3 && wx <= ROULETTE_TABLE.x + ROULETTE_TABLE.w + 0.3 &&
    wy >= ROULETTE_TABLE.y - 0.4 && wy <= ROULETTE_TABLE.y + ROULETTE_TABLE.h + 0.4
  ) {
    me.target = { ...ROULETTE_TABLE.front };
    me.pending = { kind: "roulette" };
    return;
  }
  for (const s of CASINO_SLOTS) {
    if (tx === s.tx && ty === s.ty) {
      me.target = { ...s.front };
      me.pending = { kind: "slot", id: s.id, name: s.name };
      return;
    }
  }
  for (const n of CASINO_NPCS) {
    if (Math.hypot(wx - n.x, wy - (n.y - 0.4)) < 1.0) {
      me.target = { x: n.x, y: n.y + 1.0 };
      me.pending = { kind: "npc", id: n.id, name: n.name };
      return;
    }
  }

  me.target = { x: wx, y: wy };
  me.pending = null;
}

export function tickCasinoPending(me, onExitRoom) {
  const p = me.pending;
  if (!p) return;
  let px, py, range;
  if (p.kind === "casinoExit") { px = CASINO_EXIT.x; py = CASINO_EXIT.y; range = 1.0; }
  else if (p.kind === "roulette") { px = ROULETTE_TABLE.front.x; py = ROULETTE_TABLE.front.y; range = 1.0; }
  else if (p.kind === "slot") {
    const s = CASINO_SLOTS.find((x) => x.id === p.id);
    px = s.front.x; py = s.front.y; range = 0.9;
  } else {
    const n = CASINO_NPCS.find((x) => x.id === p.id);
    px = n.x; py = n.y + 1.0; range = 1.2;
  }
  if (Math.hypot(me.x - px, me.y - py) <= range) {
    me.pending = null;
    me.target = null;
    performCasinoAction(p, onExitRoom);
  }
}

function pill(ctx, text, x, y, { bg = "rgba(10,18,14,.78)", fg = "#fff", size = 10, border = null } = {}) {
  ctx.font = `600 ${size}px ${UI_FONT}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 10, h = size + 6;
  ctx.fillStyle = bg;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); else ctx.rect(x - w / 2, y - h / 2, w, h);
  ctx.fill();
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1.4; ctx.stroke(); }
  ctx.fillStyle = fg;
  ctx.fillText(text, x, y + 0.5);
}

export function renderCasinoRoom(ctx, view, g, drawOtherHelpers) {
  const { cw, ch, zoom, dpr } = view;
  const vw = cw / zoom, vh = ch / zoom;
  const roomW = CASINO_W * TILE, roomH = CASINO_H * TILE;
  let cx = g.me.x * TILE - vw / 2, cy = g.me.y * TILE - vh / 2;
  cx = roomW <= vw ? (roomW - vw) / 2 : Math.max(0, Math.min(roomW - vw, cx));
  cy = roomH <= vh ? (roomH - vh) / 2 : Math.max(0, Math.min(roomH - vh, cy));
  view.camX = cx; view.camY = cy;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#120810";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const s = dpr * zoom;
  ctx.setTransform(s, 0, 0, s, -cx * s, -cy * s);

  // Carpet & walls (with VIP gold zone on right for Set 3 3x5 machines)
  for (let ty = 0; ty < CASINO_H; ty++) {
    for (let tx = 0; tx < CASINO_W; tx++) {
      const x = tx * TILE, y = ty * TILE;
      const isExit = ty === CASINO_H - 1 && (tx === 11 || tx === 12);
      const isWall = tx === 0 || ty === 0 || tx === CASINO_W - 1 || (ty === CASINO_H - 1 && !isExit);
      if (isWall) {
        ctx.fillStyle = ty === 0 ? "#4a192c" : "#32111f";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = "rgba(245,197,24,.18)";
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      } else if (isExit) {
        ctx.fillStyle = "#d4a017";
        ctx.fillRect(x, y, TILE, TILE);
      } else {
        const rouletteZone = tx >= 2 && tx <= 8 && ty >= 3 && ty <= 10;
        const vipSlotZone = tx >= 19 && tx <= 22 && ty >= 3 && ty <= 11;
        ctx.fillStyle = vipSlotZone
          ? ((tx + ty) % 2 ? "#4a3310" : "#3f2b0d")
          : rouletteZone
          ? ((tx + ty) % 2 ? "#4b1627" : "#441323")
          : ((tx + ty) % 2 ? "#2b1220" : "#260f1c");
        ctx.fillRect(x, y, TILE, TILE);
      }
    }
  }

  ctx.strokeStyle = "rgba(245, 197, 24, 0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(TILE + 2, TILE + 2, (CASINO_W - 2) * TILE - 4, (CASINO_H - 2) * TILE - 4);

  // Roulette + Bonus Wheel Table
  {
    const rx = ROULETTE_TABLE.x * TILE, ry = ROULETTE_TABLE.y * TILE;
    const rw = ROULETTE_TABLE.w * TILE, rh = ROULETTE_TABLE.h * TILE;
    ctx.fillStyle = "#5c3419";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(rx + 4, ry + 4, rw - 8, rh - 8, 16); else ctx.rect(rx + 4, ry + 4, rw - 8, rh - 8);
    ctx.fill();
    ctx.fillStyle = "#146c43";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(rx + 10, ry + 10, rw - 20, rh - 20, 12); else ctx.rect(rx + 10, ry + 10, rw - 20, rh - 20);
    ctx.fill();
    ctx.strokeStyle = "#f5c518";
    ctx.lineWidth = 2;
    ctx.stroke();

    const wx = rx + rw * 0.28, wy = ry + rh / 2, wr = 22;
    for (let i = 0; i < 15; i++) {
      const a0 = g.time * 0.7 + (i * Math.PI * 2) / 15;
      const a1 = a0 + (Math.PI * 2) / 15;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.arc(wx, wy, wr, a0, a1);
      ctx.closePath();
      ctx.fillStyle = i === 13 ? "#8e44ad" : i === 5 ? "#c0392b" : i % 2 === 0 ? "#24161e" : "#1e7e4f";
      ctx.fill();
    }
    ctx.beginPath(); ctx.arc(wx, wy, 5, 0, Math.PI * 2); ctx.fillStyle = "#f5c518"; ctx.fill();

    const bx = rx + rw * 0.62, by = ry + rh * 0.34, br = 12;
    const bCols = ["#2980b9", "#16a085", "#8e44ad", "#d4ac0d"];
    for (let i = 0; i < 4; i++) {
      const a0 = -g.time * 1.1 + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.arc(bx, by, br, a0, a0 + Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = bCols[i];
      ctx.fill();
    }
    ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();

    const sx = rx + rw * 0.72, sy = ry + rh * 0.68, sr = 14;
    for (let i = 0; i < 12; i++) {
      const a0 = g.time * 0.9 + (i * Math.PI * 2) / 12;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.arc(sx, sy, sr, a0, a0 + (Math.PI * 2) / 12);
      ctx.closePath();
      ctx.fillStyle = i === 0 || i === 6 ? "#251822" : i % 2 ? "#2874a6" : "#d4ac0d";
      ctx.fill();
    }
    ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2); ctx.fillStyle = "#f5c518"; ctx.fill();
  }

  // Depth-sorted entities (10 Slot Machines, 4 NPCs, Other players, Local player)
  const entities = [];
  for (const m of CASINO_SLOTS) {
    entities.push({
      y: (m.ty + 1) * TILE,
      draw: () => {
        const mx = m.tx * TILE, my = m.ty * TILE;
        const isVip = m.set === 3;
        const occ = S.casino?.machines?.[m.id];
        const padX = isVip ? -3 : 2;
        const x = mx + padX;
        const y = my - (isVip ? 7 : 3);
        const w = TILE - padX * 2;
        const h = TILE + (isVip ? 8 : 4);

        // Floor shadow
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - 1, my + 4, w + 2, TILE - 1, 6); else ctx.rect(x - 1, my + 4, w + 2, TILE - 1);
        ctx.fill();

        // Outer cabinet body
        const bodyGrad = ctx.createLinearGradient(x, y, x + w, y + h);
        if (isVip) {
          bodyGrad.addColorStop(0, "#664308");
          bodyGrad.addColorStop(0.5, "#3b2304");
          bodyGrad.addColorStop(1, "#1e1102");
        } else {
          bodyGrad.addColorStop(0, "#2f2436");
          bodyGrad.addColorStop(0.5, "#1f1724");
          bodyGrad.addColorStop(1, "#130d17");
        }
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, 6); else ctx.rect(x, y, w, h);
        ctx.fill();

        // Metallic frame border
        ctx.strokeStyle = isVip ? "#f5c518" : (occ ? "#ffe066" : "rgba(255,255,255,0.28)");
        ctx.lineWidth = isVip ? 2 : 1.3;
        ctx.stroke();

        // Classic pull lever on Set 1 machines
        if (m.set === 1) {
          const lx = x + w;
          ctx.fillStyle = "#9aa5b1";
          ctx.fillRect(lx, y + 14, 3, 12);
          ctx.beginPath();
          ctx.arc(lx + 2, y + 12, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = m.color;
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }

        // Top illuminated marquee header
        ctx.fillStyle = m.color;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x + 3, y + 3, w - 6, isVip ? 10 : 8, 3); else ctx.rect(x + 3, y + 3, w - 6, isVip ? 10 : 8);
        ctx.fill();

        // Chasing marquee lights
        const bulbPhase = Math.floor(g.time * 4) % 3;
        const bulbs = isVip ? 5 : 4;
        for (let b = 0; b < bulbs; b++) {
          const bx = x + 6 + (b * (w - 12)) / (bulbs - 1);
          const lit = (b % 3) === bulbPhase || !!occ;
          ctx.beginPath();
          ctx.arc(bx, y + (isVip ? 8 : 7), 1.3, 0, Math.PI * 2);
          ctx.fillStyle = lit ? "#fff8c9" : "rgba(0,0,0,0.45)";
          ctx.fill();
        }

        // VIP crown topper
        if (isVip) {
          ctx.font = `10px ${EMOJI}`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("👑", x + w / 2, y - 2);
        }

        // Recessed glass reel screen
        const sx = x + 4, sy = y + (isVip ? 15 : 13), sw = w - 8, sh = isVip ? 16 : 14;
        ctx.fillStyle = occ ? "#fff6d6" : "#120c14";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(sx, sy, sw, sh, 3); else ctx.rect(sx, sy, sw, sh);
        ctx.fill();
        ctx.strokeStyle = isVip ? "#ffd859" : m.color;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Vertical reel divider lines + mini symbol display
        ctx.strokeStyle = "rgba(255,255,255,0.16)";
        ctx.lineWidth = 0.8;
        const cols = isVip ? 5 : 3;
        for (let c = 1; c < cols; c++) {
          const lx = sx + (sw * c) / cols;
          ctx.beginPath(); ctx.moveTo(lx, sy + 1); ctx.lineTo(lx, sy + sh - 1); ctx.stroke();
        }

        // Main machine icon on screen
        ctx.font = `${isVip ? 12 : 11}px ${EMOJI}`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(m.symbols[0], x + w / 2, sy + sh / 2 + 0.5);

        // Glass glare diagonal highlight
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.beginPath();
        ctx.moveTo(sx + 1, sy + 1);
        ctx.lineTo(sx + sw * 0.55, sy + 1);
        ctx.lineTo(sx + sw * 0.25, sy + sh - 1);
        ctx.lineTo(sx + 1, sy + sh - 1);
        ctx.closePath();
        ctx.fill();

        // Button console & coin tray
        const cy = sy + sh + 2;
        ctx.fillStyle = isVip ? "#8c5c0c" : "#3a2d42";
        ctx.fillRect(x + 3, cy, w - 6, 6);
        ctx.fillStyle = occ ? "#59d17a" : "#f5c518";
        ctx.fillRect(x + w - 11, cy + 1.5, 6, 3);
        ctx.fillStyle = "#ff6b6b";
        ctx.fillRect(x + 6, cy + 1.5, 5, 3);

        ctx.fillStyle = "#0a070b";
        ctx.fillRect(x + 6, cy + 7, w - 12, 3);
      }
    });
  }

  for (const n of CASINO_NPCS) {
    entities.push({
      y: n.y * TILE,
      draw: () => drawCharacter(ctx, n.x * TILE, n.y * TILE, n.look, { dir: n.dir })
    });
  }

  for (const o of g.others) {
    entities.push({
      y: o.p.dy * TILE,
      draw: () => drawCharacter(ctx, o.p.dx * TILE, o.p.dy * TILE, drawOtherHelpers.sanitizeLook(o.p.look), {
        dir: o.p.d || "down", phase: o.p.phase, moving: !!o.p.m
      })
    });
  }

  entities.push({
    y: g.me.y * TILE,
    draw: () => drawCharacter(ctx, g.me.x * TILE, g.me.y * TILE, drawOtherHelpers.myLook, {
      dir: g.me.dir, phase: g.me.phase, moving: g.me.moving
    })
  });

  entities.sort((a, b) => a.y - b.y).forEach((e) => e.draw());

  // Labels & Zone Headers
  pill(ctx, `🎡 ${t("cas.rouletteTable")}`, (ROULETTE_TABLE.x + ROULETTE_TABLE.w / 2) * TILE, (ROULETTE_TABLE.y - 0.35) * TILE, {
    size: 11, border: "#f5c518"
  });
  pill(ctx, `🎰 ${t("cas.zoneSet1")}`, 13.5 * TILE, 2.7 * TILE, { size: 10, bg: "rgba(30,15,25,.85)", border: "#e74c3c" });
  pill(ctx, `🎰 ${t("cas.zoneSet2")}`, 13.5 * TILE, 7.7 * TILE, { size: 10, bg: "rgba(30,15,25,.85)", border: "#2ecc71" });
  pill(ctx, `👑 ${t("cas.zoneSet3")}`, 20.5 * TILE, 2.7 * TILE, { size: 10, bg: "rgba(60,40,10,.9)", border: "#f5c518" });

  for (const m of CASINO_SLOTS) {
    const occ = S.casino?.machines?.[m.id];
    const isMe = occ && occ.uid === S.uid;
    const label = occ ? (isMe ? `🟡 ${m.symbols[0]}` : `🔒 ${occ.name}`) : `${m.symbols[0]} ${t("cas.free")}`;
    pill(ctx, label, (m.tx + 0.5) * TILE, (m.ty - (m.set === 3 ? 0.52 : 0.36)) * TILE, {
      size: 9,
      border: occ ? (isMe ? "#f5c518" : "#d9534f") : "#59d17a"
    });
  }

  // NPC name tags & overhead speech bubbles (identical style to player chat bubbles)
  const nowTime = Date.now();
  for (const n of CASINO_NPCS) {
    pill(ctx, n.name, n.x * TILE, n.y * TILE - 54, { size: 9, bg: "rgba(35,15,28,.88)", border: "#e67e22" });
    const bubble = getNpcBubble(n, nowTime);
    if (bubble) {
      drawSpeechBubble(ctx, bubble.text, n.x * TILE, n.y * TILE - 66, bubble.alpha);
    }
  }

  for (const o of g.others) pill(ctx, o.p.name || "?", o.p.dx * TILE, o.p.dy * TILE - 54, { size: 10 });

  if (S.chat?.bubbles) {
    for (const o of g.others) {
      const b = S.chat.bubbles.get(o.id);
      if (b && b.expiresAt > nowTime) {
        const rem = b.expiresAt - nowTime;
        drawSpeechBubble(ctx, b.text, o.p.dx * TILE, o.p.dy * TILE - 65, rem < 1000 ? rem / 1000 : 1);
      }
    }
    const myB = S.chat.bubbles.get(S.uid);
    if (myB && myB.expiresAt > nowTime) {
      const rem = myB.expiresAt - nowTime;
      drawSpeechBubble(ctx, myB.text, g.me.x * TILE, g.me.y * TILE - 48, rem < 1000 ? rem / 1000 : 1);
    }
  }

  pill(ctx, `🚪 ${t("cas.exitRoom")}`, CASINO_EXIT.x * TILE, (CASINO_EXIT.y - 0.2) * TILE, {
    size: 11, bg: "#b81d3a", border: "#f5c518"
  });
}
