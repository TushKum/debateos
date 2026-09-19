import { $, api, setSession, renderNav, ROLE_LABELS } from '../common.js';
renderNav();
const params = new URLSearchParams(location.search);
let mode = 'login';
$('#circuitRole').innerHTML = Object.entries(ROLE_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
function setMode(next) {
  mode = next;
  $('#loginTab').classList.toggle('active', mode === 'login');
  $('#registerTab').classList.toggle('active', mode === 'register');
  $('#registerFields').hidden = mode !== 'register';
  $('#heading').textContent = mode === 'register' ? 'Create your account' : 'Welcome back';
  $('#intro').textContent = mode === 'register' ? 'Join DebateOS for free.' : 'Sign in to your DebateOS account.';
  $('#password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('#submit').textContent = mode === 'register' ? 'Create account' : 'Login';
  $('#msg').textContent = '';
}
$('#loginTab').onclick = () => setMode('login');
$('#registerTab').onclick = () => setMode('register');
if (params.get('mode') === 'register') setMode('register');

$('#form').onsubmit = async e => {
  e.preventDefault();
  $('#submit').disabled = true;
  $('#msg').textContent = 'Please wait…';
  const body = { email: $('#email').value, password: $('#password').value };
  if (mode === 'register') Object.assign(body, { name: $('#name').value, circuit_role: $('#circuitRole').value, institution: $('#institution').value });
  try {
    const data = await api(`/auth/${mode}`, { method: 'POST', body, auth: false });
    setSession(data.token, data.user);
    $('#msg').textContent = `Welcome, ${data.user.name}.`;
    const next = params.get('next');
    const safeNext = next && /^[a-z0-9_-]+\.html(\?.*)?$/i.test(next) ? next : null;
    location.href = safeNext || (data.user.role === 'admin' ? 'admin.html' : 'arena.html');
  } catch (err) {
    $('#msg').textContent = err.message;
  } finally {
    $('#submit').disabled = false;
  }
};
