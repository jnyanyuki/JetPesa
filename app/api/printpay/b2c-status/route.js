import { NextResponse } from 'next/server';
import { sql, withTransaction } from '../../../../lib/db';
import { checkPrintPayB2CStatus } from '../../../../lib/printpay';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { conversationId, withdrawalId } = await request.json();

    if (!conversationId && !withdrawalId) {
      return NextResponse.json(
        { success: false, message: 'Missing conversationId or withdrawalId.' },
        { status: 400 }
      );
    }

    let rows = [];
    if (withdrawalId) {
      rows = await sql.query(`SELECT * FROM public.withdrawals WHERE id = $1 LIMIT 1`, [withdrawalId]);
    }
    if (!rows.length && conversationId) {
      rows = await sql.query(`SELECT * FROM public.withdrawals WHERE conversation_id = $1 LIMIT 1`, [conversationId]);
    }

    if (!rows.length) {
      return NextResponse.json(
        { success: false, message: 'Withdrawal record not found.' },
        { status: 404 }
      );
    }

    const withdrawalData = rows[0];

    if (withdrawalData.status === 'completed') {
      return NextResponse.json({
        success: true,
        status: 'completed',
        receipt: withdrawalData.receipt || null,
        ...withdrawalData,
      });
    }

    const convId = withdrawalData.conversation_id || conversationId;
    if (!convId) {
      return NextResponse.json({
        success: true,
        status: withdrawalData.status,
        ...withdrawalData,
      });
    }

    // Poll PrintPay B2C API for live status
    const liveStatus = await checkPrintPayB2CStatus(convId);
    const apiTxStatus = String(liveStatus?.transaction_status || '').toUpperCase();
    const resultCode = liveStatus?.result_code !== undefined ? Number(liveStatus.result_code) : null;
    const receipt = liveStatus?.receipt || liveStatus?.mpesa_receipt || null;

    if (apiTxStatus === 'COMPLETED' || resultCode === 0) {
      await sql.query(`
        UPDATE public.withdrawals 
        SET status = 'completed', receipt = COALESCE($1, receipt), updated_at = NOW() 
        WHERE id = $2
      `, [receipt, withdrawalData.id]);

      return NextResponse.json({
        success: true,
        status: 'completed',
        receipt,
        liveStatus,
      });
    }

    if (apiTxStatus === 'FAILED' || (resultCode !== null && resultCode !== 0)) {
      if (withdrawalData.status !== 'failed') {
        await withTransaction(async (client) => {
          await client.query(`
            UPDATE public.users 
            SET wallet_balance = wallet_balance + $1, updated_at = NOW() 
            WHERE id = $2
          `, [Number(withdrawalData.amount), withdrawalData.user_id]);

          await client.query(`
            UPDATE public.withdrawals 
            SET status = 'failed', failure_reason = $1, updated_at = NOW() 
            WHERE id = $2
          `, [liveStatus?.result_desc || liveStatus?.message || 'Payout failed.', withdrawalData.id]);
        });
      }

      return NextResponse.json({
        success: true,
        status: 'failed',
        failureReason: liveStatus?.result_desc || liveStatus?.message || 'Payout failed.',
        liveStatus,
      });
    }

    return NextResponse.json({
      success: true,
      status: 'pending',
      liveStatus,
    });
  } catch (error) {
    console.error('B2C Status Check Error:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
