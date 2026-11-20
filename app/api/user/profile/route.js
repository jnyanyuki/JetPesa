import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getAuthSession } from '../../../../lib/auth/server';
import { ensureUserHasIdCode, generate8DigitUserId } from '../../../../lib/userUtils';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const u = await ensureUserHasIdCode(userId, {
      email: session.user.email || null,
      name: session.user.name || null,
    });

    if (!u) {
      return NextResponse.json({ error: 'User record unavailable' }, { status: 500 });
    }

    const payload = {
      id: u.id,
      userIdCode: u.user_id_code,
      email: u.email || session.user.email || '',
      phone: u.phone || '',
      displayName: u.display_name || session.user.name || '',
      walletBalance: Number(u.wallet_balance || 0),
    };

    return NextResponse.json({
      success: true,
      ...payload,
      user: payload,
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

    const newCode = generate8DigitUserId();

    const res = await sql.query(`
      INSERT INTO public.users (id, email, display_name, phone, wallet_balance, user_id_code)
      VALUES ($1, $2, $3, $4, 0.00, $5)
      ON CONFLICT (id) DO UPDATE SET
        display_name = COALESCE($3, public.users.display_name),
        phone = COALESCE($4, public.users.phone),
        user_id_code = COALESCE(public.users.user_id_code, $5),
        updated_at = NOW()
      RETURNING id, email, phone, display_name, wallet_balance, user_id_code
    `, [userId, session.user.email || null, cleanName, cleanPhone, newCode]);

    const u = res[0];

    const payload = {
      id: u.id,
      userIdCode: u.user_id_code,
      displayName: u.display_name || cleanName,
      phone: u.phone || cleanPhone,
      email: u.email || session.user.email || '',
      walletBalance: Number(u.wallet_balance || 0),
    };

    return NextResponse.json({
      success: true,
      ...payload,
      user: payload,
    });
  } catch (err) {
    console.error('Profile update error:', err);
    return NextResponse.json({ error: err.message || 'Failed to update profile' }, { status: 400 });
  }
}
