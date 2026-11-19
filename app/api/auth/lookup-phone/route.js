import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/firebaseAdmin';
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

    // Query users collection with admin privileges
    let userQuery = await adminDb
      .collection('users')
      .where('mpesaPhone', '==', localPhone)
      .limit(1)
      .get();

    if (userQuery.empty && intlPhone) {
      userQuery = await adminDb
        .collection('users')
        .where('mpesaPhone', '==', intlPhone)
        .limit(1)
        .get();
    }

    if (userQuery.empty) {
      return NextResponse.json({ error: 'No account found with that phone number.' }, { status: 404 });
    }

    const userData = userQuery.docs[0].data();
    return NextResponse.json({ email: userData.email });
  } catch (err) {
    console.error('Phone lookup error:', err);
    return NextResponse.json({ error: 'Failed to look up account.' }, { status: 500 });
  }
}
