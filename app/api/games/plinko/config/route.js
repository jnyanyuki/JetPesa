import { NextResponse } from 'next/server';
import {
  PLINKO_ROWS,
  PLINKO_RISKS,
  PLINKO_MULTIPLIERS,
  DEFAULT_PLINKO_CONFIG,
} from '../../../../../lib/games/plinkoEngine';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    success: true,
    rows: PLINKO_ROWS,
    risks: PLINKO_RISKS,
    multipliers: PLINKO_MULTIPLIERS,
    config: DEFAULT_PLINKO_CONFIG,
  });
}
