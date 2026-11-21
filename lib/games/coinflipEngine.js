import crypto from 'crypto';

export const COIN_SIDES = ['HEADS', 'TAILS'];

export const COINFLIP_CONFIG = {
  minBet: 10,
  maxBet: 50000,
  baseMultiplier: 1.96, // 98.0% RTP per flip
  houseEdge: '2.0%',
  maxStreak: 15,
};

/**
 * Returns streak multiplier: 1.96^streak
 * @param {number} streak
 * @returns {number} multiplier
 */
export function getCoinflipMultiplier(streak) {
  if (streak <= 0) return 1.00;
  const mult = Math.pow(COINFLIP_CONFIG.baseMultiplier, streak);
  return parseFloat(mult.toFixed(2));
}

/**
 * Resolves a Provably Fair coin flip deterministically using HMAC-SHA256.
 *
 * @param {string} serverSeed
 * @param {string} clientSeed
 * @param {number} nonce
 * @param {number} streakIndex (1, 2, 3...)
 * @returns {'HEADS'|'TAILS'}
 */
export function resolveCoinflip(serverSeed, clientSeed, nonce, streakIndex = 1) {
  const hash = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:coinflip-${streakIndex}`)
    .digest('hex');

  // Convert first 8 hex characters (32-bit uint) to binary 50/50
  const randInt = parseInt(hash.slice(0, 8), 16);
  return randInt % 2 === 0 ? 'HEADS' : 'TAILS';
}

/**
 * Generates a Provably Fair keypair for Coinflip.
 */
export function generateCoinflipKeyPair() {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  const clientSeed = crypto.randomBytes(16).toString('hex');
  return { serverSeed, serverSeedHash, clientSeed };
}
