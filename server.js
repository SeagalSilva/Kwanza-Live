import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory chat storage (last 100 messages)
const chatMessages = [];
let nextMsgId = 1;

app.get('/api/chat/messages', (req, res) => {
  const since = Number(req.query.since) || 0;
  const filtered = since > 0 ? chatMessages.filter((m) => m.time > since) : chatMessages.slice(-50);
  res.json({ messages: filtered });
});

app.post('/api/chat/send', (req, res) => {
  const { uid, name, text } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text is required' });
  }
  const cleanText = text.trim().slice(0, 120);
  if (!cleanText) {
    return res.status(400).json({ error: 'Empty message' });
  }

  const msg = {
    id: nextMsgId++,
    uid: String(uid || 'anon'),
    name: String(name || 'Player').slice(0, 16),
    text: cleanText,
    time: Date.now()
  };

  chatMessages.push(msg);
  if (chatMessages.length > 100) chatMessages.shift();

  res.json({ success: true, message: msg });
});

// ─────────────────────────────────────────────────────────────
// Posto de Trabalho (Job Center) — Server Authoritative Logic
// Cycles run every 30 minutes. Deposited Pool Points are converted
// to bronze coins (5% rate) at the end of each 30-minute shift.
// ─────────────────────────────────────────────────────────────
const CYCLE_DURATION_MS = 30 * 60 * 1000;
const workstationUsers = new Map();

function getWorkstationState(uid) {
  const now = Date.now();
  const currentCycleId = Math.floor(now / CYCLE_DURATION_MS);
  const cycleRemainingMs = CYCLE_DURATION_MS - (now % CYCLE_DURATION_MS);

  let state = workstationUsers.get(uid);
  if (!state) {
    state = {
      cycleId: currentCycleId,
      depositedPP: 0,
      readyToClaimBronze: 0,
      history: []
    };
    workstationUsers.set(uid, state);
  } else if (state.cycleId < currentCycleId) {
    // A shift has completed! Convert deposited PP to bronze coins (5%)
    if (state.depositedPP > 0) {
      const bronzeEarned = Math.floor(state.depositedPP * 0.05);
      state.readyToClaimBronze += bronzeEarned;
      state.history.unshift({
        cycleId: state.cycleId,
        depositedPP: state.depositedPP,
        bronzeEarned,
        completedAt: now
      });
      if (state.history.length > 10) state.history.pop();
    }
    state.cycleId = currentCycleId;
    state.depositedPP = 0;
  }

  return { state, currentCycleId, cycleRemainingMs };
}

app.get('/api/workstation/status', (req, res) => {
  const uid = String(req.query.uid || 'guest');
  const { state, currentCycleId, cycleRemainingMs } = getWorkstationState(uid);

  res.json({
    cycleId: currentCycleId,
    cycleDurationMs: CYCLE_DURATION_MS,
    cycleRemainingMs,
    depositedPP: state.depositedPP,
    estimatedBronze: Math.floor(state.depositedPP * 0.05),
    readyToClaimBronze: state.readyToClaimBronze,
    ratePercent: 5,
    history: state.history
  });
});

app.post('/api/workstation/deposit', (req, res) => {
  const { uid, amount } = req.body || {};
  const depositAmt = Math.floor(Number(amount));
  if (!uid || isNaN(depositAmt) || depositAmt <= 0) {
    return res.status(400).json({ error: 'Valid amount is required' });
  }

  const { state, currentCycleId, cycleRemainingMs } = getWorkstationState(String(uid));
  state.depositedPP += depositAmt;

  res.json({
    success: true,
    cycleId: currentCycleId,
    cycleRemainingMs,
    depositedPP: state.depositedPP,
    estimatedBronze: Math.floor(state.depositedPP * 0.05),
    readyToClaimBronze: state.readyToClaimBronze
  });
});

app.post('/api/workstation/claim', (req, res) => {
  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'UID is required' });

  const { state, currentCycleId, cycleRemainingMs } = getWorkstationState(String(uid));
  const claimed = state.readyToClaimBronze;
  state.readyToClaimBronze = 0;

  res.json({
    success: true,
    claimedBronze: claimed,
    cycleId: currentCycleId,
    cycleRemainingMs,
    depositedPP: state.depositedPP,
    readyToClaimBronze: 0
  });
});

// Expose runtime Firebase configuration dynamically
app.get('/api/config.js', (req, res) => {
  res.type('application/javascript');
  const config = {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBcjcNzMLCv-jSCpy9N29GmEESVqRn_xRU",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "kwanzaclick.firebaseapp.com",
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://kwanzaclick-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: process.env.FIREBASE_PROJECT_ID || "kwanzaclick",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "kwanzaclick.appspot.com",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "140060118241",
    appId: process.env.FIREBASE_APP_ID || "1:140060118241:web:3fdf84bb8654844a74bba0",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-QC255LPQWN"
  };
  res.send(`window.__FIREBASE_CONFIG__ = ${JSON.stringify(config)};`);
});

// Serve static assets from project root
app.use(express.static(__dirname, {
  extensions: ['html', 'htm']
}));

// Fallback to index.html for client-side navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

if (process.env.VERCEL !== '1') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kwanza Live dev server running at http://0.0.0.0:${PORT}`);
  });
}

export default app;
