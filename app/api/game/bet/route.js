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

    const { deck, wager, autoCashout, roundId, gameType, game_type } = body;
    const targetGameType = String(gameType || game_type || 'aviator').toLowerCase();

    const cleanDeck = String(deck || '').toUpperCase();
    if (cleanDeck !== 'A' && cleanDeck !== 'B') {
      return NextResponse.json(
        { success: false, code: 'INVALID_DECK', message: 'Invalid deck specified. Must be A or B.' },
        { status: 400 }
      );
    }

    const amt = Math.floor(Number(wager));
    if (!amt || amt < 10) {
      return NextResponse.json(
        { success: false, code: 'MIN_WAGER', message: 'Minimum wager is KES 10.' },
        { status: 400 }
      );
    }

    const state = getCycleState();
    // Use explicit roundId if valid and in future/current, else derive from current cycle state
    const targetCycle = roundId && Number(roundId) >= state.cycleIndex
      ? Number(roundId)
      : (state.isBettingPhase ? state.cycleIndex : state.cycleIndex + 1);
    const betId = `BET-${targetCycle}-${cleanDeck}-${userId}`;

    let updatedBalance = 0;

    const result = await withTransaction(async (client) => {
      // 1. Ensure user row exists in public.users
      await client.query(`
        INSERT INTO public.users (id, email, display_name, wallet_balance)
        VALUES ($1, $2, $3, 0.00)
        ON CONFLICT (id) DO NOTHING
      `, [userId, session.user.email || null, session.user.name || null]);

      // 2. Check if active bet already exists for this round & deck (Idempotent guard)
      const existing = await client.query(`
        SELECT id, stake FROM public.bets 
        WHERE id = $1 AND status = 'ACTIVE' LIMIT 1
      `, [betId]);

      if (existing.rows.length > 0) {
        const balRes = await client.query(`SELECT wallet_balance FROM public.users WHERE id = $1`, [userId]);
        updatedBalance = Number(balRes.rows[0]?.wallet_balance || 0);
        return {
          success: true,
          alreadyActive: true,
          betId,
          cycleIndex: targetCycle,
          wager: Number(existing.rows[0].stake),
          balance: updatedBalance,
          newBalance: updatedBalance,
          message: `Wager on Deck ${cleanDeck} is already confirmed for round #${targetCycle}.`,
        };
      }

      // 3. Atomically check and deduct wallet balance
      const deductRes = await client.query(`
        UPDATE public.users 
        SET wallet_balance = wallet_balance - $1, updated_at = NOW() 
        WHERE id = $2 AND wallet_balance >= $1 
        RETURNING wallet_balance
      `, [amt, userId]);

      if (deductRes.rows.length === 0) {
        const currentRes = await client.query(`SELECT wallet_balance FROM public.users WHERE id = $1`, [userId]);
        const curBal = Number(currentRes.rows[0]?.wallet_balance || 0);
        return {
          success: false,
          code: 'INSUFFICIENT_FUNDS',
          balance: curBal,
          message: `Insufficient funds. Your wallet balance is KES ${curBal.toFixed(2)}.`,
        };
      }

      updatedBalance = Number(deductRes.rows[0].wallet_balance);

      // 4. Record active bet
      await client.query(`
        INSERT INTO public.bets (id, user_id, round_id, deck, stake, auto_cashout, status, game_type)
        VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7)
        ON CONFLICT (id) DO UPDATE SET
          stake = EXCLUDED.stake,
          auto_cashout = EXCLUDED.auto_cashout,
          status = 'ACTIVE',
          game_type = EXCLUDED.game_type
      `, [
        betId,
        userId,
        String(targetCycle),
        cleanDeck,
        amt,
        autoCashout ? parseFloat(Number(autoCashout).toFixed(2)) : null,
        targetGameType,
      ]);

      return {
        success: true,
        betId,
        cycleIndex: targetCycle,
        wager: amt,
        balance: updatedBalance,
        newBalance: updatedBalance,
        message: `Wager of KES ${amt} placed for round #${targetCycle}.`,
      };
    });

    // If house profit target is configured for this round, re-evaluate and enforce crash ceiling
    try {
      evaluateAndEnforceProfitTarget(targetCycle).catch((err) =>
        console.warn('Background profit target eval on bet failed:', err.message)
      );
    } catch {}

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Game Bet Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to place wager' },
      { status: 500 }
    );
  }
}
