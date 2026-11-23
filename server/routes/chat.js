import { Router } from "express";
import { dbState, saveDb } from "../db.js";

const router = Router();
const CHAT_TTL_MS = 10 * 60 * 1000;

function purgeOldChat() {
  const cutoff = Date.now() - CHAT_TTL_MS;
  let removed = false;
  while (dbState.chatMessages.length > 0 && dbState.chatMessages[0].time < cutoff) {
    dbState.chatMessages.shift();
    removed = true;
  }
  if (removed) saveDb();
}

router.get("/messages", (req, res) => {
  purgeOldChat();
  const since = Number(req.query.since) || 0;
  const filtered =
    since > 0
      ? dbState.chatMessages.filter((m) => m.time > since)
      : dbState.chatMessages.slice(-50);
  res.json({ messages: filtered, serverTime: Date.now() });
});

router.post("/send", (req, res) => {
  purgeOldChat();
  const { uid, name, text } = req.body || {};
  if (!uid) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Text is required" });
  }
  const cleanText = text.trim().slice(0, 120);
  if (!cleanText) {
    return res.status(400).json({ error: "Empty message" });
  }

  const msg = {
    id: dbState.nextMsgId++,
    uid: String(uid),
    name: String(name || "Player").slice(0, 16),
    text: cleanText,
    time: Date.now()
  };

  dbState.chatMessages.push(msg);
  if (dbState.chatMessages.length > 100) dbState.chatMessages.shift();
  saveDb();

  res.json({ success: true, message: msg });
});

export default router;
