import crypto from "crypto";

// 3 Sets of Slot Machines (10 total: 4 Set 1 + 4 Set 2 + 2 Set 3)
export const SLOT_MACHINES = [
  // Set 1 (4 machines): 1x3, 1 payline, 8x prize + 2 to 5 extra free spins
  { id: "slot_1", set: 1, rows: 1, cols: 3, lines: 1,  name: "Frutas Clássicas", color: "#e74c3c", symbols: ["🍒", "🍋", "🍇", "🍉"] },
  { id: "slot_2", set: 1, rows: 1, cols: 3, lines: 1,  name: "Ouro de Kwanza",   color: "#f1c40f", symbols: ["🥇", "💰", "👑", "🪙"] },
  { id: "slot_3", set: 1, rows: 1, cols: 3, lines: 1,  name: "Trevo Rápido",     color: "#1abc9c", symbols: ["🍀", "🎲", "🎯", "🃏"] },
  { id: "slot_4", set: 1, rows: 1, cols: 3, lines: 1,  name: "Chama Clássica",   color: "#d35400", symbols: ["🔥", "🌶️", "🧨", "💥"] },

  // Set 2 (4 machines): 3x3, 5 paylines, up to 3x per line + Bonus (3->5fs, 5->8fs, 6+->12fs)
  { id: "slot_5", set: 2, rows: 3, cols: 3, lines: 5,  name: "Selva 3×3",        color: "#2ecc71", symbols: ["🦁", "🐘", "🌴", "🦒"] },
  { id: "slot_6", set: 2, rows: 3, cols: 3, lines: 5,  name: "Estrela 3×3",      color: "#9b59b6", symbols: ["⭐", "🌟", "🌙", "☄️"] },
  { id: "slot_7", set: 2, rows: 3, cols: 3, lines: 5,  name: "Trovão 3×3",       color: "#e67e22", symbols: ["⚡", "🔔", "🏆", "🎖️"] },
  { id: "slot_8", set: 2, rows: 3, cols: 3, lines: 5,  name: "Colheita 3×3",     color: "#27ae60", symbols: ["🍍", "🍌", "🌽", "🥜"] },

  // Set 3 (2 VIP machines): 3x5, 20 paylines, 6 regular icons (lower match odds), up to 5x per line, Bonus (>=1 Wild guaranteed per FS) + Scatter (10 FS with 2x-5x Wilds)
  { id: "slot_9",  set: 3, rows: 3, cols: 5, lines: 20, name: "Diamante VIP 3×5", color: "#3498db", symbols: ["💎", "👑", "✨", "💍", "🔮", "🧿"] },
  { id: "slot_10", set: 3, rows: 3, cols: 5, lines: 20, name: "Dragão VIP 3×5",   color: "#c0392b", symbols: ["🐉", "🏮", "🪙", "🎴", "🥠", "🥢"] }
];

export const BONUS_SYM = "🎁";
export const WILD_SYM = "🌟";
export const SCATTER_SYM = "💠";
export const EXTRA_SPIN_SYM = "🎟️";

// 5 paylines on 3x3: each entry is [rowForCol0, rowForCol1, rowForCol2]
export const PAYLINES_5 = [
  [0, 0, 0],
  [1, 1, 1],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0]
];

// 20 paylines on 3x5: each entry is [r0, r1, r2, r3, r4]
export const PAYLINES_20 = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [1, 0, 1, 0, 1],
  [1, 2, 1, 2, 1],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 2, 0, 2, 0],
  [2, 0, 2, 0, 2],
  [0, 0, 2, 0, 0]
];

function randPick(arr) {
  return arr[crypto.randomInt(arr.length)];
}

function bonusSpinsFromCount(count) {
  if (count >= 6) return 12;
  if (count >= 5) return 8;
  if (count >= 3) return 5;
  return 0;
}

// Inject a chosen number of special symbols at distinct random positions
function placeSpecials(grid, sym, count) {
  const rows = grid.length;
  const cols = grid[0].length;
  const positions = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) positions.push([r, c]);
  }
  for (let i = positions.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  let placed = 0;
  for (const [r, c] of positions) {
    if (placed >= count) break;
    if (grid[r][c] === BONUS_SYM || grid[r][c] === SCATTER_SYM || grid[r][c] === WILD_SYM) continue;
    grid[r][c] = sym;
    placed++;
  }
}

function rollBonusCount(maxCells) {
  // Natural + boosted scatter chance so 3, 5, and 6+ bonus counts all occur visibly
  const r = crypto.randomInt(1000);
  if (r < 8) return Math.min(maxCells, 6 + crypto.randomInt(2)); // 6 or 7 bonus -> 12 FS
  if (r < 25) return 5;                                         // 5 bonus -> 8 FS
  if (r < 95) return 3 + crypto.randomInt(2);                     // 3 or 4 bonus -> 5 FS
  return crypto.randomInt(3);                                     // 0..2 bonus -> no bonus
}

function evaluateSet1(machine, bet) {
  const syms = machine.symbols;
  const winLine = crypto.randomInt(100) < 12; // ~12% line hit at 8x
  let row;
  if (winLine) {
    const s = randPick(syms);
    row = [s, s, s];
  } else {
    const s1 = randPick(syms);
    const s2 = randPick(syms);
    let s3 = randPick(syms);
    if (s1 === s2 && s2 === s3) {
      s3 = syms[(syms.indexOf(s1) + 1) % syms.length];
    }
    row = [s1, s2, s3];
  }

  let freeSpinsAdded = 0;
  // Chance to trigger 2 to 5 extra free spins (displayed with extra spin ticket symbol on non-winning spin or ticket overlay)
  if (!winLine && crypto.randomInt(100) < 14) {
    freeSpinsAdded = crypto.randomInt(2, 6); // 2, 3, 4, or 5 extra spins
    row[1] = EXTRA_SPIN_SYM;
    if (row[0] === row[2]) {
      row[2] = syms[(syms.indexOf(row[0]) + 1) % syms.length];
    }
  }

  const linePayout = winLine ? bet * 8 : 0;
  return {
    grid: [row],
    wildMults: null,
    winningLines: winLine ? [{ line: 0, multiplier: 8, payout: linePayout }] : [],
    payout: linePayout,
    win: linePayout > 0,
    freeSpinsAdded,
    bonusCount: 0,
    scatterCount: 0,
    freeSpinType: freeSpinsAdded > 0 ? "extra" : null
  };
}

function evaluateSet2(machine, bet) {
  const syms = machine.symbols;
  // Symbol multipliers per 3-of-a-kind line (up to 3x per line!)
  const mults = [1, 1.5, 2, 3];
  const grid = Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => randPick(syms))
  );

  // Place bonus scatters according to tiered probability
  const bCountTarget = rollBonusCount(9);
  if (bCountTarget > 0) placeSpecials(grid, BONUS_SYM, bCountTarget);

  let bonusCount = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (grid[r][c] === BONUS_SYM) bonusCount++;
    }
  }

  const winningLines = [];
  let totalPayout = 0;
  PAYLINES_5.forEach((line, idx) => {
    const a = grid[line[0]][0];
    const b = grid[line[1]][1];
    const c = grid[line[2]][2];
    const symIdx = syms.indexOf(a);
    if (symIdx >= 0 && a === b && b === c) {
      const mult = mults[symIdx];
      const payout = Math.round(bet * mult);
      totalPayout += payout;
      winningLines.push({ line: idx + 1, multiplier: mult, payout });
    }
  });

  const freeSpinsAdded = bonusSpinsFromCount(bonusCount);
  return {
    grid,
    wildMults: null,
    winningLines,
    payout: totalPayout,
    win: totalPayout > 0,
    freeSpinsAdded,
    bonusCount,
    scatterCount: 0,
    freeSpinType: freeSpinsAdded > 0 ? "bonus" : null
  };
}

function evaluateSet3(machine, bet, activeMode = null) {
  const syms = machine.symbols;
  // 6 regular symbol multipliers for 3 / 4 / 5 of a kind (up to 5x per line)
  const table = [
    { 3: 1.00, 4: 2.5, 5: 5.0 },
    { 3: 0.80, 4: 1.8, 5: 3.5 },
    { 3: 0.60, 4: 1.3, 5: 2.5 },
    { 3: 0.45, 4: 0.9, 5: 1.8 },
    { 3: 0.35, 4: 0.7, 5: 1.4 },
    { 3: 0.25, 4: 0.5, 5: 1.0 }
  ];

  const grid = Array.from({ length: 3 }, () =>
    Array.from({ length: 5 }, () => randPick(syms))
  );

  // Regular chance of Wilds (4% per cell on normal spin)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      if (crypto.randomInt(100) < 4) grid[r][c] = WILD_SYM;
    }
  }

  // In Bonus Free Spin mode: guarantee at least 1 Wild on the grid every spin
  if (activeMode === "bonus") {
    let hasWild = false;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) if (grid[r][c] === WILD_SYM) hasWild = true;
    }
    if (!hasWild) {
      const wr = crypto.randomInt(3);
      const wc = crypto.randomInt(1, 4); // Place prominently in middle columns
      grid[wr][wc] = WILD_SYM;
    }
  }

  // VIP Set 3 Bonus & Scatter trigger chance: ~1 in 100 each (1% Scatter, 1% Bonus)
  if (!activeMode) {
    const rollSpecial = crypto.randomInt(1000);
    if (rollSpecial < 10) {
      // ~1 in 100: Scatter trigger (3+ scatters -> 10 free spins with 2x-5x wild multipliers)
      placeSpecials(grid, SCATTER_SYM, 3 + (crypto.randomInt(5) === 0 ? 1 : 0));
    } else if (rollSpecial < 20) {
      // ~1 in 100: Bonus trigger (3/5/6+ -> 5/8/12 free spins with guaranteed >=1 Wild/spin)
      const tier = crypto.randomInt(100);
      const bTarget = tier < 8 ? 6 : tier < 26 ? 5 : 3 + crypto.randomInt(2);
      placeSpecials(grid, BONUS_SYM, bTarget);
    } else {
      // Decorative teaser specials (<3, never triggers) so reels show occasional Bonus/Scatter symbols
      if (crypto.randomInt(100) < 12) placeSpecials(grid, BONUS_SYM, 1 + crypto.randomInt(2));
      if (crypto.randomInt(100) < 10) placeSpecials(grid, SCATTER_SYM, 1 + crypto.randomInt(2));
    }
  }

  // Assign Wild multipliers (2x..5x during Scatter Free Spins, 1x otherwise)
  const wildMults = Array.from({ length: 3 }, () => Array(5).fill(1));
  let bonusCount = 0;
  let scatterCount = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      if (grid[r][c] === WILD_SYM && activeMode === "scatter") {
        wildMults[r][c] = crypto.randomInt(2, 6); // x2, x3, x4, or x5
      } else if (grid[r][c] === BONUS_SYM) {
        bonusCount++;
      } else if (grid[r][c] === SCATTER_SYM) {
        scatterCount++;
      }
    }
  }

  // Evaluate all 20 paylines left-to-right (Wild substitutes for regular symbols)
  const winningLines = [];
  let totalPayout = 0;

  PAYLINES_20.forEach((line, idx) => {
    const lineSyms = line.map((r, c) => grid[r][c]);
    const lineMults = line.map((r, c) => wildMults[r][c]);

    // Find first regular symbol from left
    let targetSym = null;
    for (const s of lineSyms) {
      if (syms.includes(s)) { targetSym = s; break; }
      if (s !== WILD_SYM) break;
    }
    if (!targetSym) {
      // All wilds from left
      if (lineSyms[0] === WILD_SYM) targetSym = syms[syms.length - 1];
      else return;
    }

    let matchLen = 0;
    let wildMaxMult = 1;
    let usedWild = false;
    for (let c = 0; c < 5; c++) {
      const s = lineSyms[c];
      if (s === targetSym || s === WILD_SYM) {
        matchLen++;
        if (s === WILD_SYM) {
          usedWild = true;
          wildMaxMult = Math.max(wildMaxMult, lineMults[c]);
        }
      } else {
        break;
      }
    }

    if (matchLen >= 3) {
      const symIdx = syms.indexOf(targetSym);
      const baseMult = table[symIdx][matchLen];
      const finalMult = usedWild ? baseMult * wildMaxMult : baseMult;
      const payout = Math.round(bet * finalMult);
      if (payout > 0) {
        totalPayout += payout;
        winningLines.push({
          line: idx + 1,
          matchLen,
          wildMult: usedWild && wildMaxMult > 1 ? wildMaxMult : 1,
          multiplier: finalMult,
          payout
        });
      }
    }
  });

  let freeSpinsAdded = 0;
  let freeSpinType = null;
  if (scatterCount >= 3) {
    freeSpinsAdded = 10;
    freeSpinType = "scatter";
  } else {
    const bs = bonusSpinsFromCount(bonusCount);
    if (bs > 0) {
      freeSpinsAdded = bs;
      freeSpinType = "bonus";
    }
  }

  return {
    grid,
    wildMults,
    winningLines,
    payout: totalPayout,
    win: totalPayout > 0,
    freeSpinsAdded,
    bonusCount,
    scatterCount,
    freeSpinType
  };
}

export function evaluateSlotSpin(machine, bet, activeMode = null) {
  if (machine.set === 1) return evaluateSet1(machine, bet);
  if (machine.set === 2) return evaluateSet2(machine, bet);
  return evaluateSet3(machine, bet, activeMode);
}
