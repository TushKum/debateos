// Draw generation for BP (4-team rooms) and two-team formats, power-paired by standings.

const BP_POSITIONS = ['OG', 'OO', 'CG', 'CO'];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(p => [item, ...p]));
}
const BP_PERMS = permutations([0, 1, 2, 3]);

// teams: [{ id, points, speaks, positions: {OG: n, ...}, opponents: Set<teamId> }]
export function bpDraw(teams) {
  if (teams.length < 4 || teams.length % 4 !== 0) {
    throw new Error(`BP needs a multiple of 4 teams (you have ${teams.length}). Add swing teams or remove teams.`);
  }
  // Shuffle first so ties are broken randomly, then stable sort by points (round 1 is fully random).
  const ordered = shuffle(teams).sort((a, b) => b.points - a.points);
  const rooms = [];
  for (let i = 0; i < ordered.length; i += 4) {
    const room = ordered.slice(i, i + 4);
    // Choose the position assignment that minimises how often each team has already held its position.
    let best = null, bestCost = Infinity;
    for (const perm of shuffle(BP_PERMS)) {
      const cost = perm.reduce((sum, teamIdx, posIdx) => {
        const n = room[teamIdx].positions[BP_POSITIONS[posIdx]] || 0;
        return sum + n * n;
      }, 0);
      if (cost < bestCost) { bestCost = cost; best = perm; }
    }
    rooms.push({
      bracket: room.reduce((s, t) => s + t.points, 0) / 4,
      teams: best.map((teamIdx, posIdx) => ({ team_id: room[teamIdx].id, position: BP_POSITIONS[posIdx] }))
    });
  }
  return rooms;
}

export function twoTeamDraw(teams) {
  if (teams.length < 2 || teams.length % 2 !== 0) {
    throw new Error(`Two-team formats need an even number of teams (you have ${teams.length}). Add a swing team.`);
  }
  const pool = shuffle(teams).sort((a, b) => b.points - a.points || b.speaks - a.speaks);
  const rooms = [];
  while (pool.length) {
    const a = pool.shift();
    // Pair with the highest-ranked team not already faced; fall back to the next team.
    let idx = pool.findIndex(t => !a.opponents.has(t.id));
    if (idx === -1) idx = 0;
    const [b] = pool.splice(idx, 1);
    const aGov = a.positions.GOV || 0, bGov = b.positions.GOV || 0;
    const aFirst = aGov < bGov || (aGov === bGov && Math.random() < 0.5);
    const [gov, opp] = aFirst ? [a, b] : [b, a];
    rooms.push({
      bracket: (a.points + b.points) / 2,
      teams: [{ team_id: gov.id, position: 'GOV' }, { team_id: opp.id, position: 'OPP' }]
    });
  }
  return rooms;
}

// debates: [{ bracket, teams:[{team_id}] }], adjudicators: [{id, rating, institution}], teamInstitution: Map
// Returns per-debate [{adjudicator_id, role}] — best adjudicators chair the top brackets; conflicts avoided where possible.
export function allocateAdjudicators(debates, adjudicators, teamInstitution) {
  const order = debates.map((d, i) => i).sort((a, b) => debates[b].bracket - debates[a].bracket);
  const adjs = [...adjudicators].sort((a, b) => Number(b.rating) - Number(a.rating));
  const result = debates.map(() => []);
  const conflicts = (adj, debate) => adj.institution &&
    debate.teams.some(t => (teamInstitution.get(t.team_id) || '').toLowerCase() === adj.institution.toLowerCase());

  const place = (adj, role, candidates) => {
    const target = candidates.find(i => !conflicts(adj, debates[i])) ?? candidates[0];
    result[target].push({ adjudicator_id: adj.id, role });
    return target;
  };

  const chairs = adjs.splice(0, debates.length);
  const open = [...order];
  for (const chair of chairs) {
    const used = place(chair, 'chair', open);
    open.splice(open.indexOf(used), 1);
  }
  // Remaining adjudicators join panels, cycling from the top bracket down.
  let cursor = 0;
  for (const adj of adjs) {
    const rotated = [...order.slice(cursor), ...order.slice(0, cursor)];
    place(adj, 'panel', rotated);
    cursor = (cursor + 1) % order.length;
  }
  return result;
}
