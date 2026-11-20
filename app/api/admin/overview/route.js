import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { verifyAdminAuth } from '../../../../lib/adminAuth';
import { getPrintPayB2CBalance } from '../../../../lib/printpay';
import { getCycleState, getRoundDetails } from '../../../../lib/gameEngine';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
    }

    // 1. Users & Liabilities
    const usersAgg = await sql.query(`
      SELECT 
        COUNT(*)::int AS total_users,
        COALESCE(SUM(wallet_balance), 0)::numeric AS total_liabilities
      FROM public.users
    `);

    // 2. Deposits
    const depositsAgg = await sql.query(`
      SELECT 
        COUNT(*)::int AS total_deposits_count,
        COALESCE(SUM(amount), 0)::numeric AS total_deposits_amount
      FROM public.deposits
      WHERE status = 'COMPLETED'
    `);

    // 3. Withdrawals
    const withdrawalsAgg = await sql.query(`
      SELECT 
        COUNT(*)::int AS total_withdrawals_count,
        COALESCE(SUM(amount), 0)::numeric AS total_withdrawals_amount
      FROM public.withdrawals
      WHERE status = 'COMPLETED'
    `);

    // 4. Bets & Gaming Gross Revenue (GGR)
    const betsAgg = await sql.query(`
      SELECT 
        COUNT(*)::int AS total_bets_count,
        COALESCE(SUM(stake), 0)::numeric AS total_wagered,
        COALESCE(SUM(win_amount), 0)::numeric AS total_won
      FROM public.bets
    `);

    // 5. PrintPay Float Balance
    let printPayBalance = null;
    try {
      const b2c = await getPrintPayB2CBalance();
      if (b2c && b2c.balance !== undefined) {
        printPayBalance = Number(b2c.balance);
      }
    } catch (e) {
      console.warn('Admin overview could not fetch PrintPay balance:', e.message);
    }

    // 6. Game Engine Radar
    const cycleState = getCycleState();
    const currentRound = getRoundDetails(cycleState.cycleIndex);
    const nextRound = getRoundDetails(cycleState.cycleIndex + 1);
    const nextNextRound = getRoundDetails(cycleState.cycleIndex + 2);

    const wagered = Number(betsAgg[0]?.total_wagered || 0);
    const won = Number(betsAgg[0]?.total_won || 0);
    const ggr = wagered - won;

    return NextResponse.json({
      success: true,
      stats: {
        totalUsers: Number(usersAgg[0]?.total_users || 0),
        totalLiabilities: Number(usersAgg[0]?.total_liabilities || 0),
        printPayBalance,
        totalDepositsAmount: Number(depositsAgg[0]?.total_deposits_amount || 0),
        totalDepositsCount: Number(depositsAgg[0]?.total_deposits_count || 0),
        totalWithdrawalsAmount: Number(withdrawalsAgg[0]?.total_withdrawals_amount || 0),
        totalWithdrawalsCount: Number(withdrawalsAgg[0]?.total_withdrawals_count || 0),
        totalWagered: wagered,
        totalWon: won,
        grossGamingRevenue: ggr,
      },
      game: {
        currentCycleIndex: cycleState.cycleIndex,
        isBettingPhase: cycleState.isBettingPhase,
        hasCrashed: cycleState.hasCrashed,
        multiplier: cycleState.currentMultiplier,
        currentCrashPoint: currentRound.crashPoint,
        nextCrashPoint: nextRound.crashPoint,
        nextRoundIndex: cycleState.cycleIndex + 1,
        nextNextCrashPoint: nextNextRound.crashPoint,
        serverSeedHash: cycleState.serverSeedHash,
        clientSeed: cycleState.clientSeed,
      },
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
