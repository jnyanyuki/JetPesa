import { NextResponse } from 'next/server';
import { getCycleState, getRoundDetails, HOUSE_EDGE } from '../../../../lib/gameEngine';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const nonce = parseInt(searchParams.get('nonce') || '1', 10);

    if (isNaN(nonce) || nonce < 1) {
      return NextResponse.json({ success: false, message: 'Invalid nonce.' }, { status: 400 });
    }

    const currentState = getCycleState();
    const round = getRoundDetails(nonce);

    // If nonce is in the future, or current round has NOT crashed yet:
    // Keep crashPoint, serverSeed, and roundHash STRICTLY SEALED!
    const isPastOrCrashed = nonce < currentState.cycleIndex || (nonce === currentState.cycleIndex && currentState.hasCrashed);

    if (!isPastOrCrashed) {
      return NextResponse.json({
        success: true,
        nonce,
        status: 'sealed',
        serverSeedHash: round.serverSeedHash,
        clientSeed: round.clientSeed,
        algorithm: 'HMAC_SHA256',
        houseEdge: HOUSE_EDGE,
        message: 'Crash point is cryptographically sealed until round crash.',
      });
    }

    // Past or crashed round: fully reveal for provably fair verification
    return NextResponse.json({
      success: true,
      nonce,
      status: 'revealed',
      serverSeedHash: round.serverSeedHash,
      roundHash: round.roundHash,
      crashPoint: round.crashPoint,
      serverSeed: round.serverSeed,
      clientSeed: round.clientSeed,
      algorithm: 'HMAC_SHA256',
      houseEdge: HOUSE_EDGE,
      verifyInput: round.roundInput,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
