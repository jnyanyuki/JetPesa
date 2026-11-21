import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getAuthSession } from '../../../../../lib/auth/server';
import { calculateHiloOdds } from '../../../../../lib/games/hiloEngine';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await getAuthSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ success: true, active: false });
    }
    const userId = session.user.id;

    const rows = await sql.query(`
      SELECT 
        id,
        stake,
        current_card,
        card_history,
        current_step,
        current_multiplier,
        skips_left,
        server_seed_hash,
        client_seed,
        nonce,
        status,
        created_at
      FROM public.hilo_rounds
      WHERE user_id = $1 AND status = 'ACTIVE'
      LIMIT 1
    `, [userId]);

    if (rows.length === 0) {
      return NextResponse.json({ success: true, active: false });
    }

    const round = rows[0];
    const stake = Number(round.stake);
    const currentMultiplier = Number(round.current_multiplier);
    const currentCard = typeof round.current_card === 'string' 
      ? JSON.parse(round.current_card) 
      : round.current_card;
    const cardHistory = typeof round.card_history === 'string'
      ? JSON.parse(round.card_history)
      : (round.card_history || []);

    const odds = calculateHiloOdds(currentCard.rank);
    const currentPayout = Math.floor(stake * currentMultiplier * 100) / 100;

    return NextResponse.json({
      success: true,
      active: true,
      round: {
        id: round.id,
        stake,
        currentCard,
        cardHistory,
        currentStep: Number(round.current_step),
        currentMultiplier,
        currentPayout,
        skipsLeft: Number(round.skips_left),
        odds,
        serverSeedHash: round.server_seed_hash,
        clientSeed: round.client_seed,
        nonce: round.nonce,
        createdAt: round.created_at,
      },
    });
  } catch (error) {
    console.error('Error fetching Hi-Lo state:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
