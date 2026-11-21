import { computeProfitTargetCrashCap } from '../lib/gameEngine.js';

async function testEngineMath() {
  console.log('Testing computeProfitTargetCrashCap with percentages...');

  // Test 1: No bets placed, 50% target
  const r1 = computeProfitTargetCrashCap(0, 0, [], 50, 3.50);
  console.log('Test 1 (No bets, 50% target):', r1);
  if (r1.safeMultiplierCap !== 3.50 || r1.willOverride !== false || r1.targetProfitPercent !== 50) {
    throw new Error('Test 1 failed');
  }

  // Test 2: 100% target (house takes all) -> immediate crash at 1.00x
  const r2 = computeProfitTargetCrashCap(1000, 0, [{ stake: 1000 }], 100, 3.50);
  console.log('Test 2 (100% target):', r2);
  if (r2.safeMultiplierCap !== 1.00 || r2.willOverride !== true) {
    throw new Error('Test 2 failed');
  }

  // Test 3: Total bets 10,000 KES, 30% target. Max payout = 7,000 KES.
  // Active stakes = 2,000 KES. Safe cap = 7,000 / 2,000 = 3.50x. Natural crash = 8.00x.
  const r3 = computeProfitTargetCrashCap(10000, 0, [{ stake: 2000 }], 30, 8.00);
  console.log('Test 3 (30% target on 10,000 KES wagers):', r3);
  if (r3.safeMultiplierCap !== 3.50 || r3.willOverride !== true || r3.targetProfitKes !== 3000) {
    throw new Error('Test 3 failed');
  }

  // Test 4: 50% target on 2,000 KES. P_won = 500 KES, active stakes = 0.
  // House profit = 1,500 KES >= 1,000 KES (50%). Target is secured!
  const r4 = computeProfitTargetCrashCap(2000, 500, [], 50, 5.00);
  console.log('Test 4 (Target secured):', r4);
  if (r4.isSecured !== true || r4.willOverride !== false) {
    throw new Error('Test 4 failed');
  }

  console.log('All percentage profit target math tests PASSED!');
}

testEngineMath().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
