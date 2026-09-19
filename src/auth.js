import jwt from 'jsonwebtoken';
import 'dotenv/config';
import { pool } from './db.js';

const secret = process.env.JWT_SECRET;
if (!secret) console.warn('JWT_SECRET is not set; login is disabled.');

export function signToken(user) {
  if (!secret) throw new Error('JWT_SECRET is required');
  return jwt.sign({ sub: String(user.id), role: user.role }, secret, { expiresIn: '7d' });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// Verifies the JWT and re-checks the user in the database so bans and role changes apply immediately.
export async function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  let payload;
  if (!secret) return res.status(503).json({ error: 'Login is not configured yet' });
  try {
    payload = jwt.verify(token, secret);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  const { rows } = await pool.query(
    `UPDATE users SET last_seen_at = NOW() WHERE id = $1
     RETURNING id, name, email, role, is_banned`,
    [payload.sub]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Account not found' });
  if (user.is_banned) return res.status(403).json({ error: 'This account has been suspended' });
  req.user = user;
  req.auth = { sub: String(user.id), role: user.role };
  next();
}

export async function optionalAuth(req, res, next) {
  if (!readToken(req)) return next();
  return requireAuth(req, res, next);
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}
