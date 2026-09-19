import pg from 'pg';
import 'dotenv/config';
import { HttpError } from './lib/http.js';

const { Pool } = pg;
const url = process.env.DATABASE_URL;

const realPool = url
  ? new Pool({
    connectionString: url,
    ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 5
  })
  : null;

const notConfigured = () => { throw new HttpError(503, 'Database is not configured yet (DATABASE_URL missing)'); };

// Without DATABASE_URL the site still serves static pages; database routes return 503.
export const pool = realPool ?? { query: notConfigured, connect: notConfigured, end: async () => {} };

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
