// Walkable interior room for the Public Mines (Minas Públicas).
// Contains NPC miners, rocky cave walls, and interactable rocks (Common, Uncommon, Rare, Epic, Legendary).
import { TILE } from "../config.js";
import { S, energy } from "../state.js";
import { t, fmtNum } from "../i18n.js";
import { playEnterBuilding, playMineHit, playRockBreak, playRockLand, playPreciousGem } from "../systems/audio.js";
import { toast } from "../ui/toast.js";
import { drawCharacter } from "./character.js";
import { drawSpeechBubble } from "./renderer.js";
import { commit, savePath } from "../systems/db.js";
import { increment } from "../firebase.js";
import { itemIcon, itemName } from "../data/items.js";

export const MINES_W = 26;
export const MINES_H = 16;
export const MINES_SPAWN = { x: 13, y: 11.5 };
export const MINES_EXIT = { x: 13, y: 14.8 };

let syncTimer = null;
let remoteRocks = {};
let rockConfigs = {};
let lastForcedRespawnPollAt = 0;
const prevRockHp = new Map();       // rockId -> last known hp
const seenSpawnStamp = new Map();   // rockId -> rock.spawnedAt already animated
const rockSpawnAnims = new Map();   // rockId -> { startedAt, durationMs, landed, sparks }

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

const NPC_CYCLE_MS = 22000;
const NPC_SHOW_MS = 5500;
const npcSpeechOverrides = new Map();

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

function triggerRockCeilingSpawn(rockId, startedAt = Date.now()) {
  const sparks = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i) / 10 + (Math.random() - 0.5) * 0.45;
    sparks.push({
      angle,
      dist: 10 + Math.random() * 14,
      size: 1.6 + Math.random() * 2.2,
      tone: i % 3 === 0 ? "#8a7a6b" : i % 3 === 1 ? "#6e6257" : "#c7b8a8"
    });
  }
  rockSpawnAnims.set(rockId, {
    startedAt,
    durationMs: 950,
    landed: false,
    sparks
  });
}

export function startMinesSync() {
  stopMinesSync();
  prevRockHp.clear();
  seenSpawnStamp.clear();
  rockSpawnAnims.clear();
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
      const nextRocks = data.rocks || {};
      const now = Date.now();
      const serverNow = Number(data.serverNow) || now;

      for (const rock of Object.values(nextRocks)) {
        if (!rock) continue;
        const hadPrev = prevRockHp.has(rock.id);
        const oldHp = prevRockHp.get(rock.id);
        const spawnStamp = Number(rock.spawnedAt) || 0;
        const freshServerSpawn =
          spawnStamp > 0 &&
          serverNow - spawnStamp < 3200 &&
          seenSpawnStamp.get(rock.id) !== spawnStamp;

        if ((hadPrev && oldHp <= 0 && rock.hp > 0) || freshServerSpawn) {
          if (spawnStamp > 0) seenSpawnStamp.set(rock.id, spawnStamp);
          triggerRockCeilingSpawn(rock.id, now);
        }
        prevRockHp.set(rock.id, rock.hp);
      }

      remoteRocks = nextRocks;
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
      prevRockHp.set(rock.id, data.rock.hp);

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
        if (loot.seeds) {
          for (const [seedId, qty] of Object.entries(loot.seeds)) {
            if (qty > 0) {
              updates[savePath(S.uid, `inv/${seedId}`)] = increment(qty);
              msgs.push(`+${qty} ${itemIcon(seedId)} ${itemName(seedId)}`);
            }
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

const ROCK_PALETTES = {
  common: {
    top: "#8a949c",
    mid: "#636c73",
    dark: "#3f464c",
    vein: "#b0bec5",
    hi: "#eceff1",
    hasCrystal: false
  },
  uncommon: {
    top: "#8b8378",
    mid: "#615950",
    dark: "#3e3832",
    vein: "#e67e22",
    hi: "#ffbe76",
    hasCrystal: true
  },
  rare: {
    top: "#748ca0",
    mid: "#4a5f73",
    dark: "#2d3b47",
    vein: "#00bcd4",
    hi: "#80f3ff",
    hasCrystal: true
  },
  epic: {
    top: "#7d728a",
    mid: "#51475c",
    dark: "#312a38",
    vein: "#ab47bc",
    hi: "#f39cff",
    hasCrystal: true
  },
  legendary: {
    top: "#9e8e68",
    mid: "#6e6143",
    dark: "#423925",
    vein: "#f5c518",
    hi: "#fff4a3",
    hasCrystal: true
  }
};

function draw3DOreRock(ctx, cx, cy, tier, hpRatio = 1, time = 0, seed = 0) {
  const pal = ROCK_PALETTES[tier] || ROCK_PALETTES.common;
  ctx.save();
  ctx.translate(cx, cy);

  // Dark right/bottom faceted base
  ctx.fillStyle = pal.dark;
  ctx.beginPath();
  ctx.moveTo(-12, 8);
  ctx.lineTo(-14, -1);
  ctx.lineTo(-6, -12);
  ctx.lineTo(7, -11);
  ctx.lineTo(14, -2);
  ctx.lineTo(12, 9);
  ctx.lineTo(0, 11);
  ctx.closePath();
  ctx.fill();

  // Mid front-left faceted face
  ctx.fillStyle = pal.mid;
  ctx.beginPath();
  ctx.moveTo(-12, 8);
  ctx.lineTo(-14, -1);
  ctx.lineTo(-6, -12);
  ctx.lineTo(4, -9);
  ctx.lineTo(6, 2);
  ctx.lineTo(0, 11);
  ctx.closePath();
  ctx.fill();

  // Sunlit upper-left top crown facet
  ctx.fillStyle = pal.top;
  ctx.beginPath();
  ctx.moveTo(-12, -1);
  ctx.lineTo(-6, -12);
  ctx.lineTo(7, -11);
  ctx.lineTo(4, -2);
  ctx.lineTo(-5, 1);
  ctx.closePath();
  ctx.fill();

  // Crisp edge highlight & shaded outline
  ctx.strokeStyle = "rgba(12, 10, 8, 0.55)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-12, 8);
  ctx.lineTo(-14, -1);
  ctx.lineTo(-6, -12);
  ctx.lineTo(7, -11);
  ctx.lineTo(14, -2);
  ctx.lineTo(12, 9);
  ctx.lineTo(0, 11);
  ctx.closePath();
  ctx.stroke();

  // Metallic ore veins or protruding 3D crystals
  if (!pal.hasCrystal) {
    ctx.fillStyle = pal.vein;
    ctx.fillRect(-7, -5, 5, 3);
    ctx.fillRect(2, 1, 5, 3);
  } else {
    const drawShard = (sx, sy, w, h, tilt) => {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(tilt);
      ctx.fillStyle = pal.vein;
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.lineTo(0, -h);
      ctx.lineTo(w, 0);
      ctx.lineTo(0, 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = pal.hi;
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.lineTo(0, -h);
      ctx.lineTo(0, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    drawShard(-5, -5, 3.6, 10, -0.28);
    drawShard(4, -7, 4.2, 12, 0.22);
    drawShard(7, 2, 3, 8, 0.45);

    if (tier === "epic" || tier === "legendary") {
      const shimmer = 0.45 + Math.sin(time * 4 + seed) * 0.35;
      ctx.fillStyle = tier === "legendary"
        ? `rgba(255, 240, 120, ${(0.32 * shimmer).toFixed(2)})`
        : `rgba(215, 115, 255, ${(0.28 * shimmer).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(0, -4, 15, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Damage cracks if partially mined
  if (hpRatio < 1) {
    ctx.strokeStyle = "rgba(18, 12, 10, 0.85)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-3, -7); ctx.lineTo(0, -1); ctx.lineTo(-4, 5);
    if (hpRatio < 0.55) {
      ctx.moveTo(0, -1); ctx.lineTo(7, 3);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function drawMinesArchitecture(ctx, time) {
  const worldW = MINES_W * TILE_SIZE;
  const worldH = MINES_H * TILE_SIZE;

  // 1. Stone floor with subtle flagstones & damp depth variation
  for (let ty = 1; ty < MINES_H - 1; ty++) {
    for (let tx = 1; tx < MINES_W - 1; tx++) {
      const x = tx * TILE_SIZE, y = ty * TILE_SIZE;
      const hash = (tx * 17 + ty * 31) % 7;
      ctx.fillStyle = (tx + ty) % 2 ? "#352e28" : "#302923";
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      if (hash < 2) {
        ctx.fillStyle = "rgba(255, 245, 230, 0.04)";
        ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, 2);
      }
      if (hash === 4) {
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(x + 7, y + 9, 5, 3);
      }
    }
  }

  // 2. Non-blocking wooden railway sleepers & twin steel rails down center corridor (tx = 13)
  const railX = 13.5 * TILE_SIZE;
  for (let py = TILE_SIZE * 1.5; py < worldH - TILE_SIZE * 0.2; py += 12) {
    ctx.fillStyle = "#52331b";
    ctx.fillRect(railX - 16, py, 32, 4);
    ctx.fillStyle = "#362010";
    ctx.fillRect(railX - 16, py + 3, 32, 1.5);
  }
  ctx.fillStyle = "#7a858e";
  ctx.fillRect(railX - 10, TILE_SIZE * 1.3, 3, worldH - TILE_SIZE * 1.3);
  ctx.fillRect(railX + 7, TILE_SIZE * 1.3, 3, worldH - TILE_SIZE * 1.3);
  ctx.fillStyle = "#b8c4cc";
  ctx.fillRect(railX - 10, TILE_SIZE * 1.3, 1.5, worldH - TILE_SIZE * 1.3);
  ctx.fillRect(railX + 7, TILE_SIZE * 1.3, 1.5, worldH - TILE_SIZE * 1.3);

  // 3. 2.5D North Cavern Cliff Face (top rim + stratified vertical wall + cast shadow onto floor)
  ctx.fillStyle = "#191411";
  ctx.fillRect(0, 0, worldW, TILE_SIZE * 0.45);
  // Top sunlit cliff shelf
  ctx.fillStyle = "#4f4339";
  ctx.fillRect(TILE_SIZE * 0.5, TILE_SIZE * 0.12, worldW - TILE_SIZE, TILE_SIZE * 0.36);
  // Stratified front cliff face
  const cliffGrad = ctx.createLinearGradient(0, TILE_SIZE * 0.48, 0, TILE_SIZE * 1.12);
  cliffGrad.addColorStop(0, "#3b312a");
  cliffGrad.addColorStop(1, "#241d18");
  ctx.fillStyle = cliffGrad;
  ctx.fillRect(0, TILE_SIZE * 0.48, worldW, TILE_SIZE * 0.64);
  // Wall cast shadow onto floor row ty = 1
  const wallShadow = ctx.createLinearGradient(0, TILE_SIZE * 1.12, 0, TILE_SIZE * 1.58);
  wallShadow.addColorStop(0, "rgba(0,0,0,0.45)");
  wallShadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = wallShadow;
  ctx.fillRect(TILE_SIZE, TILE_SIZE * 1.12, worldW - TILE_SIZE * 2, TILE_SIZE * 0.46);

  // 4. Side & Bottom Beveled Cavern Walls
  // Left beveled rock wall (tx = 0)
  ctx.fillStyle = "#2b231d";
  ctx.fillRect(0, TILE_SIZE * 0.48, TILE_SIZE, worldH - TILE_SIZE * 0.48);
  ctx.fillStyle = "#453930";
  ctx.fillRect(TILE_SIZE - 6, TILE_SIZE * 0.48, 6, worldH - TILE_SIZE * 1.48);
  // Right beveled rock wall (tx = MINES_W - 1)
  ctx.fillStyle = "#211a15";
  ctx.fillRect(worldW - TILE_SIZE, TILE_SIZE * 0.48, TILE_SIZE, worldH - TILE_SIZE * 0.48);
  ctx.fillStyle = "#14100d";
  ctx.fillRect(worldW - TILE_SIZE, TILE_SIZE * 0.48, 5, worldH - TILE_SIZE * 1.48);
  // Bottom perimeter rock wall (leaving sunlit exit archway at tx = 12..14)
  ctx.fillStyle = "#29211b";
  ctx.fillRect(0, worldH - TILE_SIZE, 12 * TILE_SIZE, TILE_SIZE);
  ctx.fillRect(15 * TILE_SIZE, worldH - TILE_SIZE, (MINES_W - 15) * TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = "#3f342c";
  ctx.fillRect(TILE_SIZE, worldH - TILE_SIZE, 11 * TILE_SIZE, 6);
  ctx.fillRect(15 * TILE_SIZE, worldH - TILE_SIZE, (MINES_W - 16) * TILE_SIZE, 6);

  // Sunlit Exit Archway at bottom (tx = 12..14)
  const exX = 12 * TILE_SIZE;
  const exY = (MINES_H - 1) * TILE_SIZE;
  ctx.fillStyle = "#5c4a38";
  ctx.fillRect(exX, exY, 3 * TILE_SIZE, TILE_SIZE);
  const exitGlow = ctx.createLinearGradient(0, exY - 10, 0, exY + TILE_SIZE);
  exitGlow.addColorStop(0, "rgba(255, 224, 130, 0)");
  exitGlow.addColorStop(1, "rgba(255, 224, 130, 0.32)");
  ctx.fillStyle = exitGlow;
  ctx.fillRect(exX, exY - 10, 3 * TILE_SIZE, TILE_SIZE + 10);
  // Timber exit posts
  ctx.fillStyle = "#6e4423";
  ctx.fillRect(exX - 4, exY - 6, 8, TILE_SIZE + 6);
  ctx.fillRect(exX + 3 * TILE_SIZE - 4, exY - 6, 8, TILE_SIZE + 6);

  // 5. Timber Wall Support Pillars & Flickering Warm Lanterns along North Wall
  const postCols = [3, 8, 13, 18, 22];
  for (let i = 0; i < postCols.length; i++) {
    const px = postCols[i] * TILE_SIZE + TILE_SIZE * 0.35;
    const py = TILE_SIZE * 0.28;
    // Timber beam + shaded right face
    ctx.fillStyle = "#6e4423";
    ctx.fillRect(px, py, 9, TILE_SIZE * 0.92);
    ctx.fillStyle = "#472a13";
    ctx.fillRect(px + 7, py, 4, TILE_SIZE * 0.92);
    ctx.fillStyle = "#5c361a";
    ctx.fillRect(px - 4, py, 19, 6);

    // Warm wall lantern with radial pool of light
    const flicker = 0.8 + Math.sin(time * 6.5 + i * 1.9) * 0.18;
    const lx = px + 4.5, ly = py + 18;
    const lGrad = ctx.createRadialGradient(lx, ly + 8, 2, lx, ly + 12, 48);
    lGrad.addColorStop(0, `rgba(255, 195, 80, ${(0.28 * flicker).toFixed(2)})`);
    lGrad.addColorStop(1, "rgba(255, 160, 40, 0)");
    ctx.fillStyle = lGrad;
    ctx.beginPath();
    ctx.arc(lx, ly + 12, 48, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffe082";
    ctx.fillRect(lx - 3, ly, 6, 7);
    ctx.strokeStyle = "#2b1b0e";
    ctx.lineWidth = 1;
    ctx.strokeRect(lx - 3, ly, 6, 7);
  }

  // 6. Parked 2.5D Ore Cart safely against north-left wall (tx = 1.6, ty = 1.15 - rock-free zone!)
  const cx = 1.65 * TILE_SIZE, cy = 1.05 * TILE_SIZE;
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.beginPath(); ctx.ellipse(cx + 18, cy + 20, 18, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#4a5259";
  ctx.fillRect(cx + 2, cy + 5, 28, 13);
  ctx.fillStyle = "#2c3136";
  ctx.beginPath();
  ctx.moveTo(cx + 30, cy + 5); ctx.lineTo(cx + 36, cy + 1);
  ctx.lineTo(cx + 36, cy + 14); ctx.lineTo(cx + 30, cy + 18);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#f5c518";
  ctx.beginPath(); ctx.arc(cx + 12, cy + 5, 5, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "#00bcd4";
  ctx.beginPath(); ctx.arc(cx + 21, cy + 5, 4, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "#6c757d";
  ctx.fillRect(cx + 1, cy + 3, 30, 3);
  // Iron wheels
  ctx.fillStyle = "#1b1f23";
  ctx.beginPath();
  ctx.arc(cx + 8, cy + 19, 3.5, 0, Math.PI * 2);
  ctx.arc(cx + 24, cy + 19, 3.5, 0, Math.PI * 2);
  ctx.fill();
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
  ctx.fillStyle = "#14100d"; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const s = dpr * zoom;
  ctx.setTransform(s, 0, 0, s, -cx * s, -cy * s);

  drawMinesArchitecture(ctx, g.time);

  const entities = [];

  const nowMs = Date.now();
  let needsRespawnPoll = false;
  for (const rock of Object.values(remoteRocks)) {
    if (rock && rock.hp <= 0 && rock.respawnAt > 0 && nowMs >= rock.respawnAt) {
      needsRespawnPoll = true;
      break;
    }
  }
  if (needsRespawnPoll && nowMs - lastForcedRespawnPollAt > 900) {
    lastForcedRespawnPollAt = nowMs;
    fetchMinesState();
  }

  // Draw 2.5D faceted rocks (with falling-from-mine-ceiling spawn effect)
  for (const rock of Object.values(remoteRocks)) {
    if (!rock || rock.hp <= 0) continue;
    const rx = rock.x * TILE_SIZE;
    const ry = rock.y * TILE_SIZE;
    const anim = rockSpawnAnims.get(rock.id);
    const hpRatio = rock.maxHp > 0 ? rock.hp / rock.maxHp : 1;
    const seed = (rock.x * 7 + rock.y * 13) % 10;

    entities.push({
      y: (rock.y + 1) * TILE_SIZE,
      draw: () => {
        const cxRock = rx + TILE_SIZE / 2;
        const cyRock = ry + TILE_SIZE / 2 - 2;
        const groundY = ry + TILE_SIZE - 4;

        if (anim) {
          const tNorm = (nowMs - anim.startedAt) / anim.durationMs;
          if (tNorm >= 1) {
            rockSpawnAnims.delete(rock.id);
          } else {
            const fallEnd = 0.70;
            const fallStart = 0.16;

            if (tNorm >= fallEnd && !anim.landed) {
              anim.landed = true;
              playRockLand();
            }

            if (tNorm < fallStart) {
              const p = tNorm / fallStart;
              ctx.save();
              ctx.fillStyle = `rgba(0,0,0,${0.12 + p * 0.24})`;
              ctx.beginPath();
              ctx.ellipse(cxRock, groundY, 4 + p * 8, 2 + p * 3, 0, 0, Math.PI * 2);
              ctx.fill();

              for (let i = 0; i < 4; i++) {
                const px = cxRock + Math.sin(i * 2.4 + 0.6) * (6 + p * 4);
                const py = cyRock - 150 + p * 145 - i * 18;
                ctx.fillStyle = "rgba(180,165,150,0.65)";
                ctx.beginPath();
                ctx.arc(px, py, 1.8, 0, Math.PI * 2);
                ctx.fill();
              }
              ctx.restore();
              return;
            }

            if (tNorm < fallEnd) {
              const p = (tNorm - fallStart) / (fallEnd - fallStart);
              const eased = p * p;
              const dropY = (1 - eased) * 195;

              ctx.save();
              ctx.fillStyle = `rgba(0,0,0,${0.2 + eased * 0.25})`;
              ctx.beginPath();
              ctx.ellipse(cxRock, groundY, 7 + eased * 6, 3 + eased * 2.5, 0, 0, Math.PI * 2);
              ctx.fill();

              ctx.strokeStyle = `rgba(210,196,182,${0.32 * (1 - p * 0.35)})`;
              ctx.lineWidth = 1.6;
              for (let sIdx = -1; sIdx <= 1; sIdx++) {
                const sx = cxRock + sIdx * 7;
                ctx.beginPath();
                ctx.moveTo(sx, cyRock - dropY - 8);
                ctx.lineTo(sx, cyRock - dropY - 26 - eased * 18);
                ctx.stroke();
              }

              ctx.globalAlpha = Math.min(1, 0.25 + p * 1.15);
              ctx.translate(cxRock, cyRock - dropY);
              ctx.scale(0.92 + p * 0.08, 1.14 - p * 0.14);
              draw3DOreRock(ctx, 0, 0, rock.tier, hpRatio, g.time, seed);
              ctx.restore();
              return;
            }

            const imp = (tNorm - fallEnd) / (1 - fallEnd);
            const bounce = Math.sin(imp * Math.PI) * (1 - imp) * 7;
            const squash = imp < 0.35 ? 1 - Math.sin((imp / 0.35) * Math.PI) * 0.22 : 1;
            const stretchX = imp < 0.35 ? 1 + Math.sin((imp / 0.35) * Math.PI) * 0.2 : 1;

            ctx.save();
            ctx.strokeStyle = `rgba(220,205,185,${(1 - imp) * 0.58})`;
            ctx.lineWidth = 2.2 * (1 - imp * 0.5);
            ctx.beginPath();
            ctx.ellipse(cxRock, groundY, 10 + imp * 22, 4 + imp * 9, 0, 0, Math.PI * 2);
            ctx.stroke();

            for (const sp of anim.sparks) {
              const r = sp.dist * imp;
              const px = cxRock + Math.cos(sp.angle) * r;
              const py = groundY + Math.sin(sp.angle) * (r * 0.48) - Math.sin(imp * Math.PI) * 7;
              ctx.globalAlpha = 1 - imp;
              ctx.fillStyle = sp.tone;
              ctx.beginPath();
              ctx.arc(px, py, sp.size * (1 - imp * 0.35), 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1;

            ctx.fillStyle = "rgba(0,0,0,0.35)";
            ctx.beginPath();
            ctx.ellipse(cxRock + 3, groundY, 13, 5, 0.1, 0, Math.PI * 2);
            ctx.fill();

            ctx.translate(cxRock, cyRock - bounce);
            ctx.scale(stretchX, squash);
            draw3DOreRock(ctx, 0, 0, rock.tier, hpRatio, g.time, seed);
            ctx.restore();
            return;
          }
        }

        // Normal resting 3D rock with cast down-right shadow
        ctx.fillStyle = "rgba(0,0,0,0.38)";
        ctx.beginPath();
        ctx.ellipse(cxRock + 3, groundY, 13, 5, 0.1, 0, Math.PI * 2);
        ctx.fill();

        draw3DOreRock(ctx, cxRock, cyRock, rock.tier, hpRatio, g.time, seed);

        // HP bar if damaged
        if (rock.hp < rock.maxHp) {
          const barW = 24, barH = 4;
          const bx = rx + (TILE_SIZE - barW) / 2;
          const by = ry + 1;
          ctx.fillStyle = "rgba(0,0,0,0.65)";
          ctx.fillRect(bx, by, barW, barH);
          const fillW = Math.max(2, (barW * rock.hp) / rock.maxHp);
          ctx.fillStyle = "#59d17a";
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
  for (const npc of MINES_NPCS) {
    drawCharacterNameTag(ctx, npc.name, npc.x * TILE_SIZE, npc.y * TILE_SIZE - 54, "#f5c518");
    const bubble = getNpcBubble(npc, nowMs);
    if (bubble) {
      drawSpeechBubble(ctx, bubble.text, npc.x * TILE_SIZE, npc.y * TILE_SIZE - 66, bubble.alpha);
    }
  }

  for (const o of g.others) {
    if ((o.p.room || "world") !== "mines") continue;
    drawCharacterNameTag(ctx, o.p.name || "?", o.p.dx * TILE_SIZE, o.p.dy * TILE_SIZE - 54);
  }
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
