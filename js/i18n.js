// Internationalisation: English is the default, Portuguese is one click away.
// Translations live in js/data/i18n/en.js and pt.js (same keys in both files).
import en from "./data/i18n/en.js";
import pt from "./data/i18n/pt.js";
import { emit } from "./bus.js";

const dicts = { en, pt };
let lang = "en";
try { const saved = localStorage.getItem("kl_lang"); if (saved === "pt" || saved === "en") lang = saved; } catch (_) {}

export const getLang = () => lang;

export function t(key, params) {
  let s = dicts[lang][key] ?? dicts.en[key] ?? key;
  if (params) s = s.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "");
  return s;
}

export const fmtNum = (n) => Math.round(n).toLocaleString(lang === "pt" ? "pt-AO" : "en-US");

/** Translate every [data-i18n], [data-i18n-ph] and [data-i18n-title] element. */
export function applyStatic(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
    el.setAttribute("aria-label", el.title);
  });
  const btn = document.getElementById("langBtn");
  if (btn) btn.textContent = lang === "en" ? "PT" : "EN";
  document.title = t("app.title");
}

export function setLang(next) {
  if (!dicts[next]) return;
  lang = next;
  try { localStorage.setItem("kl_lang", lang); } catch (_) {}
  document.documentElement.lang = lang === "pt" ? "pt" : "en";
  applyStatic();
  emit("lang", lang);
}

export const toggleLang = () => setLang(lang === "en" ? "pt" : "en");
