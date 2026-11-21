import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getAuthSession } from '../../../../lib/auth/server';
import { getCycleState, getRoundDetails } from '../../../../lib/gameEngine';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));

    const state = getCycleState();

    // 1. Resolve any past active bets that are finished/crashed
    try {
      if (state?.cycleIndex) {
        await sql.query(`
          UPDATE public.bets
          SET status = 'CRASHED'
          WHERE user_id = $1 
            AND status = 'ACTIVE'
            AND (round_id ~ '^[0-9]+$')
            AND (
              CAST(round_id AS BIGINT) < $2
              OR (CAST(round_id AS BIGINT) = $2 AND $3 = true)
            )
        `, [userId, state.cycleIndex, Boolean(state.hasCrashed)]);
      }
    } catch (e) {
      console.warn('Stale bet status resolution warning:', e.message);
    }

    // 2. Fetch the user's latest bets up to limit (default 10)
    const rows = await sql.query(`
      SELECT 
        id,
        user_id,
        round_id,
        deck,
        stake,
        auto_cashout,
        multiplier,
        win_amount,
        status,
        created_at
      FROM public.bets
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);

    let totalWagered = 0;
    let totalWon = 0;
    let wonCount = 0;
    let lostCount = 0;

    const bets = rows.map((r) => {
      const stake = Number(r.stake || 0);
      const winAmount = Number(r.win_amount || 0);
      const isWon = r.status === 'WON';
      const isCrashed = r.status === 'CRASHED' || r.status === 'LOST';
      const isActive = r.status === 'ACTIVE';

      totalWagered += stake;
      if (isWon) {
        totalWon += winAmount;
        wonCount += 1;
      } else if (isCrashed) {
        lostCount += 1;
      }

      let roundCrashPoint = null;
      try {
        if (r.round_id && /^[0-9]+$/.test(r.round_id)) {
          const details = getRoundDetails(Number(r.round_id));
          if (details?.crashPoint) {
            roundCrashPoint = Number(details.crashPoint);
          }
        }
      } catch {}

      const dateObj = r.created_at ? new Date(r.created_at) : new Date();
      const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      return {
        id: r.id,
        roundId: r.round_id,
        deck: r.deck || 'A',
        stake,
        autoCashout: r.auto_cashout ? Number(r.auto_cashout) : null,
        multiplier: r.multiplier ? Number(r.multiplier) : null,
        winAmount,
        profit: isWon ? (winAmount - stake) : (isCrashed ? -stake : 0),
        status: r.status,
        roundCrashPoint,
        createdAt: r.created_at,
        timeStr,
      };
    });

    const netProfit = totalWon - totalWagered;

    return NextResponse.json({
      success: true,
      count: bets.length,
      bets,
      stats: {
        totalWagered,
        totalWon,
        netProfit,
        wonCount,
        lostCount,
      },
    });
  } catch (error) {
    console.error('Error fetching user bet history:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
