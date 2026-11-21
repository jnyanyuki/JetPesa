import { NextResponse } from 'next/server';
import { verifyAdminAuth } from '../../../../../lib/adminAuth';
import { saveGameSettings, getGameSettings } from '../../../../../lib/games/gameSettingsManager';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON payload.' }, { status: 400 });
    }

    const { gameId, settings } = body;
    if (!gameId || typeof settings !== 'object') {
      return NextResponse.json({ success: false, message: 'Missing gameId or settings object.' }, { status: 400 });
    }

    const updated = await saveGameSettings(gameId, settings);

    return NextResponse.json({
      success: true,
      gameId,
      settings: updated,
      message: `Configuration for ${updated.title || gameId} updated successfully.`,
    });
  } catch (error) {
    console.error('Error saving game settings:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
