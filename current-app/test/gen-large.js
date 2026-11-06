// Makes a LARGE made-up data file for speed tests (never the real data): 500 agents, 30 staff, 2 workspaces, a year of reviews
// (about 150 per agent), attendance for every working day, time off, the rota, capacity plans for 12 months, tasks,
// coaching sessions, 200 knowledge base articles, 50 quizzes and CSAT answers. The same seed always gives the same data.
//   node test/gen-large.js <folder>        (writes <folder>\data.json; refuses the project folder)
const fs = require('fs'), path = require('path'), bcrypt = require('bcryptjs');
const { DEFAULT_SC } = require('../scorecard');

function make({ agents = 500, staff = 30, perAgent = 150, days = 365 } = {}) {
  let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648, pick = l => l[Math.floor(rnd() * l.length)];
  const H = bcrypt.hashSync('password', 4), now = Date.now(), DAY = 864e5, iso = t => new Date(t).toISOString(), ymd = t => iso(t).slice(0, 10);
  const person = (username, role, team, name) => ({ username, name, firstName: name.split(' ')[0], lastName: name.split(' ')[1] || '', email: username + '@example.com', role, team, title: '', desc: '', languages: [], skills: [], phone: '', start: '2025-01-06', active: true, hash: H, mustChange: false });
  const teams = [{ id: 't-admin', name: 'Administration', lead: 'l.admin', system: true }];
  const nTeams = 20;
  for (let i = 0; i < nTeams; i++) teams.push({ id: 't-' + i, name: (i % 2 ? 'B2C ' : 'B2B ') + i, lead: 'l.lead' + (i % 10) });
  const users = [person('l.admin', 'admin', 't-admin', 'Large Admin')];
  const roles = ['qa', 'qa', 'qa', 'qa', 'qa', 'qa', 'qa', 'qa', 'lead', 'lead', 'lead', 'lead', 'lead', 'lead', 'lead', 'lead', 'lead', 'lead', 'trainer', 'trainer', 'trainer', 'trainer', 'qa', 'qa', 'qa', 'trainer', 'trainer', 'qa', 'qa'];
  let nl = 0, nq = 0, nt = 0;
  roles.slice(0, staff - 1).forEach(r => { const id = r === 'lead' ? 'l.lead' + nl++ : r === 'qa' ? 'l.qa' + nq++ : 'l.tr' + nt++; users.push(person(id, r, 't-admin', id.replace('l.', 'Staff ').replace(/(\d+)/, ' $1'))); });
  const agentIds = [];
  for (let i = 0; i < agents; i++) { const id = 'l.a' + i; agentIds.push(id); users.push({ ...person(id, 'agent', 't-' + (i % nTeams), 'Agent ' + i), hours: i % 10 === 0 ? 20 : 40, empType: i % 10 === 0 ? 'part' : 'full' }); }
  const staffIds = users.filter(u => u.role !== 'agent' && u.role !== 'admin').map(u => u.username), half = Math.ceil(staffIds.length / 2);
  const workspaces = [{ id: 'w-a', name: 'Workspace A', teams: teams.slice(1, 11).map(t => t.id), scorecards: ['sc-default'], staff: staffIds.slice(0, half) },
    { id: 'w-b', name: 'Workspace B', teams: teams.slice(11).map(t => t.id), scorecards: ['sc-default'], staff: staffIds.slice(half) }];
  const qas = users.filter(u => u.role === 'qa');
  const evaluations = [];
  agentIds.forEach((a, ai) => {
    for (let k = 0; k < perAgent; k++) {
      const t = now - Math.floor(rnd() * days) * DAY - Math.floor(rnd() * 8 * 36e5), q = pick(qas); let tot = 0;
      const cs = DEFAULT_SC.cats.map(c => { let e = 0; const it = c.it.map(x => { const r = rnd(), ans = r < 0.82 ? 'y' : r < 0.95 ? 'n' : 'na'; if (ans === 'y') e += x.p; return { t: x.t, p: x.p, k: !!x.k, a: ans, cm: ans === 'n' ? 'Missed: ' + x.t.slice(0, 30) : '' }; }); const m = c.it.reduce((s, x) => s + x.p, 0); tot += e; return { n: c.n, k: !!c.k, e, m, z: 0, it }; });
      evaluations.push({ rid: 'lr' + ai + '-' + k, id: 'LEAD-' + (100000 + ai * perAgent + k), agent: a, agn: 'Agent ' + ai, tid: 't-' + (ai % nTeams), d: iso(t), at: iso(t), sc: Math.min(100, tot), cs, scid: 'sc-default', scn: DEFAULT_SC.name, st: 'done', fl: rnd() < 0.05 ? 'red' : '', cp: '', cm: rnd() < 0.3 ? 'Overall a decent call, work on the closing.' : '', lk: '', rl: '', rv: q.name, by: q.username, seen: rnd() < 0.8, ch: pick(['call', 'call', 'call', 'chat', 'email']), ...(rnd() < 0.02 ? { dp: { status: rnd() < 0.5 ? 'open' : 'resolved', at: iso(t + DAY), by: a, msgs: [{ by: a, t: 'I do not agree with item 2', at: iso(t + DAY) }] } } : {}) });
    }
  });
  evaluations.sort((x, y) => y.d.localeCompare(x.d));
  // attendance: every working day (Monday to Friday) of the last year, 09:00 to 17:30 local time with a 30-minute break, a few late days and absences
  const att = {};
  for (let t = now - days * DAY; t < now - DAY; t += DAY) {
    const d = new Date(t), dow = d.getDay(); if (dow === 0 || dow === 6) continue;
    const day = ymd(t), rec = att[day] = {};
    agentIds.forEach(a => { const r = rnd(); if (r < 0.03) return; const late = r > 0.95 ? Math.floor(rnd() * 40) : 0, base = Date.parse(day + 'T07:00:00Z');
      rec[a] = { in: iso(base + late * 6e4), out: iso(base + 8.5 * 36e5), brk: [{ s: iso(base + 4 * 36e5), e: iso(base + 4.5 * 36e5) }], src: 'web' }; });
  }
  const leaves = [];
  agentIds.forEach((a, i) => { for (let k = 0; k < 4; k++) { const t = now - Math.floor(rnd() * days) * DAY, from = ymd(t), to = ymd(t + Math.floor(rnd() * 3) * DAY); leaves.push({ id: 'l' + i + '-' + k, u: a, lt: pick(['lt-annual', 'lt-annual', 'lt-sick']), from, to, part: 'full', hours: 0, days: 1, status: rnd() < 0.9 ? 'approved' : 'pending', at: iso(t - 7 * DAY), by: a }); } });
  const rota = {};
  for (let t = now; t < now + 42 * DAY; t += DAY) { const day = ymd(t); rota[day] = {}; agentIds.forEach(a => { if (rnd() < 0.05) rota[day][a] = 'off'; }); }
  const capPlans = [];
  for (let m = 0; m < 12; m++) {
    const dt = new Date(now); dt.setDate(1); dt.setMonth(dt.getMonth() - 11 + m); const month = dt.toISOString().slice(0, 7);
    for (let p = 0; p < 4; p++) capPlans.push({ id: 'cp' + m + '-' + p, month, name: 'Leads ' + month + ' #' + p, teams: teams.slice(1 + p * 5, 6 + p * 5).map(t => t.id), campaigns: Array.from({ length: 12 }, (_, c) => ({ id: 'c' + m + p + c, name: 'Brand ' + c + ' 0-30', brand: 'Brand ' + c, segment: '0-30', leads: 500 + c * 100 })), pct: {}, versions: [], at: iso(now), by: 'l.admin' });
  }
  const tasks = [], sessions = [];
  agentIds.forEach((a, i) => { for (let k = 0; k < 6; k++) tasks.push({ id: 'lk' + i + '-' + k, group: 'g' + i, title: 'Task ' + k, desc: '', type: 'task', priority: 'low', points: 10, due: ymd(now + (k - 3) * DAY), status: pick(['todo', 'doing', 'done']), assignee: a, labels: [], checklist: [], created: iso(now - k * DAY), by: pick(staffIds), completed: null });
    for (let k = 0; k < 4; k++) sessions.push({ id: 'ls' + i + '-' + k, kind: pick(['o2o', 'coaching']), date: ymd(now - k * 20 * DAY), title: 'Session ' + k, agents: [a], topics: [], focus: [], notes: 'Notes', goals: '', actions: [], by: pick(staffIds), at: iso(now - k * 20 * DAY) }); });
  const kbArticles = Array.from({ length: 200 }, (_, i) => ({ id: 'la' + i, title: 'Article ' + i, folder: '', topics: [pick(DEFAULT_SC.cats).n], body: ('## Part ' + i + '\n\nSome text about the process. ').repeat(20), at: iso(now - i * DAY), by: 'l.tr0' }));
  const quizzes = Array.from({ length: 50 }, (_, i) => ({ id: 'lq' + i, title: 'Quiz ' + i, desc: '', kind: 'weekly', topics: [], articles: [], pass: 70, due: '', assign: { all: true, teams: [], users: [] }, status: 'published', by: 'Staff tr 0', created: iso(now - i * DAY), questions: Array.from({ length: 5 }, (_, q) => ({ q: 'Question ' + q, opts: ['A', 'B', 'C', 'D'], a: 0, why: '' })) }));
  const surveys = Array.from({ length: 20000 }, (_, i) => ({ id: 'lv' + i, agent: pick(agentIds), date: ymd(now - Math.floor(rnd() * days) * DAY), score: 1 + Math.floor(rnd() * 5), comment: rnd() < 0.2 ? 'Too slow to answer' : '', by: 'l.admin', at: iso(now) }));
  return { boot: 5, users, teams, workspaces, evaluations, scorecards: [DEFAULT_SC], settings: { pass: 85, teams: {} }, att, leaves, rota, capPlans, tasks, sessions, kbArticles, kbFolders: [], quizzes, surveys,
    notifications: [], registrations: [], skills: [], languages: [], rootCauses: [], categories: [], autoCats: [], conversations: [], qflags: [], simulations: [], attempts: [], newsletters: [], calibrations: [], taskTpl: [], taskSeq: [], taskRuns: [], simScen: [], o2oTpl: [] };
}
module.exports = { make };
if (require.main === module) {
  const dir = path.resolve(process.argv[2] || ''), root = path.resolve(__dirname, '..');
  if (!process.argv[2] || dir === root || dir.startsWith(root + path.sep)) { console.error('Give a folder outside the project, e.g. node test/gen-large.js %TEMP%\\qsmart-large'); process.exit(1); }
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now(), d = make(), f = path.join(dir, 'data.json'); fs.writeFileSync(f, JSON.stringify(d, null, 2));
  console.log(`${f}: ${(fs.statSync(f).size / 1e6).toFixed(1)} MB, ${d.users.length} people, ${d.evaluations.length} reviews, ${Object.keys(d.att).length} days of attendance, in ${Date.now() - t0} ms`);
}
