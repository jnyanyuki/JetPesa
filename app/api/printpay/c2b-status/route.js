import { NextResponse } from 'next/server';
import { adminDb, FieldValue } from '../../../../lib/firebaseAdmin';
import { checkPrintPayC2BStatus } from '../../../../lib/printpay';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get('reference');
    const checkoutId = searchParams.get('checkout_id') || searchParams.get('checkoutId');

    if (!reference && !checkoutId) {
      return NextResponse.json(
        { success: false, message: 'Missing reference or checkout_id parameter.' },
        { status: 400 }
      );
    }

    let docRef;
    let depositData;

    if (reference) {
      docRef = adminDb.collection('deposits').doc(reference);
      const snap = await docRef.get();
      if (snap.exists) {
        depositData = snap.data();
      }
    }

    if (!depositData && checkoutId) {
      const snap = await adminDb
        .collection('deposits')
        .where('checkoutId', '==', checkoutId)
        .limit(1)
        .get();

      if (!snap.empty) {
        docRef = snap.docs[0].ref;
        depositData = snap.docs[0].data();
      }
    }

    if (!depositData) {
      return NextResponse.json(
        { success: false, message: 'Deposit record not found.' },
        { status: 404 }
      );
    }

    // If already completed and credited, return immediate success
    if (depositData.status === 'completed' && depositData.credited) {
      return NextResponse.json({
        success: true,
        status: 'completed',
        amount: depositData.amount,
        mpesaReceipt: depositData.mpesaReceipt || null,
        ...depositData,
      });
    }

    const cId = depositData.checkoutId || checkoutId;
    if (!cId) {
      return NextResponse.json({
        success: true,
        status: depositData.status,
        ...depositData,
      });
    }

    // Poll live status from PrintPay API
    const liveStatus = await checkPrintPayC2BStatus(cId);
    const normalizedStatus = String(liveStatus?.status || '').toUpperCase();

    if (normalizedStatus === 'SUCCESS') {
      const receipt = liveStatus.mpesa_receipt_number || liveStatus.mpesa_receipt || null;

      if (!depositData.credited) {
        await adminDb.runTransaction(async (transaction) => {
          transaction.update(docRef, {
            status: 'completed',
            credited: true,
            mpesaReceipt: receipt,
            liveStatusResponse: liveStatus,
            updatedAt: new Date().toISOString(),
          });

          transaction.update(adminDb.collection('users').doc(depositData.userId), {
            walletBalance: FieldValue.increment(depositData.amount),
          });
        });
      }

      return NextResponse.json({
        success: true,
        status: 'completed',
        amount: depositData.amount,
        mpesaReceipt: receipt,
      });
    }

    if (normalizedStatus === 'FAILED' || normalizedStatus === 'CANCELLED') {
      await docRef.update({
        status: 'failed',
        failureReason: liveStatus.message || 'Payment cancelled or failed on handset.',
        liveStatusResponse: liveStatus,
        updatedAt: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        status: 'failed',
        failureReason: liveStatus.message || 'Payment failed.',
      });
    }

    // Still pending
    return NextResponse.json({
      success: true,
      status: 'pending',
      amount: depositData.amount,
    });
  } catch (error) {
    console.error('PrintPay Status Check Error:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
