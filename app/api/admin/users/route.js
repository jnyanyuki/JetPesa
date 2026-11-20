import { NextResponse } from 'next/server';
import { sql, withTransaction } from '../../../../lib/db';
import { verifyAdminAuth } from '../../../../lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

    let rows = [];
    if (search) {
      rows = await sql.query(`
        SELECT id, email, phone, display_name, wallet_balance, created_at, updated_at
        FROM public.users
        WHERE phone ILIKE $1 OR email ILIKE $1 OR display_name ILIKE $1 OR id::text ILIKE $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `, [`%${search}%`, limit, offset]);
    } else {
      rows = await sql.query(`
        SELECT id, email, phone, display_name, wallet_balance, created_at, updated_at
        FROM public.users
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
    }

    return NextResponse.json({
      success: true,
      users: rows.map((u) => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        displayName: u.display_name,
        walletBalance: Number(u.wallet_balance || 0),
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      })),
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, amount, reason } = body;

    if (!userId || typeof amount !== 'number' || isNaN(amount)) {
      return NextResponse.json({ success: false, message: 'userId and numeric amount are required.' }, { status: 400 });
    }

    let updatedBalance = 0;
    await withTransaction(async (client) => {
      const userRes = await client.query(`
        SELECT id, wallet_balance FROM public.users WHERE id = $1 FOR UPDATE
      `, [userId]);

      if (userRes.rows.length === 0) {
        throw new Error('User not found.');
      }

      const curr = Number(userRes.rows[0].wallet_balance || 0);
      const nextBal = Math.max(0, Math.floor((curr + amount) * 100) / 100);

      const upd = await client.query(`
        UPDATE public.users
        SET wallet_balance = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING wallet_balance
      `, [nextBal, userId]);

      updatedBalance = Number(upd.rows[0].wallet_balance);

      // Record deposit or audit entry
      await client.query(`
        INSERT INTO public.deposits (id, user_id, amount, phone, checkout_id, mpesa_receipt, status, credited, provider)
        VALUES ($1, $2, $3, 'ADMIN_MANUAL', $4, $5, 'COMPLETED', true, 'ADMIN_OVERRIDE')
      `, [
        `DEP-ADMIN-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        userId,
        amount,
        `ADJ-${userId.slice(0, 8)}`,
        reason ? `AUDIT: ${reason.slice(0, 30)}` : 'ADMIN_MANUAL_ADJUSTMENT'
      ]);
    });

    return NextResponse.json({
      success: true,
      message: `Balance updated successfully. New balance: KES ${updatedBalance.toFixed(2)}`,
      walletBalance: updatedBalance,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
