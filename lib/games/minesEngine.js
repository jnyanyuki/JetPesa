import crypto from 'crypto';

export const TOTAL_TILES = 25;
export const MIN_MINES = 1;
export const MAX_MINES = 24;
export const HOUSE_RTP = 0.975; // 97.5% RTP (2.5% House Edge)

/**
 * Calculates the exact multiplier for a given number of revealed safe gems.
 * @param {number} minesCount - Total mines placed (1-24)
 * @param {number} revealedGemsCount - Gems uncovered so far (1 to 25 - minesCount)
 * @returns {number} The multiplier rounded down to 2 decimal places.
 */
export function calculateMinesMultiplier(minesCount, revealedGemsCount) {
  if (revealedGemsCount <= 0) return 1.00;
  const safeCount = TOTAL_TILES - minesCount;
  if (revealedGemsCount > safeCount) return 0;

  // Probability of picking `revealedGemsCount` consecutive safe tiles
  let prob = 1.0;
  for (let i = 0; i < revealedGemsCount; i++) {
    prob *= (safeCount - i) / (TOTAL_TILES - i);
  }

  if (prob <= 0) return 0;
  const rawMult = (HOUSE_RTP / prob);
  return Math.max(1.01, Math.floor(rawMult * 100) / 100);
}

/**
 * Generates the multiplier ladder sequence for the given mine count.
 * @param {number} minesCount - Total mines placed
 * @returns {Array<{ step: number, multiplier: number }>}
 */
export function getMinesMultiplierLadder(minesCount) {
  const safeTiles = TOTAL_TILES - minesCount;
  const ladder = [];
  for (let step = 1; step <= safeTiles; step++) {
    ladder.push({
      step,
      multiplier: calculateMinesMultiplier(minesCount, step),
    });
  }
  return ladder;
}

/**
 * Deterministically generates `minesCount` distinct mine positions (0 to 24)
 * using HMAC-SHA256 from server seed, client seed, and nonce.
 * @param {string} serverSeed
 * @param {string} clientSeed
 * @param {number} nonce
 * @param {number} minesCount
 * @returns {number[]} Array of mine tile indices (sorted ascending)
 */
export function generateMinePositions(serverSeed, clientSeed, nonce, minesCount) {
  const hash = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest('hex');

  // Array of all 25 tile indices
  const tiles = Array.from({ length: TOTAL_TILES }, (_, i) => i);

  // Fisher-Yates shuffle driven by hash chunks
  let hashIndex = 0;
  for (let i = TOTAL_TILES - 1; i > 0; i--) {
    if (hashIndex + 4 > hash.length) {
      // Re-hash to extend pseudo-random byte stream if needed
      hashIndex = 0;
    }
    const chunk = parseInt(hash.slice(hashIndex, hashIndex + 4), 16);
    hashIndex += 4;
    const j = chunk % (i + 1);
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  // The first `minesCount` tiles after shuffle are the mine positions
  const minePositions = tiles.slice(0, minesCount).sort((a, b) => a - b);
  return minePositions;
}

/**
 * Creates a new Provably Fair keypair for a round.
 */
export function generateProvablyKeyPair() {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  const clientSeed = crypto.randomBytes(16).toString('hex');
  return { serverSeed, serverSeedHash, clientSeed };
}
