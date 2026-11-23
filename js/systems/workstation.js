// Posto de Trabalho (Job Center) client system.
// Server-authoritative & persistent: validates action with server BEFORE deducting wallet,
// stores deposited PP & cycle rewards in the server database, and supports rollback on failure.
import { S, bal } from "../state.js";
import { increment } from "../firebase.js";
import { commit, savePath } from "./db.js";
import { toast } from "../ui/toast.js";
import { t } from "../i18n.js";

const emptyDailyPool = () => ({
  utcDate: new Date().toISOString().slice(0, 10),
  nextResetMs: 0,
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
  dailyHistory: [],
  leaderboard: []
});

export async function getWorkstationStatus() {
  if (!S.uid) {
    return {
      cycleId: 0,
      cycleRemainingMs: 30 * 60 * 1000,
      cycleDurationMs: 30 * 60 * 1000,
      depositedPP: 0,
      estimatedBronze: 0,
      readyToClaimBronze: 0,
      ratePercent: 5,
      history: [],
      dailyPool: emptyDailyPool()
    };
  }
  try {
    const res = await fetch(`/api/workstation/status?uid=${encodeURIComponent(S.uid)}`);
    if (!res.ok) throw new Error("HTTP error " + res.status);
    return await res.json();
  } catch (err) {
    console.warn("[workstation]", err);
    return {
      cycleId: 0,
      cycleRemainingMs: 30 * 60 * 1000,
      cycleDurationMs: 30 * 60 * 1000,
      depositedPP: 0,
      estimatedBronze: 0,
      readyToClaimBronze: 0,
      ratePercent: 5,
      history: [],
      dailyPool: emptyDailyPool()
    };
  }
}

export async function depositWorkstationPP(amount) {
  const amt = Math.floor(Number(amount));
  if (!S.uid || isNaN(amt) || amt <= 0) {
    toast(t("ws.errInvalidAmount"), "bad");
    return false;
  }
  if (bal("pp") < amt) {
    toast(t("msg.notEnough"), "bad");
    return false;
  }

  // Step 1: Ask server if this deposit action is allowed
  let txId = null;
  try {
    const valRes = await fetch("/api/workstation/validate-deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, amount: amt, clientBalancePP: bal("pp") })
    });
    const valData = await valRes.json();
    if (!valRes.ok || !valData.allowed) {
      toast(t("msg.notEnough"), "bad");
      return false;
    }
    txId = valData.txId;
  } catch (err) {
    console.error("[workstation validate]", err);
    toast(t("msg.error"), "bad");
    return false;
  }

  // Step 2: Deduct PP atomically in player's Firebase wallet
  const ok = await commit({
    [savePath(S.uid, "wallet/pp")]: increment(-amt)
  });
  if (!ok) return false;

  // Step 3: Confirm & persist deposited points in server database
  try {
    const res = await fetch("/api/workstation/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, amount: amt, txId })
    });
    if (!res.ok) throw new Error("Server rejected deposit confirmation");
    const data = await res.json();
    toast(t("ws.depositSuccess", { n: amt }), "good");
    return data;
  } catch (err) {
    console.error("[workstation deposit]", err);
    // Refund client wallet if server confirmation failed
    await commit({ [savePath(S.uid, "wallet/pp")]: increment(amt) });
    toast(t("msg.error"), "bad");
    return false;
  }
}

export async function claimWorkstationBronze() {
  if (!S.uid) return false;
  try {
    const res = await fetch("/api/workstation/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid })
    });
    if (!res.ok) throw new Error("Server rejected claim");
    const data = await res.json();
    const claimed = data.claimedBronze || 0;
    if (!data.allowed || claimed <= 0) {
      toast(t("ws.nothingToClaim"), "bad");
      return false;
    }

    const ok = await commit({
      [savePath(S.uid, "wallet/bronze")]: increment(claimed)
    });
    if (ok) {
      await fetch("/api/workstation/claim-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: S.uid, claimId: data.claimId })
      }).catch(() => {});
      toast(t("ws.claimSuccess", { n: claimed }), "good");
      return data;
    }

    // Rollback on server if Firebase commit failed
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
  }
}

export async function claimDailyPoolBronze() {
  if (!S.uid) return false;
  try {
    const res = await fetch("/api/workstation/daily-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid })
    });
    if (!res.ok) throw new Error("Server rejected daily claim");
    const data = await res.json();
    const claimed = data.claimedBronze || 0;
    if (!data.allowed || claimed <= 0) {
      toast(t("ws.nothingToClaim"), "bad");
      return false;
    }

    const ok = await commit({
      [savePath(S.uid, "wallet/bronze")]: increment(claimed)
    });
    if (ok) {
      await fetch("/api/workstation/daily-claim-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: S.uid, claimId: data.claimId })
      }).catch(() => {});
      toast(t("ws.dailyClaimSuccess", { n: claimed }), "good");
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
  }
}
