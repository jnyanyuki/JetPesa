import { NextResponse } from 'next/server';
import { withTransaction } from '../../../../../lib/db';
import { getAuthSession } from '../../../../../lib/auth/server';
import {
  dealHiloCard,
  calculateHiloOdds,
} from '../../../../../lib/games/hiloEngine';

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
          message: 'No active card duel in progress.',
        };
      }

      const round = roundRes.rows[0];
      const skipsLeft = Number(round.skips_left);

      if (skipsLeft <= 0) {
        return {
          error: true,
          status: 400,
          code: 'NO_SKIPS_LEFT',
          message: 'You have used all skips for this duel round.',
        };
      }

      const currentStep = Number(round.current_step);
      const history = typeof round.card_history === 'string'
        ? JSON.parse(round.card_history)
        : (round.card_history || []);

      // Deal a fresh card via skip identifier
      const skipIdentifier = `skip-${currentStep}-${skipsLeft}`;
      const newCard = dealHiloCard(round.server_seed, round.client_seed, round.nonce, skipIdentifier);
      const newSkipsLeft = skipsLeft - 1;
      const skipHistoryItem = {
        ...newCard,
        isSkip: true,
      };
      const updatedHistory = [...history, skipHistoryItem];
      const nextOdds = calculateHiloOdds(newCard.rank);

      await client.query(`
        UPDATE public.hilo_rounds
        SET 
          current_card = $1,
          card_history = $2,
          skips_left = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [
        JSON.stringify(newCard),
        JSON.stringify(updatedHistory),
        newSkipsLeft,
        round.id,
      ]);

      return {
        error: false,
        card: newCard,
        skipsLeft: newSkipsLeft,
        odds: nextOdds,
        cardHistory: updatedHistory,
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
    console.error('Error skipping Hi-Lo card:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
