import { NextResponse } from 'next/server';
import { adminDb, FieldValue, verifyAuthToken } from '../../../../lib/firebaseAdmin';
import { getCycleState } from '../../../../lib/gameEngine';

export async function POST(request) {
  try {
    const decoded = await verifyAuthToken(request);
    const userId = decoded.uid;

    const { deck, wager, autoCashout } = await request.json();

    const cleanDeck = String(deck || '').toUpperCase();
    if (cleanDeck !== 'A' && cleanDeck !== 'B') {
      throw new Error('Invalid deck specified.');
    }

    const amt = Math.floor(Number(wager));
    if (!amt || amt < 10) {
      throw new Error('Minimum wager is KES 10.');
    }

    const state = getCycleState();
    // If betting phase (first 5 seconds), place for current round. Otherwise queue for next round.
    const targetCycle = state.isBettingPhase ? state.cycleIndex : state.cycleIndex + 1;

    const betId = `BET-${targetCycle}-${cleanDeck}-${userId}`;
    const userRef = adminDb.collection('users').doc(userId);
    const betRef = adminDb.collection('game_bets').doc(betId);

    let updatedBalance = 0;

    await adminDb.runTransaction(async (transaction) => {
      // Check existing bet for this round & deck
      const existingBet = await transaction.get(betRef);
      if (existingBet.exists && existingBet.data().status === 'active') {
        throw new Error(`You already have an active wager on Deck ${deck} for this round.`);
      }

      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        throw new Error('User profile not found.');
      }

      const currentBalance = Number(userSnap.data().walletBalance || 0);
      if (currentBalance < amt) {
        throw new Error(`Insufficient funds. Your wallet balance is KES ${currentBalance.toFixed(2)}.`);
      }

      updatedBalance = currentBalance - amt;

      // Deduct balance atomically
      transaction.update(userRef, {
        walletBalance: FieldValue.increment(-amt),
      });

      // Record active bet
      transaction.set(betRef, {
        betId,
        userId,
        cycleIndex: targetCycle,
        deck,
        wager: amt,
        autoCashout: autoCashout ? parseFloat(Number(autoCashout).toFixed(2)) : null,
        status: 'active',
        createdAt: new Date().toISOString(),
      });
    });

    return NextResponse.json({
      success: true,
      betId,
      cycleIndex: targetCycle,
      wager: amt,
      balance: updatedBalance,
      message: `Wager of KES ${amt} placed for round #${targetCycle}.`,
    });
  } catch (error) {
    console.error('Game Bet Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json(
      { success: false, message: error.message },
      { status }
    );
  }
}
