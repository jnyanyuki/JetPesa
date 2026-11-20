export function verifyAdminAuth(request) {
  const adminSecret = process.env.ADMIN_SECRET || process.env.PRINTPAY_WEBHOOK_SECRET || 'jetpesa_super_admin_2026';
  
  // 1. Check custom header
  const customHeader = request.headers.get('x-admin-secret');
  if (customHeader && customHeader === adminSecret) {
    return true;
  }

  // 2. Check Authorization Bearer
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token === adminSecret) {
      return true;
    }
  }

  // 3. Check Cookie
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/jetpesa_admin_token=([^;]+)/);
  if (match && decodeURIComponent(match[1]) === adminSecret) {
    return true;
  }

  // 4. Check Query Param (for direct dashboard links if needed)
  try {
    const { searchParams } = new URL(request.url);
    const querySecret = searchParams.get('secret');
    if (querySecret && querySecret === adminSecret) {
      return true;
    }
  } catch {}

  return false;
}
