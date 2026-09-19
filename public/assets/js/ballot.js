import { esc } from './common.js';

// Renders a ballot form for one debate. teams: [{team_id, name, position}], speakersByTeam: Map(team_id -> [{id,name}])
export function ballotForm({ format, speakersPerTeam, debate, speakersByTeam, existingScores = [] }) {
  const bp = format === 'bp';
  const scoreFor = (sid, order) => existingScores.find(s => String(s.speaker_id) === String(sid) && Number(s.speech_order) === order)?.score ?? '';
  const slots = bp ? speakersPerTeam : speakersPerTeam + 1; // two-team formats get a reply slot
  return `<form class="stack" data-ballot="${debate.id}">
    ${debate.teams.map(t => {
      const speakers = speakersByTeam.get(String(t.team_id)) || [];
      return `<div class="card" style="padding:12px">
        <div class="row spread"><strong>${esc(t.position)} · ${esc(t.name)}</strong>
          ${bp ? `<select name="rank-${t.team_id}" required style="width:auto"><option value="">Rank…</option>${[3, 2, 1, 0].map((p, i) => `<option value="${p}" ${t.points === p ? 'selected' : ''}>${i + 1}${['st', 'nd', 'rd', 'th'][i]}</option>`).join('')}</select>`
              : `<label class="check"><input type="radio" name="winner" value="${t.team_id}" ${t.points === 1 ? 'checked' : ''} required> Winner</label>`}
        </div>
        <div class="ballotGrid" style="margin-top:8px">
          ${Array.from({ length: slots }, (_, i) => {
            const order = i + 1;
            const isReply = !bp && order === slots;
            return `<select name="sp-${t.team_id}-${order}" aria-label="Speaker">${isReply ? '<option value="">No reply speech</option>' : ''}${speakers.map((s, k) => {
              const selected = existingScores.length ? scoreFor(s.id, order) !== '' : (!isReply && k === i) ;
              return `<option value="${s.id}" ${selected ? 'selected' : ''}>${isReply ? 'Reply: ' : `${order}. `}${esc(s.name)}</option>`;
            }).join('')}</select>
            <input name="score-${t.team_id}-${order}" type="number" step="0.5" min="${isReply ? 0 : 0}" max="100" placeholder="${bp ? '75' : isReply ? '37' : '70'}" value="${esc(speakers.map(s => scoreFor(s.id, order)).find(v => v !== '') ?? '')}" ${isReply ? '' : 'required'}>`;
          }).join('')}
        </div></div>`;
    }).join('')}
    <button class="btn" type="submit">Submit ballot</button>
  </form>`;
}

export function readBallot(form, { format, speakersPerTeam, debate }) {
  const bp = format === 'bp';
  const data = new FormData(form);
  const slots = bp ? speakersPerTeam : speakersPerTeam + 1;
  const teams = debate.teams.map(t => ({
    team_id: t.team_id,
    points: bp ? Number(data.get(`rank-${t.team_id}`)) : (String(data.get('winner')) === String(t.team_id) ? 1 : 0)
  }));
  const scores = [];
  for (const t of debate.teams) {
    for (let order = 1; order <= slots; order++) {
      const speaker = data.get(`sp-${t.team_id}-${order}`);
      const score = data.get(`score-${t.team_id}-${order}`);
      if (speaker && score !== '' && score != null) scores.push({ speaker_id: speaker, speech_order: order, score: Number(score) });
    }
  }
  return { teams, scores };
}
