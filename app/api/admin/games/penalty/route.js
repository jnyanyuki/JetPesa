import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { verifyAdminAuth } from '../../../../../lib/adminAuth';
import {
  getPenaltySettings,
  savePenaltySettings,
  PRESET_CONFIGURATIONS,
} from '../../../../../lib/games/penaltyEngine';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
    }

    const settings = await getPenaltySettings(true);

    // Fetch aggregate metrics for Penalty Shootout
    let stats = {
      totalRounds: 0,
      totalStaked: 0,
      totalWon: 0,
      netHouseProfit: 0,
      rtpRealized: 0,
      winRate: 0,
    };

    try {
      const rows = await sql.query(`
        SELECT 
          COUNT(*)::int AS total_rounds,
          COALESCE(SUM(stake), 0)::numeric AS total_staked,
          COALESCE(SUM(payout), 0)::numeric AS total_payout,
          COUNT(*) FILTER (WHERE status = 'WON')::int AS won_rounds
        FROM public.penalty_rounds
      `);

      if (rows && rows.length > 0) {
        const r = rows[0];
        const staked = Number(r.total_staked);
        const payout = Number(r.total_payout);
        const total = Number(r.total_rounds);
        const won = Number(r.won_rounds);

        stats = {
          totalRounds: total,
          totalStaked: staked,
          totalWon: payout,
          netHouseProfit: staked - payout,
          rtpRealized: staked > 0 ? parseFloat(((payout / staked) * 100).toFixed(1)) : 0,
          winRate: total > 0 ? parseFloat(((won / total) * 100).toFixed(1)) : 0,
        };
      }
    } catch (e) {
      console.warn('Could not query penalty stats:', e.message);
    }

    return NextResponse.json({
      success: true,
      settings,
      presets: PRESET_CONFIGURATIONS,
      stats,
    });
  } catch (error) {
    console.error('Error fetching admin penalty settings:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON payload.' }, { status: 400 });
    }

    const updated = await savePenaltySettings(body);

    return NextResponse.json({
      success: true,
      settings: updated,
      message: `Updated penalty series to ${updated.maxShots} steps (${updated.multipliers[0]}x to ${updated.multipliers[updated.maxShots - 1]}x).`,
    });
  } catch (error) {
    console.error('Error saving admin penalty settings:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 400 });
  }
}
