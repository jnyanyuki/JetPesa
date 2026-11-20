import { NextResponse } from 'next/server';
import { withTransaction, sql } from '../../../../lib/db';
import { getAuthSession } from '../../../../lib/auth/server';
import { initiatePrintPayB2CWithdrawal, normalizeKenyanPhone } from '../../../../lib/printpay';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, code: 'UNAUTHORIZED', message: 'Authentication required. Please sign in.' },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    let body = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, code: 'INVALID_JSON', message: 'Malformed JSON payload.' },
        { status: 400 }
      );
    }

    const { amount, phone } = body;

    const amt = Math.floor(Number(amount));
    if (!amt || amt < 50) {
      return NextResponse.json(
        { success: false, code: 'MIN_AMOUNT', message: 'Minimum withdrawal amount is KES 50.' },
        { status: 200 }
      );
    }

    let cleanPhone = '';
    try {
      cleanPhone = normalizeKenyanPhone(phone, 'local');
    } catch {
      return NextResponse.json(
        { success: false, code: 'INVALID_PHONE', message: 'Invalid phone number format. Use 07XXXXXXXX or 01XXXXXXXX.' },
        { status: 200 }
      );
    }

    const withdrawalId = `JP-WTH-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

    // 1. Atomically verify balance and deduct from user wallet in PostgreSQL
    let userBalanceOk = true;
    let currentBalance = 0;

    await withTransaction(async (client) => {
      // Ensure user exists
      await client.query(`
        INSERT INTO public.users (id, email, display_name, wallet_balance)
        VALUES ($1, $2, $3, 0.00)
        ON CONFLICT (id) DO NOTHING
      `, [userId, session.user.email || null, session.user.name || null]);

      // Atomic deduction
      const deductRes = await client.query(`
        UPDATE public.users 
        SET wallet_balance = wallet_balance - $1, updated_at = NOW() 
        WHERE id = $2 AND wallet_balance >= $1 
        RETURNING wallet_balance
      `, [amt, userId]);

      if (deductRes.rows.length === 0) {
        userBalanceOk = false;
        const balRes = await client.query(`SELECT wallet_balance FROM public.users WHERE id = $1`, [userId]);
        currentBalance = Number(balRes.rows[0]?.wallet_balance || 0);
        return;
      }

      currentBalance = Number(deductRes.rows[0].wallet_balance);

      // Record withdrawal intent
      await client.query(`
        INSERT INTO public.withdrawals (id, user_id, amount, phone, status)
        VALUES ($1, $2, $3, $4, 'processing')
      `, [withdrawalId, userId, amt, cleanPhone]);
    });

    if (!userBalanceOk) {
      return NextResponse.json({
        success: false,
        code: 'INSUFFICIENT_FUNDS',
        message: `Insufficient wallet balance. You have KES ${currentBalance.toFixed(2)}.`,
      }, { status: 200 });
    }

    // 2. Dispatch B2C payout to PrintPay
    try {
      const payoutRes = await initiatePrintPayB2CWithdrawal({
        phone: cleanPhone,
        amount: amt,
        commandId: 'BusinessPayment',
      });

      const conversationId = payoutRes.conversation_id || null;

      await sql.query(`
        UPDATE public.withdrawals 
        SET conversation_id = $1, updated_at = NOW() 
        WHERE id = $2
      `, [conversationId, withdrawalId]);

      return NextResponse.json({
        success: true,
        status: 'processing',
        withdrawalId,
        conversationId,
        amount: amt,
        newBalance: currentBalance,
        message: payoutRes.message || 'M-Pesa withdrawal initiated successfully!',
      }, { status: 200 });
    } catch (apiError) {
      console.warn('PrintPay B2C API Call Failed. Reverting user balance...', apiError.message);

      // Refund the user's wallet immediately if PrintPay rejected the dispatch
      let refundedBal = currentBalance + amt;
      try {
        await withTransaction(async (client) => {
          const refRes = await client.query(`
            UPDATE public.users 
            SET wallet_balance = wallet_balance + $1, updated_at = NOW() 
            WHERE id = $2
            RETURNING wallet_balance
          `, [amt, userId]);
          if (refRes.rows.length > 0) {
            refundedBal = Number(refRes.rows[0].wallet_balance);
          }

          await client.query(`
            UPDATE public.withdrawals 
            SET status = 'failed', failure_reason = $1, updated_at = NOW() 
            WHERE id = $2
          `, [apiError.message, withdrawalId]);
        });
      } catch (refundErr) {
        console.error('Failed to refund user balance on B2C failure:', refundErr);
      }

      return NextResponse.json({
        success: false,
        status: 'failed',
        code: 'GATEWAY_ERROR',
        newBalance: refundedBal,
        message: apiError.message || 'Withdrawal rejected by payment provider.',
      }, { status: 200 });
    }
  } catch (error) {
    console.error('Withdrawal Handler Error:', error);
    return NextResponse.json(
      {
        success: false,
        status: 'failed',
        message: error.message || 'Withdrawal initiation failed.',
      },
      { status: 500 }
    );
  }
}
