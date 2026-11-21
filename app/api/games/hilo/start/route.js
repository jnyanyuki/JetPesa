import { NextResponse } from 'next/server';
import { withTransaction } from '../../../../../lib/db';
import { getAuthSession } from '../../../../../lib/auth/server';
import {
  HILO_CONFIG,
  dealHiloCard,
  calculateHiloOdds,
  generateHiloKeyPair,
} from '../../../../../lib/games/hiloEngine';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, code: 'UNAUTHORIZED', message: 'Sign in to play Hi-Lo Card Duel.' }, { status: 401 });
    }
    const userId = session.user.id;

    let body = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, code: 'INVALID_JSON', message: 'Malformed JSON payload.' }, { status: 400 });
    }

    const wager = Math.floor(Number(body.wager || body.stake));
    if (!wager || wager < HILO_CONFIG.minBet) {
      return NextResponse.json(
        { success: false, code: 'MIN_WAGER', message: `Minimum wager is KES ${HILO_CONFIG.minBet}.` },
        { status: 400 }
      );
    }

    if (wager > HILO_CONFIG.maxBet) {
      return NextResponse.json(
        { success: false, code: 'MAX_WAGER', message: `Maximum wager is KES ${HILO_CONFIG.maxBet.toLocaleString()}.` },
        { status: 400 }
      );
    }

    const { serverSeed, serverSeedHash, clientSeed } = generateHiloKeyPair();
    const nonce = 1;
    // Deal the starting face-up card deterministically (step 0)
    const startingCard = dealHiloCard(serverSeed, clientSeed, nonce, 0);
    const initialOdds = calculateHiloOdds(startingCard.rank);
    const betId = `BET-HILO-${Date.now()}-${userId.substring(0, 8)}`;

    const result = await withTransaction(async (client) => {
      // 1. Check for existing active game
      const existing = await client.query(`
        SELECT id FROM public.hilo_rounds 
        WHERE user_id = $1 AND status = 'ACTIVE' LIMIT 1
      `, [userId]);

      if (existing.rows.length > 0) {
        return {
          error: true,
          status: 400,
          code: 'ACTIVE_GAME_EXISTS',
          message: 'You already have an active card duel in progress. Play it through or cash out.',
        };
      }

      // 2. Ensure user row exists
      await client.query(`
        INSERT INTO public.users (id, email, display_name, wallet_balance)
        VALUES ($1, $2, $3, 0.00)
        ON CONFLICT (id) DO NOTHING
      `, [userId, session.user.email || null, session.user.name || null]);

      // 3. Deduct wager atomically
      const deductRes = await client.query(`
        UPDATE public.users 
        SET wallet_balance = wallet_balance - $1, updated_at = NOW() 
        WHERE id = $2 AND wallet_balance >= $1 
        RETURNING wallet_balance
      `, [wager, userId]);

      if (deductRes.rows.length === 0) {
        const curBal = await client.query(`SELECT wallet_balance FROM public.users WHERE id = $1`, [userId]);
        const bal = Number(curBal.rows[0]?.wallet_balance || 0);
        return {
          error: true,
          status: 400,
          code: 'INSUFFICIENT_FUNDS',
          message: `Insufficient funds. Your wallet balance is KES ${bal.toFixed(2)}.`,
        };
      }

      const updatedBalance = Number(deductRes.rows[0].wallet_balance);

      // 4. Create active Hi-Lo round
      const roundRes = await client.query(`
        INSERT INTO public.hilo_rounds (
          user_id, stake, current_card, card_history, current_step,
          current_multiplier, skips_left, status, server_seed,
          server_seed_hash, client_seed, nonce
        ) VALUES (
          $1, $2, $3, $4, 0, 1.0000, $5, 'ACTIVE', $6, $7, $8, $9
        ) RETURNING id, created_at
      `, [
        userId,
        wager,
        JSON.stringify(startingCard),
        JSON.stringify([{ ...startingCard, isStart: true }]),
        HILO_CONFIG.maxSkips,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
      ]);

      const roundId = roundRes.rows[0].id;

      // 5. Insert bet record for auditing & history
      await client.query(`
        INSERT INTO public.bets (
          id, user_id, amount, bet_type, multiplier, payout, status, game_type, created_at
        ) VALUES (
          $1, $2, $3, 'hilo', 1.00, 0.00, 'pending', 'hilo', NOW()
        )
      `, [betId, userId, wager]);

      return {
        error: false,
        roundId,
        updatedBalance,
        createdAt: roundRes.rows[0].created_at,
      };
    });

    if (result.error) {
      return NextResponse.json({ success: false, code: result.code, message: result.message }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      round: {
        id: result.roundId,
        stake: wager,
        currentCard: startingCard,
        cardHistory: [{ ...startingCard, isStart: true }],
        currentStep: 0,
        currentMultiplier: 1.0,
        skipsLeft: HILO_CONFIG.maxSkips,
        odds: initialOdds,
        serverSeedHash,
        clientSeed,
        nonce,
        createdAt: result.createdAt,
      },
      updatedBalance: result.updatedBalance,
    });
  } catch (error) {
    console.error('Error starting Hi-Lo round:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
