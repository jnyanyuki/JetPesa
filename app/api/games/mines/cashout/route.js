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
        SELECT 
          id, stake, mines_count, mine_positions, revealed_tiles,
          current_multiplier, status, server_seed, client_seed, nonce
        FROM public.mines_rounds
        WHERE user_id = $1 AND status = 'ACTIVE'
        FOR UPDATE
      `, [userId]);

      if (roundRes.rows.length === 0) {
        return {
          error: true,
          status: 404,
          code: 'NO_ACTIVE_ROUND',
          message: 'No active Mines round available to cash out.',
        };
      }

      const round = roundRes.rows[0];
      const roundId = round.id;
      const stake = Number(round.stake);
      const revealedTiles = round.revealed_tiles || [];
      const currentMultiplier = Number(round.current_multiplier);

      if (revealedTiles.length === 0 || currentMultiplier <= 1.00) {
        return {
          error: true,
          status: 400,
          code: 'NO_GEMS_REVEALED',
          message: 'You must reveal at least one safe gem before cashing out.',
        };
      }

      const finalPayout = Math.floor(stake * currentMultiplier * 100) / 100;

      // Credit wallet
      const creditRes = await client.query(`
        UPDATE public.users
        SET wallet_balance = wallet_balance + $1, updated_at = NOW()
        WHERE id = $2
        RETURNING wallet_balance
      `, [finalPayout, userId]);

      const newBalance = Number(creditRes.rows[0]?.wallet_balance || 0);

      // Update Mines round to WON
      await client.query(`
        UPDATE public.mines_rounds
        SET 
          status = 'WON', 
          payout = $1, 
          updated_at = NOW()
        WHERE id = $2
      `, [finalPayout, roundId]);

      // Update public.bets to WON
      await client.query(`
        UPDATE public.bets
        SET status = 'WON', multiplier = $1, win_amount = $2
        WHERE round_id = $3 AND user_id = $4
      `, [currentMultiplier, finalPayout, roundId, userId]);

      return {
        success: true,
        roundId,
        status: 'WON',
        multiplier: currentMultiplier,
        payout: finalPayout,
        minePositions: round.mine_positions,
        serverSeed: round.server_seed,
        clientSeed: round.client_seed,
        nonce: round.nonce,
        newBalance,
        message: `CASHOUT SUCCESSFUL! Won KES ${finalPayout.toLocaleString()} at ${currentMultiplier}x!`,
      };
    });

    if (result.error) {
      return NextResponse.json({ success: false, code: result.code, message: result.message }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error cashing out Mines round:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
