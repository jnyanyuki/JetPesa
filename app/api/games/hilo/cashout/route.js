import { NextResponse } from 'next/server';
import { withTransaction } from '../../../../../lib/db';
import { getAuthSession } from '../../../../../lib/auth/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, code: 'UNAUTHORIZED', message: 'Sign in required.' }, { status: 401 });
    }
    const userId = session.user.id;

    const result = await withTransaction(async (client) => {
      // 1. Fetch active round
      const roundRes = await client.query(`
        SELECT * FROM public.hilo_rounds
        WHERE user_id = $1 AND status = 'ACTIVE'
        FOR UPDATE
      `, [userId]);

      if (roundRes.rows.length === 0) {
        return {
          error: true,
          status: 400,
          code: 'NO_ACTIVE_GAME',
          message: 'No active card duel to cash out from.',
        };
      }

      const round = roundRes.rows[0];
      const stake = Number(round.stake);
      const currentMultiplier = Number(round.current_multiplier);
      const currentStep = Number(round.current_step);

      if (currentStep < 1 || currentMultiplier <= 1.0) {
        return {
          error: true,
          status: 400,
          code: 'MIN_STEP_REQUIRED',
          message: 'You must make at least one winning card guess before cashing out.',
        };
      }

      const payout = Math.floor(stake * currentMultiplier * 100) / 100;
      const profit = Math.floor((payout - stake) * 100) / 100;

      // 2. Credit winnings atomically to wallet
      const creditRes = await client.query(`
        UPDATE public.users
        SET wallet_balance = wallet_balance + $1, updated_at = NOW()
        WHERE id = $2
        RETURNING wallet_balance
      `, [payout, userId]);

      const updatedBalance = Number(creditRes.rows[0].wallet_balance);

      // 3. Mark round as WON
      await client.query(`
        UPDATE public.hilo_rounds
        SET status = 'WON', payout = $1, updated_at = NOW()
        WHERE id = $2
      `, [payout, round.id]);

      // 4. Update bet record in public.bets
      await client.query(`
        UPDATE public.bets
        SET status = 'won', payout = $1, profit = $2, multiplier = $3
        WHERE user_id = $4 AND game_type = 'hilo' AND status = 'pending'
      `, [payout, profit, currentMultiplier, userId]);

      return {
        error: false,
        payout,
        profit,
        multiplier: currentMultiplier,
        serverSeed: round.server_seed,
        updatedBalance,
      };
    });

    if (result.error) {
      return NextResponse.json({ success: false, code: result.code, message: result.message }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error cashing out Hi-Lo:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
