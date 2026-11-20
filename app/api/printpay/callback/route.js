import { NextResponse } from 'next/server';
import { sql, withTransaction } from '../../../../lib/db';
import { checkPrintPayC2BStatus, normalizeKenyanPhone } from '../../../../lib/printpay';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    // 1. Webhook Secret Validation
    const expectedSecret = process.env.PRINTPAY_WEBHOOK_SECRET;
    if (expectedSecret) {
      const { searchParams } = new URL(request.url);
      const querySecret = searchParams.get('secret');
      const headerSecret = request.headers.get('x-webhook-secret');
      if (querySecret !== expectedSecret && headerSecret !== expectedSecret) {
        console.warn('Unauthorized webhook attempt: invalid or missing secret');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json().catch(() => ({}));
    console.log('PrintPay C2B Webhook Payload:', JSON.stringify(body));

    const checkoutId = body.checkout_id || body.checkoutId || null;
    const rawPhone = body.phone || body.phone_number || body.MSISDN || body.msisdn || null;
    const rawAmount = body.amount || body.TransAmount || body.trans_amount || null;
    const receipt = body.mpesa_receipt || body.mpesa_receipt_number || body.TransID || body.trans_id || null;
    const status = String(body.status || '').toUpperCase();
    const resultCode = body.result_code !== undefined ? Number(body.result_code) : null;

    const amt = Math.floor(Number(rawAmount));

    // Idempotency check: if this M-Pesa receipt has already been credited, do not credit again
    if (receipt) {
      const existingReceipt = await sql.query(`
        SELECT id FROM public.deposits 
        WHERE mpesa_receipt = $1 AND credited = TRUE 
        LIMIT 1
      `, [receipt]);

      if (existingReceipt.length > 0) {
        console.log(`Receipt ${receipt} already credited. Skipping.`);
        return NextResponse.json({ received: true, message: 'Already processed' });
      }
    }

    // SCENARIO 1: Online STK Push (Identified via checkoutId)
    if (checkoutId) {
      const rows = await sql.query(`
        SELECT id, user_id, amount, credited 
        FROM public.deposits 
        WHERE checkout_id = $1 
        LIMIT 1
      `, [checkoutId]);

      if (rows.length > 0) {
        const tx = rows[0];

        // Security Double-Check: Query PrintPay API directly to confirm status
        let isVerifiedSuccess = false;
        try {
          const liveCheck = await checkPrintPayC2BStatus(checkoutId);
          if (String(liveCheck?.status || '').toUpperCase() === 'SUCCESS') {
            isVerifiedSuccess = true;
          }
        } catch (e) {
          console.warn('Could not re-verify with PrintPay directly, relying on status/resultCode:', e.message);
          isVerifiedSuccess = status === 'SUCCESS' || resultCode === 0;
        }

        if (!isVerifiedSuccess) {
          await sql.query(`
            UPDATE public.deposits 
            SET status = 'failed', raw_callback = $1, updated_at = NOW() 
            WHERE id = $2
          `, [JSON.stringify(body), tx.id]);
          return NextResponse.json({ received: true, note: 'Marked failed' });
        }

        if (!tx.credited) {
          const depositAmt = Number(tx.amount || amt);
          await withTransaction(async (client) => {
            await client.query(`
              UPDATE public.deposits 
              SET status = 'completed', credited = TRUE, mpesa_receipt = COALESCE($1, mpesa_receipt), raw_callback = $2, updated_at = NOW() 
              WHERE id = $3 AND credited = FALSE
            `, [receipt, JSON.stringify(body), tx.id]);

            await client.query(`
              UPDATE public.users 
              SET wallet_balance = wallet_balance + $1, updated_at = NOW() 
              WHERE id = $2
            `, [depositAmt, tx.user_id]);
          });
        }

        return NextResponse.json({ received: true, mode: 'stk_push' });
      }
    }

    // SCENARIO 2: Offline / Manual Paybill (Identified via Sender's Phone Number)
    if (rawPhone && amt > 0) {
      let localPhone = '';
      let intlPhone = '';
      try {
        localPhone = normalizeKenyanPhone(rawPhone, 'local');
        intlPhone = normalizeKenyanPhone(rawPhone, 'international');
      } catch {
        localPhone = String(rawPhone).trim();
      }

      // Query user in PostgreSQL by phone
      const users = await sql.query(`
        SELECT id FROM public.users 
        WHERE phone = $1 OR phone = $2 
        LIMIT 1
      `, [localPhone, intlPhone]);

      if (users.length > 0) {
        const matchedUserId = users[0].id;
        const newDepId = `JP-OFF-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

        await withTransaction(async (client) => {
          await client.query(`
            INSERT INTO public.deposits (id, user_id, amount, phone, mpesa_receipt, status, credited, provider, raw_callback)
            VALUES ($1, $2, $3, $4, $5, 'completed', TRUE, 'printpay_offline', $6)
          `, [newDepId, matchedUserId, amt, localPhone, receipt, JSON.stringify(body)]);

          await client.query(`
            UPDATE public.users 
            SET wallet_balance = wallet_balance + $1, updated_at = NOW() 
            WHERE id = $2
          `, [amt, matchedUserId]);
        });

        console.log(`Offline Paybill deposit credited: KES ${amt} to user ${matchedUserId}`);
        return NextResponse.json({ received: true, mode: 'offline_matched', user: matchedUserId });
      } else {
        // Unmatched phone: save to unclaimed_deposits
        const unclaimedId = `UNCLAIMED-${receipt || Date.now()}`;
        await sql.query(`
          INSERT INTO public.unclaimed_deposits (id, mpesa_receipt, phone, amount, raw_callback)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO NOTHING
        `, [unclaimedId, receipt, localPhone || String(rawPhone), amt, JSON.stringify(body)]);

        console.warn(`Unclaimed deposit recorded for phone ${rawPhone}, amount ${amt}`);
        return NextResponse.json({ received: true, mode: 'unclaimed' });
      }
    }

    return NextResponse.json({ received: true, message: 'No action taken' });
  } catch (error) {
    console.error('PrintPay Callback Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
