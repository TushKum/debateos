import { $, $$, api, esc, safeUrl, renderNav, requireLogin, toast } from '../common.js';
import { ballotForm, readBallot } from '../ballot.js';
renderNav();
requireLogin();

const params = new URLSearchParams(location.search);
const tid = params.get('id');
let data = null;
const origin = location.origin + location.pathname.replace(/tab\.html$/, '');

// ───────── list / create ─────────
$('#cFormat').addEventListener('change', () => { $('#sptWrap').hidden = $('#cFormat').value === 'bp'; });
$('#cName').addEventListener('input', () => {
  if (!$('#cSlug').dataset.touched) $('#cSlug').value = $('#cName').value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
});
$('#cSlug').addEventListener('input', () => { $('#cSlug').dataset.touched = '1'; });
$('#createForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const { tournament } = await api('/tab', { method: 'POST', body: {
      name: $('#cName').value, format: $('#cFormat').value, speakers_per_team: $('#cSpt').value, slug: $('#cSlug').value,
      starts_on: $('#cDate').value || null, discord_url: $('#cDiscord').value, meet_url: $('#cMeet').value
    } });
    location.href = `tab.html?id=${tournament.id}`;
  } catch (err) { toast(err.message, 'error'); }
});

async function loadMine() {
  const { tournaments } = await api('/tab/mine');
  $('#mine').innerHTML = tournaments.length ? tournaments.map(t => `
    <a class="card row spread" style="text-decoration:none;padding:14px" href="tab.html?id=${t.id}">
      <span><strong>${esc(t.name)}</strong><br><span class="tiny muted">/${esc(t.slug)} · ${t.format === 'bp' ? 'BP' : 'Two-team'} ${t.is_owner ? '' : '· staff'}</span></span><span>Manage →</span></a>`).join('')
    : '<p class="muted">No tournaments yet.</p>';
}

// ───────── manage ─────────
const isBp = () => data.tournament.format === 'bp';
const T = () => data.tournament;

async function load() {
  data = await api(`/tab/${tid}/manage`);
  const t = T();
  $('#tName').textContent = t.name;
  $('#tFormat').textContent = isBp() ? 'British Parliamentary' : `Two-team · ${t.speakers_per_team} speakers + reply`;
  $('#publicLink').href = `t.html?s=${encodeURIComponent(t.slug)}`;
  $('#discordBtn').hidden = !t.discord_url; $('#discordBtn').href = t.discord_url || '#';
  $('#meetBtn').hidden = !t.meet_url; $('#meetBtn').href = t.meet_url || '#';
  renderRounds(); renderTeams(); renderAdjs(); renderRooms(); renderStandings(); renderSettings();
}

function showPanel(name) {
  $$('#manageView .tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== name; });
}
$$('#manageView .tabs button').forEach(b => b.addEventListener('click', () => showPanel(b.dataset.tab)));

const act = async (fn, okMsg) => {
  try { const r = await fn(); if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); await load(); return r; }
  catch (err) { toast(err.message, 'error'); }
};

function debateCard(r, d) {
  const venueOptions = `<option value="">No room</option>${data.venues.map(v => `<option value="${v.id}" ${String(v.id) === String(d.venue_id) ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}`;
  return `<div class="debate">
    <div class="row spread"><strong>${esc(d.venue || 'No room')}</strong><span class="row" style="gap:6px">${d.result_entered ? '<span class="pill green">Result in</span>' : '<span class="pill gray">Awaiting ballot</span>'}<span class="tiny muted">bracket ${Number(d.bracket)}</span></span></div>
    <div class="teams" style="${isBp() ? '' : 'grid-template-columns:1fr 1fr'}">${d.teams.sort((a, b) => ['OG', 'OO', 'CG', 'CO', 'GOV', 'OPP'].indexOf(a.position) - ['OG', 'OO', 'CG', 'CO', 'GOV', 'OPP'].indexOf(b.position))
      .map(x => `<div><span class="pos">${esc(x.position)}${x.points != null ? ` · ${isBp() ? `${3 - x.points + 1}${['st', 'nd', 'rd', 'th'][3 - x.points]}` : x.points ? 'WIN' : 'LOSS'}` : ''}</span>${esc(x.name)}</div>`).join('')}</div>
    <div class="small"><strong>Panel:</strong> ${d.adjudicators.map(a => `${esc(a.name)}${a.role === 'chair' ? ' ©' : a.role === 'trainee' ? ' (t)' : ''}`).join(', ') || '<em>none</em>'}</div>
    <div class="links">${d.meet_url ? `<a href="${safeUrl(d.meet_url)}" target="_blank" rel="noopener">Meet ↗</a>` : ''}${d.discord_url ? `<a href="${safeUrl(d.discord_url)}" target="_blank" rel="noopener">Discord ↗</a>` : ''}</div>
    <div class="row" style="margin-top:8px;gap:6px"><button class="btn sm" data-ballot-open="${d.id}" data-round="${r.id}" type="button">${d.result_entered ? 'Edit result' : 'Enter result'}</button><button class="btn sm ghost" data-alloc="${d.id}" data-round="${r.id}" type="button">Edit panel & room</button></div>
    <template data-venues="${d.id}">${venueOptions}</template>
  </div>`;
}

function renderRounds() {
  $('#rounds').innerHTML = data.rounds.length ? data.rounds.map(r => {
    const results = r.debates.filter(d => d.result_entered).length;
    return `<div class="card">
      <div class="roundHead"><h3 style="margin:0">${esc(r.name)}</h3>
        <div class="row" style="gap:6px"><button class="btn sm" data-draw="${r.id}" type="button">${r.debates.length ? 'Regenerate draw' : 'Generate draw'}</button><button class="btn sm danger" data-del-round="${r.id}" type="button">Delete</button></div></div>
      <div class="grid g2" style="margin:12px 0">
        <label class="field" style="margin:0"><span>Motion</span><textarea rows="2" data-motion="${r.id}">${esc(r.motion || '')}</textarea></label>
        <label class="field" style="margin:0"><span>Info slide</span><textarea rows="2" data-info="${r.id}">${esc(r.infoslide || '')}</textarea></label>
      </div>
      <div class="row spread">
        <div><label class="check"><input type="checkbox" data-flag="draw_released" data-rid="${r.id}" ${r.draw_released ? 'checked' : ''}> Release draw</label>
          <label class="check"><input type="checkbox" data-flag="motion_released" data-rid="${r.id}" ${r.motion_released ? 'checked' : ''}> Release motion</label>
          <label class="check"><input type="checkbox" data-flag="completed" data-rid="${r.id}" ${r.completed ? 'checked' : ''}> Round complete (show results publicly)</label></div>
        <span class="small muted">${r.debates.length ? `${results}/${r.debates.length} ballots` : 'No draw yet'}</span>
      </div>
      ${r.debates.length ? `<div class="grid g3" style="margin-top:12px">${r.debates.map(d => debateCard(r, d)).join('')}</div>` : ''}
    </div>`;
  }).join('') : '<p class="empty">Add teams, adjudicators and rooms, then create your first round.</p>';
}

function renderTeams() {
  const spt = T().speakers_per_team;
  $('#speakerInputs').innerHTML = Array.from({ length: spt }, (_, i) => `<label class="field"><span>Speaker ${i + 1}</span><input data-speaker required></label>`).join('');
  $('#teamRows').innerHTML = data.teams.map(t => `<tr><td><strong>${esc(t.name)}</strong></td><td>${esc(t.institution || '')}</td><td>${t.speakers.map(s => esc(s.name)).join(', ')}</td>
    <td><button class="btn sm ghost" data-copy="${origin}t.html?s=${encodeURIComponent(T().slug)}&team=${t.code}" type="button">Copy link</button></td>
    <td><button class="btn sm danger" data-del-team="${t.id}" type="button">Remove</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No teams yet.</td></tr>';
}

function renderAdjs() {
  $('#adjRows').innerHTML = data.adjudicators.map(a => `<tr><td><strong>${esc(a.name)}</strong></td><td>${esc(a.institution || '')}</td>
    <td><input type="number" min="0" max="10" step="0.5" value="${Number(a.rating)}" data-rating="${a.id}" style="width:80px"></td>
    <td><input type="checkbox" data-ia="${a.id}" ${a.is_ia ? 'checked' : ''}></td>
    <td><button class="btn sm ghost" data-copy="${origin}t.html?s=${encodeURIComponent(T().slug)}&adj=${a.code}" type="button">Copy link</button></td>
    <td><button class="btn sm danger" data-del-adj="${a.id}" type="button">Remove</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No adjudicators yet.</td></tr>';
}

function renderRooms() {
  $('#roomRows').innerHTML = data.venues.map(v => `<tr><td><strong>${esc(v.name)}</strong></td>
    <td><input type="url" value="${esc(v.meet_url || '')}" data-vmeet="${v.id}" placeholder="https://meet.google.com/…"></td>
    <td><input type="url" value="${esc(v.discord_url || '')}" data-vdiscord="${v.id}" placeholder="https://discord.com/channels/…"></td>
    <td class="row" style="gap:6px"><button class="btn sm" data-save-room="${v.id}" type="button">Save</button><button class="btn sm danger" data-del-room="${v.id}" type="button">Remove</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">No rooms yet.</td></tr>';
}

function renderStandings() {
  $('#ptsHead').textContent = isBp() ? 'Points' : 'Wins';
  $('#teamTab').innerHTML = data.standings.teams.map((t, i) => `<tr><td>${i + 1}</td><td><strong>${esc(t.name)}</strong><br><span class="tiny muted">${esc(t.institution || '')}</span></td><td>${t.points}</td><td>${Number(t.speaks)}</td><td>${t.debates}</td></tr>`).join('');
  $('#speakerTab').innerHTML = data.standings.speakers.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s.team)}</td><td>${Number(s.total)}</td><td>${s.average ?? '—'}</td></tr>`).join('');
}

function renderSettings() {
  const t = T();
  $('#sName').value = t.name; $('#sDesc').value = t.description || ''; $('#sDate').value = t.starts_on ? t.starts_on.slice(0, 10) : '';
  $('#sDiscord').value = t.discord_url || ''; $('#sMeet').value = t.meet_url || '';
  $('#sPublic').checked = t.is_public; $('#sTab').checked = t.tab_released;
  $('#staffList').innerHTML = data.staff.map(s => `<div class="row spread" style="padding:4px 0"><span>${esc(s.name)} <span class="tiny muted">${esc(s.email)}</span> <span class="pill">${esc(s.role)}</span></span>
    ${data.isOwner ? `<button class="btn sm danger" data-del-staff="${s.user_id}/${s.role}" type="button">Remove</button>` : ''}</div>`).join('') || '<span class="muted">No staff added.</span>';
  $('#deleteT').hidden = !data.isOwner;
}

// ───────── forms ─────────
$('#roundForm').addEventListener('submit', e => {
  e.preventDefault();
  act(() => api(`/tab/${tid}/rounds`, { method: 'POST', body: { name: $('#rName').value, motion: $('#rMotion').value } }), 'Round added')
    .then(() => { $('#rName').value = ''; $('#rMotion').value = ''; });
});
$('#teamForm').addEventListener('submit', e => {
  e.preventDefault();
  act(() => api(`/tab/${tid}/teams`, { method: 'POST', body: { name: $('#tmName').value, institution: $('#tmInst').value, speakers: $$('[data-speaker]').map(i => i.value) } }), 'Team added')
    .then(() => $('#teamForm').reset());
});
$('#bulkTeams').addEventListener('submit', e => {
  e.preventDefault();
  const teams = $('#bulkTeamText').value.split('\n').map(l => l.split(',').map(x => x.trim())).filter(p => p[0])
    .map(([name, institution, ...speakers]) => ({ name, institution, speakers: speakers.filter(Boolean) }));
  act(() => api(`/tab/${tid}/teams`, { method: 'POST', body: { teams } }), r => `Imported ${r.teams.length} teams`).then(r => { if (r) $('#bulkTeamText').value = ''; });
});
$('#adjForm').addEventListener('submit', e => {
  e.preventDefault();
  act(() => api(`/tab/${tid}/adjudicators`, { method: 'POST', body: { name: $('#aName').value, institution: $('#aInst').value, rating: $('#aRating').value, is_ia: $('#aIa').checked } }), 'Adjudicator added')
    .then(() => $('#adjForm').reset());
});
$('#bulkAdjs').addEventListener('submit', e => {
  e.preventDefault();
  const adjudicators = $('#bulkAdjText').value.split('\n').map(l => l.split(',').map(x => x.trim())).filter(p => p[0])
    .map(([name, institution, rating, ia]) => ({ name, institution, rating: rating || 5, is_ia: /^y/i.test(ia || '') }));
  act(() => api(`/tab/${tid}/adjudicators`, { method: 'POST', body: { adjudicators } }), r => `Imported ${r.adjudicators.length} adjudicators`).then(r => { if (r) $('#bulkAdjText').value = ''; });
});
$('#roomForm').addEventListener('submit', e => {
  e.preventDefault();
  act(() => api(`/tab/${tid}/venues`, { method: 'POST', body: { name: $('#vName').value, meet_url: $('#vMeet').value, discord_url: $('#vDiscord').value } }), 'Room added')
    .then(() => $('#roomForm').reset());
});
$('#settingsForm').addEventListener('submit', e => {
  e.preventDefault();
  act(() => api(`/tab/${tid}`, { method: 'PATCH', body: { name: $('#sName').value, description: $('#sDesc').value, starts_on: $('#sDate').value, discord_url: $('#sDiscord').value, meet_url: $('#sMeet').value, is_public: $('#sPublic').checked, tab_released: $('#sTab').checked } }), 'Settings saved');
});
$('#staffForm').addEventListener('submit', e => {
  e.preventDefault();
  act(() => api(`/tab/${tid}/staff`, { method: 'POST', body: { email: $('#stEmail').value, role: $('#stRole').value } }), 'Staff added').then(() => { $('#stEmail').value = ''; });
});
$('#deleteT').addEventListener('click', async () => {
  if (prompt(`Type the tournament URL name (${T().slug}) to delete it permanently:`) !== T().slug) return;
  try { await api(`/tab/${tid}`, { method: 'DELETE' }); location.href = 'tab.html'; } catch (err) { toast(err.message, 'error'); }
});

// ───────── delegated actions ─────────
const findDebate = (rid, did) => data.rounds.find(r => String(r.id) === String(rid)).debates.find(d => String(d.id) === String(did));
const modal = html => { $('#modalBox').innerHTML = `<button class="btn sm ghost" style="float:right" data-close type="button">✕</button>${html}`; $('#modal').hidden = false; };

document.addEventListener('click', async e => {
  const el = e.target.closest('button,[data-close]');
  if (!el) return;
  const d = el.dataset;
  if (e.target === $('#modal') || d.close !== undefined) { $('#modal').hidden = true; return; }
  if (d.copy) { await navigator.clipboard.writeText(d.copy); toast('Private link copied'); }
  if (d.draw) {
    if (el.textContent.startsWith('Regenerate') && !confirm('Replace the existing draw for this round?')) return;
    act(() => api(`/tab/${tid}/rounds/${d.draw}/draw`, { method: 'POST' }), r => r.warning || `Draw created: ${r.rooms} debates`);
  }
  if (d.delRound && confirm('Delete this round and its results?')) act(() => api(`/tab/${tid}/rounds/${d.delRound}`, { method: 'DELETE' }), 'Round deleted');
  if (d.delTeam && confirm('Remove this team and all its results?')) act(() => api(`/tab/${tid}/teams/${d.delTeam}`, { method: 'DELETE' }), 'Team removed');
  if (d.delAdj && confirm('Remove this adjudicator?')) act(() => api(`/tab/${tid}/adjudicators/${d.delAdj}`, { method: 'DELETE' }), 'Adjudicator removed');
  if (d.delRoom && confirm('Remove this room?')) act(() => api(`/tab/${tid}/venues/${d.delRoom}`, { method: 'DELETE' }), 'Room removed');
  if (d.saveRoom) act(() => api(`/tab/${tid}/venues/${d.saveRoom}`, { method: 'PATCH', body: { meet_url: $(`[data-vmeet="${d.saveRoom}"]`).value, discord_url: $(`[data-vdiscord="${d.saveRoom}"]`).value } }), 'Room links saved');
  if (d.delStaff) { const [uid, role] = d.delStaff.split('/'); act(() => api(`/tab/${tid}/staff/${uid}/${role}`, { method: 'DELETE' }), 'Staff removed'); }

  if (d.ballotOpen) {
    const debate = findDebate(d.round, d.ballotOpen);
    const speakersByTeam = new Map(data.teams.map(t => [String(t.id), t.speakers]));
    modal(`<h3>${esc(debate.venue || 'Debate')} — result</h3>${ballotForm({ format: T().format, speakersPerTeam: T().speakers_per_team, debate, speakersByTeam, existingScores: debate.scores })}`);
    $('#modalBox form').addEventListener('submit', async ev => {
      ev.preventDefault();
      const body = readBallot(ev.target, { format: T().format, speakersPerTeam: T().speakers_per_team, debate });
      const ok = await act(() => api(`/tab/${tid}/debates/${debate.id}/result`, { method: 'POST', body }), 'Result saved');
      if (ok) $('#modal').hidden = true;
    });
  }

  if (d.alloc) {
    const debate = findDebate(d.round, d.alloc);
    const current = new Map(debate.adjudicators.map(a => [String(a.adjudicator_id), a.role]));
    modal(`<h3>Panel & room</h3><form id="allocForm" class="stack">
      <label class="field"><span>Room</span><select name="venue">${$(`template[data-venues="${debate.id}"]`).innerHTML}</select></label>
      <div class="tableWrap" style="max-height:50vh"><table><thead><tr><th>Adjudicator</th><th>Rating</th><th>Role</th></tr></thead><tbody>
      ${data.adjudicators.map(a => `<tr><td>${esc(a.name)} <span class="tiny muted">${esc(a.institution || '')}</span></td><td>${Number(a.rating)}</td>
        <td><select name="adj-${a.id}" style="width:auto"><option value="">—</option>${['chair', 'panel', 'trainee'].map(r => `<option ${current.get(String(a.id)) === r ? 'selected' : ''}>${r}</option>`).join('')}</select></td></tr>`).join('')}
      </tbody></table></div><button class="btn" type="submit">Save allocation</button></form>`);
    $('#allocForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const adjudicators = data.adjudicators.filter(a => f.get(`adj-${a.id}`)).map(a => ({ id: a.id, role: f.get(`adj-${a.id}`) }));
      const ok = await act(() => api(`/tab/${tid}/debates/${debate.id}/allocation`, { method: 'PUT', body: { venue_id: f.get('venue') || null, adjudicators } }), 'Allocation saved');
      if (ok) $('#modal').hidden = true;
    });
  }
});
$('#modal').addEventListener('click', e => { if (e.target === $('#modal')) $('#modal').hidden = true; });

// Inline edits: motions, release flags, adjudicator rating/IA.
document.addEventListener('change', e => {
  const d = e.target.dataset;
  if (d.motion || d.info) {
    const rid = d.motion || d.info;
    act(() => api(`/tab/${tid}/rounds/${rid}`, { method: 'PATCH', body: d.motion ? { motion: e.target.value } : { infoslide: e.target.value } }), 'Saved');
  }
  if (d.flag) act(() => api(`/tab/${tid}/rounds/${d.rid}`, { method: 'PATCH', body: { [d.flag]: e.target.checked } }), 'Updated');
  if (d.rating) act(() => api(`/tab/${tid}/adjudicators/${d.rating}`, { method: 'PATCH', body: { rating: Number(e.target.value) } }));
  if (d.ia) act(() => api(`/tab/${tid}/adjudicators/${d.ia}`, { method: 'PATCH', body: { is_ia: e.target.checked } }));
});

if (tid) {
  $('#listView').hidden = true;
  $('#manageView').hidden = false;
  load().catch(err => { toast(err.message, 'error'); $('#manageView').innerHTML = `<p class="empty">${esc(err.message)} · <a href="tab.html">Back</a></p>`; });
} else {
  loadMine();
}
