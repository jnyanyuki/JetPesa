import { NextResponse } from 'next/server';
import { sql, withTransaction } from '../../../../lib/db';
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

    let rows = [];
    if (reference) {
      rows = await sql.query(`SELECT * FROM public.deposits WHERE id = $1 LIMIT 1`, [reference]);
    }
    if (!rows.length && checkoutId) {
      rows = await sql.query(`SELECT * FROM public.deposits WHERE checkout_id = $1 LIMIT 1`, [checkoutId]);
    }

    if (!rows.length) {
      return NextResponse.json(
        { success: false, message: 'Deposit record not found.' },
        { status: 404 }
      );
    }

    const depositData = rows[0];

    // If already completed and credited, return immediate success
    if (depositData.status === 'completed' && depositData.credited) {
      return NextResponse.json({
        success: true,
        status: 'completed',
        amount: Number(depositData.amount),
        mpesaReceipt: depositData.mpesa_receipt || null,
        ...depositData,
      });
    }

    const targetCheckoutId = depositData.checkout_id || checkoutId;
    if (!targetCheckoutId) {
      return NextResponse.json({
        success: true,
        status: depositData.status,
        ...depositData,
      });
    }

    // Poll live status from PrintPay API
    const liveStatus = await checkPrintPayC2BStatus(targetCheckoutId);
    const apiStatus = String(liveStatus?.status || '').toUpperCase();
    const receipt = liveStatus?.mpesa_receipt_number || liveStatus?.receipt || null;

    if (apiStatus === 'SUCCESS') {
      const amt = Number(depositData.amount || liveStatus.amount || 0);

      // Crediting user balance atomically in PostgreSQL
      await withTransaction(async (client) => {
        await client.query(`
          UPDATE public.deposits 
          SET status = 'completed', credited = TRUE, mpesa_receipt = COALESCE($1, mpesa_receipt), updated_at = NOW() 
          WHERE id = $2 AND credited = FALSE
        `, [receipt, depositData.id]);

        await client.query(`
          UPDATE public.users 
          SET wallet_balance = wallet_balance + $1, updated_at = NOW() 
          WHERE id = $2
        `, [amt, depositData.user_id]);
      });

      return NextResponse.json({
        success: true,
        status: 'completed',
        amount: amt,
        mpesaReceipt: receipt,
        liveStatus,
      });
    }

    if (apiStatus === 'FAILED' || apiStatus === 'CANCELLED') {
      await sql.query(`
        UPDATE public.deposits 
        SET status = 'failed', updated_at = NOW() 
        WHERE id = $1
      `, [depositData.id]);

      return NextResponse.json({
        success: true,
        status: 'failed',
        failureReason: liveStatus?.message || 'Payment was cancelled or failed.',
        liveStatus,
      });
    }

    return NextResponse.json({
      success: true,
      status: 'pending',
      liveStatus,
    });
  } catch (error) {
    console.error('C2B Status Check Error:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
