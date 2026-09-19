import { Router } from 'express';
import { wrap } from '../lib/http.js';

// Official Global Debating Spreadsheet (public). The gviz CSV endpoint works for link-shared sheets.
const SHEET_ID = '1R9s3MAh1H_7rJ9NQhO18p6o7bvekrIDTk27l7emXk6o';
const GID = '1155692171';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;
export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/htmlview#gid=${GID}`;
const TTL_MS = 10 * 60 * 1000;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

let cache = { at: 0, data: null };

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// The sheet interleaves month banner rows and repeated header rows with tournament rows.
function toTournaments(rows) {
  const header = ['name', 'mode', 'date', 'timezone', 'registration', 'judgeRule', 'fees', 'profitStatus', 'teamCap', 'info'];
  let month = '';
  const out = [];
  for (const raw of rows) {
    const cells = raw.map(c => c.trim());
    const first = cells[0] || '';
    const monthHit = MONTHS.find(m => first.toLowerCase() === m || new RegExp(`\\b${m}\\b`, 'i').test(first) && /competition name/i.test(first));
    if (monthHit) { month = monthHit[0].toUpperCase() + monthHit.slice(1); continue; }
    if (/^competition name$/i.test(first)) continue;
    if (!first && !cells[2]) continue;
    const t = { month };
    header.forEach((key, i) => { t[key] = cells[i] || ''; });
    if (!t.name) t.name = 'Unnamed competition';
    out.push(t);
  }
  return out;
}

const router = Router();

router.get('/tournaments', wrap(async (_req, res) => {
  if (!cache.data || Date.now() - cache.at > TTL_MS) {
    try {
      const response = await fetch(CSV_URL, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Sheet responded ${response.status}`);
      cache = { at: Date.now(), data: toTournaments(parseCsv(await response.text())) };
    } catch (err) {
      console.error('Sheet fetch failed:', err.message);
      if (!cache.data) return res.status(502).json({ error: 'Could not load the spreadsheet right now', sheetUrl: SHEET_URL });
    }
  }
  res.json({ tournaments: cache.data, updatedAt: new Date(cache.at).toISOString(), sheetUrl: SHEET_URL });
}));

export default router;
