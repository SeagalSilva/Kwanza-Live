// Interactive drag-and-drop map item editor (admin only).
import { S } from "../state.js";
import { t } from "../i18n.js";
import { $ } from "../utils.js";
import { mapSize, PUBLIC_FARM, BUILDINGS, LAND_META } from "./map.js";
import { LAND_SIZE } from "../data/lands.js";
import { isAdmin, adminUpdateMap } from "../systems/government.js";
import { closeModal } from "../ui/modal.js";

let dragState = null;

export const isMapEditMode = () => S.room === "world" && !!S.mapEditMode && isAdmin();
export const getDragState = () => dragState;

function syncEditBar() {
  const bar = $("#map-edit-bar");
  if (!bar) return;
  bar.hidden = !isMapEditMode();
  const label = $("#map-edit-text");
  if (label) {
    label.textContent = dragState
      ? `✥ ${dragState.label} (${dragState.curX}, ${dragState.curY})`
      : t("gov.editModeHint");
  }
}

export function enterMapEditMode() {
  if (!isAdmin()) return;
  closeModal();
  S.mapEditMode = true;
  dragState = null;
  const exitBtn = $("#btn-exit-edit");
  if (exitBtn) {
    exitBtn.textContent = t("gov.btnDoneEdit");
    exitBtn.onclick = () => exitMapEditMode();
  }
  syncEditBar();
}

export function exitMapEditMode() {
  S.mapEditMode = false;
  dragState = null;
  syncEditBar();
}

function hitTestMovable(wx, wy) {
  for (const b of BUILDINGS) {
    if (wx >= b.x && wx <= b.x + b.w && wy >= b.y - 0.6 && wy <= b.y + b.h) {
      return { kind: "building", id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, label: t(`place.${b.id}`) };
    }
  }
  if (
    wx >= PUBLIC_FARM.x0 && wx <= PUBLIC_FARM.x0 + PUBLIC_FARM.w &&
    wy >= PUBLIC_FARM.y0 - 0.6 && wy <= PUBLIC_FARM.y0 + PUBLIC_FARM.h
  ) {
    return {
      kind: "publicFarm",
      id: "publicFarm",
      x: PUBLIC_FARM.x0,
      y: PUBLIC_FARM.y0,
      w: PUBLIC_FARM.w,
      h: PUBLIC_FARM.h,
      label: t("place.publicFarm")
    };
  }
  for (const l of LAND_META) {
    if (wx >= l.x0 && wx <= l.x0 + LAND_SIZE && wy >= l.y0 - 0.6 && wy <= l.y0 + LAND_SIZE) {
      return {
        kind: "land",
        id: l.id,
        x: l.x0,
        y: l.y0,
        w: LAND_SIZE,
        h: LAND_SIZE,
        label: t("act.viewLand", { id: l.id })
      };
    }
  }
  return null;
}

export function startDrag(wx, wy) {
  if (!isMapEditMode()) return false;
  const hit = hitTestMovable(wx, wy);
  if (!hit) return false;
  dragState = {
    ...hit,
    origX: hit.x,
    origY: hit.y,
    curX: hit.x,
    curY: hit.y,
    offsetX: wx - hit.x,
    offsetY: wy - hit.y
  };
  syncEditBar();
  return true;
}

export function moveDrag(wx, wy) {
  if (!dragState) return false;
  const maxX = Math.max(2, mapSize.w - 2 - dragState.w);
  const maxY = Math.max(2, mapSize.h - 2 - dragState.h);
  dragState.curX = Math.max(2, Math.min(maxX, Math.round(wx - dragState.offsetX)));
  dragState.curY = Math.max(2, Math.min(maxY, Math.round(wy - dragState.offsetY)));
  syncEditBar();
  return true;
}

export async function endDrag() {
  if (!dragState) return false;
  const d = dragState;
  dragState = null;
  syncEditBar();
  if (d.curX === d.origX && d.curY === d.origY) return true;

  let payload = null;
  if (d.kind === "building") payload = { buildings: { [d.id]: { x: d.curX, y: d.curY } } };
  else if (d.kind === "publicFarm") payload = { publicFarm: { x0: d.curX, y0: d.curY } };
  else if (d.kind === "land") payload = { lands: { [d.id]: { x0: d.curX, y0: d.curY } } };

  if (payload) {
    await adminUpdateMap(payload);
  }
  return true;
}
