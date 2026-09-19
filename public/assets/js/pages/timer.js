import { $, esc, renderNav } from '../common.js';
import { FORMATS, FORMAT_LIST, fmtClock } from '../formats.js';
import { ring } from '../bell.js';
renderNav();

const params = new URLSearchParams(location.search);
let format = FORMATS[params.get('format')] || FORMATS.bp;
let index = 0;
let elapsed = 0;           // seconds into the current speech
let running = false;
let lastTick = 0;
let rung = new Set();
const done = new Set();
let motions = [];
let currentMotion = null;

// Bank and prep timers: { key: { total, left, running } }
let banks = {};

$('#format').innerHTML = FORMAT_LIST.map(f => `<option value="${f.id}">${f.fullName} (${f.name})</option>`).join('');
$('#format').value = format.id;

function speech() { return format.speeches[index]; }

function setupFormat() {
  $('#fmtName').textContent = format.fullName;
  $('#fmtRules').textContent = format.rules;
  $('#fmtSource').href = format.source;
  index = 0; done.clear();
  banks = {};
  if (format.prep) banks.prep = { label: format.prep.label, total: format.prep.minutes * 60, left: format.prep.minutes * 60, running: false };
  if (format.prepBank) {
    for (const [key, label] of Object.entries(format.sides)) banks[key] = { label: `${label} prep`, total: format.prepBank.minutes * 60, left: format.prepBank.minutes * 60, running: false };
  }
  renderBanks();
  resetSpeech();
  const url = new URL(location.href);
  url.searchParams.set('format', format.id);
  history.replaceState(null, '', url);
}

function renderBanks() {
  $('#prepArea').innerHTML = Object.entries(banks).map(([key, b]) => `
    <div class="bank"><div><div class="tiny muted">${esc(b.label)}</div><strong id="bank-${key}">${fmtClock(b.left)}</strong></div>
      <div class="row" style="gap:6px"><button class="btn sm" data-bank="${key}" type="button">${b.running ? 'Pause' : 'Start'}</button><button class="btn sm ghost" data-bank-reset="${key}" type="button">↺</button></div></div>`).join('');
}

function renderSpeeches() {
  $('#speeches').innerHTML = format.speeches.map((s, i) => `
    <li><button type="button" data-i="${i}" class="${i === index ? 'current' : ''} ${done.has(i) && i !== index ? 'done' : ''}">
      <span>${esc(s.name)}</span><span class="side">${esc(s.side === 'BOTH' ? 'BOTH' : s.side)} · ${s.minutes}′</span></button></li>`).join('');
}

function resetSpeech() {
  running = false; elapsed = 0; rung = new Set();
  renderSpeeches();
  const s = speech();
  $('#stageTitle').textContent = s.name;
  $('#stageSide').textContent = format.sides[s.side] || (s.side === 'BOTH' ? 'Both teams' : s.side);
  $('#bellHint').textContent = s.poi
    ? `Bells: single at ${fmtClock(format.poi.protectedSeconds)} (POIs open) and ${fmtClock(s.minutes * 60 - format.poi.protectedSeconds)} (protected), double at ${fmtClock(s.minutes * 60)}, triple at +15s.`
    : s.maxOnly ? `Maximum ${s.minutes} minutes with a ${s.graceSeconds}-second grace period.` : `Double bell at ${fmtClock(s.minutes * 60)}; triple at +15s.`;
  draw();
}

function draw() {
  const s = speech();
  const limit = s.minutes * 60;
  const shown = $('#countDown').checked ? limit - elapsed : elapsed;
  $('#clock').textContent = fmtClock(shown);
  $('#clock').className = 'clock' + (elapsed > limit ? ' over' : elapsed > limit - 30 ? ' warn' : '');
  $('#progress').style.width = `${Math.min(100, (elapsed / limit) * 100)}%`;
  $('#startBtn').textContent = running ? 'Pause' : elapsed ? 'Resume' : 'Start';

  const st = $('#status');
  const p = format.poi?.protectedSeconds;
  if (elapsed > limit) { st.className = 'status over'; st.textContent = s.maxOnly && elapsed <= limit + (s.graceSeconds || 0) ? 'Grace period' : 'Time up'; }
  else if (!running && !elapsed) { st.className = 'status protected'; st.textContent = 'Ready'; }
  else if (s.poi && elapsed >= p && elapsed < limit - p) { st.className = 'status open'; st.textContent = 'POIs open'; }
  else if (s.poi) { st.className = 'status protected'; st.textContent = 'Protected time'; }
  else { st.className = 'status protected'; st.textContent = s.kind === 'cross' ? 'Cross-examination' : 'Speaking'; }
}

function bells() {
  const s = speech();
  const limit = s.minutes * 60;
  const once = (key, n) => { if (!rung.has(key)) { rung.add(key); ring(n); } };
  if (s.poi && elapsed >= format.poi.protectedSeconds) once('open', 1);
  if (s.poi && elapsed >= limit - format.poi.protectedSeconds) once('close', 1);
  if (elapsed >= limit) once('end', 2);
  if (elapsed >= limit + (s.graceSeconds || 15)) once('over', 3);
}

function tick(now) {
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  if (running) { elapsed += dt; bells(); draw(); }
  for (const [key, b] of Object.entries(banks)) {
    if (!b.running) continue;
    const before = b.left;
    b.left = Math.max(0, b.left - dt);
    if (key === 'prep' && before > 300 && b.left <= 300) ring(1);
    if (before > 0 && b.left === 0) { b.running = false; ring(2); renderBanks(); }
    const el = $(`#bank-${key}`);
    if (el) el.textContent = fmtClock(b.left);
  }
  requestAnimationFrame(tick);
}

function toggle() {
  running = !running;
  if (running) done.add(index);
  draw();
}
function next() {
  if (index < format.speeches.length - 1) { done.add(index); index++; resetSpeech(); }
}

$('#format').addEventListener('change', e => { format = FORMATS[e.target.value]; setupFormat(); });
$('#startBtn').addEventListener('click', toggle);
$('#resetBtn').addEventListener('click', resetSpeech);
$('#nextBtn').addEventListener('click', next);
$('#bellBtn').addEventListener('click', () => ring(1));
$('#countDown').addEventListener('change', draw);
$('#fsBtn').addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : $('#stage').requestFullscreen()));
$('#speeches').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) { index = Number(b.dataset.i); resetSpeech(); } });
$('#prepArea').addEventListener('click', e => {
  const b = e.target.closest('[data-bank]');
  const r = e.target.closest('[data-bank-reset]');
  if (b) { const bank = banks[b.dataset.bank]; bank.running = !bank.running; renderBanks(); }
  if (r) { const bank = banks[r.dataset.bankReset]; bank.left = bank.total; bank.running = false; renderBanks(); }
});
document.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  else if (e.key === 'n' || e.key === 'N' || e.key === 'ArrowRight') next();
  else if (e.key === 'r' || e.key === 'R') resetSpeech();
  else if (e.key === 'f' || e.key === 'F') $('#fsBtn').click();
});

// ── Motion generator ──
const isOutround = m => !/^Round \d+$/i.test(m.round);
function generate() {
  const tour = $('#mTour').value, year = $('#mYear').value, stage = $('#mStage').value;
  const pool = motions.filter(m => (!tour || m.tournament === tour) && (!year || String(m.year) === year) &&
    (!stage || (stage === 'out') === isOutround(m)));
  if (!pool.length) { $('#motionOut').innerHTML = '<p class="muted">No motions match those filters.</p>'; return; }
  currentMotion = pool[Math.floor(Math.random() * pool.length)];
  const m = currentMotion;
  $('#motionOut').innerHTML = `
    <div class="row"><span class="pill">${esc(m.tournament)} ${m.year}</span><span class="pill gray">${esc(m.round)}</span></div>
    <div class="motionBox">${esc(m.motion)}</div>
    ${m.infoslide ? `<div class="info"><strong>Info slide</strong>\n${esc(m.infoslide)}</div>` : ''}
    <div class="row">
      <button class="btn sm ghost" id="copyMotion" type="button">Copy</button>
      <button class="btn sm" id="startPrep" type="button">Start prep timer</button>
      <a class="btn sm cyan" href="arena.html?format=${format.id}&motion=${encodeURIComponent(m.motion)}&info=${encodeURIComponent(m.infoslide.slice(0, 1500))}">Debate this against AI →</a>
    </div>`;
  $('#copyMotion').onclick = () => navigator.clipboard.writeText(m.motion + (m.infoslide ? `\n\nInfo slide: ${m.infoslide}` : ''));
  $('#startPrep').onclick = () => {
    const key = banks.prep ? 'prep' : Object.keys(banks)[0];
    if (!key) return;
    banks[key].left = banks[key].total; banks[key].running = true; renderBanks();
    $('#prepArea').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
}
fetch('assets/motions.json').then(r => r.json()).then(list => {
  motions = list;
  $('#mTour').innerHTML += [...new Set(list.map(m => m.tournament))].map(t => `<option>${esc(t)}</option>`).join('');
  $('#mYear').innerHTML += [...new Set(list.map(m => m.year))].sort((a, b) => b - a).map(y => `<option>${y}</option>`).join('');
});
$('#generate').addEventListener('click', generate);

setupFormat();
lastTick = performance.now();
requestAnimationFrame(tick);
