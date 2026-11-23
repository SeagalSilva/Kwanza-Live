// Procedural Web Audio API sound effects (no external audio files required).
const STORAGE_KEY = "kwanza_muted";

let ctx = null;
let muted = false;
let unlocked = false;

try {
  muted = localStorage.getItem(STORAGE_KEY) === "1";
} catch (_) {
  muted = false;
}

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function initAudio() {
  if (unlocked || typeof window === "undefined") return;
  unlocked = true;
  const unlock = () => {
    const c = getCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
}

export const isMuted = () => muted;

export function setMuted(v) {
  muted = !!v;
  try {
    localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  } catch (_) {}
}

export function toggleMute() {
  setMuted(!muted);
  return muted;
}

function tone(freqStart, freqEnd, durationSec, { type = "sine", gain = 0.14, delay = 0 } = {}) {
  if (muted) return;
  const c = getCtx();
  if (!c) return;

  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(20, freqStart), t0);
  if (freqEnd && freqEnd !== freqStart) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + durationSec);
  }

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.015, durationSec * 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

  osc.connect(g);
  g.connect(c.destination);

  osc.start(t0);
  osc.stop(t0 + durationSec + 0.02);
}

/** Earthy pop sound when planting a seed. */
export function playPlant() {
  tone(170, 290, 0.08, { type: "triangle", gain: 0.15, delay: 0 });
  tone(320, 460, 0.07, { type: "sine", gain: 0.11, delay: 0.045 });
}

/** Bright joyful chime when harvesting crops or animal produce. */
export function playHarvest() {
  tone(523.25, 523.25, 0.09, { type: "triangle", gain: 0.14, delay: 0 });     // C5
  tone(659.25, 659.25, 0.09, { type: "triangle", gain: 0.14, delay: 0.065 }); // E5
  tone(783.99, 783.99, 0.14, { type: "sine", gain: 0.15, delay: 0.13 });      // G5
  tone(1046.5, 1046.5, 0.22, { type: "sine", gain: 0.14, delay: 0.195 });     // C6
}

/** Warm wooden door / entrance chord when entering a building. */
export function playEnterBuilding() {
  tone(220, 180, 0.07, { type: "triangle", gain: 0.13, delay: 0 });
  tone(329.63, 392.0, 0.14, { type: "sine", gain: 0.12, delay: 0.05 });
  tone(493.88, 523.25, 0.18, { type: "sine", gain: 0.1, delay: 0.1 });
}

/** Classic crisp coin clink when receiving bronze/silver/gold coins. */
export function playCoin() {
  tone(987.77, 987.77, 0.075, { type: "sine", gain: 0.16, delay: 0 });     // B5
  tone(1318.51, 1318.51, 0.24, { type: "sine", gain: 0.18, delay: 0.07 }); // E6
  tone(1975.53, 1975.53, 0.16, { type: "triangle", gain: 0.05, delay: 0.07 });
}

/** Sparkling rising arpeggio when receiving Pool Points (PP). */
export function playPoolPoints() {
  tone(587.33, 587.33, 0.08, { type: "sine", gain: 0.12, delay: 0 });     // D5
  tone(739.99, 739.99, 0.08, { type: "sine", gain: 0.12, delay: 0.055 }); // F#5
  tone(880.0, 880.0, 0.1, { type: "sine", gain: 0.13, delay: 0.11 });     // A5
  tone(1174.66, 1174.66, 0.2, { type: "sine", gain: 0.14, delay: 0.165 }); // D6
}

/** Mechanical slot lever pull & reel spin launch. */
export function playSlotLever() {
  tone(140, 260, 0.07, { type: "sawtooth", gain: 0.08, delay: 0 });
  tone(280, 420, 0.09, { type: "triangle", gain: 0.1, delay: 0.05 });
}

/** Tactile reel lock thud as each slot column stops left-to-right. */
export function playReelStop(colIndex = 0) {
  const base = 175 + colIndex * 32;
  tone(base, base * 0.65, 0.065, { type: "triangle", gain: 0.14, delay: 0 });
  tone(base * 2.2, base * 1.9, 0.04, { type: "sine", gain: 0.06, delay: 0.01 });
}

/** Crisp wooden/brass peg clack as roulette slices pass the top clapper. */
export function playRouletteTick() {
  tone(720, 420, 0.025, { type: "triangle", gain: 0.075, delay: 0 });
}

/** Bright casino roulette win bell chord. */
export function playRouletteWin() {
  tone(659.25, 659.25, 0.1, { type: "triangle", gain: 0.13, delay: 0 });
  tone(783.99, 783.99, 0.1, { type: "triangle", gain: 0.13, delay: 0.06 });
  tone(987.77, 987.77, 0.14, { type: "sine", gain: 0.15, delay: 0.12 });
  tone(1318.51, 1318.51, 0.26, { type: "sine", gain: 0.14, delay: 0.19 });
}

/** Soft low brass descent when a casino round ends with no win. */
export function playCasinoLoss() {
  tone(220, 185, 0.11, { type: "triangle", gain: 0.09, delay: 0 });
  tone(165, 130, 0.18, { type: "triangle", gain: 0.08, delay: 0.1 });
}

/** Magical shimmering fanfare when Bonus (🎁 or bonus roulette) triggers. */
export function playBonusTrigger() {
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
  notes.forEach((f, i) => {
    tone(f, f * 1.01, 0.14, { type: "triangle", gain: 0.13, delay: i * 0.065 });
  });
}

/** Crystalline sapphire sweep when Scatter (💠) triggers. */
export function playScatterTrigger() {
  const notes = [587.33, 739.99, 880.0, 1174.66, 1479.98, 1760.0];
  notes.forEach((f, i) => {
    tone(f, f * 1.02, 0.16, { type: "sine", gain: 0.13, delay: i * 0.055 });
  });
}

/** Epic Jackpot fanfare for +10x and larger prizes. */
export function playMegaWin() {
  const chord = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093.0];
  chord.forEach((f, i) => {
    tone(f, f, 0.24, { type: i % 2 ? "sine" : "triangle", gain: 0.14, delay: i * 0.055 });
  });
  tone(1046.5, 1046.5, 0.45, { type: "sine", gain: 0.14, delay: 0.42 });
  tone(1567.98, 1567.98, 0.45, { type: "triangle", gain: 0.11, delay: 0.45 });
}

