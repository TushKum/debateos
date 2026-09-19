import { $, $$, api, esc, renderNav, requireLogin, toast, ROLE_LABELS, fmtDate, setSession, getToken } from '../common.js';
renderNav();
const me = requireLogin();

const initials = n => esc(String(n || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase());
let activeUser = null;
let lastMsgId = 0;
let pollTimer;

$('#role').innerHTML += Object.entries(ROLE_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
$('#pRole').innerHTML = Object.entries(ROLE_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

function show(tab) {
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  ['people', 'connections', 'messages', 'profile'].forEach(t => { $(`#tab-${t}`).hidden = t !== tab; });
  if (tab === 'connections') loadConnections();
  if (tab === 'messages') loadConversations();
  if (tab === 'profile') loadProfile();
  history.replaceState(null, '', `#${tab}`);
}
$$('.tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));

function personCard(p, actions) {
  return `<div class="card person">
    <div class="avatar">${initials(p.name)}</div>
    <div style="flex:1;min-width:0">
      <h3>${esc(p.name)}</h3>
      <div class="row" style="gap:6px;margin:4px 0"><span class="pill">${esc(ROLE_LABELS[p.circuit_role] || p.circuit_role)}</span>${p.country ? `<span class="pill gray">${esc(p.country)}</span>` : ''}</div>
      ${p.institution ? `<div class="small muted">${esc(p.institution)}</div>` : ''}
      ${p.bio ? `<p class="small" style="margin:6px 0 0">${esc(p.bio.slice(0, 180))}</p>` : ''}
      <div class="row" style="margin-top:10px;gap:6px">${actions}</div>
    </div></div>`;
}

let searchTimer;
async function loadPeople() {
  const q = encodeURIComponent($('#q').value.trim());
  const role = encodeURIComponent($('#role').value);
  try {
    const { people } = await api(`/network/people?q=${q}&role=${role}`);
    $('#people').innerHTML = people.length ? people.map(p => personCard(p, `
      <button class="btn sm" data-message="${p.id}" data-name="${esc(p.name)}" type="button">Message</button>
      ${p.connection_status === 'accepted' ? '<span class="pill green">Connected</span>'
        : p.connection_status === 'pending' ? (p.requested_by_me ? '<span class="pill gray">Request sent</span>' : `<button class="btn sm cyan" data-accept="${p.connection_id}" type="button">Accept request</button>`)
        : `<button class="btn sm ghost" data-connect="${p.id}" type="button">Connect</button>`}`)).join('')
      : '<p class="empty">No one found. Invite your circuit to DebateOS!</p>';
  } catch (err) { toast(err.message, 'error'); }
}
$('#q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadPeople, 250); });
$('#role').addEventListener('change', loadPeople);

async function loadConnections() {
  const { connections } = await api('/network/connections');
  const incoming = connections.filter(c => c.status === 'pending' && !c.requested_by_me);
  const rest = connections.filter(c => !(c.status === 'pending' && !c.requested_by_me));
  $('#connections').innerHTML = [
    ...incoming.map(c => personCard(c, `<button class="btn sm cyan" data-accept="${c.connection_id}" type="button">Accept</button><button class="btn sm ghost" data-remove="${c.connection_id}" type="button">Decline</button>`)),
    ...rest.map(c => personCard(c, `<button class="btn sm" data-message="${c.id}" data-name="${esc(c.name)}" type="button">Message</button>
      ${c.status === 'pending' ? '<span class="pill gray">Pending</span>' : ''}<button class="btn sm danger" data-remove="${c.connection_id}" type="button">${c.status === 'pending' ? 'Cancel' : 'Remove'}</button>`))
  ].join('') || '<p class="empty">No connections yet. Find people in the People tab.</p>';
}

async function loadConversations() {
  const { conversations } = await api('/network/conversations');
  $('#convList').innerHTML = conversations.map(c => `
    <button class="conv ${String(activeUser?.id) === String(c.id) ? 'active' : ''}" data-open="${c.id}" data-name="${esc(c.name)}" type="button">
      <div class="row spread"><strong>${esc(c.name)}</strong>${c.unread ? `<span class="badge">${c.unread}</span>` : ''}</div>
      <div class="tiny muted">${esc(ROLE_LABELS[c.circuit_role] || '')}</div>
      <div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.last_body)}</div></button>`).join('')
    || '<p class="empty small">No conversations yet.</p>';
}

async function openThread(userId, name) {
  show('messages');
  activeUser = { id: userId, name };
  lastMsgId = 0;
  $('#msgs').innerHTML = '';
  $('#threadHead').innerHTML = `<strong>${esc(name)}</strong>`;
  $('#composer').hidden = false;
  await fetchMessages();
  loadConversations();
  clearInterval(pollTimer);
  pollTimer = setInterval(fetchMessages, 5000);
  $('#body').focus();
}

async function fetchMessages() {
  if (!activeUser) return;
  const { messages } = await api(`/network/messages/${activeUser.id}?after=${lastMsgId}`);
  if (!messages.length) return;
  $('#msgs').insertAdjacentHTML('beforeend', messages.map(m => `
    <div class="msg ${String(m.sender_id) === String(me.id) ? 'me' : ''}">${esc(m.body)}<time>${fmtDate(m.created_at)}</time></div>`).join(''));
  lastMsgId = Number(messages[messages.length - 1].id);
  $('#msgs').scrollTop = $('#msgs').scrollHeight;
}

$('#composer').addEventListener('submit', async e => {
  e.preventDefault();
  const body = $('#body').value.trim();
  if (!body || !activeUser) return;
  $('#body').value = '';
  try {
    await api(`/network/messages/${activeUser.id}`, { method: 'POST', body: { body } });
    await fetchMessages();
    loadConversations();
  } catch (err) { toast(err.message, 'error'); $('#body').value = body; }
});
$('#body').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#composer').requestSubmit(); } });

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-message],[data-connect],[data-accept],[data-remove],[data-open]');
  if (!t) return;
  try {
    if (t.dataset.message) return openThread(t.dataset.message, t.dataset.name);
    if (t.dataset.open) return openThread(t.dataset.open, t.dataset.name);
    if (t.dataset.connect) { await api('/network/connections', { method: 'POST', body: { user_id: t.dataset.connect } }); toast('Connection request sent'); }
    if (t.dataset.accept) { await api(`/network/connections/${t.dataset.accept}/accept`, { method: 'POST' }); toast('Connected'); }
    if (t.dataset.remove) { await api(`/network/connections/${t.dataset.remove}`, { method: 'DELETE' }); }
    loadPeople();
    if (!$('#tab-connections').hidden) loadConnections();
    refreshBadges();
  } catch (err) { toast(err.message, 'error'); }
});

async function loadProfile() {
  const { user } = await api('/auth/me');
  $('#pName').value = user.name;
  $('#pRole').value = user.circuit_role;
  $('#pInst').value = user.institution || '';
  $('#pCountry').value = user.country || '';
  $('#pBio').value = user.bio || '';
}
$('#profileForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const { user } = await api('/auth/me', { method: 'PATCH', body: { name: $('#pName').value, circuit_role: $('#pRole').value, institution: $('#pInst').value, country: $('#pCountry').value, bio: $('#pBio').value } });
    setSession(getToken(), user);
    toast('Profile saved');
  } catch (err) { toast(err.message, 'error'); }
});

async function refreshBadges() {
  const u = await api('/network/unread').catch(() => null);
  if (!u) return;
  $('#reqBadge').hidden = !u.requests; $('#reqBadge').textContent = u.requests;
  $('#msgBadge').hidden = !u.messages; $('#msgBadge').textContent = u.messages;
}

loadPeople();
refreshBadges();
setInterval(() => { refreshBadges(); if (!$('#tab-messages').hidden) loadConversations(); }, 15000);
const hash = location.hash.slice(1);
const dm = new URLSearchParams(location.search).get('dm');
if (dm) api(`/network/people/${dm}`).then(({ person }) => openThread(person.id, person.name)).catch(() => {});
else if (['people', 'connections', 'messages', 'profile'].includes(hash)) show(hash);
