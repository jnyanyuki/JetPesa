import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getAuthSession } from '../../../../lib/auth/server';
import { initiatePrintPayC2B, normalizeKenyanPhone, PRINTPAY_PAYBILL, PRINTPAY_WALLET_ID } from '../../../../lib/printpay';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getAuthSession(request);
    let body = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Malformed JSON payload.' }, { status: 400 });
    }
    const { amount, phone, username } = body;

    const userId = session?.user?.id || username;
    if (!userId) {
      return NextResponse.json({ success: false, message: 'User authentication required.' }, { status: 401 });
    }

    const amt = Math.floor(Number(amount));
    if (!amt || amt < 10) {
      return NextResponse.json({ success: false, message: 'Minimum deposit is KES 10.' }, { status: 200 });
    }

    let cleanPhone = '';
    try {
      cleanPhone = normalizeKenyanPhone(phone, 'local');
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid phone number format. Use 07XXXXXXXX or 01XXXXXXXX.' }, { status: 200 });
    }

    const reference = `JP-DEP-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

    // Ensure user row exists in public.users
    await sql.query(`
      INSERT INTO public.users (id, email, display_name, phone, wallet_balance)
      VALUES ($1, $2, $3, $4, 0.00)
      ON CONFLICT (id) DO UPDATE SET
        phone = COALESCE(public.users.phone, EXCLUDED.phone),
        updated_at = NOW()
    `, [userId, session?.user?.email || null, session?.user?.name || null, cleanPhone]);

    // Initialize deposit record in PostgreSQL
    await sql.query(`
      INSERT INTO public.deposits (id, user_id, amount, phone, status, credited, provider)
      VALUES ($1, $2, $3, $4, 'pending', FALSE, 'printpay')
    `, [reference, userId, amt, cleanPhone]);

    // Call PrintPay C2B STK Push
    try {
      const printpayRes = await initiatePrintPayC2B({
        phone: cleanPhone,
        amount: amt,
      });

      const checkoutId = printpayRes.checkout_id || null;

      await sql.query(`
        UPDATE public.deposits 
        SET checkout_id = $1, raw_callback = $2, updated_at = NOW() 
        WHERE id = $3
      `, [checkoutId, JSON.stringify(printpayRes), reference]);

      return NextResponse.json({
        success: true,
        reference,
        checkoutId,
        paybill: PRINTPAY_PAYBILL,
        accountNumber: PRINTPAY_WALLET_ID,
        message: printpayRes.message || 'M-Pesa payment prompt sent to your phone.',
      }, { status: 200 });
    } catch (gatewayErr) {
      console.warn('PrintPay C2B STK Call Failed:', gatewayErr.message);
      return NextResponse.json({
        success: false,
        message: gatewayErr.message || 'Failed to dispatch STK push prompt.',
      }, { status: 200 });
    }
  } catch (error) {
    console.error('C2B Handler Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Deposit initiation failed.' },
      { status: 500 }
    );
  }
}
