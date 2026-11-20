import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { normalizeKenyanPhone } from '../../../../lib/printpay';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawPhone = body.phone;

    if (!rawPhone) {
      return NextResponse.json({ error: 'Phone number is required.' }, { status: 400 });
    }

    let localPhone = '';
    let intlPhone = '';
    try {
      localPhone = normalizeKenyanPhone(rawPhone, 'local');
      intlPhone = normalizeKenyanPhone(rawPhone, 'international');
    } catch {
      localPhone = String(rawPhone).trim();
    }

    const rows = await sql.query(
      `SELECT id, email, phone FROM public.users WHERE phone = $1 OR phone = $2 LIMIT 1`,
      [localPhone, intlPhone]
    );

    if (!rows.length) {
      return NextResponse.json({ exists: false, message: 'No account found with that phone number.' }, { status: 200 });
    }

    return NextResponse.json({ exists: true, email: rows[0].email, userId: rows[0].id }, { status: 200 });
  } catch (err) {
    console.error('Phone lookup error:', err);
    return NextResponse.json({ error: 'Failed to look up account.' }, { status: 500 });
  }
}
