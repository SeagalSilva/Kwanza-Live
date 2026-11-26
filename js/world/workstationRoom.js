// Walkable interior room for the Job Center (Posto de Trabalho).
// Houses two distinct service counters & NPCs:
// 1. Pool Receiver ("Sr. Mateus") -> Pool Points 30m Shift & Daily Pool modal
// 2. PTC Task Wall Manager ("Dona Clara") -> AdsLab PTC Task Wall for Bronze Coins
import { TILE } from "../config.js";
import { S } from "../state.js";
import { t } from "../i18n.js";
import { playEnterBuilding } from "../systems/audio.js";
import { toast } from "../ui/toast.js";
import { drawCharacter } from "./character.js";
import { drawSpeechBubble } from "./renderer.js";
import { openWorkstation } from "../ui/modals/workstation.js";
import { openPtcTasksModal } from "../ui/modals/ptcTasks.js";

export const WORKSTATION_W = 20;
export const WORKSTATION_H = 14;
export const WORKSTATION_SPAWN = { x: 10, y: 10.5 };
export const WORKSTATION_EXIT = { x: 10, y: 13.0 };

export const WORKSTATION_NPCS = [
  {
    id: "npc_pool",
    name: "Sr. Mateus (Pool PP)",
    x: 5.5,
    y: 4.1,
    deskX: 3,
    deskW: 5,
    approach: { x: 5.5, y: 5.6 },
    dir: "down",
    look: { skin: 3, hairColor: 1, hairStyle: 0, shirt: 2 },
    lines: ["ws.npcPool1", "ws.npcPool2"],
    offsetMs: 0
  },
  {
    id: "npc_ptc",
    name: "Dona Clara (Muro PTC)",
    x: 14.5,
    y: 4.1,
    deskX: 12,
    deskW: 5,
    approach: { x: 14.5, y: 5.6 },
    dir: "down",
    look: { skin: 1, hairColor: 2, hairStyle: 2, shirt: 4 },
    lines: ["ws.npcPtc1", "ws.npcPtc2"],
    offsetMs: 11000
  }
];

const NPC_CYCLE_MS = 22000;
const NPC_SHOW_MS = 5500;

function getNpcBubble(npc, nowMs) {
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

export function isWorkstationBlocked(tx, ty) {
  if (tx < 1 || ty < 2 || tx >= WORKSTATION_W - 1 || ty >= WORKSTATION_H - 1) {
    if (ty === WORKSTATION_H - 1 && (tx === 9 || tx === 10 || tx === 11)) return false;
    return true;
  }
  // Service counters at row ty === 4 (and behind-counter area ty < 4)
  if (ty <= 4 && ((tx >= 3 && tx <= 7) || (tx >= 12 && tx <= 16))) {
    return true;
  }
  // Corner plant pots
  if ((tx === 1 || tx === WORKSTATION_W - 2) && (ty === 2 || ty === WORKSTATION_H - 2)) {
    return true;
  }
  return false;
}

export function enterWorkstationRoom(me, exitEditFn) {
  if (exitEditFn) exitEditFn();
  S.room = "workstation";
  me.x = WORKSTATION_SPAWN.x;
  me.y = WORKSTATION_SPAWN.y;
  me.dir = "up";
  me.target = null;
  me.pending = null;
  playEnterBuilding();
  toast(t("ws.welcomeRoom"), "good", 4500);
}

export function exitWorkstationRoom(me, exitBuilding) {
  S.room = "world";
  if (exitBuilding) {
    me.x = exitBuilding.front.x;
    me.y = exitBuilding.front.y + 0.6;
    me.dir = "down";
  }
  me.target = null;
  me.pending = null;
}

export function computeWorkstationFocus(me) {
  for (const npc of WORKSTATION_NPCS) {
    if (Math.hypot(me.x - npc.approach.x, me.y - npc.approach.y) < 1.8 || Math.hypot(me.x - npc.x, me.y - npc.y) < 2.2) {
      return { kind: "wsNpc", npc };
    }
  }
  if (Math.hypot(me.x - WORKSTATION_EXIT.x, me.y - WORKSTATION_EXIT.y) < 1.8) {
    return { kind: "exit" };
  }
  return null;
}

export function focusLabelWorkstation(f) {
  if (!f) return null;
  if (f.kind === "exit") return t("cas.exitRoom");
  if (f.kind === "wsNpc") {
    return f.npc.id === "npc_ptc"
      ? `📋 ${t("ws.talkPtcNpc")}`
      : `🌾 ${t("ws.talkPoolNpc")}`;
  }
  return null;
}

export function performWorkstationAction(f, handleLeaveWorkstation) {
  if (!f) return;
  if (f.kind === "exit") {
    handleLeaveWorkstation();
    return;
  }
  if (f.kind === "wsNpc") {
    playEnterBuilding();
    if (f.npc.id === "npc_ptc") {
      openPtcTasksModal();
    } else {
      openWorkstation();
    }
  }
}

export function handleWorkstationTap(wx, wy, me) {
  // Clicked on exit mat
  if (wy >= WORKSTATION_H - 1.8 && wx >= 8.2 && wx <= 11.8) {
    me.target = { x: WORKSTATION_EXIT.x, y: WORKSTATION_EXIT.y - 0.3 };
    me.pending = { kind: "exit" };
    return;
  }

  // Clicked on or near one of the two NPCs / desks
  for (const npc of WORKSTATION_NPCS) {
    const onDesk = wx >= npc.deskX - 0.3 && wx <= npc.deskX + npc.deskW + 0.3 && wy >= 1.8 && wy <= 5.5;
    if (onDesk || Math.hypot(wx - npc.x, wy - npc.y) < 1.5) {
      me.target = { x: npc.approach.x, y: npc.approach.y };
      me.pending = { kind: "wsNpc", npc };
      return;
    }
  }

  me.target = { x: wx, y: wy };
  me.pending = null;
}

export function tickWorkstationPending(me, handleLeaveWorkstation) {
  const p = me.pending;
  if (!p) return;
  if (p.kind === "exit") {
    if (Math.hypot(me.x - WORKSTATION_EXIT.x, me.y - WORKSTATION_EXIT.y) <= 1.2) {
      me.pending = null;
      me.target = null;
      handleLeaveWorkstation();
    }
    return;
  }
  if (p.kind === "wsNpc" && p.npc) {
    if (Math.hypot(me.x - p.npc.approach.x, me.y - p.npc.approach.y) <= 1.0) {
      me.pending = null;
      me.target = null;
      me.dir = "up";
      performWorkstationAction(p, handleLeaveWorkstation);
    }
  }
}

const TILE_SIZE = TILE;
const UI_FONT = "system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

function drawEmoji(ctx, ch, x, y, size) {
  ctx.font = `${size}px ${EMOJI}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ch, x, y);
}

function drawBadge(ctx, text, cx, y, bg, fg, border) {
  ctx.save();
  ctx.font = `700 11px ${UI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 14;
  const h = 20;
  ctx.fillStyle = bg;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - w / 2, y - h / 2, w, h, 8);
  else ctx.rect(cx - w / 2, y - h / 2, w, h);
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.fillStyle = fg;
  ctx.fillText(text, cx, y + 0.5);
  ctx.restore();
}

export function renderWorkstationRoom(ctx, view, g, { sanitizeLook }) {
  const { cw, ch, zoom, dpr } = view;
  const vw = cw / zoom, vh = ch / zoom;
  const worldW = WORKSTATION_W * TILE_SIZE, worldH = WORKSTATION_H * TILE_SIZE;

  let cx = g.me.x * TILE_SIZE - vw / 2, cy = g.me.y * TILE_SIZE - vh / 2;
  cx = worldW <= vw ? (worldW - vw) / 2 : Math.max(0, Math.min(worldW - vw, cx));
  cy = worldH <= vh ? (worldH - vh) / 2 : Math.max(0, Math.min(worldH - vh, cy));
  view.camX = cx; view.camY = cy;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#191512";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const s = dpr * zoom;
  ctx.setTransform(s, 0, 0, s, -cx * s, -cy * s);

  // Floor & walls
  for (let ty = 0; ty < WORKSTATION_H; ty++) {
    for (let tx = 0; tx < WORKSTATION_W; tx++) {
      const x = tx * TILE_SIZE, y = ty * TILE_SIZE;
      const isDoor = ty === WORKSTATION_H - 1 && (tx === 9 || tx === 10 || tx === 11);
      const isWall = tx === 0 || tx === WORKSTATION_W - 1 || ty === 0 || ty === 1 || (ty === WORKSTATION_H - 1 && !isDoor);

      if (isWall) {
        ctx.fillStyle = ty <= 1 ? "#3e3328" : "#2f261e";
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        if (ty === 1 && (tx === 5 || tx === 10 || tx === 14)) {
          // Warm glass windows on upper wall
          ctx.fillStyle = "#9ed0f0";
          ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 10);
          ctx.strokeStyle = "#5c3a21";
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 10);
        }
      } else if (isDoor) {
        ctx.fillStyle = "#8a5a32";
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      } else {
        // Warm wooden parquet floor
        ctx.fillStyle = (tx + ty) % 2 ? "#b78856" : "#ae7f4e";
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = "rgba(0,0,0,0.06)";
        ctx.fillRect(x, y + TILE_SIZE - 1, TILE_SIZE, 1);
      }
    }
  }

  // Center hallway runner carpet
  ctx.fillStyle = "#7a2c2c";
  ctx.fillRect(8.5 * TILE_SIZE, 6 * TILE_SIZE, 3 * TILE_SIZE, 6.5 * TILE_SIZE);
  ctx.strokeStyle = "#f5c518";
  ctx.lineWidth = 2;
  ctx.strokeRect(8.6 * TILE_SIZE, 6.1 * TILE_SIZE, 2.8 * TILE_SIZE, 6.3 * TILE_SIZE);

  // Welcome exit mat
  ctx.fillStyle = "rgba(245,197,24,0.22)";
  ctx.fillRect(8.8 * TILE_SIZE, (WORKSTATION_H - 1.15) * TILE_SIZE, 2.4 * TILE_SIZE, TILE_SIZE * 0.9);
  drawBadge(ctx, `🚪 ${t("cas.exitRoom")}`, 10 * TILE_SIZE, (WORKSTATION_H - 0.55) * TILE_SIZE, "rgba(14,23,18,0.85)", "#f5c518", "#f5c518");

  // Desk carpets & wall banners behind each NPC
  for (const npc of WORKSTATION_NPCS) {
    const dx = npc.deskX * TILE_SIZE;
    const dw = npc.deskW * TILE_SIZE;
    const isPtc = npc.id === "npc_ptc";
    const bannerColor = isPtc ? "#2980b9" : "#27ae60";
    const bannerLabel = isPtc ? `📋 ${t("ws.bannerPtc")}` : `🌾 ${t("ws.bannerPool")}`;

    // Wall signboard above desk
    drawBadge(ctx, bannerLabel, dx + dw / 2, 1.8 * TILE_SIZE, "rgba(18,24,20,0.92)", "#ffffff", bannerColor);

    // Interaction mat in front of counter
    ctx.fillStyle = isPtc ? "rgba(52,152,219,0.18)" : "rgba(89,209,122,0.18)";
    ctx.fillRect((npc.approach.x - 1) * TILE_SIZE, (npc.approach.y - 0.5) * TILE_SIZE, 2 * TILE_SIZE, TILE_SIZE);
  }

  const entities = [];

  // Corner plants
  const plants = [
    [1.5, 2.5],
    [WORKSTATION_W - 1.5, 2.5],
    [1.5, WORKSTATION_H - 1.5],
    [WORKSTATION_W - 1.5, WORKSTATION_H - 1.5]
  ];
  for (const [px, py] of plants) {
    entities.push({
      y: py * TILE_SIZE,
      draw: () => drawEmoji(ctx, "🪴", px * TILE_SIZE, py * TILE_SIZE, 26)
    });
  }

  // NPCs (drawn behind counters)
  for (const npc of WORKSTATION_NPCS) {
    entities.push({
      y: npc.y * TILE_SIZE,
      draw: () => drawCharacter(ctx, npc.x * TILE_SIZE, npc.y * TILE_SIZE, npc.look, { dir: npc.dir, phase: 0, moving: false })
    });
  }

  // Wooden counters (drawn at y = 4.65 so they sit cleanly in front of NPC torso)
  for (const npc of WORKSTATION_NPCS) {
    const dx = npc.deskX * TILE_SIZE;
    const dw = npc.deskW * TILE_SIZE;
    const dy = 4.15 * TILE_SIZE;
    const dh = 0.85 * TILE_SIZE;
    entities.push({
      y: 4.8 * TILE_SIZE,
      draw: () => {
        // Shadow
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(dx + 4, dy + dh - 2, dw - 4, 8);
        // Desk front panel
        ctx.fillStyle = "#5c3a21";
        ctx.fillRect(dx, dy + 8, dw, dh - 8);
        // Desk countertop
        ctx.fillStyle = "#8a5a32";
        ctx.fillRect(dx - 3, dy, dw + 6, 12);
        ctx.strokeStyle = "#3d2514";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(dx - 3, dy, dw + 6, 12);

        // Desk props
        if (npc.id === "npc_ptc") {
          drawEmoji(ctx, "💻", dx + dw * 0.25, dy + 2, 18);
          drawEmoji(ctx, "🪙", dx + dw * 0.78, dy + 2, 16);
        } else {
          drawEmoji(ctx, "📒", dx + dw * 0.25, dy + 2, 17);
          drawEmoji(ctx, "⚖️", dx + dw * 0.78, dy + 2, 17);
        }
      }
    });
  }

  // Players in workstation room
  const look = sanitizeLook(S.profile?.look);
  for (const o of g.others) {
    if ((o.p.room || "world") !== "workstation") continue;
    entities.push({
      y: o.p.dy * TILE_SIZE,
      draw: () => drawCharacter(ctx, o.p.dx * TILE_SIZE, o.p.dy * TILE_SIZE, o.p.look, { dir: o.p.d || "down", phase: o.p.phase, moving: !!o.p.m })
    });
  }
  entities.push({
    y: g.me.y * TILE_SIZE,
    draw: () => drawCharacter(ctx, g.me.x * TILE_SIZE, g.me.y * TILE_SIZE, look, { dir: g.me.dir, phase: g.me.phase, moving: g.me.moving })
  });

  entities.sort((a, b) => a.y - b.y).forEach((e) => e.draw());

  // Name tags & speech bubbles
  const nowMs = Date.now();
  for (const npc of WORKSTATION_NPCS) {
    const borderCol = npc.id === "npc_ptc" ? "#5dade2" : "#59d17a";
    drawBadge(ctx, npc.name, npc.x * TILE_SIZE, npc.y * TILE_SIZE - 54, "rgba(14,23,18,0.85)", "#ffffff", borderCol);
    const bubble = getNpcBubble(npc, nowMs);
    if (bubble) {
      drawSpeechBubble(ctx, bubble.text, npc.x * TILE_SIZE, npc.y * TILE_SIZE - 66, bubble.alpha);
    }
  }

  for (const o of g.others) {
    if ((o.p.room || "world") !== "workstation") continue;
    drawBadge(ctx, o.p.name || "?", o.p.dx * TILE_SIZE, o.p.dy * TILE_SIZE - 54, "rgba(14,23,18,0.78)", "#ffffff", null);
  }
}
