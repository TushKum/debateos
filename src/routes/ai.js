import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { wrap, str, id, HttpError } from '../lib/http.js';
import { FORMATS } from '../../public/assets/js/formats.js';
import { enforceDailyLimit, structuredCall } from '../ai/claude.js';

const router = Router();
router.use(requireAuth);

const obj = (properties, required = Object.keys(properties)) =>
  ({ type: 'object', properties, required, additionalProperties: false });
const strArr = { type: 'array', items: { type: 'string' } };

const SPEECH_SCHEMA = obj({
  speech: { type: 'string', description: 'The full spoken text of the speech, in paragraphs.' },
  signposting: strArr,
  arguments: { type: 'array', items: obj({ claim: { type: 'string' }, mechanism: { type: 'string' }, impact: { type: 'string' } }) },
  rebuttals: { type: 'array', items: obj({ target: { type: 'string' }, response: { type: 'string' } }) },
  weighing: { type: 'string' },
  poi_to_offer: { type: 'string', description: 'A short Point of Information the AI would offer the next opposing speaker, or empty string.' }
});

const REPORT_SCHEMA = obj({
  decision: { type: 'string', description: 'Who won (or ranking in BP) in one sentence.' },
  rfd: { type: 'string', description: 'Reason for decision, 2–4 paragraphs, referencing specific moments.' },
  user_score: { type: 'number', description: "Estimated speaker score for the user's speeches on the format's scale." },
  score_scale: { type: 'string' },
  rubric: { type: 'array', items: obj({ criterion: { type: 'string' }, score: { type: 'integer', description: '0-100' }, comment: { type: 'string' } }) },
  clashes: { type: 'array', items: obj({ clash: { type: 'string' }, winner: { type: 'string' }, why: { type: 'string' } }) },
  strengths: strArr,
  improvements: strArr,
  missed_arguments: strArr,
  drills: { type: 'array', items: obj({ name: { type: 'string' }, how: { type: 'string' } }) },
  per_speech: { type: 'array', items: obj({ speech: { type: 'string' }, speaker: { type: 'string' }, feedback: { type: 'string' } }) },
  stats: obj({
    user_words: { type: 'integer' },
    user_words_per_minute: { type: 'integer' },
    filler_words: { type: 'integer' },
    arguments_made: { type: 'integer' },
    rebuttals_made: { type: 'integer' }
  })
});

function validate(body) {
  const format = FORMATS[body.format];
  if (!format) throw new HttpError(400, 'Unknown format');
  const motion = str(body.motion, 600);
  if (motion.length < 8) throw new HttpError(400, 'A motion is required');
  const infoslide = str(body.infoslide, 2000);
  const transcript = Array.isArray(body.transcript) ? body.transcript.slice(0, 20).map(t => ({
    speechId: str(t.speechId, 10),
    speaker: t.speaker === 'ai' ? 'ai' : 'user',
    text: str(t.text, 15000),
    seconds: Math.max(0, Math.min(3600, Number(t.seconds) || 0))
  })) : [];
  return { format, motion, infoslide, transcript };
}

function renderTranscript(format, transcript) {
  if (!transcript.length) return '(no speeches yet)';
  return transcript.map(t => {
    const sp = format.speeches.find(x => x.id === t.speechId);
    const who = t.speaker === 'ai' ? 'AI' : 'Human user';
    return `### ${sp?.name ?? t.speechId} — ${format.sides[sp?.side] ?? sp?.side ?? ''} — delivered by ${who} (${Math.round(t.seconds)}s)\n${t.text || '(no words captured)'}`;
  }).join('\n\n');
}

const DIFFICULTY = {
  novice: 'Debate like a solid novice: clear structure, two well-explained arguments, simple rebuttal.',
  open: 'Debate like a strong open-level university debater: sophisticated mechanisms, direct clash, explicit weighing.',
  finals: 'Debate like a WUDC grand finalist: highly strategic framing, deep mechanisms, anticipates and pre-empts responses, precise comparative weighing.'
};

router.post('/speech', wrap(async (req, res) => {
  await enforceDailyLimit(req.user);
  const { format, motion, infoslide, transcript } = validate(req.body);
  const speech = format.speeches.find(x => x.id === req.body.speechId);
  if (!speech) throw new HttpError(400, 'Unknown speech');
  const difficulty = DIFFICULTY[req.body.difficulty] || DIFFICULTY.open;
  const words = Math.round(speech.minutes * 150);

  const instructions = `You are DebateOS's AI debater in a practice ${format.fullName} round against a human.
Format rules: ${format.rules}
${difficulty}
Write a speech that can be read aloud in about ${speech.minutes} minutes (~${words} words). Use natural spoken English with clear signposting.
Stay in role: respond directly to what the human actually said in the transcript, using their words. Never invent quotes from speeches that were not given.
${speech.kind === 'reply' ? 'This is a reply speech: no new arguments, give a biased summary of the key clashes and why your side won them.' : ''}
${speech.kind === 'cross' ? 'This is a cross-examination/crossfire segment: write it as the questions you ask (or answers you give) to the opposing side, formatted as short Q/A lines addressed to the human.' : ''}`;

  const prompt = `Motion: ${motion}
${infoslide ? `Info slide: ${infoslide}\n` : ''}
You are delivering: ${speech.name} for ${format.sides[speech.side] ?? speech.side}.

Transcript so far:
${renderTranscript(format, transcript)}`;

  const result = await structuredCall({
    userId: req.user.id, kind: 'speech', instructions, prompt,
    schema: SPEECH_SCHEMA, effort: 'medium', maxTokens: 16000
  });
  res.json(result);
}));

router.post('/report', wrap(async (req, res) => {
  await enforceDailyLimit(req.user);
  const { format, motion, infoslide, transcript } = validate(req.body);
  if (!transcript.some(t => t.speaker === 'user')) throw new HttpError(400, 'Deliver at least one speech before requesting feedback');

  const instructions = `You are the adjudicator for a practice ${format.fullName} round on DebateOS. A human debated against an AI.
Format rules: ${format.rules}
Produce an honest, analytical adjudication focused on helping the human improve. Score on the format's usual scale (${format.scoreRange.join('–')}).
Transcripts come from live speech recognition, so ignore transcription errors and missing punctuation, but do note if a speech was far shorter than the time limit.
Count filler words ("um", "uh", "like", "you know") and words-per-minute for the human's speeches from the transcript and durations.`;

  const prompt = `Motion: ${motion}
${infoslide ? `Info slide: ${infoslide}\n` : ''}
Full transcript:
${renderTranscript(format, transcript)}`;

  const report = await structuredCall({
    userId: req.user.id, kind: 'report', instructions, prompt,
    schema: REPORT_SCHEMA, effort: 'high', maxTokens: 32000
  });

  const { rows } = await pool.query(
    'INSERT INTO ai_debates (user_id, format, motion, transcript, report) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [req.user.id, format.id, motion, JSON.stringify(transcript), JSON.stringify(report)]
  );
  res.json({ id: rows[0].id, report });
}));

router.get('/debates', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, format, motion, created_at, report->>'decision' AS decision, (report->>'user_score')::numeric AS user_score
       FROM ai_debates WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json({ debates: rows });
}));

router.get('/debates/:id', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM ai_debates WHERE id = $1 AND user_id = $2', [id(req.params.id), req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'Not found');
  res.json({ debate: rows[0] });
}));

export default router;
