import { NextResponse } from 'next/server';
import { sql, withTransaction } from '../../../../lib/db';
import { checkPrintPayB2CStatus } from '../../../../lib/printpay';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    // 1. Webhook Secret Validation
    const expectedSecret = process.env.PRINTPAY_WEBHOOK_SECRET;
    const { searchParams } = new URL(request.url);
    const querySecret = searchParams.get('secret');
    const headerSecret = request.headers.get('x-webhook-secret');
    const isSecretValid = Boolean(expectedSecret && (querySecret === expectedSecret || headerSecret === expectedSecret));

    if (expectedSecret && !isSecretValid) {
      console.warn('Unauthorized B2C webhook attempt: invalid or missing secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    console.log('PrintPay B2C Webhook Received:', body);

    const conversationId = body.conversation_id || body.conversationId;
    const txStatus = String(body.transaction_status || body.status || '').toUpperCase();
    const resultCode = body.result_code !== undefined ? Number(body.result_code) : null;
    const receipt = body.receipt || body.mpesa_receipt || null;

    if (!conversationId) {
      return NextResponse.json({ received: true, message: 'Missing conversation_id' });
    }

    const rows = await sql.query(`
      SELECT id, user_id, amount, status 
      FROM public.withdrawals 
      WHERE conversation_id = $1 
      LIMIT 1
    `, [conversationId]);

    if (!rows.length) {
      console.warn(`Withdrawal record not found for conversationId: ${conversationId}`);
      return NextResponse.json({ received: true, message: 'Withdrawal not found' });
    }

    const tx = rows[0];

    // Verify status with PrintPay API directly
    let isSuccess = false;
    try {
      const liveCheck = await checkPrintPayB2CStatus(conversationId);
      const liveTxStatus = String(liveCheck?.transaction_status || '').toUpperCase();
      isSuccess = liveTxStatus === 'COMPLETED' || liveCheck?.result_code === 0;
    } catch {
      isSuccess = txStatus === 'COMPLETED' || resultCode === 0;
    }

    if (isSuccess) {
      await sql.query(`
        UPDATE public.withdrawals 
        SET status = 'completed', receipt = COALESCE($1, receipt), updated_at = NOW() 
        WHERE id = $2
      `, [receipt, tx.id]);
      return NextResponse.json({ received: true });
    }

    // Payout failed on telco side - refund user if not yet refunded
    if (tx.status !== 'failed') {
      await withTransaction(async (client) => {
        await client.query(`
          UPDATE public.users 
          SET wallet_balance = wallet_balance + $1, updated_at = NOW() 
          WHERE id = $2
        `, [Number(tx.amount), tx.user_id]);

        await client.query(`
          UPDATE public.withdrawals 
          SET status = 'failed', failure_reason = $1, updated_at = NOW() 
          WHERE id = $2
        `, [body.result_desc || body.message || 'Payout failed.', tx.id]);
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('PrintPay B2C Webhook Error:', error);
    return NextResponse.json({ received: true, error: error.message }, { status: 500 });
  }
}
