import crypto from 'crypto';

export const DICE_CONFIG = {
  minBet: 10,
  maxBet: 100000,
  minTarget: 1.00,
  maxTarget: 98.00,
  houseEdge: 0.015, // 1.5% House Edge -> 98.5% theoretical RTP
  rtp: '98.5%',
};

/**
 * Calculates win chance percentage from mode and target number.
 * @param {'under'|'over'} mode
 * @param {number} target (1.00 - 98.00)
 * @returns {number} winChance (1.00 - 98.00)
 */
export function calculateWinChance(mode, target) {
  const t = Math.max(DICE_CONFIG.minTarget, Math.min(DICE_CONFIG.maxTarget, Number(target)));
  if (mode === 'over') {
    return parseFloat((100 - t).toFixed(2));
  }
  return parseFloat(t.toFixed(2));
}

/**
 * Calculates target number from mode and desired win chance percentage.
 * @param {'under'|'over'} mode
 * @param {number} winChance (1.00 - 98.00)
 * @returns {number} target
 */
export function calculateTargetFromWinChance(mode, winChance) {
  const wc = Math.max(DICE_CONFIG.minTarget, Math.min(DICE_CONFIG.maxTarget, Number(winChance)));
  if (mode === 'over') {
    return parseFloat((100 - wc).toFixed(2));
  }
  return parseFloat(wc.toFixed(2));
}

/**
 * Calculates payout multiplier for a given win chance.
 * Multiplier = (1 - HouseEdge) * 100 / WinChance
 * @param {number} winChancePercent
 * @param {number} [houseEdge=0.015]
 * @returns {number} multiplier
 */
export function calculateDiceMultiplier(winChancePercent, houseEdge = DICE_CONFIG.houseEdge) {
  const wc = Math.max(1.00, Math.min(98.00, Number(winChancePercent)));
  const mult = ((1 - houseEdge) * 100) / wc;
  return parseFloat(mult.toFixed(4));
}

/**
 * Resolves a Provably Fair dice roll deterministically using HMAC-SHA256.
 *
 * @param {string} serverSeed
 * @param {string} clientSeed
 * @param {number} nonce
 * @param {'under'|'over'} mode
 * @param {number} target
 * @returns {{ roll: number, won: boolean, mode: string, target: number, winChance: number, multiplier: number }}
 */
export function resolveDiceRoll(serverSeed, clientSeed, nonce, mode = 'under', target = 50.0) {
  const hash = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:dice-${mode}-${target}`)
    .digest('hex');

  // Convert first 8 hex characters (32-bit uint) to float [0.00, 100.00]
  const randInt = parseInt(hash.slice(0, 8), 16);
  const rawRoll = (randInt % 10001) / 100;
  const roll = parseFloat(rawRoll.toFixed(2));

  const validTarget = Math.max(DICE_CONFIG.minTarget, Math.min(DICE_CONFIG.maxTarget, Number(target)));
  const winChance = calculateWinChance(mode, validTarget);
  const multiplier = calculateDiceMultiplier(winChance);

  let won = false;
  if (mode === 'under') {
    won = roll < validTarget;
  } else {
    won = roll > validTarget;
  }

  return {
    roll,
    won,
    mode,
    target: validTarget,
    winChance,
    multiplier,
  };
}

/**
 * Generates a Provably Fair keypair for Dice.
 */
export function generateDiceKeyPair() {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  const clientSeed = crypto.randomBytes(16).toString('hex');
  return { serverSeed, serverSeedHash, clientSeed };
}
