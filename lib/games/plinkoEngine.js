import crypto from 'crypto';

export const PLINKO_ROWS = [8, 10, 12, 14, 16];
export const PLINKO_RISKS = ['low', 'medium', 'high'];

export const DEFAULT_PLINKO_CONFIG = {
  defaultRows: 12,
  defaultRisk: 'medium',
  minBet: 10,
  maxBet: 25000,
  rtp: '99.0%',
};

/**
 * Standard industry Plinko multipliers for (rows, risk).
 * Symmetrical binomial distributions guaranteeing ~99% theoretical RTP.
 */
export const PLINKO_MULTIPLIERS = {
  8: {
    low: [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
    medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
  },
  10: {
    low: [8.9, 3, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 3, 8.9],
    medium: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
    high: [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76],
  },
  12: {
    low: [10, 3, 1.6, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 1.6, 3, 10],
    medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
  },
  14: {
    low: [13, 4, 1.9, 1.4, 1.3, 1.1, 1.0, 0.5, 1.0, 1.1, 1.3, 1.4, 1.9, 4, 13],
    medium: [58, 15, 7, 4, 1.9, 1, 0.5, 0.2, 0.5, 1, 1.9, 4, 7, 15, 58],
    high: [420, 56, 18, 5, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5, 18, 56, 420],
  },
  16: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};

/**
 * Returns the multiplier table for a given configuration.
 */
export function getPlinkoMultipliers(rows = 12, risk = 'medium') {
  const rowConfig = PLINKO_MULTIPLIERS[rows] || PLINKO_MULTIPLIERS[12];
  return rowConfig[risk] || rowConfig.medium;
}

/**
 * Generates a Provably Fair ball drop path through the pegs.
 * 0 = Bounce Left, 1 = Bounce Right.
 * The landing bin index is simply sum(path), between 0 and rows.
 *
 * @param {string} serverSeed
 * @param {string} clientSeed
 * @param {number} nonce
 * @param {number} rows (8, 10, 12, 14, 16)
 * @param {string} risk ('low', 'medium', 'high')
 * @returns {{ path: number[], binIndex: number, multiplier: number }}
 */
export function generatePlinkoPath(serverSeed, clientSeed, nonce, rows = 12, risk = 'medium') {
  const hash = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:plinko-${rows}-${risk}`)
    .digest('hex');

  const path = [];
  let binIndex = 0;

  for (let i = 0; i < rows; i++) {
    // Each row uses a 4-hex-character chunk (16-bit integer)
    const chunk = hash.slice(i * 4, i * 4 + 4) || hash.slice(0, 4);
    const val = parseInt(chunk, 16);
    // Fair 50/50 deflection: 0 = Left, 1 = Right
    const bounce = val % 2;
    path.push(bounce);
    binIndex += bounce;
  }

  const table = getPlinkoMultipliers(rows, risk);
  const multiplier = table[binIndex] !== undefined ? table[binIndex] : table[Math.floor(table.length / 2)];

  return {
    path,
    binIndex,
    multiplier,
  };
}

/**
 * Generates a Provably Fair keypair for Plinko.
 */
export function generatePlinkoKeyPair() {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  const clientSeed = crypto.randomBytes(16).toString('hex');
  return { serverSeed, serverSeedHash, clientSeed };
}
