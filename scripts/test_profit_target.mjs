import { computeProfitTargetCrashCap } from '../lib/gameEngine.js';

async function testEngineMath() {
  console.log('Testing computeProfitTargetCrashCap...');

  // Test 1: No bets placed
  const r1 = computeProfitTargetCrashCap(0, 0, [], 500, 3.50);
  console.log('Test 1 (No bets):', r1);
  if (r1.safeMultiplierCap !== 3.50 || r1.willOverride !== false) {
    throw new Error('Test 1 failed');
  }

  // Test 2: Total bets 200 KES, Target 500 KES (Budget depleted, cannot allow win)
  const r2 = computeProfitTargetCrashCap(200, 0, [{ stake: 200 }], 500, 3.50);
  console.log('Test 2 (W <= Target):', r2);
  if (r2.safeMultiplierCap !== 1.00 || r2.willOverride !== true) {
    throw new Error('Test 2 failed');
  }

  // Test 3: Total bets 10,000 KES, Target 2,000 KES. Max allowed payout = 8,000.
  // Active stakes = 2,000 KES. Cap = 8,000 / 2,000 = 4.00x. Natural crash = 10.00x.
  const r3 = computeProfitTargetCrashCap(10000, 0, [{ stake: 2000 }], 2000, 10.00);
  console.log('Test 3 (Cap overrides high flight):', r3);
  if (r3.safeMultiplierCap !== 4.00 || r3.willOverride !== true) {
    throw new Error('Test 3 failed');
  }

  // Test 4: Target already secured (earlier cashouts completed, house profit >= target)
  const r4 = computeProfitTargetCrashCap(5000, 1000, [], 2000, 5.00);
  console.log('Test 4 (Target secured, no active bets):', r4);
  if (r4.isSecured !== true || r4.willOverride !== false) {
    throw new Error('Test 4 failed');
  }

  console.log('All engine math tests PASSED!');
}

testEngineMath().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
