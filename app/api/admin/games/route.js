import { NextResponse } from 'next/server';
import { verifyAdminAuth } from '../../../../lib/adminAuth';
import { getComprehensiveGamesStats } from '../../../../lib/games/gameSettingsManager';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
    }

    const data = await getComprehensiveGamesStats();
    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error('Error fetching admin games telemetry:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
