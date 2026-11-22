// Character creator options.
export const SKINS  = ["#f6d5b5", "#e0ac69", "#c68642", "#8d5524", "#5c3a21", "#3b2417"];
export const HAIRS  = ["#0b0b0b", "#3b2417", "#6b4423", "#c9a227", "#b5311c", "#7a4fb5"];
export const SHIRTS = ["#cc092f", "#f5c518", "#2e86de", "#27ae60", "#8e44ad", "#ecf0f1", "#222222"];
export const HAIR_STYLES = ["short", "afro", "long", "cap"];

export const DEFAULT_LOOK = { skin: 3, hairColor: 0, hairStyle: 0, shirt: 0 };

/** Make sure a look coming from the database is safe to render. */
export function sanitizeLook(look = {}) {
  const n = (v, max, d) => (Number.isInteger(v) && v >= 0 && v < max ? v : d);
  return {
    skin: n(look.skin, SKINS.length, 3),
    hairColor: n(look.hairColor, HAIRS.length, 0),
    hairStyle: n(look.hairStyle, HAIR_STYLES.length, 0),
    shirt: n(look.shirt, SHIRTS.length, 0)
  };
}
