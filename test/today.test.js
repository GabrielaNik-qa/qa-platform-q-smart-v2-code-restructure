// Workforce, phase 3: the Bradford score, absence patterns, Team today (who is where, the week ahead, what to watch), the
// morning brief (written by the app when the AI is not connected) and the attendance reports, on four months of check-ins.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const { DEFAULT_SC } = require('../scorecard');
const wf = require('../wf');

test('the Bradford score: separate spells weigh more than one long absence; days off do not end a spell; patterns on Mondays or Fridays', () => {
  const day = (work, abs) => ({ work, abs });
  assert.deepEqual(wf.bradford([day(1, 1), day(1, 1), day(1, 1), day(1, 1), day(1, 1)]), { spells: 1, days: 5, score: 5 }, 'one week off in one go: 1 × 1 × 5');
  assert.deepEqual(wf.bradford([day(1, 1), day(1, 0), day(1, 1), day(1, 0), day(1, 1), day(1, 0), day(1, 1), day(1, 0), day(1, 1)]), { spells: 5, days: 5, score: 125 }, 'five single days: 5 × 5 × 5');
  assert.equal(wf.bradford([day(1, 1), day(0, 0), day(0, 0), day(1, 1)]).spells, 1, 'Friday and the next Monday: the weekend does not end the spell');
  assert.equal(wf.bradford([day(1, 0.5), day(1, 0), day(1, 1)]).days, 1.5);
  assert.deepEqual([wf.bfLevel(49, [50, 125, 400]), wf.bfLevel(50, [50, 125, 400]), wf.bfLevel(130, [50, 125, 400]), wf.bfLevel(400, [50, 125, 400])], [0, 1, 2, 3]);
  assert.deepEqual(wf.weekdayPattern(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-21']), { dow: 1, n: 3, total: 4 });
  assert.equal(wf.weekdayPattern(['2026-10-06', '2026-10-13', '2026-10-20']), null, 'Tuesdays are not a pattern to report');
  const R = wf.cleanRules({ bradford: [100, 40, 900], briefOn: true, briefAfter: '45', minOnPct: 150 });
  assert.deepEqual([R.bradford, R.briefOn, R.briefAfter, R.minOnPct], [[50, 125, 400], true, 45, 100], 'levels must rise; numbers are kept in range');
  const S = wf.settingsOf(null, '2026-10-27'); assert.deepEqual(S.leaveTypes.filter(t => t.bradford).map(t => t.id), ['lt-sick'], 'sick leave counts by default');
});

// ---------------------------------------------------------------- four months of check-ins
const today = wf.localDay(), back = (dw, n) => { const out = []; for (let d = wf.addDays(today, -1); out.length < n; d = wf.addDays(d, -1)) if (wf.dow(d) === dw) out.push(d); return out; };
const MONDAYS = back(1, 3), TUESDAYS = back(2, 2);                                   // a.agent2 is absent on the last 3 Mondays; a.agent is late on the last 2 Tuesdays
let NEXT = wf.addDays(today, 1); while (![1, 2, 3, 4, 5].includes(wf.dow(NEXT))) NEXT = wf.addDays(NEXT, 1);   // the next working day (within the coming week)
const at = (d, hm) => new Date(wf.atLocal(d, hm)).toISOString(), ATT = {};
for (let d = wf.addDays(today, -120); d <= today; d = wf.addDays(d, 1)) {
  if (![1, 2, 3, 4, 5].includes(wf.dow(d))) continue;
  ATT[d] = { 'd.agent': { in: at(d, TUESDAYS.includes(d) ? '09:20' : '09:00'), out: at(d, '18:00'), brk: [] } };
  if (!MONDAYS.includes(d)) ATT[d]['d.agent2'] = { in: at(d, '09:00'), out: at(d, '18:00'), brk: [] };
}
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qsmart-today-')), DATA = path.join(DIR, 'data.json'), H = bcrypt.hashSync('password', 4);
const person = (username, role, team, extra) => ({ username, name: username, firstName: username, lastName: 'Test', email: username + '@test.com', role, team, title: '', desc: '', languages: [], skills: [], phone: '', start: '', active: true, hash: H, mustChange: false, ...extra });
const S0 = wf.settingsOf(null, today);
fs.writeFileSync(DATA, JSON.stringify({ boot: 5,
  users: [person('d.admin', 'admin', 't-admin'), person('d.lead', 'lead', 't-admin'), person('d.qa', 'qa', 't-admin'), person('d.agent', 'agent', 't-a'), person('d.agent2', 'agent', 't-a'), person('d.agent3', 'agent', 't-a', { start: today })],
  teams: [{ id: 't-admin', name: 'Administration', lead: 'd.admin', system: true }, { id: 't-a', name: 'Team A', lead: 'd.lead' }],
  workspaces: [{ id: 'w-1', name: 'One', teams: ['t-a'], scorecards: ['sc-default'], staff: ['d.lead', 'd.qa'] }],
  scorecards: [DEFAULT_SC], evaluations: [], skills: [], languages: [], rootCauses: [], categories: [], autoCats: [], conversations: [], att: ATT,
  leaves: [{ id: 'l-1', u: 'd.agent3', lt: 'lt-annual', from: NEXT, to: NEXT, part: 'full', hours: 0, days: 1, status: 'approved', at: today, by: 'd.lead' }],
  settings: { pass: 85, teams: {}, wf: { ...S0, calendars: [{ id: 'c-bg', name: 'Week', country: '', days: ['off', 'work', 'work', 'work', 'work', 'work', 'off'], holidays: [] }],
    rules: { ...S0.rules, since: wf.addDays(today, -120), lateLimit: 1, bradford: [10, 40, 100], minOnPct: 70, briefOn: false } } } }));

let BASE = '', srv = null;
test.before(async () => {
  srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '0', DATA_FILE: DATA, AUDIT_FILE: path.join(DIR, 'audit.json'), REC_DIR: path.join(DIR, 'rec'), BACKUPS_DIR: path.join(DIR, 'backups'), ANTHROPIC_API_KEY: '', SMTP_HOST: '', NO_SCHEDULE: '1' } });
  BASE = await new Promise((ok, no) => {
    const t = setTimeout(() => no(new Error('the server did not start')), 15000);
    srv.stdout.on('data', d => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) { clearTimeout(t); ok('http://localhost:' + m[1]); } });
    srv.on('exit', c => no(new Error('the server stopped: ' + c)));
  });
});
test.after(() => { if (srv) srv.kill(); try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) { /* temp folder */ } });
let NADDR = 0;
async function as(username) {
  let cookie = ''; const addr = '10.44.0.' + (++NADDR);
  const call = async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': addr, ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    return { status: r.status, json };
  };
  assert.equal((await call('POST', '/api/login', { username, password: 'password' })).status, 200);
  return { get: u => call('GET', u), post: (u, b = {}) => call('POST', u, b), put: (u, b = {}) => call('PUT', u, b) };
}

test('Team today: who is where, the week ahead with a short-staffed day, and what to watch (Bradford score, absences on Mondays)', async () => {
  const lead = await as('d.lead'), ag = await as('d.agent');
  assert.equal((await ag.get('/api/wf/today')).status, 403, 'a view for the people who look after a team');
  const T = (await lead.get('/api/wf/today?team=t-a')).json;
  assert.deepEqual([T.team, T.counts.size, T.rows.length], ['t-a', 3, 3]);
  const w = T.week.find(x => x.d === NEXT); assert.deepEqual([w.usual, w.planned, w.away.map(a => a.name), w.warn], [3, 2, ['d.agent3'], true], 'one of three away: below 70% of the usual people');
  const s2 = T.signals.filter(g => g.u === 'd.agent2');
  assert.ok(s2.some(g => g.kind === 'weekday' && g.dow === 1 && g.n === 3), 'often absent on Mondays');
  const bf = s2.find(g => g.kind === 'bradford'); assert.deepEqual([bf.spells, bf.days, bf.n, bf.level], [3, 3, 27, 1], '3 single days: 3 × 3 × 3, above the first level (10)');
  assert.ok(!T.signals.some(g => g.u === 'd.agent' && g.kind !== 'late'), 'nothing else to say about the agent who is always there');
  if (TUESDAYS.some(d => d.slice(0, 7) === today.slice(0, 7))) assert.ok(T.signals.some(g => g.u === 'd.agent' && g.kind === 'late'), 'late this month, over the allowed number');
});

test('the morning brief: one per team and day, from the facts of the morning; without the AI the page writes them out', async () => {
  const lead = await as('d.lead'), qa = await as('d.qa'), ag = await as('d.agent');
  assert.equal((await lead.post('/api/wf/brief', {})).status, 400, 'choose a team');
  assert.equal((await ag.post('/api/wf/brief', { team: 't-a' })).status, 403);
  const b = (await lead.post('/api/wf/brief', { team: 't-a' })).json;
  assert.deepEqual([b.ai, b.text, b.facts.team, b.facts.size], [false, '', 'Team A', 3]);
  assert.ok(b.facts.toWatch.some(g => g.name === 'd.agent2' && g.kind === 'weekday' && /Mondays/.test(g.what)));
  assert.deepEqual(b.facts.weekAhead.map(x => x.date), [NEXT]);
  const again = (await qa.post('/api/wf/brief', { team: 't-a' })).json; assert.notEqual(again.id, b.id);
  assert.equal((await lead.get('/api/wf/today?team=t-a')).json.briefs.length, 1, 'writing it again replaces the brief of the day');
});

test('attendance reports: late arrivals, absences, hours and the Bradford score of a period, per person and per team', async () => {
  const lead = await as('d.lead'), from = wf.addDays(today, -28), to = wf.addDays(today, -1);
  const P = (await lead.get(`/api/att/report?team=t-a&from=${from}&to=${to}`)).json;
  assert.deepEqual([P.from, P.to, P.people.length], [from, to, 3]);
  const a = P.people.find(p => p.u === 'd.agent'), a2 = P.people.find(p => p.u === 'd.agent2'), a3 = P.people.find(p => p.u === 'd.agent3');
  assert.deepEqual([a.late, a.lateMin, a.absent], [2, 40, 0], 'late 20 minutes on two Tuesdays');
  assert.deepEqual([a2.absent, a2.unplanned, a2.late, a2.bradford.spells], [3, 3, 0, 3]);
  assert.equal(a2.present, a2.planned - 3);
  assert.equal(a3.planned, 0, 'nothing is planned before the start date');
  assert.deepEqual([P.teams[0].absent, P.teams[0].late], [3, 2]);
  assert.ok(a.balances.some(b => b.lt === 'lt-annual' && b.allowance === 20), 'this year’s leave balances come with it');
  assert.equal((await (await as('d.agent')).get('/api/att/report?team=t-a')).status, 403);
  const since = wf.addDays(today, -120), wd = n => { let c = 0; for (let d = since; d <= wf.addDays(since, n); d = wf.addDays(d, 1)) if ([1, 2, 3, 4, 5].includes(wf.dow(d))) c++; return c; };
  const early = (await lead.get(`/api/att/report?team=t-a&from=${wf.addDays(since, -14)}&to=${wf.addDays(since, 6)}`)).json, ea = early.people.find(p => p.u === 'd.agent');
  assert.deepEqual([ea.planned, ea.present, ea.absent, early.teams[0].presentPct], [wd(6), wd(6), 0, 100], 'the days before attendance is tracked are left out');
  const now = (await lead.get(`/api/att/report?team=t-a&from=${today}&to=${today}`)).json.people.find(p => p.u === 'd.agent3');
  const st3 = (await lead.get('/api/wf/today?team=t-a')).json.rows.find(r => r.u === 'd.agent3').st;   // in the evening, after the shift, the day is over
  assert.deepEqual([now.planned, now.absent], st3 === 'absent' ? [1, 1] : [0, 0], 'a shift of today that is not over yet is not counted');
  const far = (await lead.get('/api/att/report?team=t-a&from=2001-01-01&to=2099-01-01')).json;
  const adm = await as('d.admin'), lv = async v => { const r = await adm.put('/api/wf/settings', { rules: { bradford: v } }); return [r.status, r.status === 200 ? r.json.rules.bradford : r.json.error]; };
  assert.deepEqual(await lv([100, 40, 900]), [400, 'The three Bradford levels must go up: watch, then talk to them, then serious'], 'levels that do not go up are refused, not quietly replaced');
  assert.deepEqual(await lv(['10', '40', '100']), [200, [10, 40, 100]], 'numbers typed in the page are fine');
  assert.deepEqual([far.to, wf.diffDays(far.from, far.to)], [today, 365], 'at most a year, never in the future');
});
