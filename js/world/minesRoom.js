// Walkable interior room for the Public Mines (Minas Públicas).
// Contains NPC miners, rocky cave walls, and interactable rocks (Common, Uncommon, Rare, Epic, Legendary).
import { TILE } from "../config.js";
import { S, energy } from "../state.js";
import { t, fmtNum } from "../i18n.js";
import { playEnterBuilding, playMineHit, playRockBreak, playPreciousGem } from "../systems/audio.js";
import { toast } from "../ui/toast.js";
import { drawCharacter } from "./character.js";
import { drawSpeechBubble } from "./renderer.js";
import { commit, savePath } from "../systems/db.js";
import { increment } from "../firebase.js";

export const MINES_W = 26;
export const MINES_H = 16;
export const MINES_SPAWN = { x: 13, y: 11.5 };
export const MINES_EXIT = { x: 13, y: 14.8 };

let syncTimer = null;
let remoteRocks = {};
let rockConfigs = {};

export const MINES_NPCS = [
  {
    id: "npc_miner",
    name: "Mestre Garimpeiro",
    x: 4.5,
    y: 5.2,
    dir: "down",
    look: { skin: 2, hairColor: 0, hairStyle: 1, shirt: 2 },
    lines: ["mines.npc1", "mines.npc2", "mines.npc3", "mines.npc4"],
    offsetMs: 0
  }
];

const NPC_CYCLE_MS = 9500;
const NPC_SHOW_MS = 6000;
const npcSpeechOverrides = new Map();

function getNpcBubble(npc, nowMs) {
  const ov = npcSpeechOverrides.get(npc.id);
  if (ov && nowMs - ov.shownAt < NPC_SHOW_MS) {
    const remaining = NPC_SHOW_MS - (nowMs - ov.shownAt);
    return {
      text: t(npc.lines[ov.idx % npc.lines.length]),
      alpha: remaining < 900 ? remaining / 900 : 1
    };
  }
  const shifted = nowMs + npc.offsetMs;
  const cycleIdx = Math.floor(shifted / NPC_CYCLE_MS);
  const inCycle = shifted % NPC_CYCLE_MS;
  if (inCycle > NPC_SHOW_MS) return null;
  const remaining = NPC_SHOW_MS - inCycle;
  return {
    text: t(npc.lines[cycleIdx % npc.lines.length]),
    alpha: remaining < 900 ? remaining / 900 : 1
  };
}

export function startMinesSync() {
  stopMinesSync();
  fetchMinesState();
  syncTimer = setInterval(fetchMinesState, 3000);
}

export function stopMinesSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

async function fetchMinesState() {
  try {
    const res = await fetch("/api/mines/state");
    if (res.ok) {
      const data = await res.json();
      remoteRocks = data.rocks || {};
      rockConfigs = data.rockConfigs || {};
    }
  } catch (_) {}
}

export function isMinesBlocked(tx, ty) {
  if (tx < 1 || ty < 1 || tx >= MINES_W - 1 || ty >= MINES_H - 1) {
    if (ty === MINES_H - 1 && (tx === 12 || tx === 13 || tx === 14)) return false;
    return true;
  }
  for (const rock of Object.values(remoteRocks)) {
    if (rock && rock.hp > 0 && Math.floor(rock.x) === tx && Math.floor(rock.y) === ty) {
      return true;
    }
  }
  return false;
}

export function enterMinesRoom(me, exitEditFn) {
  if (exitEditFn) exitEditFn();
  S.room = "mines";
  me.x = MINES_SPAWN.x;
  me.y = MINES_SPAWN.y;
  me.dir = "up";
  me.target = null;
  me.pending = null;
  playEnterBuilding();
  startMinesSync();
  toast(t("mines.welcomeRoom"), "good");
}

export function exitMinesRoom(me, exitBuilding) {
  stopMinesSync();
  S.room = "world";
  if (exitBuilding) {
    me.x = exitBuilding.front.x;
    me.y = exitBuilding.front.y + 0.6;
    me.dir = "down";
  }
  me.target = null;
  me.pending = null;
}

export function computeMinesFocus(me) {
  for (const rock of Object.values(remoteRocks)) {
    if (!rock || rock.hp <= 0) continue;
    const dist = Math.hypot(me.x - (rock.x + 0.5), me.y - (rock.y + 0.5));
    if (dist < 1.8) {
      return { kind: "rock", rockId: rock.id, rock };
    }
  }
  for (const npc of MINES_NPCS) {
    if (Math.hypot(me.x - npc.x, me.y - npc.y) < 2.0) {
      return { kind: "npc", npc };
    }
  }
  if (Math.hypot(me.x - MINES_EXIT.x, me.y - MINES_EXIT.y) < 2.0) {
    return { kind: "exit" };
  }
  return null;
}

export function focusLabelMines(f) {
  if (!f) return null;
  if (f.kind === "exit") return t("cas.exitRoom");
  if (f.kind === "npc") return t("act.inspect") + " " + f.npc.name;
  if (f.kind === "rock") {
    const cfg = rockConfigs[f.rock.tier] || {};
    return `⛏️ Bater (${cfg.name || f.rock.tier}) [⚡${cfg.cost || 1}]`;
  }
  return null;
}

export async function performMinesAction(f, handleLeaveMines) {
  if (!f) return;
  if (f.kind === "exit") {
    handleLeaveMines();
    return;
  }
  if (f.kind === "npc") {
    const npc = MINES_NPCS.find((n) => n.id === f.npc.id);
    if (npc) {
      const cur = npcSpeechOverrides.get(npc.id);
      const nextIdx = cur ? (cur.idx + 1) % npc.lines.length : 0;
      npcSpeechOverrides.set(npc.id, { idx: nextIdx, shownAt: Date.now() });
    }
    return;
  }
  if (f.kind === "rock") {
    const rock = remoteRocks[f.rockId];
    if (!rock || rock.hp <= 0) return;
    const cfg = rockConfigs[rock.tier] || { cost: 1 };
    const curEnergy = energy().current;

    if (curEnergy < cfg.cost) {
      toast(t("mines.notEnoughEnergy"), "bad");
      return;
    }

    playMineHit();

    try {
      const res = await fetch("/api/mines/hit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rockId: rock.id,
          uid: S.uid,
          name: S.profile?.username || "Jogador",
          energyCurrent: curEnergy
        })
      });
      const data = await res.json();
      if (!res.ok || !data.allowed) {
        toast(data.error === "Insufficient energy" ? t("mines.notEnoughEnergy") : t("msg.error"), "bad");
        return;
      }

      remoteRocks[rock.id] = data.rock;

      // Deduct local energy & commit to Firebase
      const nextEnergy = Math.max(0, curEnergy - data.energyCost);
      S.save.energy.current = nextEnergy;
      await commit({
        [savePath(S.uid, "energy/current")]: nextEnergy
      });

      if (data.broken) {
        playRockBreak();
        playPreciousGem();
        const loot = data.loot || {};
        const updates = {};
        const msgs = [];

        if (loot.pp > 0) {
          updates[savePath(S.uid, "wallet/pp")] = increment(loot.pp);
          msgs.push(`+${loot.pp} PP`);
        }
        if (loot.bronze > 0) {
          updates[savePath(S.uid, "wallet/bronze")] = increment(loot.bronze);
          msgs.push(`+${loot.bronze} 🥉`);
        }
        if (loot.silver > 0) {
          updates[savePath(S.uid, "wallet/silver")] = increment(loot.silver);
          msgs.push(`+${loot.silver} 🥈`);
        }
        if (loot.seeds) {
          for (const [seedId, qty] of Object.entries(loot.seeds)) {
            updates[savePath(S.uid, `inv/${seedId}`)] = increment(qty);
            msgs.push(`+${qty} semente(s)`);
          }
        }

        if (Object.keys(updates).length > 0) {
          await commit(updates);
        }

        toast(t("mines.rockBroken", { loot: msgs.join(" · ") }), "good", 5000);
      }
    } catch (_) {
      toast(t("msg.error"), "bad");
    }
  }
}

export function handleMinesTap(wx, wy, me) {
  me.target = { x: wx, y: wy };
  me.pending = null;
}

export function tickMinesPending(me, handleLeaveMines) {
  // Handled via interact action button
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

export function renderMinesRoom(ctx, view, g, { sanitizeLook }) {
  const { cw, ch, zoom, dpr } = view;
  const vw = cw / zoom, vh = ch / zoom;
  const worldW = MINES_W * TILE_SIZE, worldH = MINES_H * TILE_SIZE;

  let cx = g.me.x * TILE_SIZE - vw / 2, cy = g.me.y * TILE_SIZE - vh / 2;
  cx = worldW <= vw ? (worldW - vw) / 2 : Math.max(0, Math.min(worldW - vw, cx));
  cy = worldH <= vh ? (worldH - vh) / 2 : Math.max(0, Math.min(worldH - vh, cy));
  view.camX = cx; view.camY = cy;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#1b1816"; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const s = dpr * zoom;
  ctx.setTransform(s, 0, 0, s, -cx * s, -cy * s);

  // Draw mine cavern floor (stone tiles)
  for (let ty = 0; ty < MINES_H; ty++) {
    for (let tx = 0; tx < MINES_W; tx++) {
      const x = tx * TILE_SIZE, y = ty * TILE_SIZE;
      const border = tx === 0 || ty === 0 || tx === MINES_W - 1 || ty === MINES_H - 1;
      if (border) {
        ctx.fillStyle = ty === MINES_H - 1 && (tx === 12 || tx === 13 || tx === 14) ? "#48382c" : "#2d241e";
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      } else {
        ctx.fillStyle = (tx + ty) % 2 ? "#36302a" : "#322c26";
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        // Stone texture specks
        if ((tx * 7 + ty * 13) % 5 === 0) {
          ctx.fillStyle = "rgba(0,0,0,0.18)";
          ctx.fillRect(x + 6, y + 8, 4, 3);
        }
      }
    }
  }

  const entities = [];

  // Exit sign at bottom door
  entities.push({
    y: (MINES_H - 0.5) * TILE_SIZE,
    draw: () => {
      ctx.fillStyle = "rgba(245,197,24,0.15)";
      ctx.fillRect(11 * TILE_SIZE, (MINES_H - 1.2) * TILE_SIZE, 3 * TILE_SIZE, TILE_SIZE);
    }
  });

  // Draw rocks
  for (const rock of Object.values(remoteRocks)) {
    if (!rock || rock.hp <= 0) continue;
    const rx = rock.x * TILE_SIZE;
    const ry = rock.y * TILE_SIZE;
    const cfg = rockConfigs[rock.tier] || { emoji: "🪨" };

    entities.push({
      y: (rock.y + 1) * TILE_SIZE,
      draw: () => {
        // Shadow
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.ellipse(rx + TILE_SIZE / 2, ry + TILE_SIZE - 4, 12, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rock Emoji
        drawEmoji(ctx, cfg.emoji, rx + TILE_SIZE / 2, ry + TILE_SIZE / 2 - 2, 26);

        // HP bar if damaged
        if (rock.hp < rock.maxHp) {
          const barW = 24, barH = 4;
          const bx = rx + (TILE_SIZE - barW) / 2;
          const by = ry + 2;
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillRect(bx, by, barW, barH);
          const fillW = Math.max(2, (barW * rock.hp) / rock.maxHp);
          ctx.fillStyle = "var(--ok)";
          ctx.fillRect(bx, by, fillW, barH);
        }
      }
    });
  }

  // Draw NPCs
  for (const npc of MINES_NPCS) {
    entities.push({
      y: npc.y * TILE_SIZE,
      draw: () => {
        drawCharacter(ctx, npc.x * TILE_SIZE, npc.y * TILE_SIZE, npc.look, { dir: npc.dir, phase: 0, moving: false });
      }
    });
  }

  // Draw Player
  const look = sanitizeLook(S.profile?.look);
  for (const o of g.others) {
    if ((o.p.room || "world") !== "mines") continue;
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
  for (const npc of MINES_NPCS) {
    drawCharacterNameTag(ctx, npc.name, npc.x * TILE_SIZE, npc.y * TILE_SIZE - 32, "#f5c518");
    const bubble = getNpcBubble(npc, nowMs);
    if (bubble) {
      drawSpeechBubble(ctx, bubble.text, npc.x * TILE_SIZE, npc.y * TILE_SIZE - 42, bubble.alpha);
    }
  }

  for (const o of g.others) {
    if ((o.p.room || "world") !== "mines") continue;
    drawCharacterNameTag(ctx, o.p.name || "?", o.p.dx * TILE_SIZE, o.p.dy * TILE_SIZE - 32);
  }
  drawCharacterNameTag(ctx, S.profile?.username || "", g.me.x * TILE_SIZE, g.me.y * TILE_SIZE - 32, "#f5c518");
}

function drawCharacterNameTag(ctx, text, cx, y, border = null) {
  ctx.save();
  ctx.font = `600 11px ${UI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 12;
  const h = 18;
  ctx.fillStyle = "rgba(14,23,18,0.78)";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - w / 2, y - h / 2, w, h, 6);
  else ctx.rect(cx - w / 2, y - h / 2, w, h);
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, cx, y + 0.5);
  ctx.restore();
}
