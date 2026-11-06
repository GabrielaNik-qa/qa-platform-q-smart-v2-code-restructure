// The made-up company of the sandbox (3 November): shaped like a real outbound team (B2B, B2C and VIP KAM, like Kainami), but every
// person, review and practice call is invented. It is built again each time an admin makes a new sandbox, so the dates stay recent.
// A fixed seed makes it the same every time (the same people, the same scores), which helps when you compare two tries.
const bcrypt = require('bcryptjs');
const { DEFAULT_SC, build } = require('./scorecard');
const SIM = require('./sim');

const DAY = 864e5;
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }   // the same numbers every time
const TEAMS = [{ id: 't-admin', name: 'Administration', system: true }, { id: 't-b2b', name: 'B2B' }, { id: 't-b2c', name: 'B2C' }, { id: 't-vip', name: 'VIP KAM' }];
const AGENTS = [['Alex Moreau', 't-b2b', .93], ['Bianca Rossi', 't-b2b', .88], ['Carl Jansen', 't-b2b', .8], ['Dana Ivanova', 't-b2b', .74], ['Eli Novak', 't-b2b', .9],
  ['Fay Dubois', 't-b2c', .84], ['Gus Weber', 't-b2c', .7], ['Hana Kovac', 't-b2c', .86], ['Ivo Marin', 't-b2c', .78],
  ['Jade Lambert', 't-vip', .95], ['Kai Berger', 't-vip', .89], ['Lina Popova', 't-vip', .82]];
const STAFF = [['Quinn Harper', 'qa', ''], ['Sam Ortega', 'qa', ''], ['Lara Brandt', 'lead', 't-b2b'], ['Milo Hayes', 'lead', 't-b2c'], ['Vera Lind', 'lead', 't-vip'], ['Tom Reyes', 'trainer', '']];
const uname = n => 'sb.' + n.toLowerCase().split(' ')[0];
const COMMENTS = ['Good energy and a clear offer. Ask one more question before you close.', 'The call was recorded, but you did not say it: always mention the recording first.',
  'Very good objection handling, you stayed calm.', 'Explain the conditions of the offer every time.', 'Nice close: you agreed the next step with the customer.', 'Let the customer finish before you answer.'];

// admin = the record of the admin who makes the sandbox, so they stay signed in inside it
function company(admin) {
  const r = rng(20261103), now = Date.now(), H = bcrypt.hashSync('password', 8), day = n => new Date(now - n * DAY);
  const person = (name, role, team, extra = {}) => ({ username: uname(name), name, email: uname(name).slice(3) + '@example.com', role, team, title: '', desc: '', languages: [], skills: [], phone: '', start: '', active: true, hash: H, mustChange: false, ...extra });
  const staff = STAFF.map(([n, role]) => person(n, role, 't-admin'));
  const agents = AGENTS.map(([n, team]) => person(n, 'agent', team));
  const teams = TEAMS.map(t => ({ ...t, lead: t.system ? admin.username : uname(STAFF.find(s => s[2] === t.id)[0]) }));
  const qas = staff.filter(s => s.role === 'qa');
  // about 15 reviews per agent over the last 90 days: each item is answered "yes" as often as the agent's skill says
  const evaluations = [];
  AGENTS.forEach(([n, team, skill], ai) => { for (let k = 0; k < 15; k++) {
    const d = day(Math.floor(r() * 90) + 1), qa = qas[k % 2], ch = ['call', 'call', 'call', 'chat', 'email'][Math.floor(r() * 5)];
    const ans = DEFAULT_SC.cats.map(c => c.it.map(it => [r() < (it.k ? Math.min(.98, skill + .1) : skill) ? 'y' : r() < .15 ? 'na' : 'n', '']));
    const b = build(DEFAULT_SC, ans);
    evaluations.push({ rid: 'r' + (1e6 + ai * 100 + k).toString(16), id: 'LEAD-' + (40000 + ai * 100 + k), agent: uname(n), agn: n, tid: team, d: d.toISOString(), at: new Date(d.getTime() + 36e5).toISOString(),
      sc: b.sc, cs: b.cs, scid: DEFAULT_SC.id, scn: DEFAULT_SC.name, st: 'ok', fl: '', cp: '', cm: COMMENTS[Math.floor(r() * COMMENTS.length)], ch, rv: qa.name, by: qa.username, seen: r() < .8 ? d.toISOString() : null });
  } });
  evaluations.sort((a, b) => String(b.d).localeCompare(String(a.d)));
  // practice calls in Q Trainer: the good agents meet more indicators and choose the right outcome more often
  const scen = SIM.MORE.map(SIM.full), simulations = [];
  const GOOD = { 'Greets and says their name': 'Hello, my name is {n}, I am calling from Q-smart Demo.', 'Says the call is recorded': 'This call is recorded for quality.', 'Asks a question': 'How have you been?',
    'Explains the offer clearly': 'We have a special offer for you: 20% off for three months.', 'Gives the conditions': 'There is no contract and you can cancel anytime.', 'Shows the value': 'It includes everything you had before, so you save money.', 'Agrees the next step': 'I will send it to you by e-mail.', 'Closes politely': 'Thank you, have a nice day!' };
  AGENTS.forEach(([n, team, skill]) => { for (let k = 0; k < 4; k++) {
    const sc = scen[Math.floor(r() * scen.length)], first = n.split(' ')[0], msgs = [{ r: 'c', t: sc.open }];
    const said = sc.inds.filter(() => r() < skill).map(x => (GOOD[x.t] || '').replace('{n}', first)).filter(Boolean);
    for (let i = 0; i < said.length; i += 2) { msgs.push({ r: 'a', t: said.slice(i, i + 2).join(' ') }); if (sc.lines[i / 2]) msgs.push({ r: 'c', t: sc.lines[i / 2] }); }
    if (!msgs.some(m => m.r === 'a')) msgs.push({ r: 'a', t: 'Hello?' });
    const outcome = r() < skill ? sc.correct : sc.outcomes[1 + Math.floor(r() * 3)], g = SIM.grade(sc, msgs, outcome), secs = 60 + Math.floor(r() * 180), d = day(Math.floor(r() * 60));
    simulations.push({ id: 'm' + (1e5 + simulations.length).toString(16), agent: uname(n), team, sc: sc.id, scenario: sc.name, persona: sc.who, seg: sc.seg, level: sc.level, score: g.score, minutes: Math.ceil(secs / 60), secs,
      turns: msgs.filter(m => m.r === 'a').length, mode: r() < .7 ? 'voice' : 'text', lang: 'en', outcome, right: g.right, best: sc.correct, inds: g.inds, fb: g.fb, good: g.good, tips: g.tips, ai: false,
      result: g.score >= 85 ? 'winner' : 'keep practising', tx: msgs.map(m => (m.r === 'a' ? 'Agent: ' : 'Customer: ') + m.t).join('\n'), date: d.toISOString() });
  } });
  simulations.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const surveys = agents.flatMap((a, i) => [1, 2].map(k => ({ id: 'sv' + i + k, agent: a.username, date: day(3 + i + k * 9).toISOString().slice(0, 10), score: 3 + ((i + k) % 3), comment: '' })));
  return {
    boot: 5, sandbox: true, users: [{ ...admin }, ...staff, ...agents], teams,
    workspaces: [{ id: 'w-1', name: 'Outbound', teams: TEAMS.filter(t => !t.system).map(t => t.id), scorecards: [DEFAULT_SC.id], staff: staff.map(s => s.username) }],
    scorecards: [DEFAULT_SC], evaluations, simulations, surveys, settings: { pass: 85, teams: {}, catNames7: true },
    registrations: [], notifications: [], skills: [], languages: [], rootCauses: [], categories: [], autoCats: [], conversations: [], qflags: []
  };
}
module.exports = { company };
