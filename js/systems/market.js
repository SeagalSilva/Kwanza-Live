// Player-to-player market. Prices are in bronze / silver / gold coins.
//
// Flow (every step is one atomic multi-path update):
//   list   → item leaves the seller's inventory and a listing is created (escrow)
//   buy    → buyer pays, receives the item, listing gets `soldTo`, seller gets an inbox note
//   collect→ seller's client turns the inbox note into coins and deletes the listing
import { S, inv, bal } from "../state.js";
import { db, ref, push, serverTimestamp, increment } from "../firebase.js";
import { COINS } from "../data/currencies.js";
import { parseItem } from "../data/items.js";
import { MAX_LISTING_PRICE } from "../config.js";
import { t } from "../i18n.js";
import { toast } from "../ui/toast.js";
import { commit, savePath } from "./db.js";

export async function createListing({ item, qty, price, currency }) {
  qty = Math.floor(qty); price = Math.floor(price);
  if (!parseItem(item) || !COINS.includes(currency)) return false;
  if (!(qty >= 1) || qty > inv(item)) { toast(t("msg.notEnough"), "bad"); return false; }
  if (!(price >= 1) || price > MAX_LISTING_PRICE) { toast(t("msg.badPrice"), "bad"); return false; }

  const id = push(ref(db, "market/listings")).key;
  const ok = await commit({
    [`market/listings/${id}`]: {
      seller: S.uid, sellerName: S.profile.username, item, qty, price, currency,
      createdAt: serverTimestamp()
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
  if (!l || l.soldTo) { toast(t("msg.listingGone"), "bad"); return false; }
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
