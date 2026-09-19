import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { Resend } from 'resend';
import { pool } from '../db.js';
import { requireAuth, signToken } from '../auth.js';
import { wrap, str, optStr, HttpError } from '../lib/http.js';

export const CIRCUIT_ROLES = ['debater', 'adjudicator', 'ia', 'cap', 'tab', 'equity', 'coach', 'organiser'];
const PUBLIC_FIELDS = 'id, name, email, role, circuit_role, institution, country, bio, created_at';

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const notificationEmail = process.env.NOTIFICATION_EMAIL;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

async function sendLoginNotification(user, req) {
  if (!resend || !notificationEmail) return;
  try {
    const { error } = await resend.emails.send({
      from: 'DebateOS <onboarding@resend.dev>',
      to: [notificationEmail],
      subject: `New DebateOS login: ${user.email}`,
      html: `
        <h2>New DebateOS Login</h2>
        <ul>
          <li><strong>Name:</strong> ${escapeHtml(user.name)}</li>
          <li><strong>Email:</strong> ${escapeHtml(user.email)}</li>
          <li><strong>Time:</strong> ${escapeHtml(new Date().toISOString())}</li>
          <li><strong>IP:</strong> ${escapeHtml(req.ip)}</li>
        </ul>`
    });
    if (error) console.error('Login notification email failed:', error);
  } catch (err) {
    console.error('Login notification email error:', err);
  }
}

router.post('/register', limiter, wrap(async (req, res) => {
  const name = str(req.body.name, 120);
  const email = str(req.body.email, 255).toLowerCase();
  const password = String(req.body.password || '');
  const circuitRole = CIRCUIT_ROLES.includes(req.body.circuit_role) ? req.body.circuit_role : 'debater';

  if (name.length < 2) throw new HttpError(400, 'Name is required');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Valid email is required');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, circuit_role, institution) VALUES ($1, $2, $3, $4, $5)
       RETURNING ${PUBLIC_FIELDS}`,
      [name, email, passwordHash, circuitRole, optStr(req.body.institution, 160)]
    );
    res.status(201).json({ user: rows[0], token: signToken(rows[0]) });
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'An account with this email already exists');
    throw err;
  }
}));

router.post('/login', limiter, wrap(async (req, res) => {
  const email = str(req.body.email, 255).toLowerCase();
  const password = String(req.body.password || '');
  const { rows } = await pool.query(`SELECT ${PUBLIC_FIELDS}, password_hash, is_banned FROM users WHERE email = $1`, [email]);

  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  if (user.is_banned) throw new HttpError(403, 'This account has been suspended');

  await pool.query(
    'INSERT INTO login_events (user_id, ip_address, user_agent) VALUES ($1, $2, $3)',
    [user.id, req.ip, req.get('user-agent') || null]
  );
  sendLoginNotification(user, req);

  delete user.password_hash;
  delete user.is_banned;
  res.json({ user, token: signToken(user) });
}));

router.get('/me', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`, [req.user.id]);
  res.json({ user: rows[0] });
}));

router.patch('/me', requireAuth, wrap(async (req, res) => {
  const name = str(req.body.name, 120);
  if (name.length < 2) throw new HttpError(400, 'Name is required');
  const circuitRole = CIRCUIT_ROLES.includes(req.body.circuit_role) ? req.body.circuit_role : 'debater';
  const { rows } = await pool.query(
    `UPDATE users SET name = $1, circuit_role = $2, institution = $3, country = $4, bio = $5
     WHERE id = $6 RETURNING ${PUBLIC_FIELDS}`,
    [name, circuitRole, optStr(req.body.institution, 160), optStr(req.body.country, 80), optStr(req.body.bio, 1000), req.user.id]
  );
  res.json({ user: rows[0] });
}));

router.post('/change-password', requireAuth, limiter, wrap(async (req, res) => {
  const next = String(req.body.new_password || '');
  if (next.length < 8) throw new HttpError(400, 'New password must be at least 8 characters');
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(String(req.body.current_password || ''), rows[0].password_hash))) {
    throw new HttpError(401, 'Current password is incorrect');
  }
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(next, 12), req.user.id]);
  res.json({ ok: true });
}));

export default router;
