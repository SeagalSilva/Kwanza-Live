// Governo (Government Center) & City Hall system
// Admin: seagalsilva@gmail.com can resize map, add lands, and move map items via drag-and-drop.
// President: Elected by players via voting system. Can issue civic decisions/decrees for the city.
import { S } from "../state.js";
import { emit } from "../bus.js";
import { t } from "../i18n.js";
import { toast } from "../ui/toast.js";
import { applyMapConfig } from "../world/map.js";
import { syncLandsFromServer } from "./lands.js";

const ADMIN_EMAIL = "seagalsilva@gmail.com";

let lastMapHash = "";
let mapSyncTimer = null;

export function isAdmin() {
  return S.user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

export function applyServerMapIfChanged(state) {
  if (!state) return;
  const hash = JSON.stringify({
    mapConfig: state.mapConfig || null,
    customLands: state.customLands || []
  });
  if (hash !== lastMapHash) {
    lastMapHash = hash;
    applyMapConfig(state.mapConfig, state.customLands);
  }
  if (S.uid && state.playerCities && state.playerCities[S.uid]) {
    S.currentCity = state.playerCities[S.uid];
  }
}

export async function getGovernmentState() {
  try {
    const res = await fetch("/api/government/state");
    if (!res.ok) throw new Error("HTTP error " + res.status);
    const data = await res.json();
    applyServerMapIfChanged(data);
    return data;
  } catch (err) {
    console.warn("[government]", err);
    return {
      president: null,
      candidates: [],
      cities: [
        { id: "kwanza_central", name: "Kwanza Central" },
        { id: "nova_luanda", name: "Nova Luanda" },
        { id: "benguela_sul", name: "Benguela Sul" }
      ],
      playerCities: {},
      cityDecrees: {},
      customLands: [],
      mapConfig: null
    };
  }
}

export async function syncMapFromServer() {
  return await getGovernmentState();
}

export function startMapSync() {
  stopMapSync();
  mapSyncTimer = setInterval(() => {
    syncMapFromServer();
    syncLandsFromServer();
  }, 5000);
}

export function stopMapSync() {
  if (mapSyncTimer) {
    clearInterval(mapSyncTimer);
    mapSyncTimer = null;
  }
  lastMapHash = "";
}

export async function voteForCandidate(candidateUid) {
  try {
    const res = await fetch("/api/government/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voterUid: S.uid, candidateUid })
    });
    if (!res.ok) throw new Error("Vote failed");
    const data = await res.json();
    toast(t("gov.voted"), "good");
    return data;
  } catch (err) {
    toast(t("msg.error"), "bad");
    return false;
  }
}

export async function registerCandidate() {
  if (!S.profile) return false;
  try {
    const res = await fetch("/api/government/candidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, name: S.profile.username })
    });
    if (!res.ok) throw new Error("Register failed");
    toast(t("gov.registered"), "good");
    return await res.json();
  } catch (err) {
    toast(t("msg.error"), "bad");
    return false;
  }
}

export async function chooseCity(cityId) {
  if (!S.uid) return false;
  try {
    const res = await fetch("/api/government/city", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, cityId })
    });
    if (!res.ok) throw new Error("City change failed");
    const data = await res.json();
    S.currentCity = data.cityId;
    emit("save");
    toast(t("gov.cityChanged"), "good");
    return data;
  } catch (err) {
    toast(t("msg.error"), "bad");
    return false;
  }
}

export async function issuePresidentDecree(cityId, title, message) {
  try {
    const res = await fetch("/api/government/president/decree", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: S.uid, cityId, title, message })
    });
    if (!res.ok) throw new Error("Decree failed");
    toast(t("gov.decreePublished"), "good");
    return await res.json();
  } catch (err) {
    toast(t("msg.error"), "bad");
    return false;
  }
}

export async function adminAddLand(landData) {
  if (!isAdmin()) {
    toast(t("gov.adminOnly"), "bad");
    return false;
  }
  try {
    const res = await fetch("/api/government/admin/add-land", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminEmail: S.user.email, landData })
    });
    if (!res.ok) throw new Error("Admin action failed");
    const data = await res.json();
    applyServerMapIfChanged(data);
    toast(t("gov.landAdded"), "good");
    return data;
  } catch (err) {
    toast(t("msg.error"), "bad");
    return false;
  }
}

export async function adminUpdateMap(payload) {
  if (!isAdmin()) {
    toast(t("gov.adminOnly"), "bad");
    return false;
  }
  try {
    const res = await fetch("/api/government/admin/update-map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminEmail: S.user.email, ...payload })
    });
    if (!res.ok) throw new Error("Admin map update failed");
    const data = await res.json();
    applyServerMapIfChanged(data);
    toast(t("gov.mapUpdated"), "good");
    return data;
  } catch (err) {
    toast(t("msg.error"), "bad");
    return false;
  }
}

export async function adminCreateCity(name) {
  if (!isAdmin()) { toast(t("gov.adminOnly"), "bad"); return false; }
  try {
    const res = await fetch("/api/government/admin/city/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminEmail: S.user.email, name })
    });
    if (!res.ok) throw new Error("Create city failed");
    toast(t("gov.cityCreated"), "good");
    return await res.json();
  } catch (err) {
    toast(t("msg.error"), "bad");
    return false;
  }
}

export async function adminRenameCity(cityId, name) {
  if (!isAdmin()) { toast(t("gov.adminOnly"), "bad"); return false; }
  try {
    const res = await fetch("/api/government/admin/city/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminEmail: S.user.email, cityId, name })
    });
    if (!res.ok) throw new Error("Rename city failed");
    toast(t("gov.cityRenamed"), "good");
    return await res.json();
  } catch (err) {
    toast(t("msg.error"), "bad");
    return false;
  }
}

export async function adminDeleteCity(cityId) {
  if (!isAdmin()) { toast(t("gov.adminOnly"), "bad"); return false; }
  try {
    const res = await fetch("/api/government/admin/city/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminEmail: S.user.email, cityId })
    });
    if (!res.ok) throw new Error("Delete city failed");
    const data = await res.json();
    if (S.uid && data.playerCities && data.playerCities[S.uid]) {
      S.currentCity = data.playerCities[S.uid];
    }
    toast(t("gov.cityDeleted"), "good");
    return data;
  } catch (err) {
    toast(t("msg.error"), "bad");
    return false;
  }
}
