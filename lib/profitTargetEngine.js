import { sql } from './db';
import {
  getCycleState,
  getRoundDetails,
  setMemoryOverride,
  removeMemoryOverride,
  triggerInstantCrash,
  setRoundProfitTarget,
  getRoundProfitTarget,
  clearRoundProfitTarget,
  setGlobalProfitTarget,
  getGlobalProfitTarget,
  getEffectiveRoundProfitTarget,
  computeProfitTargetCrashCap,
} from './gameEngine';

let dbSettingsLoaded = false;

/**
 * Loads system-wide global profit target settings from PostgreSQL.
 */
export async function loadGlobalProfitTargetFromDb() {
  try {
    const rows = await sql.query(`SELECT value FROM public.system_settings WHERE key = 'profit_target'`);
    if (rows.length > 0 && rows[0].value) {
      const val = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      setGlobalProfitTarget(Boolean(val.enabled), Number(val.percent || 50));
      dbSettingsLoaded = true;
      return getGlobalProfitTarget();
    }
  } catch (e) {
    console.warn('Could not load global profit target from DB:', e.message);
  }
  dbSettingsLoaded = true;
  return getGlobalProfitTarget();
}

/**
 * Admin action to configure system-wide global percentage profit target.
 * Affects all rounds all the time continuously.
 * 
 * @param {boolean} enabled - Whether system profit target is active
 * @param {number} percent - Target profit percentage (1 to 100)
 */
export async function setGlobalProfitTargetDb(enabled, percent) {
  const isEnabled = Boolean(enabled);
  const pct = Math.min(100, Math.max(1, parseFloat(Number(percent || 50).toFixed(1))));

  setGlobalProfitTarget(isEnabled, pct);

  try {
    await sql.query(`
      INSERT INTO public.system_settings (key, value, updated_at)
      VALUES ('profit_target', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
    `, [JSON.stringify({ enabled: isEnabled, percent: pct })]);
  } catch (e) {
    console.warn('Could not save system settings to DB:', e.message);
  }

  // Immediately evaluate the current active flight round
  const state = getCycleState();
  const evalResult = await evaluateAndEnforceProfitTarget(state.cycleIndex);

  return {
    success: true,
    enabled: isEnabled,
    percent: pct,
    message: isEnabled 
      ? `System profit target of ${pct}% engaged across all rounds continuously.`
      : `System profit target disabled. Flights will proceed with natural Provably Fair seed output.`,
    currentRoundEval: evalResult,
  };
}

/**
 * Evaluates real bets against the house percentage profit target for a round,
 * and automatically overrides the crash point or triggers an instant crash
 * to lock in house profits as a percentage of total real wagers.
 *
 * @param {string|number} roundId
 * @returns {Promise<Object>}
 */
export async function evaluateAndEnforceProfitTarget(roundId) {
  const rId = String(roundId);
  const cycleIdx = Number(roundId);

  if (!dbSettingsLoaded) {
    await loadGlobalProfitTargetFromDb();
  }

  // 1. Get effective percentage profit target (global or round-override)
  let targetProfitPercent = getEffectiveRoundProfitTarget(rId);

  // 2. Fetch all real bets for this round
  let totalStaked = 0;
  let totalWon = 0;
  let activeBets = [];

  try {
    const betRows = await sql.query(`
      SELECT id, user_id, stake, auto_cashout, multiplier, win_amount, status
      FROM public.bets
      WHERE round_id = $1
    `, [rId]);

    for (const b of betRows) {
      const stake = Number(b.stake || 0);
      const win = Number(b.win_amount || 0);
      totalStaked += stake;
      totalWon += win;

      if (b.status === 'ACTIVE') {
        activeBets.push({
          id: b.id,
          userId: b.user_id,
          stake,
          autoCashout: b.auto_cashout ? Number(b.auto_cashout) : null,
        });
      }
    }
  } catch (err) {
    console.warn('Could not load bets for profit evaluation:', err.message);
  }

  const roundDetails = getRoundDetails(cycleIdx);
  const naturalCrashPoint = roundDetails.naturalCrashPoint || 2.0;

  // 3. Compute safe multiplier cap based on percentage of total bets
  const evaluation = computeProfitTargetCrashCap(
    totalStaked,
    totalWon,
    activeBets,
    targetProfitPercent,
    naturalCrashPoint
  );

  const state = getCycleState();
  const isCurrentRound = Number(state.cycleIndex) === cycleIdx;

  // 4. If percentage target requires an override, enforce it in game engine and DB
  if (targetProfitPercent !== null && targetProfitPercent !== undefined && targetProfitPercent > 0) {
    if (evaluation.willOverride) {
      const targetCap = evaluation.safeMultiplierCap;

      // If flight is actively flying and already reached the safe cap, instant crash now!
      if (isCurrentRound && !state.isBettingPhase && !state.hasCrashed && (state.currentMultiplier >= targetCap)) {
        triggerInstantCrash(rId, targetCap);

        // Mark active bets in DB as CRASHED
        try {
          await sql.query(`
            UPDATE public.bets 
            SET status = 'CRASHED' 
            WHERE status = 'ACTIVE' AND round_id = $1
          `, [rId]);
        } catch (e) {
          console.warn('Could not resolve active bets on target crash:', e.message);
        }
      } else {
        // Apply memory override to cap this round's crash target
        setMemoryOverride(rId, targetCap);
      }

      // Persist override to DB
      try {
        await sql.query(`
          INSERT INTO public.round_overrides (round_id, crash_point, note, target_profit_percent, target_profit_kes)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (round_id) DO UPDATE SET
            crash_point = EXCLUDED.crash_point,
            note = EXCLUDED.note,
            target_profit_percent = EXCLUDED.target_profit_percent,
            target_profit_kes = EXCLUDED.target_profit_kes,
            created_at = NOW()
        `, [
          rId,
          targetCap,
          `System Profit Target ${targetProfitPercent}% (Cap ${targetCap.toFixed(2)}x)`,
          targetProfitPercent,
          evaluation.targetProfitKes,
        ]);
      } catch (e) {
        console.warn('Could not persist profit target override:', e.message);
      }
    }
  }

  return {
    roundId: rId,
    targetProfitPercent,
    targetProfitKes: evaluation.targetProfitKes,
    totalStaked,
    totalWon,
    activeBetsCount: activeBets.length,
    activeStaked: activeBets.reduce((acc, b) => acc + b.stake, 0),
    currentHouseProfit: totalStaked - totalWon,
    globalConfig: getGlobalProfitTarget(),
    ...evaluation,
  };
}

/**
 * Admin action to configure a per-round house percentage profit target.
 */
export async function setRoundProfitTargetDb(roundId, targetProfitPercent) {
  const rId = String(roundId);
  const targetPct = Math.min(100, Math.max(1, parseFloat(Number(targetProfitPercent).toFixed(1))));

  setRoundProfitTarget(rId, targetPct);

  await sql.query(`
    INSERT INTO public.round_overrides (round_id, target_profit_percent, note)
    VALUES ($1, $2, 'House Profit Target % Set by Admin')
    ON CONFLICT (round_id) DO UPDATE SET
      target_profit_percent = EXCLUDED.target_profit_percent,
      note = EXCLUDED.note,
      created_at = NOW()
  `, [rId, targetPct]);

  return await evaluateAndEnforceProfitTarget(rId);
}

/**
 * Admin action to clear the per-round house profit target.
 */
export async function clearRoundProfitTargetDb(roundId) {
  const rId = String(roundId);
  clearRoundProfitTarget(rId);

  try {
    const existing = await sql.query(`
      SELECT note, crash_point FROM public.round_overrides WHERE round_id = $1
    `, [rId]);

    if (existing.length > 0) {
      const note = existing[0].note || '';
      if (note.includes('House Profit Target') || note.includes('System Profit Target')) {
        removeMemoryOverride(rId);
        await sql.query(`DELETE FROM public.round_overrides WHERE round_id = $1`, [rId]);
      } else {
        await sql.query(`
          UPDATE public.round_overrides 
          SET target_profit_percent = NULL, target_profit_kes = NULL 
          WHERE round_id = $1
        `, [rId]);
      }
    }
  } catch (e) {
    console.warn('Could not clear target from DB:', e.message);
  }

  return { success: true, message: `Profit target removed for Round #${rId}.` };
}
