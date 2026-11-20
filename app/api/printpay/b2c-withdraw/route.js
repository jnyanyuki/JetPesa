import { NextResponse } from 'next/server';
import { withTransaction, sql } from '../../../../lib/db';
import { getAuthSession } from '../../../../lib/auth/server';
import { initiatePrintPayB2CWithdrawal, normalizeKenyanPhone } from '../../../../lib/printpay';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Authentication required. Please sign in.' }, { status: 401 });
    }
    const userId = session.user.id;

    const { amount, phone } = await request.json();

    const amt = Math.floor(Number(amount));
    if (!amt || amt < 50) {
      throw new Error('Minimum withdrawal amount is KES 50.');
    }

    const cleanPhone = normalizeKenyanPhone(phone, 'local');
    const withdrawalId = `JP-WTH-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

    // 1. Atomically verify balance and deduct from user wallet in PostgreSQL
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
        const balRes = await client.query(`SELECT wallet_balance FROM public.users WHERE id = $1`, [userId]);
        const curBal = Number(balRes.rows[0]?.wallet_balance || 0);
        throw new Error(`Insufficient wallet balance. You have KES ${curBal.toFixed(2)}.`);
      }

      // Record withdrawal intent
      await client.query(`
        INSERT INTO public.withdrawals (id, user_id, amount, phone, status)
        VALUES ($1, $2, $3, $4, 'processing')
      `, [withdrawalId, userId, amt, cleanPhone]);
    });

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
        message: payoutRes.message || 'M-Pesa withdrawal initiated successfully!',
      });
    } catch (apiError) {
      console.error('PrintPay B2C API Call Failed. Reverting user balance...', apiError);

      // Refund the user's wallet immediately if PrintPay rejected the dispatch
      await withTransaction(async (client) => {
        await client.query(`
          UPDATE public.users 
          SET wallet_balance = wallet_balance + $1, updated_at = NOW() 
          WHERE id = $2
        `, [amt, userId]);

        await client.query(`
          UPDATE public.withdrawals 
          SET status = 'failed', failure_reason = $1, updated_at = NOW() 
          WHERE id = $2
        `, [apiError.message, withdrawalId]);
      });

      throw apiError;
    }
  } catch (error) {
    console.error('Withdrawal Handler Error:', error);
    const status = error.message?.includes('Authentication') ? 401 : 400;
    return NextResponse.json(
      {
        success: false,
        status: 'failed',
        message: error.message || 'Withdrawal initiation failed.',
      },
      { status }
    );
  }
}
