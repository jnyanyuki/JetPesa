import { Pool, neon } from '@neondatabase/serverless';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_NkvMT50Yjrng@ep-fancy-bread-bhqw5fab-pooler.c-10.eu-central-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';

// Direct tagged-template / query function via HTTP
export const sql = neon(connectionString);

// Serverless connection pool for transactions (BEGIN / COMMIT / ROLLBACK)
let poolInstance = null;

export function getPool() {
  if (!poolInstance) {
    poolInstance = new Pool({ connectionString });
  }
  return poolInstance;
}

/**
 * Executes a callback within an isolated ACID transaction.
 * Automatically commits on success, and rolls back on error.
 * @param {Function} callback - async (client) => result
 */
export async function withTransaction(callback) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default sql;
