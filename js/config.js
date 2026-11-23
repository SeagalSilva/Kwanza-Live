// ─────────────────────────────────────────────────────────────
//  Kwanza Live — global configuration
//  Edit values here to rebalance the game.
// ─────────────────────────────────────────────────────────────

const runtimeConfig = (typeof window !== "undefined" && window.__FIREBASE_CONFIG__) ? window.__FIREBASE_CONFIG__ : {};

export const firebaseConfig = {
  apiKey: runtimeConfig.apiKey || "AIzaSyBcjcNzMLCv-jSCpy9N29GmEESVqRn_xRU",
  authDomain: runtimeConfig.authDomain || "kwanzaclick.firebaseapp.com",
  databaseURL: runtimeConfig.databaseURL || "https://kwanzaclick-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: runtimeConfig.projectId || "kwanzaclick",
  storageBucket: runtimeConfig.storageBucket || "kwanzaclick.appspot.com",
  messagingSenderId: runtimeConfig.messagingSenderId || "140060118241",
  appId: runtimeConfig.appId || "1:140060118241:web:3fdf84bb8654844a74bba0",
  measurementId: runtimeConfig.measurementId || "G-QC255LPQWN"
};

export const FIREBASE_VERSION = "10.12.2";

// World
export const TILE = 32;          // pixels per tile (logical)
export const MAP_W = 48;
export const MAP_H = 40;
export const SPEED = 4.2;        // tiles per second

// Farming
export const PUBLIC_FARM_LIMIT = 8;                 // max active crops per player on public land
export const WITHER_AFTER_RIPE_MS = 20 * 60 * 1000; // abandoned ripe crops wither after this
export const MAX_LANDS_PER_PLAYER = 3;

// New players
export const START = {
  pp: 100,
  bronze: 25,
  inv: { seed_corn: 3 }
};

// Game Market free seed link
export const FREE_SEED_LINK = "https://asiafilm.org/4/e05a39d8360ea9cb129d5b8799df08c9";
export const FREE_SEED_STAY_MS = 5000;

// Market limits
export const MAX_LISTING_PRICE = 1_000_000;
export const MAX_PLAYER_LISTINGS = 5;
export const LISTING_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

