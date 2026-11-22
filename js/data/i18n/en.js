// English (default language). Keep the same keys as pt.js.
export default {
  "app.title": "Kwanza Live",
  "loading": "Loading…",
  "lang.switch": "Switch language",

  // Login
  "login.tag": "A multiplayer farming world. Plant, harvest, trade and build your land.",
  "login.google": "Sign in with Google",
  "login.how1": "🌱 Plant seeds on the public farm",
  "login.how2": "🧺 Harvest and sell for Pool Points or coins",
  "login.how3": "🏡 Buy your own land",
  "login.err.domain": "This domain ({host}) is not authorised. Add it in Firebase › Authentication › Settings › Authorized domains.",
  "login.err.generic": "Sign-in failed: {msg}",

  // Onboarding
  "ob.step1.title": "Choose your username",
  "ob.username.label": "Username",
  "ob.username.hint": "3–16 characters: letters, numbers and _",
  "ob.username.invalid": "Use 3–16 letters, numbers or _ only.",
  "ob.username.checking": "Checking…",
  "ob.username.ok": "Great, this name is free!",
  "ob.username.taken": "This username is already taken.",
  "ob.username.error": "Could not check the name. Try again.",
  "ob.next": "Next",
  "ob.back": "Back",
  "ob.step2.title": "Create your character",
  "ob.skin": "Skin",
  "ob.hair": "Hair colour",
  "ob.hairStyle": "Hair style",
  "ob.shirt": "Shirt",
  "ob.create": "Start playing",
  "ob.tapTurn": "Tap the character to turn it around",
  "hs.short": "Short",
  "hs.afro": "Afro",
  "hs.long": "Long",
  "hs.cap": "Cap",

  // HUD
  "hud.inventory": "Inventory",
  "hud.wallet": "Wallet",
  "hud.logout": "Sign out",
  "hud.seedSlot": "{crop} seeds",
  "hint.controls": "WASD / arrows: move · E: interact · 1–6: choose seed · click: walk / use",

  // Currencies
  "cur.pp": "Pool Points",
  "cur.bronze": "Bronze coins",
  "cur.silver": "Silver coins",
  "cur.gold": "Gold coins",

  // Crops & items
  "crop.corn": "Corn",
  "crop.beans": "Beans",
  "crop.peanut": "Peanut",
  "crop.cassava": "Cassava",
  "crop.banana": "Banana",
  "crop.pineapple": "Pineapple",
  "item.seedOf": "{name} seeds",

  // Places
  "place.gameMarket": "Game Market",
  "place.bazaar": "Players' Bazaar",
  "place.publicFarm": "Public Farm",

  // Actions
  "act.plant": "Plant",
  "act.harvest": "Harvest",
  "act.inspect": "Inspect",
  "act.clear": "Clear",
  "act.open": "Enter {place}",
  "act.viewLand": "Land {id}",
  "act.buy": "Buy",
  "act.sell": "Sell",
  "act.sellAll": "Sell all",
  "act.cancel": "Cancel",

  // Inventory
  "inv.title": "Inventory",
  "inv.seeds": "Seeds",
  "inv.crops": "Harvest",
  "inv.none": "Nothing here yet.",
  "inv.use": "Select",
  "inv.tip": "The selected seed is planted when you act on an empty plot.",

  // Wallet
  "wal.title": "Wallet",
  "wal.ppInfo": "Used at the Game Market and to buy land",
  "wal.coinInfo": "Used at the Players' Bazaar",
  "wal.exchange": "Exchange coins",
  "wal.rate": "100 bronze = 1 silver · 100 silver = 1 gold",

  // Game market
  "gm.info": "Ripe in {time}s · yields {n}",
  "gm.each": "each",
  "gm.balance": "Your balance:",
  "gm.buy": "Buy seeds",
  "gm.sell": "Sell harvest",
  "gm.nothing": "You have no harvested crops to sell.",

  // Player market
  "pm.tab.browse": "Browse",
  "pm.tab.sell": "Sell",
  "pm.tab.mine": "My listings",
  "pm.seller": "Seller",
  "pm.filterAll": "All items",
  "pm.empty": "No listings right now.",
  "pm.sold": "Sold — coins are collected automatically",
  "pm.noneMine": "You have no listings.",
  "pm.item": "Item",
  "pm.qty": "Quantity",
  "pm.price": "Total price",
  "pm.currency": "Coin",
  "pm.create": "List for sale",
  "pm.escrow": "Listed items leave your inventory until sold or cancelled.",
  "pm.noItems": "You have nothing to sell.",

  // Land
  "land.title": "Land {id}",
  "land.forSale": "This plot is for sale!",
  "land.perks": "Only you can plant here and nobody else can enter.",
  "land.yours": "This land is yours.",
  "land.yoursInfo": "Plant and harvest freely inside your fence.",
  "land.ownedBy": "Owned by {name}.",
  "land.closed": "The gate is closed to visitors.",

  // Messages
  "msg.error": "Something went wrong. Try again.",
  "msg.loadError": "Could not load your game: {msg}",
  "msg.tileTaken": "Somebody planted there first.",
  "msg.notYourLand": "This land belongs to someone else.",
  "msg.growing": "{crop} by {name}: ready in {time}",
  "msg.belongsTo": "This {crop} belongs to {name}. No vandalism on public land!",
  "msg.noSeeds": "No {crop} seeds. Buy some at the Game Market!",
  "msg.limitPublic": "You can have at most {n} crops on the public farm.",
  "msg.planted": "Planted {crop}",
  "msg.harvested": "Harvested {n}× {crop} {icon}",
  "msg.cleared": "Withered crop cleared",
  "msg.notEnough": "Not enough funds or items.",
  "msg.boughtSeeds": "Bought {n}× {crop} seeds",
  "msg.soldCrops": "Sold {n}× {crop} for {gain} Pool Points",
  "msg.exchanged": "Coins exchanged",
  "msg.landTaken": "Somebody already bought this land.",
  "msg.maxLands": "You can own at most {n} lands.",
  "msg.landBought": "You now own land {id}!",
  "msg.badPrice": "Enter a valid price.",
  "msg.listed": "Listed on the bazaar",
  "msg.canceled": "Listing cancelled",
  "msg.listingGone": "This listing is no longer available.",
  "msg.bought": "Purchase complete!",
  "msg.saleReceived": "Sold! You received {amount} {cur} from {name}"
};
