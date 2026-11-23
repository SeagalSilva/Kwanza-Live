import { Router } from "express";
import { dbState, saveDb, isAdminEmail } from "../db.js";

const router = Router();

router.get("/state", (req, res) => {
  res.json({
    ...dbState.govState,
    serverTimeUtc: Date.now()
  });
});

router.post("/admin/update-map", (req, res) => {
  const { adminEmail, width, height, publicFarm, buildings, lands } = req.body || {};
  if (!isAdminEmail(adminEmail)) {
    return res.status(403).json({ error: "Unauthorized admin" });
  }

  const cfg = dbState.govState.mapConfig;
  if (width !== undefined) cfg.width = Math.max(20, Math.min(200, Math.round(Number(width))));
  if (height !== undefined) cfg.height = Math.max(20, Math.min(200, Math.round(Number(height))));
  if (publicFarm && typeof publicFarm === "object") {
    cfg.publicFarm = {
      x0: Math.max(2, Math.round(Number(publicFarm.x0))),
      y0: Math.max(2, Math.round(Number(publicFarm.y0)))
    };
  }
  if (buildings && typeof buildings === "object") {
    for (const [id, pos] of Object.entries(buildings)) {
      if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
        cfg.buildings[id] = { x: Math.max(2, Math.round(pos.x)), y: Math.max(2, Math.round(pos.y)) };
      }
    }
  }
  if (lands && typeof lands === "object") {
    for (const [id, pos] of Object.entries(lands)) {
      if (pos && typeof pos.x0 === "number" && typeof pos.y0 === "number") {
        const cleanPos = { x0: Math.max(2, Math.round(pos.x0)), y0: Math.max(2, Math.round(pos.y0)) };
        cfg.lands[id] = cleanPos;
        const custom = dbState.govState.customLands.find((l) => l.id === id);
        if (custom) {
          custom.x0 = cleanPos.x0;
          custom.y0 = cleanPos.y0;
        }
      }
    }
  }

  saveDb();
  res.json({
    success: true,
    mapConfig: dbState.govState.mapConfig,
    customLands: dbState.govState.customLands
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
  dbState.govState.playerCities[String(uid)] = String(cityId);
  saveDb();
  res.json({
    success: true,
    cityId: String(cityId),
    playerCities: dbState.govState.playerCities
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
  dbState.govState.cities.push({ id, name: cleanName, createdAt: Date.now() });
  saveDb();
  res.json({ success: true, cities: dbState.govState.cities });
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
  res.json({ success: true, cities: dbState.govState.cities });
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
  const fallbackId = dbState.govState.cities[0].id;
  for (const [uid, cid] of Object.entries(dbState.govState.playerCities)) {
    if (cid === cityId) dbState.govState.playerCities[uid] = fallbackId;
  }
  saveDb();
  res.json({
    success: true,
    cities: dbState.govState.cities,
    playerCities: dbState.govState.playerCities,
    cityDecrees: dbState.govState.cityDecrees
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
  const { adminEmail, landData } = req.body || {};
  if (!isAdminEmail(adminEmail)) {
    return res.status(403).json({ error: "Unauthorized admin" });
  }
  if (!landData || !landData.id) {
    return res.status(400).json({ error: "Invalid land data" });
  }

  const cleanId = String(landData.id).trim().slice(0, 12);
  const x0 = Math.max(2, Math.round(Number(landData.x0)));
  const y0 = Math.max(2, Math.round(Number(landData.y0)));

  const existing = dbState.govState.customLands.find((l) => l.id === cleanId);
  if (existing) {
    existing.x0 = x0;
    existing.y0 = y0;
  } else {
    dbState.govState.customLands.push({
      id: cleanId,
      x0,
      y0,
      priceGold: Number(landData.priceGold) || 10
    });
  }
  dbState.govState.mapConfig.lands[cleanId] = { x0, y0 };
  saveDb();
  res.json({
    success: true,
    customLands: dbState.govState.customLands,
    mapConfig: dbState.govState.mapConfig
  });
});

export default router;
