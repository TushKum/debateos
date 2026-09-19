import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db.js';
import { CORE_KNOWLEDGE } from './knowledge.js';
import { HttpError } from '../lib/http.js';

const MODEL = 'claude-opus-5';
let client = null;

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, 'AI is not configured yet (ANTHROPIC_API_KEY missing)');
  client ??= new Anthropic();
  return client;
}

let knowledgeCache = { at: 0, text: '' };
async function knowledgeBase() {
  if (Date.now() - knowledgeCache.at < 60_000) return knowledgeCache.text;
  const { rows } = await pool.query(
    'SELECT title, source_url, content FROM ai_knowledge WHERE enabled ORDER BY id'
  );
  const extra = rows.map(r => `## ${r.title}${r.source_url ? ` (source: ${r.source_url})` : ''}\n${r.content}`).join('\n\n');
  knowledgeCache = { at: Date.now(), text: extra ? `${CORE_KNOWLEDGE}\n\n# Additional reference material\n\n${extra}` : CORE_KNOWLEDGE };
  return knowledgeCache.text;
}

export async function enforceDailyLimit(user) {
  if (user.role === 'admin') return;
  const limit = Number(process.env.AI_DAILY_LIMIT || 60);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM ai_usage WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'`,
    [user.id]
  );
  if (rows[0].n >= limit) throw new HttpError(429, `Daily AI limit reached (${limit} requests). Try again tomorrow.`);
}

// Runs one structured-output request. The system prompt (knowledge base) is cached across calls.
export async function structuredCall({ userId, kind, instructions, prompt, schema, effort, maxTokens }) {
  const system = [
    { type: 'text', text: await knowledgeBase(), cache_control: { type: 'ephemeral' } },
    { type: 'text', text: instructions }
  ];
  let response;
  try {
    response = await getClient().beta.messages.stream({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort, format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: prompt }]
    }).finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new HttpError(429, 'The AI is busy right now. Please retry in a minute.');
    if (err instanceof Anthropic.APIConnectionError) throw new HttpError(502, 'Could not reach the AI service.');
    if (err instanceof Anthropic.APIError) {
      console.error('Claude API error', err.status, err.message);
      throw new HttpError(502, 'The AI service returned an error.');
    }
    throw err;
  }

  await pool.query(
    'INSERT INTO ai_usage (user_id, kind, input_tokens, output_tokens) VALUES ($1, $2, $3, $4)',
    [userId, kind, response.usage.input_tokens ?? 0, response.usage.output_tokens ?? 0]
  );

  if (response.stop_reason === 'refusal') throw new HttpError(422, 'The AI declined this request. Try a different motion.');
  if (response.stop_reason === 'max_tokens') throw new HttpError(502, 'The AI response was cut off. Please retry.');
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, 'The AI returned an unreadable response. Please retry.');
  }
}
