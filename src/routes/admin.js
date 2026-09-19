import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { wrap, str, optStr, id, url, HttpError } from '../lib/http.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/stats', wrap(async (_req, res) => {
  const { rows } = await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM users) AS users,
    (SELECT COUNT(*)::int FROM users WHERE created_at > NOW() - INTERVAL '7 days') AS new_users_7d,
    (SELECT COUNT(*)::int FROM login_events WHERE logged_in_at > NOW() - INTERVAL '1 day') AS logins_24h,
    (SELECT COUNT(DISTINCT user_id)::int FROM login_events WHERE logged_in_at > NOW() - INTERVAL '7 days') AS active_7d,
    (SELECT COUNT(*)::int FROM ai_debates) AS ai_debates,
    (SELECT COUNT(*)::int FROM ai_usage WHERE created_at > NOW() - INTERVAL '1 day') AS ai_calls_24h,
    (SELECT COALESCE(SUM(input_tokens), 0)::bigint FROM ai_usage WHERE created_at > NOW() - INTERVAL '30 days') AS ai_input_tokens_30d,
    (SELECT COALESCE(SUM(output_tokens), 0)::bigint FROM ai_usage WHERE created_at > NOW() - INTERVAL '30 days') AS ai_output_tokens_30d,
    (SELECT COUNT(*)::int FROM tournaments) AS tournaments,
    (SELECT COUNT(*)::int FROM messages) AS messages,
    (SELECT COUNT(*)::int FROM connections WHERE status = 'accepted') AS connections`);
  const roles = await pool.query('SELECT circuit_role, COUNT(*)::int AS n FROM users GROUP BY circuit_role ORDER BY n DESC');
  res.json({ stats: rows[0], roles: roles.rows });
}));

router.get('/login-activity', wrap(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const { rows } = await pool.query(
    `SELECT le.id, le.logged_in_at, le.ip_address, le.user_agent, u.id AS user_id, u.name, u.email
       FROM login_events le JOIN users u ON u.id = le.user_id
      ORDER BY le.logged_in_at DESC LIMIT $1`,
    [limit]
  );
  res.json({ activity: rows });
}));

router.get('/users', wrap(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.circuit_role, u.institution, u.is_banned, u.created_at, u.last_seen_at,
            (SELECT COUNT(*)::int FROM login_events le WHERE le.user_id = u.id) AS login_count,
            (SELECT COUNT(*)::int FROM ai_debates d WHERE d.user_id = u.id) AS ai_debates
       FROM users u ORDER BY u.created_at DESC`
  );
  res.json({ users: rows });
}));

router.patch('/users/:id', wrap(async (req, res) => {
  const target = id(req.params.id);
  if (target === Number(req.user.id)) throw new HttpError(400, 'You cannot change your own admin status here');
  const role = ['user', 'admin'].includes(req.body.role) ? req.body.role : null;
  const banned = typeof req.body.is_banned === 'boolean' ? req.body.is_banned : null;
  const { rows } = await pool.query(
    `UPDATE users SET role = COALESCE($1, role), is_banned = COALESCE($2, is_banned) WHERE id = $3
     RETURNING id, role, is_banned`,
    [role, banned, target]
  );
  if (!rows[0]) throw new HttpError(404, 'User not found');
  res.json({ user: rows[0] });
}));

router.get('/tournaments', wrap(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT t.id, t.slug, t.name, t.format, t.is_public, t.created_at, u.name AS owner,
            (SELECT COUNT(*)::int FROM teams WHERE tournament_id = t.id) AS teams
       FROM tournaments t JOIN users u ON u.id = t.owner_id ORDER BY t.created_at DESC`
  );
  res.json({ tournaments: rows });
}));

router.get('/knowledge', wrap(async (_req, res) => {
  const { rows } = await pool.query('SELECT id, title, source_url, content, enabled, created_at FROM ai_knowledge ORDER BY id');
  res.json({ items: rows });
}));

router.post('/knowledge', wrap(async (req, res) => {
  const title = str(req.body.title, 200);
  const content = str(req.body.content, 60000);
  if (!title || !content) throw new HttpError(400, 'Title and content are required');
  const { rows } = await pool.query(
    'INSERT INTO ai_knowledge (title, source_url, content) VALUES ($1, $2, $3) RETURNING *',
    [title, url(req.body.source_url), content]
  );
  res.status(201).json({ item: rows[0] });
}));

router.patch('/knowledge/:id', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE ai_knowledge SET enabled = COALESCE($1, enabled), title = COALESCE($2, title), content = COALESCE($3, content)
      WHERE id = $4 RETURNING *`,
    [typeof req.body.enabled === 'boolean' ? req.body.enabled : null, optStr(req.body.title, 200), optStr(req.body.content, 60000), id(req.params.id)]
  );
  if (!rows[0]) throw new HttpError(404, 'Not found');
  res.json({ item: rows[0] });
}));

router.delete('/knowledge/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM ai_knowledge WHERE id = $1', [id(req.params.id)]);
  res.json({ ok: true });
}));

export default router;
