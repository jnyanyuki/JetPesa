import { NextResponse } from 'next/server';
import { adminDb, verifyAuthToken } from '../../../../lib/firebaseAdmin';
import { initiatePrintPayC2B, normalizeKenyanPhone, PRINTPAY_PAYBILL, PRINTPAY_WALLET_ID } from '../../../../lib/printpay';

export async function POST(request) {
  try {
    const decoded = await verifyAuthToken(request).catch(() => null);
    const body = await request.json();
    const { amount, phone, username } = body;

    const userId = decoded?.uid || username;
    if (!userId) {
      throw new Error('User authentication required.');
    }

    const amt = Math.floor(Number(amount));
    if (!amt || amt < 10) {
      throw new Error('Minimum deposit is KES 10.');
    }

    const cleanPhone = normalizeKenyanPhone(phone, 'local');
    const reference = `JP-DEP-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

    // Initialize deposit record in Firestore
    await adminDb.collection('deposits').doc(reference).set({
      reference,
      userId,
      amount: amt,
      phone: cleanPhone,
      status: 'pending',
      provider: 'printpay',
      credited: false,
      createdAt: new Date().toISOString(),
    });

    // Auto-link M-Pesa phone if user doesn't have one saved
    try {
      const userRef = adminDb.collection('users').doc(userId);
      const userSnap = await userRef.get();
      if (userSnap.exists && !userSnap.data()?.mpesaPhone) {
        await userRef.update({ mpesaPhone: cleanPhone });
      }
    } catch {
      // Non-blocking
    }

    // Call PrintPay C2B STK Push
    const printpayRes = await initiatePrintPayC2B({
      phone: cleanPhone,
      amount: amt,
    });

    const checkoutId = printpayRes.checkout_id;

    await adminDb.collection('deposits').doc(reference).update({
      checkoutId: checkoutId || null,
      providerResponse: printpayRes,
    });

    return NextResponse.json({
      success: true,
      status: 'pending',
      provider: 'printpay',
      reference,
      checkoutId,
      paybill: PRINTPAY_PAYBILL,
      accountNumber: PRINTPAY_WALLET_ID,
      message: 'STK push sent. Please enter your M-Pesa PIN on your phone.',
    });
  } catch (error) {
    console.error('PrintPay C2B Error:', error);
    return NextResponse.json(
      {
        success: false,
        status: 'failed',
        message: error.message || 'Failed to initiate STK push.',
      },
      { status: 400 }
    );
  }
}
