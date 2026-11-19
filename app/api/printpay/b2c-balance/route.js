import { NextResponse } from 'next/server';
import { getPrintPayB2CBalance } from '../../../../lib/printpay';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getPrintPayB2CBalance();
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
