// Single shared game state. Systems write to it, the UI/renderer read from it.
import { emit } from "./bus.js";

const blankSave = () => ({
  wallet: { pp: 0, bronze: 0, silver: 0, gold: 0 },
  inv: {},
  energy: { current: 100, max: 100, lastRegen: Date.now() },
  adExemptUntil: 0,
  workstation: { claimedDailyDates: {}, claimedShiftCycles: {} }
});

export const S = {
  uid: null,
  user: null,            // Firebase auth user
  profile: null,         // { username, look }
  save: blankSave(),     // { wallet, inv, energy, adExemptUntil }  (synced from Firebase)
  selectedSeed: "corn",
  players: {},           // other online players
  farm: {},              // public farm tiles
  lands: {},             // owned lands { L1: {owner, ownerName} }
  landOps: {},           // server-persisted land operations { L1: { mode, animals, stock, pendingEarnings } }
  landTiles: {},         // { L1: { "x_y": tile } }
  listings: {},          // player-market listings
  offset: 0,             // server time offset (ms)
  mapEditMode: false,    // admin drag-and-drop map editing active
  currentCity: "kwanza_central",
  room: "world",         // "world" | "casino" | "mines" | "dungeon"
  casino: { machines: {}, roulette: { freeSpins: 0, lockedBet: 0 }, recentWins: [] },
  mines: { rocks: {}, activeHits: {} },
  dungeon: { phases: [], activeRun: null, progress: null, floorDrops: [] },
  lastAdAt: 0
};

/** Server-corrected current time (ms). */
export const now = () => Date.now() + S.offset;
export const inv = (id) => (S.save.inv && S.save.inv[id]) || 0;
export const bal = (cur) => (S.save.wallet && S.save.wallet[cur]) || 0;
export const energy = () => S.save.energy || { current: 100, max: 100, lastRegen: Date.now() };
export const isAdExempt = () => (S.save?.adExemptUntil || 0) > Date.now();

export function selectSeed(cropId) {
  S.selectedSeed = cropId;
  emit("selected", cropId);
}

export function resetState() {
  S.uid = null; S.user = null; S.profile = null;
  S.save = blankSave();
  S.players = {}; S.farm = {}; S.lands = {}; S.landOps = {}; S.landTiles = {}; S.listings = {};
  S.mapEditMode = false;
  S.currentCity = "kwanza_central";
  S.room = "world";
  S.casino = { machines: {}, roulette: { freeSpins: 0, lockedBet: 0 }, recentWins: [] };
  S.dungeon = { phases: [], activeRun: null, progress: null, floorDrops: [] };
}
