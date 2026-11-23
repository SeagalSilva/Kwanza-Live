// Dungeon Entrance Hall modal: multi-phase overview, 10-floor selector for Phase 1, and run entry/resume.
import { S } from "../../state.js";
import { t, getLang } from "../../i18n.js";
import { esc } from "../../utils.js";
import { openModal, closeModal } from "../modal.js";
import { toast } from "../toast.js";
import { fetchDungeonState, enterDungeonRoomWithRun } from "../../world/dungeonRoom.js";

let selectedFloorByPhase = { forest_entrance: 1 };

export function openDungeonModal({ me, exitEditFn } = {}) {
  let loading = true;
  let loadError = false;
  let closed = false;

  const api = openModal({
    title: () => `🌲 ${t("place.dungeon")}`,
    events: ["lang"],
    onClose: () => { closed = true; },
    render(body) {
      if (loading) {
        body.innerHTML = `<div class="dun-loading">${esc(t("loading"))}</div>`;
        return;
      }
      if (loadError) {
        body.innerHTML = `<div class="dun-loading">${esc(t("msg.error"))}</div>`;
        return;
      }
      renderDungeonModal(body, { me, exitEditFn });
    }
  });

  fetchDungeonState().then((state) => {
    if (closed) return;
    loading = false;
    loadError = !state;
    api.repaint();
  });
}

function renderDungeonModal(body, { me, exitEditFn }) {
  const lang = getLang();
  const phases = S.dungeon?.phases || [];
  const activeRun = S.dungeon?.activeRun || null;

  const cardsHtml = phases.map((p) => {
    const phaseName = lang === "en" ? p.nameEn : p.namePt;
    const themeLabel = lang === "en" ? p.themeLabelEn : p.themeLabelPt;
    const desc = lang === "en" ? p.descEn : p.descPt;

    if (p.comingSoon || !p.unlocked) {
      return `
        <section class="dun-phase-card locked" aria-disabled="true">
          <div class="dun-phase-head">
            <div>
              <h3>${esc(t("dun.phaseTitle", { n: p.number, name: phaseName }))}</h3>
              <p class="dun-meta">${esc(themeLabel)} · ${p.totalFloors} ${esc(t("dun.floorsWord"))} · ${esc(t("dun.comingSoon"))}</p>
            </div>
            <span class="dun-lock-ico" aria-hidden="true">🔒</span>
          </div>
          <p class="dun-desc">${esc(desc)}</p>
        </section>
      `;
    }

    const maxUnlocked = Math.max(1, Math.min(p.totalFloors, Number(p.highestFloor) || 1));
    const chosenFloor = Math.max(1, Math.min(maxUnlocked, Number(selectedFloorByPhase[p.id]) || maxUnlocked));
    selectedFloorByPhase[p.id] = chosenFloor;

    const floorButtons = Array.from({ length: p.totalFloors }, (_, i) => {
      const f = i + 1;
      const unlocked = f <= maxUnlocked;
      const isSelected = f === chosenFloor;
      const isBoss = f === p.totalFloors;
      const label = isBoss ? `${f} 👑` : `${f}`;
      return `
        <button
          type="button"
          class="dun-floor-btn ${isSelected ? "selected" : ""} ${isBoss ? "boss" : ""}"
          data-phase="${esc(p.id)}"
          data-floor="${f}"
          ${unlocked ? "" : "disabled"}
        >${label}</button>
      `;
    }).join("");

    const hasRunHere = activeRun && activeRun.phaseId === p.id && activeRun.hp > 0;

    return `
      <section class="dun-phase-card active">
        <div class="dun-phase-head">
          <div>
            <h3>${esc(t("dun.phaseTitle", { n: p.number, name: phaseName }))}</h3>
            <p class="dun-meta">
              ${esc(themeLabel)} · ${p.totalFloors} ${esc(t("dun.floorsWord"))} · ${esc(t("dun.maxUnlocked", { n: maxUnlocked, total: p.totalFloors }))} · ${esc(t("dun.clearsCount", { n: p.clears || 0 }))}
            </p>
          </div>
        </div>

        <p class="dun-desc">${esc(desc)}</p>

        <div class="dun-floors-label">${esc(t("dun.selectFloor"))}</div>
        <div class="dun-floor-grid">${floorButtons}</div>

        <div class="dun-actions">
          ${hasRunHere ? `
            <button type="button" class="btn ok dun-btn-resume" data-phase="${esc(p.id)}">
              ▶ ${esc(t("dun.resumeFloor", { n: activeRun.floor, hp: activeRun.hp, maxHp: activeRun.maxHp }))}
            </button>
          ` : ""}
          <button type="button" class="btn gold dun-btn-start" data-phase="${esc(p.id)}">
            ⚔️ ${esc(t("dun.enterFloor", { n: chosenFloor }))}
          </button>
        </div>
      </section>
    `;
  }).join("");

  body.innerHTML = `
    <div class="dun-wrap">
      <p class="dun-intro">${esc(t("dun.introDesc"))}</p>
      ${cardsHtml}
    </div>
  `;

  body.querySelectorAll(".dun-floor-btn:not([disabled])").forEach((btn) => {
    btn.onclick = () => {
      const pid = btn.dataset.phase;
      const fl = Number(btn.dataset.floor) || 1;
      selectedFloorByPhase[pid] = fl;
      renderDungeonModal(body, { me, exitEditFn });
    };
  });

  body.querySelectorAll(".dun-btn-resume").forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      await launchRun(btn.dataset.phase, undefined, { me, exitEditFn });
    };
  });

  body.querySelectorAll(".dun-btn-start").forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      const pid = btn.dataset.phase;
      const fl = selectedFloorByPhase[pid] || 1;
      await launchRun(pid, fl, { me, exitEditFn });
    };
  });
}

async function launchRun(phaseId, startFloor, { me, exitEditFn }) {
  try {
    const payload = {
      uid: S.uid,
      name: S.profile?.username || "Jogador",
      phaseId
    };
    if (startFloor !== undefined) payload.startFloor = startFloor;

    const res = await fetch("/api/dungeon/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.activeRun) {
      toast(data.error || t("msg.error"), "bad");
      return;
    }
    S.dungeon.phases = data.phases || S.dungeon.phases;
    S.dungeon.activeRun = data.activeRun;
    S.dungeon.floorDrops = data.floorDrops || [];
    closeModal();
    enterDungeonRoomWithRun(me, data.activeRun, exitEditFn, data.floorDrops || []);
  } catch (_) {
    toast(t("msg.error"), "bad");
  }
}
