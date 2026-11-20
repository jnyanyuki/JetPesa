import { sql } from '../lib/db.js';

// Function to generate an 8-digit random integer string without leading zeros (10000000 to 99999999)
export function generate8DigitUserId() {
  // First digit: 1-9 (no leading zeros)
  const firstDigit = Math.floor(1 + Math.random() * 9);
  // Remaining 7 digits: 0-9 each, digits can repeat
  let remainingDigits = '';
  for (let i = 0; i < 7; i++) {
    remainingDigits += Math.floor(Math.random() * 10);
  }
  return `${firstDigit}${remainingDigits}`;
}

async function runMigration() {
  try {
    console.log('Adding user_id_code column to public.users if not exists...');
    await sql`
      ALTER TABLE public.users 
      ADD COLUMN IF NOT EXISTS user_id_code VARCHAR(8) UNIQUE;
    `;
    console.log('Column added or already exists.');

    // Fetch existing users without user_id_code
    const usersWithoutCode = await sql`
      SELECT id, email, phone FROM public.users WHERE user_id_code IS NULL;
    `;
    console.log(`Found ${usersWithoutCode.length} users needing 8-digit User ID.`);

    for (const u of usersWithoutCode) {
      let assigned = false;
      let attempts = 0;
      while (!assigned && attempts < 10) {
        attempts++;
        const code = generate8DigitUserId();
        try {
          await sql`
            UPDATE public.users 
            SET user_id_code = ${code}, updated_at = NOW() 
            WHERE id = ${u.id} AND user_id_code IS NULL;
          `;
          console.log(`Assigned User ID ${code} to user ${u.id} (${u.phone || u.email})`);
          assigned = true;
        } catch (err) {
          if (err.message?.includes('unique') || err.code === '23505') {
            console.log(`Collision on ${code}, retrying...`);
          } else {
            throw err;
          }
        }
      }
    }

    const allUsers = await sql`
      SELECT id, email, phone, display_name, user_id_code, wallet_balance, created_at 
      FROM public.users;
    `;
    console.log('\nAll users in database:');
    console.table(allUsers);
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

runMigration();
