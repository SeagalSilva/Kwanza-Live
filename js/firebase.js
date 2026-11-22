// Firebase initialisation (modular SDK loaded from the official CDN).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, onValue, onChildAdded, onChildChanged, onChildRemoved,
  get, set, update, push, remove, onDisconnect, serverTimestamp, increment,
  query, orderByChild, limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export {
  signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut,
  ref, onValue, onChildAdded, onChildChanged, onChildRemoved,
  get, set, update, push, remove, onDisconnect, serverTimestamp, increment,
  query, orderByChild, limitToLast
};
