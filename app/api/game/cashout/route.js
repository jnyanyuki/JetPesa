import { NextResponse } from 'next/server';
import { withTransaction } from '../../../../lib/db';
import { getAuthSession } from '../../../../lib/auth/server';
import { getCycleState } from '../../../../lib/gameEngine';
import { evaluateAndEnforceProfitTarget } from '../../../../lib/profitTargetEngine';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, code: 'UNAUTHORIZED', message: 'Authentication required. Please sign in.' },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    let body = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, code: 'INVALID_JSON', message: 'Malformed JSON payload.' },
        { status: 400 }
      );
    }

    const { betId, deck } = body;
    const cleanDeck = deck ? String(deck).toUpperCase() : null;

    const state = getCycleState();

    if (state.isBettingPhase) {
      return NextResponse.json({
        success: false,
        code: 'NOT_DEPARTED',
        message: 'Flight has not departed yet.'
      }, { status: 200 });
    }

    const targetBetId = betId || `BET-${state.cycleIndex}-${cleanDeck}-${userId}`;

    let outcome = null;

    await withTransaction(async (client) => {
      const betRes = await client.query(`
        SELECT id, user_id, round_id, deck, stake, auto_cashout, status, multiplier, win_amount
        FROM public.bets
        WHERE id = $1
        FOR UPDATE
      `, [targetBetId]);

      if (betRes.rows.length === 0) {
        outcome = {
          success: false,
          code: 'BET_NOT_FOUND',
          message: 'Active bet record not found for this flight.',
        };
        return;
      }

      const bet = betRes.rows[0];
      if (bet.user_id !== userId) {
        outcome = {
          success: false,
          code: 'FORBIDDEN',
          message: 'Unauthorized bet access.',
        };
        return;
      }

      if (bet.status !== 'ACTIVE') {
        outcome = {
          success: false,
          code: 'ALREADY_RESOLVED',
          status: bet.status,
          multiplier: Number(bet.multiplier || 0),
          winAmount: Number(bet.win_amount || 0),
          message: `Bet has already been resolved as ${bet.status}.`,
        };
        return;
      }

      const betWager = Number(bet.stake);
      const autoCash = bet.auto_cashout ? Number(bet.auto_cashout) : null;
      const targetMultiplier = (autoCash && autoCash <= state.currentMultiplier)
        ? autoCash
        : state.currentMultiplier;

      // Check crash condition on server
      if (state.hasCrashed || targetMultiplier >= state.crashPoint) {
        await client.query(`
          UPDATE public.bets 
          SET status = 'CRASHED' 
          WHERE id = $1
        `, [targetBetId]);

        outcome = {
          success: false,
          code: 'CRASHED',
          crashPoint: state.crashPoint,
          message: `Flight flew away at ${state.crashPoint.toFixed(2)}x. Cashout missed.`,
        };
        return;
      }

      const cashoutMultiplier = targetMultiplier;
      const winAmount = Math.floor(betWager * cashoutMultiplier * 100) / 100;

      // Credit user's wallet atomically in PostgreSQL
      const updateRes = await client.query(`
        UPDATE public.users 
        SET wallet_balance = wallet_balance + $1, updated_at = NOW() 
        WHERE id = $2 
        RETURNING wallet_balance
      `, [winAmount, userId]);

      const updatedBalance = Number(updateRes.rows[0]?.wallet_balance || 0);

      // Mark bet as won
      await client.query(`
        UPDATE public.bets 
        SET status = 'WON', multiplier = $1, win_amount = $2 
        WHERE id = $3
      `, [cashoutMultiplier, winAmount, targetBetId]);

      outcome = {
        success: true,
        winAmount,
        multiplier: cashoutMultiplier,
        balance: updatedBalance,
        newBalance: updatedBalance,
        message: `Cashout successful! Won KES ${winAmount.toFixed(2)} @ ${cashoutMultiplier.toFixed(2)}x.`,
      };
    });

    // If profit target is active for current round, re-evaluate remaining budget
    try {
      evaluateAndEnforceProfitTarget(state.cycleIndex).catch((err) =>
        console.warn('Background profit target eval on cashout failed:', err.message)
      );
    } catch {}

    return NextResponse.json(outcome || { success: false, message: 'Cashout could not be processed.' }, { status: 200 });
  } catch (error) {
    console.error('Game Cashout Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Cashout processing failed' },
      { status: 500 }
    );
  }
}
