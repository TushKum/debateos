import { $, $$, esc, renderNav } from '../common.js';
renderNav();

// Links checked Sept 2026. Admins can extend this list in code; videos are hosted on YouTube.
const MANUALS = [
  { t: 'WUDC Manual — official page', u: 'https://www.worlddebating.org/wudc-manual', d: 'World Universities Debating Council: current Debating & Judging Manual and archives.', tag: 'WUDC' },
  { t: 'Sofia WUDC 2026 Debater & Judge Manual (rev. Oct 2025)', u: 'https://www.nwforensics.org/su-debate/WUDC%20Manual%20Oct%2017%202025.pdf', d: 'Most recent revision used for Sofia WUDC 2026.', tag: 'PDF' },
  { t: 'Debating & Judging Manual (Panama WUDC 2025 CAP, rev. Nov 2024)', u: 'https://debate.ethz.ch/wp-content/uploads/2024/11/WUDC-Debating-Judging-Manual-Revised-November-2024-.pdf', d: 'Manual updated by the Panama WUDC 2025 adjudication core.', tag: 'PDF' },
  { t: 'WUDC Debating & Judging Manual (rev. Nov 2022)', u: 'https://esdachronos.nl/uploads/WUDC%20Judge%20Manual%20-%20Revised%20November%202022.pdf', d: 'Madrid WUDC 2023 cycle revision.', tag: 'PDF' },
  { t: 'World Universities Debating Championships', u: 'https://www.worlddebating.org/', d: 'Council site: constitution, championship history, equity policy.', tag: 'WUDC' }
];

const VIDEOS = [
  { t: 'Sofia WUDC 2026 — Open Final', id: '7BiSO2yljP4', d: 'THO the development of AI systems to optimise for human influence' },
  { t: 'Sofia WUDC 2026 — Open Semifinal', id: 'Jn5dxMeMyKg' },
  { t: 'Sofia WUDC 2026 — ESL Final', id: 'n9FHDI3xXa4' },
  { t: 'Sofia WUDC 2026 — EFL Final', id: '3SxicIZ8BOY' },
  { t: 'Vietnam WUDC 2024 — Open Grand Final', id: 'oy_zE6G7Qzs', d: 'THO the norm to prefer the natural to the artificial' },
  { t: 'Madrid WUDC 2023 — Open Grand Final', id: 'ra9Ud3aVE0g', d: 'THP a world where all individuals have a strong belief in Ubuntu' },
  { t: 'Madrid WUDC 2023 — Grand Final (with subtitles)', id: 'BIaZ1RyZq7w' },
  { t: 'Madrid WUDC 2023 — EFL Final', id: 'ESDn3TaLiKo' },
  { t: 'Belgrade WUDC 2022 — Open Grand Final', id: 'j0Y4Yi6YQsk', d: 'THS a decline in global reliance on the dollar' }
];
const PLAYLISTS = [
  { t: 'Sofia WUDC 2026 — debate recordings (playlist)', u: 'https://www.youtube.com/playlist?list=PLOHLBnU-6HMpd-UMvJ_lDxSUqsSjGndp5', d: 'Rounds and outrounds from Sofia.', tag: 'YT' },
  { t: 'Panama WUDC 2025 (playlist)', u: 'https://www.youtube.com/playlist?list=PLAntmD_yHPRC4gTbJaE0fbETmclCIzo_E', d: 'Recordings from WUDC 2025.', tag: 'YT' },
  { t: 'Belgrade WUDC 2022 rounds (playlist)', u: 'https://www.youtube.com/playlist?list=PLAntmD_yHPRBPKerDJToXE2yLOkngsD7g', d: 'In-round recordings from Belgrade.', tag: 'YT' },
  { t: 'Search all WUDC Grand Finals on YouTube', u: 'https://www.youtube.com/results?search_query=WUDC+grand+final', d: 'Older championships (2010–2021).', tag: 'YT' }
];

const GUIDES = [
  { t: 'World Schools style — overview', u: 'https://en.wikipedia.org/wiki/World_Schools_Style_debate', d: '8-minute substantives, 4-minute replies, Style/Content/Strategy marking.', tag: 'WSDC' },
  { t: 'CUSID National Debating Guide (Canadian Parliamentary)', u: 'http://www.cusid.ca/files/guides/national_debating_guide.pdf', d: 'The 7-7-7-10-3 Canadian Parliamentary format.', tag: 'CNPD' },
  { t: 'Asian Parliamentary format', u: 'https://debate-motions.info/debate-formats/asian-parliamentary-debate-format/', d: '3v3 with reply speeches; protected time and POIs.', tag: 'APD' },
  { t: 'NSDA competition events (LD, Policy, PF, Original Oratory)', u: 'https://www.speechanddebate.org/competition-events/', d: 'Official US National Speech & Debate Association event rules and times.', tag: 'NSDA' },
  { t: 'Australs (Australasian Intervarsity Championships)', u: 'https://en.wikipedia.org/wiki/Australasian_Intervarsity_Debating_Championships', d: 'History and 3-on-3 reply format.', tag: 'AUS' }
];

const BANKS = [
  { t: 'DebateOS motion generator', u: 'timer.html', d: 'WUDC, EUDC, Australs and ABP motions with info slides, built into the timer.', tag: 'DOS' },
  { t: 'HelloMotions — WUDC motions', u: 'https://hellomotions.com/wudc-motions', d: 'Searchable archive of championship motions.', tag: 'DB' },
  { t: 'HelloMotions — EUDC motions', u: 'https://hellomotions.com/eudc-motions', d: 'European Universities Debating Championship motions.', tag: 'DB' },
  { t: 'WUDC 2026 tab & motions', u: 'https://wudc2026.calicotab.com/open/motions/', d: 'Official Calico/Tabbycat tab for Sofia WUDC 2026.', tag: 'TAB' },
  { t: 'WUDC 2025 tab & motions', u: 'https://wudc2025.calicotab.com/open/motions/', d: 'Official tab for Panama WUDC 2025.', tag: 'TAB' }
];

const res = r => `<a class="card res" data-search="${esc((r.t + r.d).toLowerCase())}" href="${esc(r.u)}" ${r.u.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>
  <span class="ic">${esc(r.tag)}</span><span><h3>${esc(r.t)}</h3><p class="small muted">${esc(r.d)}</p></span></a>`;

$('#manuals').innerHTML = MANUALS.map(res).join('');
$('#videos').innerHTML = VIDEOS.map(v => `
  <a class="card video" data-search="${esc((v.t + (v.d || '')).toLowerCase())}" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">
    <img loading="lazy" alt="" src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg">
    <div><h3>${esc(v.t)}</h3>${v.d ? `<p class="small muted" style="margin:0">${esc(v.d)}</p>` : ''}</div></a>`).join('') + PLAYLISTS.map(res).join('');
$('#guides').innerHTML = GUIDES.map(res).join('');
$('#banks').innerHTML = BANKS.map(res).join('');

$('#filter').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  $$('[data-search]').forEach(el => { el.hidden = q && !el.dataset.search.includes(q); });
});
