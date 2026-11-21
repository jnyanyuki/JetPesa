import crypto from 'crypto';
import { sql } from '../db';

export const PENALTY_SPOTS = ['TL', 'TR', 'MID', 'BL', 'BR'];

export const SPOT_LABELS = {
  TL: 'Top Left Corner',
  TR: 'Top Right Corner',
  MID: 'Center / Panenka',
  BL: 'Bottom Left Post',
  BR: 'Bottom Right Post',
};

// Platform-favourable default settings:
// 8 steps (increased from 5) with lower, safer multiplier increments
export const DEFAULT_PENALTY_SETTINGS = {
  maxShots: 8,
  multipliers: [1.25, 1.60, 2.10, 2.80, 3.80, 5.20, 7.50, 11.00],
  goalProbability: 0.75, // 75% conversion probability gives healthy platform edge
  minBet: 10,
  maxBet: 40000,
  description: '8-step platform-favourable progression with controlled house margin.',
};

export const PRESET_CONFIGURATIONS = {
  platform_favourable: {
    id: 'platform_favourable',
    name: 'Platform Favourable (Low Risk - 8 Steps)',
    maxShots: 8,
    multipliers: [1.25, 1.60, 2.10, 2.80, 3.80, 5.20, 7.50, 11.00],
    goalProbability: 0.75,
    tag: 'RECOMMENDED',
  },
  balanced_7step: {
    id: 'balanced_7step',
    name: 'Balanced Standard (7 Steps)',
    maxShots: 7,
    multipliers: [1.35, 1.85, 2.60, 3.75, 5.50, 8.20, 12.50],
    goalProbability: 0.76,
    tag: 'BALANCED',
  },
  conservative_10step: {
    id: 'conservative_10step',
    name: 'Extended Ladder (10 Steps)',
    maxShots: 10,
    multipliers: [1.18, 1.42, 1.75, 2.20, 2.85, 3.80, 5.20, 7.20, 10.50, 16.00],
    goalProbability: 0.75,
    tag: 'STEADY ACCUMULATION',
  },
  legacy_5step: {
    id: 'legacy_5step',
    name: 'Legacy 5-Step (High Volatility)',
    maxShots: 5,
    multipliers: [1.92, 3.84, 7.68, 15.36, 30.72],
    goalProbability: 0.80,
    tag: 'HIGH VOLATILITY',
  },
};

let cachedSettings = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 4000;

/**
 * Loads penalty settings dynamically from DB (public.system_settings) or memory cache.
 */
export async function getPenaltySettings(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedSettings && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedSettings;
  }

  try {
    await sql.query(`
      CREATE TABLE IF NOT EXISTS public.system_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const rows = await sql.query(`
      SELECT value FROM public.system_settings WHERE key = 'penalty_game_settings' LIMIT 1
    `);

    if (rows && rows.length > 0) {
      const val = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      if (val && Array.isArray(val.multipliers) && val.multipliers.length >= 3) {
        cachedSettings = {
          maxShots: val.multipliers.length,
          multipliers: val.multipliers.map((m) => Number(m)),
          goalProbability: Number(val.goalProbability) || DEFAULT_PENALTY_SETTINGS.goalProbability,
          minBet: Number(val.minBet) || DEFAULT_PENALTY_SETTINGS.minBet,
          maxBet: Number(val.maxBet) || DEFAULT_PENALTY_SETTINGS.maxBet,
          updatedAt: val.updatedAt || new Date().toISOString(),
        };
        lastCacheTime = now;
        return cachedSettings;
      }
    }

    // Initialize default settings in DB if missing
    await sql.query(`
      INSERT INTO public.system_settings (key, value, updated_at)
      VALUES ('penalty_game_settings', $1, NOW())
      ON CONFLICT (key) DO NOTHING
    `, [JSON.stringify(DEFAULT_PENALTY_SETTINGS)]);

    cachedSettings = { ...DEFAULT_PENALTY_SETTINGS };
    lastCacheTime = now;
    return cachedSettings;
  } catch (err) {
    console.warn('Could not read penalty settings from DB, falling back to defaults:', err.message);
    if (!cachedSettings) cachedSettings = { ...DEFAULT_PENALTY_SETTINGS };
    return cachedSettings;
  }
}

/**
 * Saves updated steps and multipliers to DB and refreshes cache.
 */
export async function savePenaltySettings(newSettings) {
  if (!newSettings || !Array.isArray(newSettings.multipliers) || newSettings.multipliers.length < 3) {
    throw new Error('Penalty series must have at least 3 steps.');
  }

  if (newSettings.multipliers.length > 15) {
    throw new Error('Maximum allowed streak steps is 15.');
  }

  const multipliers = newSettings.multipliers.map((m) => {
    const val = parseFloat(Number(m).toFixed(2));
    if (isNaN(val) || val <= 1.0) {
      throw new Error('Each multiplier step must be a number greater than 1.00x.');
    }
    return val;
  });

  for (let i = 1; i < multipliers.length; i++) {
    if (multipliers[i] <= multipliers[i - 1]) {
      throw new Error(
        `Step ${i + 1} (${multipliers[i]}x) must be strictly greater than step ${i} (${multipliers[i - 1]}x).`
      );
    }
  }

  const goalProbability = Math.max(0.5, Math.min(0.95, Number(newSettings.goalProbability || 0.75)));
  const minBet = Math.max(1, Number(newSettings.minBet || 10));
  const maxBet = Math.max(minBet, Number(newSettings.maxBet || 40000));

  const payload = {
    maxShots: multipliers.length,
    multipliers,
    goalProbability,
    minBet,
    maxBet,
    updatedAt: new Date().toISOString(),
  };

  await sql.query(`
    INSERT INTO public.system_settings (key, value, updated_at)
    VALUES ('penalty_game_settings', $1, NOW())
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = NOW()
  `, [JSON.stringify(payload)]);

  cachedSettings = payload;
  lastCacheTime = Date.now();
  return payload;
}

/**
 * Returns the multiplier for a given goal streak index (1 to N).
 */
export function getPenaltyMultiplier(streak, multipliers = DEFAULT_PENALTY_SETTINGS.multipliers) {
  if (streak <= 0) return 1.00;
  if (!Array.isArray(multipliers) || multipliers.length === 0) return 1.00;
  if (streak > multipliers.length) return multipliers[multipliers.length - 1];
  return multipliers[streak - 1];
}

/**
 * Resolves a penalty kick deterministically using HMAC-SHA256 and active settings.
 */
export function resolvePenaltyKick(
  serverSeed,
  clientSeed,
  nonce,
  shotIndex,
  chosenSpot,
  settings = DEFAULT_PENALTY_SETTINGS
) {
  const hash = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:shot-${shotIndex}`)
    .digest('hex');

  const randInt = parseInt(hash.slice(0, 8), 16);
  const randFloat = randInt / 0xffffffff;

  const goalProb = settings.goalProbability || DEFAULT_PENALTY_SETTINGS.goalProbability;
  const isGoal = randFloat < goalProb;

  let keeperDive;
  if (isGoal) {
    const otherSpots = PENALTY_SPOTS.filter((s) => s !== chosenSpot);
    const diveChunk = parseInt(hash.slice(8, 12), 16);
    keeperDive = otherSpots[diveChunk % otherSpots.length];
  } else {
    keeperDive = chosenSpot;
  }

  const multiplier = isGoal ? getPenaltyMultiplier(shotIndex, settings.multipliers) : 0;

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
