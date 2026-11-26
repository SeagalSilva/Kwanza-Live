// Walkable 2.5D Forest room (Floresta de Corte de Madeira) reached via the Town's eastern map exit.
// Features volumetric 2.5D choppable trees (Pine, Oak, Mahogany, Elder), stumps during respawn,
// Lumberjack NPC guide, falling leaf chop FX, and a western return trail back to Town.
import { TILE } from "../config.js";
import { S, energy } from "../state.js";
import { t } from "../i18n.js";
import { playEnterBuilding, playAxeHit, playTreeFall, playPreciousGem } from "../systems/audio.js";
import { toast } from "../ui/toast.js";
import { drawCharacter } from "./character.js";
import { drawSpeechBubble } from "./renderer.js";
import { commit, savePath } from "../systems/db.js";
import { increment } from "../firebase.js";
import { itemIcon, itemName } from "../data/items.js";
import { getForestExit } from "./map.js";
import { hash2 } from "../utils.js";

export const FOREST_W = 26;
export const FOREST_H = 16;
export const FOREST_SPAWN = { x: 2.6, y: 8.0 };
export const FOREST_EXIT = { x: 0.7, y: 8.0 };

const TILE_SIZE = TILE;
const UI_FONT = "system-ui,-apple-system,Segoe UI,Roboto,sans-serif";

let syncTimer = null;
let remoteTrees = {};
let treeConfigs = {};
let lastForcedRespawnPollAt = 0;
let forestEnteredAt = 0;
let worldReturnedAt = 0;

const prevTreeHp = new Map();
const seenSpawnStamp = new Map();
const treeRegrowAnims = new Map(); // treeId -> { startedAt, durationMs }
const treeChopShake = new Map();   // treeId -> { startedAt, durationMs, leaves }

export const FOREST_NPCS = [
  {
    id: "npc_lumberjack",
    name: "Mestre Lenhador",
    x: 4.2,
    y: 4.6,
    dir: "down",
    look: { skin: 1, hairColor: 1, hairStyle: 3, shirt: 4 },
    lines: ["forest.npc1", "forest.npc2", "forest.npc3", "forest.npc4"],
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

function triggerTreeChopFx(treeId, felled = false) {
  const leaves = [];
  const count = felled ? 16 : 7;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
    leaves.push({
      vx: Math.cos(angle) * (14 + Math.random() * 20),
      vy: -14 - Math.random() * 20,
      size: 2.2 + Math.random() * 2.2,
      tone: i % 3 === 0 ? "#43a047" : i % 3 === 1 ? "#81c784" : "#8d6e63"
    });
  }
  treeChopShake.set(treeId, {
    startedAt: Date.now(),
    durationMs: felled ? 720 : 380,
    felled,
    leaves
  });
}

export function startForestSync() {
  stopForestSync();
  prevTreeHp.clear();
  seenSpawnStamp.clear();
  treeRegrowAnims.clear();
  treeChopShake.clear();
  fetchForestState();
  syncTimer = setInterval(fetchForestState, 3000);
}

export function stopForestSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

async function fetchForestState() {
  try {
    const res = await fetch("/api/forest/state");
    if (!res.ok) return;
    const data = await res.json();
    const nextTrees = data.trees || {};
    const now = Date.now();
    const serverNow = Number(data.serverNow) || now;

    for (const tree of Object.values(nextTrees)) {
      if (!tree) continue;
      const hadPrev = prevTreeHp.has(tree.id);
      const oldHp = prevTreeHp.get(tree.id);
      const spawnStamp = Number(tree.spawnedAt) || 0;
      const freshSpawn =
        spawnStamp > 0 &&
        serverNow - spawnStamp < 3200 &&
        seenSpawnStamp.get(tree.id) !== spawnStamp;

      if ((hadPrev && oldHp <= 0 && tree.hp > 0) || freshSpawn) {
        if (spawnStamp > 0) seenSpawnStamp.set(tree.id, spawnStamp);
        treeRegrowAnims.set(tree.id, { startedAt: now, durationMs: 650 });
      }
      prevTreeHp.set(tree.id, tree.hp);
    }

    remoteTrees = nextTrees;
    treeConfigs = data.treeConfigs || {};
  } catch (_) {}
}

export function isForestBlocked(tx, ty) {
  // Border woodland wall except the western return trail (tx === 0, ty === 7 || ty === 8)
  if (tx < 1 || ty < 1 || tx >= FOREST_W - 1 || ty >= FOREST_H - 1) {
    if (tx === 0 && (ty === 7 || ty === 8)) return false;
    return true;
  }
  // Lumberjack log pile & campfire at (2, 3) and (3, 3)
  if (ty === 3 && (tx === 2 || tx === 3)) return true;

  for (const tree of Object.values(remoteTrees)) {
    if (tree && Math.floor(tree.x) === tx && Math.floor(tree.y) === ty) {
      return true;
    }
  }
  return false;
}

export function canAutoEnterForest() {
  return Date.now() - worldReturnedAt > 900;
}

export function enterForestRoom(me, exitEditFn) {
  if (exitEditFn) exitEditFn();
  S.room = "forest";
  forestEnteredAt = Date.now();
  me.x = FOREST_SPAWN.x;
  me.y = FOREST_SPAWN.y;
  me.dir = "right";
  me.target = null;
  me.pending = null;
  playEnterBuilding();
  startForestSync();
  toast(t("forest.welcomeRoom"), "good");
}

export function exitForestRoom(me) {
  stopForestSync();
  S.room = "world";
  worldReturnedAt = Date.now();
  const exit = getForestExit();
  me.x = exit.returnX - 1.8;
  me.y = exit.returnY;
  me.dir = "left";
  me.target = null;
  me.pending = null;
  playEnterBuilding();
}

export function tickForestAutoExit(me) {
  if (S.room !== "forest") return;
  if (Date.now() - forestEnteredAt < 900) return;
  if (me.x <= 0.85 && me.y >= 6.6 && me.y <= 9.4) {
    exitForestRoom(me);
  }
}

export function computeForestFocus(me) {
  for (const tree of Object.values(remoteTrees)) {
    if (!tree || tree.hp <= 0) continue;
    const dist = Math.hypot(me.x - (tree.x + 0.5), me.y - (tree.y + 0.5));
    if (dist < 1.85) {
      return { kind: "tree", treeId: tree.id, tree };
    }
  }
  for (const npc of FOREST_NPCS) {
    if (Math.hypot(me.x - npc.x, me.y - npc.y) < 2.0) {
      return { kind: "npc", npc };
    }
  }
  if (Math.hypot(me.x - FOREST_EXIT.x, me.y - FOREST_EXIT.y) < 1.9) {
    return { kind: "exit" };
  }
  return null;
}

export function focusLabelForest(f) {
  if (!f) return null;
  if (f.kind === "exit") return t("forest.exitToTown");
  if (f.kind === "npc") return `${t("act.inspect")} ${f.npc.name}`;
  if (f.kind === "tree") {
    const cfg = treeConfigs[f.tree.tier] || {};
    return `🪓 ${t("forest.chopVerb")} (${cfg.name || f.tree.tier}) [⚡${cfg.cost || 3}]`;
  }
  return null;
}

export async function performForestAction(f, handleLeaveForest) {
  if (!f) return;
  if (f.kind === "exit") {
    handleLeaveForest();
    return;
  }
  if (f.kind === "npc") {
    const npc = FOREST_NPCS.find((n) => n.id === f.npc.id);
    if (npc) {
      const cur = npcSpeechOverrides.get(npc.id);
      const nextIdx = cur ? (cur.idx + 1) % npc.lines.length : 0;
      npcSpeechOverrides.set(npc.id, { idx: nextIdx, shownAt: Date.now() });
    }
    return;
  }
  if (f.kind === "tree") {
    const tree = remoteTrees[f.treeId];
    if (!tree || tree.hp <= 0) return;
    const cfg = treeConfigs[tree.tier] || { cost: 3 };
    const curEnergy = energy().current;

    if (curEnergy < cfg.cost) {
      toast(t("mines.notEnoughEnergy"), "bad");
      return;
    }

    playAxeHit();

    try {
      const res = await fetch("/api/forest/chop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treeId: tree.id,
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

      remoteTrees[tree.id] = data.tree;
      prevTreeHp.set(tree.id, data.tree.hp);
      triggerTreeChopFx(tree.id, !!data.felled);

      const nextEnergy = Math.max(0, curEnergy - data.energyCost);
      S.save.energy.current = nextEnergy;
      await commit({
        [savePath(S.uid, "energy/current")]: nextEnergy
      });

      if (data.felled) {
        playTreeFall();
        playPreciousGem();
        const loot = data.loot || {};
        const updates = {};
        const msgs = [];

        if (loot.pp > 0) {
          updates[savePath(S.uid, "wallet/pp")] = increment(loot.pp);
          msgs.push(`+${loot.pp} PP`);
        }
        if (loot.woods) {
          for (const [woodId, qty] of Object.entries(loot.woods)) {
            if (qty > 0) {
              updates[savePath(S.uid, `inv/${woodId}`)] = increment(qty);
              msgs.push(`+${qty} ${itemIcon(woodId)} ${itemName(woodId)}`);
            }
          }
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

        toast(t("forest.treeFelled", { loot: msgs.join(" · ") }), "good", 5000);
      }
    } catch (_) {
      toast(t("msg.error"), "bad");
    }
  }
}

export function handleForestTap(wx, wy, me) {
  const tx = Math.floor(wx), ty = Math.floor(wy);
  if (tx <= 1 && (ty === 7 || ty === 8)) {
    me.target = { x: FOREST_EXIT.x, y: FOREST_EXIT.y };
    me.pending = { kind: "exit" };
    return;
  }
  for (const tree of Object.values(remoteTrees)) {
    if (!tree || tree.hp <= 0) continue;
    if (Math.floor(tree.x) === tx && Math.floor(tree.y) === ty) {
      const dx = me.x - (tree.x + 0.5);
      const dy = me.y - (tree.y + 0.5);
      const len = Math.hypot(dx, dy) || 1;
      me.target = { x: tree.x + 0.5 + (dx / len) * 1.15, y: tree.y + 0.5 + (dy / len) * 1.15 };
      me.pending = { kind: "tree", treeId: tree.id, tree };
      return;
    }
  }
  me.target = { x: wx, y: wy };
  me.pending = null;
}

export function tickForestPending(me, handleLeaveForest) {
  const p = me.pending;
  if (!p) return;
  if (p.kind === "exit") {
    if (Math.hypot(me.x - FOREST_EXIT.x, me.y - FOREST_EXIT.y) <= 1.2) {
      me.pending = null;
      me.target = null;
      handleLeaveForest();
    }
    return;
  }
  if (p.kind === "tree") {
    const tree = remoteTrees[p.treeId];
    if (!tree || tree.hp <= 0) {
      me.pending = null;
      return;
    }
    if (Math.hypot(me.x - (tree.x + 0.5), me.y - (tree.y + 0.5)) <= 1.75) {
      me.pending = null;
      me.target = null;
      performForestAction({ kind: "tree", treeId: tree.id, tree }, handleLeaveForest);
    }
  }
}

// ── 2.5D Rendering ──────────────────────────────────────────

function drawForestFloorAndPerimeter(ctx, time) {
  const worldW = FOREST_W * TILE_SIZE;
  const worldH = FOREST_H * TILE_SIZE;

  // 1. Lush forest moss/grass floor tiles
  for (let ty = 0; ty < FOREST_H; ty++) {
    for (let tx = 0; tx < FOREST_W; tx++) {
      const x = tx * TILE_SIZE;
      const y = ty * TILE_SIZE;
      const isTrail =
        (ty === 7 || ty === 8) && tx <= 6 ||
        (tx >= 5 && tx <= 18 && ty === 8 && hash2(tx, ty) < 0.85);
      if (isTrail) {
        ctx.fillStyle = (tx + ty) % 2 ? "#b8935c" : "#ae8a54";
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        if (hash2(tx * 3, ty * 5) < 0.38) {
          ctx.fillStyle = "rgba(55, 36, 16, 0.14)";
          ctx.fillRect(x + 7, y + 11, 4, 3);
        }
      } else {
        ctx.fillStyle = (tx + ty) % 2 ? "#478541" : "#427c3d";
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        const h = hash2(tx * 11, ty * 17);
        if (h < 0.1) {
          ctx.strokeStyle = "#2f612b";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x + 11, y + 22);
          ctx.lineTo(x + 13, y + 14);
          ctx.moveTo(x + 15, y + 22);
          ctx.lineTo(x + 17, y + 15);
          ctx.stroke();
        } else if (h < 0.14) {
          ctx.fillStyle = h < 0.12 ? "#fff3b0" : "#b8f2e6";
          ctx.beginPath();
          ctx.arc(x + 9 + hash2(tx, ty) * 14, y + 9 + hash2(ty, tx) * 14, 1.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // 2. Lumberjack camp props (stacked logs + warm campfire at tx = 2..3, ty = 3)
  const campX = 2.0 * TILE_SIZE;
  const campY = 3.0 * TILE_SIZE;
  // Shadow & logs
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(campX + 18, campY + 26, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < (row === 0 ? 3 : 2); i++) {
      const lx = campX + 5 + i * 9 + row * 4.5;
      const ly = campY + 19 - row * 6;
      ctx.fillStyle = "#6d4221";
      ctx.fillRect(lx, ly, 8, 6);
      ctx.fillStyle = "#c89b67";
      ctx.beginPath(); ctx.arc(lx + 4, ly + 3, 3.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Small glowing campfire next to log pile
  const fx = campX + 46, fy = campY + 21;
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(fx, fy + 4, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#5c361a";
  ctx.fillRect(fx - 7, fy + 1, 14, 3);
  const flicker = 0.8 + Math.sin(time * 9) * 0.2;
  const fGlow = ctx.createRadialGradient(fx, fy - 4, 2, fx, fy - 4, 34);
  fGlow.addColorStop(0, `rgba(255, 168, 52, ${(0.36 * flicker).toFixed(2)})`);
  fGlow.addColorStop(1, "rgba(255, 120, 20, 0)");
  ctx.fillStyle = fGlow;
  ctx.beginPath(); ctx.arc(fx, fy - 4, 34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ff7043";
  ctx.beginPath();
  ctx.moveTo(fx - 5, fy + 2); ctx.lineTo(fx, fy - 11 * flicker); ctx.lineTo(fx + 5, fy + 2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#ffd54f";
  ctx.beginPath();
  ctx.moveTo(fx - 2.5, fy + 2); ctx.lineTo(fx, fy - 6 * flicker); ctx.lineTo(fx + 2.5, fy + 2);
  ctx.closePath(); ctx.fill();

  // 3. Western Exit Trail Gateway back to Town (tx = 0, ty = 7..8)
  const exY = 7 * TILE_SIZE;
  const exitGlow = ctx.createLinearGradient(0, exY, TILE_SIZE * 1.4, exY);
  exitGlow.addColorStop(0, "rgba(255, 226, 138, 0.34)");
  exitGlow.addColorStop(1, "rgba(255, 226, 138, 0)");
  ctx.fillStyle = exitGlow;
  ctx.fillRect(0, exY, TILE_SIZE * 1.4, TILE_SIZE * 2);

  // Wooden archway posts & signpost at exit
  ctx.fillStyle = "#613a1c";
  ctx.fillRect(4, exY - 6, 7, 16);
  ctx.fillRect(4, exY + TILE_SIZE * 2 - 10, 7, 16);
  ctx.fillStyle = "#82512a";
  ctx.fillRect(2, exY - 8, 22, 6);
  // Directional arrow pulse on the ground
  const arrowSlide = Math.sin(time * 3.5) * 3;
  ctx.fillStyle = "rgba(255, 240, 170, 0.85)";
  ctx.beginPath();
  ctx.moveTo(14 + arrowSlide, exY + TILE_SIZE);
  ctx.lineTo(24 + arrowSlide, exY + TILE_SIZE - 7);
  ctx.lineTo(24 + arrowSlide, exY + TILE_SIZE + 7);
  ctx.closePath();
  ctx.fill();

  // 4. Dense outer woodland border trees (excluding the western exit opening ty=7..8)
  for (let ty = 0; ty < FOREST_H; ty++) {
    for (let tx = 0; tx < FOREST_W; tx++) {
      const border = tx === 0 || ty === 0 || tx === FOREST_W - 1 || ty === FOREST_H - 1;
      if (!border) continue;
      if (tx === 0 && (ty === 7 || ty === 8)) continue;
      const cx = (tx + 0.5) * TILE_SIZE;
      const by = (ty + 1) * TILE_SIZE;
      ctx.fillStyle = "rgba(8, 16, 10, 0.24)";
      ctx.beginPath(); ctx.ellipse(cx + 4, by - 2, 15, 5, 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#4d2f18";
      ctx.fillRect(cx - 3.5, by - 16, 7, 16);
      ctx.fillStyle = "#1d5220";
      ctx.beginPath(); ctx.arc(cx + 2, by - 23, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2b7330";
      ctx.beginPath(); ctx.arc(cx, by - 26, 12.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#439c48";
      ctx.beginPath(); ctx.arc(cx - 4, by - 30, 7, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Exit signpost pill
  ctx.save();
  ctx.font = `600 10px ${UI_FONT}`;
  const label = `← ${t("forest.backToTown")}`;
  const pw = ctx.measureText(label).width + 12;
  ctx.fillStyle = "rgba(12, 22, 16, 0.82)";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(6, exY - 26, pw, 18, 9);
  else ctx.rect(6, exY - 26, pw, 18);
  ctx.fill();
  ctx.strokeStyle = "#f5c518";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 6 + pw / 2, exY - 17);
  ctx.restore();

  void worldW;
  void worldH;
}

function draw3DForestTree(ctx, cx, groundY, tier, hpRatio, time, seed, scale = 1, shakeX = 0) {
  ctx.save();
  ctx.translate(cx + shakeX, groundY);
  ctx.scale(scale, scale);

  // Diagonal ground shadow
  ctx.fillStyle = "rgba(8, 15, 10, 0.28)";
  ctx.beginPath();
  ctx.ellipse(6, -1, tier === "elder" ? 20 : 16, 6, 0.14, 0, Math.PI * 2);
  ctx.fill();

  const sway = Math.sin(time * 2.1 + seed) * 1.4;

  if (tier === "pine") {
    // Shaded pine trunk
    ctx.fillStyle = "#543419";
    ctx.fillRect(-3.5, -20, 7, 20);
    ctx.fillStyle = "#794c27";
    ctx.fillRect(-3.5, -20, 3.8, 20);
    // 3 tiered 2.5D evergreen cones
    const tiers = [
      { y: -16, w: 15, h: 17, dark: "#1c5429", mid: "#287539", hi: "#3c9e52" },
      { y: -27, w: 12.5, h: 16, dark: "#205f2f", mid: "#2f8543", hi: "#47b05f" },
      { y: -38, w: 9.5, h: 14, dark: "#246c36", mid: "#36994d", hi: "#54c76e" }
    ];
    for (const c of tiers) {
      ctx.fillStyle = c.dark;
      ctx.beginPath();
      ctx.moveTo(sway, c.y - c.h);
      ctx.lineTo(c.w, c.y);
      ctx.lineTo(-c.w, c.y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = c.mid;
      ctx.beginPath();
      ctx.moveTo(sway, c.y - c.h);
      ctx.lineTo(2, c.y);
      ctx.lineTo(-c.w, c.y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = c.hi;
      ctx.beginPath();
      ctx.moveTo(sway, c.y - c.h);
      ctx.lineTo(-3, c.y - 2);
      ctx.lineTo(-c.w + 2, c.y - 1);
      ctx.closePath();
      ctx.fill();
    }
  } else if (tier === "oak") {
    // Sturdy oak trunk + root flare
    ctx.fillStyle = "#4d2f16";
    ctx.fillRect(-4.5, -20, 9, 20);
    ctx.fillStyle = "#784c27";
    ctx.fillRect(-4.5, -20, 5, 20);
    ctx.fillStyle = "#4d2f16";
    ctx.fillRect(-7, -4, 14, 4);
    // Broad 3-tone oak crown
    ctx.fillStyle = "#225c24";
    ctx.beginPath(); ctx.arc(3 + sway * 0.5, -26, 15.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2f8034";
    ctx.beginPath(); ctx.arc(sway, -30, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#439f49";
    ctx.beginPath(); ctx.arc(-6 + sway, -33, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#66c76b";
    ctx.beginPath(); ctx.arc(-7 + sway, -37, 5.5, 0, Math.PI * 2); ctx.fill();
  } else if (tier === "mahogany") {
    // Warm reddish mahogany trunk
    ctx.fillStyle = "#5c2516";
    ctx.fillRect(-5, -22, 10, 22);
    ctx.fillStyle = "#8f3f27";
    ctx.fillRect(-5, -22, 5.5, 22);
    // Layered tropical mahogany canopy + amber blossoms
    ctx.fillStyle = "#1a4e36";
    ctx.beginPath(); ctx.arc(3 + sway * 0.5, -27, 16.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#236e4b";
    ctx.beginPath(); ctx.arc(sway, -31, 15.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#339467";
    ctx.beginPath(); ctx.arc(-5 + sway, -35, 10.5, 0, Math.PI * 2); ctx.fill();
    // Warm crimson/gold canopy accents
    ctx.fillStyle = "#e67e22";
    ctx.beginPath();
    ctx.arc(-6 + sway, -30, 2.4, 0, Math.PI * 2);
    ctx.arc(5 + sway, -35, 2.2, 0, Math.PI * 2);
    ctx.arc(-1 + sway, -24, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Elder Ancient Tree: thick silver-bark trunk, glowing turquoise/gold spirit leaves
    ctx.fillStyle = "#45403b";
    ctx.fillRect(-6, -24, 12, 24);
    ctx.fillStyle = "#787066";
    ctx.fillRect(-6, -24, 6.5, 24);
    // Glowing rune core on trunk
    const glow = 0.65 + Math.sin(time * 4 + seed) * 0.3;
    ctx.fillStyle = `rgba(245, 197, 24, ${glow.toFixed(2)})`;
    ctx.fillRect(-2, -14, 4, 6);

    // Aura halo
    ctx.fillStyle = `rgba(80, 227, 194, ${(0.18 * glow).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(sway, -33, 21, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "#16574c";
    ctx.beginPath(); ctx.arc(3 + sway * 0.5, -29, 17.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1f8574";
    ctx.beginPath(); ctx.arc(sway, -34, 16.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#38bfa7";
    ctx.beginPath(); ctx.arc(-5 + sway, -38, 11, 0, Math.PI * 2); ctx.fill();
    // Golden spirit blossoms
    ctx.fillStyle = "#ffe066";
    ctx.beginPath();
    ctx.arc(-7 + sway, -33, 2.5, 0, Math.PI * 2);
    ctx.arc(6 + sway, -37, 2.5, 0, Math.PI * 2);
    ctx.arc(0 + sway, -43, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Axe chop notch marks when damaged
  if (hpRatio < 1) {
    ctx.fillStyle = "#2b1608";
    ctx.fillRect(-4, -9, 5, 3);
    if (hpRatio < 0.55) {
      ctx.fillRect(0, -12, 4.5, 3);
    }
  }

  ctx.restore();
}

function drawTreeStump(ctx, cx, groundY, tier) {
  ctx.save();
  ctx.translate(cx, groundY);
  ctx.fillStyle = "rgba(0,0,0,0.26)";
  ctx.beginPath(); ctx.ellipse(2, -1, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = tier === "mahogany" ? "#5c2516" : tier === "elder" ? "#5a534c" : "#5a381d";
  ctx.fillRect(-6, -9, 12, 9);
  ctx.fillStyle = "#d7b377";
  ctx.beginPath(); ctx.ellipse(0, -9, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#8a5f32";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, -9, 3, 1.4, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

export function renderForestRoom(ctx, view, g, { sanitizeLook }) {
  const { cw, ch, zoom, dpr } = view;
  const vw = cw / zoom, vh = ch / zoom;
  const worldW = FOREST_W * TILE_SIZE, worldH = FOREST_H * TILE_SIZE;

  let cx = g.me.x * TILE_SIZE - vw / 2, cy = g.me.y * TILE_SIZE - vh / 2;
  cx = worldW <= vw ? (worldW - vw) / 2 : Math.max(0, Math.min(worldW - vw, cx));
  cy = worldH <= vh ? (worldH - vh) / 2 : Math.max(0, Math.min(worldH - vh, cy));
  view.camX = cx; view.camY = cy;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#102116";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const s = dpr * zoom;
  ctx.setTransform(s, 0, 0, s, -cx * s, -cy * s);

  drawForestFloorAndPerimeter(ctx, g.time);

  const nowMs = Date.now();
  let needsRespawnPoll = false;
  for (const tree of Object.values(remoteTrees)) {
    if (tree && tree.hp <= 0 && tree.respawnAt > 0 && nowMs >= tree.respawnAt) {
      needsRespawnPoll = true;
      break;
    }
  }
  if (needsRespawnPoll && nowMs - lastForcedRespawnPollAt > 900) {
    lastForcedRespawnPollAt = nowMs;
    fetchForestState();
  }

  const entities = [];

  for (const tree of Object.values(remoteTrees)) {
    if (!tree) continue;
    const txPx = tree.x * TILE_SIZE;
    const tyPx = tree.y * TILE_SIZE;
    const cxTree = txPx + TILE_SIZE / 2;
    const groundY = tyPx + TILE_SIZE - 3;

    entities.push({
      y: (tree.y + 1) * TILE_SIZE,
      draw: () => {
        const shake = treeChopShake.get(tree.id);
        let shakeOffsetX = 0;

        if (tree.hp <= 0) {
          drawTreeStump(ctx, cxTree, groundY, tree.tier);
          // Falling leaves burst right after felling
          if (shake) {
            const p = (nowMs - shake.startedAt) / shake.durationMs;
            if (p >= 1) {
              treeChopShake.delete(tree.id);
            } else {
              ctx.save();
              for (const lf of shake.leaves) {
                const lx = cxTree + lf.vx * p * 1.4;
                const ly = groundY - 18 + lf.vy * p + p * p * 36;
                ctx.globalAlpha = Math.max(0, 1 - p);
                ctx.fillStyle = lf.tone;
                ctx.beginPath();
                ctx.arc(lx, ly, lf.size, 0, Math.PI * 2);
                ctx.fill();
              }
              ctx.restore();
            }
          }
          return;
        }

        let regrowScale = 1;
        const regrow = treeRegrowAnims.get(tree.id);
        if (regrow) {
          const p = (nowMs - regrow.startedAt) / regrow.durationMs;
          if (p >= 1) treeRegrowAnims.delete(tree.id);
          else regrowScale = Math.min(1.08, p * 1.15 - Math.sin(p * Math.PI) * 0.08);
        }

        if (shake) {
          const p = (nowMs - shake.startedAt) / shake.durationMs;
          if (p >= 1) {
            treeChopShake.delete(tree.id);
          } else {
            shakeOffsetX = Math.sin(p * Math.PI * 6) * (1 - p) * 3.5;
            ctx.save();
            for (const lf of shake.leaves) {
              const lx = cxTree + lf.vx * p;
              const ly = groundY - 26 + lf.vy * p + p * p * 28;
              ctx.globalAlpha = Math.max(0, 1 - p);
              ctx.fillStyle = lf.tone;
              ctx.beginPath();
              ctx.arc(lx, ly, lf.size, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
        }

        const hpRatio = tree.maxHp > 0 ? tree.hp / tree.maxHp : 1;
        const seed = (tree.x * 11 + tree.y * 19) % 12;
        draw3DForestTree(ctx, cxTree, groundY, tree.tier, hpRatio, g.time, seed, regrowScale, shakeOffsetX);

        if (tree.hp < tree.maxHp) {
          const barW = 24, barH = 4;
          const bx = txPx + (TILE_SIZE - barW) / 2;
          const by = tyPx + 1;
          ctx.fillStyle = "rgba(0,0,0,0.65)";
          ctx.fillRect(bx, by, barW, barH);
          ctx.fillStyle = "#59d17a";
          ctx.fillRect(bx, by, Math.max(2, (barW * tree.hp) / tree.maxHp), barH);
        }
      }
    });
  }

  // NPCs
  for (const npc of FOREST_NPCS) {
    entities.push({
      y: npc.y * TILE_SIZE,
      draw: () => drawCharacter(ctx, npc.x * TILE_SIZE, npc.y * TILE_SIZE, npc.look, { dir: npc.dir, phase: 0, moving: false })
    });
  }

  // Players in Forest
  const look = sanitizeLook(S.profile?.look);
  for (const o of g.others) {
    if ((o.p.room || "world") !== "forest") continue;
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
  for (const npc of FOREST_NPCS) {
    drawCharacterNameTag(ctx, npc.name, npc.x * TILE_SIZE, npc.y * TILE_SIZE - 54, "#59d17a");
    const bubble = getNpcBubble(npc, nowMs);
    if (bubble) {
      drawSpeechBubble(ctx, bubble.text, npc.x * TILE_SIZE, npc.y * TILE_SIZE - 66, bubble.alpha);
    }
  }
  for (const o of g.others) {
    if ((o.p.room || "world") !== "forest") continue;
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
