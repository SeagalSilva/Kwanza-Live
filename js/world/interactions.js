// What happens when the player presses E / taps the action button / taps the world.
import { S } from "../state.js";
import { t } from "../i18n.js";
import { me, DIRV } from "./player.js";
import { farmIndex, BUILDINGS, LAND_META, buildingAtTile, landAtTile } from "./map.js";
import { exitMapEditMode } from "./editor.js";
import {
  enterCasinoRoom,
  exitCasinoRoom,
  computeCasinoFocus,
  focusLabelCasino,
  performCasinoAction,
  handleCasinoTap,
  tickCasinoPending
} from "./casinoRoom.js";
import {
  enterMinesRoom,
  exitMinesRoom,
  computeMinesFocus,
  focusLabelMines,
  performMinesAction,
  handleMinesTap,
  tickMinesPending
} from "./minesRoom.js";
import {
  exitDungeonRoom,
  computeDungeonFocus,
  focusLabelDungeon,
  performDungeonAction,
  handleDungeonTap,
  tickDungeonPending
} from "./dungeonRoom.js";
import {
  enterWorkstationRoom,
  exitWorkstationRoom,
  computeWorkstationFocus,
  focusLabelWorkstation,
  performWorkstationAction,
  handleWorkstationTap,
  tickWorkstationPending
} from "./workstationRoom.js";
import { interactTile, tileData, cropState, canUseScope, landModeOf } from "../systems/farming.js";
import { CROPS } from "../data/crops.js";
import { releaseSlotMachine, forfeitRouletteFreeSpins } from "../systems/casino.js";
import { openGameMarket } from "../ui/modals/gameMarket.js";
import { openPlayerMarket } from "../ui/modals/playerMarket.js";
import { openLand } from "../ui/modals/land.js";
import { openGovernment } from "../ui/modals/government.js";
import { openPostOffice } from "../ui/modals/postOffice.js";
import { openDungeonModal } from "../ui/modals/dungeon.js";
import { playEnterBuilding } from "../systems/audio.js";

function handleLeaveCasino() {
  releaseSlotMachine();
  if ((S.casino.roulette?.freeSpins || 0) > 0) {
    forfeitRouletteFreeSpins();
  }
  const b = BUILDINGS.find((x) => x.id === "casino");
  exitCasinoRoom(me, b);
}

function handleLeaveMines() {
  const b = BUILDINGS.find((x) => x.id === "mines");
  exitMinesRoom(me, b);
}

export function handleLeaveDungeon() {
  const b = BUILDINGS.find((x) => x.id === "dungeon");
  exitDungeonRoom(me, b);
}

function handleLeaveWorkstation() {
  const b = BUILDINGS.find((x) => x.id === "workstation");
  exitWorkstationRoom(me, b);
}

/** Best thing to interact with right now (or null). */
export function computeFocus() {
  if (S.room === "casino") return computeCasinoFocus(me);
  if (S.room === "mines") return computeMinesFocus(me);
  if (S.room === "dungeon") return computeDungeonFocus(me);
  if (S.room === "workstation") return computeWorkstationFocus(me);

  const v = DIRV[me.dir];
  const probes = [[me.x + v[0] * 0.8, me.y + v[1] * 0.8], [me.x, me.y]];
  for (const [px, py] of probes) {
    const tx = Math.floor(px), ty = Math.floor(py), key = `${tx}_${ty}`;
    const f = farmIndex.get(key);
    if (f && canUseScope(f.scope)) {
      if (f.scope !== "public" && landModeOf(f.scope) !== "farm" && !tileData(f.scope, key)) {
        continue;
      }
      return { kind: "tile", scope: f.scope, tx, ty, key };
    }
  }
  for (const b of BUILDINGS) {
    if (Math.hypot(me.x - b.front.x, me.y - b.front.y) < 2.2) return { kind: "building", id: b.id };
  }
  for (const l of LAND_META) {
    if (Math.hypot(me.x - l.sign.x, me.y - l.sign.y) < 2.4) return { kind: "land", id: l.id };
  }
  return null;
}

export function focusLabel(f) {
  if (!f) return null;
  if (S.room === "casino") return focusLabelCasino(f);
  if (S.room === "mines") return focusLabelMines(f);
  if (S.room === "dungeon") return focusLabelDungeon(f);
  if (S.room === "workstation") return focusLabelWorkstation(f);
  if (f.kind === "building") return t("act.open", { place: t(`place.${f.id}`) });
  if (f.kind === "land") return t("act.viewLand", { id: f.id });
  const tile = tileData(f.scope, f.key);
  const st = cropState(tile);
  if (st.stage === "empty") {
    const c = CROPS[S.selectedSeed];
    return `${c.emoji} ${t("act.plant")}`;
  }
  if (st.stage === "growing") return `⏳ ${t("act.inspect")}`;
  if (st.stage === "withered") return `🧹 ${t("act.clear")}`;
  return tile.by === S.uid ? `🧺 ${t("act.harvest")}` : `👀 ${t("act.inspect")}`;
}

export function perform(f) {
  if (!f) return;
  if (S.room === "casino") {
    return performCasinoAction(f, handleLeaveCasino);
  }
  if (S.room === "mines") {
    return performMinesAction(f, handleLeaveMines);
  }
  if (S.room === "dungeon") {
    return performDungeonAction(f, handleLeaveDungeon, me);
  }
  if (S.room === "workstation") {
    return performWorkstationAction(f, handleLeaveWorkstation);
  }
  if (f.kind === "building") {
    playEnterBuilding();
    if (f.id === "gameMarket") return openGameMarket();
    if (f.id === "bazaar") return openPlayerMarket();
    if (f.id === "workstation") return enterWorkstationRoom(me, exitMapEditMode);
    if (f.id === "government") return openGovernment();
    if (f.id === "casino") return enterCasinoRoom(me, exitMapEditMode);
    if (f.id === "mines") return enterMinesRoom(me, exitMapEditMode);
    if (f.id === "postOffice") return openPostOffice();
    if (f.id === "dungeon") return openDungeonModal({ me, exitEditFn: exitMapEditMode });
    return;
  }
  if (f.kind === "land") {
    playEnterBuilding();
    return openLand(f.id);
  }
  // face the tile
  const dx = f.tx + 0.5 - me.x, dy = f.ty + 0.5 - me.y;
  if (Math.abs(dx) > Math.abs(dy)) me.dir = dx > 0 ? "right" : "left"; else if (Math.abs(dy) > 0.2) me.dir = dy > 0 ? "down" : "up";
  interactTile(f.scope, f.key);
}

/** Tap/click on the world at tile coords (wx, wy). */
export function handleTap(wx, wy) {
  if (S.room === "casino") return handleCasinoTap(wx, wy, me);
  if (S.room === "mines") return handleMinesTap(wx, wy, me);
  if (S.room === "dungeon") return handleDungeonTap(wx, wy, me);
  if (S.room === "workstation") return handleWorkstationTap(wx, wy, me);

  const tx = Math.floor(wx), ty = Math.floor(wy), key = `${tx}_${ty}`;

  const farm = farmIndex.get(key);
  if (farm && canUseScope(farm.scope)) {
    if (farm.scope === "public" || landModeOf(farm.scope) === "farm" || tileData(farm.scope, key)) {
      me.target = { x: tx + 0.5, y: ty + 0.5 };
      me.pending = { kind: "tile", scope: farm.scope, tx, ty, key };
      return;
    }
  }
  const b = buildingAtTile(tx, ty);
  if (b) { me.target = { ...b.front }; me.pending = { kind: "building", id: b.id }; return; }

  const land = landAtTile(tx, ty);
  if (land) { me.target = { ...land.sign }; me.pending = { kind: "land", id: land.id }; return; }

  me.target = { x: wx, y: wy };
  me.pending = null;
}

/** Run the pending tap action once the player is close enough. */
export function tickPending() {
  if (S.room === "casino") return tickCasinoPending(me, handleLeaveCasino);
  if (S.room === "mines") return tickMinesPending(me, handleLeaveMines);
  if (S.room === "dungeon") return tickDungeonPending(me, handleLeaveDungeon);
  if (S.room === "workstation") return tickWorkstationPending(me, handleLeaveWorkstation);

  const p = me.pending;
  if (!p) return;
  let px, py, range;
  if (p.kind === "tile") { px = p.tx + 0.5; py = p.ty + 0.5; range = 1.5; }
  else if (p.kind === "building") { const b = BUILDINGS.find((x) => x.id === p.id); px = b.front.x; py = b.front.y; range = 0.9; }
  else { const l = LAND_META.find((x) => x.id === p.id); px = l.sign.x; py = l.sign.y; range = 1.6; }
  if (Math.hypot(me.x - px, me.y - py) <= range) {
    me.pending = null; me.target = null;
    perform(p);
  }
}
