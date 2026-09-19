import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { wrap, str, id, HttpError } from '../lib/http.js';
import { CIRCUIT_ROLES } from './auth.js';

const router = Router();
router.use(requireAuth);

const PROFILE = 'u.id, u.name, u.circuit_role, u.institution, u.country, u.bio, u.last_seen_at';

// Directory with each person's connection status relative to the viewer.
router.get('/people', wrap(async (req, res) => {
  const q = `%${str(req.query.q, 80)}%`;
  const role = CIRCUIT_ROLES.includes(req.query.role) ? req.query.role : null;
  const { rows } = await pool.query(
    `SELECT ${PROFILE},
            c.id AS connection_id, c.status AS connection_status,
            (c.requester_id = $1) AS requested_by_me
       FROM users u
       LEFT JOIN connections c
         ON (c.requester_id = $1 AND c.addressee_id = u.id) OR (c.addressee_id = $1 AND c.requester_id = u.id)
      WHERE u.id <> $1 AND NOT u.is_banned
        AND (u.name ILIKE $2 OR COALESCE(u.institution, '') ILIKE $2 OR COALESCE(u.country, '') ILIKE $2)
        AND ($3::text IS NULL OR u.circuit_role = $3)
      ORDER BY u.last_seen_at DESC NULLS LAST, u.name
      LIMIT 60`,
    [req.user.id, q, role]
  );
  res.json({ people: rows });
}));

router.get('/people/:id', wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT ${PROFILE}, u.created_at FROM users u WHERE u.id = $1 AND NOT u.is_banned`, [id(req.params.id)]);
  if (!rows[0]) throw new HttpError(404, 'Person not found');
  res.json({ person: rows[0] });
}));

router.get('/connections', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id AS connection_id, c.status, c.requester_id = $1 AS requested_by_me, ${PROFILE}
       FROM connections c
       JOIN users u ON u.id = CASE WHEN c.requester_id = $1 THEN c.addressee_id ELSE c.requester_id END
      WHERE c.requester_id = $1 OR c.addressee_id = $1
      ORDER BY c.status DESC, c.created_at DESC`,
    [req.user.id]
  );
  res.json({ connections: rows });
}));

router.post('/connections', wrap(async (req, res) => {
  const other = id(req.body.user_id);
  if (other === Number(req.user.id)) throw new HttpError(400, 'You cannot connect with yourself');
  // If they already asked us, accept instead of creating a duplicate request.
  const reverse = await pool.query(
    `UPDATE connections SET status = 'accepted' WHERE requester_id = $1 AND addressee_id = $2 RETURNING id`,
    [other, req.user.id]
  );
  if (reverse.rows[0]) return res.json({ status: 'accepted' });
  await pool.query(
    `INSERT INTO connections (requester_id, addressee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.user.id, other]
  );
  res.status(201).json({ status: 'pending' });
}));

router.post('/connections/:id/accept', wrap(async (req, res) => {
  const { rowCount } = await pool.query(
    `UPDATE connections SET status = 'accepted' WHERE id = $1 AND addressee_id = $2`,
    [id(req.params.id), req.user.id]
  );
  if (!rowCount) throw new HttpError(404, 'Request not found');
  res.json({ ok: true });
}));

router.delete('/connections/:id', wrap(async (req, res) => {
  await pool.query(
    'DELETE FROM connections WHERE id = $1 AND (requester_id = $2 OR addressee_id = $2)',
    [id(req.params.id), req.user.id]
  );
  res.json({ ok: true });
}));

router.get('/conversations', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `WITH mine AS (
       SELECT CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other_id, body, created_at, sender_id, read_at, recipient_id
         FROM messages WHERE sender_id = $1 OR recipient_id = $1
     ), latest AS (
       SELECT DISTINCT ON (other_id) other_id, body, created_at FROM mine ORDER BY other_id, created_at DESC
     )
     SELECT l.other_id AS id, u.name, u.circuit_role, u.institution, l.body AS last_body, l.created_at AS last_at,
            (SELECT COUNT(*)::int FROM mine m WHERE m.other_id = l.other_id AND m.recipient_id = $1 AND m.read_at IS NULL) AS unread
       FROM latest l JOIN users u ON u.id = l.other_id
      ORDER BY l.created_at DESC`,
    [req.user.id]
  );
  res.json({ conversations: rows });
}));

router.get('/unread', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM messages WHERE recipient_id = $1 AND read_at IS NULL) AS messages,
       (SELECT COUNT(*)::int FROM connections WHERE addressee_id = $1 AND status = 'pending') AS requests`,
    [req.user.id]
  );
  res.json(rows[0]);
}));

router.get('/messages/:userId', wrap(async (req, res) => {
  const other = id(req.params.userId);
  const after = Number(req.query.after) || 0;
  const { rows } = await pool.query(
    `SELECT id, sender_id, recipient_id, body, created_at, read_at FROM messages
      WHERE ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)) AND id > $3
      ORDER BY id DESC LIMIT 200`,
    [req.user.id, other, after]
  );
  await pool.query(
    'UPDATE messages SET read_at = NOW() WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL',
    [req.user.id, other]
  );
  res.json({ messages: rows.reverse() });
}));

router.post('/messages/:userId', wrap(async (req, res) => {
  const other = id(req.params.userId);
  const body = str(req.body.body, 4000);
  if (!body) throw new HttpError(400, 'Message is empty');
  const exists = await pool.query('SELECT 1 FROM users WHERE id = $1 AND NOT is_banned', [other]);
  if (!exists.rows[0]) throw new HttpError(404, 'Person not found');
  const { rows } = await pool.query(
    'INSERT INTO messages (sender_id, recipient_id, body) VALUES ($1, $2, $3) RETURNING id, sender_id, recipient_id, body, created_at, read_at',
    [req.user.id, other, body]
  );
  res.status(201).json({ message: rows[0] });
}));

export default router;
