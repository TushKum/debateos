import fs from 'node:fs';
import 'dotenv/config';
import { pool } from '../src/db.js';

const sql = fs.readFileSync(new URL('../sql/schema.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('Schema is up to date.');
await pool.end();
