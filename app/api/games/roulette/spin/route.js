import { NextResponse } from 'next/server';
import { withTransaction } from '../../../../../lib/db';
import { getAuthSession } from '../../../../../lib/auth/server';
import { getGameSettings } from '../../../../../lib/games/gameSettingsManager';
import {
  ROULETTE_CONFIG,
  resolveRouletteSpin,
  evaluateRouletteBets,
  generateRouletteKeyPair,
} from '../../../../../lib/games/rouletteEngine';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, code: 'UNAUTHORIZED', message: 'Sign in to play Turbo Mini-Roulette.' }, { status: 401 });
    }
    const userId = session.user.id;

    let body = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, code: 'INVALID_JSON', message: 'Malformed JSON payload.' }, { status: 400 });
    }

    const settings = await getGameSettings('roulette');
    if (settings?.isPaused) {
      return NextResponse.json(
        { success: false, code: 'GAME_PAUSED', message: 'Turbo Mini-Roulette is temporarily paused for scheduled maintenance.' },
        { status: 403 }
      );
    }

    const minBet = Number(settings?.minBet) || ROULETTE_CONFIG.minBet;
    const maxBet = Number(settings?.maxBet) || ROULETTE_CONFIG.maxBet;

    const bets = Array.isArray(body.bets) ? body.bets : [];
    if (bets.length === 0) {
      return NextResponse.json(
        { success: false, code: 'NO_BETS', message: 'Place at least one chip on the roulette layout.' },
        { status: 400 }
      );
    }

    let calculatedTotalStake = 0;
    for (const b of bets) {
      const amt = Number(b.amount);
      if (isNaN(amt) || amt < minBet) {
        return NextResponse.json(
          { success: false, code: 'MIN_BET', message: `Minimum bet per placement is KES ${minBet}.` },
          { status: 400 }
        );
      }
      calculatedTotalStake += amt;
    }

    if (calculatedTotalStake > maxBet) {
      return NextResponse.json(
        { success: false, code: 'MAX_TOTAL_WAGER', message: `Total spin wager cannot exceed KES ${maxBet.toLocaleString()}.` },
        { status: 400 }
      );
    }

    if (calculatedTotalStake > ROULETTE_CONFIG.maxBet) {
      return NextResponse.json(
        { success: false, code: 'MAX_BET', message: `Maximum total wager is KES ${ROULETTE_CONFIG.maxBet.toLocaleString()}.` },
        { status: 400 }
      );
    }

    const { serverSeed, serverSeedHash, clientSeed } = generateRouletteKeyPair();
    const nonce = 1;

    // 1. Resolve Provably Fair Winning Number
    const spinOutcome = resolveRouletteSpin(serverSeed, clientSeed, nonce);

    // 2. Evaluate all bets
    const evalResult = evaluateRouletteBets(spinOutcome.number, bets);
    const { totalStake, totalPayout, netProfit, evaluatedBets } = evalResult;

    const betId = `BET-ROULETTE-${Date.now()}-${userId.substring(0, 8)}`;

    const txResult = await withTransaction(async (client) => {
      // 1. Ensure user row exists
      await client.query(`
        INSERT INTO public.users (id, email, display_name, wallet_balance)
        VALUES ($1, $2, $3, 0.00)
        ON CONFLICT (id) DO NOTHING
      `, [userId, session.user.email || null, session.user.name || null]);

      // 2. Deduct total stake atomically
      const deductRes = await client.query(`
        UPDATE public.users 
        SET wallet_balance = wallet_balance - $1, updated_at = NOW() 
        WHERE id = $2 AND wallet_balance >= $1 
        RETURNING wallet_balance
      `, [totalStake, userId]);

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

      let finalBalance = Number(deductRes.rows[0].wallet_balance);

      // 3. Credit payout if player won anything
      if (totalPayout > 0) {
        const creditRes = await client.query(`
          UPDATE public.users 
          SET wallet_balance = wallet_balance + $1, updated_at = NOW() 
          WHERE id = $2 
          RETURNING wallet_balance
        `, [totalPayout, userId]);
        finalBalance = Number(creditRes.rows[0].wallet_balance);
      }

      // 4. Record spin in public.roulette_spins
      await client.query(`
        INSERT INTO public.roulette_spins (
          user_id, total_stake, bets, winning_number, winning_color,
          total_payout, net_profit, status, server_seed,
          server_seed_hash, client_seed, nonce
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, 'COMPLETED', $8, $9, $10, $11
        )
      `, [
        userId,
        totalStake,
        JSON.stringify(evaluatedBets),
        spinOutcome.number,
        spinOutcome.color,
        totalPayout,
        netProfit,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
      ]);

      // 5. Record bet in public.bets for platform history
      const betStatus = totalPayout > 0 ? 'WON' : 'LOST';
      const effectiveMultiplier = totalStake > 0 ? parseFloat((totalPayout / totalStake).toFixed(2)) : 0;

      await client.query(`
        INSERT INTO public.bets (
          id, user_id, round_id, stake, multiplier, win_amount, status, deck, game_type
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, 'ROULETTE', 'roulette'
        )
      `, [
        betId,
        userId,
        spinId,
        totalStake,
        effectiveMultiplier,
        totalPayout,
        betStatus,
      ]);

      return {
        error: false,
        updatedBalance: finalBalance,
      };
    });

    if (txResult.error) {
      return NextResponse.json({ success: false, code: txResult.code, message: txResult.message }, { status: txResult.status });
    }

    return NextResponse.json({
      success: true,
      winningNumber: spinOutcome.number,
      winningColor: spinOutcome.color,
      wheelIndex: spinOutcome.wheelIndex,
      totalStake,
      totalPayout,
      netProfit,
      isWin: totalPayout > 0,
      evaluatedBets,
      updatedBalance: txResult.updatedBalance,
      serverSeed,
      serverSeedHash,
      clientSeed,
      nonce,
    });
  } catch (error) {
    console.error('Error spinning roulette wheel:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
