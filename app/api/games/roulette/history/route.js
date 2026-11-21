import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { RED_NUMBERS, BLACK_NUMBERS } from '../../../../../lib/games/rouletteEngine';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await sql.query(`
      SELECT 
        winning_number,
        winning_color,
        created_at
      FROM public.roulette_spins
      ORDER BY created_at DESC
      LIMIT 100
    `);

    // Calculate Hot & Cold numbers and color distribution
    const frequencyMap = {};
    for (let i = 0; i <= 36; i++) {
      frequencyMap[i] = 0;
    }

    let redCount = 0;
    let blackCount = 0;
    let greenCount = 0;

    const recent = rows.map((r) => {
      const num = Number(r.winning_number);
      const color = r.winning_color;
      frequencyMap[num] = (frequencyMap[num] || 0) + 1;

      if (color === 'red') redCount++;
      else if (color === 'black') blackCount++;
      else if (color === 'green') greenCount++;

      return {
        number: num,
        color,
        createdAt: r.created_at,
      };
    });

    // Sort numbers by frequency
    const sortedNumbers = Object.keys(frequencyMap)
      .map((k) => ({ number: Number(k), count: frequencyMap[k] }))
      .sort((a, b) => b.count - a.count);

    const hotNumbers = sortedNumbers.slice(0, 5).map((x) => x.number);
    const coldNumbers = sortedNumbers.slice(-5).map((x) => x.number);

    return NextResponse.json({
      success: true,
      recent: recent.slice(0, 20),
      stats: {
        totalSpins: rows.length,
        redCount,
        blackCount,
        greenCount,
        redPercent: rows.length > 0 ? Math.round((redCount / rows.length) * 100) : 48,
        blackPercent: rows.length > 0 ? Math.round((blackCount / rows.length) * 100) : 48,
        greenPercent: rows.length > 0 ? Math.round((greenCount / rows.length) * 100) : 4,
        hotNumbers: hotNumbers.length > 0 ? hotNumbers : [17, 7, 23, 0, 32],
        coldNumbers: coldNumbers.length > 0 ? coldNumbers : [4, 13, 26, 35, 10],
      },
    });
  } catch (error) {
    console.error('Error fetching roulette history:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
