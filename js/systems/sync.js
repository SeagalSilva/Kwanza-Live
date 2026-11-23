// Realtime subscriptions that keep the shared state S up to date.
import { db, ref, onValue, onChildAdded, query, orderByChild, limitToLast } from "../firebase.js";
import { S } from "../state.js";
import { emit } from "../bus.js";
import { collectSale } from "./market.js";

let offs = [];

/** Start listening. Resolves (true/false = "save exists") after the first save snapshot. */
export function startSync(uid) {
  stopSync();
  return new Promise((resolve) => {
    let first = true;
    let prevWallet = null;
    const listen = (r, cb) => offs.push(onValue(r, cb, (err) => {
      console.warn("[sync]", err);
      if (first) { first = false; resolve(false); }
    }));

    listen(ref(db, ".info/serverTimeOffset"), (s) => { S.offset = s.val() || 0; });

    listen(ref(db, `users/${uid}/save`), (s) => {
      const v = s.val();
      if (v) {
        const nextWallet = { pp: 0, bronze: 0, silver: 0, gold: 0, ...(v.wallet || {}) };
        if (prevWallet) {
          const dBronze = nextWallet.bronze - prevWallet.bronze;
          const dSilver = nextWallet.silver - prevWallet.silver;
          const dGold = nextWallet.gold - prevWallet.gold;
          const dPP = nextWallet.pp - prevWallet.pp;

          if (dBronze > 0 || dSilver > 0 || dGold > 0) {
            emit("coinsReceived", {
              bronze: Math.max(0, dBronze),
              silver: Math.max(0, dSilver),
              gold: Math.max(0, dGold)
            });
          }
          if (dPP > 0) {
            emit("ppReceived", { pp: dPP });
          }
        }
        prevWallet = { ...nextWallet };
        S.save = {
          wallet: nextWallet,
          inv: v.inv || {},
          energy: { current: 100, max: 100, lastRegen: Date.now(), ...(v.energy || {}) },
          adExemptUntil: v.adExemptUntil || 0
        };
        emit("save");
      }
      if (first) { first = false; resolve(!!v); }
    });

    listen(ref(db, "world/publicFarm"), (s) => { S.farm = s.val() || {}; emit("farm"); });
    listen(ref(db, "world/lands"), (s) => { S.lands = s.val() || {}; emit("lands"); });
    listen(ref(db, "world/landTiles"), (s) => { S.landTiles = s.val() || {}; emit("farm"); });
    listen(query(ref(db, "market/listings"), orderByChild("createdAt"), limitToLast(200)), (s) => {
      S.listings = s.val() || {};
      emit("listings");
    });

    // Money from items sold to other players arrives in the inbox.
    offs.push(onChildAdded(ref(db, `users/${uid}/inbox`), (s) => collectSale(s.key, s.val()), (e) => console.warn("[inbox]", e)));
  });
}

export function stopSync() {
  offs.forEach((off) => { try { off(); } catch (_) {} });
  offs = [];
}
