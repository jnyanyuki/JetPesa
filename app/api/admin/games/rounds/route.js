import { NextResponse } from 'next/server';
import { verifyAdminAuth } from '../../../../../lib/adminAuth';
import { getGameRecentRounds } from '../../../../../lib/games/gameSettingsManager';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get('gameId') || 'mines';
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));

    const rounds = await getGameRecentRounds(gameId, limit);

    return NextResponse.json({
      success: true,
      gameId,
      rounds,
    });
  } catch (error) {
    console.error('Error fetching game rounds:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
