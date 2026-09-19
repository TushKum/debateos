import { $, $$, api, esc, safeUrl, renderNav, toast } from '../common.js';
import { ballotForm, readBallot } from '../ballot.js';
renderNav();

const params = new URLSearchParams(location.search);
const slug = params.get('s');
const teamCode = params.get('team');
const adjCode = params.get('adj');
const ORDER = ['OG', 'OO', 'CG', 'CO', 'GOV', 'OPP'];

const joinLinks = (d, t) => {
  const links = [
    d.meet_url && `<a class="btn sm" href="${safeUrl(d.meet_url)}" target="_blank" rel="noopener">Join Google Meet ↗</a>`,
    d.discord_url && `<a class="btn sm ghost" href="${safeUrl(d.discord_url)}" target="_blank" rel="noopener">Room on Discord ↗</a>`,
    !d.meet_url && t.meet_url && `<a class="btn sm ghost" href="${safeUrl(t.meet_url)}" target="_blank" rel="noopener">Tournament Meet ↗</a>`
  ].filter(Boolean);
  return links.length ? `<div class="join">${links.join('')}</div>` : '';
};

function debateCard(d, t, { highlightTeam } = {}) {
  const bp = t.format === 'bp';
  return `<div class="debate">
    <div class="row spread"><strong>${esc(d.venue || 'Room TBA')}</strong></div>
    <div class="teams">${[...d.teams].sort((a, b) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position)).map(x => `
      <div class="${String(x.team_id) === String(highlightTeam) ? 'mine' : ''}"><span class="pos">${esc(x.position)}${x.points != null ? ` · ${bp ? `${4 - x.points}${['st', 'nd', 'rd', 'th'][3 - x.points]}` : x.points ? 'WIN' : 'LOSS'}` : ''}</span>${esc(x.name)}</div>`).join('')}</div>
    <div class="small"><strong>Adjudicators:</strong> ${d.adjudicators.map(a => `${esc(a.name)}${a.role === 'chair' ? ' ©' : a.role === 'trainee' ? ' (t)' : ''}`).join(', ') || 'TBA'}</div>
    ${joinLinks(d, t)}
  </div>`;
}

function roundBlock(r, t, opts) {
  return `<div class="card">
    <div class="row spread"><h2 style="margin:0">${esc(r.name)}</h2>${r.completed ? '<span class="pill green">Complete</span>' : ''}</div>
    ${r.motion ? `<p class="motion">${esc(r.motion)}</p>${r.infoslide ? `<details><summary class="small">Info slide</summary><p class="small" style="white-space:pre-wrap">${esc(r.infoslide)}</p></details>` : ''}` : '<p class="muted small">Motion not released yet.</p>'}
    ${r.draw_released ? (r.debates.length ? `<div class="grid g3" style="margin-top:12px">${r.debates.map(d => (opts?.renderDebate || debateCard)(d, t, opts)).join('')}</div>` : '<p class="muted small">Not drawn in this round.</p>') : '<p class="muted small">Draw not released yet.</p>'}
  </div>`;
}

function header(t, subtitle) {
  return `<div class="pageHead"><div><div class="eyebrow">${t.format === 'bp' ? 'British Parliamentary' : 'Two-team format'}</div><h1>${esc(t.name)}</h1>
      ${subtitle ? `<p class="muted" style="margin:0">${subtitle}</p>` : ''}</div>
    <div class="row">${t.discord_url ? `<a class="btn ghost" href="${safeUrl(t.discord_url)}" target="_blank" rel="noopener">Discord server ↗</a>` : ''}${t.meet_url ? `<a class="btn" href="${safeUrl(t.meet_url)}" target="_blank" rel="noopener">Tournament Meet ↗</a>` : ''}</div></div>`;
}

async function publicPage() {
  const { tournament: t, rounds, teams, adjudicators, standings } = await api(`/tab/t/${encodeURIComponent(slug)}`, { auth: false });
  document.title = `${t.name} — DebateOS`;
  const views = ['Draws & motions', 'Participants', ...(standings ? ['Team tab', 'Speaker tab'] : [])];
  $('#root').innerHTML = `${header(t, esc(t.description || ''))}
    <div class="tabs">${views.map((v, i) => `<button class="${i ? '' : 'active'}" data-v="${i}" type="button">${v}</button>`).join('')}</div>
    <section data-view="0" class="stack">${[...rounds].reverse().map(r => roundBlock(r, t)).join('') || '<p class="empty">Nothing released yet.</p>'}</section>
    <section data-view="1" hidden class="grid g2">
      <div><h3>Teams (${teams.length})</h3><div class="tableWrap"><table><thead><tr><th>Team</th><th>Institution</th><th>Speakers</th></tr></thead><tbody>${teams.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.institution || '')}</td><td>${x.speakers.map(esc).join(', ')}</td></tr>`).join('')}</tbody></table></div></div>
      <div><h3>Adjudicators (${adjudicators.length})</h3><div class="tableWrap"><table><thead><tr><th>Name</th><th>Institution</th></tr></thead><tbody>${adjudicators.map(a => `<tr><td>${esc(a.name)} ${a.is_ia ? '<span class="pill">IA</span>' : ''}</td><td>${esc(a.institution || '')}</td></tr>`).join('')}</tbody></table></div></div>
    </section>
    ${standings ? `<section data-view="2" hidden><div class="tableWrap"><table><thead><tr><th>#</th><th>Team</th><th>${t.format === 'bp' ? 'Points' : 'Wins'}</th><th>Speaks</th></tr></thead><tbody>
      ${standings.teams.map((x, i) => `<tr><td>${i + 1}</td><td><strong>${esc(x.name)}</strong> <span class="tiny muted">${esc(x.institution || '')}</span></td><td>${x.points}</td><td>${Number(x.speaks)}</td></tr>`).join('')}</tbody></table></div></section>
    <section data-view="3" hidden><div class="tableWrap"><table><thead><tr><th>#</th><th>Speaker</th><th>Team</th><th>Total</th><th>Average</th></tr></thead><tbody>
      ${standings.speakers.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td>${esc(x.team)}</td><td>${Number(x.total)}</td><td>${x.average ?? '—'}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
  $$('[data-v]').forEach(b => b.addEventListener('click', () => {
    $$('[data-v]').forEach(x => x.classList.toggle('active', x === b));
    $$('[data-view]').forEach(s => { s.hidden = s.dataset.view !== b.dataset.v; });
  }));
}

async function teamPage() {
  const { tournament: t, team, rounds } = await api(`/tab/t/${encodeURIComponent(slug)}/team/${encodeURIComponent(teamCode)}`, { auth: false });
  document.title = `${team.name} — ${t.name}`;
  $('#root').innerHTML = `${header(t, `Private page for <strong>${esc(team.name)}</strong>${team.institution ? ` (${esc(team.institution)})` : ''} · Speakers: ${team.speakers.map(s => esc(s.name)).join(', ')}`)}
    <div class="notice" style="margin-bottom:16px">Bookmark this page — it always shows your room, position, adjudicators and call links. <a href="t.html?s=${encodeURIComponent(t.slug)}">Public tab →</a></div>
    <div class="stack">${[...rounds].reverse().map(r => roundBlock(r, t, { highlightTeam: team.id })).join('') || '<p class="empty">No rounds released yet.</p>'}</div>`;
}

async function adjPage() {
  const res = await api(`/tab/t/${encodeURIComponent(slug)}/adjudicator/${encodeURIComponent(adjCode)}`, { auth: false });
  const { tournament: t, adjudicator, rounds } = res;
  document.title = `${adjudicator.name} — ${t.name}`;
  const renderDebate = (d) => {
    const mine = d.adjudicators.find(a => String(a.adjudicator_id) === String(adjudicator.id));
    const round = rounds.find(r => r.debates.includes(d));
    const canSubmit = mine?.role === 'chair' && !round.completed;
    return `${debateCard(d, t)}<div class="row" style="margin-top:6px"><span class="pill">${esc(mine?.role || '')}</span>
      ${canSubmit ? `<button class="btn sm cyan" data-ballot="${d.id}" type="button">${d.result_entered ? 'Resubmit ballot' : 'Submit ballot'}</button>` : ''}
      ${d.result_entered ? '<span class="pill green">Ballot received</span>' : ''}</div><div data-ballot-slot="${d.id}"></div>`;
  };
  $('#root').innerHTML = `${header(t, `Private adjudicator page for <strong>${esc(adjudicator.name)}</strong>${adjudicator.is_ia ? ' · Independent Adjudicator' : ''}`)}
    <div class="notice" style="margin-bottom:16px">Chairs submit the panel's ballot here after deliberation. Keep this link private.</div>
    <div class="stack">${[...rounds].reverse().map(r => roundBlock(r, t, { renderDebate })).join('') || '<p class="empty">No allocations released yet.</p>'}</div>`;

  $('#root').onclick = e => {
    const b = e.target.closest('[data-ballot]');
    if (!b) return;
    const debate = rounds.flatMap(r => r.debates).find(d => String(d.id) === b.dataset.ballot);
    const speakersByTeam = new Map();
    for (const s of debate.speakers) {
      const key = String(s.team_id);
      if (!speakersByTeam.has(key)) speakersByTeam.set(key, []);
      speakersByTeam.get(key).push(s);
    }
    const slot = $(`[data-ballot-slot="${debate.id}"]`);
    slot.innerHTML = ballotForm({ format: t.format, speakersPerTeam: t.speakers_per_team, debate, speakersByTeam });
    b.hidden = true;
    slot.querySelector('form').addEventListener('submit', async ev => {
      ev.preventDefault();
      const body = readBallot(ev.target, { format: t.format, speakersPerTeam: t.speakers_per_team, debate });
      try {
        await api(`/tab/t/${encodeURIComponent(slug)}/adjudicator/${encodeURIComponent(adjCode)}/ballot/${debate.id}`, { method: 'POST', body, auth: false });
        toast('Ballot submitted — thank you!');
        adjPage();
      } catch (err) { toast(err.message, 'error'); }
    });
  };
}

(async () => {
  if (!slug) { $('#root').innerHTML = '<p class="empty">No tournament specified. <a href="tournaments.html">Browse tournaments →</a></p>'; return; }
  try {
    if (teamCode) await teamPage();
    else if (adjCode) await adjPage();
    else await publicPage();
  } catch (err) {
    $('#root').innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
})();
