import { NextResponse } from 'next/server';
import { withTransaction } from '../../../../../lib/db';
import { getAuthSession } from '../../../../../lib/auth/server';
import {
  COIN_SIDES,
  COINFLIP_CONFIG,
  resolveCoinflip,
  getCoinflipMultiplier,
} from '../../../../../lib/games/coinflipEngine';

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

    const choice = String(body.choice || '').toUpperCase();
    if (!COIN_SIDES.includes(choice)) {
      return NextResponse.json(
        { success: false, code: 'INVALID_CHOICE', message: `Choice must be either 'HEADS' or 'TAILS'.` },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (client) => {
      // 1. Fetch active round
      const roundRes = await client.query(`
        SELECT 
          id, stake, current_streak, current_multiplier, flips_history,
          status, server_seed, client_seed, nonce
        FROM public.coinflip_rounds
        WHERE user_id = $1 AND status = 'ACTIVE'
        FOR UPDATE
      `, [userId]);

      if (roundRes.rows.length === 0) {
        return {
          error: true,
          status: 404,
          code: 'NO_ACTIVE_ROUND',
          message: 'No active Coinflip round found. Place a bet to start.',
        };
      }

      const round = roundRes.rows[0];
      const roundId = round.id;
      const stake = Number(round.stake);
      const currentStreak = Number(round.current_streak);
      const nextStreak = currentStreak + 1;

      // 2. Resolve Provably Fair coin flip
      const outcome = resolveCoinflip(
        round.server_seed,
        round.client_seed,
        round.nonce,
        nextStreak
      );

      const won = choice === outcome;
      const flipsHistory = Array.isArray(round.flips_history) ? [...round.flips_history] : [];

      if (!won) {
        // === BUSTED / WRONG GUESS ===
        flipsHistory.push({
          flip: nextStreak,
          choice,
          outcome,
          won: false,
          multiplier: 0,
        });

        await client.query(`
          UPDATE public.coinflip_rounds
          SET status = 'BUSTED', flips_history = $1, updated_at = NOW()
          WHERE id = $2
        `, [JSON.stringify(flipsHistory), roundId]);

        await client.query(`
          UPDATE public.bets
          SET status = 'LOST', multiplier = 0, win_amount = 0
          WHERE round_id = $1 AND user_id = $2
        `, [roundId, userId]);

        return {
          success: true,
          won: false,
          choice,
          outcome,
          streak: currentStreak,
          status: 'BUSTED',
          flipsHistory,
          serverSeed: round.server_seed,
          clientSeed: round.client_seed,
          nonce: round.nonce,
          message: `Landed on ${outcome}! Coin flip lost.`,
        };
      }

      // === WON FLIP ===
      const newStreak = nextStreak;
      const newMultiplier = getCoinflipMultiplier(newStreak);
      flipsHistory.push({
        flip: newStreak,
        choice,
        outcome,
        won: true,
        multiplier: newMultiplier,
      });

      await client.query(`
        UPDATE public.coinflip_rounds
        SET 
          current_streak = $1,
          current_multiplier = $2,
          flips_history = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [newStreak, newMultiplier, JSON.stringify(flipsHistory), roundId]);

      const currentPayout = Math.floor(stake * newMultiplier * 100) / 100;
      const nextMultiplier = getCoinflipMultiplier(newStreak + 1);

      return {
        success: true,
        won: true,
        choice,
        outcome,
        streak: newStreak,
        multiplier: newMultiplier,
        nextMultiplier,
        currentPayout,
        status: 'ACTIVE',
        flipsHistory,
        message: `Landed on ${outcome}! ${newStreak}x streak! Current payout: KES ${currentPayout.toLocaleString()} (${newMultiplier}x).`,
      };
    });

    if (result.error) {
      return NextResponse.json({ success: false, code: result.code, message: result.message }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error flipping coin:', error);
    return NextResponse.json({ success: false, message: error.message || 'Internal server error' }, { status: 500 });
  }
}
