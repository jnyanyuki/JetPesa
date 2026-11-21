import { sql } from '../lib/db.js';

async function main() {
  console.log('Altering public.round_overrides to make crash_point nullable...');
  await sql`
    ALTER TABLE public.round_overrides 
    ALTER COLUMN crash_point DROP NOT NULL;
  `;
  console.log('crash_point is now nullable in public.round_overrides.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
