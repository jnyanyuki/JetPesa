import crypto from 'crypto';

export const PENALTY_SPOTS = ['TL', 'TR', 'MID', 'BL', 'BR'];

export const SPOT_LABELS = {
  TL: 'Top Left Corner',
  TR: 'Top Right Corner',
  MID: 'Center / Middle',
  BL: 'Bottom Left Post',
  BR: 'Bottom Right Post',
};

export const PENALTY_MULTIPLIERS = [1.92, 3.84, 7.68, 15.36, 30.72];
export const MAX_SHOTS = 5;
export const GOAL_PROBABILITY = 0.80; // 80% chance of scoring per kick (96% RTP)

/**
 * Returns the multiplier for a given goal streak (1 to 5).
 */
export function getPenaltyMultiplier(streak) {
  if (streak <= 0) return 1.00;
  if (streak > MAX_SHOTS) return PENALTY_MULTIPLIERS[MAX_SHOTS - 1];
  return PENALTY_MULTIPLIERS[streak - 1];
}

/**
 * Resolves a penalty kick deterministically using HMAC-SHA256.
 * @param {string} serverSeed
 * @param {string} clientSeed
 * @param {number} nonce
 * @param {number} shotIndex - 1 to 5
 * @param {string} chosenSpot - 'TL' | 'TR' | 'MID' | 'BL' | 'BR'
 * @returns {{ isGoal: boolean, keeperDive: string, multiplier: number }}
 */
export function resolvePenaltyKick(serverSeed, clientSeed, nonce, shotIndex, chosenSpot) {
  const hash = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:shot-${shotIndex}`)
    .digest('hex');

  // Generate a random float [0, 1) from first 8 hex characters
  const randInt = parseInt(hash.slice(0, 8), 16);
  const randFloat = randInt / 0xffffffff;

  const isGoal = randFloat < GOAL_PROBABILITY;

  let keeperDive;
  if (isGoal) {
    // Goalkeeper dives to any spot OTHER than chosenSpot
    const otherSpots = PENALTY_SPOTS.filter((s) => s !== chosenSpot);
    const diveChunk = parseInt(hash.slice(8, 12), 16);
    keeperDive = otherSpots[diveChunk % otherSpots.length];
  } else {
    // Goalkeeper saves it at the chosenSpot
    keeperDive = chosenSpot;
  }

  const multiplier = isGoal ? getPenaltyMultiplier(shotIndex) : 0;

  return {
    isGoal,
    keeperDive,
    multiplier,
  };
}

/**
 * Generates a Provably Fair keypair for a penalty shootout series.
 */
export function generatePenaltyKeyPair() {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  const clientSeed = crypto.randomBytes(16).toString('hex');
  return { serverSeed, serverSeedHash, clientSeed };
}
