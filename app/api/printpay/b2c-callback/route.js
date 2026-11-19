import { NextResponse } from 'next/server';
import { adminDb, FieldValue } from '../../../../lib/firebaseAdmin';
import { checkPrintPayB2CStatus } from '../../../../lib/printpay';

export async function POST(request) {
  try {
    // 1. Webhook Secret Validation
    const expectedSecret = process.env.PRINTPAY_WEBHOOK_SECRET;
    if (expectedSecret) {
      const { searchParams } = new URL(request.url);
      const querySecret = searchParams.get('secret');
      const headerSecret = request.headers.get('x-webhook-secret');
      if (querySecret !== expectedSecret && headerSecret !== expectedSecret) {
        console.warn('Unauthorized B2C webhook attempt: invalid or missing secret');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
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

    const snap = await adminDb
      .collection('withdrawals')
      .where('conversationId', '==', conversationId)
      .limit(1)
      .get();

    if (snap.empty) {
      console.warn(`Withdrawal record not found for conversationId: ${conversationId}`);
      return NextResponse.json({ received: true, message: 'Withdrawal not found' });
    }

    const docRef = snap.docs[0].ref;
    const tx = snap.docs[0].data();

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
      await docRef.update({
        status: 'completed',
        receipt,
        callbackBody: body,
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json({ received: true });
    }

    // Payout failed on telco side - refund user if not yet refunded
    if (!tx.refunded) {
      const userRef = adminDb.collection('users').doc(tx.userId);
      await adminDb.runTransaction(async (t) => {
        t.update(userRef, {
          walletBalance: FieldValue.increment(tx.amount),
        });
        t.update(docRef, {
          status: 'failed',
          refunded: true,
          failureReason: body.result_desc || body.message || 'Payout failed.',
          callbackBody: body,
          updatedAt: new Date().toISOString(),
        });
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('PrintPay B2C Webhook Error:', error);
    return NextResponse.json({ received: true, error: error.message }, { status: 500 });
  }
}
