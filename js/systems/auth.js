import { auth, provider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut } from "../firebase.js";

export async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}

export const watchAuth = (cb) => onAuthStateChanged(auth, cb);
export const logout = () => signOut(auth);
