import crypto from 'crypto';

export const CYCLE_INTERVAL_MS = 24000;
export const COUNTDOWN_INTERVAL_MS = 5000;
export const SIMULATION_WINDOW_MS = 19000;
export const HOUSE_EDGE = 0.03;

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hmacSha256(secret, message) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

export function calculateMultiplierAtSeconds(activeSeconds) {
  if (activeSeconds <= 0) return 1.0;
  // Uniform slowed progression for initial/mid range (standard industry Aviator curve),
  // with smoothly accelerated rate for very high flight ranges (10x+):
  const mult = Math.exp(0.045 * activeSeconds + 0.004 * Math.pow(activeSeconds, 2) + 0.00045 * Math.pow(activeSeconds, 3));
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

// In-memory store for admin overrides (can also be populated from DB)
const memoryOverrides = new Map();

export function setMemoryOverride(cycleIndex, crashPoint) {
  memoryOverrides.set(String(cycleIndex), Number(crashPoint));
}

export function removeMemoryOverride(cycleIndex) {
  memoryOverrides.delete(String(cycleIndex));
}

export function getMemoryOverrides() {
  return Object.fromEntries(memoryOverrides);
}

export function getRoundDetails(cycleIndex) {
  const serverSeed = process.env.GAME_SERVER_SEED || 'default_secure_jetpesa_server_seed_2026';
  const clientSeed = process.env.GAME_CLIENT_SEED || 'jetpesa_client_seed_prod_anchor';
  const roundInput = `${clientSeed}:${cycleIndex}`;
  const roundHash = hmacSha256(serverSeed, roundInput);
  const serverSeedHash = sha256(serverSeed);
  const naturalCrashPoint = calculateCrashPointFromHash(roundHash);

  const overridden = memoryOverrides.get(String(cycleIndex));
  const isOverridden = overridden !== undefined && overridden !== null;
  const crashPoint = isOverridden ? Number(overridden) : naturalCrashPoint;

  return {
    cycleIndex,
    serverSeed,
    serverSeedHash,
    clientSeed,
    roundInput,
    roundHash,
    crashPoint,
    naturalCrashPoint,
    isOverridden,
  };
}

export function getPastRounds(count = 5) {
  const currentState = getCycleState();
  const currentIdx = currentState.cycleIndex;
  const now = Date.now();
  const past = [];
  for (let i = 1; i <= count; i++) {
    const idx = currentIdx - i;
    const details = getRoundDetails(idx);
    let category = 'LOW';
    if (details.crashPoint === 1.0) category = 'INSTANT';
    else if (details.crashPoint >= 10.0) category = 'MEGA';
    else if (details.crashPoint >= 2.0) category = 'HIGH';

    const roundStartEpoch = idx * CYCLE_INTERVAL_MS;
    const completedAgoSeconds = Math.max(1, Math.round((now - (roundStartEpoch + COUNTDOWN_INTERVAL_MS)) / 1000));

    past.push({
      ...details,
      isCurrent: false,
      completedAgoSeconds,
      category,
    });
  }
  return past;
}

export function getUpcomingRounds(count = 6, startNonce = null, pastCount = 5) {
  const currentState = getCycleState();
  const currentIdx = currentState.cycleIndex;
  const start = startNonce !== null ? Number(startNonce) : currentIdx;
  const now = Date.now();

  const rounds = [];
  for (let i = 0; i < count; i++) {
    const idx = start + i;
    const details = getRoundDetails(idx);
    
    // Calculate timing relative to current wall-clock
    const roundStartEpoch = idx * CYCLE_INTERVAL_MS;
    const flightDepartureEpoch = roundStartEpoch + COUNTDOWN_INTERVAL_MS;
    const msUntilDeparture = flightDepartureEpoch - now;
    const secondsUntilDeparture = Math.max(0, Math.round(msUntilDeparture / 1000));

    let category = 'LOW';
    if (details.crashPoint === 1.0) category = 'INSTANT';
    else if (details.crashPoint >= 10.0) category = 'MEGA';
    else if (details.crashPoint >= 2.0) category = 'HIGH';

    rounds.push({
      ...details,
      isCurrent: idx === currentIdx,
      departureEpoch: flightDepartureEpoch,
      secondsUntilDeparture,
      category,
    });
  }

  return {
    currentCycleIndex: currentIdx,
    currentState,
    rounds,
    pastRounds: getPastRounds(pastCount),
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
