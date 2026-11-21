import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getAuthSession } from '../../../../../lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const rows = await sql.query(`
      SELECT 
        id,
        stake,
        mode,
        target,
        win_chance,
        roll,
        won,
        multiplier,
        payout,
        server_seed_hash,
        created_at
      FROM public.dice_rolls
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 25
    `, [userId]);

    return NextResponse.json({
      success: true,
      history: rows.map((r) => ({
        id: r.id,
        stake: Number(r.stake),
        mode: r.mode,
        target: Number(r.target),
        winChance: Number(r.win_chance),
        roll: Number(r.roll),
        won: Boolean(r.won),
        multiplier: Number(r.multiplier),
        payout: Number(r.payout),
        serverSeedHash: r.server_seed_hash,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching Dice history:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
