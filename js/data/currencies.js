import { t } from "../i18n.js";

// pp     = "Pool Points": used with the Game Market (NPC) and to buy land.
// coins  = used only in the Player Market.
export const COINS = ["bronze", "silver", "gold"];
export const ALL_CURRENCIES = ["pp", ...COINS];

/** Coin exchange rates (done in the Wallet). */
export const EXCHANGES = [
  { from: "bronze", to: "silver", cost: 150, gain: 1 },
  { from: "silver", to: "bronze", cost: 1,   gain: 120 },
  { from: "silver", to: "gold",   cost: 115, gain: 1 },
  { from: "gold",   to: "silver", cost: 1,   gain: 95 }
];

export const curIcon = (c) =>
  c === "pp" ? `<i class="ico pp">🌾</i>` : `<i class="coin ${c}"></i>`;

export const curName = (c) => t(`cur.${c}`);

/** "12 🥉" style HTML chip. */
export const money = (amount, c) =>
  `<span class="money">${curIcon(c)}<b>${Number(amount).toLocaleString()}</b></span>`;
