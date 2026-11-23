import { Router } from "express";
import { dbState, saveDb, isAdminEmail, createDefaultCityMap } from "../db.js";

const router = Router();

function resolveValidCityId(preferredId, uid, preferPlayerCity = false) {
  const cities = dbState.govState.cities || [];
  const fallbackId = cities[0]?.id || "kwanza_central";
  const playerCityId = uid ? dbState.govState.playerCities?.[String(uid)] : null;
  const candidates = preferPlayerCity
    ? [playerCityId, preferredId, fallbackId]
    : [preferredId, playerCityId, fallbackId];

  for (const cid of candidates) {
    if (cid && cities.some((c) => c.id === cid)) return cid;
  }
  return fallbackId;
}

function ensureCityMap(cityId) {
  if (!dbState.govState.cityMaps || typeof dbState.govState.cityMaps !== "object") {
    dbState.govState.cityMaps = {};
  }
  const targetId = resolveValidCityId(cityId);
  if (!dbState.govState.cityMaps[targetId]) {
    dbState.govState.cityMaps[targetId] = createDefaultCityMap();
  }
  if (!dbState.govState.cityMaps[targetId].buildings || typeof dbState.govState.cityMaps[targetId].buildings !== "object") {
    dbState.govState.cityMaps[targetId].buildings = createDefaultCityMap().buildings;
  }
  if (!dbState.govState.cityMaps[targetId].lands || typeof dbState.govState.cityMaps[targetId].lands !== "object") {
    dbState.govState.cityMaps[targetId].lands = {};
  }
  if (!Array.isArray(dbState.govState.cityMaps[targetId].customLands)) {
    dbState.govState.cityMaps[targetId].customLands = [];
  }
  return { cityId: targetId, cityMap: dbState.govState.cityMaps[targetId] };
}

function ensureAllCityMaps() {
  for (const c of dbState.govState.cities || []) {
    if (c && c.id) ensureCityMap(c.id);
  }
}

function syncLegacyPrimaryMap(targetId, cityMap) {
  const primaryId = dbState.govState.cities?.[0]?.id || "kwanza_central";
  if (targetId === primaryId) {
    dbState.govState.mapConfig = cityMap;
    dbState.govState.customLands = cityMap.customLands || [];
  }
}

router.get("/state", (req, res) => {
  ensureAllCityMaps();
  const activeCityId = resolveValidCityId(req.query?.cityId, req.query?.uid, true);
  const { cityMap } = ensureCityMap(activeCityId);
  res.json({
    ...dbState.govState,
    activeCityId,
    mapConfig: cityMap,
    customLands: cityMap.customLands || [],
    serverTimeUtc: Date.now()
  });
});

router.post("/admin/update-map", (req, res) => {
  const { adminEmail, cityId, uid, width, height, publicFarm, buildings, lands } = req.body || {};
  if (!isAdminEmail(adminEmail)) {
    return res.status(403).json({ error: "Unauthorized admin" });
  }

  const targetId = resolveValidCityId(cityId, uid, false);
  const { cityMap: cfg } = ensureCityMap(targetId);

  if (width !== undefined && Number.isFinite(Number(width))) {
    cfg.width = Math.max(20, Math.min(200, Math.round(Number(width))));
  }
  if (height !== undefined && Number.isFinite(Number(height))) {
    cfg.height = Math.max(20, Math.min(200, Math.round(Number(height))));
  }
  if (publicFarm && typeof publicFarm === "object") {
    const x0 = Number(publicFarm.x0);
    const y0 = Number(publicFarm.y0);
    if (Number.isFinite(x0) && Number.isFinite(y0)) {
      cfg.publicFarm = {
        x0: Math.max(2, Math.round(x0)),
        y0: Math.max(2, Math.round(y0))
      };
    }
  }
  if (buildings && typeof buildings === "object") {
    for (const [id, pos] of Object.entries(buildings)) {
      if (pos && Number.isFinite(Number(pos.x)) && Number.isFinite(Number(pos.y))) {
        cfg.buildings[id] = {
          x: Math.max(2, Math.round(Number(pos.x))),
          y: Math.max(2, Math.round(Number(pos.y)))
        };
      }
    }
  }
  if (lands && typeof lands === "object") {
    for (const [id, pos] of Object.entries(lands)) {
      if (pos && Number.isFinite(Number(pos.x0)) && Number.isFinite(Number(pos.y0))) {
        const cleanPos = {
          x0: Math.max(2, Math.round(Number(pos.x0))),
          y0: Math.max(2, Math.round(Number(pos.y0)))
        };
        cfg.lands[id] = cleanPos;
        const custom = cfg.customLands.find((l) => l.id === id);
        if (custom) {
          custom.x0 = cleanPos.x0;
          custom.y0 = cleanPos.y0;
        }
      }
    }
  }

  syncLegacyPrimaryMap(targetId, cfg);
  saveDb();
  res.json({
    success: true,
    cityId: targetId,
    cities: dbState.govState.cities,
    playerCities: dbState.govState.playerCities,
    cityMaps: dbState.govState.cityMaps,
    mapConfig: cfg,
    customLands: cfg.customLands || []
  });
});

router.post("/candidate", (req, res) => {
  const { uid, name } = req.body || {};
  if (!uid || !name) return res.status(400).json({ error: "Missing uid or name" });

  if (!dbState.govState.candidates.some((c) => c.uid === uid)) {
    dbState.govState.candidates.push({ uid: String(uid), name: String(name).slice(0, 16), votes: 0 });
    saveDb();
  }
  res.json({ success: true, candidates: dbState.govState.candidates });
});

router.post("/vote", (req, res) => {
  const { voterUid, candidateUid } = req.body || {};
  if (!voterUid || !candidateUid) return res.status(400).json({ error: "Missing IDs" });

  const voterKey = String(voterUid);
  if (dbState.govState.votedUids.includes(voterKey)) {
    return res.status(400).json({ error: "Already voted" });
  }

  const cand = dbState.govState.candidates.find((c) => c.uid === candidateUid);
  if (!cand) return res.status(404).json({ error: "Candidate not found" });

  cand.votes = (cand.votes || 0) + 1;
  dbState.govState.votedUids.push(voterKey);

  dbState.govState.candidates.sort((a, b) => b.votes - a.votes);
  const currentPresVotes = dbState.govState.candidates.find((c) => c.uid === dbState.govState.president?.uid)?.votes || 0;
  if (!dbState.govState.president || dbState.govState.candidates[0].votes >= currentPresVotes) {
    dbState.govState.president = {
      uid: dbState.govState.candidates[0].uid,
      name: dbState.govState.candidates[0].name
    };
  }

  saveDb();
  res.json({
    success: true,
    president: dbState.govState.president,
    candidates: dbState.govState.candidates
  });
});

router.post("/city", (req, res) => {
  const { uid, cityId } = req.body || {};
  if (!uid || !cityId) return res.status(400).json({ error: "Missing uid or cityId" });
  if (!dbState.govState.cities.some((c) => c.id === cityId)) {
    return res.status(404).json({ error: "City not found" });
  }
  const cleanCityId = String(cityId);
  dbState.govState.playerCities[String(uid)] = cleanCityId;
  const { cityMap } = ensureCityMap(cleanCityId);
  saveDb();
  res.json({
    success: true,
    cityId: cleanCityId,
    cities: dbState.govState.cities,
    playerCities: dbState.govState.playerCities,
    cityMaps: dbState.govState.cityMaps,
    mapConfig: cityMap,
    customLands: cityMap.customLands || []
  });
});

router.post("/admin/city/create", (req, res) => {
  const { adminEmail, name } = req.body || {};
  if (!isAdminEmail(adminEmail)) {
    return res.status(403).json({ error: "Unauthorized admin" });
  }
  const cleanName = String(name || "").trim().slice(0, 32);
  if (!cleanName) return res.status(400).json({ error: "City name required" });

  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "city";
  let id = slug;
  let n = 2;
  while (dbState.govState.cities.some((c) => c.id === id)) {
    id = `${slug}_${n++}`;
  }
  const createdCity = { id, name: cleanName, createdAt: Date.now() };
  dbState.govState.cities.push(createdCity);
  if (!dbState.govState.cityMaps || typeof dbState.govState.cityMaps !== "object") {
    dbState.govState.cityMaps = {};
  }
  dbState.govState.cityMaps[id] = createDefaultCityMap();
  saveDb();
  res.json({
    success: true,
    createdCity,
    cities: dbState.govState.cities,
    cityMaps: dbState.govState.cityMaps
  });
});

router.post("/admin/city/rename", (req, res) => {
  const { adminEmail, cityId, name } = req.body || {};
  if (!isAdminEmail(adminEmail)) {
    return res.status(403).json({ error: "Unauthorized admin" });
  }
  const cleanName = String(name || "").trim().slice(0, 32);
  if (!cleanName) return res.status(400).json({ error: "City name required" });

  const city = dbState.govState.cities.find((c) => c.id === cityId);
  if (!city) return res.status(404).json({ error: "City not found" });
  city.name = cleanName;
  saveDb();
  res.json({
    success: true,
    cities: dbState.govState.cities,
    cityMaps: dbState.govState.cityMaps
  });
});

router.post("/admin/city/delete", (req, res) => {
  const { adminEmail, cityId } = req.body || {};
  if (!isAdminEmail(adminEmail)) {
    return res.status(403).json({ error: "Unauthorized admin" });
  }
  if (dbState.govState.cities.length <= 1) {
    return res.status(400).json({ error: "At least one city must exist" });
  }
  const idx = dbState.govState.cities.findIndex((c) => c.id === cityId);
  if (idx === -1) return res.status(404).json({ error: "City not found" });

  dbState.govState.cities.splice(idx, 1);
  delete dbState.govState.cityDecrees[cityId];
  if (dbState.govState.cityMaps) {
    delete dbState.govState.cityMaps[cityId];
  }
  const fallbackId = dbState.govState.cities[0].id;
  for (const [uid, cid] of Object.entries(dbState.govState.playerCities)) {
    if (cid === cityId) dbState.govState.playerCities[uid] = fallbackId;
  }
  const { cityMap: fallbackMap } = ensureCityMap(fallbackId);
  syncLegacyPrimaryMap(fallbackId, fallbackMap);
  saveDb();
  res.json({
    success: true,
    cities: dbState.govState.cities,
    playerCities: dbState.govState.playerCities,
    cityDecrees: dbState.govState.cityDecrees,
    cityMaps: dbState.govState.cityMaps,
    mapConfig: fallbackMap,
    customLands: fallbackMap.customLands || []
  });
});

router.post("/president/decree", (req, res) => {
  const { uid, cityId, title, message } = req.body || {};
  if (!dbState.govState.president || dbState.govState.president.uid !== uid) {
    return res.status(403).json({ error: "Only the elected president can issue decrees" });
  }
  const cleanTitle = String(title || "").trim().slice(0, 60);
  const cleanMsg = String(message || "").trim().slice(0, 200);
  if (!cleanTitle || !cleanMsg) {
    return res.status(400).json({ error: "Title and message are required" });
  }
  const targetCity = dbState.govState.cities.some((c) => c.id === cityId)
    ? cityId
    : (dbState.govState.cities[0]?.id || "kwanza_central");
  dbState.govState.cityDecrees[targetCity] = {
    title: cleanTitle,
    message: cleanMsg,
    byName: dbState.govState.president.name,
    updatedAt: Date.now()
  };
  saveDb();
  res.json({ success: true, cityDecrees: dbState.govState.cityDecrees });
});

router.post("/admin/add-land", (req, res) => {
  const { adminEmail, cityId, uid, landData } = req.body || {};
  if (!isAdminEmail(adminEmail)) {
    return res.status(403).json({ error: "Unauthorized admin" });
  }
  if (!landData || !landData.id) {
    return res.status(400).json({ error: "Invalid land data" });
  }

  const targetId = resolveValidCityId(cityId, uid, false);
  const { cityMap } = ensureCityMap(targetId);

  const cleanId = String(landData.id).trim().slice(0, 12);
  const rawX = Number(landData.x0);
  const rawY = Number(landData.y0);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    return res.status(400).json({ error: "Invalid coordinates" });
  }
  const x0 = Math.max(2, Math.round(rawX));
  const y0 = Math.max(2, Math.round(rawY));

  const existing = cityMap.customLands.find((l) => l.id === cleanId);
  if (existing) {
    existing.x0 = x0;
    existing.y0 = y0;
  } else {
    cityMap.customLands.push({
      id: cleanId,
      x0,
      y0,
      priceGold: Number(landData.priceGold) || 10
    });
  }
  cityMap.lands[cleanId] = { x0, y0 };
  syncLegacyPrimaryMap(targetId, cityMap);
  saveDb();
  res.json({
    success: true,
    cityId: targetId,
    cities: dbState.govState.cities,
    playerCities: dbState.govState.playerCities,
    cityMaps: dbState.govState.cityMaps,
    customLands: cityMap.customLands,
    mapConfig: cityMap
  });
});

export default router;
