import { NextResponse } from 'next/server';
import { getPrintPayB2CBalance } from '../../../../lib/printpay';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const expectedSecret = process.env.ADMIN_SECRET || process.env.PRINTPAY_WEBHOOK_SECRET;
    const { searchParams } = new URL(request.url);
    const querySecret = searchParams.get('secret');
    const authHeader = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!expectedSecret || (querySecret !== expectedSecret && authHeader !== expectedSecret)) {
      return NextResponse.json({ error: 'Unauthorized access to merchant float balance.' }, { status: 401 });
    }

    const data = await getPrintPayB2CBalance();
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
