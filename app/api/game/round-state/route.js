import { NextResponse } from 'next/server';
import { getCycleState } from '../../../../lib/gameEngine';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const state = getCycleState();

    return NextResponse.json({
      success: true,
      cycleIndex: state.cycleIndex,
      isBettingPhase: state.isBettingPhase,
      hasCrashed: state.hasCrashed,
      multiplier: state.currentMultiplier,
      serverSeedHash: state.serverSeedHash,
      crashPoint: state.crashPoint,
      offsetMs: state.offsetMs,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
