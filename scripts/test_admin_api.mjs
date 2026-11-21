async function testAdminApi() {
  const secret = process.env.ADMIN_SECRET || process.env.PRINTPAY_WEBHOOK_SECRET || 'jetpesa_super_admin_2026';
  const baseUrl = 'http://localhost:3000';

  console.log('Testing GET /api/admin/rounds...');
  const resGet = await fetch(`${baseUrl}/api/admin/rounds?count=6&pastCount=5`, {
    headers: { 'x-admin-secret': secret },
  });
  const dataGet = await resGet.json();
  console.log('GET status:', resGet.status, 'success:', dataGet.success);
  console.log('Current cycleIndex:', dataGet.currentCycleIndex);
  console.log('inFlightStats profitTarget:', dataGet.inFlightStats?.profitTarget);

  if (!dataGet.success) throw new Error('GET /api/admin/rounds failed: ' + JSON.stringify(dataGet));

  const curCycle = dataGet.currentCycleIndex;

  console.log(`Setting percentage profit target 60% on round ${curCycle}...`);
  const resSet = await fetch(`${baseUrl}/api/admin/rounds`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': secret,
    },
    body: JSON.stringify({
      cycleIndex: curCycle,
      action: 'setProfitTarget',
      targetProfitPercent: 60,
    }),
  });
  const dataSet = await resSet.json();
  console.log('SET response:', dataSet);

  if (!dataSet.success || dataSet.targetProfitPercent !== 60) {
    throw new Error('POST setProfitTarget failed: ' + JSON.stringify(dataSet));
  }

  console.log(`Clearing profit target on round ${curCycle}...`);
  const resClear = await fetch(`${baseUrl}/api/admin/rounds`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': secret,
    },
    body: JSON.stringify({
      cycleIndex: curCycle,
      action: 'clearProfitTarget',
    }),
  });
  const dataClear = await resClear.json();
  console.log('CLEAR response:', dataClear);

  if (!dataClear.success) {
    throw new Error('POST clearProfitTarget failed: ' + JSON.stringify(dataClear));
  }

  console.log('API end-to-end integration test with percentage profit target PASSED!');
}

testAdminApi().catch(e => {
  console.error('API Test Error:', e);
  process.exit(1);
});
