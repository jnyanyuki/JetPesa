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
  clearAllRoundProfitTargets,
  setGlobalProfitTarget,
  getGlobalProfitTarget,
  setRoundProfitTargetGlobal,
  getRoundProfitTargetGlobal,
  setDailyProfitEngineGlobal,
  getDailyProfitEngineGlobal,
  getEffectiveRoundProfitTarget,
  computeProfitTargetCrashCap,
} from './gameEngine';

let dbSettingsLoaded = false;

/**
 * Loads both independent profit target settings from PostgreSQL:
 * 1. round_profit_target (all rounds real wager profit lock)
 * 2. daily_profit_engine (liabilities & pay-ins retention engine)
 */
export async function loadAllProfitSettingsFromDb() {
  try {
    const rows = await sql.query(`
      SELECT key, value FROM public.system_settings 
      WHERE key IN ('round_profit_target', 'daily_profit_engine', 'profit_target')
    `);
    
    let roundSetting = null;
    let dailySetting = null;

    for (const r of rows) {
      const val = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
      if (r.key === 'round_profit_target') roundSetting = val;
      else if (r.key === 'daily_profit_engine') dailySetting = val;
      else if (r.key === 'profit_target' && !roundSetting) roundSetting = val;
    }

    if (roundSetting) {
      const rMode = roundSetting.mode || 'percent';
      const rVal = rMode === 'kes'
        ? Number(roundSetting.customKes || roundSetting.value || 500)
        : Number(roundSetting.percent || roundSetting.value || 50);
      setRoundProfitTargetGlobal(Boolean(roundSetting.enabled), rVal, rMode);
    }
    if (dailySetting) {
      const dMode = dailySetting.mode || 'percent';
      const dVal = dMode === 'kes'
        ? Number(dailySetting.customKes || dailySetting.value || 2500)
        : Number(dailySetting.percent || dailySetting.value || 50);
      setDailyProfitEngineGlobal(Boolean(dailySetting.enabled), dVal, dMode);
    }
    dbSettingsLoaded = true;
  } catch (e) {
    console.warn('Could not load profit settings from DB:', e.message);
  }
  dbSettingsLoaded = true;
  return {
    roundProfitTarget: getRoundProfitTargetGlobal(),
    dailyProfitEngine: getDailyProfitEngineGlobal(),
  };
}

export async function loadGlobalProfitTargetFromDb() {
  await loadAllProfitSettingsFromDb();
  return getRoundProfitTargetGlobal();
}

/**
 * Top Panel Action: Configure independent Round Profit Target across ALL rounds.
 * Focuses strictly on all rounds real wager profit lock.
 * Supports custom percentage (0.1% - 100%) or custom KES amount (mode = 'percent' | 'kes').
 * 
 * @param {boolean} enabled
 * @param {number} value
 * @param {string} [mode]
 */
export async function setRoundProfitTargetGlobalDb(enabled, value, mode) {
  const isEnabled = Boolean(enabled);
  const current = getRoundProfitTargetGlobal();
  const rawNum = (value !== undefined && value !== null && value !== '') ? Number(value) : current.value;
  const cleanNum = (!Number.isNaN(rawNum) && rawNum > 0) ? parseFloat(rawNum.toFixed(2)) : 50;

  let resolvedMode = mode || (cleanNum > 100 ? 'kes' : (current.mode || 'percent'));
  if (cleanNum > 100) resolvedMode = 'kes';

  setRoundProfitTargetGlobal(isEnabled, cleanNum, resolvedMode);
  clearAllRoundProfitTargets();

  const updated = getRoundProfitTargetGlobal();

  try {
    await sql.query(`
      INSERT INTO public.system_settings (key, value, updated_at)
      VALUES ('round_profit_target', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
    `, [JSON.stringify(updated)]);
  } catch (e) {
    console.warn('Could not save round_profit_target to DB:', e.message);
  }

  const state = getCycleState();

  // If disabled or changed, clear any stale profit-target override on the current/upcoming round first
  try {
    const curId = String(state.cycleIndex);
    const nextId = String(state.cycleIndex + 1);
    removeMemoryOverride(curId);
    removeMemoryOverride(nextId);
    await sql.query(`
      DELETE FROM public.round_overrides 
      WHERE round_id IN ($1, $2) 
      AND (note LIKE '%Profit Target%' OR target_profit_percent IS NOT NULL OR target_profit_kes IS NOT NULL)
    `, [curId, nextId]);
  } catch (e) {
    console.warn('Could not clear stale round profit overrides:', e.message);
  }

  // Immediately evaluate the current active flight round
  const evalResult = await evaluateAndEnforceProfitTarget(state.cycleIndex);

  const label = updated.mode === 'kes'
    ? `KES ${updated.customKes.toLocaleString()}`
    : `${updated.percent}%`;

  return {
    success: true,
    enabled: updated.enabled,
    percent: updated.percent,
    customKes: updated.customKes,
    mode: updated.mode,
    value: updated.value,
    message: isEnabled 
      ? `Round profit target of ${label} engaged across all rounds real wagers.`
      : `Round profit target disabled. Flights will proceed with natural Provably Fair seed output.`,
    currentRoundEval: evalResult,
  };
}

// Backward-compatible alias for setGlobalProfitTargetDb
export async function setGlobalProfitTargetDb(enabled, percent, mode) {
  return setRoundProfitTargetGlobalDb(enabled, percent, mode);
}

/**
 * Right Panel Action: Configure independent Daily Profit Engine & Target.
 * Focuses on safeguarding player funds (liabilities) and locking real pay-ins retention.
 * Supports custom percentage (0.1% - 100%) or custom KES amount (mode = 'percent' | 'kes').
 * 
 * @param {boolean} enabled
 * @param {number} value
 * @param {string} [mode]
 */
export async function setDailyProfitEngineDb(enabled, value, mode) {
  const isEnabled = Boolean(enabled);
  const current = getDailyProfitEngineGlobal();
  const rawNum = (value !== undefined && value !== null && value !== '') ? Number(value) : current.value;
  const cleanNum = (!Number.isNaN(rawNum) && rawNum > 0) ? parseFloat(rawNum.toFixed(2)) : 50;

  let resolvedMode = mode || (cleanNum > 100 ? 'kes' : (current.mode || 'percent'));
  if (cleanNum > 100) resolvedMode = 'kes';

  setDailyProfitEngineGlobal(isEnabled, cleanNum, resolvedMode);
  const updated = getDailyProfitEngineGlobal();

  try {
    await sql.query(`
      INSERT INTO public.system_settings (key, value, updated_at)
      VALUES ('daily_profit_engine', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
    `, [JSON.stringify(updated)]);
  } catch (e) {
    console.warn('Could not save daily_profit_engine to DB:', e.message);
  }

  const label = updated.mode === 'kes'
    ? `KES ${updated.customKes.toLocaleString()}`
    : `${updated.percent}%`;

  return {
    success: true,
    enabled: updated.enabled,
    percent: updated.percent,
    customKes: updated.customKes,
    mode: updated.mode,
    value: updated.value,
    message: isEnabled 
      ? `Daily profit target locked at ${label} (safeguarding player account funds & pay-ins).`
      : `Daily profit engine set to pass-through mode.`,
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

  // 4. If target requires an override, enforce it in game engine and DB
  const hasActiveTarget = targetProfitPercent !== null && targetProfitPercent !== undefined && (
    typeof targetProfitPercent === 'object'
      ? (targetProfitPercent.mode === 'kes' ? targetProfitPercent.customKes > 0 : targetProfitPercent.percent > 0)
      : targetProfitPercent > 0
  );

  if (hasActiveTarget) {
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
          `System Profit Target ${evaluation.targetProfitPercent || 100}% (Cap ${targetCap.toFixed(2)}x)`,
          evaluation.targetProfitPercent,
          evaluation.targetProfitKes,
        ]);
      } catch (e) {
        console.warn('Could not persist profit target override:', e.message);
      }
    }
  }

  return {
    roundId: rId,
    targetProfitPercent: evaluation.targetProfitPercent,
    targetProfitKes: evaluation.targetProfitKes,
    targetMode: evaluation.targetMode || 'percent',
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
