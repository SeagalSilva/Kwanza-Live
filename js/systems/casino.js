// Client system for the Casa de Apostas (Betting House):
// - 3 sets of Slot Machines (4x Set 1: 1x3, 4x Set 2: 3x3 5-line, 2x Set 3: 3x5 20-line VIP)
// - Server-enforced exclusive machine occupancy + heartbeat
// - Server-authoritative 12-slice Roulette + 4-slice Positive Side Bonus Wheel
import { S, bal } from "../state.js";
import { emit } from "../bus.js";
import { increment } from "../firebase.js";
import { t } from "../i18n.js";
import { toast } from "../ui/toast.js";
import { commit, savePath } from "./db.js";

export const SLOT_MACHINES = [
  // Set 1 (4 machines): 1x3, 1 line, 8x prize + 2 to 5 extra free spins
  { id: "slot_1", set: 1, rows: 1, cols: 3, lines: 1,  name: "Frutas Clássicas", color: "#e74c3c", symbols: ["🍒", "🍋", "🍇", "🍉"] },
  { id: "slot_2", set: 1, rows: 1, cols: 3, lines: 1,  name: "Ouro de Kwanza",   color: "#f1c40f", symbols: ["🥇", "💰", "👑", "🪙"] },
  { id: "slot_3", set: 1, rows: 1, cols: 3, lines: 1,  name: "Trevo Rápido",     color: "#1abc9c", symbols: ["🍀", "🎲", "🎯", "🃏"] },
  { id: "slot_4", set: 1, rows: 1, cols: 3, lines: 1,  name: "Chama Clássica",   color: "#d35400", symbols: ["🔥", "🌶️", "🧨", "💥"] },

  // Set 2 (4 machines): 3x3, 5 paylines, up to 3x per line + Bonus (3->5, 5->8, 6+->12 FS)
  { id: "slot_5", set: 2, rows: 3, cols: 3, lines: 5,  name: "Selva 3×3",        color: "#2ecc71", symbols: ["🦁", "🐘", "🌴", "🦒"] },
  { id: "slot_6", set: 2, rows: 3, cols: 3, lines: 5,  name: "Estrela 3×3",      color: "#9b59b6", symbols: ["⭐", "🌟", "🌙", "☄️"] },
  { id: "slot_7", set: 2, rows: 3, cols: 3, lines: 5,  name: "Trovão 3×3",       color: "#e67e22", symbols: ["⚡", "🔔", "🏆", "🎖️"] },
  { id: "slot_8", set: 2, rows: 3, cols: 3, lines: 5,  name: "Colheita 3×3",     color: "#27ae60", symbols: ["🍍", "🍌", "🌽", "🥜"] },

  // Set 3 (2 VIP machines): 3x5, 20 paylines, 6 icons, up to 5x/line, Bonus (>=1 Wild/FS) + Scatter (10 FS w/ 2x-5x Wilds)
  { id: "slot_9",  set: 3, rows: 3, cols: 5, lines: 20, name: "Diamante VIP 3×5", color: "#3498db", symbols: ["💎", "👑", "✨", "💍", "🔮", "🧿"] },
  { id: "slot_10", set: 3, rows: 3, cols: 5, lines: 20, name: "Dragão VIP 3×5",   color: "#c0392b", symbols: ["🐉", "🏮", "🪙", "🎴", "🥠", "🥢"] }
];

export const MAIN_ROULETTE_SLICES = [
  { index: 0,  type: "loss",              short: "✕",     labelKey: "cas.sliceLoss",       color: "#2a1b24" },
  { index: 1,  type: "win_50pct",         short: "+50%",  labelKey: "cas.slice50",         color: "#1e7e4f" },
  { index: 2,  type: "loss",              short: "✕",     labelKey: "cas.sliceLoss",       color: "#2a1b24" },
  { index: 3,  type: "free_spin_2",       short: "2 FS",  labelKey: "cas.slice2FS",        color: "#2266aa" },
  { index: 4,  type: "loss",              short: "✕",     labelKey: "cas.sliceLoss",       color: "#2a1b24" },
  { index: 5,  type: "super_bonus_wheel", short: "⚡",    labelKey: "cas.sliceSuperBonus", color: "#c0392b" },
  { index: 6,  type: "loss",              short: "✕",     labelKey: "cas.sliceLoss",       color: "#2a1b24" },
  { index: 7,  type: "win_2x",            short: "2×",    labelKey: "cas.slice2x",         color: "#b9770e" },
  { index: 8,  type: "loss",              short: "✕",     labelKey: "cas.sliceLoss",       color: "#2a1b24" },
  { index: 9,  type: "win_50pct",         short: "+50%",  labelKey: "cas.slice50",         color: "#1e7e4f" },
  { index: 10, type: "loss",              short: "✕",     labelKey: "cas.sliceLoss",       color: "#2a1b24" },
  { index: 11, type: "free_spin_2",       short: "2 FS",  labelKey: "cas.slice2FS",        color: "#2266aa" },
  { index: 12, type: "loss",              short: "✕",     labelKey: "cas.sliceLoss",       color: "#2a1b24" },
  { index: 13, type: "bonus_wheel",       short: "🎡",    labelKey: "cas.sliceBonus",      color: "#8e44ad" },
  { index: 14, type: "loss",              short: "✕",     labelKey: "cas.sliceLoss",       color: "#2a1b24" }
];

export const BONUS_ROULETTE_SLICES = [
  { index: 0, type: "refund_1fs", short: "1×+1FS", labelKey: "cas.bonusRefund1FS", color: "#2980b9" },
  { index: 1, type: "refund",     short: "1×",     labelKey: "cas.bonusRefund",    color: "#16a085" },
  { index: 2, type: "free_3fs",   short: "3 FS",   labelKey: "cas.bonus3FS",       color: "#8e44ad" },
  { index: 3, type: "win_3x",     short: "3×",     labelKey: "cas.bonus3x",        color: "#d4ac0d" }
];

export const SUPER_ROULETTE_SLICES = [
  { index: 0,  type: "nada", short: "✕",     value: 0,   labelKey: "cas.superLoss", color: "#251822" },
  { index: 1,  type: "fs",   short: "+1 FS", value: 1,   labelKey: "cas.superFS",   color: "#1f6fb2" },
  { index: 2,  type: "mult", short: "1.5×",  value: 1.5, labelKey: "cas.superMult", color: "#1e8449" },
  { index: 3,  type: "fs",   short: "+2 FS", value: 2,   labelKey: "cas.superFS",   color: "#2874a6" },
  { index: 4,  type: "mult", short: "2×",    value: 2,   labelKey: "cas.superMult", color: "#b7950b" },
  { index: 5,  type: "fs",   short: "+4 FS", value: 4,   labelKey: "cas.superFS",   color: "#6c3483" },
  { index: 6,  type: "nada", short: "✕",     value: 0,   labelKey: "cas.superLoss", color: "#251822" },
  { index: 7,  type: "mult", short: "3×",    value: 3,   labelKey: "cas.superMult", color: "#d68910" },
  { index: 8,  type: "fs",   short: "+3 FS", value: 3,   labelKey: "cas.superFS",   color: "#2e86c1" },
  { index: 9,  type: "mult", short: "4×",    value: 4,   labelKey: "cas.superMult", color: "#ca6f1e" },
  { index: 10, type: "fs",   short: "+5 FS", value: 5,   labelKey: "cas.superFS",   color: "#884ea0" },
  { index: 11, type: "mult", short: "5×",    value: 5,   labelKey: "cas.superMult", color: "#d4ac0d" }
];

let casinoSyncTimer = null;
let casinoAnimDepth = 0;

export async function syncCasinoState() {
  if (!S.uid) return S.casino;
  try {
    const res = await fetch(`/api/casino/state?uid=${encodeURIComponent(S.uid)}`);
    if (!res.ok) return S.casino;
    const data = await res.json();
    // Always keep machine occupancy fresh; pause session/win state updates while an animation is playing
    if (casinoAnimDepth > 0) {
      S.casino.machines = data.machines || S.casino.machines || {};
      return S.casino;
    }
    S.casino = {
      machines: data.machines || {},
      roulette: data.roulette || { freeSpins: 0, lockedBet: 0 },
      slotSession: data.slotSession || { machineId: null, freeSpins: 0, lockedBet: 0, mode: null },
      recentWins: Array.isArray(data.recentWins) ? data.recentWins : []
    };
    emit("casino");
  } catch (_) {}
  return S.casino;
}

export function startCasinoSync() {
  stopCasinoSync();
  syncCasinoState();
  casinoSyncTimer = setInterval(() => {
    if (S.room === "casino") syncCasinoState();
  }, 3000);
}

export function stopCasinoSync() {
  if (casinoSyncTimer) {
    clearInterval(casinoSyncTimer);
    casinoSyncTimer = null;
  }
}

export async function occupySlotMachine(machineId) {
  if (!S.uid) return false;
  try {
    const res = await fetch("/api/casino/slot/occupy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: S.uid,
        name: S.profile?.username || "Jogador",
        machineId
      })
    });
    const data = await res.json();
    if (!res.ok || !data.allowed) {
      toast(t("cas.machineOccupied", { name: data.occupiedBy || "?" }), "bad");
      await syncCasinoState();
      return false;
    }
    S.casino.machines = data.machines || S.casino.machines;
    S.casino.slotSession = { machineId, freeSpins: 0, lockedBet: 0, mode: null };
    emit("casino");
    return true;
  } catch (_) {
    toast(t("msg.error"), "bad");
    return false;
  }
}

export async function heartbeatSlotMachine(machineId) {
  if (!S.uid || !machineId) return;
  fetch("/api/casino/slot/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid: S.uid, machineId })
  }).catch(() => {});
}

export async function releaseSlotMachine() {
  if (!S.uid) return;
  S.casino.slotSession = { machineId: null, freeSpins: 0, lockedBet: 0, mode: null };
  try {
    const res = await fetch("/api/casino/slot/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid })
    });
    if (res.ok) {
      const data = await res.json();
      S.casino.machines = data.machines || {};
      emit("casino");
    }
  } catch (_) {}
}

export async function spinSlotMachine(machineId, bet) {
  if (!S.uid) return null;
  const activeFs = S.casino.slotSession?.machineId === machineId ? (S.casino.slotSession?.freeSpins || 0) : 0;
  const amt = Math.floor(Number(bet));
  if (activeFs <= 0 && (isNaN(amt) || amt < 1)) {
    toast(t("cas.errBet"), "bad");
    return null;
  }

  let valData = null;
  try {
    const valRes = await fetch("/api/casino/slot/validate-spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, machineId, bet: amt, bronzeBalance: bal("bronze") })
    });
    valData = await valRes.json();
    if (!valRes.ok || !valData.allowed) {
      toast(valRes.status === 409 ? t("cas.machineOccupied", { name: "?" }) : t("msg.notEnough"), "bad");
      return null;
    }
  } catch (_) {
    toast(t("msg.error"), "bad");
    return null;
  }

  if (valData.cost > 0) {
    const paid = await commit({ [savePath(S.uid, "wallet/bronze")]: increment(-valData.cost) });
    if (!paid) return null;
  }

  try {
    const spinRes = await fetch("/api/casino/slot/spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, name: S.profile?.username || "Jogador", txId: valData.txId })
    });
    const result = await spinRes.json();
    if (!spinRes.ok || !result.success) throw new Error("Spin failed");

    casinoAnimDepth++;
    let settled = false;
    result.settle = async () => {
      if (settled) return;
      settled = true;
      try {
        S.casino.slotSession = result.session || { machineId, freeSpins: 0, lockedBet: 0, mode: null };
        if (result.payout > 0) {
          S._casinoHudSuppressUntil = Date.now() + 2500;
          const wonOk = await commit({ [savePath(S.uid, "wallet/bronze")]: increment(result.payout) });
          if (wonOk && result.payoutId) {
            fetch("/api/casino/payout-confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ uid: S.uid, payoutId: result.payoutId })
            }).catch(() => {});
          }
        }
      } finally {
        casinoAnimDepth = Math.max(0, casinoAnimDepth - 1);
        emit("casino");
      }
    };
    return result;
  } catch (_) {
    if (valData.cost > 0) {
      await commit({ [savePath(S.uid, "wallet/bronze")]: increment(valData.cost) });
    }
    toast(t("msg.error"), "bad");
    return null;
  }
}

export async function spinRoulette(bet) {
  if (!S.uid) return null;
  const requestedBet = Math.floor(Number(bet));
  if ((S.casino.roulette?.freeSpins || 0) <= 0 && (isNaN(requestedBet) || requestedBet < 1)) {
    toast(t("cas.errBet"), "bad");
    return null;
  }

  let valData = null;
  try {
    const valRes = await fetch("/api/casino/roulette/validate-spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, bet: requestedBet, bronzeBalance: bal("bronze") })
    });
    valData = await valRes.json();
    if (!valRes.ok || !valData.allowed) {
      toast(t("msg.notEnough"), "bad");
      return null;
    }
  } catch (_) {
    toast(t("msg.error"), "bad");
    return null;
  }

  if (valData.cost > 0) {
    const paid = await commit({ [savePath(S.uid, "wallet/bronze")]: increment(-valData.cost) });
    if (!paid) return null;
  }

  try {
    const spinRes = await fetch("/api/casino/roulette/spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, name: S.profile?.username || "Jogador", txId: valData.txId })
    });
    const result = await spinRes.json();
    if (!spinRes.ok || !result.success) throw new Error("Roulette spin failed");

    casinoAnimDepth++;
    let settled = false;
    result.settle = async () => {
      if (settled) return;
      settled = true;
      try {
        S.casino.roulette = result.session || { freeSpins: 0, lockedBet: 0 };
        if (result.payout > 0) {
          S._casinoHudSuppressUntil = Date.now() + 2500;
          const wonOk = await commit({ [savePath(S.uid, "wallet/bronze")]: increment(result.payout) });
          if (wonOk && result.payoutId) {
            fetch("/api/casino/payout-confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ uid: S.uid, payoutId: result.payoutId })
            }).catch(() => {});
          }
        }
      } finally {
        casinoAnimDepth = Math.max(0, casinoAnimDepth - 1);
        emit("casino");
      }
    };
    return result;
  } catch (_) {
    if (valData.cost > 0) {
      await commit({ [savePath(S.uid, "wallet/bronze")]: increment(valData.cost) });
    }
    toast(t("msg.error"), "bad");
    return null;
  }
}

export async function forfeitRouletteFreeSpins() {
  if (!S.uid) return;
  S.casino.roulette = { freeSpins: 0, lockedBet: 0 };
  emit("casino");
  try {
    await fetch("/api/casino/roulette/forfeit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid })
    });
  } catch (_) {}
}
