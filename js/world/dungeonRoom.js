// Walkable Forest Dungeon room ("A entrada da Dungeon" - Phase 1, 10 floors + extensible themes).
// Features real-time enemy pursuit & attacks, player HP bar, death loot dropping, and safe extraction.
import { TILE } from "../config.js";
import { S, energy } from "../state.js";
import { t, getLang } from "../i18n.js";
import {
  playEnterBuilding,
  playSwordHit,
  playPlayerHit,
  playEnemyDefeat,
  playDungeonHeal,
  playDungeonChest,
  playDungeonVictory,
  playCasinoLoss
} from "../systems/audio.js";
import { toast } from "../ui/toast.js";
import { isModalOpen } from "../ui/modal.js";
import { drawCharacter } from "./character.js";
import { drawSpeechBubble } from "./renderer.js";
import { drawDungeonEnemy, drawPlayerDungeonHpBar, drawDungeonDropBag } from "./dungeonSprites.js";
import { commit, savePath } from "../systems/db.js";
import { increment } from "../firebase.js";

export const DUNGEON_W = 22;
export const DUNGEON_H = 14;
export const DUNGEON_SPAWN = { x: 11, y: 11.4 };
export const DUNGEON_EXIT = { x: 11, y: 12.9 };
export const DUNGEON_PORTAL = { x: 11, y: 2.0 };
export const DUNGEON_SPRING = { x: 3.5, y: 7.2 };

export const DUNGEON_NPCS = [
  {
    id: "npc_ranger",
    name: "Guardião Silvestre",
    x: 5.5,
    y: 11.0,
    dir: "right",
    look: { skin: 1, hairColor: 1, hairStyle: 3, shirt: 0 },
    lines: ["dun.npc1", "dun.npc2", "dun.npc3", "dun.npc4"],
    offsetMs: 0
  }
];

const PILLARS = [
  { x: 5, y: 4 },
  { x: 16, y: 4 },
  { x: 5, y: 9 },
  { x: 16, y: 9 }
];

const NPC_CYCLE_MS = 9500;
const NPC_SHOW_MS = 6000;
const npcSpeechOverrides = new Map();

let actionBusy = false;
let enemyStrikePending = false;
let lastDropsPollAt = 0;
let playerHurtUntil = 0;
const enemyAiState = new Map(); // enemyId -> { atkTimer, facing, lungeUntil, lungeDx, lungeDy }
const combatFloaters = [];

function pushFloater(x, y, text, color = "#ffffff") {
  combatFloaters.push({
    x,
    y,
    text,
    color,
    bornAt: Date.now(),
    ttl: 1200
  });
}

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

function resetAiStateForFloor(run) {
  enemyAiState.clear();
  if (!run?.enemies) return;
  for (const e of run.enemies) {
    enemyAiState.set(e.id, {
      atkTimer: (e.atkCooldownMs || 1900) / 1000 * 0.75,
      facing: 1,
      lungeUntil: 0,
      lungeDx: 0,
      lungeDy: 0
    });
  }
}

export async function fetchDungeonState() {
  if (!S.uid) return null;
  try {
    const res = await fetch(`/api/dungeon/state?uid=${encodeURIComponent(S.uid)}`);
    if (!res.ok) return null;
    const data = await res.json();
    S.dungeon.phases = data.phases || [];
    S.dungeon.progress = data.progress || null;
    S.dungeon.activeRun = data.activeRun || null;
    S.dungeon.floorDrops = data.floorDrops || [];
    return data;
  } catch (_) {
    return null;
  }
}

async function pollFloorDrops(run) {
  if (!run) return;
  try {
    const res = await fetch(
      `/api/dungeon/drops?phaseId=${encodeURIComponent(run.phaseId)}&floor=${encodeURIComponent(run.floor)}`
    );
    if (!res.ok) return;
    const data = await res.json();
    S.dungeon.floorDrops = data.floorDrops || [];
  } catch (_) {}
}

export function enterDungeonRoomWithRun(me, run, exitEditFn, floorDrops = null) {
  if (exitEditFn) exitEditFn();
  if (run) S.dungeon.activeRun = run;
  if (Array.isArray(floorDrops)) S.dungeon.floorDrops = floorDrops;
  S.room = "dungeon";
  me.x = DUNGEON_SPAWN.x;
  me.y = DUNGEON_SPAWN.y;
  me.dir = "up";
  me.target = null;
  me.pending = null;
  combatFloaters.length = 0;
  playerHurtUntil = 0;
  enemyStrikePending = false;
  lastDropsPollAt = Date.now();
  resetAiStateForFloor(run);
  playEnterBuilding();
  const floorNum = run?.floor || 1;
  const phaseName = getLang() === "en" ? (run?.phaseNameEn || "The Dungeon Entrance") : (run?.phaseNamePt || "A entrada da Dungeon");
  toast(t("dun.enteredFloor", { phase: phaseName, floor: floorNum, total: run?.totalFloors || 10 }), "good");
}

export function exitDungeonRoom(me, exitBuilding) {
  S.room = "world";
  enemyAiState.clear();
  if (exitBuilding) {
    me.x = exitBuilding.front.x;
    me.y = exitBuilding.front.y + 0.6;
    me.dir = "down";
  }
  me.target = null;
  me.pending = null;
}

function isTileWallOrPillar(tx, ty) {
  if (tx < 1 || ty < 1 || tx >= DUNGEON_W - 1 || ty >= DUNGEON_H - 1) {
    if (ty === DUNGEON_H - 1 && (tx === 10 || tx === 11)) return false;
    return true;
  }
  for (const p of PILLARS) {
    if (tx === p.x && ty === p.y) return true;
  }
  return false;
}

export function isDungeonBlocked(tx, ty) {
  if (isTileWallOrPillar(tx, ty)) return true;
  const run = S.dungeon?.activeRun;
  if (run) {
    for (const e of run.enemies || []) {
      if (e && e.hp > 0 && Math.floor(e.x + 0.5) === tx && Math.floor(e.y + 0.5) === ty) {
        return true;
      }
    }
    if (run.chest && Math.floor(run.chest.x) === tx && Math.floor(run.chest.y) === ty) {
      return true;
    }
  }
  return false;
}

function canEnemyOccupy(nx, ny, selfId, run, me) {
  const cx = nx + 0.5, cy = ny + 0.5;
  if (cx < 1.35 || cx > DUNGEON_W - 1.35 || cy < 1.5 || cy > DUNGEON_H - 1.8) return false;
  if (isTileWallOrPillar(Math.floor(cx), Math.floor(cy))) return false;
  if (run?.chest && Math.hypot(cx - (run.chest.x + 0.5), cy - (run.chest.y + 0.5)) < 0.85) return false;
  if (Math.hypot(cx - me.x, cy - me.y) < 0.92) return false;
  for (const other of run?.enemies || []) {
    if (!other || other.id === selfId || other.hp <= 0) continue;
    if (Math.hypot(cx - (other.x + 0.5), cy - (other.y + 0.5)) < 0.85) return false;
  }
  return true;
}

async function triggerEnemyStrike(enemy, me, handleLeaveDungeon) {
  if (enemyStrikePending || S.room !== "dungeon") return;
  enemyStrikePending = true;
  try {
    const res = await fetch("/api/dungeon/enemy-hit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: S.uid,
        name: S.profile?.username || "Jogador",
        enemyId: enemy.id,
        playerX: me.x,
        playerY: me.y
      })
    });
    const data = await res.json();
    if (!res.ok || !data.hit) return;

    const nowMs = Date.now();
    const ai = enemyAiState.get(enemy.id);
    if (ai) {
      const dx = me.x - (enemy.x + 0.5);
      const dy = me.y - (enemy.y + 0.5);
      const len = Math.max(0.01, Math.hypot(dx, dy));
      ai.lungeUntil = nowMs + 190;
      ai.lungeDx = (dx / len) * 10;
      ai.lungeDy = (dy / len) * 10;
    }

    playPlayerHit();
    playerHurtUntil = nowMs + 280;
    pushFloater(me.x * TILE, me.y * TILE - 32, `-${data.enemyDmg} ❤️`, "#ff5252");

    if (data.phases) S.dungeon.phases = data.phases;
    S.dungeon.activeRun = data.activeRun || null;

    if (data.defeated) {
      playCasinoLoss();
      toast(
        data.dropCreated
          ? t("dun.defeatedDropped")
          : t("dun.defeated"),
        "bad",
        6000
      );
      handleLeaveDungeon();
    }
  } catch (_) {
  } finally {
    enemyStrikePending = false;
  }
}

export function updateDungeon(dt, me, handleLeaveDungeon) {
  if (S.room !== "dungeon" || !S.uid) return;
  const run = S.dungeon?.activeRun;
  if (!run || run.hp <= 0) return;

  const nowMs = Date.now();
  if (nowMs - lastDropsPollAt > 2500) {
    lastDropsPollAt = nowMs;
    pollFloorDrops(run);
  }

  if (isModalOpen()) return;

  for (const e of run.enemies || []) {
    if (!e || e.hp <= 0) continue;
    let ai = enemyAiState.get(e.id);
    if (!ai) {
      ai = { atkTimer: (e.atkCooldownMs || 1900) / 1000 * 0.7, facing: 1, lungeUntil: 0, lungeDx: 0, lungeDy: 0 };
      enemyAiState.set(e.id, ai);
    }

    const ex = e.x + 0.5, ey = e.y + 0.5;
    const dx = me.x - ex, dy = me.y - ey;
    const dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.05) ai.facing = dx >= 0 ? 1 : -1;

    const cooldownSec = (e.atkCooldownMs || 1900) / 1000;

    // Aggro & chase player if within 7.5 tiles (never camp directly on Exit Door y >= 12.1)
    if (dist <= 7.5 && dist > 1.15 && me.y < 12.2) {
      const spd = (e.speed || 1.7) * dt;
      const vx = (dx / dist) * spd;
      const vy = (dy / dist) * spd;
      if (canEnemyOccupy(e.x + vx, e.y, e.id, run, me)) e.x += vx;
      if (canEnemyOccupy(e.x, e.y + vy, e.id, run, me)) e.y += vy;
    }

    // Melee strike when within 1.65 tiles
    if (dist <= 1.65) {
      ai.atkTimer -= dt;
      if (ai.atkTimer <= 0 && !enemyStrikePending && !actionBusy) {
        ai.atkTimer = cooldownSec;
        triggerEnemyStrike(e, me, handleLeaveDungeon);
      }
    } else {
      ai.atkTimer = Math.min(cooldownSec, Math.max(ai.atkTimer, cooldownSec * 0.45));
    }
  }
}

export function computeDungeonFocus(me) {
  const run = S.dungeon?.activeRun;

  // 1. Fallen player loot drops on this floor
  for (const drop of S.dungeon?.floorDrops || []) {
    const dist = Math.hypot(me.x - drop.x, me.y - drop.y);
    if (dist < 1.9) {
      return { kind: "drop", dropId: drop.id, drop };
    }
  }

  if (run) {
    // 2. Living enemies
    let closestEnemy = null;
    let closestDist = 2.05;
    for (const e of run.enemies || []) {
      if (!e || e.hp <= 0) continue;
      const dist = Math.hypot(me.x - (e.x + 0.5), me.y - (e.y + 0.5));
      if (dist < closestDist) {
        closestDist = dist;
        closestEnemy = e;
      }
    }
    if (closestEnemy) {
      return { kind: "enemy", enemyId: closestEnemy.id, enemy: closestEnemy };
    }

    // 3. Treasure chest
    if (run.chest && !run.chest.opened) {
      const distChest = Math.hypot(me.x - (run.chest.x + 0.5), me.y - (run.chest.y + 0.5));
      if (distChest < 2.1) {
        return { kind: "chest", chest: run.chest };
      }
    }

    // 4. Next floor / completion portal
    const distPortal = Math.hypot(me.x - DUNGEON_PORTAL.x, me.y - DUNGEON_PORTAL.y);
    if (distPortal < 2.0) {
      return { kind: "portal", run };
    }

    // 5. Healing Spring
    if (!run.springUsed && run.hp < run.maxHp) {
      const distSpring = Math.hypot(me.x - DUNGEON_SPRING.x, me.y - DUNGEON_SPRING.y);
      if (distSpring < 2.0) {
        return { kind: "spring" };
      }
    }
  }

  // 6. Ranger NPC
  for (const npc of DUNGEON_NPCS) {
    if (Math.hypot(me.x - npc.x, me.y - npc.y) < 2.0) {
      return { kind: "npc", npc };
    }
  }

  // 7. Exit Gate
  if (Math.hypot(me.x - DUNGEON_EXIT.x, me.y - DUNGEON_EXIT.y) < 1.8) {
    return { kind: "exit" };
  }

  return null;
}

export function focusLabelDungeon(f) {
  if (!f) return null;
  const lang = getLang();
  if (f.kind === "exit") return t("dun.exitDoor");
  if (f.kind === "npc") return `${t("act.inspect")} ${f.npc.name}`;
  if (f.kind === "spring") return t("dun.useSpring");
  if (f.kind === "drop") {
    const mine = String(f.drop.victimUid) === String(S.uid);
    return mine
      ? `💀 ${t("dun.ownDropHint", { name: f.drop.victimName })}`
      : `🎒 ${t("dun.pickupDrop", { name: f.drop.victimName })}`;
  }
  if (f.kind === "enemy") {
    const name = lang === "en" ? f.enemy.nameEn : f.enemy.namePt;
    return `⚔️ ${t("dun.attackEnemy", { name })} [⚡1]`;
  }
  if (f.kind === "chest") {
    return S.dungeon?.activeRun?.cleared ? `🎁 ${t("dun.openChest")}` : `🔒 ${t("dun.chestLocked")}`;
  }
  if (f.kind === "portal") {
    const run = f.run;
    if (!run?.cleared) return `🔒 ${t("dun.portalLocked")}`;
    return run.floor >= (run.totalFloors || 10)
      ? `🏆 ${t("dun.finishPhase")}`
      : `🌀 ${t("dun.nextFloor", { n: run.floor + 1 })}`;
  }
  return null;
}

function formatLootList(loot) {
  if (!loot) return [];
  const msgs = [];
  if (loot.pp > 0) msgs.push(`+${loot.pp} PP`);
  if (loot.bronze > 0) msgs.push(`+${loot.bronze} 🥉`);
  if (loot.silver > 0) msgs.push(`+${loot.silver} 🥈`);
  if (loot.seeds) {
    let seedTotal = 0;
    for (const qty of Object.values(loot.seeds)) seedTotal += Number(qty) || 0;
    if (seedTotal > 0) msgs.push(`+${seedTotal} ${t("dun.seedWord")}`);
  }
  return msgs;
}

async function applyLootToFirebase(loot) {
  if (!loot || !S.uid) return [];
  const updates = {};

  if (loot.pp > 0) updates[savePath(S.uid, "wallet/pp")] = increment(loot.pp);
  if (loot.bronze > 0) updates[savePath(S.uid, "wallet/bronze")] = increment(loot.bronze);
  if (loot.silver > 0) updates[savePath(S.uid, "wallet/silver")] = increment(loot.silver);
  if (loot.seeds) {
    for (const [seedId, qty] of Object.entries(loot.seeds)) {
      if (qty > 0) updates[savePath(S.uid, `inv/${seedId}`)] = increment(qty);
    }
  }

  if (Object.keys(updates).length > 0) {
    await commit(updates);
  }
  return formatLootList(loot);
}

export async function performDungeonAction(f, handleLeaveDungeon, me) {
  if (!f || actionBusy) return;

  if (f.kind === "exit") {
    actionBusy = true;
    try {
      const res = await fetch("/api/dungeon/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: S.uid,
          name: S.profile?.username || "Jogador"
        })
      });
      const data = await res.json();
      if (res.ok) {
        S.dungeon.phases = data.phases || S.dungeon.phases;
        S.dungeon.activeRun = null;
        const msgs = await applyLootToFirebase(data.bankedLoot);
        if (msgs.length > 0) {
          toast(t("dun.extractedLoot", { loot: msgs.join(" · ") }), "good", 5000);
        }
      }
    } catch (_) {
    } finally {
      actionBusy = false;
      handleLeaveDungeon();
    }
    return;
  }

  if (f.kind === "drop") {
    if (String(f.drop.victimUid) === String(S.uid)) {
      toast(t("dun.cannotPickupOwnDrop"), "bad");
      return;
    }
    actionBusy = true;
    try {
      const res = await fetch("/api/dungeon/pickup-drop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: S.uid,
          name: S.profile?.username || "Jogador",
          dropId: f.dropId
        })
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || t("msg.error"), "bad");
        pollFloorDrops(S.dungeon?.activeRun);
        return;
      }
      S.dungeon.activeRun = data.activeRun;
      S.dungeon.floorDrops = data.floorDrops || [];
      playDungeonChest();
      const msgs = formatLootList(data.claimedBag);
      toast(t("dun.dropClaimed", { name: data.victimName, loot: msgs.join(" · ") }), "good", 5000);
    } catch (_) {
      toast(t("msg.error"), "bad");
    } finally {
      actionBusy = false;
    }
    return;
  }

  if (f.kind === "npc") {
    const npc = DUNGEON_NPCS.find((n) => n.id === f.npc.id);
    if (npc) {
      const cur = npcSpeechOverrides.get(npc.id);
      const nextIdx = cur ? (cur.idx + 1) % npc.lines.length : 0;
      npcSpeechOverrides.set(npc.id, { idx: nextIdx, shownAt: Date.now() });
    }
    return;
  }

  if (f.kind === "spring") {
    actionBusy = true;
    try {
      const res = await fetch("/api/dungeon/heal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: S.uid })
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || t("msg.error"), "bad");
        return;
      }
      S.dungeon.activeRun = data.activeRun;
      playDungeonHeal();
      pushFloater(me.x * TILE, me.y * TILE - 32, `+${data.healed} ❤️`, "#59d17a");
      toast(t("dun.springUsed", { hp: data.healed }), "good");
    } catch (_) {
      toast(t("msg.error"), "bad");
    } finally {
      actionBusy = false;
    }
    return;
  }

  if (f.kind === "enemy") {
    const run = S.dungeon?.activeRun;
    const enemy = (run?.enemies || []).find((e) => e.id === f.enemyId);
    if (!enemy || enemy.hp <= 0) return;

    const curEnergy = energy().current;
    if (curEnergy < 1) {
      toast(t("mines.notEnoughEnergy"), "bad");
      return;
    }

    actionBusy = true;
    try {
      const res = await fetch("/api/dungeon/attack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: S.uid,
          name: S.profile?.username || "Jogador",
          enemyId: enemy.id,
          energyCurrent: curEnergy,
          playerX: me.x,
          playerY: me.y
        })
      });
      const data = await res.json();
      if (!res.ok || !data.allowed) {
        toast(data.error === "Insufficient energy" ? t("mines.notEnoughEnergy") : t("msg.error"), "bad");
        return;
      }

      const c = data.combat || {};
      playSwordHit(!!c.isCrit);

      // Deduct energy in Firebase
      const nextEnergy = Math.max(0, curEnergy - (data.energyCost || 1));
      S.save.energy.current = nextEnergy;
      await commit({
        [savePath(S.uid, "energy/current")]: nextEnergy
      });

      const ex = (enemy.x + 0.5) * TILE;
      const ey = (enemy.y + 0.2) * TILE;
      pushFloater(
        ex,
        ey,
        c.isCrit ? `CRIT -${c.playerDmg}!` : `-${c.playerDmg}`,
        c.isCrit ? "#f5c518" : "#ffffff"
      );

      if (c.enemyDmg > 0) {
        const ai = enemyAiState.get(enemy.id);
        if (ai) {
          ai.atkTimer = (enemy.atkCooldownMs || 1900) / 1000;
          ai.lungeUntil = Date.now() + 180;
          ai.lungeDx = (me.x - (enemy.x + 0.5)) * 6;
          ai.lungeDy = (me.y - (enemy.y + 0.5)) * 6;
        }
        setTimeout(() => {
          playPlayerHit();
          playerHurtUntil = Date.now() + 260;
          pushFloater(me.x * TILE, me.y * TILE - 32, `-${c.enemyDmg} ❤️`, "#ff5252");
        }, 120);
      }

      if (c.enemyKilled) {
        playEnemyDefeat();
        enemyAiState.delete(enemy.id);
        if (c.healOnKill > 0 && !c.defeated) {
          pushFloater(me.x * TILE + 12, me.y * TILE - 46, `+${c.healOnKill} ❤️`, "#59d17a");
        }
        if (data.drop) {
          const msgs = formatLootList(data.drop);
          if (msgs.length > 0) {
            pushFloater(ex, ey - 18, `🎒 ${msgs.join(" ")}`, "#ffe066");
          }
        }
      }

      // Preserve updated enemy positions for surviving enemies while applying authoritative HP/bag state
      const prevPositions = new Map((run.enemies || []).map((x) => [x.id, { x: x.x, y: x.y }]));
      S.dungeon.phases = data.phases || S.dungeon.phases;
      S.dungeon.activeRun = data.activeRun || null;
      if (S.dungeon.activeRun) {
        for (const ne of S.dungeon.activeRun.enemies || []) {
          const pos = prevPositions.get(ne.id);
          if (pos && ne.hp > 0) {
            ne.x = pos.x;
            ne.y = pos.y;
          }
        }
      }

      if (c.defeated) {
        playCasinoLoss();
        toast(data.dropCreated ? t("dun.defeatedDropped") : t("dun.defeated"), "bad", 6000);
        handleLeaveDungeon();
        return;
      }

      if (c.floorCleared) {
        if (run.isBossFloor) {
          playDungeonVictory();
          toast(t("dun.bossCleared"), "good", 5000);
        } else {
          toast(t("dun.floorCleared"), "good", 3500);
        }
      }
    } catch (_) {
      toast(t("msg.error"), "bad");
    } finally {
      actionBusy = false;
    }
    return;
  }

  if (f.kind === "chest") {
    const run = S.dungeon?.activeRun;
    if (!run?.cleared) {
      toast(t("dun.chestLocked"), "bad");
      return;
    }
    actionBusy = true;
    try {
      const res = await fetch("/api/dungeon/open-chest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: S.uid,
          name: S.profile?.username || "Jogador"
        })
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || t("msg.error"), "bad");
        return;
      }
      S.dungeon.phases = data.phases || S.dungeon.phases;
      S.dungeon.activeRun = data.activeRun || null;
      playDungeonChest();
      const msgs = formatLootList(data.loot);
      toast(t("dun.chestLootedBag", { loot: msgs.join(" · ") }), "good", 5000);
    } catch (_) {
      toast(t("msg.error"), "bad");
    } finally {
      actionBusy = false;
    }
    return;
  }

  if (f.kind === "portal") {
    const run = S.dungeon?.activeRun;
    if (!run?.cleared) {
      toast(t("dun.portalLocked"), "bad");
      return;
    }
    actionBusy = true;
    try {
      const res = await fetch("/api/dungeon/next-floor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: S.uid,
          name: S.profile?.username || "Jogador"
        })
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || t("msg.error"), "bad");
        return;
      }
      S.dungeon.phases = data.phases || S.dungeon.phases;
      S.dungeon.activeRun = data.activeRun || null;
      if (Array.isArray(data.floorDrops)) S.dungeon.floorDrops = data.floorDrops;

      if (data.completedPhase) {
        playDungeonVictory();
        const msgs = await applyLootToFirebase(data.bankedLoot);
        toast(
          msgs.length > 0
            ? `${t("dun.phaseCompletedToast")} (${msgs.join(" · ")})`
            : t("dun.phaseCompletedToast"),
          "good",
          6000
        );
        handleLeaveDungeon();
        return;
      }

      // Advance to next floor
      playEnterBuilding();
      resetAiStateForFloor(data.activeRun);
      me.x = DUNGEON_SPAWN.x;
      me.y = DUNGEON_SPAWN.y;
      me.dir = "up";
      me.target = null;
      me.pending = null;
      const next = data.activeRun;
      const phaseName = getLang() === "en" ? next.phaseNameEn : next.phaseNamePt;
      toast(t("dun.enteredFloor", { phase: phaseName, floor: next.floor, total: next.totalFloors }), "good");
    } catch (_) {
      toast(t("msg.error"), "bad");
    } finally {
      actionBusy = false;
    }
  }
}

export function handleDungeonTap(wx, wy, me) {
  for (const drop of S.dungeon?.floorDrops || []) {
    if (Math.hypot(wx - drop.x, wy - drop.y) < 0.95) {
      me.target = { x: drop.x, y: drop.y + 0.5 };
      me.pending = { kind: "drop", dropId: drop.id, drop };
      return;
    }
  }

  const run = S.dungeon?.activeRun;
  if (run) {
    for (const e of run.enemies || []) {
      if (!e || e.hp <= 0) continue;
      if (Math.hypot(wx - (e.x + 0.5), wy - (e.y + 0.5)) < 1.0) {
        me.target = { x: e.x + 0.5, y: e.y + 0.9 };
        me.pending = { kind: "enemy", enemyId: e.id };
        return;
      }
    }
    if (run.chest && !run.chest.opened && Math.hypot(wx - (run.chest.x + 0.5), wy - (run.chest.y + 0.5)) < 0.95) {
      me.target = { x: run.chest.x + 0.5, y: run.chest.y + 1.0 };
      me.pending = { kind: "chest" };
      return;
    }
    if (Math.hypot(wx - DUNGEON_PORTAL.x, wy - DUNGEON_PORTAL.y) < 1.1) {
      me.target = { x: DUNGEON_PORTAL.x, y: DUNGEON_PORTAL.y + 0.5 };
      me.pending = { kind: "portal", run };
      return;
    }
    if (Math.hypot(wx - DUNGEON_SPRING.x, wy - DUNGEON_SPRING.y) < 1.1) {
      me.target = { x: DUNGEON_SPRING.x, y: DUNGEON_SPRING.y + 0.5 };
      me.pending = { kind: "spring" };
      return;
    }
  }

  if (Math.hypot(wx - DUNGEON_EXIT.x, wy - DUNGEON_EXIT.y) < 1.2) {
    me.target = { x: DUNGEON_EXIT.x, y: DUNGEON_EXIT.y };
    me.pending = { kind: "exit" };
    return;
  }

  me.target = { x: wx, y: wy };
  me.pending = null;
}

export function tickDungeonPending(me, handleLeaveDungeon) {
  const p = me.pending;
  if (!p || actionBusy) return;
  const run = S.dungeon?.activeRun;

  let px = me.x, py = me.y, range = 1.6;
  if (p.kind === "drop") {
    const d = (S.dungeon?.floorDrops || []).find((x) => x.id === p.dropId);
    if (!d) { me.pending = null; return; }
    px = d.x; py = d.y; range = 1.85;
  } else if (p.kind === "enemy") {
    const e = (run?.enemies || []).find((x) => x.id === p.enemyId && x.hp > 0);
    if (!e) { me.pending = null; return; }
    px = e.x + 0.5; py = e.y + 0.5; range = 1.95;
  } else if (p.kind === "chest") {
    if (!run?.chest || run.chest.opened) { me.pending = null; return; }
    px = run.chest.x + 0.5; py = run.chest.y + 0.5; range = 1.95;
  } else if (p.kind === "portal") {
    px = DUNGEON_PORTAL.x; py = DUNGEON_PORTAL.y; range = 1.7;
  } else if (p.kind === "spring") {
    px = DUNGEON_SPRING.x; py = DUNGEON_SPRING.y; range = 1.8;
  } else if (p.kind === "exit") {
    px = DUNGEON_EXIT.x; py = DUNGEON_EXIT.y; range = 1.4;
  }

  if (Math.hypot(me.x - px, me.y - py) <= range) {
    const act = { ...p };
    if (act.kind === "enemy") {
      act.enemy = (run?.enemies || []).find((x) => x.id === p.enemyId);
    } else if (act.kind === "portal") {
      act.run = run;
    } else if (act.kind === "drop") {
      act.drop = (S.dungeon?.floorDrops || []).find((x) => x.id === p.dropId);
    }
    me.pending = null;
    me.target = null;
    performDungeonAction(act, handleLeaveDungeon, me);
  }
}

const UI_FONT = "system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

function drawEmoji(ctx, ch, x, y, size) {
  ctx.font = `${size}px ${EMOJI}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ch, x, y);
}

function drawCharacterNameTag(ctx, text, cx, y, border = null) {
  ctx.save();
  ctx.font = `600 11px ${UI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 12;
  const h = 18;
  ctx.fillStyle = "rgba(10,20,14,0.84)";
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

export function renderDungeonRoom(ctx, view, g, { sanitizeLook }) {
  const { cw, ch, zoom, dpr } = view;
  const vw = cw / zoom, vh = ch / zoom;
  const worldW = DUNGEON_W * TILE, worldH = DUNGEON_H * TILE;

  let cx = g.me.x * TILE - vw / 2, cy = g.me.y * TILE - vh / 2;
  cx = worldW <= vw ? (worldW - vw) / 2 : Math.max(0, Math.min(worldW - vw, cx));
  cy = worldH <= vh ? (worldH - vh) / 2 : Math.max(0, Math.min(worldH - vh, cy));
  view.camX = cx; view.camY = cy;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#0b1911";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const s = dpr * zoom;
  ctx.setTransform(s, 0, 0, s, -cx * s, -cy * s);

  const run = S.dungeon?.activeRun;
  const nowSec = g.time;
  const nowMs = Date.now();

  // Forest clearing tiles
  for (let ty = 0; ty < DUNGEON_H; ty++) {
    for (let tx = 0; tx < DUNGEON_W; tx++) {
      const x = tx * TILE, y = ty * TILE;
      const isExitDoor = ty === DUNGEON_H - 1 && (tx === 10 || tx === 11);
      const border = tx === 0 || ty === 0 || tx === DUNGEON_W - 1 || ty === DUNGEON_H - 1;

      if (border) {
        if (isExitDoor) {
          ctx.fillStyle = "#5a4632";
          ctx.fillRect(x, y, TILE, TILE);
        } else {
          ctx.fillStyle = "#112819";
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = (tx + ty) % 2 ? "#1b4328" : "#225332";
          ctx.beginPath();
          ctx.arc(x + TILE / 2, y + TILE / 2, TILE * 0.48, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const isStonePath = tx >= 10 && tx <= 11 && ty >= 2;
        if (isStonePath) {
          ctx.fillStyle = (tx + ty) % 2 ? "#465047" : "#3f4940";
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = "rgba(0,0,0,0.16)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
        } else {
          ctx.fillStyle = (tx + ty) % 2 ? "#214229" : "#1d3b25";
          ctx.fillRect(x, y, TILE, TILE);
          if ((tx * 11 + ty * 17) % 7 === 0) {
            ctx.fillStyle = "rgba(120, 220, 140, 0.14)";
            ctx.beginPath();
            ctx.arc(x + 12, y + 16, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }

  // Healing Spring of the Forest (1x per floor)
  {
    const sx = DUNGEON_SPRING.x * TILE, sy = DUNGEON_SPRING.y * TILE;
    const active = run && !run.springUsed;
    const pulse = 0.6 + Math.sin(nowSec * 3.5) * 0.25;
    ctx.fillStyle = active ? `rgba(52, 211, 153, ${0.22 * pulse})` : "rgba(60, 80, 75, 0.2)";
    ctx.beginPath();
    ctx.arc(sx, sy, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = active ? "#1abc9c" : "#445c56";
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2, 16, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    drawEmoji(ctx, active ? "💧" : "🪨", sx, sy - 2, 20);
  }

  // Next Floor / Completion Portal at top-center
  {
    const px = DUNGEON_PORTAL.x * TILE, py = DUNGEON_PORTAL.y * TILE;
    const open = !!run?.cleared;
    const spin = nowSec * 2.5;
    ctx.fillStyle = open ? "rgba(89, 209, 122, 0.26)" : "rgba(120, 130, 125, 0.18)";
    ctx.beginPath();
    ctx.ellipse(px, py + 4, 24, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = open ? "#59d17a" : "#708078";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(px, py, 16, spin, spin + Math.PI * 1.4);
    ctx.stroke();
    drawEmoji(ctx, open ? (run?.isBossFloor ? "🏆" : "🌀") : "🔒", px, py, 22);
  }

  // Bottom Exit sign highlight
  ctx.fillStyle = "rgba(245, 197, 24, 0.18)";
  ctx.fillRect(10 * TILE, (DUNGEON_H - 1.05) * TILE, 2 * TILE, TILE);
  drawEmoji(ctx, "🚪", 11 * TILE, (DUNGEON_H - 0.5) * TILE, 18);

  const entities = [];

  // Stone Moss Pillars
  for (const p of PILLARS) {
    entities.push({
      y: (p.y + 1) * TILE,
      draw: () => {
        const x = p.x * TILE, y = p.y * TILE;
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath();
        ctx.ellipse(x + TILE / 2, y + TILE - 3, 13, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#4d5e53";
        ctx.fillRect(x + 7, y + 6, TILE - 14, TILE - 10);
        ctx.fillStyle = "#2e7d32";
        ctx.fillRect(x + 7, y + 4, TILE - 14, 7);
      }
    });
  }

  // Treasure Chest
  if (run?.chest) {
    const chObj = run.chest;
    const rx = chObj.x * TILE, ry = chObj.y * TILE;
    entities.push({
      y: (chObj.y + 1) * TILE,
      draw: () => {
        if (!chObj.opened && run.cleared) {
          ctx.fillStyle = `rgba(245, 197, 24, ${0.22 + Math.sin(nowSec * 5) * 0.12})`;
          ctx.beginPath();
          ctx.arc(rx + TILE / 2, ry + TILE / 2, 22, 0, Math.PI * 2);
          ctx.fill();
        }
        drawEmoji(ctx, chObj.opened ? "📭" : (run.cleared ? "🎁" : "🧰"), rx + TILE / 2, ry + TILE / 2, 26);
      }
    });
  }

  // Fallen player death loot bags on floor
  for (const drop of S.dungeon?.floorDrops || []) {
    const isMine = String(drop.victimUid) === String(S.uid);
    entities.push({
      y: drop.y * TILE,
      draw: () => {
        drawDungeonDropBag(ctx, drop, drop.x * TILE, drop.y * TILE, nowSec, isMine);
      }
    });
  }

  // Enemies with custom procedural sprites + active attack telegraph + lunge
  if (run) {
    for (const e of run.enemies || []) {
      if (!e || e.hp <= 0) continue;
      const ex = (e.x + 0.5) * TILE, ey = (e.y + 0.5) * TILE;
      const isFocused = g.focus?.kind === "enemy" && g.focus.enemyId === e.id;
      const ai = enemyAiState.get(e.id);
      const cooldownSec = (e.atkCooldownMs || 1900) / 1000;
      const dist = Math.hypot(g.me.x - (e.x + 0.5), g.me.y - (e.y + 0.5));
      const chargeRatio = dist <= 1.65 && ai
        ? Math.max(0, Math.min(1, 1 - ai.atkTimer / cooldownSec))
        : 0;
      const isLunging = ai && nowMs < ai.lungeUntil;

      entities.push({
        y: (e.y + 0.9) * TILE,
        draw: () => {
          drawDungeonEnemy(ctx, e, ex, ey, nowSec, {
            isFocused,
            facing: ai?.facing || 1,
            lungeX: isLunging ? ai.lungeDx : 0,
            lungeY: isLunging ? ai.lungeDy : 0,
            chargeRatio
          });
        }
      });
    }
  }

  // NPCs
  for (const npc of DUNGEON_NPCS) {
    entities.push({
      y: npc.y * TILE,
      draw: () => {
        drawCharacter(ctx, npc.x * TILE, npc.y * TILE, npc.look, { dir: npc.dir, phase: 0, moving: false });
      }
    });
  }

  // Player & others in room
  const look = sanitizeLook(S.profile?.look);
  for (const o of g.others) {
    if ((o.p.room || "world") !== "dungeon") continue;
    entities.push({
      y: o.p.dy * TILE,
      draw: () => drawCharacter(ctx, o.p.dx * TILE, o.p.dy * TILE, o.p.look, { dir: o.p.d || "down", phase: o.p.phase, moving: !!o.p.m })
    });
  }
  entities.push({
    y: g.me.y * TILE,
    draw: () => {
      if (nowMs < playerHurtUntil) {
        ctx.save();
        ctx.fillStyle = "rgba(255, 60, 60, 0.35)";
        ctx.beginPath();
        ctx.arc(g.me.x * TILE, g.me.y * TILE - 12, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      drawCharacter(ctx, g.me.x * TILE, g.me.y * TILE, look, { dir: g.me.dir, phase: g.me.phase, moving: g.me.moving });
    }
  });

  entities.sort((a, b) => a.y - b.y).forEach((e) => e.draw());

  // Forest Fireflies
  for (let i = 0; i < 14; i++) {
    const fx = ((Math.sin(nowSec * 0.6 + i * 2.1) * 0.4 + 0.5) * (DUNGEON_W - 2) + 1) * TILE;
    const fy = ((Math.cos(nowSec * 0.5 + i * 1.7) * 0.4 + 0.5) * (DUNGEON_H - 2) + 1) * TILE;
    const alpha = 0.25 + (Math.sin(nowSec * 3 + i) + 1) * 0.28;
    ctx.fillStyle = `rgba(182, 255, 130, ${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(fx, fy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Name tags, Enemy tags, Drop tags & Player HP Bar
  const lang = getLang();

  for (const drop of S.dungeon?.floorDrops || []) {
    const b = drop.bag || {};
    const label = `💀 ${drop.victimName} (${b.bronze || 0}🥉 · ${b.pp || 0}PP)`;
    const isMine = String(drop.victimUid) === String(S.uid);
    drawCharacterNameTag(ctx, label, drop.x * TILE, drop.y * TILE - 25, isMine ? "#d9534f" : "#f5c518");
  }

  if (run) {
    for (const e of run.enemies || []) {
      if (!e || e.hp <= 0) continue;
      const eName = lang === "en" ? e.nameEn : e.namePt;
      const prefix = e.isBoss ? "👑 " : "";
      const yOffset = e.isBoss ? -31 : -20;
      drawCharacterNameTag(
        ctx,
        `${prefix}${eName} (${e.hp}/${e.maxHp})`,
        (e.x + 0.5) * TILE,
        e.y * TILE + yOffset,
        e.isBoss ? "#f5c518" : "#d9534f"
      );
    }
  }

  for (const npc of DUNGEON_NPCS) {
    drawCharacterNameTag(ctx, npc.name, npc.x * TILE, npc.y * TILE - 32, "#59d17a");
    const bubble = getNpcBubble(npc, nowMs);
    if (bubble) {
      drawSpeechBubble(ctx, bubble.text, npc.x * TILE, npc.y * TILE - 42, bubble.alpha);
    }
  }

  for (const o of g.others) {
    if ((o.p.room || "world") !== "dungeon") continue;
    drawCharacterNameTag(ctx, o.p.name || "?", o.p.dx * TILE, o.p.dy * TILE - 32);
  }

  drawCharacterNameTag(ctx, S.profile?.username || "", g.me.x * TILE, g.me.y * TILE - 32, "#f5c518");
  if (run) {
    drawPlayerDungeonHpBar(ctx, g.me.x * TILE, g.me.y * TILE - 51, run.hp, run.maxHp);
  }

  // Combat floaters
  for (let i = combatFloaters.length - 1; i >= 0; i--) {
    const fl = combatFloaters[i];
    const age = nowMs - fl.bornAt;
    if (age >= fl.ttl) {
      combatFloaters.splice(i, 1);
      continue;
    }
    const p = age / fl.ttl;
    ctx.save();
    ctx.globalAlpha = 1 - Math.pow(p, 2);
    ctx.font = `800 13px ${UI_FONT}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillText(fl.text, fl.x + 1, fl.y - p * 28 + 1);
    ctx.fillStyle = fl.color;
    ctx.fillText(fl.text, fl.x, fl.y - p * 28);
    ctx.restore();
  }

  // Top-center compact Dungeon Status Banner (shows Floor, HP, Enemies, and Risk/Bag loot)
  if (run) {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const phaseName = lang === "en" ? run.phaseNameEn : run.phaseNamePt;
    const floorName = lang === "en" ? run.floorNameEn : run.floorNamePt;
    const aliveCount = (run.enemies || []).filter((e) => e.hp > 0).length;
    const bag = run.bag || {};
    const bagTxt = `🎒 ${bag.bronze || 0}🥉 ${bag.pp || 0}PP${bag.silver ? ` ${bag.silver}🥈` : ""}`;
    const label = `🌲 ${phaseName} · ${t("dun.floorShort", { n: run.floor, total: run.totalFloors })} (${floorName}) · ❤️ ${run.hp}/${run.maxHp} · 👾 ${aliveCount} · ${bagTxt}`;

    ctx.font = `700 12px ${UI_FONT}`;
    const textW = ctx.measureText(label).width;
    const boxW = Math.min(cw - 24, textW + 28);
    const boxX = (cw - boxW) / 2;
    const boxY = cw < 960 ? 114 : 12;

    ctx.fillStyle = "rgba(10, 22, 14, 0.9)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxW, 30, 10);
    else ctx.rect(boxX, boxY, boxW, 30);
    ctx.fill();
    ctx.strokeStyle = run.hp <= run.maxHp * 0.3 ? "#e74c3c" : (run.cleared ? "#59d17a" : "#f5c518");
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cw / 2, boxY + 15, boxW - 14);
    ctx.restore();
  }
}
