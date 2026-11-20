import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getAuthSession } from '../../../../lib/auth/server';
import { initiatePrintPayC2B, normalizeKenyanPhone, PRINTPAY_PAYBILL, PRINTPAY_WALLET_ID } from '../../../../lib/printpay';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getAuthSession(request);
    const body = await request.json();
    const { amount, phone, username } = body;

    const userId = session?.user?.id || username;
    if (!userId) {
      throw new Error('User authentication required.');
    }

    const amt = Math.floor(Number(amount));
    if (!amt || amt < 10) {
      throw new Error('Minimum deposit is KES 10.');
    }

    const cleanPhone = normalizeKenyanPhone(phone, 'local');
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
    });
  } catch (error) {
    console.error('C2B Handler Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Deposit initiation failed.' },
      { status: 400 }
    );
  }
}
