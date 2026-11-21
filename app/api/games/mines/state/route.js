import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getAuthSession } from '../../../../../lib/auth/server';
import { calculateMinesMultiplier } from '../../../../../lib/games/minesEngine';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // Check for any currently active Mines round
    const rows = await sql.query(`
      SELECT 
        id,
        stake,
        mines_count,
        revealed_tiles,
        current_multiplier,
        server_seed_hash,
        client_seed,
        nonce,
        status,
        created_at
      FROM public.mines_rounds
      WHERE user_id = $1 AND status = 'ACTIVE'
      LIMIT 1
    `, [userId]);

    if (rows.length === 0) {
      return NextResponse.json({ success: true, active: false });
    }

    const round = rows[0];
    const revealedTiles = round.revealed_tiles || [];
    const minesCount = Number(round.mines_count);
    const stake = Number(round.stake);
    const currentMultiplier = Number(round.current_multiplier);
    const nextMultiplier = calculateMinesMultiplier(minesCount, revealedTiles.length + 1);
    const currentPayout = Math.floor(stake * currentMultiplier * 100) / 100;

    return NextResponse.json({
      success: true,
      active: true,
      round: {
        id: round.id,
        stake,
        minesCount,
        revealedTiles,
        currentMultiplier,
        nextMultiplier,
        currentPayout,
        serverSeedHash: round.server_seed_hash,
        clientSeed: round.client_seed,
        nonce: round.nonce,
        createdAt: round.created_at,
      },
    });
  } catch (error) {
    console.error('Error fetching Mines state:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
