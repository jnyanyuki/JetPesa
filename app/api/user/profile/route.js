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
      SELECT id, email, phone, display_name, wallet_balance, created_at 
      FROM public.users 
      WHERE id = $1 
      LIMIT 1
    `, [userId]);

    if (!rows.length) {
      // Auto-provision user record
      await sql.query(`
        INSERT INTO public.users (id, email, display_name, wallet_balance)
        VALUES ($1, $2, $3, 0.00)
        ON CONFLICT (id) DO NOTHING
      `, [userId, session.user.email || null, session.user.name || null]);

      return NextResponse.json({
        id: userId,
        email: session.user.email || '',
        phone: '',
        displayName: session.user.name || '',
        walletBalance: 0.0,
      });
    }

    const u = rows[0];
    return NextResponse.json({
      id: u.id,
      email: u.email || session.user.email || '',
      phone: u.phone || '',
      displayName: u.display_name || session.user.name || '',
      walletBalance: Number(u.wallet_balance || 0),
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const body = await request.json();
    const { displayName, phone } = body;

    const cleanName = displayName ? String(displayName).trim().slice(0, 50) : null;
    const cleanPhone = phone ? String(phone).trim() : null;

    await sql.query(`
      INSERT INTO public.users (id, email, display_name, phone, wallet_balance)
      VALUES ($1, $2, $3, $4, 0.00)
      ON CONFLICT (id) DO UPDATE SET
        display_name = COALESCE($3, public.users.display_name),
        phone = COALESCE($4, public.users.phone),
        updated_at = NOW()
    `, [userId, session.user.email || null, cleanName, cleanPhone]);

    return NextResponse.json({
      success: true,
      displayName: cleanName,
      phone: cleanPhone,
    });
  } catch (err) {
    console.error('Profile update error:', err);
    return NextResponse.json({ error: err.message || 'Failed to update profile' }, { status: 400 });
  }
}
