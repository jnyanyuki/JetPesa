import { sql } from '../lib/db.js';

async function main() {
  console.log('Creating public.roulette_spins table...');
  await sql`
    CREATE TABLE IF NOT EXISTS public.roulette_spins (
      id SERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      total_stake NUMERIC(12, 2) NOT NULL,
      bets JSONB NOT NULL,
      winning_number INT NOT NULL,
      winning_color VARCHAR(10) NOT NULL,
      total_payout NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      net_profit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
      server_seed VARCHAR(64) NOT NULL,
      server_seed_hash VARCHAR(64) NOT NULL,
      client_seed VARCHAR(64) NOT NULL,
      nonce INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_roulette_user_created
    ON public.roulette_spins (user_id, created_at DESC);
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_roulette_recent_spins
    ON public.roulette_spins (created_at DESC);
  `;

  console.log('public.roulette_spins table and indexes created successfully.');
  process.exit(0);
}

main().catch(err => {
  console.error('Failed to create roulette_spins table:', err);
  process.exit(1);
});
