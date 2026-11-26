import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const ADMIN_EMAIL = "seagalsilva@gmail.com";

export function isAdminEmail(email) {
  return typeof email === "string" && email.trim().toLowerCase() === ADMIN_EMAIL;
}

export const MIN_SEED_PACK = 5;

export function createDefaultMarketConfig() {
  return {
    corn:      { packPrice: 25,  packSize: 5, yield: 2, sell: 4  },
    beans:     { packPrice: 40,  packSize: 5, yield: 2, sell: 7  },
    peanut:    { packPrice: 60,  packSize: 5, yield: 3, sell: 6  },
    cassava:   { packPrice: 100, packSize: 5, yield: 3, sell: 12 },
    banana:    { packPrice: 175, packSize: 5, yield: 4, sell: 15 },
    pineapple: { packPrice: 300, packSize: 5, yield: 4, sell: 28 }
  };
}

export function normalizeMarketConfig(loaded) {
  const def = createDefaultMarketConfig();
  const src = loaded && typeof loaded === "object" ? loaded : {};
  const out = {};
  for (const [id, d] of Object.entries(def)) {
    const row = src[id] && typeof src[id] === "object" ? src[id] : {};
    const packPrice = Number.isFinite(Number(row.packPrice)) ? Math.max(1, Math.round(Number(row.packPrice))) : d.packPrice;
    const packSize = Number.isFinite(Number(row.packSize)) ? Math.max(MIN_SEED_PACK, Math.round(Number(row.packSize))) : d.packSize;
    const cropYield = Number.isFinite(Number(row.yield)) ? Math.max(1, Math.round(Number(row.yield))) : d.yield;
    const sell = Number.isFinite(Number(row.sell)) ? Math.max(1, Math.round(Number(row.sell))) : d.sell;
    out[id] = { packPrice, packSize, yield: cropYield, sell };
  }
  return out;
}

export function createDefaultCityMap(base = null, fallbackCustomLands = []) {
  const defBuildings = {
    workstation: { x: 6, y: 12 },
    government: { x: 18, y: 4 },
    gameMarket: { x: 27, y: 12 },
    bazaar: { x: 34, y: 12 },
    casino: { x: 30, y: 4 },
    mines: { x: 6, y: 4 },
    postOffice: { x: 38, y: 4 },
    dungeon: { x: 42, y: 12 }
  };
  const src = base && typeof base === "object" ? base : {};
  return {
    width: Math.max(20, Math.min(200, Number(src.width) || 48)),
    height: Math.max(20, Math.min(200, Number(src.height) || 40)),
    publicFarm: src.publicFarm && typeof src.publicFarm === "object"
      ? { x0: Number(src.publicFarm.x0 ?? 12), y0: Number(src.publicFarm.y0 ?? 12) }
      : { x0: 12, y0: 12 },
    buildings: {
      ...defBuildings,
      ...(src.buildings && typeof src.buildings === "object" ? JSON.parse(JSON.stringify(src.buildings)) : {})
    },
    lands: src.lands && typeof src.lands === "object" ? JSON.parse(JSON.stringify(src.lands)) : {},
    customLands: Array.isArray(src.customLands)
      ? JSON.parse(JSON.stringify(src.customLands))
      : JSON.parse(JSON.stringify(fallbackCustomLands || []))
  };
}

function createDefaultData() {
  const defaultCities = [
    { id: "kwanza_central", name: "Kwanza Central" },
    { id: "nova_luanda", name: "Nova Luanda" },
    { id: "benguela_sul", name: "Benguela Sul" }
  ];
  const cityMaps = {};
  for (const c of defaultCities) {
    cityMaps[c.id] = createDefaultCityMap();
  }
  return {
    chatMessages: [],
    nextMsgId: 1,
    workstationUsers: {},
    govState: {
      president: null,
      candidates: [],
      votedUids: [],
      customLands: [],
      cities: defaultCities,
      playerCities: {},
      cityDecrees: {},
      cityMaps,
      mapConfig: createDefaultCityMap()
    },
    landOperations: {},
    freeSeedVisits: {},
    marketConfig: createDefaultMarketConfig(),
    dailyPool: {
      days: {},
      pendingSellTx: {}
    },
    casino: {
      machines: {},
      rouletteSessions: {},
      slotSessions: {},
      pendingSpins: {},
      pendingPayouts: {},
      recentWins: []
    },
    mines: {
      rocks: {}
    },
    forest: {
      trees: {}
    },
    adExemptions: {},
    userMail: {},
    dungeonUsers: {},
    dungeonDrops: [],
    ptcState: {
      users: {},
      sessions: {},
      pendingClaims: {},
      taskCache: {}
    }
  };
}

function resolveDbPath() {
  const localDir = path.join(ROOT_DIR, "data");
  try {
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    fs.accessSync(localDir, fs.constants.W_OK);
    return path.join(localDir, "server-db.json");
  } catch (_) {
    return path.join("/tmp", "kwanza-server-db.json");
  }
}

const DB_PATH = resolveDbPath();

function mergeDefaults(loaded) {
  const def = createDefaultData();
  if (!loaded || typeof loaded !== "object") return def;

  const gov = loaded.govState && typeof loaded.govState === "object" ? loaded.govState : {};
  const mapCfg = gov.mapConfig && typeof gov.mapConfig === "object" ? gov.mapConfig : {};
  const legacyCustomLands = Array.isArray(gov.customLands) ? gov.customLands : [];
  const cities = Array.isArray(gov.cities) && gov.cities.length > 0 ? gov.cities : def.govState.cities;
  const normalizedLegacyMap = createDefaultCityMap(mapCfg, legacyCustomLands);

  const loadedCityMaps = gov.cityMaps && typeof gov.cityMaps === "object" ? gov.cityMaps : {};
  const cityMaps = {};
  for (const c of cities) {
    if (!c || !c.id) continue;
    if (loadedCityMaps[c.id] && typeof loadedCityMaps[c.id] === "object") {
      cityMaps[c.id] = createDefaultCityMap(loadedCityMaps[c.id], legacyCustomLands);
    } else {
      cityMaps[c.id] = createDefaultCityMap(normalizedLegacyMap, legacyCustomLands);
    }
  }

  const dp = loaded.dailyPool && typeof loaded.dailyPool === "object" ? loaded.dailyPool : {};
  const cas = loaded.casino && typeof loaded.casino === "object" ? loaded.casino : {};

  return {
    chatMessages: Array.isArray(loaded.chatMessages) ? loaded.chatMessages : def.chatMessages,
    nextMsgId: Number(loaded.nextMsgId) || def.nextMsgId,
    workstationUsers: loaded.workstationUsers && typeof loaded.workstationUsers === "object" ? loaded.workstationUsers : {},
    govState: {
      president: gov.president || null,
      candidates: Array.isArray(gov.candidates) ? gov.candidates : [],
      votedUids: Array.isArray(gov.votedUids) ? gov.votedUids : [],
      customLands: legacyCustomLands,
      cities,
      playerCities: gov.playerCities && typeof gov.playerCities === "object" ? gov.playerCities : {},
      cityDecrees: gov.cityDecrees && typeof gov.cityDecrees === "object" ? gov.cityDecrees : {},
      cityMaps,
      mapConfig: normalizedLegacyMap
    },
    landOperations: loaded.landOperations && typeof loaded.landOperations === "object" ? loaded.landOperations : {},
    freeSeedVisits: loaded.freeSeedVisits && typeof loaded.freeSeedVisits === "object" ? loaded.freeSeedVisits : {},
    marketConfig: normalizeMarketConfig(loaded.marketConfig),
    dailyPool: {
      days: dp.days && typeof dp.days === "object" ? dp.days : {},
      pendingSellTx: dp.pendingSellTx && typeof dp.pendingSellTx === "object" ? dp.pendingSellTx : {}
    },
    casino: {
      machines: cas.machines && typeof cas.machines === "object" ? cas.machines : {},
      rouletteSessions: cas.rouletteSessions && typeof cas.rouletteSessions === "object" ? cas.rouletteSessions : {},
      slotSessions: cas.slotSessions && typeof cas.slotSessions === "object" ? cas.slotSessions : {},
      pendingSpins: cas.pendingSpins && typeof cas.pendingSpins === "object" ? cas.pendingSpins : {},
      pendingPayouts: cas.pendingPayouts && typeof cas.pendingPayouts === "object" ? cas.pendingPayouts : {},
      recentWins: Array.isArray(cas.recentWins) ? cas.recentWins : []
    },
    mines: loaded.mines && typeof loaded.mines === "object" ? loaded.mines : { rocks: {} },
    forest: loaded.forest && typeof loaded.forest === "object" ? loaded.forest : { trees: {} },
    adExemptions: loaded.adExemptions && typeof loaded.adExemptions === "object" ? loaded.adExemptions : {},
    userMail: loaded.userMail && typeof loaded.userMail === "object" ? loaded.userMail : {},
    dungeonUsers: loaded.dungeonUsers && typeof loaded.dungeonUsers === "object" ? loaded.dungeonUsers : {},
    dungeonDrops: Array.isArray(loaded.dungeonDrops) ? loaded.dungeonDrops : [],
    ptcState: {
      users: loaded.ptcState?.users && typeof loaded.ptcState.users === "object" ? loaded.ptcState.users : {},
      sessions: loaded.ptcState?.sessions && typeof loaded.ptcState.sessions === "object" ? loaded.ptcState.sessions : {},
      pendingClaims: loaded.ptcState?.pendingClaims && typeof loaded.ptcState.pendingClaims === "object" ? loaded.ptcState.pendingClaims : {},
      taskCache: loaded.ptcState?.taskCache && typeof loaded.ptcState.taskCache === "object" ? loaded.ptcState.taskCache : {}
    }
  };
}

function loadFromDisk() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, "utf8");
      if (raw.trim()) {
        return mergeDefaults(JSON.parse(raw));
      }
    }
  } catch (err) {
    console.warn("[db] Failed to load server DB, starting with defaults:", err.message);
  }
  const initial = createDefaultData();
  saveToDisk(initial);
  return initial;
}

function saveToDisk(data) {
  try {
    const tmpPath = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmpPath, DB_PATH);
  } catch (err) {
    console.error("[db] Failed to persist server DB:", err.message);
  }
}

export const dbState = loadFromDisk();

export function saveDb() {
  saveToDisk(dbState);
}
