// Single shared game state. Systems write to it, the UI/renderer read from it.
import { emit } from "./bus.js";

const blankSave = () => ({ wallet: { pp: 0, bronze: 0, silver: 0, gold: 0 }, inv: {} });

export const S = {
  uid: null,
  user: null,            // Firebase auth user
  profile: null,         // { username, look }
  save: blankSave(),     // { wallet, inv }  (synced from Firebase)
  selectedSeed: "corn",
  players: {},           // other online players
  farm: {},              // public farm tiles
  lands: {},             // owned lands { L1: {owner, ownerName} }
  landTiles: {},         // { L1: { "x_y": tile } }
  listings: {},          // player-market listings
  offset: 0              // server time offset (ms)
};

/** Server-corrected current time (ms). */
export const now = () => Date.now() + S.offset;
export const inv = (id) => (S.save.inv && S.save.inv[id]) || 0;
export const bal = (cur) => (S.save.wallet && S.save.wallet[cur]) || 0;

export function selectSeed(cropId) {
  S.selectedSeed = cropId;
  emit("selected", cropId);
}

export function resetState() {
  S.uid = null; S.user = null; S.profile = null;
  S.save = blankSave();
  S.players = {}; S.farm = {}; S.lands = {}; S.landTiles = {}; S.listings = {};
}
