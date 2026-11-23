// Multiplayer presence: publish my position, receive everybody else's.
import { db, ref, set, update, onValue, onChildAdded, onChildChanged, onChildRemoved, onDisconnect, serverTimestamp } from "../firebase.js";
import { S, now } from "../state.js";
import { sanitizeLook } from "../data/character.js";
import { registerSpeechBubble } from "./chat.js";

const STALE_MS = 60_000;
let offs = [];
let myRef = null;
let lastSent = { x: 0, y: 0, d: "", t: 0 };

export function startPresence(me) {
  stopPresence();
  myRef = ref(db, `world/players/${S.uid}`);

  // (Re)announce myself every time the connection is (re)established.
  offs.push(onValue(ref(db, ".info/connected"), (s) => {
    if (s.val() !== true) return;
    onDisconnect(myRef).remove();
    set(myRef, {
      name: S.profile.username, look: sanitizeLook(S.profile.look),
      x: round(me.x), y: round(me.y), d: me.dir, m: 0, room: S.room || "world", t: serverTimestamp()
    });
  }));

  const upsert = (s) => {
    if (s.key === S.uid) return;
    const v = s.val();
    if (!v || typeof v.x !== "number") return;
    const p = S.players[s.key];
    if (!p) S.players[s.key] = { ...v, look: sanitizeLook(v.look), dx: v.x, dy: v.y, phase: 0 };
    else Object.assign(p, v, { look: sanitizeLook(v.look) });

    if (v.chat && v.chat.text) {
      registerSpeechBubble(s.key, v.chat.text, v.chat.at || Date.now());
    }
  };
  const players = ref(db, "world/players");
  offs.push(onChildAdded(players, upsert), onChildChanged(players, upsert));
  offs.push(onChildRemoved(players, (s) => { delete S.players[s.key]; }));
}

const round = (n) => Math.round(n * 100) / 100;

/** Send my position (throttled by the game loop). */
export function publishPosition(me) {
  if (!myRef) return;
  const x = round(me.x), y = round(me.y), room = S.room || "world";
  const changed = x !== lastSent.x || y !== lastSent.y || me.dir !== lastSent.d || room !== lastSent.room;
  const heartbeat = Date.now() - lastSent.t > 15_000;
  if (!changed && !heartbeat) return;
  lastSent = { x, y, d: me.dir, room, t: Date.now() };
  update(myRef, { x, y, d: me.dir, m: me.moving ? 1 : 0, room, t: serverTimestamp() }).catch(() => {});
}

export const isFresh = (p) => !p.t || now() - p.t < STALE_MS;

export function stopPresence() {
  offs.forEach((off) => { try { off(); } catch (_) {} });
  offs = [];
  if (myRef) { onDisconnect(myRef).cancel().catch(() => {}); set(myRef, null).catch(() => {}); }
  myRef = null;
  S.players = {};
}
