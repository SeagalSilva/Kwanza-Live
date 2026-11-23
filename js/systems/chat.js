// In-game multiplayer chat and speech bubbles system.
import { S } from "../state.js";
import { emit } from "../bus.js";
import { db, ref, update } from "../firebase.js";

if (!S.chat) {
  S.chat = {
    messages: [],
    bubbles: new Map() // uid -> { text, at, expiresAt }
  };
}

let syncTimer = null;
let lastSyncedTime = 0;

export function registerSpeechBubble(uid, text, at = Date.now()) {
  if (!uid || !text) return;
  const now = Date.now();
  const age = now - at;
  if (age < 6000) {
    S.chat.bubbles.set(uid, {
      text,
      at,
      expiresAt: at + 6000
    });
  }
}

export async function sendChat(text) {
  if (!text || typeof text !== "string") return false;
  const clean = text.trim().slice(0, 120);
  if (!clean) return false;

  const now = Date.now();
  const myUid = S.uid || "me";
  const myName = S.profile?.username || "Player";

  // Immediate local feedback
  registerSpeechBubble(myUid, clean, now);

  const localMsg = {
    id: `local_${now}_${Math.random()}`,
    uid: myUid,
    name: myName,
    text: clean,
    time: now
  };
  S.chat.messages.push(localMsg);
  if (S.chat.messages.length > 80) S.chat.messages.shift();
  emit("chat", localMsg);

  // 1. Post to authoritative server
  try {
    fetch("/api/chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: myUid, name: myName, text: clean })
    }).catch(() => {});
  } catch (_) {}

  // 2. Broadcast via Firebase player presence node if authenticated
  if (S.uid && db) {
    try {
      update(ref(db, `world/players/${S.uid}`), {
        chat: { text: clean, at: now }
      }).catch(() => {});
    } catch (_) {}
  }

  return true;
}

async function fetchNewMessages() {
  try {
    const res = await fetch(`/api/chat/messages?since=${lastSyncedTime}`);
    if (!res.ok) return;
    const data = await res.json();
    const cutoff = Date.now() - 10 * 60 * 1000;
    
    // Purge local messages older than 10 minutes
    S.chat.messages = S.chat.messages.filter((m) => m.time >= cutoff);

    const newMsgs = (data.messages || []).filter((m) => m.time >= cutoff);
    if (!newMsgs.length && S.chat.messages.length === 0) return;

    let addedAny = false;
    for (const m of newMsgs) {
      if (m.time > lastSyncedTime) lastSyncedTime = m.time;
      const exists = S.chat.messages.some((x) => x.id === m.id || (x.uid === m.uid && Math.abs(x.time - m.time) < 1000 && x.text === m.text));
      if (!exists) {
        S.chat.messages.push(m);
        addedAny = true;
        if (m.uid !== S.uid) {
          registerSpeechBubble(m.uid, m.text, m.time);
        }
      }
    }

    if (addedAny || S.chat.messages.length > 0) {
      emit("chat");
    }
  } catch (_) {}
}

export function startChatSync() {
  stopChatSync();
  fetchNewMessages();
  syncTimer = setInterval(fetchNewMessages, 2500);
}

export function stopChatSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
