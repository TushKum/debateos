import { $, $$, api, esc, renderNav, requireLogin, toast, fmtDate, ROLE_LABELS, getUser } from '../common.js';
renderNav();
requireLogin();
if (getUser()?.role !== 'admin') location.href = 'index.html';

let users = [];

$$('.tabs button').forEach(b => b.addEventListener('click', () => {
  $$('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== b.dataset.tab; });
}));

const num = n => Number(n).toLocaleString();

async function loadStats() {
  const { stats: s, roles } = await api('/admin/stats');
  const cards = [
    ['Registered users', s.users], ['New users (7 days)', s.new_users_7d], ['Active users (7 days)', s.active_7d], ['Logins (24h)', s.logins_24h],
    ['AI debates', s.ai_debates], ['AI calls (24h)', s.ai_calls_24h], ['AI tokens in / out (30d)', `${num(s.ai_input_tokens_30d)} / ${num(s.ai_output_tokens_30d)}`], ['Hosted tournaments', s.tournaments],
    ['Messages sent', s.messages], ['Connections', s.connections]
  ];
  $('#stats').innerHTML = cards.map(([l, v]) => `<div class="card stat"><div class="l">${l}</div><div class="v">${typeof v === 'number' ? num(v) : esc(v)}</div></div>`).join('');
  const max = Math.max(1, ...roles.map(r => r.n));
  $('#roles').innerHTML = roles.map(r => `<div class="row" style="margin:6px 0"><span style="width:200px">${esc(ROLE_LABELS[r.circuit_role] || r.circuit_role)}</span><div class="bar" style="flex:1"><i style="width:${(r.n / max) * 100}%"></i></div><b style="width:40px;text-align:right">${r.n}</b></div>`).join('');
}

function renderUsers() {
  const q = $('#userSearch').value.toLowerCase();
  const me = getUser();
  $('#userRows').innerHTML = users.filter(u => !q || `${u.name} ${u.email} ${u.institution || ''}`.toLowerCase().includes(q)).map(u => `<tr>
    <td><strong>${esc(u.name)}</strong><br><span class="tiny muted">${esc(u.email)}${u.institution ? ` · ${esc(u.institution)}` : ''}</span></td>
    <td>${esc(ROLE_LABELS[u.circuit_role] || u.circuit_role)}</td>
    <td>${fmtDate(u.created_at, { dateStyle: 'medium' })}</td><td>${fmtDate(u.last_seen_at)}</td>
    <td>${u.login_count}</td><td>${u.ai_debates}</td>
    <td>${u.is_banned ? '<span class="pill red">Suspended</span>' : u.role === 'admin' ? '<span class="pill">Admin</span>' : '<span class="pill gray">User</span>'}</td>
    <td class="row" style="gap:6px">${String(u.id) === String(me.id) ? '<span class="tiny muted">you</span>' : `
      <button class="btn sm ghost" data-role="${u.id}" data-to="${u.role === 'admin' ? 'user' : 'admin'}" type="button">${u.role === 'admin' ? 'Remove admin' : 'Make admin'}</button>
      <button class="btn sm ${u.is_banned ? 'ghost' : 'danger'}" data-ban="${u.id}" data-to="${!u.is_banned}" type="button">${u.is_banned ? 'Restore' : 'Suspend'}</button>`}</td></tr>`).join('');
}

async function loadUsers() { users = (await api('/admin/users')).users; renderUsers(); }
$('#userSearch').addEventListener('input', renderUsers);

async function loadLogins() {
  const { activity } = await api('/admin/login-activity?limit=200');
  $('#loginRows').innerHTML = activity.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.email)}</td><td>${fmtDate(x.logged_in_at)}</td><td>${esc(x.ip_address || '—')}</td><td class="tiny">${esc((x.user_agent || '—').slice(0, 90))}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No logins yet.</td></tr>';
}

async function loadKnowledge() {
  const { items } = await api('/admin/knowledge');
  $('#kList').innerHTML = items.map(k => `<div class="card">
    <div class="row spread"><div><strong>${esc(k.title)}</strong> ${k.enabled ? '<span class="pill green">In use</span>' : '<span class="pill gray">Disabled</span>'}
      ${k.source_url ? `<br><a class="tiny" href="${esc(k.source_url)}" target="_blank" rel="noopener">${esc(k.source_url)}</a>` : ''}</div>
      <div class="row" style="gap:6px"><button class="btn sm ghost" data-ktoggle="${k.id}" data-to="${!k.enabled}" type="button">${k.enabled ? 'Disable' : 'Enable'}</button><button class="btn sm danger" data-kdel="${k.id}" type="button">Delete</button></div></div>
    <details><summary class="small">${num(k.content.length)} characters</summary><p class="small" style="white-space:pre-wrap">${esc(k.content)}</p></details></div>`).join('') || '<p class="empty">No extra material yet.</p>';
}
$('#kContent').addEventListener('input', () => { $('#kSize').textContent = `${num($('#kContent').value.length)} / 60,000 characters`; });
$('#kForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api('/admin/knowledge', { method: 'POST', body: { title: $('#kTitle').value, source_url: $('#kUrl').value, content: $('#kContent').value } });
    $('#kForm').reset(); toast('Added to knowledge base'); loadKnowledge();
  } catch (err) { toast(err.message, 'error'); }
});

async function loadTournaments() {
  const { tournaments } = await api('/admin/tournaments');
  $('#tRows').innerHTML = tournaments.map(t => `<tr><td><strong>${esc(t.name)}</strong><br><span class="tiny muted">/${esc(t.slug)}</span></td><td>${esc(t.owner)}</td><td>${t.format === 'bp' ? 'BP' : 'Two-team'}</td><td>${t.teams}</td><td>${t.is_public ? 'Yes' : 'No'}</td>
    <td class="row" style="gap:6px"><a class="btn sm ghost" href="t.html?s=${encodeURIComponent(t.slug)}">View</a><a class="btn sm" href="tab.html?id=${t.id}">Manage</a></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No tournaments yet.</td></tr>';
}

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-role],[data-ban],[data-ktoggle],[data-kdel]');
  if (!b) return;
  try {
    if (b.dataset.role) { await api(`/admin/users/${b.dataset.role}`, { method: 'PATCH', body: { role: b.dataset.to } }); await loadUsers(); }
    if (b.dataset.ban) { await api(`/admin/users/${b.dataset.ban}`, { method: 'PATCH', body: { is_banned: b.dataset.to === 'true' } }); await loadUsers(); }
    if (b.dataset.ktoggle) { await api(`/admin/knowledge/${b.dataset.ktoggle}`, { method: 'PATCH', body: { enabled: b.dataset.to === 'true' } }); await loadKnowledge(); }
    if (b.dataset.kdel && confirm('Delete this knowledge item?')) { await api(`/admin/knowledge/${b.dataset.kdel}`, { method: 'DELETE' }); await loadKnowledge(); }
  } catch (err) { toast(err.message, 'error'); }
});

async function loadAll() {
  try { await Promise.all([loadStats(), loadUsers(), loadLogins(), loadKnowledge(), loadTournaments()]); }
  catch (err) { toast(err.message, 'error'); if (err.status === 403 || err.status === 401) location.href = 'auth.html'; }
}
$('#refresh').addEventListener('click', loadAll);
loadAll();
