import { renderNav } from '../common.js';
renderNav();
fetch('assets/motions.json').then(r => r.json()).then(list => {
  const m = list[Math.floor(Math.random() * list.length)];
  document.getElementById('pMotion').textContent = m.motion;
  document.getElementById('pMeta').textContent = `${m.tournament} ${m.year}`;
}).catch(() => {});
