import { sql } from '../lib/db.js';

async function main() {
  console.log('Creating public.system_settings table...');
  await sql`
    CREATE TABLE IF NOT EXISTS public.system_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // Initialize profit_target setting if not exists
  const existing = await sql`SELECT value FROM public.system_settings WHERE key = 'profit_target'`;
  if (existing.length === 0) {
    await sql`
      INSERT INTO public.system_settings (key, value)
      VALUES ('profit_target', ${JSON.stringify({ enabled: false, percent: 50 })});
    `;
    console.log('Initialized default profit_target setting: { enabled: false, percent: 50 }');
  } else {
    console.log('Existing profit_target setting:', existing[0].value);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
