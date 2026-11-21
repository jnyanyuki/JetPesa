import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getAuthSession } from '../../../../../lib/auth/server';
import {
  getPenaltySettings,
  getPenaltyMultiplier,
} from '../../../../../lib/games/penaltyEngine';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const settings = await getPenaltySettings();
    const session = await getAuthSession(request);

    if (!session?.user?.id) {
      return NextResponse.json({
        success: true,
        active: false,
        settings,
      });
    }

    const userId = session.user.id;

    const rows = await sql.query(`
      SELECT 
        id,
        stake,
        current_streak,
        current_multiplier,
        shots_history,
        server_seed_hash,
        client_seed,
        nonce,
        status,
        created_at
      FROM public.penalty_rounds
      WHERE user_id = $1 AND status = 'ACTIVE'
      LIMIT 1
    `, [userId]);

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        active: false,
        settings,
      });
    }

    const round = rows[0];
    const stake = Number(round.stake);
    const currentStreak = Number(round.current_streak);
    const currentMultiplier = Number(round.current_multiplier);
    const nextMultiplier = getPenaltyMultiplier(currentStreak + 1, settings.multipliers);
    const currentPayout = Math.floor(stake * currentMultiplier * 100) / 100;

    return NextResponse.json({
      success: true,
      active: true,
      settings,
      round: {
        id: round.id,
        stake,
        currentStreak,
        currentMultiplier,
        nextMultiplier,
        currentPayout,
        shotsHistory: round.shots_history || [],
        serverSeedHash: round.server_seed_hash,
        clientSeed: round.client_seed,
        nonce: round.nonce,
        createdAt: round.created_at,
      },
    });
  } catch (error) {
    console.error('Error fetching Penalty state:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
