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

function createDefaultData() {
  return {
    chatMessages: [],
    nextMsgId: 1,
    workstationUsers: {},
    govState: {
      president: null,
      candidates: [],
      votedUids: [],
      customLands: [],
      cities: [
        { id: "kwanza_central", name: "Kwanza Central" },
        { id: "nova_luanda", name: "Nova Luanda" },
        { id: "benguela_sul", name: "Benguela Sul" }
      ],
      playerCities: {},
      cityDecrees: {},
      mapConfig: {
        width: 48,
        height: 40,
        publicFarm: { x0: 12, y0: 12 },
        buildings: {
          workstation: { x: 6, y: 12 },
          government: { x: 18, y: 4 },
          gameMarket: { x: 27, y: 12 },
          bazaar: { x: 34, y: 12 },
          casino: { x: 30, y: 4 }
        },
        lands: {}
      }
    },
    landOperations: {},
    freeSeedVisits: {},
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
      customLands: Array.isArray(gov.customLands) ? gov.customLands : [],
      cities: Array.isArray(gov.cities) && gov.cities.length > 0 ? gov.cities : def.govState.cities,
      playerCities: gov.playerCities && typeof gov.playerCities === "object" ? gov.playerCities : {},
      cityDecrees: gov.cityDecrees && typeof gov.cityDecrees === "object" ? gov.cityDecrees : {},
      mapConfig: {
        width: Number(mapCfg.width) || def.govState.mapConfig.width,
        height: Number(mapCfg.height) || def.govState.mapConfig.height,
        publicFarm: mapCfg.publicFarm || def.govState.mapConfig.publicFarm,
        buildings: {
          ...def.govState.mapConfig.buildings,
          ...(mapCfg.buildings || {})
        },
        lands: mapCfg.lands && typeof mapCfg.lands === "object" ? mapCfg.lands : {}
      }
    },
    landOperations: loaded.landOperations && typeof loaded.landOperations === "object" ? loaded.landOperations : {},
    freeSeedVisits: loaded.freeSeedVisits && typeof loaded.freeSeedVisits === "object" ? loaded.freeSeedVisits : {},
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
