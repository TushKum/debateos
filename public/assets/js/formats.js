// Speech orders and times for each supported format. Shared by the timer, the AI arena and the server.
// kind: 'speech' (constructive/rebuttal), 'cross' (cross-examination / crossfire), 'reply'.
// poi: true when Points of Information may be offered (outside protected time).

const s = (id, name, side, minutes, extra = {}) => ({ id, name, side, minutes, kind: 'speech', ...extra });

export const FORMATS = {
  bp: {
    id: 'bp', name: 'BP', fullName: 'British Parliamentary',
    source: 'https://www.worlddebating.org/wudc-manual',
    sides: { OG: 'Opening Government', OO: 'Opening Opposition', CG: 'Closing Government', CO: 'Closing Opposition' },
    prep: { minutes: 15, label: 'Prep time (15 min, motion released)' },
    poi: { protectedSeconds: 60 },
    scoreRange: [50, 100],
    speeches: [
      s('pm', 'Prime Minister', 'OG', 7, { poi: true }),
      s('lo', 'Leader of the Opposition', 'OO', 7, { poi: true }),
      s('dpm', 'Deputy Prime Minister', 'OG', 7, { poi: true }),
      s('dlo', 'Deputy Leader of the Opposition', 'OO', 7, { poi: true }),
      s('mg', 'Member of Government', 'CG', 7, { poi: true }),
      s('mo', 'Member of Opposition', 'CO', 7, { poi: true }),
      s('gw', 'Government Whip', 'CG', 7, { poi: true }),
      s('ow', 'Opposition Whip', 'CO', 7, { poi: true })
    ],
    rules: '4 teams of 2. 7-minute speeches. First and last minute protected; POIs allowed in between. Teams ranked 1st–4th (3/2/1/0 points). Speaker scores typically 50–100.'
  },
  wsdc: {
    id: 'wsdc', name: 'WSDC', fullName: 'World Schools',
    source: 'https://en.wikipedia.org/wiki/World_Schools_Style_debate',
    sides: { PROP: 'Proposition', OPP: 'Opposition' },
    prep: { minutes: 60, label: 'Prep time (1 hour prepared-impromptu)' },
    poi: { protectedSeconds: 60 },
    scoreRange: [60, 80],
    speeches: [
      s('p1', '1st Proposition', 'PROP', 8, { poi: true }),
      s('o1', '1st Opposition', 'OPP', 8, { poi: true }),
      s('p2', '2nd Proposition', 'PROP', 8, { poi: true }),
      s('o2', '2nd Opposition', 'OPP', 8, { poi: true }),
      s('p3', '3rd Proposition', 'PROP', 8, { poi: true }),
      s('o3', '3rd Opposition', 'OPP', 8, { poi: true }),
      s('or', 'Opposition Reply', 'OPP', 4, { kind: 'reply' }),
      s('pr', 'Proposition Reply', 'PROP', 4, { kind: 'reply' })
    ],
    rules: '2 teams of 3. 8-minute substantives with POIs after the first and before the last minute. 4-minute replies (by 1st or 2nd speaker, Opposition first) with no POIs. Judged on Style 40% / Content 40% / Strategy 20%; substantive scores 60–80, replies 30–40.'
  },
  apd: {
    id: 'apd', name: 'APD', fullName: 'Asian Parliamentary',
    source: 'https://debate-motions.info/debate-formats/asian-parliamentary-debate-format/',
    sides: { GOV: 'Government', OPP: 'Opposition' },
    prep: { minutes: 30, label: 'Prep time (30 min)' },
    poi: { protectedSeconds: 60 },
    scoreRange: [65, 85],
    speeches: [
      s('pm', 'Prime Minister', 'GOV', 7, { poi: true }),
      s('lo', 'Leader of the Opposition', 'OPP', 7, { poi: true }),
      s('dpm', 'Deputy Prime Minister', 'GOV', 7, { poi: true }),
      s('dlo', 'Deputy Leader of the Opposition', 'OPP', 7, { poi: true }),
      s('gw', 'Government Whip', 'GOV', 7, { poi: true }),
      s('ow', 'Opposition Whip', 'OPP', 7, { poi: true }),
      s('olr', 'Opposition Reply (LO/DLO)', 'OPP', 4, { kind: 'reply' }),
      s('plr', 'Government Reply (PM/DPM)', 'GOV', 4, { kind: 'reply' })
    ],
    rules: '2 teams of 3. 7-minute constructives; first and last minute protected. 4-minute replies by the 1st or 2nd speaker, Opposition first, no POIs. Used at Australs-style and Asian championships (reply-speech formats).'
  },
  cnpd: {
    id: 'cnpd', name: 'CNPD', fullName: 'Canadian Parliamentary (CUSID)',
    source: 'http://www.cusid.ca/files/guides/national_debating_guide.pdf',
    sides: { GOV: 'Government', OPP: 'Opposition' },
    prep: { minutes: 15, label: 'Prep time (motion released)' },
    poi: { protectedSeconds: 60 },
    scoreRange: [60, 90],
    speeches: [
      s('pm', 'Prime Minister (constructive)', 'GOV', 7, { poi: true }),
      s('mo', 'Member of the Opposition', 'OPP', 7, { poi: true }),
      s('mc', 'Minister of the Crown', 'GOV', 7, { poi: true }),
      s('lo', 'Leader of the Opposition (constructive + rebuttal)', 'OPP', 10, { poi: true }),
      s('pmr', 'Prime Minister Rebuttal', 'GOV', 3, { kind: 'reply' })
    ],
    rules: '2 teams of 2 in the 7-7-7-10-3 structure from the CUSID National Debating Guide. POIs outside the protected first and last minute of constructives; no new arguments in the PM rebuttal.'
  },
  ld: {
    id: 'ld', name: 'LD', fullName: 'Lincoln–Douglas',
    source: 'https://www.speechanddebate.org/competition-events/',
    sides: { AFF: 'Affirmative', NEG: 'Negative' },
    prepBank: { minutes: 4, label: 'Prep time bank (4 min each side)' },
    scoreRange: [25, 30],
    speeches: [
      s('ac', 'Affirmative Constructive', 'AFF', 6),
      s('cx1', 'Cross-Examination (Neg questions Aff)', 'NEG', 3, { kind: 'cross' }),
      s('nc', 'Negative Constructive', 'NEG', 7),
      s('cx2', 'Cross-Examination (Aff questions Neg)', 'AFF', 3, { kind: 'cross' }),
      s('1ar', 'First Affirmative Rebuttal', 'AFF', 4),
      s('nr', 'Negative Rebuttal', 'NEG', 6),
      s('2ar', 'Second Affirmative Rebuttal', 'AFF', 3)
    ],
    rules: 'One-on-one values debate on an NSDA resolution. 6-3-7-3-4-6-3 with 4 minutes of flexible prep per debater. Speaker points usually 25–30.'
  },
  policy: {
    id: 'policy', name: 'Policy', fullName: 'Policy Debate (CX)',
    source: 'https://www.speechanddebate.org/competition-events/',
    sides: { AFF: 'Affirmative', NEG: 'Negative' },
    prepBank: { minutes: 8, label: 'Prep time bank (8 min each team)' },
    scoreRange: [25, 30],
    speeches: [
      s('1ac', '1st Affirmative Constructive', 'AFF', 8),
      s('cx1', 'Cross-Ex of 1AC (by 2N)', 'NEG', 3, { kind: 'cross' }),
      s('1nc', '1st Negative Constructive', 'NEG', 8),
      s('cx2', 'Cross-Ex of 1NC (by 1A)', 'AFF', 3, { kind: 'cross' }),
      s('2ac', '2nd Affirmative Constructive', 'AFF', 8),
      s('cx3', 'Cross-Ex of 2AC (by 1N)', 'NEG', 3, { kind: 'cross' }),
      s('2nc', '2nd Negative Constructive', 'NEG', 8),
      s('cx4', 'Cross-Ex of 2NC (by 2A)', 'AFF', 3, { kind: 'cross' }),
      s('1nr', '1st Negative Rebuttal', 'NEG', 5),
      s('1ar', '1st Affirmative Rebuttal', 'AFF', 5),
      s('2nr', '2nd Negative Rebuttal', 'NEG', 5),
      s('2ar', '2nd Affirmative Rebuttal', 'AFF', 5)
    ],
    rules: 'Teams of 2 on a year-long policy resolution. 8-minute constructives, 3-minute cross-ex, 5-minute rebuttals, 8 minutes of prep per team (NSDA high-school times).'
  },
  pf: {
    id: 'pf', name: 'PF', fullName: 'Public Forum',
    source: 'https://www.speechanddebate.org/competition-events/',
    sides: { PRO: 'Pro', CON: 'Con' },
    prepBank: { minutes: 3, label: 'Prep time bank (3 min each team)' },
    scoreRange: [25, 30],
    speeches: [
      s('c1', 'Team A Constructive (1st speaker)', 'PRO', 4),
      s('c2', 'Team B Constructive (1st speaker)', 'CON', 4),
      s('cf1', 'Crossfire (1st speakers)', 'BOTH', 3, { kind: 'cross' }),
      s('r1', 'Team A Rebuttal (2nd speaker)', 'PRO', 4),
      s('r2', 'Team B Rebuttal (2nd speaker)', 'CON', 4),
      s('cf2', 'Crossfire (2nd speakers)', 'BOTH', 3, { kind: 'cross' }),
      s('s1', 'Team A Summary (1st speaker)', 'PRO', 3),
      s('s2', 'Team B Summary (1st speaker)', 'CON', 3),
      s('gcf', 'Grand Crossfire (all)', 'BOTH', 3, { kind: 'cross' }),
      s('ff1', 'Team A Final Focus (2nd speaker)', 'PRO', 2),
      s('ff2', 'Team B Final Focus (2nd speaker)', 'CON', 2)
    ],
    rules: 'Teams of 2; a coin flip decides side and speaking order (shown here with Pro speaking first). 4-4-3-4-4-3-3-3-3-2-2 with 3 minutes of prep per team (NSDA).'
  },
  oo: {
    id: 'oo', name: 'OO', fullName: 'Original Oratory',
    source: 'https://www.speechanddebate.org/competition-events/',
    sides: { SPEAKER: 'Speaker' },
    scoreRange: [1, 100],
    speeches: [s('oo', 'Original Oratory', 'SPEAKER', 10, { maxOnly: true, graceSeconds: 30 })],
    rules: 'A memorised, original persuasive speech of up to 10 minutes (30-second grace period; limited quotation). Ranked by judges; no opponent.'
  }
};

export const FORMAT_LIST = Object.values(FORMATS);

export function fmtClock(totalSeconds) {
  const sign = totalSeconds < 0 ? '-' : '';
  const t = Math.abs(Math.round(totalSeconds));
  return `${sign}${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
