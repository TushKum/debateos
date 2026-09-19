import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { pool } from '../src/db.js';

const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || '');

if (!email || !password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first');
if (password.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters');

const passwordHash = await bcrypt.hash(password, 12);
await pool.query(
  `INSERT INTO users (name, email, password_hash, role)
   VALUES ($1, $2, $3, 'admin')
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'`,
  ['DebateOS Admin', email, passwordHash]
);
console.log(`Admin ready: ${email}`);
await pool.end();
