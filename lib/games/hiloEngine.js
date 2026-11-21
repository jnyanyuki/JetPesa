import crypto from 'crypto';

export const HILO_CONFIG = {
  minBet: 10,
  maxBet: 20000,
  rtp: 0.97, // 97.0% RTP (3.0% House Edge)
  maxSkips: 3,
  maxSteps: 30,
};

export const SUITS = [
  { name: 'hearts', symbol: '♥', color: 'red' },
  { name: 'diamonds', symbol: '♦', color: 'red' },
  { name: 'clubs', symbol: '♣', color: 'black' },
  { name: 'spades', symbol: '♠', color: 'black' },
];

export const RANK_NAMES = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

/**
 * Creates a normalized playing card object from an index (0 - 51).
 * @param {number} cardIndex 
 * @returns {object} Card specification
 */
export function createCardFromIndex(cardIndex) {
  const normIndex = Math.abs(cardIndex) % 52;
  const suitIndex = Math.floor(normIndex / 13);
  const rank = (normIndex % 13) + 2; // 2 to 14 (A)
  const suit = SUITS[suitIndex];

  return {
    index: normIndex,
    rank,
    rankDisplay: RANK_NAMES[rank] || String(rank),
    suit: suit.name,
    suitSymbol: suit.symbol,
    color: suit.color,
    display: `${RANK_NAMES[rank]}${suit.symbol}`,
  };
}

/**
 * Calculates current dynamic odds and multipliers based on face-up card rank.
 * @param {number} rank - Current card rank (2 to 14)
 * @returns {object} { high: { multiplier, chance }, low: { multiplier, chance }, same: { multiplier, chance } }
 */
export function calculateHiloOdds(rank) {
  const rtp = HILO_CONFIG.rtp;
  const clampedRank = Math.max(2, Math.min(14, rank));

  // High (Higher or Equal): ranks >= clampedRank
  const winningHighRanks = 14 - clampedRank + 1; // if 14 (A), 1; if 2, 13
  const probHigh = winningHighRanks / 13;
  const rawHighMult = rtp / probHigh;
  const highMultiplier = Math.max(1.02, parseFloat(rawHighMult.toFixed(2)));
  const highChance = Math.round(probHigh * 100);

  // Low (Lower or Equal): ranks <= clampedRank
  const winningLowRanks = clampedRank - 2 + 1; // if 2, 1; if 14 (A), 13
  const probLow = winningLowRanks / 13;
  const rawLowMult = rtp / probLow;
  const lowMultiplier = Math.max(1.02, parseFloat(rawLowMult.toFixed(2)));
  const lowChance = Math.round(probLow * 100);

  // Same (Equal): rank == clampedRank
  const probSame = 1 / 13;
  const sameMultiplier = parseFloat((rtp / probSame).toFixed(2)); // ~12.61x
  const sameChance = Math.round(probSame * 100); // 8%

  return {
    high: {
      multiplier: highMultiplier,
      chance: highChance,
      canBet: clampedRank < 14, // If A, higher is just Same
    },
    low: {
      multiplier: lowMultiplier,
      chance: lowChance,
      canBet: clampedRank > 2, // If 2, lower is just Same
    },
    same: {
      multiplier: sameMultiplier,
      chance: sameChance,
      canBet: true,
    },
  };
}

/**
 * Provably fair card generation via HMAC-SHA256.
 * @param {string} serverSeed 
 * @param {string} clientSeed 
 * @param {number} nonce 
 * @param {number|string} stepIdentifier 
 * @returns {object} Card object
 */
export function dealHiloCard(serverSeed, clientSeed, nonce, stepIdentifier = 0) {
  const hash = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:hilo-${stepIdentifier}`)
    .digest('hex');

  const cardUint = parseInt(hash.slice(0, 8), 16);
  return createCardFromIndex(cardUint % 52);
}

/**
 * Validates a player's guess against previous and newly dealt card.
 * @param {number} previousRank 
 * @param {number} nextRank 
 * @param {'HIGHER'|'LOWER'|'SAME'} choice 
 * @returns {{ isWin: boolean, stepMultiplier: number }}
 */
export function evaluateHiloGuess(previousRank, nextRank, choice) {
  const odds = calculateHiloOdds(previousRank);
  const normChoice = String(choice).toUpperCase();

  if (normChoice === 'HIGHER') {
    const isWin = nextRank >= previousRank;
    return {
      isWin,
      stepMultiplier: isWin ? odds.high.multiplier : 0,
      rule: 'HIGHER_OR_EQUAL',
    };
  }

  if (normChoice === 'LOWER') {
    const isWin = nextRank <= previousRank;
    return {
      isWin,
      stepMultiplier: isWin ? odds.low.multiplier : 0,
      rule: 'LOWER_OR_EQUAL',
    };
  }

  if (normChoice === 'SAME') {
    const isWin = nextRank === previousRank;
    return {
      isWin,
      stepMultiplier: isWin ? odds.same.multiplier : 0,
      rule: 'SAME_RANK',
    };
  }

  return { isWin: false, stepMultiplier: 0, rule: 'INVALID' };
}

/**
 * Generates a Provably Fair keypair for Hi-Lo.
 */
export function generateHiloKeyPair() {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  const clientSeed = crypto.randomBytes(16).toString('hex');
  return { serverSeed, serverSeedHash, clientSeed };
}
