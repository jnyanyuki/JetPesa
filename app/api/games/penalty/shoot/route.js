import { NextResponse } from 'next/server';
import { withTransaction } from '../../../../../lib/db';
import { getAuthSession } from '../../../../../lib/auth/server';
import {
  PENALTY_SPOTS,
  getPenaltySettings,
  getPenaltyMultiplier,
  resolvePenaltyKick,
} from '../../../../../lib/games/penaltyEngine';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, code: 'UNAUTHORIZED', message: 'Sign in required.' }, { status: 401 });
    }
    const userId = session.user.id;

    let body = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, code: 'INVALID_JSON', message: 'Malformed JSON payload.' }, { status: 400 });
    }

    const spot = String(body.spot || '').toUpperCase();
    if (!PENALTY_SPOTS.includes(spot)) {
      return NextResponse.json(
        { success: false, code: 'INVALID_SPOT', message: `Spot must be one of: ${PENALTY_SPOTS.join(', ')}` },
        { status: 400 }
      );
    }

    const settings = await getPenaltySettings();
    const maxShots = settings.maxShots;

    const result = await withTransaction(async (client) => {
      // 1. Fetch active round
      const roundRes = await client.query(`
        SELECT 
          id, stake, current_streak, current_multiplier, shots_history,
          status, server_seed, client_seed, nonce
        FROM public.penalty_rounds
        WHERE user_id = $1 AND status = 'ACTIVE'
        FOR UPDATE
      `, [userId]);

      if (roundRes.rows.length === 0) {
        return {
          error: true,
          status: 404,
          code: 'NO_ACTIVE_ROUND',
          message: 'No active Penalty shootout found. Start a new series first.',
        };
      }

      const round = roundRes.rows[0];
      const roundId = round.id;
      const stake = Number(round.stake);
      const currentStreak = Number(round.current_streak);
      const shotIndex = currentStreak + 1;

      if (shotIndex > maxShots) {
        return {
          error: true,
          status: 400,
          code: 'MAX_SHOTS_REACHED',
          message: 'Series is already completed.',
        };
      }

      // 2. Resolve kick with Provably Fair engine using active settings
      const kickOutcome = resolvePenaltyKick(
        round.server_seed,
        round.client_seed,
        round.nonce,
        shotIndex,
        spot,
        settings
      );

      const isGoal = kickOutcome.isGoal;
      const keeperDive = kickOutcome.keeperDive;
      const shotsHistory = Array.isArray(round.shots_history) ? [...round.shots_history] : [];

      if (!isGoal) {
        // === SAVED BY KEEPER (ROUND BUSTED) ===
        shotsHistory.push({
          shot: shotIndex,
          spot,
          keeperDive,
          result: 'SAVED',
          multiplier: 0,
        });

        await client.query(`
          UPDATE public.penalty_rounds
          SET status = 'SAVED', shots_history = $1, updated_at = NOW()
          WHERE id = $2
        `, [JSON.stringify(shotsHistory), roundId]);

        await client.query(`
          UPDATE public.bets
          SET status = 'LOST', multiplier = 0, win_amount = 0
          WHERE round_id = $1 AND user_id = $2
        `, [roundId, userId]);

        return {
          success: true,
          isGoal: false,
          keeperDive,
          spot,
          shotIndex,
          status: 'SAVED',
          shotsHistory,
          serverSeed: round.server_seed,
          clientSeed: round.client_seed,
          nonce: round.nonce,
          message: 'SAVED! The goalkeeper blocked your shot!',
        };
      }

      // === GOAL SCORED! ===
      const newStreak = shotIndex;
      const newMultiplier = kickOutcome.multiplier;
      shotsHistory.push({
        shot: shotIndex,
        spot,
        keeperDive,
        result: 'GOAL',
        multiplier: newMultiplier,
      });

      const isSeriesCleared = newStreak >= maxShots;

      if (isSeriesCleared) {
        // Grand Final Goal (Clean Sweep) -> Automatic Cashout
        const finalPayout = Math.floor(stake * newMultiplier * 100) / 100;

        const creditRes = await client.query(`
          UPDATE public.users
          SET wallet_balance = wallet_balance + $1, updated_at = NOW()
          WHERE id = $2
          RETURNING wallet_balance
        `, [finalPayout, userId]);

        const newBalance = Number(creditRes.rows[0]?.wallet_balance || 0);

        await client.query(`
          UPDATE public.penalty_rounds
          SET 
            status = 'WON',
            current_streak = $1,
            current_multiplier = $2,
            payout = $3,
            shots_history = $4,
            updated_at = NOW()
          WHERE id = $5
        `, [newStreak, newMultiplier, finalPayout, JSON.stringify(shotsHistory), roundId]);

        await client.query(`
          UPDATE public.bets
          SET status = 'WON', multiplier = $1, win_amount = $2
          WHERE round_id = $3 AND user_id = $4
        `, [newMultiplier, finalPayout, roundId, userId]);

        return {
          success: true,
          isGoal: true,
          isCleared: true,
          keeperDive,
          spot,
          shotIndex,
          currentStreak: newStreak,
          currentMultiplier: newMultiplier,
          payout: finalPayout,
          status: 'WON',
          shotsHistory,
          serverSeed: round.server_seed,
          clientSeed: round.client_seed,
          nonce: round.nonce,
          newBalance,
          message: `GOOOOOAAAL! FULL ${newStreak}/${maxShots} CLEAN SWEEP! Won KES ${finalPayout.toLocaleString()} at ${newMultiplier}x!`,
        };
      }

      // Mid-series Goal -> Can shoot again or cash out
      await client.query(`
        UPDATE public.penalty_rounds
        SET 
          current_streak = $1,
          current_multiplier = $2,
          shots_history = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [newStreak, newMultiplier, JSON.stringify(shotsHistory), roundId]);

      const currentPayout = Math.floor(stake * newMultiplier * 100) / 100;
      const nextMultiplier = getPenaltyMultiplier(newStreak + 1, settings.multipliers);

      return {
        success: true,
        isGoal: true,
        isCleared: false,
        keeperDive,
        spot,
        shotIndex,
        currentStreak: newStreak,
        currentMultiplier: newMultiplier,
        nextMultiplier,
        currentPayout,
        status: 'ACTIVE',
        shotsHistory,
        message: `GOAL! Shot ${newStreak}/${maxShots} scored! Current value: KES ${currentPayout.toLocaleString()} (${newMultiplier}x).`,
      };
    });

    if (result.error) {
      return NextResponse.json({ success: false, code: result.code, message: result.message }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error executing Penalty kick:', error);
    return NextResponse.json({ success: false, message: error.message || 'Internal server error' }, { status: 500 });
  }
}
