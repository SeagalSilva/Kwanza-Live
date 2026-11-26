import { Router } from "express";
import crypto from "crypto";
import { dbState, saveDb } from "../db.js";
import {
  getDailyPoolView,
  settlePastDailyPools,
  ensureWorkstationUserRecord,
  beginDailyPoolClaim,
  confirmDailyPoolClaim,
  rollbackDailyPoolClaim
} from "../services/dailyPool.js";
import {
  getOrUpdateWorkstationUser,
  beginShiftClaim,
  confirmShiftClaim,
  rollbackShiftClaim
} from "../services/workstationShift.js";

const router = Router();

function ensureUserMailbox(uid) {
  if (!dbState.userMail) dbState.userMail = {};
  if (!Array.isArray(dbState.userMail[uid])) {
    dbState.userMail[uid] = [];
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

  const knownDailyDates = req.query.claimedDates ? String(req.query.claimedDates) : null;
  const knownShiftCycles = req.query.claimedShifts ? String(req.query.claimedShifts) : null;

  settlePastDailyPools();
  const { state: wsState } = getOrUpdateWorkstationUser(uid, null, knownShiftCycles);
  const dailyView = getDailyPoolView(uid, Date.now(), knownDailyDates);
  const userRecord = ensureWorkstationUserRecord(uid);
  const customMails = ensureUserMailbox(uid);

  const mails = [];
  let totalClaimableBronze = 0;

  // 1. Shift rewards from Workstation 30-min shifts (only unclaimed cycles!)
  const shiftBronze = wsState.readyToClaimBronze || 0;
  if (shiftBronze > 0) {
    totalClaimableBronze += shiftBronze;
    const unclaimedShifts = Array.isArray(wsState.history)
      ? wsState.history.filter((h) => h && !h.claimed && (h.bronzeEarned || 0) > 0).slice(0, 5)
      : [];
    const shiftSummary = unclaimedShifts.length > 0
      ? " Turnos prontos: " + unclaimedShifts.map((h) => `${h.depositedPP} PP → +${h.bronzeEarned} 🥉`).join(" · ") + "."
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
      createdAt: (unclaimedShifts[0]?.completedAt) || Date.now()
    });
  }

  // 2. Daily Pool rewards (only unclaimed UTC dates!)
  const dailyBronze = dailyView.dailyReadyToClaimBronze || 0;
  if (dailyBronze > 0) {
    totalClaimableBronze += dailyBronze;
    const unclaimedDaily = Array.isArray(userRecord.dailyHistory)
      ? userRecord.dailyHistory.filter((d) => d && !d.claimed && (d.bronzeEarned || 0) > 0).slice(0, 5)
      : [];
    const dailySummary = unclaimedDaily.length > 0
      ? " Dias prontos: " + unclaimedDaily.map((d) => `${d.date} (#${d.rank}: +${d.bronzeEarned} 🥉)`).join(" · ") + "."
      : "";
    mails.push({
      id: `daily_pool_${uid}`,
      type: "daily_pool",
      sender: "Pool Diária de Kwanza",
      senderIcon: "🏆",
      subject: "Prémio da Pool Diária de Kwanza",
      body: `Parabéns pela tua participação na Pool Diária! Tens ${dailyBronze} moedas de bronze de dias anteriores prontas para levantamento único.${dailySummary}`,
      reward: { bronze: dailyBronze },
      claimed: false,
      read: false,
      createdAt: (unclaimedDaily[0]?.settledAt) || Date.now()
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
  const { uid, mailId, claimAll, claimedDailyDates, claimedShiftCycles } = req.body || {};
  if (!uid) return res.status(400).json({ error: "UID is required" });
  const key = String(uid);

  settlePastDailyPools();
  const { state: wsState } = getOrUpdateWorkstationUser(key, null, claimedShiftCycles);
  const userRecord = ensureWorkstationUserRecord(key);
  const customMails = ensureUserMailbox(key);

  let claimedBronze = 0;
  let shiftClaimId = null;
  let dailyClaimId = null;
  let claimedDates = [];
  let claimedShiftCycleIds = [];
  const claimedCustomIds = [];
  const claimedItems = {};

  const handleClaimShift = () => {
    const r = beginShiftClaim(key, claimedShiftCycles);
    if (r.allowed && r.claimedBronze > 0) {
      claimedBronze += r.claimedBronze;
      shiftClaimId = r.claimId;
      claimedShiftCycleIds = r.claimedShiftCycles || [];
    }
  };

  const handleClaimDaily = () => {
    const r = beginDailyPoolClaim(key, claimedDailyDates);
    if (r.allowed && r.claimedBronze > 0) {
      claimedBronze += r.claimedBronze;
      dailyClaimId = r.claimId;
      claimedDates = r.claimedDates || [];
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
      status: "pending",
      shiftClaimId,
      dailyClaimId,
      claimedCustomIds,
      createdAt: Date.now()
    };
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [cid, entry] of Object.entries(pending)) {
      if (entry.status !== "pending" && entry.createdAt < cutoff) delete pending[cid];
    }
  }

  saveDb();

  res.json({
    success: true,
    claimId,
    claimedBronze,
    claimedItems,
    claimedDates,
    claimedShiftCycles: claimedShiftCycleIds,
    remainingShiftBronze: wsState.readyToClaimBronze || 0,
    remainingDailyBronze: userRecord.dailyReadyToClaimBronze || 0
  });
});

router.post("/claim-confirm", (req, res) => {
  const { uid, claimId } = req.body || {};
  const key = String(uid || "");
  const pending = ensurePendingMailClaims();
  const entry = claimId && pending[claimId];
  if (entry && entry.uid === key && entry.status === "pending") {
    entry.status = "confirmed";
    entry.updatedAt = Date.now();
    if (entry.shiftClaimId) confirmShiftClaim(key, entry.shiftClaimId);
    if (entry.dailyClaimId) confirmDailyPoolClaim(key, entry.dailyClaimId);
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
  if (entry && entry.uid === key && entry.status === "pending") {
    entry.status = "rolled_back";
    entry.updatedAt = Date.now();
    const customMails = ensureUserMailbox(key);

    if (entry.shiftClaimId) rollbackShiftClaim(key, entry.shiftClaimId);
    if (entry.dailyClaimId) rollbackDailyPoolClaim(key, entry.dailyClaimId);

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
