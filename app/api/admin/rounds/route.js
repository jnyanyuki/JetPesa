import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { verifyAdminAuth } from '../../../../lib/adminAuth';
import { getUpcomingRounds, setMemoryOverride, removeMemoryOverride } from '../../../../lib/gameEngine';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const count = Math.min(50, Math.max(1, parseInt(searchParams.get('count') || '6', 10)));
    const startNonce = searchParams.get('startNonce') ? parseInt(searchParams.get('startNonce'), 10) : null;
    const pastCount = Math.min(20, Math.max(1, parseInt(searchParams.get('pastCount') || '5', 10)));

    // Preload any persistent overrides from PostgreSQL
    try {
      const dbOverrides = await sql.query(`
        SELECT round_id, crash_point FROM public.round_overrides
      `);
      for (const row of dbOverrides) {
        setMemoryOverride(row.round_id, Number(row.crash_point));
      }
    } catch (e) {
      console.warn('Could not load db overrides:', e.message);
    }

    const data = getUpcomingRounds(count, startNonce, pastCount);

    // Fetch live in-flight statistics for real pilots / wagers
    let inFlightStats = {
      roundId: data.currentCycleIndex,
      isBettingPhase: data.currentState.isBettingPhase,
      hasCrashed: data.currentState.hasCrashed,
      multiplier: data.currentState.currentMultiplier,
      crashPoint: data.currentState.crashPoint,
      totalPilots: 0,
      totalStaked: 0,
      totalWon: 0,
      activePilots: 0,
      activeStaked: 0,
      cashedOutPilots: 0,
      crashedPilots: 0,
      netHouseMargin: 0,
      bets: [],
    };

    try {
      // Auto-resolve any stale ACTIVE bets from past rounds as CRASHED
      await sql.query(`
        UPDATE public.bets 
        SET status = 'CRASHED' 
        WHERE status = 'ACTIVE' AND round_id::bigint < $1
      `, [data.currentCycleIndex]);

      // If current round crashed, update active bets for this round to CRASHED
      if (data.currentState.hasCrashed) {
        await sql.query(`
          UPDATE public.bets 
          SET status = 'CRASHED' 
          WHERE status = 'ACTIVE' AND round_id = $1
        `, [String(data.currentCycleIndex)]);
      }

      const rows = await sql.query(`
        SELECT 
          b.id, b.user_id, b.round_id, b.deck, b.stake, b.auto_cashout, 
          b.multiplier, b.win_amount, b.status, b.created_at,
          u.phone AS user_phone, u.display_name AS user_name, u.email AS user_email
        FROM public.bets b
        LEFT JOIN public.users u ON b.user_id = u.id
        WHERE b.round_id = $1
        ORDER BY b.created_at DESC
      `, [String(data.currentCycleIndex)]);

      let totalStaked = 0;
      let totalWon = 0;
      let activePilots = 0;
      let activeStaked = 0;
      let cashedOutPilots = 0;
      let crashedPilots = 0;
      const uniquePilots = new Set();

      const bets = rows.map((r) => {
        const stake = Number(r.stake || 0);
        const win = Number(r.win_amount || 0);
        uniquePilots.add(r.user_id);
        totalStaked += stake;
        totalWon += win;

        if (r.status === 'ACTIVE') {
          activePilots++;
          activeStaked += stake;
        } else if (r.status === 'WON') {
          cashedOutPilots++;
        } else if (r.status === 'CRASHED' || r.status === 'LOST') {
          crashedPilots++;
        }

        return {
          id: r.id,
          userId: r.user_id,
          userName: r.user_name || r.user_phone || 'Pilot',
          userPhone: r.user_phone ? r.user_phone.slice(0, 4) + '***' + r.user_phone.slice(-3) : 'Anonymous',
          userEmail: r.user_email || '',
          deck: r.deck,
          stake,
          autoCashout: r.auto_cashout ? Number(r.auto_cashout) : null,
          multiplier: r.multiplier ? Number(r.multiplier) : null,
          winAmount: win,
          status: r.status,
          createdAt: r.created_at,
        };
      });

      inFlightStats = {
        roundId: data.currentCycleIndex,
        isBettingPhase: data.currentState.isBettingPhase,
        hasCrashed: data.currentState.hasCrashed,
        multiplier: data.currentState.currentMultiplier,
        crashPoint: data.currentState.crashPoint,
        totalPilots: uniquePilots.size,
        totalStaked,
        totalWon,
        activePilots,
        activeStaked,
        cashedOutPilots,
        crashedPilots,
        netHouseMargin: totalStaked - totalWon,
        bets,
      };
    } catch (err) {
      console.warn('Could not load in-flight bets:', err.message);
    }

    return NextResponse.json({
      success: true,
      ...data,
      inFlightStats,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
    }

    const body = await request.json();
    const { cycleIndex, crashPoint, note } = body;

    if (!cycleIndex) {
      return NextResponse.json({ success: false, message: 'cycleIndex is required.' }, { status: 400 });
    }

    const roundId = String(cycleIndex);

    // If crashPoint is null, 0 or 'reset', remove the override
    if (crashPoint === null || crashPoint === undefined || crashPoint === 0 || crashPoint === 'reset') {
      removeMemoryOverride(roundId);
      await sql.query(`DELETE FROM public.round_overrides WHERE round_id = $1`, [roundId]);
      return NextResponse.json({
        success: true,
        message: `Override removed for Round #${roundId}. Reverted to natural Provably Fair seed output.`,
      });
    }

    const cleanMultiplier = Math.min(100.0, Math.max(1.0, parseFloat(Number(crashPoint).toFixed(2))));
    setMemoryOverride(roundId, cleanMultiplier);

    await sql.query(`
      INSERT INTO public.round_overrides (round_id, crash_point, note)
      VALUES ($1, $2, $3)
      ON CONFLICT (round_id) DO UPDATE SET
        crash_point = EXCLUDED.crash_point,
        note = EXCLUDED.note,
        created_at = NOW()
    `, [roundId, cleanMultiplier, note || 'Admin manual override']);

    return NextResponse.json({
      success: true,
      message: `Round #${roundId} will crash at exactly ${cleanMultiplier.toFixed(2)}x.`,
      roundId,
      crashPoint: cleanMultiplier,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
