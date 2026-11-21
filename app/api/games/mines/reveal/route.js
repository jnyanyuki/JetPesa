import { NextResponse } from 'next/server';
import { withTransaction } from '../../../../../lib/db';
import { getAuthSession } from '../../../../../lib/auth/server';
import {
  TOTAL_TILES,
  calculateMinesMultiplier,
} from '../../../../../lib/games/minesEngine';

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

    const tileIndex = Number(body.tileIndex);
    if (isNaN(tileIndex) || tileIndex < 0 || tileIndex >= TOTAL_TILES) {
      return NextResponse.json({ success: false, code: 'INVALID_TILE', message: 'Tile index must be between 0 and 24.' }, { status: 400 });
    }

    const result = await withTransaction(async (client) => {
      // 1. Fetch active round
      const roundRes = await client.query(`
        SELECT 
          id, stake, mines_count, mine_positions, revealed_tiles,
          current_multiplier, status, server_seed, client_seed, nonce
        FROM public.mines_rounds
        WHERE user_id = $1 AND status = 'ACTIVE'
        FOR UPDATE
      `, [userId]);

      if (roundRes.rows.length === 0) {
        return {
          error: true,
          status: 404,
          code: 'NO_ACTIVE_ROUND',
          message: 'No active Mines game found. Please place a bet to start a new round.',
        };
      }

      const round = roundRes.rows[0];
      const roundId = round.id;
      const stake = Number(round.stake);
      const minesCount = Number(round.mines_count);
      const minePositions = round.mine_positions || [];
      const revealedTiles = round.revealed_tiles || [];

      // Check if tile was already revealed
      if (revealedTiles.includes(tileIndex)) {
        return {
          error: true,
          status: 400,
          code: 'ALREADY_REVEALED',
          message: 'This tile has already been revealed.',
        };
      }

      // Check if player hit a MINE
      const isMine = minePositions.includes(tileIndex);

      if (isMine) {
        // === MINE EXPLOSION ===
        await client.query(`
          UPDATE public.mines_rounds
          SET status = 'BUSTED', updated_at = NOW()
          WHERE id = $1
        `, [roundId]);

        await client.query(`
          UPDATE public.bets
          SET status = 'LOST', multiplier = 0, win_amount = 0
          WHERE round_id = $1 AND user_id = $2
        `, [roundId, userId]);

        return {
          success: true,
          hit: 'mine',
          tileIndex,
          status: 'BUSTED',
          minePositions,
          serverSeed: round.server_seed,
          clientSeed: round.client_seed,
          nonce: round.nonce,
          message: 'BOOM! You uncovered a mine.',
        };
      }

      // === GEM REVEALED ===
      const newRevealed = [...revealedTiles, tileIndex];
      const newMultiplier = calculateMinesMultiplier(minesCount, newRevealed.length);
      const safeTilesTotal = TOTAL_TILES - minesCount;
      const isBoardCleared = newRevealed.length === safeTilesTotal;

      if (isBoardCleared) {
        // === BOARD CLEARED (MAX WIN!) ===
        const finalPayout = Math.floor(stake * newMultiplier * 100) / 100;

        const creditRes = await client.query(`
          UPDATE public.users
          SET wallet_balance = wallet_balance + $1, updated_at = NOW()
          WHERE id = $2
          RETURNING wallet_balance
        `, [finalPayout, userId]);

        const newBalance = Number(creditRes.rows[0]?.wallet_balance || 0);

        await client.query(`
          UPDATE public.mines_rounds
          SET 
            status = 'WON', 
            revealed_tiles = $1, 
            current_multiplier = $2, 
            payout = $3, 
            updated_at = NOW()
          WHERE id = $4
        `, [newRevealed, newMultiplier, finalPayout, roundId]);

        await client.query(`
          UPDATE public.bets
          SET status = 'WON', multiplier = $1, win_amount = $2
          WHERE round_id = $3 AND user_id = $4
        `, [newMultiplier, finalPayout, roundId, userId]);

        return {
          success: true,
          hit: 'gem',
          tileIndex,
          revealedTiles: newRevealed,
          revealedCount: newRevealed.length,
          multiplier: newMultiplier,
          payout: finalPayout,
          isBoardCleared: true,
          status: 'WON',
          minePositions,
          serverSeed: round.server_seed,
          newBalance,
          message: `UNBELIEVABLE! All gems cleared! Won KES ${finalPayout.toLocaleString()} (${newMultiplier}x)!`,
        };
      }

      // Regular safe gem uncovered
      const nextMultiplier = calculateMinesMultiplier(minesCount, newRevealed.length + 1);
      const currentPayout = Math.floor(stake * newMultiplier * 100) / 100;

      await client.query(`
        UPDATE public.mines_rounds
        SET 
          revealed_tiles = $1, 
          current_multiplier = $2, 
          updated_at = NOW()
        WHERE id = $3
      `, [newRevealed, newMultiplier, roundId]);

      return {
        success: true,
        hit: 'gem',
        tileIndex,
        revealedTiles: newRevealed,
        revealedCount: newRevealed.length,
        currentMultiplier: newMultiplier,
        nextMultiplier,
        currentPayout,
        status: 'ACTIVE',
        message: `Gem uncovered! Multiplier increased to ${newMultiplier}x. Cash out now or pick again!`,
      };
    });

    if (result.error) {
      return NextResponse.json({ success: false, code: result.code, message: result.message }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error revealing Mines tile:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
