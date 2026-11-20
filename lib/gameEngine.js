import crypto from 'crypto';

export const CYCLE_INTERVAL_MS = 21000;
export const COUNTDOWN_INTERVAL_MS = 5000;
export const SIMULATION_WINDOW_MS = 14000;
export const HOUSE_EDGE = 0.03;

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hmacSha256(secret, message) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

export function calculateMultiplierAtSeconds(activeSeconds) {
  if (activeSeconds <= 0) return 1.0;
  // Natural accelerating Aviator growth curve reaching up to 100x within 14s
  const mult = Math.exp(0.06 * activeSeconds + 0.019 * Math.pow(activeSeconds, 2));
  return parseFloat(mult.toFixed(2));
}

export function calculateCrashPointFromHash(hash) {
  const hex52 = hash.slice(0, 13);
  const h = BigInt(`0x${hex52}`);
  const e = 2n ** 52n;

  // 3% instant crash house edge
  if (h % 33n === 0n) {
    return 1.0;
  }

  const numerator = 100n * e - h;
  const denominator = e - h;
  const result = Number(numerator / denominator) / 100;

  // Cap crash point at 100.00x so it naturally fits the 14-second flight simulation window
  const rounded = Math.floor(result * 100) / 100;
  return Math.min(100.0, Math.max(1.0, rounded));
}

export function getRoundDetails(cycleIndex) {
  const serverSeed = process.env.GAME_SERVER_SEED || 'default_secure_jetpesa_server_seed_2026';
  const clientSeed = process.env.GAME_CLIENT_SEED || 'jetpesa_client_seed_prod_anchor';
  const roundInput = `${clientSeed}:${cycleIndex}`;
  const roundHash = hmacSha256(serverSeed, roundInput);
  const serverSeedHash = sha256(serverSeed);
  const crashPoint = calculateCrashPointFromHash(roundHash);

  return {
    cycleIndex,
    serverSeed,
    serverSeedHash,
    clientSeed,
    roundInput,
    roundHash,
    crashPoint,
  };
}

export function getCycleState(epochMs = Date.now()) {
  const cycleIndex = Math.floor(epochMs / CYCLE_INTERVAL_MS);
  const offsetMs = epochMs % CYCLE_INTERVAL_MS;

  const isBettingPhase = offsetMs < COUNTDOWN_INTERVAL_MS;
  const activeSeconds = isBettingPhase ? 0 : (offsetMs - COUNTDOWN_INTERVAL_MS) / 1000;
  const round = getRoundDetails(cycleIndex);

  const rawMultiplier = isBettingPhase ? 1.0 : calculateMultiplierAtSeconds(activeSeconds);
  const hasCrashed = !isBettingPhase && (rawMultiplier >= round.crashPoint || offsetMs >= COUNTDOWN_INTERVAL_MS + SIMULATION_WINDOW_MS);
  const currentMultiplier = hasCrashed ? round.crashPoint : rawMultiplier;

  return {
    cycleIndex,
    offsetMs,
    isBettingPhase,
    activeSeconds,
    currentMultiplier,
    hasCrashed,
    crashPoint: round.crashPoint,
    serverSeedHash: round.serverSeedHash,
    clientSeed: round.clientSeed,
  };
}
