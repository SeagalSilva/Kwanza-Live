// ─────────────────────────────────────────────────────────────
//  Correio (Post Office / Mailbox) System
//  - Keeps track of unclaimed 30-min shift rewards
//  - Keeps track of Daily Pool rewards (synced 1x per UTC date with Firebase)
//  - Uses in-flight locking + atomic confirm / rollback so rewards are never duplicated
// ─────────────────────────────────────────────────────────────
import { S } from "../state.js";
import { commit, savePath } from "./db.js";
import { increment } from "../firebase.js";
import { t } from "../i18n.js";
import { toast } from "../ui/toast.js";
import { emit } from "../bus.js";

let mailState = {
  mails: [],
  unreadCount: 0,
  totalClaimableBronze: 0,
  loading: false,
  claiming: false
};

let syncTimer = null;

export const getMailState = () => mailState;

function getClaimedDailyDatesMap() {
  const src = S.save?.workstation?.claimedDailyDates;
  return src && typeof src === "object" ? src : {};
}

function getClaimedShiftCyclesMap() {
  const src = S.save?.workstation?.claimedShiftCycles;
  return src && typeof src === "object" ? src : {};
}

export async function fetchInbox() {
  if (!S.uid) return mailState;
  mailState.loading = true;
  try {
    const params = new URLSearchParams();
    const dKeys = Object.keys(getClaimedDailyDatesMap()).filter((d) => getClaimedDailyDatesMap()[d]);
    const sKeys = Object.keys(getClaimedShiftCyclesMap()).filter((c) => getClaimedShiftCyclesMap()[c]);
    if (dKeys.length > 0) params.set("claimedDates", dKeys.join(","));
    if (sKeys.length > 0) params.set("claimedShifts", sKeys.join(","));
    const qs = params.toString();

    const res = await fetch(`/api/mail/inbox/${encodeURIComponent(S.uid)}${qs ? `?${qs}` : ""}`);
    if (res.ok) {
      const data = await res.json();
      mailState.mails = data.mails || [];
      mailState.unreadCount = data.unreadCount || 0;
      mailState.totalClaimableBronze = data.totalClaimableBronze || 0;
      emit("mail", mailState);
    }
  } catch (err) {
    console.warn("[mail] Error fetching inbox:", err);
  } finally {
    mailState.loading = false;
  }
  return mailState;
}

async function processClaimRequest(payload, successMsgKey) {
  if (!S.uid || mailState.claiming) return false;
  mailState.claiming = true;
  emit("mail", mailState);
  try {
    const res = await fetch("/api/mail/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: S.uid,
        claimedDailyDates: getClaimedDailyDatesMap(),
        claimedShiftCycles: getClaimedShiftCyclesMap(),
        ...payload
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      toast(t("msg.error"), "bad");
      return false;
    }

    const bronze = Number(data.claimedBronze) || 0;
    const items = data.claimedItems || {};
    const claimedDates = Array.isArray(data.claimedDates) ? data.claimedDates : [];
    const claimedShiftCycles = Array.isArray(data.claimedShiftCycles) ? data.claimedShiftCycles : [];
    const nowTs = Date.now();

    const updates = {};
    if (bronze > 0) {
      updates[savePath(S.uid, "wallet/bronze")] = increment(bronze);
    }
    for (const [itemKey, qty] of Object.entries(items)) {
      if (qty > 0) updates[savePath(S.uid, `inv/${itemKey}`)] = increment(qty);
    }
    for (const dateKey of claimedDates) {
      updates[savePath(S.uid, `workstation/claimedDailyDates/${dateKey}`)] = nowTs;
    }
    for (const cycleId of claimedShiftCycles) {
      updates[savePath(S.uid, `workstation/claimedShiftCycles/${cycleId}`)] = nowTs;
    }

    if (Object.keys(updates).length === 0) {
      toast(t("mail.nothingToClaim"), "alt");
      await fetchInbox();
      return false;
    }

    const ok = await commit(updates);
    if (ok) {
      if (!S.save.workstation || typeof S.save.workstation !== "object") {
        S.save.workstation = { claimedDailyDates: {}, claimedShiftCycles: {} };
      }
      for (const d of claimedDates) S.save.workstation.claimedDailyDates[d] = nowTs;
      for (const c of claimedShiftCycles) S.save.workstation.claimedShiftCycles[String(c)] = nowTs;

      if (data.claimId) {
        await fetch("/api/mail/claim-confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: S.uid, claimId: data.claimId })
        }).catch(() => {});
      }
      if (bronze > 0 && S.save?.wallet) {
        S.save.wallet.bronze = (S.save.wallet.bronze || 0) + bronze;
      }
      emit("save");
      if (bronze > 0) {
        emit("coinsReceived", { bronze });
        toast(t(successMsgKey, { n: bronze }), "good");
      }
      await fetchInbox();
      return true;
    }

    if (data.claimId) {
      await fetch("/api/mail/claim-rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: S.uid, claimId: data.claimId })
      }).catch(() => {});
    }
    return false;
  } catch (err) {
    console.error("[mail] Claim failed:", err);
    toast(t("msg.error"), "bad");
    return false;
  } finally {
    mailState.claiming = false;
    emit("mail", mailState);
  }
}

export async function claimMail(mailId) {
  if (!mailId) return false;
  return processClaimRequest({ mailId }, "mail.claimedSuccess");
}

export async function claimAllMail() {
  return processClaimRequest({ claimAll: true }, "mail.claimAllSuccess");
}

export async function markMailRead(mailId) {
  if (!S.uid || !mailId) return;
  const m = mailState.mails.find((x) => x.id === mailId);
  if (m && !m.read) {
    m.read = true;
    mailState.unreadCount = mailState.mails.filter((x) => !x.read || (x.reward && !x.claimed)).length;
    fetch("/api/mail/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, mailId })
    }).catch(() => {});
    emit("mail", mailState);
  }
}

export function startMailSync() {
  stopMailSync();
  fetchInbox();
  syncTimer = setInterval(fetchInbox, 30_000);
}

export function stopMailSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
