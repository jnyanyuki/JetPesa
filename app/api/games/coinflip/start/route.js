import { NextResponse } from 'next/server';
import { withTransaction } from '../../../../../lib/db';
import { getAuthSession } from '../../../../../lib/auth/server';
import { getGameSettings } from '../../../../../lib/games/gameSettingsManager';
import {
  COINFLIP_CONFIG,
  generateCoinflipKeyPair,
  getCoinflipMultiplier,
} from '../../../../../lib/games/coinflipEngine';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, code: 'UNAUTHORIZED', message: 'Sign in to play Turbo Coinflip.' }, { status: 401 });
    }
    const userId = session.user.id;

    let body = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, code: 'INVALID_JSON', message: 'Malformed JSON payload.' }, { status: 400 });
    }

    const settings = await getGameSettings('coinflip');
    if (settings?.isPaused) {
      return NextResponse.json(
        { success: false, code: 'GAME_PAUSED', message: 'Turbo Coinflip is temporarily paused for scheduled maintenance.' },
        { status: 403 }
      );
    }

    const minBet = Number(settings?.minBet) || COINFLIP_CONFIG.minBet;
    const maxBet = Number(settings?.maxBet) || COINFLIP_CONFIG.maxBet;

    const wager = Math.floor(Number(body.wager || body.stake));
    if (!wager || wager < minBet) {
      return NextResponse.json(
        { success: false, code: 'MIN_WAGER', message: `Minimum wager is KES ${minBet}.` },
        { status: 400 }
      );
    }

    if (wager > maxBet) {
      return NextResponse.json(
        { success: false, code: 'MAX_WAGER', message: `Maximum wager is KES ${maxBet.toLocaleString()}.` },
        { status: 400 }
      );
    }

    const roundId = `COIN-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const betId = `BET-${roundId}-${userId}`;
    const { serverSeed, serverSeedHash, clientSeed } = generateCoinflipKeyPair();
    const nonce = 1;
    const nextMultiplier = getCoinflipMultiplier(1);

    const result = await withTransaction(async (client) => {
      // 1. Check if user already has an active coinflip round
      const existing = await client.query(`
        SELECT id FROM public.coinflip_rounds 
        WHERE user_id = $1 AND status = 'ACTIVE' LIMIT 1
      `, [userId]);

      if (existing.rows.length > 0) {
        return {
          error: true,
          status: 400,
          code: 'ACTIVE_GAME_EXISTS',
          message: 'You already have an active coinflip in progress. Finish it or cash out first.',
        };
      }

      // 2. Ensure user exists
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

      // 4. Create active Coinflip round
      await client.query(`
        INSERT INTO public.coinflip_rounds (
          id, user_id, stake, current_streak, current_multiplier, flips_history,
          status, server_seed, server_seed_hash, client_seed, nonce
        ) VALUES ($1, $2, $3, 0, 1.00, '[]'::jsonb, 'ACTIVE', $4, $5, $6, $7)
      `, [roundId, userId, wager, serverSeed, serverSeedHash, clientSeed, nonce]);

      // 5. Record in public.bets
      await client.query(`
        INSERT INTO public.bets (
          id, user_id, round_id, stake, multiplier, win_amount, status, deck, game_type
        ) VALUES ($1, $2, $3, $4, 1.00, 0.00, 'ACTIVE', 'COINFLIP', 'coinflip')
      `, [betId, userId, roundId, wager]);

      return {
        success: true,
        roundId,
        stake: wager,
        currentStreak: 0,
        currentMultiplier: 1.00,
        nextMultiplier,
        serverSeedHash,
        newBalance: updatedBalance,
        message: 'Coinflip ready! Choose Heads or Tails to spin.',
      };
    });

    if (result.error) {
      return NextResponse.json({ success: false, code: result.code, message: result.message }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error starting Coinflip:', error);
    return NextResponse.json({ success: false, message: error.message || 'Internal server error' }, { status: 500 });
  }
}
