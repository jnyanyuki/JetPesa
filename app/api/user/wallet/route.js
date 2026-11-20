import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getAuthSession } from '../../../../lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const rows = await sql.query(`
      SELECT wallet_balance FROM public.users WHERE id = $1 LIMIT 1
    `, [userId]);

    const balance = rows.length > 0 ? Number(rows[0].wallet_balance || 0) : 0.00;

    return NextResponse.json({
      balance,
    });
  } catch (err) {
    console.error('Wallet fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch wallet' }, { status: 500 });
  }
}
