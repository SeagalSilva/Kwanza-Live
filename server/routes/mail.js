import { Router } from "express";
import crypto from "crypto";
import { dbState, saveDb } from "../db.js";
import { getOrUpdateWorkstationUser } from "./workstation.js";
import { getDailyPoolView, settlePastDailyPools, ensureWorkstationUserRecord } from "../dailyPool.js";

const router = Router();

function ensureUserMailbox(uid) {
  if (!dbState.userMail) dbState.userMail = {};
  if (!Array.isArray(dbState.userMail[uid])) {
    dbState.userMail[uid] = [];
    // Seed welcome post office letter
    dbState.userMail[uid].push({
      id: `welcome_${uid}`,
      type: "system",
      sender: "Correios Centrais",
      senderIcon: "📮",
      subject: "Bem-vindo ao Correio de Kwanza!",
      body: "Aqui recebes a tua correspondência oficial, avisos importantes e todas as recompensas acumuladas de turnos no Posto de Trabalho (30 min) ou participações na Pool Diária. Mesmo que fiques muito tempo sem jogar, os teus prémios nunca se perdem e ficam guardados aqui com segurança!",
      reward: { bronze: 5 },
      claimed: false,
      read: false,
      createdAt: Date.now()
    });
    saveDb();
  }
  return dbState.userMail[uid];
}

function ensurePendingMailClaims() {
  if (!dbState.pendingMailClaims || typeof dbState.pendingMailClaims !== "object") {
    dbState.pendingMailClaims = {};
  }
  return dbState.pendingMailClaims;
}

router.get("/inbox/:uid", (req, res) => {
  const uid = String(req.params.uid || "");
  if (!uid) return res.status(400).json({ error: "UID is required" });

  settlePastDailyPools();
  const { state: wsState } = getOrUpdateWorkstationUser(uid);
  getDailyPoolView(uid);
  const userRecord = ensureWorkstationUserRecord(uid);
  const customMails = ensureUserMailbox(uid);

  const mails = [];
  let totalClaimableBronze = 0;

  // 1. Shift rewards from Workstation 30-min shifts (never expire!)
  const shiftBronze = wsState.readyToClaimBronze || 0;
  if (shiftBronze > 0) {
    totalClaimableBronze += shiftBronze;
    const recentShifts = Array.isArray(wsState.history) ? wsState.history.slice(0, 5) : [];
    const shiftSummary = recentShifts.length > 0
      ? " Últimos turnos: " + recentShifts.map((h) => `${h.depositedPP} PP → +${h.bronzeEarned} 🥉`).join(" · ") + "."
      : "";
    mails.push({
      id: `shift_reward_${uid}`,
      type: "shift_reward",
      sender: "Posto de Trabalho",
      senderIcon: "🔨",
      subject: "Recompensa de Turno(s) de 30 Minutos",
      body: `Os teus turnos de 30 min no Posto de Trabalho foram processados e guardados! Tens ${shiftBronze} moedas de bronze acumuladas e prontas para levantamento.${shiftSummary}`,
      reward: { bronze: shiftBronze },
      claimed: false,
      read: false,
      createdAt: (recentShifts[0]?.completedAt) || Date.now()
    });
  }

  // 2. Daily Pool rewards (never expire!)
  const dailyBronze = userRecord.dailyReadyToClaimBronze || 0;
  if (dailyBronze > 0) {
    totalClaimableBronze += dailyBronze;
    const recentDaily = Array.isArray(userRecord.dailyHistory) ? userRecord.dailyHistory.slice(0, 5) : [];
    const dailySummary = recentDaily.length > 0
      ? " Registo recente: " + recentDaily.map((d) => `${d.date} (#${d.rank}: +${d.bronzeEarned} 🥉)`).join(" · ") + "."
      : "";
    mails.push({
      id: `daily_pool_${uid}`,
      type: "daily_pool",
      sender: "Pool Diária de Kwanza",
      senderIcon: "🏆",
      subject: "Prémio da Pool Diária de Kwanza",
      body: `Parabéns pela tua participação na Pool Diária! Tens ${dailyBronze} moedas de bronze acumuladas de dias anteriores prontas para levantamento.${dailySummary}`,
      reward: { bronze: dailyBronze },
      claimed: false,
      read: false,
      createdAt: (recentDaily[0]?.settledAt) || Date.now()
    });
  }

  // 3. VIP Ad Exemption Certificate / Notice
  const adEntry = dbState.adExemptions?.[uid];
  const now = Date.now();
  if (adEntry && adEntry.exemptUntil > now) {
    const daysLeft = Math.ceil((adEntry.exemptUntil - now) / (24 * 60 * 60 * 1000));
    mails.push({
      id: `vip_notice_${uid}`,
      type: "vip_status",
      sender: "Administração VIP",
      senderIcon: "👑",
      subject: "👑 Certificado de Isenção de Anúncios VIP",
      body: `O teu estatuto VIP de isenção de anúncios está ativo e válido até ${new Date(adEntry.exemptUntil).toLocaleDateString("pt-PT")} (${daysLeft} dias restantes). Durante este período estás totalmente isento de anúncios obrigatórios. Obrigado por apoiares o Kwanza Live!`,
      reward: null,
      claimed: true,
      read: true,
      createdAt: adEntry.updatedAt || now
    });
  }

  // 4. Custom & system mails
  for (const m of customMails) {
    if (m.reward?.bronze && !m.claimed) {
      totalClaimableBronze += m.reward.bronze;
    }
    mails.push(m);
  }

  // Sort: unclaimed with rewards first, then newest
  mails.sort((a, b) => {
    const aHasReward = a.reward && !a.claimed ? 1 : 0;
    const bHasReward = b.reward && !b.claimed ? 1 : 0;
    if (bHasReward !== aHasReward) return bHasReward - aHasReward;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const unreadCount = mails.filter((m) => !m.read || (m.reward && !m.claimed)).length;

  res.json({
    mails,
    unreadCount,
    totalClaimableBronze,
    serverTimeUtc: now
  });
});

router.post("/claim", (req, res) => {
  const { uid, mailId, claimAll } = req.body || {};
  if (!uid) return res.status(400).json({ error: "UID is required" });
  const key = String(uid);

  settlePastDailyPools();
  const { state: wsState } = getOrUpdateWorkstationUser(key);
  const userRecord = ensureWorkstationUserRecord(key);
  const customMails = ensureUserMailbox(key);

  let claimedBronze = 0;
  let shiftTaken = 0;
  let dailyTaken = 0;
  const claimedCustomIds = [];
  const claimedItems = {};

  const handleClaimShift = () => {
    if ((wsState.readyToClaimBronze || 0) > 0) {
      shiftTaken = wsState.readyToClaimBronze;
      claimedBronze += shiftTaken;
      wsState.readyToClaimBronze = 0;
    }
  };

  const handleClaimDaily = () => {
    if ((userRecord.dailyReadyToClaimBronze || 0) > 0) {
      dailyTaken = userRecord.dailyReadyToClaimBronze;
      claimedBronze += dailyTaken;
      userRecord.dailyReadyToClaimBronze = 0;
    }
  };

  const handleClaimCustom = (m) => {
    if (m && !m.claimed && m.reward) {
      if (m.reward.bronze) claimedBronze += m.reward.bronze;
      if (m.reward.items) {
        for (const [k, v] of Object.entries(m.reward.items)) {
          claimedItems[k] = (claimedItems[k] || 0) + v;
        }
      }
      m.claimed = true;
      m.read = true;
      m.claimedAt = Date.now();
      claimedCustomIds.push(m.id);
    }
  };

  if (claimAll) {
    handleClaimShift();
    handleClaimDaily();
    for (const m of customMails) handleClaimCustom(m);
  } else if (mailId === `shift_reward_${key}`) {
    handleClaimShift();
  } else if (mailId === `daily_pool_${key}`) {
    handleClaimDaily();
  } else {
    const target = customMails.find((m) => m.id === mailId);
    if (target) handleClaimCustom(target);
  }

  let claimId = null;
  if (claimedBronze > 0 || Object.keys(claimedItems).length > 0) {
    claimId = crypto.randomUUID();
    const pending = ensurePendingMailClaims();
    pending[claimId] = {
      uid: key,
      shiftTaken,
      dailyTaken,
      claimedCustomIds,
      createdAt: Date.now()
    };
    // Prune confirmed/stale tracking entries > 30 min
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [cid, entry] of Object.entries(pending)) {
      if (entry.createdAt < cutoff) delete pending[cid];
    }
  }

  saveDb();

  res.json({
    success: true,
    claimId,
    claimedBronze,
    claimedItems,
    remainingShiftBronze: wsState.readyToClaimBronze || 0,
    remainingDailyBronze: userRecord.dailyReadyToClaimBronze || 0
  });
});

router.post("/claim-confirm", (req, res) => {
  const { uid, claimId } = req.body || {};
  const pending = ensurePendingMailClaims();
  if (claimId && pending[claimId] && pending[claimId].uid === String(uid)) {
    delete pending[claimId];
    saveDb();
  }
  res.json({ success: true });
});

router.post("/claim-rollback", (req, res) => {
  const { uid, claimId } = req.body || {};
  const key = String(uid || "");
  const pending = ensurePendingMailClaims();
  const entry = claimId && pending[claimId];
  if (entry && entry.uid === key) {
    const { state: wsState } = getOrUpdateWorkstationUser(key);
    const userRecord = ensureWorkstationUserRecord(key);
    const customMails = ensureUserMailbox(key);

    if (entry.shiftTaken > 0) {
      wsState.readyToClaimBronze = (wsState.readyToClaimBronze || 0) + entry.shiftTaken;
    }
    if (entry.dailyTaken > 0) {
      userRecord.dailyReadyToClaimBronze = (userRecord.dailyReadyToClaimBronze || 0) + entry.dailyTaken;
    }
    for (const cid of entry.claimedCustomIds || []) {
      const m = customMails.find((x) => x.id === cid);
      if (m) {
        m.claimed = false;
        delete m.claimedAt;
      }
    }
    delete pending[claimId];
    saveDb();
  }
  res.json({ success: true });
});

router.post("/mark-read", (req, res) => {
  const { uid, mailId } = req.body || {};
  if (!uid || !mailId) return res.status(400).json({ error: "UID and mailId required" });

  const customMails = ensureUserMailbox(String(uid));
  const target = customMails.find((m) => m.id === mailId);
  if (target) {
    target.read = true;
    saveDb();
  }
  res.json({ success: true });
});

export default router;
