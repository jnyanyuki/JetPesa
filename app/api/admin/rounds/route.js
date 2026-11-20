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
    const count = Math.min(50, Math.max(1, parseInt(searchParams.get('count') || '15', 10)));
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

    return NextResponse.json({
      success: true,
      ...data,
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
