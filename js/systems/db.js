// Shared helper: apply an atomic multi-path update and report errors to the player.
import { db, ref, update } from "../firebase.js";
import { toast } from "../ui/toast.js";
import { t } from "../i18n.js";

/**
 * Commit several writes atomically. Either all of them happen or none do.
 * Returns true on success. `deniedKey` is the message shown when the server
 * refuses the write (e.g. somebody else took the tile / land first).
 */
export async function commit(updates, deniedKey = "msg.error") {
  try {
    await update(ref(db), updates);
    return true;
  } catch (e) {
    console.warn("[commit]", e);
    const denied = String(e?.code || e?.message || "").toLowerCase().includes("permission");
    toast(t(denied ? deniedKey : "msg.error"), "bad");
    return false;
  }
}

export const savePath = (uid, sub) => `users/${uid}/save/${sub}`;
