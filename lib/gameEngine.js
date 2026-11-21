import crypto from 'crypto';

export const COUNTDOWN_DURATION_MS = 5000;
export const POST_CRASH_PAUSE_MS = 3000;
export const HOUSE_EDGE = 0.03;

// Retained for backward-compatibility with any legacy imports
export const COUNTDOWN_INTERVAL_MS = 5000;
export const CYCLE_INTERVAL_MS = 24000;
export const SIMULATION_WINDOW_MS = 19000;

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hmacSha256(secret, message) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

/**
 * Natural, smooth, continuous multiplier progression curve across all multiplier ranges.
 * Based on exponential growth: M(t) = exp(0.060*t + 0.0006*t^2)
 * Eliminates artificial time ceilings and sudden exponential knees.
 */
export function calculateMultiplierAtSeconds(activeSeconds) {
  if (activeSeconds <= 0) return 1.0;
  const exponent = 0.060 * activeSeconds + 0.0006 * Math.pow(activeSeconds, 2);
  const mult = Math.exp(exponent);
  return parseFloat(mult.toFixed(2));
}

/**
 * Closed-form inverse function: computes the exact flight duration in seconds
 * required to reach any target crash point multiplier.
 * Derived by solving: 0.0006*t^2 + 0.060*t - ln(crashPoint) = 0
 */
export function getFlightDurationSeconds(crashPoint) {
  if (crashPoint <= 1.0) return 0.0;
  const lnM = Math.log(crashPoint);
  const a = 0.0006;
  const b = 0.060;
  const discriminant = b * b + 4 * a * lnM;
  return Math.max(0, (-b + Math.sqrt(discriminant)) / (2 * a));
}

export function getRoundDurationMs(crashPoint) {
  const flightMs = Math.round(getFlightDurationSeconds(crashPoint) * 1000);
  return COUNTDOWN_DURATION_MS + flightMs + POST_CRASH_PAUSE_MS;
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

  // Allow natural high flights up to 10,000.00x without artificial ceiling
  const rounded = Math.floor(result * 100) / 100;
  return Math.min(10000.0, Math.max(1.0, rounded));
}

// In-memory store for admin overrides
const memoryOverrides = new Map();
// In-memory store for per-round house profit targets (roundId -> targetProfitKes)
const roundProfitTargets = new Map();
// Cache for dynamic round timelines
const roundTimingCache = new Map();

// Deterministic anchor anchor point (epoch anchor around round 74799300)
let anchorRoundIndex = 74799300;
let anchorStartEpoch = 1795183200000;

export function invalidateTimingFrom(cycleIndex) {
  const target = Number(cycleIndex);
  for (const k of roundTimingCache.keys()) {
    if (k >= target) roundTimingCache.delete(k);
  }
}

export function setMemoryOverride(cycleIndex, crashPoint) {
  memoryOverrides.set(String(cycleIndex), Number(crashPoint));
  invalidateTimingFrom(Number(cycleIndex));
}

export function removeMemoryOverride(cycleIndex) {
  memoryOverrides.delete(String(cycleIndex));
  invalidateTimingFrom(Number(cycleIndex));
}

export function setRoundProfitTarget(cycleIndex, targetPercent) {
  if (targetPercent === null || targetPercent === undefined || targetPercent === '') {
    roundProfitTargets.delete(String(cycleIndex));
  } else {
    // Percentage profit target between 1% and 100% of total bets
    const pct = Math.min(100, Math.max(1, parseFloat(Number(targetPercent).toFixed(1))));
    roundProfitTargets.set(String(cycleIndex), pct);
  }
}

export function getRoundProfitTarget(cycleIndex) {
  const val = roundProfitTargets.get(String(cycleIndex));
  return val !== undefined && val !== null ? Number(val) : null;
}

export function clearRoundProfitTarget(cycleIndex) {
  roundProfitTargets.delete(String(cycleIndex));
}

export function getAllRoundProfitTargets() {
  return Object.fromEntries(roundProfitTargets);
}

/**
 * Calculates the safe multiplier cap that guarantees the house percentage profit target for the round.
 * Target is defined as a percentage (e.g. 50% = house retains >= 50% of total wagers).
 * Evaluates real wagers, money already won, active bets and auto-cashout limits.
 */
export function computeProfitTargetCrashCap(totalWagered, totalWon, activeBets = [], targetProfitPercent, naturalCrashPoint) {
  if (targetProfitPercent === null || targetProfitPercent === undefined || targetProfitPercent <= 0) {
    return {
      safeMultiplierCap: naturalCrashPoint,
      willOverride: false,
      reason: 'No profit target percentage configured for this round.',
      isSecured: false,
      currentHouseProfit: Number(totalWagered || 0) - Number(totalWon || 0),
      targetProfitPercent: null,
      targetProfitKes: 0,
    };
  }

  const pct = Math.min(100, Math.max(1, Number(targetProfitPercent)));
  const W = Number(totalWagered || 0);
  const P_won = Number(totalWon || 0);
  const currentHouseProfit = W - P_won;
  const activeList = Array.isArray(activeBets) ? activeBets : [];
  const activeStakes = activeList.reduce((sum, b) => sum + Number(b.stake || 0), 0);

  // Expected house profit in KES based on percentage of total bets
  const targetProfitKes = Math.round(((W * pct) / 100) * 100) / 100;

  // If no real money wagered yet
  if (W === 0) {
    return {
      safeMultiplierCap: naturalCrashPoint,
      willOverride: false,
      reason: `No real pilot bets placed yet. Target set to ${pct}% of total wagers.`,
      isSecured: false,
      currentHouseProfit: 0,
      targetProfitPercent: pct,
      targetProfitKes: 0,
    };
  }

  // If no active bets flying (all cashed out or crashed)
  if (activeStakes === 0) {
    const isSecured = currentHouseProfit >= targetProfitKes;
    return {
      safeMultiplierCap: naturalCrashPoint,
      willOverride: false,
      reason: isSecured
        ? `House target secured (+KES ${currentHouseProfit.toFixed(2)} >= ${pct}% [KES ${targetProfitKes.toFixed(2)}])`
        : `Round concluded with net KES ${currentHouseProfit.toFixed(2)} (Target: ${pct}% [KES ${targetProfitKes.toFixed(2)}])`,
      isSecured,
      currentHouseProfit,
      targetProfitPercent: pct,
      targetProfitKes,
    };
  }

  // Maximum allowed total payouts: W * (1 - pct/100)
  const maxAllowedPayout = Math.max(0, W - targetProfitKes);
  const remainingBudget = maxAllowedPayout - P_won;

  // If 100% profit target or budget is depleted/negative:
  // Must crash immediately at 1.00x to prevent active bets from winning any payout
  if (pct >= 100 || remainingBudget <= 0) {
    return {
      safeMultiplierCap: 1.00,
      willOverride: true,
      reason: `House target ${pct}% profit requires immediate crash at 1.00x (Total wagers: KES ${W.toFixed(2)}, budget: KES 0)`,
      isSecured: false,
      currentHouseProfit,
      targetProfitPercent: pct,
      targetProfitKes,
    };
  }

  // Binary search for exact multiplier where active bets payout <= remainingBudget
  let low = 1.00;
  let high = Math.max(1.00, naturalCrashPoint);
  let bestM = 1.00;

  for (let step = 0; step < 40; step++) {
    const mid = (low + high) / 2;
    let projPayout = 0;
    for (const b of activeList) {
      const s = Number(b.stake || 0);
      const ac = b.autoCashout ? Number(b.autoCashout) : mid;
      const effectiveMult = Math.min(mid, ac);
      projPayout += s * effectiveMult;
    }
    if (projPayout <= remainingBudget) {
      bestM = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  const safeCap = Math.max(1.00, Math.floor((bestM + 1e-7) * 100) / 100);

  if (safeCap < naturalCrashPoint) {
    return {
      safeMultiplierCap: safeCap,
      willOverride: true,
      reason: `Overriding round crash point to ${safeCap.toFixed(2)}x to lock in house profit >= ${pct}% (KES ${targetProfitKes.toFixed(2)})`,
      isSecured: false,
      currentHouseProfit,
      targetProfitPercent: pct,
      targetProfitKes,
    };
  }

  return {
    safeMultiplierCap: naturalCrashPoint,
    willOverride: false,
    reason: `Natural crash point (${naturalCrashPoint.toFixed(2)}x) guarantees house profit >= ${pct}% (KES ${targetProfitKes.toFixed(2)})`,
    isSecured: false,
    currentHouseProfit,
    targetProfitPercent: pct,
    targetProfitKes,
  };
}

export function triggerInstantCrash(cycleIndex, targetMultiplier, epochMs = Date.now()) {
  const target = Math.max(1.0, parseFloat(Number(targetMultiplier).toFixed(2)));
  const roundIdx = Number(cycleIndex);
  memoryOverrides.set(String(roundIdx), target);

  const existing = roundTimingCache.get(roundIdx);
  const startEpoch = existing ? existing.startEpoch : (epochMs - COUNTDOWN_DURATION_MS);
  const departureEpoch = Math.min(epochMs, startEpoch + COUNTDOWN_DURATION_MS);
  const crashEpoch = epochMs;
  const endEpoch = crashEpoch + POST_CRASH_PAUSE_MS;

  const updated = {
    roundIndex: roundIdx,
    cycleIndex: roundIdx,
    crashPoint: target,
    naturalCrashPoint: existing ? existing.naturalCrashPoint : target,
    isOverridden: true,
    serverSeedHash: existing?.serverSeedHash || '',
    clientSeed: existing?.clientSeed || '',
    startEpoch,
    departureEpoch,
    crashEpoch,
    endEpoch,
    flightDurationMs: Math.max(0, crashEpoch - departureEpoch),
    durationMs: endEpoch - startEpoch,
  };

  roundTimingCache.set(roundIdx, updated);
  invalidateTimingFrom(roundIdx + 1);
  return updated;
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

  const profitTarget = getRoundProfitTarget(cycleIndex);

  return {
    cycleIndex: Number(cycleIndex),
    serverSeed,
    serverSeedHash,
    clientSeed,
    roundInput,
    roundHash,
    crashPoint,
    naturalCrashPoint,
    isOverridden,
    profitTarget,
  };
}

export function getRoundTimeline(roundIndex) {
  const idx = Number(roundIndex);
  if (roundTimingCache.has(idx)) {
    return roundTimingCache.get(idx);
  }

  let refIdx = anchorRoundIndex;
  let refStart = anchorStartEpoch;
  let minDiff = Math.abs(idx - anchorRoundIndex);

  // Find the closest cached reference to compute from in minimal steps
  for (const [cIdx, cInfo] of roundTimingCache.entries()) {
    const diff = Math.abs(idx - cIdx);
    if (diff < minDiff) {
      minDiff = diff;
      refIdx = cIdx;
      refStart = cInfo.startEpoch;
    }
  }

  if (idx >= refIdx) {
    let currStart = refStart;
    for (let i = refIdx; i <= idx; i++) {
      const details = getRoundDetails(i);
      const flightDurationMs = Math.round(getFlightDurationSeconds(details.crashPoint) * 1000);
      const departureEpoch = currStart + COUNTDOWN_DURATION_MS;
      const crashEpoch = departureEpoch + flightDurationMs;
      const endEpoch = crashEpoch + POST_CRASH_PAUSE_MS;
      const durationMs = endEpoch - currStart;

      const info = {
        roundIndex: i,
        ...details,
        startEpoch: currStart,
        departureEpoch,
        crashEpoch,
        endEpoch,
        flightDurationMs,
        durationMs,
      };
      roundTimingCache.set(i, info);
      currStart = endEpoch;
    }
  } else {
    let currEnd = refStart;
    for (let i = refIdx - 1; i >= idx; i--) {
      const details = getRoundDetails(i);
      const flightDurationMs = Math.round(getFlightDurationSeconds(details.crashPoint) * 1000);
      const durationMs = COUNTDOWN_DURATION_MS + flightDurationMs + POST_CRASH_PAUSE_MS;
      const currStart = currEnd - durationMs;
      const departureEpoch = currStart + COUNTDOWN_DURATION_MS;
      const crashEpoch = departureEpoch + flightDurationMs;
      const endEpoch = currEnd;

      const info = {
        roundIndex: i,
        ...details,
        startEpoch: currStart,
        departureEpoch,
        crashEpoch,
        endEpoch,
        flightDurationMs,
        durationMs,
      };
      roundTimingCache.set(i, info);
      currEnd = currStart;
    }
  }

  // Prevent memory leaks: prune oldest entries if cache exceeds 1200
  if (roundTimingCache.size > 1200) {
    const keys = Array.from(roundTimingCache.keys());
    for (let k = 0; k < 200; k++) {
      roundTimingCache.delete(keys[k]);
    }
  }

  return roundTimingCache.get(idx);
}

export function getPastRounds(count = 5) {
  const currentState = getCycleState();
  const currentIdx = currentState.cycleIndex;
  const now = Date.now();
  const past = [];
  for (let i = 1; i <= count; i++) {
    const idx = currentIdx - i;
    const timeline = getRoundTimeline(idx);
    let category = 'LOW';
    if (timeline.crashPoint === 1.0) category = 'INSTANT';
    else if (timeline.crashPoint >= 10.0) category = 'MEGA';
    else if (timeline.crashPoint >= 2.0) category = 'HIGH';

    const completedAgoSeconds = Math.max(1, Math.round((now - timeline.endEpoch) / 1000));

    past.push({
      ...timeline,
      cycleIndex: idx,
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
    const timeline = getRoundTimeline(idx);
    
    // Calculate timing relative to current wall-clock
    const msUntilDeparture = timeline.departureEpoch - now;
    const secondsUntilDeparture = Math.max(0, Math.round(msUntilDeparture / 1000));

    let category = 'LOW';
    if (timeline.crashPoint === 1.0) category = 'INSTANT';
    else if (timeline.crashPoint >= 10.0) category = 'MEGA';
    else if (timeline.crashPoint >= 2.0) category = 'HIGH';

    rounds.push({
      ...timeline,
      cycleIndex: idx,
      isCurrent: idx === currentIdx,
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
  let roundIdx = anchorRoundIndex;
  let info = getRoundTimeline(roundIdx);

  // Walk forward or backward to current time
  while (epochMs >= info.endEpoch) {
    roundIdx++;
    info = getRoundTimeline(roundIdx);
  }
  while (epochMs < info.startEpoch) {
    roundIdx--;
    info = getRoundTimeline(roundIdx);
  }

  // Update dynamic anchor to keep search O(1)
  anchorRoundIndex = roundIdx;
  anchorStartEpoch = info.startEpoch;

  const isBettingPhase = epochMs < info.departureEpoch;
  const hasCrashed = epochMs >= info.crashEpoch;
  const activeSeconds = isBettingPhase
    ? 0
    : Math.max(0, (Math.min(epochMs, info.crashEpoch) - info.departureEpoch) / 1000);

  const currentMultiplier = hasCrashed
    ? info.crashPoint
    : isBettingPhase
    ? 1.0
    : calculateMultiplierAtSeconds(activeSeconds);

  return {
    cycleIndex: info.roundIndex,
    offsetMs: epochMs - info.startEpoch,
    isBettingPhase,
    hasCrashed,
    currentMultiplier,
    crashPoint: info.crashPoint,
    activeSeconds,
    startEpoch: info.startEpoch,
    departureEpoch: info.departureEpoch,
    crashEpoch: info.crashEpoch,
    endEpoch: info.endEpoch,
    flightDurationMs: info.flightDurationMs,
    durationMs: info.durationMs,
    remainingCountdownMs: isBettingPhase ? Math.max(0, info.departureEpoch - epochMs) : 0,
    serverSeedHash: info.serverSeedHash,
    clientSeed: info.clientSeed,
  };
}
