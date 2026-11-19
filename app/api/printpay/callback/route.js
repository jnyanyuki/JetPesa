import { NextResponse } from 'next/server';
import { adminDb, FieldValue } from '../../../../lib/firebaseAdmin';
import { checkPrintPayC2BStatus, normalizeKenyanPhone } from '../../../../lib/printpay';

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
      const existingReceipt = await adminDb
        .collection('deposits')
        .where('mpesaReceipt', '==', receipt)
        .where('credited', '==', true)
        .limit(1)
        .get();

      if (!existingReceipt.empty) {
        console.log(`Receipt ${receipt} already credited. Skipping.`);
        return NextResponse.json({ received: true, message: 'Already processed' });
      }
    }

    // SCENARIO 1: Online STK Push (Identified via checkoutId)
    if (checkoutId) {
      const snap = await adminDb
        .collection('deposits')
        .where('checkoutId', '==', checkoutId)
        .limit(1)
        .get();

      if (!snap.empty) {
        const docRef = snap.docs[0].ref;
        const tx = snap.docs[0].data();

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
          await docRef.update({
            status: 'failed',
            failureReason: body.message || `Payment failed with code ${resultCode}`,
            callbackBody: body,
            updatedAt: new Date().toISOString(),
          });
          return NextResponse.json({ received: true, note: 'Marked failed' });
        }

        if (!tx.credited) {
          await adminDb.runTransaction(async (transaction) => {
            transaction.update(docRef, {
              status: 'completed',
              credited: true,
              mpesaReceipt: receipt,
              callbackBody: body,
              updatedAt: new Date().toISOString(),
            });

            transaction.update(adminDb.collection('users').doc(tx.userId), {
              walletBalance: FieldValue.increment(tx.amount || amt),
            });
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

      // Query user in Firestore by phone
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

      if (!userQuery.empty) {
        const userDoc = userQuery.docs[0];
        const userId = userDoc.id;
        const reference = `JP-OFFLINE-${receipt || Date.now()}`;

        await adminDb.runTransaction(async (transaction) => {
          transaction.set(adminDb.collection('deposits').doc(reference), {
            reference,
            userId,
            amount: amt,
            phone: localPhone,
            mpesaReceipt: receipt,
            status: 'completed',
            credited: true,
            provider: 'printpay_paybill',
            callbackBody: body,
            createdAt: new Date().toISOString(),
          });

          transaction.update(userDoc.ref, {
            walletBalance: FieldValue.increment(amt),
          });
        });

        console.log(`Successfully credited KES ${amt} to user ${userId} via offline Paybill.`);
        return NextResponse.json({ received: true, mode: 'offline_paybill_matched', userId });
      } else {
        console.warn(`Unclaimed offline payment from ${rawPhone} for KES ${amt}. No matching user.`);
        const unclaimedRef = `UNCLAIMED-${receipt || Date.now()}`;
        await adminDb.collection('unclaimed_deposits').doc(unclaimedRef).set({
          phone: rawPhone,
          amount: amt,
          mpesaReceipt: receipt,
          callbackBody: body,
          createdAt: new Date().toISOString(),
        });

        return NextResponse.json({ received: true, mode: 'unclaimed_saved' });
      }
    }

    return NextResponse.json({ received: true, message: 'Unmatched payload' });
  } catch (error) {
    console.error('PrintPay Webhook Error:', error);
    return NextResponse.json({ received: true, error: error.message }, { status: 500 });
  }
}
