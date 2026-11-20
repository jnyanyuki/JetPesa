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

    const { deck, wager, autoCashout } = await request.json();

    const cleanDeck = String(deck || '').toUpperCase();
    if (cleanDeck !== 'A' && cleanDeck !== 'B') {
      throw new Error('Invalid deck specified.');
    }

    const amt = Math.floor(Number(wager));
    if (!amt || amt < 10) {
      throw new Error('Minimum wager is KES 10.');
    }

    const state = getCycleState();
    const targetCycle = state.isBettingPhase ? state.cycleIndex : state.cycleIndex + 1;
    const betId = `BET-${targetCycle}-${cleanDeck}-${userId}`;

    let updatedBalance = 0;

    await withTransaction(async (client) => {
      // 1. Ensure user row exists in public.users
      await client.query(`
        INSERT INTO public.users (id, email, display_name, wallet_balance)
        VALUES ($1, $2, $3, 0.00)
        ON CONFLICT (id) DO NOTHING
      `, [userId, session.user.email || null, session.user.name || null]);

      // 2. Check existing active bet for this round & deck
      const existing = await client.query(`
        SELECT id FROM public.bets 
        WHERE id = $1 AND status = 'ACTIVE' LIMIT 1
      `, [betId]);
      if (existing.rows.length > 0) {
        throw new Error(`You already have an active wager on Deck ${cleanDeck} for this round.`);
      }

      // 3. Atomically check and deduct wallet balance
      const deductRes = await client.query(`
        UPDATE public.users 
        SET wallet_balance = wallet_balance - $1, updated_at = NOW() 
        WHERE id = $2 AND wallet_balance >= $1 
        RETURNING wallet_balance
      `, [amt, userId]);

      if (deductRes.rows.length === 0) {
        // Fetch current balance to show helpful message
        const currentRes = await client.query(`SELECT wallet_balance FROM public.users WHERE id = $1`, [userId]);
        const curBal = Number(currentRes.rows[0]?.wallet_balance || 0);
        throw new Error(`Insufficient funds. Your wallet balance is KES ${curBal.toFixed(2)}.`);
      }

      updatedBalance = Number(deductRes.rows[0].wallet_balance);

      // 4. Record active bet
      await client.query(`
        INSERT INTO public.bets (id, user_id, round_id, deck, stake, auto_cashout, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET
          stake = EXCLUDED.stake,
          auto_cashout = EXCLUDED.auto_cashout,
          status = 'ACTIVE'
      `, [
        betId,
        userId,
        String(targetCycle),
        cleanDeck,
        amt,
        autoCashout ? parseFloat(Number(autoCashout).toFixed(2)) : null,
      ]);
    });

    return NextResponse.json({
      success: true,
      betId,
      cycleIndex: targetCycle,
      wager: amt,
      balance: updatedBalance,
      message: `Wager of KES ${amt} placed for round #${targetCycle}.`,
    });
  } catch (error) {
    console.error('Game Bet Error:', error);
    const status = error.message?.includes('Authentication') ? 401 : 400;
    return NextResponse.json(
      { success: false, message: error.message },
      { status }
    );
  }
}
