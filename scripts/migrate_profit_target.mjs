import { sql } from '../lib/db.js';

async function main() {
  console.log('Ensuring target_profit_kes column exists on public.round_overrides...');
  await sql`
    ALTER TABLE public.round_overrides 
    ADD COLUMN IF NOT EXISTS target_profit_kes NUMERIC;
  `;
  const cols = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'round_overrides'
  `;
  console.log('Columns on round_overrides:', cols);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
