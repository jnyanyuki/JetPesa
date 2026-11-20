import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { secret } = await request.json().catch(() => ({}));
    const expectedSecret = process.env.ADMIN_SECRET || process.env.PRINTPAY_WEBHOOK_SECRET || 'jetpesa_super_admin_2026';

    if (!secret || secret.trim() !== expectedSecret) {
      return NextResponse.json({ success: false, message: 'Invalid Admin Secret Key.' }, { status: 401 });
    }

    const response = NextResponse.json({
      success: true,
      message: 'Admin authorization granted.',
      token: expectedSecret,
    });

    response.cookies.set('jetpesa_admin_token', expectedSecret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true, message: 'Admin logged out.' });
  response.cookies.delete('jetpesa_admin_token');
  return response;
}
