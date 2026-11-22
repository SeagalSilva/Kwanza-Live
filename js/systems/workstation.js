// Posto de Trabalho (Job Center) client system.
// Server-authoritative logic: Pool Points deposited in the 30-min shift
// are converted to bronze coins at a 5% rate upon cycle completion.
import { S, bal } from "../state.js";
import { increment } from "../firebase.js";
import { commit, savePath } from "./db.js";
import { toast } from "../ui/toast.js";
import { t } from "../i18n.js";

export async function getWorkstationStatus() {
  const uid = S.uid || "guest";
  try {
    const res = await fetch(`/api/workstation/status?uid=${encodeURIComponent(uid)}`);
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
      history: []
    };
  }
}

export async function depositWorkstationPP(amount) {
  const amt = Math.floor(Number(amount));
  if (isNaN(amt) || amt <= 0) {
    toast(t("ws.errInvalidAmount"), "bad");
    return false;
  }
  if (bal("pp") < amt) {
    toast(t("msg.notEnough"), "bad");
    return false;
  }

  // Deduct from wallet atomically in Firebase
  const ok = await commit({
    [savePath(S.uid, "wallet/pp")]: increment(-amt)
  });
  if (!ok) return false;

  // Record with server authority
  try {
    const res = await fetch("/api/workstation/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid || "guest", amount: amt })
    });
    if (!res.ok) throw new Error("Server rejected deposit");
    const data = await res.json();
    toast(t("ws.depositSuccess", { n: amt }), "good");
    return data;
  } catch (err) {
    console.error("[workstation deposit]", err);
    toast(t("msg.error"), "bad");
    return false;
  }
}

export async function claimWorkstationBronze() {
  try {
    const res = await fetch("/api/workstation/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid || "guest" })
    });
    if (!res.ok) throw new Error("Server rejected claim");
    const data = await res.json();
    const claimed = data.claimedBronze || 0;
    if (claimed <= 0) {
      toast(t("ws.nothingToClaim"), "bad");
      return false;
    }

    // Credit bronze coins to Firebase wallet
    const ok = await commit({
      [savePath(S.uid, "wallet/bronze")]: increment(claimed)
    });
    if (ok) {
      toast(t("ws.claimSuccess", { n: claimed }), "good");
    }
    return ok ? data : false;
  } catch (err) {
    console.error("[workstation claim]", err);
    toast(t("msg.error"), "bad");
    return false;
  }
}
