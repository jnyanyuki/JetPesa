import { NextResponse } from 'next/server';
import { adminDb, FieldValue } from '../../../../lib/firebaseAdmin';
import { checkPrintPayB2CStatus } from '../../../../lib/printpay';

export async function POST(request) {
  try {
    const { conversationId, withdrawalId } = await request.json();

    if (!conversationId && !withdrawalId) {
      return NextResponse.json(
        { success: false, message: 'Missing conversationId or withdrawalId.' },
        { status: 400 }
      );
    }

    let withdrawalRef;
    let withdrawalData;

    if (withdrawalId) {
      withdrawalRef = adminDb.collection('withdrawals').doc(withdrawalId);
      const snap = await withdrawalRef.get();
      if (snap.exists) withdrawalData = snap.data();
    }

    if (!withdrawalData && conversationId) {
      const snap = await adminDb
        .collection('withdrawals')
        .where('conversationId', '==', conversationId)
        .limit(1)
        .get();

      if (!snap.empty) {
        withdrawalRef = snap.docs[0].ref;
        withdrawalData = snap.docs[0].data();
      }
    }

    if (!withdrawalData) {
      return NextResponse.json(
        { success: false, message: 'Withdrawal record not found.' },
        { status: 404 }
      );
    }

    if (withdrawalData.status === 'completed') {
      return NextResponse.json({
        success: true,
        status: 'completed',
        receipt: withdrawalData.receipt || null,
        ...withdrawalData,
      });
    }

    const convId = withdrawalData.conversationId || conversationId;
    if (!convId) {
      return NextResponse.json({
        success: true,
        status: withdrawalData.status,
        ...withdrawalData,
      });
    }

    // Poll live status from PrintPay B2C API
    const liveStatus = await checkPrintPayB2CStatus(convId);
    const txStatus = String(liveStatus?.transaction_status || '').toUpperCase();
    const resultCode = liveStatus?.result_code;

    if (txStatus === 'COMPLETED' || resultCode === 0) {
      await withdrawalRef.update({
        status: 'completed',
        receipt: liveStatus.receipt || null,
        liveStatusResponse: liveStatus,
        updatedAt: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        status: 'completed',
        receipt: liveStatus.receipt,
        message: 'Withdrawal successfully processed and delivered to phone.',
      });
    }

    if (txStatus === 'FAILED' || (resultCode !== undefined && resultCode !== 0)) {
      // Automatic refund to user's wallet balance if not already refunded
      if (!withdrawalData.refunded) {
        const userRef = adminDb.collection('users').doc(withdrawalData.userId);

        await adminDb.runTransaction(async (t) => {
          t.update(userRef, {
            walletBalance: FieldValue.increment(withdrawalData.amount),
          });
          t.update(withdrawalRef, {
            status: 'failed',
            refunded: true,
            failureReason: liveStatus.result_desc || 'Payout failed.',
            liveStatusResponse: liveStatus,
            updatedAt: new Date().toISOString(),
          });
        });
      }

      return NextResponse.json({
        success: true,
        status: 'failed',
        failureReason: liveStatus.result_desc || 'Payout failed. Wallet balance has been refunded.',
      });
    }

    return NextResponse.json({
      success: true,
      status: 'processing',
      message: 'Withdrawal is currently being processed by Safaricom.',
    });
  } catch (error) {
    console.error('PrintPay B2C Status Check Error:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
