import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { verifyAdminAuth } from '../../../../lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)));

    const deposits = await sql.query(`
      SELECT 
        d.id, d.user_id, d.amount, d.phone, d.mpesa_receipt, d.status, d.credited, d.created_at,
        u.display_name AS user_name, u.email AS user_email
      FROM public.deposits d
      LEFT JOIN public.users u ON d.user_id = u.id
      ORDER BY d.created_at DESC
      LIMIT $1
    `, [limit]);

    const withdrawals = await sql.query(`
      SELECT 
        w.id, w.user_id, w.amount, w.phone, w.receipt, w.status, w.failure_reason, w.created_at,
        u.display_name AS user_name, u.email AS user_email
      FROM public.withdrawals w
      LEFT JOIN public.users u ON w.user_id = u.id
      ORDER BY w.created_at DESC
      LIMIT $1
    `, [limit]);

    return NextResponse.json({
      success: true,
      deposits: deposits.map((d) => ({
        id: d.id,
        userId: d.user_id,
        userName: d.user_name || d.phone,
        phone: d.phone,
        amount: Number(d.amount || 0),
        receipt: d.mpesa_receipt,
        status: d.status,
        credited: d.credited,
        createdAt: d.created_at,
      })),
      withdrawals: withdrawals.map((w) => ({
        id: w.id,
        userId: w.user_id,
        userName: w.user_name || w.phone,
        phone: w.phone,
        amount: Number(w.amount || 0),
        receipt: w.receipt,
        status: w.status,
        failureReason: w.failure_reason,
        createdAt: w.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
