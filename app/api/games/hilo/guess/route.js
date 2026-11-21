import { NextResponse } from 'next/server';
import { withTransaction } from '../../../../../lib/db';
import { getAuthSession } from '../../../../../lib/auth/server';
import {
  HILO_CONFIG,
  dealHiloCard,
  calculateHiloOdds,
  evaluateHiloGuess,
} from '../../../../../lib/games/hiloEngine';

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
    if (!['HIGHER', 'LOWER', 'SAME'].includes(choice)) {
      return NextResponse.json(
        { success: false, code: 'INVALID_CHOICE', message: 'Choice must be HIGHER, LOWER, or SAME.' },
        { status: 400 }
      );
    }

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
          message: 'No active card duel in progress. Place a stake to begin.',
        };
      }

      const round = roundRes.rows[0];
      const stake = Number(round.stake);
      const currentStep = Number(round.current_step);
      const currentMultiplier = Number(round.current_multiplier);
      const currentCard = typeof round.current_card === 'string'
        ? JSON.parse(round.current_card)
        : round.current_card;
      const history = typeof round.card_history === 'string'
        ? JSON.parse(round.card_history)
        : (round.card_history || []);

      // 2. Validate current card boundaries
      if (choice === 'HIGHER' && currentCard.rank >= 14) {
        return {
          error: true,
          status: 400,
          code: 'INVALID_MOVE',
          message: 'Cannot bet HIGHER on an Ace! Choose LOWER or SAME.',
        };
      }
      if (choice === 'LOWER' && currentCard.rank <= 2) {
        return {
          error: true,
          status: 400,
          code: 'INVALID_MOVE',
          message: 'Cannot bet LOWER on a 2! Choose HIGHER or SAME.',
        };
      }

      // 3. Deal next card deterministically
      const nextStepIndex = currentStep + 1;
      const nextCard = dealHiloCard(round.server_seed, round.client_seed, round.nonce, nextStepIndex);
      const evalResult = evaluateHiloGuess(currentCard.rank, nextCard.rank, choice);

      if (evalResult.isWin) {
        const newMultiplier = parseFloat((currentMultiplier * evalResult.stepMultiplier).toFixed(4));
        const currentPayout = Math.floor(stake * newMultiplier * 100) / 100;
        const newHistoryItem = {
          ...nextCard,
          guess: choice,
          isWin: true,
          stepMultiplier: evalResult.stepMultiplier,
          accumulatedMultiplier: newMultiplier,
        };
        const updatedHistory = [...history, newHistoryItem];
        const nextOdds = calculateHiloOdds(nextCard.rank);

        await client.query(`
          UPDATE public.hilo_rounds
          SET 
            current_card = $1,
            card_history = $2,
            current_step = $3,
            current_multiplier = $4,
            updated_at = NOW()
          WHERE id = $5
        `, [
          JSON.stringify(nextCard),
          JSON.stringify(updatedHistory),
          nextStepIndex,
          newMultiplier,
          round.id,
        ]);

        return {
          error: false,
          isWin: true,
          card: nextCard,
          previousCard: currentCard,
          choice,
          stepMultiplier: evalResult.stepMultiplier,
          currentMultiplier: newMultiplier,
          currentPayout,
          currentStep: nextStepIndex,
          odds: nextOdds,
          cardHistory: updatedHistory,
          status: 'ACTIVE',
        };
      } else {
        // Player BUSTED
        const bustHistoryItem = {
          ...nextCard,
          guess: choice,
          isWin: false,
          stepMultiplier: 0,
        };
        const updatedHistory = [...history, bustHistoryItem];

        await client.query(`
          UPDATE public.hilo_rounds
          SET 
            current_card = $1,
            card_history = $2,
            current_step = $3,
            status = 'BUSTED',
            payout = 0.00,
            updated_at = NOW()
          WHERE id = $4
        `, [
          JSON.stringify(nextCard),
          JSON.stringify(updatedHistory),
          nextStepIndex,
          round.id,
        ]);

        // Settle bet record as lost
        await client.query(`
          UPDATE public.bets
          SET status = 'lost', payout = 0.00, profit = -$1, multiplier = 0.00
          WHERE user_id = $2 AND game_type = 'hilo' AND status = 'pending'
        `, [stake, userId]);

        return {
          error: false,
          isWin: false,
          card: nextCard,
          previousCard: currentCard,
          choice,
          currentMultiplier: 0,
          currentPayout: 0,
          status: 'BUSTED',
          serverSeed: round.server_seed,
          cardHistory: updatedHistory,
        };
      }
    });

    if (result.error) {
      return NextResponse.json({ success: false, code: result.code, message: result.message }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error executing Hi-Lo guess:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
