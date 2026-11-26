// Posto de Trabalho (Job Center) client system.
// Server-authoritative & persistent: syncs Firebase claimed ledgers with server DB,
// guards against concurrent claims, and commits reward + claimed-date keys atomically.
import { S, bal } from "../state.js";
import { increment } from "../firebase.js";
import { commit, savePath } from "./db.js";
import { toast } from "../ui/toast.js";
import { t } from "../i18n.js";
import { fetchInbox } from "./mail.js";

let depositBusy = false;
let shiftClaimBusy = false;
let dailyClaimBusy = false;

function getClaimedDailyDatesMap() {
  const src = S.save?.workstation?.claimedDailyDates;
  return src && typeof src === "object" ? src : {};
}

function getClaimedShiftCyclesMap() {
  const src = S.save?.workstation?.claimedShiftCycles;
  return src && typeof src === "object" ? src : {};
}

function recordLocalWorkstationClaims(claimedDates = [], claimedShiftCycles = [], ts = Date.now()) {
  if (!S.save) return;
  if (!S.save.workstation || typeof S.save.workstation !== "object") {
    S.save.workstation = { claimedDailyDates: {}, claimedShiftCycles: {} };
  }
  for (const d of claimedDates) {
    if (d) S.save.workstation.claimedDailyDates[d] = ts;
  }
  for (const c of claimedShiftCycles) {
    if (c != null) S.save.workstation.claimedShiftCycles[String(c)] = ts;
  }
}

function msUntilNextUtcDayLocal() {
  const now = new Date();
  return Math.max(1000, Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0) - now.getTime());
}

const emptyShiftPool = () => ({
  cycleId: Math.floor(Date.now() / (30 * 60 * 1000)),
  cycleDurationMs: 30 * 60 * 1000,
  cycleRemainingMs: (30 * 60 * 1000) - (Date.now() % (30 * 60 * 1000)),
  participantsCount: 0,
  totalDepositedPP: 0,
  myRank: null,
  myDepositedPP: 0,
  myEstimatedBronze: 0,
  leaderboard: []
});

const emptyDailyPool = () => ({
  utcDate: new Date().toISOString().slice(0, 10),
  nextResetMs: msUntilNextUtcDayLocal(),
  participantsCount: 0,
  topCount: 0,
  ruleTier: "under11",
  totalPoints: 0,
  poolBronze: 0,
  myPoints: 0,
  myRank: null,
  myInTop: false,
  myEstimatedBronze: 0,
  dailyReadyToClaimBronze: 0,
  unclaimedDates: [],
  dailyHistory: [],
  leaderboard: []
});

export async function getWorkstationStatus() {
  const shiftFallback = emptyShiftPool();
  if (!S.uid) {
    return {
      cycleId: shiftFallback.cycleId,
      cycleRemainingMs: shiftFallback.cycleRemainingMs,
      cycleDurationMs: 30 * 60 * 1000,
      depositedPP: 0,
      estimatedBronze: 0,
      readyToClaimBronze: 0,
      ratePercent: 5,
      history: [],
      shiftPool: shiftFallback,
      dailyPool: emptyDailyPool()
    };
  }
  try {
    const params = new URLSearchParams({ uid: S.uid });
    if (S.profile?.username) params.set("name", S.profile.username);
    const claimedDates = Object.keys(getClaimedDailyDatesMap()).filter((d) => getClaimedDailyDatesMap()[d]);
    const claimedShifts = Object.keys(getClaimedShiftCyclesMap()).filter((c) => getClaimedShiftCyclesMap()[c]);
    if (claimedDates.length > 0) params.set("claimedDates", claimedDates.join(","));
    if (claimedShifts.length > 0) params.set("claimedShifts", claimedShifts.join(","));

    const res = await fetch(`/api/workstation/status?${params.toString()}`);
    if (!res.ok) throw new Error("HTTP error " + res.status);
    return await res.json();
  } catch (err) {
    console.warn("[workstation]", err);
    return {
      cycleId: shiftFallback.cycleId,
      cycleRemainingMs: shiftFallback.cycleRemainingMs,
      cycleDurationMs: 30 * 60 * 1000,
      depositedPP: 0,
      estimatedBronze: 0,
      readyToClaimBronze: 0,
      ratePercent: 5,
      history: [],
      shiftPool: shiftFallback,
      dailyPool: emptyDailyPool()
    };
  }
}

export async function depositWorkstationPP(amount) {
  if (depositBusy) return false;
  const amt = Math.floor(Number(amount));
  if (!S.uid || isNaN(amt) || amt <= 0) {
    toast(t("ws.errInvalidAmount"), "bad");
    return false;
  }
  if (bal("pp") < amt) {
    toast(t("msg.notEnough"), "bad");
    return false;
  }

  depositBusy = true;
  const playerName = S.profile?.username || "Jogador";

  try {
    let txId = null;
    const valRes = await fetch("/api/workstation/validate-deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, name: playerName, amount: amt, clientBalancePP: bal("pp") })
    });
    const valData = await valRes.json();
    if (!valRes.ok || !valData.allowed) {
      toast(t("msg.notEnough"), "bad");
      return false;
    }
    txId = valData.txId;

    const ok = await commit({
      [savePath(S.uid, "wallet/pp")]: increment(-amt)
    });
    if (!ok) return false;

    try {
      const res = await fetch("/api/workstation/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: S.uid, name: playerName, amount: amt, txId })
      });
      if (!res.ok) throw new Error("Server rejected deposit confirmation");
      const data = await res.json();
      toast(t("ws.depositSuccess", { n: amt }), "good");
      return data;
    } catch (err) {
      console.error("[workstation deposit]", err);
      await commit({ [savePath(S.uid, "wallet/pp")]: increment(amt) });
      toast(t("msg.error"), "bad");
      return false;
    }
  } catch (err) {
    console.error("[workstation validate]", err);
    toast(t("msg.error"), "bad");
    return false;
  } finally {
    depositBusy = false;
  }
}

export async function claimWorkstationBronze() {
  if (!S.uid || shiftClaimBusy) return false;
  shiftClaimBusy = true;
  try {
    const res = await fetch("/api/workstation/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: S.uid,
        claimedShiftCycles: getClaimedShiftCyclesMap()
      })
    });
    if (!res.ok) throw new Error("Server rejected claim");
    const data = await res.json();
    const claimed = data.claimedBronze || 0;
    if (!data.allowed || claimed <= 0) {
      toast(t(data.pending ? "ws.claimInProgress" : "ws.nothingToClaim"), "bad");
      return false;
    }

    const nowTs = Date.now();
    const cycleIds = Array.isArray(data.claimedShiftCycles) ? data.claimedShiftCycles : [];
    const updates = {
      [savePath(S.uid, "wallet/bronze")]: increment(claimed)
    };
    for (const cId of cycleIds) {
      updates[savePath(S.uid, `workstation/claimedShiftCycles/${cId}`)] = nowTs;
    }

    const ok = await commit(updates);
    if (ok) {
      recordLocalWorkstationClaims([], cycleIds, nowTs);
      await fetch("/api/workstation/claim-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: S.uid, claimId: data.claimId })
      }).catch(() => {});
      toast(t("ws.claimSuccess", { n: claimed }), "good");
      fetchInbox();
      return data;
    }

    await fetch("/api/workstation/claim-rollback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, claimId: data.claimId })
    }).catch(() => {});
    return false;
  } catch (err) {
    console.error("[workstation claim]", err);
    toast(t("msg.error"), "bad");
    return false;
  } finally {
    shiftClaimBusy = false;
  }
}

export async function claimDailyPoolBronze() {
  if (!S.uid || dailyClaimBusy) return false;
  dailyClaimBusy = true;
  try {
    const res = await fetch("/api/workstation/daily-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: S.uid,
        claimedDailyDates: getClaimedDailyDatesMap()
      })
    });
    if (!res.ok) throw new Error("Server rejected daily claim");
    const data = await res.json();
    const claimed = data.claimedBronze || 0;
    if (!data.allowed || claimed <= 0) {
      toast(t(data.pending ? "ws.claimInProgress" : "ws.nothingToClaim"), "bad");
      return false;
    }

    const nowTs = Date.now();
    const claimedDates = Array.isArray(data.claimedDates) ? data.claimedDates : [];
    const updates = {
      [savePath(S.uid, "wallet/bronze")]: increment(claimed)
    };
    for (const dateKey of claimedDates) {
      updates[savePath(S.uid, `workstation/claimedDailyDates/${dateKey}`)] = nowTs;
    }

    const ok = await commit(updates);
    if (ok) {
      recordLocalWorkstationClaims(claimedDates, [], nowTs);
      await fetch("/api/workstation/daily-claim-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: S.uid, claimId: data.claimId })
      }).catch(() => {});
      toast(t("ws.dailyClaimSuccess", { n: claimed }), "good");
      fetchInbox();
      return data;
    }

    await fetch("/api/workstation/daily-claim-rollback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, claimId: data.claimId })
    }).catch(() => {});
    return false;
  } catch (err) {
    console.error("[workstation daily claim]", err);
    toast(t("msg.error"), "bad");
    return false;
  } finally {
    dailyClaimBusy = false;
  }
}
