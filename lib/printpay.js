/**
 * PrintPay PSP Integration Helper (C2B & B2C)
 * 
 * Supports:
 * - C2B: M-Pesa STK Push deposits, polling, and callbacks
 * - B2C: M-Pesa automated payouts/withdrawals, balance inquiry, and status polling
 */

export const PRINTPAY_WALLET_ID = process.env.PRINTPAY_WALLET_ID || 'RK06FTNUZX5T';
export const PRINTPAY_PAYBILL = process.env.PRINTPAY_PAYBILL || '1416998';

export function getPrintPayCredentials() {
  const apiKey = process.env.PRINTPAY_API_KEY;
  const walletId = process.env.PRINTPAY_WALLET_ID || PRINTPAY_WALLET_ID;
  const securityCredential = process.env.PRINTPAY_SECURITY_CREDENTIAL || apiKey;

  return { apiKey, walletId, securityCredential };
}

/**
 * Normalizes Kenyan phone numbers.
 * @param {string} phone
 * @param {'local'|'international'} format - 'local' (07...) or 'international' (254...)
 */
export function normalizeKenyanPhone(phone, format = 'local') {
  let clean = String(phone || '').trim().replace(/[\s+-]/g, '');

  if (clean.startsWith('254')) {
    clean = clean.slice(3);
  }

  if (clean.startsWith('0')) {
    clean = clean.slice(1);
  }

  // Must now start with 7 or 1 and have 8 following digits (9 digits total)
  if (!/^(7|1)\d{8}$/.test(clean)) {
    throw new Error('Invalid Kenyan phone number. Use format 07XXXXXXXX or 01XXXXXXXX.');
  }

  if (format === 'international') {
    return `254${clean}`;
  }
  return `0${clean}`;
}

/**
 * Initiates C2B STK Push
 * @param {Object} params
 * @param {string} params.phone - Customer phone
 * @param {number} params.amount - Amount in KES
 */
export async function initiatePrintPayC2B({ phone, amount }) {
  const { apiKey } = getPrintPayCredentials();
  if (!apiKey) {
    throw new Error('PRINTPAY_API_KEY is not configured in environment variables.');
  }

  const cleanPhone = normalizeKenyanPhone(phone, 'local');
  const amt = Math.floor(Number(amount));

  const url = 'https://printpay.site/api/stk_push';
  const bodyParams = new URLSearchParams({
    x_api_key: apiKey,
    phone_number: cleanPhone,
    amount: String(amt),
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.status === 'error' || data.error) {
    throw new Error(data.message || data.error || 'Failed to initiate STK push with PrintPay.');
  }

  return data;
}

/**
 * Check C2B Transaction Status
 * @param {string} checkoutId - The checkout_id from initiatePrintPayC2B
 */
export async function checkPrintPayC2BStatus(checkoutId) {
  if (!checkoutId) throw new Error('Missing checkout_id for status check.');

  const url = `https://printpay.site/api/stk_push?check_status=${encodeURIComponent(checkoutId)}`;
  const response = await fetch(url, { method: 'GET' });
  const data = await response.json().catch(() => ({}));

  return data;
}

/**
 * Check B2C Live Merchant Balance
 */
export async function getPrintPayB2CBalance() {
  const { walletId, securityCredential } = getPrintPayCredentials();
  if (!walletId || !securityCredential) {
    throw new Error('Missing PrintPay Wallet ID or Security Credential.');
  }

  const url = 'https://printpay.site/b2c/walletbalance';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Wallet-ID': walletId,
      'X-Security-Credential': securityCredential,
    },
  });

  const data = await response.json().catch(() => ({}));
  return data;
}

/**
 * Initiate B2C Disbursement / Payout (Withdrawal)
 * @param {Object} params
 * @param {string} params.phone - Customer phone
 * @param {number} params.amount - Payout amount in KES
 * @param {string} [params.commandId='BusinessPayment'] - BusinessPayment | SalaryPayment | PromotionPayment
 */
export async function initiatePrintPayB2CWithdrawal({ phone, amount, commandId = 'BusinessPayment' }) {
  const { walletId, securityCredential } = getPrintPayCredentials();
  if (!walletId || !securityCredential) {
    throw new Error('Missing PrintPay Wallet ID or Security Credential.');
  }

  const cleanPhone = normalizeKenyanPhone(phone, 'local');
  const amt = Math.floor(Number(amount));

  const url = 'https://printpay.site/b2c/payout/withdraw';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Wallet-ID': walletId,
      'X-Security-Credential': securityCredential,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      command_id: commandId,
      phone: cleanPhone,
      amount: amt,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.status === 'error') {
    throw new Error(data.message || 'PrintPay B2C payout request failed.');
  }

  return data;
}

/**
 * Check B2C Disbursement Status
 * @param {string} conversationId - The conversation_id from initiatePrintPayB2CWithdrawal
 */
export async function checkPrintPayB2CStatus(conversationId) {
  const { walletId, securityCredential } = getPrintPayCredentials();
  if (!walletId || !securityCredential) {
    throw new Error('Missing PrintPay Wallet ID or Security Credential.');
  }

  const url = 'https://printpay.site/b2c/payout/status';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Wallet-ID': walletId,
      'X-Security-Credential': securityCredential,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      conversation_id: conversationId,
    }),
  });

  const data = await response.json().catch(() => ({}));
  return data;
}
