import { sql } from '../lib/db.js';

async function main() {
  console.log('Creating public.hilo_rounds table...');
  await sql`
    CREATE TABLE IF NOT EXISTS public.hilo_rounds (
      id SERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      stake NUMERIC(12, 2) NOT NULL,
      current_card JSONB NOT NULL,
      card_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      current_step INT NOT NULL DEFAULT 0,
      current_multiplier NUMERIC(10, 4) NOT NULL DEFAULT 1.0000,
      skips_left INT NOT NULL DEFAULT 3,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      payout NUMERIC(12, 2) DEFAULT 0,
      server_seed VARCHAR(64) NOT NULL,
      server_seed_hash VARCHAR(64) NOT NULL,
      client_seed VARCHAR(64) NOT NULL,
      nonce INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_hilo_user_active
    ON public.hilo_rounds (user_id, status);
  `;

  console.log('public.hilo_rounds table and index created successfully.');
  process.exit(0);
}

main().catch(err => {
  console.error('Failed to create hilo_rounds table:', err);
  process.exit(1);
});
