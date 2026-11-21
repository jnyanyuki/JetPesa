import { NextResponse } from 'next/server';
import { withTransaction } from '../../../../../lib/db';
import { getAuthSession } from '../../../../../lib/auth/server';
import { getGameSettings } from '../../../../../lib/games/gameSettingsManager';
import {
  PLINKO_ROWS,
  PLINKO_RISKS,
  DEFAULT_PLINKO_CONFIG,
  generatePlinkoPath,
  generatePlinkoKeyPair,
} from '../../../../../lib/games/plinkoEngine';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, code: 'UNAUTHORIZED', message: 'Sign in to drop discs in Plinko.' }, { status: 401 });
    }
    const userId = session.user.id;

    let body = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, code: 'INVALID_JSON', message: 'Malformed JSON payload.' }, { status: 400 });
    }

    const settings = await getGameSettings('plinko');
    if (settings?.isPaused) {
      return NextResponse.json(
        { success: false, code: 'GAME_PAUSED', message: 'JetPesa Plinko is temporarily paused for scheduled maintenance.' },
        { status: 403 }
      );
    }

    const minBet = Number(settings?.minBet) || DEFAULT_PLINKO_CONFIG.minBet;
    const maxBet = Number(settings?.maxBet) || DEFAULT_PLINKO_CONFIG.maxBet;

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

    const rows = Number(body.rows) || DEFAULT_PLINKO_CONFIG.defaultRows;
    if (!PLINKO_ROWS.includes(rows)) {
      return NextResponse.json(
        { success: false, code: 'INVALID_ROWS', message: `Selectable rows: ${PLINKO_ROWS.join(', ')}` },
        { status: 400 }
      );
    }

    const risk = String(body.risk || DEFAULT_PLINKO_CONFIG.defaultRisk).toLowerCase();
    if (!PLINKO_RISKS.includes(risk)) {
      return NextResponse.json(
        { success: false, code: 'INVALID_RISK', message: `Selectable risk tiers: ${PLINKO_RISKS.join(', ')}` },
        { status: 400 }
      );
    }

    const dropId = `PLINKO-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const betId = `BET-${dropId}-${userId}`;
    const { serverSeed, serverSeedHash, clientSeed } = generatePlinkoKeyPair();
    const nonce = Math.floor(Math.random() * 1000000) + 1;

    // Deterministic Provably Fair outcome
    const { path, binIndex, multiplier } = generatePlinkoPath(
      serverSeed,
      clientSeed,
      nonce,
      rows,
      risk
    );

    const payout = Math.floor(wager * multiplier * 100) / 100;
    const betStatus = multiplier >= 1.0 ? 'WON' : 'LOST';

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

      // 3. Credit payout if any
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

      // 4. Record drop in public.plinko_drops
      await client.query(`
        INSERT INTO public.plinko_drops (
          id, user_id, stake, rows, risk, bin_index, path, multiplier, payout,
          server_seed, server_seed_hash, client_seed, nonce
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        dropId,
        userId,
        wager,
        rows,
        risk,
        binIndex,
        JSON.stringify(path),
        multiplier,
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
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PLINKO', 'plinko')
      `, [betId, userId, dropId, wager, multiplier, payout, betStatus]);

      return {
        success: true,
        dropId,
        stake: wager,
        rows,
        risk,
        binIndex,
        path,
        multiplier,
        payout,
        newBalance: finalBalance,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
      };
    });

    if (result.error) {
      return NextResponse.json({ success: false, code: result.code, message: result.message }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error executing Plinko drop:', error);
    return NextResponse.json({ success: false, message: error.message || 'Internal server error' }, { status: 500 });
  }
}
