// Player-to-player market. Prices are in bronze / silver / gold coins.
// Limits: max MAX_PLAYER_LISTINGS (5) active listings per player and LISTING_TTL_MS (24h) duration.
import { S, now, inv, bal } from "../state.js";
import { db, ref, push, serverTimestamp, increment } from "../firebase.js";
import { COINS } from "../data/currencies.js";
import { parseItem } from "../data/items.js";
import { MAX_LISTING_PRICE, MAX_PLAYER_LISTINGS, LISTING_TTL_MS } from "../config.js";
import { t } from "../i18n.js";
import { toast } from "../ui/toast.js";
import { commit, savePath } from "./db.js";

export function isListingExpired(l) {
  if (!l || l.soldTo) return false;
  if (typeof l.expiresAt === "number") return now() > l.expiresAt;
  if (typeof l.createdAt === "number") return now() - l.createdAt > LISTING_TTL_MS;
  return false;
}

export function myActiveListingsCount() {
  return Object.values(S.listings).filter(
    (l) => l && l.seller === S.uid && !l.soldTo && !isListingExpired(l)
  ).length;
}

export async function createListing({ item, qty, price, currency }) {
  qty = Math.floor(qty); price = Math.floor(price);
  if (!parseItem(item) || !COINS.includes(currency)) return false;
  if (myActiveListingsCount() >= MAX_PLAYER_LISTINGS) {
    toast(t("pm.limitReached", { n: MAX_PLAYER_LISTINGS }), "bad");
    return false;
  }
  if (!(qty >= 1) || qty > inv(item)) { toast(t("msg.notEnough"), "bad"); return false; }
  if (!(price >= 1) || price > MAX_LISTING_PRICE) { toast(t("msg.badPrice"), "bad"); return false; }

  const id = push(ref(db, "market/listings")).key;
  const expiresAt = now() + LISTING_TTL_MS;
  const ok = await commit({
    [`market/listings/${id}`]: {
      seller: S.uid, sellerName: S.profile.username, item, qty, price, currency,
      createdAt: serverTimestamp(),
      expiresAt
    },
    [savePath(S.uid, `inv/${item}`)]: increment(-qty)
  });
  if (ok) toast(t("msg.listed"), "good");
  return ok;
}

export async function cancelListing(id) {
  const l = S.listings[id];
  if (!l || l.seller !== S.uid || l.soldTo) return false;
  const ok = await commit({
    [`market/listings/${id}`]: null,
    [savePath(S.uid, `inv/${l.item}`)]: increment(l.qty)
  });
  if (ok) toast(t("msg.canceled"));
  return ok;
}

export async function buyListing(id) {
  const l = S.listings[id];
  if (!l || l.soldTo || isListingExpired(l)) { toast(t("msg.listingGone"), "bad"); return false; }
  if (l.seller === S.uid) return false;
  if (bal(l.currency) < l.price) { toast(t("msg.notEnough"), "bad"); return false; }

  const inboxKey = push(ref(db, `users/${l.seller}/inbox`)).key;
  const ok = await commit({
    [`market/listings/${id}/soldTo`]: S.uid,
    [savePath(S.uid, `wallet/${l.currency}`)]: increment(-l.price),
    [savePath(S.uid, `inv/${l.item}`)]: increment(l.qty),
    [`users/${l.seller}/inbox/${inboxKey}`]: {
      currency: l.currency, amount: l.price, item: l.item, qty: l.qty,
      buyerName: S.profile.username, listingId: id, at: serverTimestamp()
    }
  }, "msg.listingGone");
  if (ok) toast(t("msg.bought"), "good");
  return ok;
}

/** Called for every note in my inbox (runs on login too, so offline sales are paid). */
export async function collectSale(key, sale) {
  if (!S.uid || !sale) return;
  const updates = { [`users/${S.uid}/inbox/${key}`]: null };
  if (COINS.includes(sale.currency) && sale.amount > 0) {
    updates[savePath(S.uid, `wallet/${sale.currency}`)] = increment(sale.amount);
  }
  if (sale.listingId) updates[`market/listings/${sale.listingId}`] = null;
  const ok = await commit(updates);
  if (ok && sale.amount > 0) {
    toast(t("msg.saleReceived", { amount: sale.amount, cur: t(`cur.${sale.currency}`), name: sale.buyerName || "?" }), "good", 4000);
  }
}
