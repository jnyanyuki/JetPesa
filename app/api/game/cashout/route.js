import { NextResponse } from 'next/server';
import { adminDb, FieldValue, verifyAuthToken } from '../../../../lib/firebaseAdmin';
import { getCycleState } from '../../../../lib/gameEngine';

export async function POST(request) {
  try {
    const decoded = await verifyAuthToken(request);
    const userId = decoded.uid;

    const { betId, deck } = await request.json();
    const cleanDeck = deck ? String(deck).toUpperCase() : null;

    const state = getCycleState();

    if (state.isBettingPhase) {
      throw new Error('Flight has not departed yet.');
    }

    let queryRef;
    if (betId) {
      queryRef = adminDb.collection('game_bets').doc(betId);
    } else if (cleanDeck) {
      const generatedId = `BET-${state.cycleIndex}-${cleanDeck}-${userId}`;
      queryRef = adminDb.collection('game_bets').doc(generatedId);
    } else {
      throw new Error('Missing betId or deck identifier.');
    }

    let winAmount = 0;
    let cashoutMultiplier = 0;
    let updatedBalance = 0;

    await adminDb.runTransaction(async (transaction) => {
      const betSnap = await transaction.get(queryRef);
      if (!betSnap.exists) {
        throw new Error('Active bet record not found.');
      }

      const bet = betSnap.data();
      if (bet.userId !== userId) {
        throw new Error('Unauthorized bet access.');
      }

      if (bet.status !== 'active') {
        throw new Error(`Bet has already been resolved as ${bet.status}.`);
      }

      if (bet.cycleIndex !== state.cycleIndex) {
        throw new Error('This wager belongs to a different flight round.');
      }

      const targetMultiplier = (bet.autoCashout && bet.autoCashout <= state.currentMultiplier)
        ? bet.autoCashout
        : state.currentMultiplier;

      // Check crash condition on server
      if (state.hasCrashed || targetMultiplier >= state.crashPoint) {
        transaction.update(queryRef, {
          status: 'lost',
          crashedAt: state.crashPoint,
          updatedAt: new Date().toISOString(),
        });
        throw new Error(`Flight flew away at ${state.crashPoint.toFixed(2)}x. Cashout missed.`);
      }

      cashoutMultiplier = targetMultiplier;
      winAmount = Math.floor(bet.wager * cashoutMultiplier * 100) / 100;

      // Credit user's wallet atomically
      const userRef = adminDb.collection('users').doc(userId);
      const userSnap = await transaction.get(userRef);
      const currentBalance = Number(userSnap.data()?.walletBalance || 0);
      updatedBalance = currentBalance + winAmount;

      transaction.update(userRef, {
        walletBalance: FieldValue.increment(winAmount),
      });

      transaction.update(queryRef, {
        status: 'won',
        cashedOutMultiplier: cashoutMultiplier,
        winAmount,
        updatedAt: new Date().toISOString(),
      });
    });

    return NextResponse.json({
      success: true,
      winAmount,
      multiplier: cashoutMultiplier,
      balance: updatedBalance,
      message: `Cashout successful! Won KES ${winAmount.toFixed(2)} @ ${cashoutMultiplier.toFixed(2)}x.`,
    });
  } catch (error) {
    console.error('Game Cashout Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json(
      { success: false, message: error.message },
      { status }
    );
  }
}
