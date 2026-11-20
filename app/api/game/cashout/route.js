import { NextResponse } from 'next/server';
import { withTransaction } from '../../../../lib/db';
import { getAuthSession } from '../../../../lib/auth/server';
import { getCycleState } from '../../../../lib/gameEngine';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Authentication required. Please sign in.' }, { status: 401 });
    }
    const userId = session.user.id;

    const { betId, deck } = await request.json();
    const cleanDeck = deck ? String(deck).toUpperCase() : null;

    const state = getCycleState();

    if (state.isBettingPhase) {
      throw new Error('Flight has not departed yet.');
    }

    const targetBetId = betId || `BET-${state.cycleIndex}-${cleanDeck}-${userId}`;

    let winAmount = 0;
    let cashoutMultiplier = 0;
    let updatedBalance = 0;

    await withTransaction(async (client) => {
      const betRes = await client.query(`
        SELECT id, user_id, round_id, deck, stake, auto_cashout, status
        FROM public.bets
        WHERE id = $1
        FOR UPDATE
      `, [targetBetId]);

      if (betRes.rows.length === 0) {
        throw new Error('Active bet record not found.');
      }

      const bet = betRes.rows[0];
      if (bet.user_id !== userId) {
        throw new Error('Unauthorized bet access.');
      }

      if (bet.status !== 'ACTIVE') {
        throw new Error(`Bet has already been resolved as ${bet.status}.`);
      }

      if (String(bet.round_id) !== String(state.cycleIndex)) {
        throw new Error('This wager belongs to a different flight round.');
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
        throw new Error(`Flight flew away at ${state.crashPoint.toFixed(2)}x. Cashout missed.`);
      }

      cashoutMultiplier = targetMultiplier;
      winAmount = Math.floor(betWager * cashoutMultiplier * 100) / 100;

      // Credit user's wallet atomically in PostgreSQL
      const updateRes = await client.query(`
        UPDATE public.users 
        SET wallet_balance = wallet_balance + $1, updated_at = NOW() 
        WHERE id = $2 
        RETURNING wallet_balance
      `, [winAmount, userId]);

      updatedBalance = Number(updateRes.rows[0]?.wallet_balance || 0);

      // Mark bet as won
      await client.query(`
        UPDATE public.bets 
        SET status = 'WON', multiplier = $1, win_amount = $2 
        WHERE id = $3
      `, [cashoutMultiplier, winAmount, targetBetId]);
    });

    return NextResponse.json({
      success: true,
      winAmount,
      multiplier: cashoutMultiplier,
      balance: updatedBalance,
      message: `Cashout successful! Won KES ${winAmount.toFixed(2)} @ ${cashoutMultiplier.toFixed(2)}x.`,
    });
  } catch (error) {
    console.error('Game Cashout Error:', error);
    const status = error.message?.includes('Authentication') ? 401 : 400;
    return NextResponse.json(
      { success: false, message: error.message },
      { status }
    );
  }
}
