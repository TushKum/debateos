import { Router } from 'express';
import { pool, tx } from '../db.js';
import { requireAuth, optionalAuth } from '../auth.js';
import { wrap, str, optStr, url, id, HttpError } from '../lib/http.js';
import { bpDraw, twoTeamDraw, allocateAdjudicators } from '../lib/draw.js';

const router = Router();

// ───────────── helpers ─────────────

async function loadTournament(tid) {
  const { rows } = await pool.query('SELECT * FROM tournaments WHERE id = $1', [tid]);
  if (!rows[0]) throw new HttpError(404, 'Tournament not found');
  return rows[0];
}

async function staffAccess(req, tid) {
  const t = await loadTournament(tid);
  if (req.user.role === 'admin' || String(t.owner_id) === String(req.user.id)) return { t, isOwner: true };
  const { rows } = await pool.query('SELECT role FROM tournament_staff WHERE tournament_id = $1 AND user_id = $2', [tid, req.user.id]);
  if (!rows.length) throw new HttpError(403, 'You are not staff for this tournament');
  return { t, isOwner: false, roles: rows.map(r => r.role) };
}

const manage = handler => wrap(async (req, res) => {
  const tid = id(req.params.tid);
  const access = await staffAccess(req, tid);
  return handler(req, res, { tid, ...access });
});

async function standings(tid, { speakersPerTeam }) {
  const teams = await pool.query(
    `SELECT t.id, t.name, t.institution,
            COALESCE(SUM(dt.points), 0)::int AS points,
            COUNT(dt.points)::int AS debates,
            COALESCE((SELECT SUM(ss.score) FROM speaker_scores ss JOIN speakers sp ON sp.id = ss.speaker_id
                       WHERE sp.team_id = t.id AND ss.speech_order <= $2), 0)::numeric AS speaks
       FROM teams t
       LEFT JOIN debate_teams dt ON dt.team_id = t.id
      WHERE t.tournament_id = $1
      GROUP BY t.id
      ORDER BY points DESC, speaks DESC, t.name`,
    [tid, speakersPerTeam]
  );
  const speakers = await pool.query(
    `SELECT sp.id, sp.name, t.name AS team, t.institution,
            COALESCE(SUM(ss.score), 0)::numeric AS total,
            COUNT(ss.score)::int AS speeches,
            ROUND(AVG(ss.score), 2) AS average
       FROM speakers sp
       JOIN teams t ON t.id = sp.team_id
       LEFT JOIN speaker_scores ss ON ss.speaker_id = sp.id AND ss.speech_order <= $2
      WHERE t.tournament_id = $1
      GROUP BY sp.id, t.name, t.institution
      ORDER BY total DESC, average DESC NULLS LAST, sp.name`,
    [tid, speakersPerTeam]
  );
  return { teams: teams.rows, speakers: speakers.rows };
}

// Full round data: debates with teams (and speakers), adjudicators, venue links, results.
async function roundsWithDraws(tid, { publicOnly }) {
  const rounds = (await pool.query(
    'SELECT * FROM rounds WHERE tournament_id = $1 ORDER BY seq', [tid]
  )).rows;
  const debates = (await pool.query(
    `SELECT d.id, d.round_id, d.bracket, d.result_entered, v.name AS venue, v.meet_url, v.discord_url, d.venue_id
       FROM debates d JOIN rounds r ON r.id = d.round_id LEFT JOIN venues v ON v.id = d.venue_id
      WHERE r.tournament_id = $1 ORDER BY d.bracket DESC, v.name NULLS LAST, d.id`, [tid]
  )).rows;
  const dTeams = (await pool.query(
    `SELECT dt.debate_id, dt.team_id, dt.position, dt.points, t.name, t.institution
       FROM debate_teams dt JOIN teams t ON t.id = dt.team_id WHERE t.tournament_id = $1`, [tid]
  )).rows;
  const dAdjs = (await pool.query(
    `SELECT da.debate_id, da.adjudicator_id, da.role, a.name, a.institution
       FROM debate_adjudicators da JOIN adjudicators a ON a.id = da.adjudicator_id WHERE a.tournament_id = $1
      ORDER BY CASE da.role WHEN 'chair' THEN 0 WHEN 'panel' THEN 1 ELSE 2 END, a.name`, [tid]
  )).rows;
  const scores = publicOnly ? [] : (await pool.query(
    `SELECT ss.* FROM speaker_scores ss JOIN debates d ON d.id = ss.debate_id JOIN rounds r ON r.id = d.round_id
      WHERE r.tournament_id = $1`, [tid]
  )).rows;

  return rounds
    .filter(r => !publicOnly || r.draw_released || r.motion_released)
    .map(r => ({
      ...r,
      motion: publicOnly && !r.motion_released ? null : r.motion,
      infoslide: publicOnly && !r.motion_released ? null : r.infoslide,
      debates: (publicOnly && !r.draw_released) ? [] : debates.filter(d => d.round_id === r.id).map(d => ({
        ...d,
        teams: dTeams.filter(x => x.debate_id === d.id).map(x => ({ ...x, points: publicOnly && !r.completed ? null : x.points })),
        adjudicators: dAdjs.filter(x => x.debate_id === d.id),
        scores: scores.filter(x => x.debate_id === d.id)
      }))
    }));
}

function slugify(s) {
  return str(s, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

// ───────────── public ─────────────

router.get('/public', wrap(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT t.slug, t.name, t.format, t.starts_on, t.description,
            (SELECT COUNT(*)::int FROM teams WHERE tournament_id = t.id) AS teams
       FROM tournaments t WHERE t.is_public ORDER BY COALESCE(t.starts_on, t.created_at::date) DESC LIMIT 100`
  );
  res.json({ tournaments: rows });
}));

async function publicTournament(slug) {
  const { rows } = await pool.query('SELECT * FROM tournaments WHERE slug = $1', [str(slug, 60)]);
  if (!rows[0]) throw new HttpError(404, 'Tournament not found');
  return rows[0];
}

router.get('/t/:slug', optionalAuth, wrap(async (req, res) => {
  const t = await publicTournament(req.params.slug);
  const participants = await pool.query(
    `SELECT t.id, t.name, t.institution, COALESCE(json_agg(s.name ORDER BY s.id) FILTER (WHERE s.id IS NOT NULL), '[]') AS speakers
       FROM teams t LEFT JOIN speakers s ON s.team_id = t.id WHERE t.tournament_id = $1 GROUP BY t.id ORDER BY t.name`, [t.id]
  );
  const adjs = await pool.query('SELECT name, institution, is_ia FROM adjudicators WHERE tournament_id = $1 ORDER BY is_ia DESC, name', [t.id]);
  res.json({
    tournament: {
      slug: t.slug, name: t.name, format: t.format, description: t.description, starts_on: t.starts_on,
      discord_url: t.discord_url, meet_url: t.meet_url, tab_released: t.tab_released, speakers_per_team: t.speakers_per_team
    },
    rounds: await roundsWithDraws(t.id, { publicOnly: true }),
    teams: participants.rows,
    adjudicators: adjs.rows,
    standings: t.tab_released ? await standings(t.id, { speakersPerTeam: t.speakers_per_team }) : null
  });
}));

// Private participant pages, reached by the code in each team's / adjudicator's personal link.
router.get('/t/:slug/team/:code', wrap(async (req, res) => {
  const t = await publicTournament(req.params.slug);
  const team = (await pool.query('SELECT id, name, institution FROM teams WHERE tournament_id = $1 AND code = $2', [t.id, str(req.params.code, 8)])).rows[0];
  if (!team) throw new HttpError(404, 'Participant link not recognised');
  team.speakers = (await pool.query('SELECT id, name FROM speakers WHERE team_id = $1 ORDER BY id', [team.id])).rows;
  const rounds = (await roundsWithDraws(t.id, { publicOnly: true }))
    .map(r => ({ ...r, debates: r.debates.filter(d => d.teams.some(x => String(x.team_id) === String(team.id))) }));
  res.json({ tournament: { name: t.name, slug: t.slug, format: t.format, discord_url: t.discord_url, meet_url: t.meet_url }, team, rounds });
}));

router.get('/t/:slug/adjudicator/:code', wrap(async (req, res) => {
  const t = await publicTournament(req.params.slug);
  const adj = (await pool.query('SELECT id, name, institution, is_ia FROM adjudicators WHERE tournament_id = $1 AND code = $2', [t.id, str(req.params.code, 8)])).rows[0];
  if (!adj) throw new HttpError(404, 'Participant link not recognised');
  const rounds = (await roundsWithDraws(t.id, { publicOnly: true }))
    .map(r => ({ ...r, debates: r.debates.filter(d => d.adjudicators.some(x => String(x.adjudicator_id) === String(adj.id))) }));
  for (const r of rounds) {
    for (const d of r.debates) {
      d.speakers = (await pool.query(
        'SELECT s.id, s.name, s.team_id FROM speakers s JOIN debate_teams dt ON dt.team_id = s.team_id WHERE dt.debate_id = $1 ORDER BY s.id', [d.id]
      )).rows;
    }
  }
  res.json({
    tournament: { name: t.name, slug: t.slug, format: t.format, discord_url: t.discord_url, meet_url: t.meet_url, speakers_per_team: t.speakers_per_team },
    adjudicator: adj, rounds
  });
}));

// ───────────── results ─────────────

async function saveResult(client, t, debateId, body) {
  const teams = (await client.query('SELECT team_id, position FROM debate_teams WHERE debate_id = $1', [debateId])).rows;
  if (!teams.length) throw new HttpError(404, 'Debate not found');
  const points = new Map((body.teams || []).map(x => [String(x.team_id), Number(x.points)]));
  const expected = t.format === 'bp' ? [0, 1, 2, 3] : [0, 1];
  const given = teams.map(x => points.get(String(x.team_id)));
  if (given.some(p => !Number.isInteger(p)) || [...given].sort().join() !== expected.join()) {
    throw new HttpError(400, t.format === 'bp' ? 'Give each team a unique rank (3, 2, 1, 0 points)' : 'Pick exactly one winning team');
  }

  const teamIds = teams.map(x => String(x.team_id));
  const speakers = (await client.query('SELECT id, team_id FROM speakers WHERE team_id = ANY($1::bigint[])', [teamIds])).rows;
  const speakerTeam = new Map(speakers.map(s => [String(s.id), String(s.team_id)]));
  const scores = (body.scores || []).map(s => ({ speaker_id: String(s.speaker_id), speech_order: Number(s.speech_order), score: Number(s.score) }));
  for (const s of scores) {
    if (!speakerTeam.has(s.speaker_id)) throw new HttpError(400, 'A score was given for a speaker who is not in this debate');
    if (!Number.isFinite(s.score) || s.score < 0 || s.score > 100) throw new HttpError(400, 'Speaker scores must be between 0 and 100');
    if (!Number.isInteger(s.speech_order) || s.speech_order < 1 || s.speech_order > t.speakers_per_team + 1) throw new HttpError(400, 'Invalid speech slot');
  }
  // Winner in two-team formats must have the higher total (low-point wins are not allowed).
  if (t.format !== 'bp' && scores.length) {
    const totals = new Map();
    for (const s of scores) totals.set(speakerTeam.get(s.speaker_id), (totals.get(speakerTeam.get(s.speaker_id)) || 0) + s.score);
    const winner = teams.find(x => points.get(String(x.team_id)) === 1);
    const loser = teams.find(x => points.get(String(x.team_id)) === 0);
    if ((totals.get(String(winner.team_id)) || 0) < (totals.get(String(loser.team_id)) || 0)) {
      throw new HttpError(400, 'The winning team must have the higher total speaker score');
    }
  }

  for (const x of teams) {
    await client.query('UPDATE debate_teams SET points = $1 WHERE debate_id = $2 AND team_id = $3', [points.get(String(x.team_id)), debateId, x.team_id]);
  }
  await client.query('DELETE FROM speaker_scores WHERE debate_id = $1', [debateId]);
  for (const s of scores) {
    await client.query('INSERT INTO speaker_scores (debate_id, speaker_id, speech_order, score) VALUES ($1, $2, $3, $4)', [debateId, s.speaker_id, s.speech_order, s.score]);
  }
  await client.query('UPDATE debates SET result_entered = TRUE WHERE id = $1', [debateId]);
}

router.post('/t/:slug/adjudicator/:code/ballot/:did', wrap(async (req, res) => {
  const t = await publicTournament(req.params.slug);
  const did = id(req.params.did);
  const { rows } = await pool.query(
    `SELECT r.completed FROM debate_adjudicators da
       JOIN adjudicators a ON a.id = da.adjudicator_id
       JOIN debates d ON d.id = da.debate_id JOIN rounds r ON r.id = d.round_id
      WHERE a.tournament_id = $1 AND a.code = $2 AND da.debate_id = $3 AND da.role = 'chair' AND r.draw_released`,
    [t.id, str(req.params.code, 8), did]
  );
  if (!rows[0]) throw new HttpError(403, 'Only the chair of this debate can submit its ballot');
  if (rows[0].completed) throw new HttpError(409, 'This round is closed; ask the tab team to edit results');
  await tx(client => saveResult(client, t, did, req.body));
  res.json({ ok: true });
}));

// ───────────── management ─────────────

router.use(requireAuth);

router.get('/mine', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT t.id, t.slug, t.name, t.format, t.starts_on, t.is_public, t.owner_id = $1 AS is_owner
       FROM tournaments t LEFT JOIN tournament_staff s ON s.tournament_id = t.id
      WHERE t.owner_id = $1 OR s.user_id = $1 ORDER BY t.id DESC`,
    [req.user.id]
  );
  res.json({ tournaments: rows });
}));

router.post('/', wrap(async (req, res) => {
  const name = str(req.body.name, 160);
  if (name.length < 3) throw new HttpError(400, 'Tournament name is required');
  const format = req.body.format === 'bp' ? 'bp' : 'twoteam';
  const spt = format === 'bp' ? 2 : Math.min(Math.max(Number(req.body.speakers_per_team) || 3, 1), 4);
  const slug = slugify(req.body.slug || name);
  if (slug.length < 3) throw new HttpError(400, 'Choose a URL name with at least 3 letters or numbers');
  try {
    const { rows } = await pool.query(
      `INSERT INTO tournaments (owner_id, slug, name, format, speakers_per_team, description, starts_on, discord_url, meet_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.user.id, slug, name, format, spt, optStr(req.body.description, 2000), req.body.starts_on || null, url(req.body.discord_url), url(req.body.meet_url)]
    );
    res.status(201).json({ tournament: rows[0] });
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, `The URL name "${slug}" is taken`);
    throw err;
  }
}));

router.get('/:tid/manage', manage(async (_req, res, { tid, t, isOwner }) => {
  const q = sql => pool.query(sql, [tid]).then(r => r.rows);
  const [teams, speakers, adjudicators, venues, staff] = await Promise.all([
    q('SELECT * FROM teams WHERE tournament_id = $1 ORDER BY name'),
    q('SELECT s.* FROM speakers s JOIN teams t ON t.id = s.team_id WHERE t.tournament_id = $1 ORDER BY s.id'),
    q('SELECT * FROM adjudicators WHERE tournament_id = $1 ORDER BY rating DESC, name'),
    q('SELECT * FROM venues WHERE tournament_id = $1 ORDER BY name'),
    q('SELECT s.user_id, s.role, u.name, u.email FROM tournament_staff s JOIN users u ON u.id = s.user_id WHERE s.tournament_id = $1')
  ]);
  for (const team of teams) team.speakers = speakers.filter(s => String(s.team_id) === String(team.id));
  res.json({
    tournament: t, isOwner, teams, adjudicators, venues, staff,
    rounds: await roundsWithDraws(tid, { publicOnly: false }),
    standings: await standings(tid, { speakersPerTeam: t.speakers_per_team })
  });
}));

router.patch('/:tid', manage(async (req, res, { tid, t }) => {
  const b = req.body;
  const pick = (key, fn) => (key in b ? fn(b[key]) : t[key]);
  const { rows } = await pool.query(
    `UPDATE tournaments SET name = $1, description = $2, starts_on = $3, discord_url = $4, meet_url = $5,
            is_public = $6, tab_released = $7 WHERE id = $8 RETURNING *`,
    [pick('name', v => str(v, 160) || t.name), pick('description', v => optStr(v, 2000)), pick('starts_on', v => v || null),
     pick('discord_url', url), pick('meet_url', url), pick('is_public', Boolean), pick('tab_released', Boolean), tid]
  );
  res.json({ tournament: rows[0] });
}));

router.delete('/:tid', manage(async (_req, res, { tid, isOwner }) => {
  if (!isOwner) throw new HttpError(403, 'Only the owner can delete a tournament');
  await pool.query('DELETE FROM tournaments WHERE id = $1', [tid]);
  res.json({ ok: true });
}));

router.post('/:tid/staff', manage(async (req, res, { tid, isOwner }) => {
  if (!isOwner) throw new HttpError(403, 'Only the owner can add staff');
  const role = ['tab', 'cap', 'equity'].includes(req.body.role) ? req.body.role : 'tab';
  const user = (await pool.query('SELECT id FROM users WHERE email = $1', [str(req.body.email, 255).toLowerCase()])).rows[0];
  if (!user) throw new HttpError(404, 'No DebateOS account uses that email yet — ask them to sign up first');
  await pool.query('INSERT INTO tournament_staff (tournament_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [tid, user.id, role]);
  res.status(201).json({ ok: true });
}));

router.delete('/:tid/staff/:uid/:role', manage(async (req, res, { tid, isOwner }) => {
  if (!isOwner) throw new HttpError(403, 'Only the owner can remove staff');
  await pool.query('DELETE FROM tournament_staff WHERE tournament_id = $1 AND user_id = $2 AND role = $3', [tid, id(req.params.uid), str(req.params.role, 12)]);
  res.json({ ok: true });
}));

// Teams accept speakers as an array of names.
router.post('/:tid/teams', manage(async (req, res, { tid, t }) => {
  const list = Array.isArray(req.body.teams) ? req.body.teams : [req.body];
  const created = await tx(async client => {
    const out = [];
    for (const item of list.slice(0, 500)) {
      const name = str(item.name, 120);
      if (!name) throw new HttpError(400, 'Every team needs a name');
      const speakers = (Array.isArray(item.speakers) ? item.speakers : []).map(s => str(s, 120)).filter(Boolean);
      if (speakers.length !== t.speakers_per_team) throw new HttpError(400, `${name}: add exactly ${t.speakers_per_team} speakers`);
      const team = (await client.query('INSERT INTO teams (tournament_id, name, institution) VALUES ($1, $2, $3) RETURNING *', [tid, name, optStr(item.institution, 160)])).rows[0];
      for (const s of speakers) await client.query('INSERT INTO speakers (team_id, name) VALUES ($1, $2)', [team.id, s]);
      out.push(team);
    }
    return out;
  });
  res.status(201).json({ teams: created });
}));

router.delete('/:tid/teams/:id', manage(async (req, res, { tid }) => {
  await pool.query('DELETE FROM teams WHERE id = $1 AND tournament_id = $2', [id(req.params.id), tid]);
  res.json({ ok: true });
}));

router.post('/:tid/adjudicators', manage(async (req, res, { tid }) => {
  const list = Array.isArray(req.body.adjudicators) ? req.body.adjudicators : [req.body];
  const created = [];
  for (const a of list.slice(0, 500)) {
    const name = str(a.name, 120);
    if (!name) throw new HttpError(400, 'Every adjudicator needs a name');
    const rating = Math.min(Math.max(Number(a.rating) || 5, 0), 10);
    created.push((await pool.query(
      'INSERT INTO adjudicators (tournament_id, name, institution, email, rating, is_ia) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [tid, name, optStr(a.institution, 160), optStr(a.email, 255), rating, Boolean(a.is_ia)]
    )).rows[0]);
  }
  res.status(201).json({ adjudicators: created });
}));

router.patch('/:tid/adjudicators/:id', manage(async (req, res, { tid }) => {
  const { rows } = await pool.query(
    'UPDATE adjudicators SET rating = COALESCE($1, rating), is_ia = COALESCE($2, is_ia) WHERE id = $3 AND tournament_id = $4 RETURNING *',
    [req.body.rating == null ? null : Math.min(Math.max(Number(req.body.rating), 0), 10), typeof req.body.is_ia === 'boolean' ? req.body.is_ia : null, id(req.params.id), tid]
  );
  res.json({ adjudicator: rows[0] });
}));

router.delete('/:tid/adjudicators/:id', manage(async (req, res, { tid }) => {
  await pool.query('DELETE FROM adjudicators WHERE id = $1 AND tournament_id = $2', [id(req.params.id), tid]);
  res.json({ ok: true });
}));

router.post('/:tid/venues', manage(async (req, res, { tid }) => {
  const name = str(req.body.name, 80);
  if (!name) throw new HttpError(400, 'Room name is required');
  const { rows } = await pool.query(
    'INSERT INTO venues (tournament_id, name, meet_url, discord_url) VALUES ($1, $2, $3, $4) RETURNING *',
    [tid, name, url(req.body.meet_url), url(req.body.discord_url)]
  );
  res.status(201).json({ venue: rows[0] });
}));

router.patch('/:tid/venues/:id', manage(async (req, res, { tid }) => {
  const { rows } = await pool.query(
    'UPDATE venues SET meet_url = $1, discord_url = $2 WHERE id = $3 AND tournament_id = $4 RETURNING *',
    [url(req.body.meet_url), url(req.body.discord_url), id(req.params.id), tid]
  );
  res.json({ venue: rows[0] });
}));

router.delete('/:tid/venues/:id', manage(async (req, res, { tid }) => {
  await pool.query('DELETE FROM venues WHERE id = $1 AND tournament_id = $2', [id(req.params.id), tid]);
  res.json({ ok: true });
}));

router.post('/:tid/rounds', manage(async (req, res, { tid }) => {
  const { rows: [{ next }] } = await pool.query('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM rounds WHERE tournament_id = $1', [tid]);
  const { rows } = await pool.query(
    'INSERT INTO rounds (tournament_id, seq, name, motion, infoslide) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [tid, next, str(req.body.name, 60) || `Round ${next}`, optStr(req.body.motion, 600), optStr(req.body.infoslide, 3000)]
  );
  res.status(201).json({ round: rows[0] });
}));

router.patch('/:tid/rounds/:rid', manage(async (req, res, { tid }) => {
  const r = (await pool.query('SELECT * FROM rounds WHERE id = $1 AND tournament_id = $2', [id(req.params.rid), tid])).rows[0];
  if (!r) throw new HttpError(404, 'Round not found');
  const b = req.body;
  const val = (k, fn) => (k in b ? fn(b[k]) : r[k]);
  const { rows } = await pool.query(
    `UPDATE rounds SET name = $1, motion = $2, infoslide = $3, draw_released = $4, motion_released = $5, completed = $6
      WHERE id = $7 RETURNING *`,
    [val('name', v => str(v, 60) || r.name), val('motion', v => optStr(v, 600)), val('infoslide', v => optStr(v, 3000)),
     val('draw_released', Boolean), val('motion_released', Boolean), val('completed', Boolean), r.id]
  );
  res.json({ round: rows[0] });
}));

router.delete('/:tid/rounds/:rid', manage(async (req, res, { tid }) => {
  await pool.query('DELETE FROM rounds WHERE id = $1 AND tournament_id = $2', [id(req.params.rid), tid]);
  res.json({ ok: true });
}));

router.post('/:tid/rounds/:rid/draw', manage(async (req, res, { tid, t }) => {
  const rid = id(req.params.rid);
  const round = (await pool.query('SELECT * FROM rounds WHERE id = $1 AND tournament_id = $2', [rid, tid])).rows[0];
  if (!round) throw new HttpError(404, 'Round not found');
  const entered = await pool.query('SELECT 1 FROM debates WHERE round_id = $1 AND result_entered LIMIT 1', [rid]);
  if (entered.rows[0]) throw new HttpError(409, 'Results have already been entered for this round; the draw cannot be regenerated');

  // Standings and history only from earlier rounds.
  const history = (await pool.query(
    `SELECT dt.team_id, dt.position, dt.points, d.id AS debate_id
       FROM debate_teams dt JOIN debates d ON d.id = dt.debate_id JOIN rounds r ON r.id = d.round_id
      WHERE r.tournament_id = $1 AND r.seq < $2`, [tid, round.seq]
  )).rows;
  const speaks = new Map((await pool.query(
    `SELECT sp.team_id, SUM(ss.score) AS total FROM speaker_scores ss JOIN speakers sp ON sp.id = ss.speaker_id
       JOIN debates d ON d.id = ss.debate_id JOIN rounds r ON r.id = d.round_id
      WHERE r.tournament_id = $1 AND r.seq < $2 GROUP BY sp.team_id`, [tid, round.seq]
  )).rows.map(x => [String(x.team_id), Number(x.total)]));

  const teamRows = (await pool.query('SELECT id, institution FROM teams WHERE tournament_id = $1', [tid])).rows;
  const teams = teamRows.map(tr => {
    const mine = history.filter(h => String(h.team_id) === String(tr.id));
    const positions = {};
    mine.forEach(h => { positions[h.position] = (positions[h.position] || 0) + 1; });
    const opponents = new Set(history.filter(h => mine.some(m => m.debate_id === h.debate_id) && String(h.team_id) !== String(tr.id)).map(h => h.team_id));
    return { id: tr.id, points: mine.reduce((s, h) => s + (h.points || 0), 0), speaks: speaks.get(String(tr.id)) || 0, positions, opponents };
  });

  let rooms;
  try {
    rooms = t.format === 'bp' ? bpDraw(teams) : twoTeamDraw(teams);
  } catch (err) {
    throw new HttpError(400, err.message);
  }
  const adjudicators = (await pool.query('SELECT id, rating, institution FROM adjudicators WHERE tournament_id = $1', [tid])).rows;
  const panels = allocateAdjudicators(rooms, adjudicators, new Map(teamRows.map(tr => [tr.id, tr.institution])));
  const venues = (await pool.query('SELECT id FROM venues WHERE tournament_id = $1 ORDER BY name', [tid])).rows;

  await tx(async client => {
    await client.query('DELETE FROM debates WHERE round_id = $1', [rid]);
    for (const [i, room] of rooms.entries()) {
      const d = (await client.query('INSERT INTO debates (round_id, venue_id, bracket) VALUES ($1, $2, $3) RETURNING id', [rid, venues[i]?.id ?? null, room.bracket])).rows[0];
      for (const team of room.teams) await client.query('INSERT INTO debate_teams (debate_id, team_id, position) VALUES ($1, $2, $3)', [d.id, team.team_id, team.position]);
      for (const a of panels[i]) await client.query('INSERT INTO debate_adjudicators (debate_id, adjudicator_id, role) VALUES ($1, $2, $3)', [d.id, a.adjudicator_id, a.role]);
    }
  });
  res.json({ ok: true, rooms: rooms.length, warning: venues.length < rooms.length ? `Only ${venues.length} rooms for ${rooms.length} debates — add more rooms and edit allocations.` : null });
}));

router.put('/:tid/debates/:did/allocation', manage(async (req, res, { tid }) => {
  const did = id(req.params.did);
  const ok = await pool.query('SELECT 1 FROM debates d JOIN rounds r ON r.id = d.round_id WHERE d.id = $1 AND r.tournament_id = $2', [did, tid]);
  if (!ok.rows[0]) throw new HttpError(404, 'Debate not found');
  const adjs = (Array.isArray(req.body.adjudicators) ? req.body.adjudicators : []).map(a => ({ id: id(a.id), role: ['chair', 'panel', 'trainee'].includes(a.role) ? a.role : 'panel' }));
  if (adjs.filter(a => a.role === 'chair').length > 1) throw new HttpError(400, 'Only one chair per debate');
  await tx(async client => {
    await client.query('UPDATE debates SET venue_id = $1 WHERE id = $2', [req.body.venue_id ? id(req.body.venue_id) : null, did]);
    await client.query('DELETE FROM debate_adjudicators WHERE debate_id = $1', [did]);
    for (const a of adjs) {
      await client.query(
        `INSERT INTO debate_adjudicators (debate_id, adjudicator_id, role)
         SELECT $1, id, $3 FROM adjudicators WHERE id = $2 AND tournament_id = $4`, [did, a.id, a.role, tid]);
    }
  });
  res.json({ ok: true });
}));

router.post('/:tid/debates/:did/result', manage(async (req, res, { tid, t }) => {
  const did = id(req.params.did);
  const ok = await pool.query('SELECT 1 FROM debates d JOIN rounds r ON r.id = d.round_id WHERE d.id = $1 AND r.tournament_id = $2', [did, tid]);
  if (!ok.rows[0]) throw new HttpError(404, 'Debate not found');
  await tx(client => saveResult(client, t, did, req.body));
  res.json({ ok: true });
}));

export default router;
