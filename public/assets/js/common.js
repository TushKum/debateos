// Shared helpers: API calls, session, navigation, toasts.
export const API = window.DEBATEOS_API || '';
const TOKEN_KEY = 'debateos_token';
const USER_KEY = 'debateos_user';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
export const safeUrl = u => (/^https?:\/\//i.test(String(u || '')) ? esc(u) : '');

export function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
export function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } }
export function setSession(token, user) { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); }
export function clearSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    clearSession();
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function requireLogin() {
  if (!getToken()) {
    location.href = `auth.html?next=${encodeURIComponent(location.pathname.split('/').pop() + location.search)}`;
    throw new Error('redirecting');
  }
  return getUser();
}

let toastTimer;
export function toast(message, type = 'info') {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = message;
  el.classList.toggle('error', type === 'error');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
}

export const ROLE_LABELS = { debater: 'Debater', adjudicator: 'Adjudicator', ia: 'Independent Adjudicator (IA)', cap: 'Chief Adjudicator (CAP)', tab: 'Tab Director', equity: 'Equity Officer', coach: 'Coach', organiser: 'Organiser' };

const LINKS = [
  ['index.html', 'Home'], ['tournaments.html', 'Tournaments'], ['timer.html', 'Timer & Motions'], ['arena.html', 'AI Arena'],
  ['network.html', 'Network'], ['tab.html', 'Host a Tab'], ['resources.html', 'Resources']
];

export function renderNav() {
  const here = location.pathname.split('/').pop() || 'index.html';
  const user = getUser();
  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.innerHTML = `
    <a class="logo" href="index.html"><span class="logoMark">↗</span>DebateOS</a>
    <div class="navlinks" id="navlinks">
      ${LINKS.map(([href, label]) => `<a href="${href}" class="${here === href ? 'active' : ''}">${label}${href === 'network.html' ? '<span class="badge" id="navBadge" hidden></span>' : ''}</a>`).join('')}
      ${user?.role === 'admin' ? `<a href="admin.html" class="${here === 'admin.html' ? 'active' : ''}">Admin</a>` : ''}
    </div>
    <div class="navright">
      ${user ? `<span class="small" style="opacity:.8">${esc(user.name.split(' ')[0])}</span><button class="btn sm ghost" id="logoutBtn" type="button">Log out</button>`
             : `<a class="btn sm cyan" href="auth.html">Login / Join</a>`}
      <button class="menuBtn" id="menuBtn" type="button" aria-label="Menu">☰</button>
    </div>`;
  document.body.prepend(nav);
  $('#menuBtn').addEventListener('click', () => $('#navlinks').classList.toggle('open'));
  $('#logoutBtn')?.addEventListener('click', () => { clearSession(); location.href = 'index.html'; });

  if (user) {
    const poll = async () => {
      try {
        const u = await api('/network/unread');
        const n = u.messages + u.requests;
        const b = $('#navBadge');
        if (b) { b.hidden = !n; b.textContent = n; }
      } catch { /* offline or logged out */ }
    };
    poll();
    setInterval(poll, 30000);
  }

  const footer = document.createElement('footer');
  footer.className = 'site';
  footer.innerHTML = `<div class="in"><div><strong style="color:#fff">DebateOS</strong><br>Practice. Be Judged. Grow.</div>
    <div><a href="https://chat.whatsapp.com/LuuRNcfq2uzA0aQo1KLOmv" target="_blank" rel="noopener">WhatsApp</a> · <a href="https://www.instagram.com/debateos.online" target="_blank" rel="noopener">Instagram</a> · <a href="https://www.linkedin.com/company/debateos/" target="_blank" rel="noopener">LinkedIn</a></div>
    <div>© ${new Date().getFullYear()} DebateOS</div></div>`;
  document.body.append(footer);
}

export function fmtDate(d, opts = { dateStyle: 'medium', timeStyle: 'short' }) {
  return d ? new Date(d).toLocaleString(undefined, opts) : '—';
}

export function download(filename, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
