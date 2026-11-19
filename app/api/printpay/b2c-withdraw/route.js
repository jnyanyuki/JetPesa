import { NextResponse } from 'next/server';
import { adminDb, FieldValue, verifyAuthToken } from '../../../../lib/firebaseAdmin';
import { initiatePrintPayB2CWithdrawal, normalizeKenyanPhone } from '../../../../lib/printpay';

export async function POST(request) {
  try {
    // 1. Authenticate caller via verified Firebase ID Token
    const decoded = await verifyAuthToken(request);
    const userId = decoded.uid;

    const { amount, phone } = await request.json();

    const amt = Math.floor(Number(amount));
    if (!amt || amt < 50) {
      throw new Error('Minimum withdrawal amount is KES 50.');
    }

    const cleanPhone = normalizeKenyanPhone(phone, 'local');
    const withdrawalId = `JP-WTH-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const userRef = adminDb.collection('users').doc(userId);
    const withdrawalRef = adminDb.collection('withdrawals').doc(withdrawalId);

    // 2. Atomically verify balance and deduct from user wallet
    await adminDb.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        throw new Error('User profile does not exist.');
      }

      const currentBalance = Number(userSnap.data().walletBalance || 0);
      if (currentBalance < amt) {
        throw new Error(`Insufficient wallet balance. You have KES ${currentBalance.toFixed(2)}.`);
      }

      // Deduct balance
      transaction.update(userRef, {
        walletBalance: FieldValue.increment(-amt),
      });

      // Record withdrawal intent
      transaction.set(withdrawalRef, {
        withdrawalId,
        userId,
        amount: amt,
        phone: cleanPhone,
        status: 'processing',
        provider: 'printpay',
        createdAt: new Date().toISOString(),
      });
    });

    // 3. Dispatch B2C payout to PrintPay
    try {
      const payoutRes = await initiatePrintPayB2CWithdrawal({
        phone: cleanPhone,
        amount: amt,
        commandId: 'BusinessPayment',
      });

      const conversationId = payoutRes.conversation_id || null;

      await withdrawalRef.update({
        conversationId,
        providerResponse: payoutRes,
        updatedAt: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        status: 'processing',
        withdrawalId,
        conversationId,
        amount: amt,
        message: payoutRes.message || 'M-Pesa withdrawal initiated successfully!',
      });
    } catch (apiError) {
      console.error('PrintPay B2C API Call Failed. Reverting user balance...', apiError);

      // Refund the user's wallet immediately if PrintPay rejected the dispatch
      await adminDb.runTransaction(async (t) => {
        t.update(userRef, {
          walletBalance: FieldValue.increment(amt),
        });
        t.update(withdrawalRef, {
          status: 'failed',
          refunded: true,
          failureReason: apiError.message,
          updatedAt: new Date().toISOString(),
        });
      });

      throw apiError;
    }
  } catch (error) {
    console.error('Withdrawal Handler Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json(
      {
        success: false,
        status: 'failed',
        message: error.message || 'Failed to process withdrawal.',
      },
      { status }
    );
  }
}
