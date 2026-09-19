import { $, api, esc, getToken, renderNav, toast, download, fmtDate } from '../common.js';
import { FORMATS, FORMAT_LIST, fmtClock } from '../formats.js';
import { ring } from '../bell.js';
renderNav();

const params = new URLSearchParams(location.search);
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const state = {
  format: FORMATS[params.get('format')] || FORMATS.bp,
  userSpeeches: new Set(),
  transcript: [],     // [{ speechId, speaker, text, seconds, ai? }]
  index: -1,
  stream: null,
  recorder: null,
  chunks: [],
  recordingBlob: null,
  recognition: null,
  listening: false,
  finalText: '',
  speechStart: 0,
  clockTimer: null,
  pendingPoi: '',
  report: null
};

// ───────── setup ─────────
$('#format').innerHTML = FORMAT_LIST.map(f => `<option value="${f.id}">${f.fullName} (${f.name})</option>`).join('');
$('#format').value = state.format.id;
if (params.get('motion')) $('#motion').value = params.get('motion');
if (params.get('info')) $('#infoslide').value = params.get('info');

function sidesFor(format) {
  return Object.entries(format.sides);
}

function renderSetup() {
  const f = state.format;
  $('#rules').textContent = f.rules;
  const current = $('#side').value;
  $('#side').innerHTML = sidesFor(f).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  if (f.sides[current]) $('#side').value = current;
  const side = $('#side').value;
  state.userSpeeches = new Set(f.speeches.filter(s => s.side === side || (s.side === 'BOTH' && f.id !== 'oo')).map(s => s.id));
  $('#assign').innerHTML = f.speeches.map(s => `
    <label for="as-${s.id}">${esc(s.name)} <span class="tiny muted">${esc(f.sides[s.side] || 'Both')} · ${s.minutes} min</span></label>
    <input type="checkbox" id="as-${s.id}" data-speech="${s.id}" ${state.userSpeeches.has(s.id) ? 'checked' : ''}>`).join('');
}
$('#format').addEventListener('change', e => { state.format = FORMATS[e.target.value]; renderSetup(); });
$('#side').addEventListener('change', () => {
  const f = state.format, side = $('#side').value;
  state.userSpeeches = new Set(f.speeches.filter(s => s.side === side || s.side === 'BOTH').map(s => s.id));
  document.querySelectorAll('[data-speech]').forEach(cb => { cb.checked = state.userSpeeches.has(cb.dataset.speech); });
});
$('#assign').addEventListener('change', e => {
  const id = e.target.dataset.speech;
  if (id) e.target.checked ? state.userSpeeches.add(id) : state.userSpeeches.delete(id);
});
$('#randomMotion').addEventListener('click', async () => {
  const list = await fetch('assets/motions.json').then(r => r.json());
  const m = list[Math.floor(Math.random() * list.length)];
  $('#motion').value = m.motion;
  $('#infoslide').value = m.infoslide;
  toast(`${m.tournament} ${m.year} · ${m.round}`);
});

if (!Recognition) {
  $('#support').hidden = false;
  $('#support').textContent = 'Live transcription needs Chrome, Edge or Safari. In this browser you can still debate by typing or pasting your speeches.';
}
renderSetup();

// ───────── devices & recording ─────────
async function startDevices() {
  const video = $('#useCam').checked;
  const audio = $('#useMic').checked;
  if (!video && !audio) return;
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: video ? { width: 1280, height: 720 } : false, audio });
  } catch (err) {
    toast(`Camera/mic unavailable: ${err.message}. Continuing without recording.`, 'error');
    return;
  }
  if (video) { $('#video').srcObject = state.stream; $('#video').hidden = false; }
  if (window.MediaRecorder) {
    const types = ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4', 'audio/webm'];
    const mimeType = types.find(t => MediaRecorder.isTypeSupported(t));
    state.recorder = new MediaRecorder(state.stream, mimeType ? { mimeType } : undefined);
    state.recorder.ondataavailable = e => { if (e.data.size) state.chunks.push(e.data); };
    state.recorder.onstop = () => { state.recordingBlob = new Blob(state.chunks, { type: state.recorder.mimeType }); };
    state.recorder.start(1000);
    $('#recBadge').hidden = false;
  }
}

function stopDevices() {
  if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop();
  state.stream?.getTracks().forEach(t => t.stop());
  $('#recBadge').hidden = true;
  stopListening();
}

// ───────── transcription ─────────
function startListening() {
  if (!Recognition || !$('#useMic').checked) return;
  const rec = new Recognition();
  rec.lang = $('#lang').value;
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) state.finalText += (state.finalText ? ' ' : '') + r[0].transcript.trim();
      else interim += r[0].transcript;
    }
    $('#manual').value = state.finalText;
    $('#live').innerHTML = `${esc(state.finalText)} <span class="interim">${esc(interim)}</span>`;
    $('#live').scrollTop = $('#live').scrollHeight;
  };
  // Chrome ends recognition after silences; restart while the speaker is still on the floor.
  rec.onend = () => { if (state.listening) { try { rec.start(); } catch { /* already started */ } } };
  rec.onerror = e => { if (e.error === 'not-allowed') { toast('Microphone permission denied', 'error'); state.listening = false; } };
  state.recognition = rec;
  state.listening = true;
  rec.start();
}

function stopListening() {
  state.listening = false;
  try { state.recognition?.stop(); } catch { /* not running */ }
  state.recognition = null;
}

// ───────── round flow ─────────
const speechAt = i => state.format.speeches[i];
const isUser = s => state.userSpeeches.has(s.id);

function renderFlow() {
  const f = state.format;
  $('#flow').innerHTML = f.speeches.map((s, i) => {
    const t = state.transcript.find(x => x.speechId === s.id);
    const who = isUser(s) ? 'user' : 'ai';
    const label = isUser(s) ? 'You' : 'AI';
    if (!t) return `<div class="entry ${who} pending"><h4>${esc(s.name)} · ${label}</h4><div class="tiny muted">${i === state.index ? 'In progress…' : 'Upcoming'}</div></div>`;
    const ai = t.ai;
    return `<div class="entry ${who}"><h4>${esc(s.name)} · ${label} <span class="tiny muted">${fmtClock(t.seconds)}</span></h4>
      ${ai?.arguments?.length ? ai.arguments.map(a => `<div class="arg"><strong>${esc(a.claim)}</strong><br><span class="muted">Mechanism:</span> ${esc(a.mechanism)}<br><span class="muted">Impact:</span> ${esc(a.impact)}</div>`).join('') : ''}
      ${ai?.rebuttals?.length ? `<div class="arg"><strong>Rebuttals</strong>${ai.rebuttals.map(r => `<br>↳ <em>${esc(r.target)}</em>: ${esc(r.response)}`).join('')}</div>` : ''}
      ${ai?.weighing ? `<div class="arg"><strong>Weighing</strong><br>${esc(ai.weighing)}</div>` : ''}
      <details ${ai ? '' : 'open'}><summary class="small" style="cursor:pointer">Full text</summary><div class="text">${esc(t.text) || '<em>No words captured</em>'}</div></details></div>`;
  }).join('');
  const current = state.transcript.length;
  $('#progressText').textContent = `Speech ${Math.min(state.index + 1, f.speeches.length)} of ${f.speeches.length} · ${current} completed`;
}

function startClock(limitSeconds, hint) {
  clearInterval(state.clockTimer);
  state.speechStart = Date.now();
  const rung = new Set();
  const poiWindow = state.format.poi?.protectedSeconds;
  const s = speechAt(state.index);
  $('#clockHint').textContent = hint;
  const tick = () => {
    const elapsed = (Date.now() - state.speechStart) / 1000;
    $('#clock').textContent = fmtClock(elapsed);
    $('#clock').style.color = elapsed > limitSeconds ? '#f87171' : elapsed > limitSeconds - 30 ? '#fbbf24' : '';
    if (isUser(s)) {
      const once = (k, n) => { if (!rung.has(k)) { rung.add(k); ring(n); } };
      if (s.poi && elapsed >= poiWindow) once('open', 1);
      if (s.poi && elapsed >= limitSeconds - poiWindow) once('close', 1);
      if (elapsed >= limitSeconds) once('end', 2);
      // Offer the AI's POI once POIs are open.
      if (s.poi && state.pendingPoi && elapsed >= poiWindow + 30 && elapsed < limitSeconds - poiWindow && $('#poiBox').hidden) {
        $('#poiBox').hidden = false;
        $('#poiBox').innerHTML = `<strong>AI offers a Point of Information</strong><div class="row" style="margin-top:6px"><button class="btn sm" id="acceptPoi" type="button">Accept</button><button class="btn sm ghost" id="declinePoi" type="button">Decline</button></div>`;
        $('#acceptPoi').onclick = () => {
          $('#poiBox').innerHTML = `<strong>POI:</strong> ${esc(state.pendingPoi)}<br><span class="tiny">Answer it in your speech.</span>`;
          state.finalText += ` [Accepted POI from AI: "${state.pendingPoi}"]`;
          $('#manual').value = state.finalText;
          state.pendingPoi = '';
        };
        $('#declinePoi').onclick = () => { $('#poiBox').hidden = true; state.pendingPoi = ''; };
      }
    }
  };
  tick();
  state.clockTimer = setInterval(tick, 250);
}

function elapsedSeconds() { return (Date.now() - state.speechStart) / 1000; }

async function nextSpeech() {
  state.index++;
  $('#poiBox').hidden = true;
  if (state.index >= state.format.speeches.length) return finishRound();
  const s = speechAt(state.index);
  $('#curTitle').textContent = s.name;
  $('#curSide').textContent = `${state.format.sides[s.side] || 'Both sides'} · ${isUser(s) ? 'You' : 'AI'} · ${s.minutes} min`;
  renderFlow();
  if (isUser(s)) return userTurn(s);
  return aiTurn(s);
}

async function userTurn(s) {
  $('#userPanel').hidden = false;
  $('#aiPanel').hidden = true;
  state.finalText = '';
  $('#manual').value = '';
  $('#live').innerHTML = `<span class="muted">${s.kind === 'cross' ? 'Cross-examination: ask or answer questions aloud.' : 'Press "Start speaking" when you are ready.'}</span>`;
  $('#speakBtn').hidden = false;
  $('#speakBtn').textContent = 'Start speaking';
  $('#clock').textContent = fmtClock(0);
  $('#clockHint').textContent = `${s.minutes}:00 limit`;
  clearInterval(state.clockTimer);

  // Cross-ex segments open with the AI's questions/answers so the user can respond.
  if (s.kind === 'cross') {
    $('#live').innerHTML = '<span class="spinner"></span> AI is preparing its cross-examination…';
    try {
      const ai = await requestAiSpeech(s);
      state.crossPrompt = ai.speech;
      $('#live').innerHTML = `<strong>AI:</strong>\n${esc(ai.speech)}\n\n<span class="muted">Respond aloud, then finish.</span>`;
    } catch (err) {
      $('#live').textContent = `AI unavailable: ${err.message}`;
    }
  }
}

$('#speakBtn').addEventListener('click', () => {
  const s = speechAt(state.index);
  if (!state.listening) {
    startListening();
    startClock(s.minutes * 60, `${s.minutes}:00 limit${s.poi ? ' · POIs after 1:00' : ''}`);
    $('#speakBtn').hidden = true;
    if (!Recognition) toast('Live transcription is not supported here — type your key points in the box below.');
  }
});

$('#finishBtn').addEventListener('click', () => {
  const s = speechAt(state.index);
  stopListening();
  clearInterval(state.clockTimer);
  let text = ($('#manual').value || state.finalText).trim();
  if (state.crossPrompt) { text = `AI: ${state.crossPrompt}\n\nUser: ${text}`; state.crossPrompt = null; }
  state.transcript.push({ speechId: s.id, speaker: 'user', text, seconds: state.speechStart ? elapsedSeconds() : 0 });
  state.speechStart = 0;
  $('#userPanel').hidden = true;
  nextSpeech();
});

async function requestAiSpeech(s) {
  return api('/ai/speech', {
    method: 'POST',
    body: {
      format: state.format.id, motion: $('#motion').value, infoslide: $('#infoslide').value,
      speechId: s.id, difficulty: $('#difficulty').value,
      transcript: state.transcript.map(({ speechId, speaker, text, seconds }) => ({ speechId, speaker, text, seconds }))
    }
  });
}

async function aiTurn(s) {
  $('#userPanel').hidden = true;
  $('#aiPanel').hidden = false;
  $('#continueBtn').hidden = true;
  $('#aiStatus').innerHTML = '<span class="spinner"></span> The AI is preparing its speech…';
  clearInterval(state.clockTimer);
  $('#clock').textContent = fmtClock(0);
  let ai;
  try {
    ai = await requestAiSpeech(s);
  } catch (err) {
    $('#aiStatus').innerHTML = `Could not get the AI speech: ${esc(err.message)} <button class="btn sm" id="retryAi" type="button">Retry</button>`;
    $('#retryAi').onclick = () => aiTurn(s);
    return;
  }
  const seconds = Math.min(s.minutes * 60, Math.round(ai.speech.split(/\s+/).length / 2.5));
  state.transcript.push({ speechId: s.id, speaker: 'ai', text: ai.speech, seconds, ai });
  state.pendingPoi = ai.poi_to_offer || '';
  renderFlow();
  $('#aiStatus').innerHTML = `<strong>${esc(s.name)}</strong> delivered. ${ai.signposting?.length ? `<br><span class="small">Roadmap: ${ai.signposting.map(esc).join(' → ')}</span>` : ''}`;
  $('#continueBtn').hidden = false;
  if ($('#tts').checked && window.speechSynthesis) {
    const u = new SpeechSynthesisUtterance(ai.speech);
    u.lang = $('#lang').value;
    u.rate = 1.05;
    u.onend = () => { $('#stopTts').hidden = true; };
    speechSynthesis.speak(u);
    $('#stopTts').hidden = false;
    startClock(s.minutes * 60, 'AI speaking');
  }
}
$('#stopTts').addEventListener('click', () => { speechSynthesis.cancel(); $('#stopTts').hidden = true; });
$('#continueBtn').addEventListener('click', () => { speechSynthesis?.cancel(); clearInterval(state.clockTimer); nextSpeech(); });

$('#startRound').addEventListener('click', async () => {
  if (!getToken()) { location.href = `auth.html?next=${encodeURIComponent('arena.html' + location.search)}`; return; }
  if ($('#motion').value.trim().length < 8) { toast('Enter or generate a motion first', 'error'); return; }
  if (!state.userSpeeches.size) { toast('Tick at least one speech for yourself', 'error'); return; }
  $('#setup').hidden = true;
  $('#round').hidden = false;
  $('#historyLink').hidden = true;
  $('#history').hidden = true;
  await startDevices();
  window.addEventListener('beforeunload', warnUnload);
  nextSpeech();
});

$('#endEarly').addEventListener('click', () => {
  if (!state.transcript.some(t => t.speaker === 'user')) {
    if (confirm('You have not given a speech yet. Leave the round?')) location.reload();
    return;
  }
  finishRound();
});

function warnUnload(e) { e.preventDefault(); e.returnValue = ''; }

// ───────── report ─────────
async function finishRound() {
  stopListening();
  clearInterval(state.clockTimer);
  speechSynthesis?.cancel();
  stopDevices();
  $('#round').hidden = true;
  $('#reportView').hidden = false;
  $('#report').innerHTML = '<p><span class="spinner"></span> The adjudicator is writing your report… this can take a minute.</p>';
  try {
    const { report } = await api('/ai/report', {
      method: 'POST',
      body: {
        format: state.format.id, motion: $('#motion').value, infoslide: $('#infoslide').value,
        transcript: state.transcript.map(({ speechId, speaker, text, seconds }) => ({ speechId, speaker, text, seconds }))
      }
    });
    state.report = report;
    renderReport(report);
  } catch (err) {
    $('#report').innerHTML = `<p>Could not create the report: ${esc(err.message)}</p><div class="row"><button class="btn" id="retryReport" type="button">Retry</button></div>${downloadButtons()}`;
    $('#retryReport').onclick = finishRound;
    bindDownloads();
  }
  window.removeEventListener('beforeunload', warnUnload);
}

function downloadButtons() {
  return `<div class="row noprint">
    <button class="btn" id="dlVideo" type="button" ${state.chunks.length ? '' : 'disabled'}>⬇ Recording</button>
    <button class="btn ghost" id="dlTranscript" type="button">⬇ Transcript (.txt)</button>
    ${state.report ? '<button class="btn ghost" id="dlReport" type="button">⬇ Report (.json)</button><button class="btn ghost" id="printReport" type="button">🖨 Save report as PDF</button>' : ''}
    <a class="btn cyan" href="arena.html">New round</a></div>`;
}

function transcriptText() {
  const f = state.format;
  return [`DebateOS — ${f.fullName}`, `Motion: ${$('#motion').value}`, $('#infoslide').value ? `Info slide: ${$('#infoslide').value}` : '', `Date: ${new Date().toLocaleString()}`, '']
    .concat(state.transcript.map(t => {
      const s = f.speeches.find(x => x.id === t.speechId);
      return `== ${s.name} (${t.speaker === 'ai' ? 'AI' : 'You'}, ${fmtClock(t.seconds)}) ==\n${t.text}\n`;
    })).join('\n');
}

function bindDownloads() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  $('#dlVideo')?.addEventListener('click', () => {
    const blob = state.recordingBlob || new Blob(state.chunks, { type: state.recorder?.mimeType || 'video/webm' });
    download(`debateos-round-${stamp}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`, blob);
  });
  $('#dlTranscript')?.addEventListener('click', () => download(`debateos-transcript-${stamp}.txt`, transcriptText()));
  $('#dlReport')?.addEventListener('click', () => download(`debateos-report-${stamp}.json`, JSON.stringify({ motion: $('#motion').value, format: state.format.id, report: state.report, transcript: state.transcript }, null, 2), 'application/json'));
  $('#printReport')?.addEventListener('click', () => window.print());
}

function renderReport(r) {
  const f = state.format;
  const [min, max] = f.scoreRange;
  const pct = Math.max(0, Math.min(100, ((r.user_score - min) / (max - min)) * 100));
  $('#report').innerHTML = `
    <div class="row spread"><div><div class="eyebrow">Adjudication report · ${esc(f.fullName)}</div><h2 style="margin:4px 0">${esc(r.decision)}</h2><p class="small muted" style="margin:0">${esc($('#motion').value)}</p></div>
      <div style="text-align:right"><div class="score">${esc(r.user_score)}</div><div class="tiny muted">Your estimated speaker score (${esc(r.score_scale || `${min}–${max}`)})</div><div class="bar" style="width:180px;margin-left:auto"><i style="width:${pct}%"></i></div></div></div>
    ${downloadButtons()}
    <div class="grid g2">
      <div class="card"><h3>Reason for decision</h3><div style="white-space:pre-wrap;font-size:14px">${esc(r.rfd)}</div></div>
      <div class="card"><h3>Rubric</h3>${r.rubric.map(x => `<div class="meter"><span>${esc(x.criterion)}</span><div class="bar"><i style="width:${Math.max(0, Math.min(100, x.score))}%"></i></div><b>${x.score}</b></div><p class="tiny muted" style="margin:-4px 0 8px">${esc(x.comment)}</p>`).join('')}</div>
    </div>
    <div class="grid g4">
      ${[['Your words', r.stats.user_words], ['Words / min', r.stats.user_words_per_minute], ['Filler words', r.stats.filler_words], ['Arguments', r.stats.arguments_made], ['Rebuttals', r.stats.rebuttals_made]]
        .map(([k, v]) => `<div class="card"><div class="tiny muted">${k}</div><div style="font-size:26px;font-weight:900">${esc(v)}</div></div>`).join('')}
    </div>
    <div class="card"><h3>Key clashes</h3><div class="tableWrap"><table><thead><tr><th>Clash</th><th>Won by</th><th>Why</th></tr></thead><tbody>
      ${r.clashes.map(c => `<tr><td>${esc(c.clash)}</td><td><strong>${esc(c.winner)}</strong></td><td>${esc(c.why)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="grid g3">
      <div class="card"><h3>Strengths</h3><ul>${r.strengths.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="card"><h3>Improve next time</h3><ul>${r.improvements.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="card"><h3>Arguments you missed</h3><ul>${r.missed_arguments.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
    </div>
    <div class="card"><h3>Drills</h3>${r.drills.map(d => `<p><strong>${esc(d.name)}</strong><br><span class="small">${esc(d.how)}</span></p>`).join('')}</div>
    <div class="card"><h3>Speech-by-speech</h3>${r.per_speech.map(p => `<p><strong>${esc(p.speech)}</strong> <span class="pill gray">${esc(p.speaker)}</span><br><span class="small">${esc(p.feedback)}</span></p>`).join('')}</div>
    <p class="tiny muted">AI feedback is a practice aid, not an official adjudication.</p>`;
  bindDownloads();
}

// ───────── history ─────────
async function loadHistory() {
  if (!getToken()) return;
  try {
    const { debates } = await api('/ai/debates');
    $('#historyList').innerHTML = debates.length ? `<div class="tableWrap"><table><thead><tr><th>Date</th><th>Format</th><th>Motion</th><th>Decision</th><th>Score</th><th></th></tr></thead><tbody>
      ${debates.map(d => `<tr><td>${fmtDate(d.created_at)}</td><td>${esc(FORMATS[d.format]?.name || d.format)}</td><td>${esc(d.motion)}</td><td>${esc(d.decision)}</td><td>${esc(d.user_score)}</td><td><button class="btn sm ghost" data-open="${d.id}" type="button">Open</button></td></tr>`).join('')}
      </tbody></table></div>` : 'No AI debates yet — your reports will appear here.';
  } catch (err) {
    $('#historyList').textContent = err.message;
  }
}
$('#historyList').addEventListener('click', async e => {
  const b = e.target.closest('[data-open]');
  if (!b) return;
  const { debate } = await api(`/ai/debates/${b.dataset.open}`);
  state.format = FORMATS[debate.format];
  state.transcript = debate.transcript;
  state.report = debate.report;
  $('#motion').value = debate.motion;
  $('#setup').hidden = true;
  $('#reportView').hidden = false;
  renderReport(debate.report);
  $('#reportView').scrollIntoView({ behavior: 'smooth' });
});
loadHistory();
