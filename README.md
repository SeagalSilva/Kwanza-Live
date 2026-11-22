# Kwanza Live

A multiplayer 2D farming world. Sign in with Google, pick a unique username, create your character,
then plant and harvest on the **public farm**, sell at the **Game Market** (Pool Points) or in the
**Players' Bazaar** (bronze / silver / gold coins), and buy your own **private land**.

English is the default language; the **PT / EN** button (top right) switches at any time.

## Project structure

```
kwanza-live/
├── index.html                 Page shell: screens (login, onboarding, game) and HUD markup
├── css/
│   ├── base.css               Variables, buttons, inputs, toasts, currency icons
│   ├── screens.css            Login, character creator, game container
│   ├── hud.css                Portrait, wallet, seed hotbar, d-pad, interact button
│   └── modal.css              Market / inventory / wallet / land windows
├── js/
│   ├── main.js                Entry point: auth → profile → game
│   ├── game.js                Game loop (input → update → render → multiplayer)
│   ├── config.js              Firebase config + balance constants  ← edit to rebalance
│   ├── firebase.js            Firebase SDK setup
│   ├── i18n.js                Translation engine (EN default, PT toggle)
│   ├── state.js, bus.js, utils.js
│   ├── data/                  Pure data — easiest place to edit content
│   │   ├── crops.js           Crops: grow time, yield, seed cost, sell price
│   │   ├── lands.js           Private plots: position and price
│   │   ├── currencies.js      Pool points, coins, exchange rates
│   │   ├── items.js           Inventory item helpers
│   │   ├── character.js       Skin / hair / shirt palettes
│   │   └── i18n/en.js, pt.js  All texts (same keys in both files)
│   ├── systems/               Game rules (talk to Firebase)
│   │   ├── auth.js  profile.js  sync.js  presence.js
│   │   ├── farming.js  economy.js  lands.js  market.js  db.js
│   ├── world/                 Everything drawn on the canvas
│   │   ├── map.js             Tile layout: roads, public farm, buildings, lands
│   │   ├── renderer.js  character.js  player.js  input.js  interactions.js
│   └── ui/                    DOM screens and windows
│       ├── login.js  onboarding.js  hud.js  modal.js  toast.js  screens.js
│       └── modals/            inventory, wallet, gameMarket, playerMarket, land
├── database.rules.json        Realtime Database security rules
├── firebase.json              Lets `firebase deploy --only database` find the rules
└── vercel.json                Static hosting settings
```

## How to play

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | WASD / arrows, or click the ground | D-pad, or tap the ground |
| Interact (plant, harvest, enter shop) | `E` / Space, or click the tile/building | Yellow action button, or tap |
| Choose seed | `1`–`6` or click the hotbar | Tap the hotbar |

* **Public farm** (centre-left): everybody may plant. You can only harvest **your own** crops and nobody can
  remove yours — no vandalism. Max 8 active crops per player. Crops left ripe for 20 minutes wither and can
  be cleared by anyone, so abandoned tiles never block the farm.
* **Game Market** (red roof): buy seeds and sell harvest for Pool Points (PP).
* **Players' Bazaar** (blue roof): list items for bronze / silver / gold coins; buyers pay coins, sellers are
  paid automatically (even offline, on next login). Exchange coins in the 👛 wallet.
* **Private lands** (fenced plots): buy with Pool Points; only the owner can enter and plant there.

## Run locally

ES modules need a web server (do not open `index.html` by double-click):

```bash
cd kwanza-live
npx serve .          # or: python3 -m http.server 8000
```

Then open `http://localhost:3000` (or `:8000`).

## Firebase setup (once)

1. **Authentication → Sign-in method**: enable **Google**.
2. **Authentication → Settings → Authorized domains**: add `localhost` and your Vercel domain
   (e.g. `kwanza-live.vercel.app`).
3. **Realtime Database → Rules**: paste the content of `database.rules.json` and publish
   (or `firebase deploy --only database`).

## Deploy on Vercel

```bash
npm i -g vercel
cd kwanza-live
vercel --prod
```

No build step is needed. Remember to add the final domain to Firebase *Authorized domains*.

## Editing guide

* New crop → add it in `js/data/crops.js` and its name in `js/data/i18n/en.js` and `pt.js` (`crop.<id>`).
* Land prices / positions → `js/data/lands.js` (positions must stay inside the free map areas in `world/map.js`).
* Start kit, farm limits, speed → `js/config.js`.
* New language → copy `en.js`, translate, register it in `js/i18n.js`.

## Security note (important)

The security rules protect usernames, land ownership, crop ownership, the market listings and prevent
negative balances. But the game has **no server**: prices and rewards are calculated in the browser, so a
determined player could edit their own wallet. For a competitive economy with real-world value, move the
sensitive actions (selling, buying land, market payments) to Firebase Cloud Functions.
