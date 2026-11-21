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
  computeProfitTargetCrashCap,
} from './gameEngine';

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

  // 1. Check in-memory or DB percentage profit target
  let targetProfitPercent = getRoundProfitTarget(rId);

  if (targetProfitPercent === null || targetProfitPercent === undefined) {
    try {
      const rows = await sql.query(`
        SELECT target_profit_percent, target_profit_kes, crash_point 
        FROM public.round_overrides 
        WHERE round_id = $1
      `, [rId]);
      if (rows.length > 0) {
        if (rows[0].target_profit_percent !== null) {
          targetProfitPercent = Number(rows[0].target_profit_percent);
        } else if (rows[0].target_profit_kes !== null) {
          targetProfitPercent = 50; // default 50%
        }
        if (targetProfitPercent !== null && targetProfitPercent !== undefined) {
          setRoundProfitTarget(rId, targetProfitPercent);
        }
      }
    } catch (e) {
      console.warn('Could not query profit target from DB:', e.message);
    }
  }

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

      // Persist to round_overrides in DB
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
          `House Profit Target ${targetProfitPercent}% (Cap ${targetCap.toFixed(2)}x)`,
          targetProfitPercent,
          evaluation.targetProfitKes,
        ]);
      } catch (e) {
        console.warn('Could not persist profit target override:', e.message);
      }
    } else {
      // Natural crash point is sufficient or target is already secured
      try {
        await sql.query(`
          INSERT INTO public.round_overrides (round_id, target_profit_percent, target_profit_kes, note)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (round_id) DO UPDATE SET
            target_profit_percent = EXCLUDED.target_profit_percent,
            target_profit_kes = EXCLUDED.target_profit_kes,
            note = EXCLUDED.note,
            created_at = NOW()
        `, [
          rId,
          targetProfitPercent,
          evaluation.targetProfitKes,
          `House Profit Target ${targetProfitPercent}% (Target Secured)`,
        ]);
      } catch (e) {
        console.warn('Could not update profit target record in DB:', e.message);
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
    ...evaluation,
  };
}

/**
 * Admin action to configure a per-round house percentage profit target.
 * @param {string|number} roundId
 * @param {number} targetProfitPercent (1 to 100)
 */
export async function setRoundProfitTargetDb(roundId, targetProfitPercent) {
  const rId = String(roundId);
  const targetPct = Math.min(100, Math.max(1, parseFloat(Number(targetProfitPercent).toFixed(1))));

  setRoundProfitTarget(rId, targetPct);

  // Persist target in DB
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

  // Remove target and if crash point was set by target, remove override
  try {
    const existing = await sql.query(`
      SELECT note, crash_point FROM public.round_overrides WHERE round_id = $1
    `, [rId]);

    if (existing.length > 0) {
      const note = existing[0].note || '';
      if (note.includes('House Profit Target')) {
        // Revert override completely
        removeMemoryOverride(rId);
        await sql.query(`DELETE FROM public.round_overrides WHERE round_id = $1`, [rId]);
      } else {
        // Keep custom manual crash_point override, only remove target percentages
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
