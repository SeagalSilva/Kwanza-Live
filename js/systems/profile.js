// Username + character profile.
import { db, ref, get, set, update, serverTimestamp } from "../firebase.js";
import { START } from "../config.js";

export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

export async function usernameFree(name) {
  const snap = await get(ref(db, `usernames/${name.toLowerCase()}`));
  return !snap.exists();
}

export async function loadProfile(uid) {
  const snap = await get(ref(db, `users/${uid}/profile`));
  return snap.exists() ? snap.val() : null;
}

export const defaultSave = () => ({
  wallet: { pp: START.pp, bronze: START.bronze || 0, silver: 0, gold: 0 },
  inv: { ...START.inv },
  energy: { current: 100, max: 100, lastRegen: Date.now() },
  adExemptUntil: 0
});

/** Reserve the username, store the profile and give the starter kit — atomically. */
export async function createProfile(uid, { username, look }) {
  await update(ref(db), {
    [`usernames/${username.toLowerCase()}`]: uid,
    [`users/${uid}/profile`]: { username, look, createdAt: serverTimestamp() },
    [`users/${uid}/save`]: defaultSave()
  });
  return { username, look };
}

export const ensureSave = (uid) => set(ref(db, `users/${uid}/save`), defaultSave());
