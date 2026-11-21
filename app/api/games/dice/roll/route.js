import { NextResponse } from 'next/server';
import { withTransaction } from '../../../../../lib/db';
import { getAuthSession } from '../../../../../lib/auth/server';
import {
  DICE_CONFIG,
  resolveDiceRoll,
  generateDiceKeyPair,
} from '../../../../../lib/games/diceEngine';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, code: 'UNAUTHORIZED', message: 'Sign in to roll the dice.' }, { status: 401 });
    }
    const userId = session.user.id;

    let body = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, code: 'INVALID_JSON', message: 'Malformed JSON payload.' }, { status: 400 });
    }

    const wager = Math.floor(Number(body.wager || body.stake));
    if (!wager || wager < DICE_CONFIG.minBet) {
      return NextResponse.json(
        { success: false, code: 'MIN_WAGER', message: `Minimum wager is KES ${DICE_CONFIG.minBet}.` },
        { status: 400 }
      );
    }

    if (wager > DICE_CONFIG.maxBet) {
      return NextResponse.json(
        { success: false, code: 'MAX_WAGER', message: `Maximum wager is KES ${DICE_CONFIG.maxBet.toLocaleString()}.` },
        { status: 400 }
      );
    }

    const mode = String(body.mode || 'under').toLowerCase();
    if (mode !== 'under' && mode !== 'over') {
      return NextResponse.json(
        { success: false, code: 'INVALID_MODE', message: 'Mode must be either "under" or "over".' },
        { status: 400 }
      );
    }

    const target = parseFloat(Number(body.target || 50.0).toFixed(2));
    if (isNaN(target) || target < DICE_CONFIG.minTarget || target > DICE_CONFIG.maxTarget) {
      return NextResponse.json(
        {
          success: false,
          code: 'INVALID_TARGET',
          message: `Target must be between ${DICE_CONFIG.minTarget} and ${DICE_CONFIG.maxTarget}.`,
        },
        { status: 400 }
      );
    }

    const rollId = `DICE-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const betId = `BET-${rollId}-${userId}`;
    const { serverSeed, serverSeedHash, clientSeed } = generateDiceKeyPair();
    const nonce = Math.floor(Math.random() * 1000000) + 1;

    // Resolve deterministic Provably Fair roll
    const outcome = resolveDiceRoll(serverSeed, clientSeed, nonce, mode, target);
    const payout = outcome.won ? Math.floor(wager * outcome.multiplier * 100) / 100 : 0.00;
    const betStatus = outcome.won ? 'WON' : 'LOST';

    const result = await withTransaction(async (client) => {
      // 1. Ensure user exists
      await client.query(`
        INSERT INTO public.users (id, email, display_name, wallet_balance)
        VALUES ($1, $2, $3, 0.00)
        ON CONFLICT (id) DO NOTHING
      `, [userId, session.user.email || null, session.user.name || null]);

      // 2. Deduct wager atomically
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

      // 3. Credit payout if won
      let finalBalance = Number(deductRes.rows[0].wallet_balance);
      if (payout > 0) {
        const creditRes = await client.query(`
          UPDATE public.users
          SET wallet_balance = wallet_balance + $1, updated_at = NOW()
          WHERE id = $2
          RETURNING wallet_balance
        `, [payout, userId]);
        finalBalance = Number(creditRes.rows[0]?.wallet_balance || finalBalance);
      }

      // 4. Record in public.dice_rolls
      await client.query(`
        INSERT INTO public.dice_rolls (
          id, user_id, stake, mode, target, win_chance, roll, won,
          multiplier, payout, server_seed, server_seed_hash, client_seed, nonce
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        rollId,
        userId,
        wager,
        mode,
        outcome.target,
        outcome.winChance,
        outcome.roll,
        outcome.won,
        outcome.multiplier,
        payout,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
      ]);

      // 5. Record bet in public.bets
      await client.query(`
        INSERT INTO public.bets (
          id, user_id, round_id, stake, multiplier, win_amount, status, deck, game_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'DICE', 'dice')
      `, [betId, userId, rollId, wager, outcome.multiplier, payout, betStatus]);

      return {
        success: true,
        rollId,
        stake: wager,
        mode,
        target: outcome.target,
        winChance: outcome.winChance,
        roll: outcome.roll,
        won: outcome.won,
        multiplier: outcome.multiplier,
        payout,
        newBalance: finalBalance,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
        message: outcome.won
          ? `YOU WON! Rolled ${outcome.roll.toFixed(2)}. Won KES ${payout.toLocaleString()} (${outcome.multiplier}x)!`
          : `ROLLED ${outcome.roll.toFixed(2)}. Better luck next roll!`,
      };
    });

    if (result.error) {
      return NextResponse.json({ success: false, code: result.code, message: result.message }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error executing dice roll:', error);
    return NextResponse.json({ success: false, message: error.message || 'Internal server error' }, { status: 500 });
  }
}
