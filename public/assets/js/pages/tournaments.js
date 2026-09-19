import { $, $$, api, esc, safeUrl, renderNav } from '../common.js';
renderNav();

let all = [];
const linkify = v => (/^https?:\/\//i.test(v) ? `<a href="${safeUrl(v)}" target="_blank" rel="noopener">${esc(v.replace(/^https?:\/\//, '').slice(0, 40))}${v.length > 48 ? '…' : ''}</a>` : esc(v));

function render() {
  const q = $('#q').value.trim().toLowerCase();
  const month = $('#month').value;
  const mode = $('#mode').value;
  const rows = all.filter(t =>
    (!month || t.month === month) &&
    (!mode || (mode === 'online' ? /online/i.test(t.mode) : /person|in-person|offline/i.test(t.mode) || (t.mode && !/online/i.test(t.mode)))) &&
    (!q || Object.values(t).join(' ').toLowerCase().includes(q))
  );
  $('#count').textContent = `${rows.length} of ${all.length}`;
  if (!rows.length) { $('#list').innerHTML = '<p class="empty">No tournaments match.</p>'; return; }
  const months = [...new Set(rows.map(t => t.month))];
  $('#list').innerHTML = months.map(m => `
    <h2 class="month">${esc(m || 'Upcoming')}</h2>
    <div class="grid g3">${rows.filter(t => t.month === m).map(t => `
      <article class="card tcard">
        <h3>${esc(t.name)}</h3>
        <div class="meta">
          ${t.mode ? `<span class="pill ${/online/i.test(t.mode) ? '' : 'green'}">${esc(t.mode.replace(/\.$/, ''))}</span>` : ''}
          ${t.date ? `<span class="pill gray">${esc(t.date)}</span>` : ''}
          ${t.timezone ? `<span class="pill gray">${esc(t.timezone)}</span>` : ''}
        </div>
        ${t.fees ? `<div class="kv"><b>Fees</b>${esc(t.fees)}</div>` : ''}
        ${t.judgeRule ? `<div class="kv"><b>Judge rule</b>${esc(t.judgeRule)}</div>` : ''}
        ${t.teamCap ? `<div class="kv"><b>Team cap</b>${esc(t.teamCap)}</div>` : ''}
        ${t.profitStatus ? `<div class="kv"><b>Profit status</b>${esc(t.profitStatus)}</div>` : ''}
        ${t.registration ? `<div class="kv"><b>Registration</b>${linkify(t.registration)}</div>` : ''}
        ${t.info && t.info !== t.registration ? `<div class="kv"><b>Info</b>${linkify(t.info)}</div>` : ''}
      </article>`).join('')}
    </div>`).join('');
}

async function loadSheet() {
  try {
    const data = await api('/sheet/tournaments', { auth: false });
    all = data.tournaments;
    $('#updated').textContent = `Synced ${new Date(data.updatedAt).toLocaleTimeString()}.`;
    const months = [...new Set(all.map(t => t.month).filter(Boolean))];
    $('#month').innerHTML += months.map(m => `<option>${esc(m)}</option>`).join('');
    render();
  } catch (err) {
    $('#list').innerHTML = `<p class="empty">${esc(err.message)} — <a href="#" data-view-link="embed">open the original sheet</a>.</p>`;
  }
}

async function loadHosted() {
  try {
    const { tournaments } = await api('/tab/public', { auth: false });
    $('#hosted').innerHTML = tournaments.length ? tournaments.map(t => `
      <a class="card tcard" style="text-decoration:none" href="t.html?s=${encodeURIComponent(t.slug)}">
        <h3>${esc(t.name)}</h3>
        <div class="meta"><span class="pill">${t.format === 'bp' ? 'BP' : 'Two-team'}</span>${t.starts_on ? `<span class="pill gray">${esc(new Date(t.starts_on).toDateString())}</span>` : ''}<span class="pill gray">${t.teams} teams</span></div>
        ${t.description ? `<p class="small muted" style="margin:0">${esc(t.description.slice(0, 160))}</p>` : ''}
      </a>`).join('') : '<p class="empty">No public tournaments yet. <a href="tab.html">Host the first one →</a></p>';
  } catch (err) {
    $('#hosted').innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
}

function show(view) {
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  ['sheet', 'hosted', 'embed'].forEach(v => { $(`#view-${v}`).hidden = v !== view; });
}
$$('.tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));
document.addEventListener('click', e => { const l = e.target.closest('[data-view-link]'); if (l) { e.preventDefault(); show(l.dataset.viewLink); } });
['#q', '#month', '#mode'].forEach(s => $(s).addEventListener('input', render));
loadSheet();
loadHosted();
