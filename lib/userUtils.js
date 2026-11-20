import { sql } from './db.js';

/**
 * Generates an 8-digit random numeric user ID without leading zeros.
 * Range: 10,000,000 to 99,999,999
 * Format: 8 digits only, digits can repeat within the same ID, no leading zeros.
 */
export function generate8DigitUserId() {
  const firstDigit = Math.floor(1 + Math.random() * 9); // 1-9 (never 0)
  let remaining = '';
  for (let i = 0; i < 7; i++) {
    remaining += Math.floor(Math.random() * 10); // 0-9 (can repeat)
  }
  return `${firstDigit}${remaining}`;
}

/**
 * Ensures the given user in public.users has a unique 8-digit User ID code assigned.
 * If user does not exist, provisions the record with the 8-digit code.
 * If user exists but lacks a code, generates and persists one.
 */
export async function ensureUserHasIdCode(userId, { email = null, name = null, phone = null } = {}) {
  if (!userId) return null;

  // Check if user already exists and has a user_id_code
  const existing = await sql.query(`
    SELECT id, email, phone, display_name, wallet_balance, user_id_code, created_at, updated_at
    FROM public.users
    WHERE id = $1
    LIMIT 1
  `, [userId]);

  if (existing.length > 0 && existing[0].user_id_code) {
    return existing[0];
  }

  // Generate unique 8-digit code with collision backoff
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generate8DigitUserId();
    try {
      if (existing.length === 0) {
        const inserted = await sql.query(`
          INSERT INTO public.users (id, email, display_name, phone, wallet_balance, user_id_code)
          VALUES ($1, $2, $3, $4, 0.00, $5)
          ON CONFLICT (id) DO UPDATE SET
            user_id_code = COALESCE(public.users.user_id_code, EXCLUDED.user_id_code),
            email = COALESCE(public.users.email, EXCLUDED.email),
            display_name = COALESCE(public.users.display_name, EXCLUDED.display_name),
            phone = COALESCE(public.users.phone, EXCLUDED.phone),
            updated_at = NOW()
          RETURNING id, email, phone, display_name, wallet_balance, user_id_code, created_at, updated_at
        `, [userId, email, name, phone, code]);
        return inserted[0];
      } else {
        const updated = await sql.query(`
          UPDATE public.users
          SET user_id_code = $1, updated_at = NOW()
          WHERE id = $2 AND (user_id_code IS NULL OR user_id_code = '')
          RETURNING id, email, phone, display_name, wallet_balance, user_id_code, created_at, updated_at
        `, [code, userId]);
        if (updated.length > 0) {
          return updated[0];
        }
        // If update returned 0 rows, check if another process assigned it
        const refetch = await sql.query(`SELECT * FROM public.users WHERE id = $1`, [userId]);
        if (refetch.length > 0 && refetch[0].user_id_code) {
          return refetch[0];
        }
      }
    } catch (err) {
      if (err.message?.includes('unique') || err.code === '23505') {
        // Collision, retry with fresh random 8-digit code
        continue;
      }
      throw err;
    }
  }

  // Fallback query
  const fallback = await sql.query(`SELECT * FROM public.users WHERE id = $1`, [userId]);
  return fallback[0] || null;
}
