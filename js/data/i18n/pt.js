// Português. Mantém as mesmas chaves que en.js.
export default {
  "app.title": "Kwanza Live",
  "loading": "A carregar…",
  "lang.switch": "Mudar idioma",

  // Login
  "login.tag": "Um mundo agrícola multijogador. Planta, colhe, negoceia e constrói o teu terreno.",
  "login.google": "Entrar com Google",
  "login.how1": "🌱 Semeia na quinta pública",
  "login.how2": "🧺 Colhe e vende por Pontos de Pool ou moedas",
  "login.how3": "🏡 Compra o teu próprio terreno",
  "login.err.domain": "Este domínio ({host}) não está autorizado. Adiciona-o em Firebase › Authentication › Settings › Authorized domains.",
  "login.err.generic": "Falha ao entrar: {msg}",

  // Onboarding
  "ob.step1.title": "Escolhe o teu nome de utilizador",
  "ob.username.label": "Nome de utilizador",
  "ob.username.hint": "3–16 caracteres: letras, números e _",
  "ob.username.invalid": "Usa apenas 3–16 letras, números ou _.",
  "ob.username.checking": "A verificar…",
  "ob.username.ok": "Ótimo, este nome está livre!",
  "ob.username.taken": "Este nome de utilizador já existe.",
  "ob.username.error": "Não foi possível verificar o nome. Tenta de novo.",
  "ob.next": "Seguinte",
  "ob.back": "Voltar",
  "ob.step2.title": "Cria o teu personagem",
  "ob.skin": "Pele",
  "ob.hair": "Cor do cabelo",
  "ob.hairStyle": "Estilo de cabelo",
  "ob.shirt": "Camisola",
  "ob.create": "Começar a jogar",
  "ob.tapTurn": "Toca no personagem para o rodar",
  "hs.short": "Curto",
  "hs.afro": "Afro",
  "hs.long": "Comprido",
  "hs.cap": "Boné",

  // HUD
  "hud.inventory": "Inventário",
  "hud.wallet": "Carteira",
  "hud.logout": "Sair",
  "hud.seedSlot": "Sementes de {crop}",
  "hint.controls": "WASD / setas: andar · E: interagir · 1–6: escolher semente · clique: andar / usar",

  // Currencies
  "cur.pp": "Pontos de Pool",
  "cur.bronze": "Moedas de bronze",
  "cur.silver": "Moedas de prata",
  "cur.gold": "Moedas de ouro",

  // Crops & items
  "crop.corn": "Milho",
  "crop.beans": "Feijão",
  "crop.peanut": "Ginguba",
  "crop.cassava": "Mandioca",
  "crop.banana": "Banana",
  "crop.pineapple": "Ananás",
  "item.seedOf": "Sementes de {name}",

  // Places
  "place.gameMarket": "Mercado do Jogo",
  "place.bazaar": "Bazar dos Jogadores",
  "place.publicFarm": "Quinta Pública",

  // Actions
  "act.plant": "Semear",
  "act.harvest": "Colher",
  "act.inspect": "Ver",
  "act.clear": "Limpar",
  "act.open": "Entrar em {place}",
  "act.viewLand": "Terreno {id}",
  "act.buy": "Comprar",
  "act.sell": "Vender",
  "act.sellAll": "Vender tudo",
  "act.cancel": "Cancelar",

  // Inventory
  "inv.title": "Inventário",
  "inv.seeds": "Sementes",
  "inv.crops": "Colheita",
  "inv.none": "Ainda não tens nada aqui.",
  "inv.use": "Escolher",
  "inv.tip": "A semente escolhida é semeada quando atuas num lote vazio.",

  // Wallet
  "wal.title": "Carteira",
  "wal.ppInfo": "Usados no Mercado do Jogo e para comprar terrenos",
  "wal.coinInfo": "Usadas no Bazar dos Jogadores",
  "wal.exchange": "Trocar moedas",
  "wal.rate": "100 bronze = 1 prata · 100 prata = 1 ouro",

  // Game market
  "gm.info": "Pronto em {time}s · rende {n}",
  "gm.each": "cada",
  "gm.balance": "O teu saldo:",
  "gm.buy": "Comprar sementes",
  "gm.sell": "Vender colheita",
  "gm.nothing": "Não tens colheita para vender.",

  // Player market
  "pm.tab.browse": "Explorar",
  "pm.tab.sell": "Vender",
  "pm.tab.mine": "Os meus anúncios",
  "pm.seller": "Vendedor",
  "pm.filterAll": "Todos os itens",
  "pm.empty": "Sem anúncios de momento.",
  "pm.sold": "Vendido — as moedas são recebidas automaticamente",
  "pm.noneMine": "Não tens anúncios.",
  "pm.item": "Item",
  "pm.qty": "Quantidade",
  "pm.price": "Preço total",
  "pm.currency": "Moeda",
  "pm.create": "Anunciar",
  "pm.escrow": "Os itens anunciados saem do inventário até serem vendidos ou cancelados.",
  "pm.noItems": "Não tens nada para vender.",

  // Land
  "land.title": "Terreno {id}",
  "land.forSale": "Este terreno está à venda!",
  "land.perks": "Só tu podes semear aqui e mais ninguém pode entrar.",
  "land.yours": "Este terreno é teu.",
  "land.yoursInfo": "Semeia e colhe à vontade dentro da tua vedação.",
  "land.ownedBy": "Pertence a {name}.",
  "land.closed": "O portão está fechado a visitantes.",

  // Messages
  "msg.error": "Algo correu mal. Tenta de novo.",
  "msg.loadError": "Não foi possível carregar o jogo: {msg}",
  "msg.tileTaken": "Alguém semeou aí primeiro.",
  "msg.notYourLand": "Este terreno pertence a outra pessoa.",
  "msg.growing": "{crop} de {name}: pronto em {time}",
  "msg.belongsTo": "Este {crop} pertence a {name}. Nada de vandalismo no terreno público!",
  "msg.noSeeds": "Sem sementes de {crop}. Compra no Mercado do Jogo!",
  "msg.limitPublic": "Podes ter no máximo {n} plantações na quinta pública.",
  "msg.planted": "Semeaste {crop}",
  "msg.harvested": "Colheste {n}× {crop} {icon}",
  "msg.cleared": "Plantação seca removida",
  "msg.notEnough": "Saldo ou itens insuficientes.",
  "msg.boughtSeeds": "Compraste {n}× sementes de {crop}",
  "msg.soldCrops": "Vendeste {n}× {crop} por {gain} Pontos de Pool",
  "msg.exchanged": "Moedas trocadas",
  "msg.landTaken": "Alguém já comprou este terreno.",
  "msg.maxLands": "Podes ter no máximo {n} terrenos.",
  "msg.landBought": "Agora és dono do terreno {id}!",
  "msg.badPrice": "Indica um preço válido.",
  "msg.listed": "Anunciado no bazar",
  "msg.canceled": "Anúncio cancelado",
  "msg.listingGone": "Este anúncio já não está disponível.",
  "msg.bought": "Compra concluída!",
  "msg.saleReceived": "Vendido! Recebeste {amount} {cur} de {name}"
};
