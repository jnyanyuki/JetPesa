import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { verifyAdminAuth } from '../../../../lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const roundId = searchParams.get('roundId');
    const status = searchParams.get('status');

    let query = `
      SELECT 
        b.id, b.user_id, b.round_id, b.deck, b.stake, b.auto_cashout, 
        b.multiplier, b.win_amount, b.status, b.created_at,
        u.phone AS user_phone, u.display_name AS user_name, u.email AS user_email
      FROM public.bets b
      LEFT JOIN public.users u ON b.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (roundId) {
      params.push(roundId);
      query += ` AND b.round_id = $${params.length}`;
    }

    if (status) {
      params.push(status.toUpperCase());
      query += ` AND b.status = $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY b.created_at DESC LIMIT $${params.length}`;

    const rows = await sql.query(query, params);

    return NextResponse.json({
      success: true,
      bets: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name || r.user_phone || 'Anonymous',
        userPhone: r.user_phone || '',
        userEmail: r.user_email || '',
        roundId: r.round_id,
        deck: r.deck,
        stake: Number(r.stake || 0),
        autoCashout: r.auto_cashout ? Number(r.auto_cashout) : null,
        multiplier: r.multiplier ? Number(r.multiplier) : null,
        winAmount: Number(r.win_amount || 0),
        status: r.status,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
