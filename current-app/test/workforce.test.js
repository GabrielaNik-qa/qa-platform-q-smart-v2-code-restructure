// Workforce, phase 1: public holidays, how every day of the rota is worked out, the set-up an admin saves, the employment
// fields of a user (and that their private details never reach anybody else), and who may plan the rota of which team.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const { DEFAULT_SC } = require('../scorecard');
const wf = require('../wf');

test('Bulgarian public holidays: Orthodox Easter, and a fixed holiday on a weekend gives the next working day off', () => {
  assert.deepEqual([2025, 2026, 2027].map(wf.orthodoxEaster), ['2025-04-20', '2026-04-12', '2027-05-02']);
  const h26 = wf.bgHolidays(2026).map(h => h.d);
  ['2026-04-10', '2026-04-11', '2026-04-12', '2026-04-13'].forEach(d => assert.ok(h26.includes(d), 'Easter ' + d));
  ['2026-05-25', '2026-09-07', '2026-12-28'].forEach(d => assert.ok(h26.includes(d), 'moved day off ' + d));
  const moved = y => wf.bgHolidays(y).filter(h => h.n.startsWith('Day off')).map(h => h.d);
  assert.deepEqual(moved(2021), ['2021-05-04', '2021-12-27', '2021-12-28'], 'Labour Day on a Saturday after Easter Monday, and a Christmas weekend');
  assert.deepEqual(moved(2022), ['2022-01-03', '2022-05-02', '2022-12-27', '2022-12-28']);
});

test('a day of the rota: a change on the rota, then a public holiday, then the pattern, then the usual shift on working days', () => {
  const W = wf.settingsOf({ shifts: [{ id: 's-day', name: 'Day', start: '09:00', end: '18:00', brk: 60 }, { id: 's-night', name: 'Night', start: '22:00', end: '06:00', brk: 30 }],
    calendars: [{ id: 'c-bg', name: 'Bulgaria', days: ['off', 'work', 'work', 'work', 'work', 'work', 'half'], holidays: [{ d: '2026-12-24', n: 'Christmas Eve' }] }],
    patterns: [{ id: 'p-4', name: '4 on 4 off', days: ['s-night', 's-night', 's-night', 's-night', 'off', 'off', 'off', 'off'] }] }, '2026-10-27');
  const u = { username: 'a', start: '2026-02-01', shift: 's-night' }, rota = { '2026-12-22': { a: 'off' }, '2026-12-24': { a: 's-day' } };
  assert.deepEqual(wf.planOf(W, u, '2026-12-21', rota), { v: 's-night', src: 'usual' }, 'Monday: the usual shift');
  assert.deepEqual(wf.planOf(W, u, '2026-12-22', rota), { v: 'off', src: 'set' }, 'a change on the rota wins');
  assert.equal(wf.planOf(W, u, '2026-12-24', rota).v, 's-day', 'working on a public holiday when the rota says so');
  assert.deepEqual(wf.planOf(W, u, '2026-12-24', {}), { v: 'hol', src: 'hol', hol: 'Christmas Eve' });
  assert.deepEqual(wf.planOf(W, u, '2026-12-26', {}), { v: 's-night', src: 'usual', half: true }, 'Saturday is a half day in this calendar');
  assert.deepEqual(wf.planOf(W, u, '2026-12-27', {}), { v: 'off', src: 'week' });
  assert.deepEqual(wf.planOf(W, u, '2026-01-15', {}), { v: 'none', src: 'out' }, 'not planned before the start date');
  assert.equal(wf.planOf(W, { ...u, empStatus: 'left', exitDate: '2026-12-01' }, '2026-12-02', {}).v, 'none', 'not planned after the last working day');
  const p = { ...u, pattern: 'p-4', patStart: '2026-12-01' };
  assert.deepEqual(['2026-12-01', '2026-12-04', '2026-12-05', '2026-12-09', '2026-11-30'].map(d => wf.planOf(W, p, d, {}).v), ['s-night', 's-night', 'off', 's-night', 'off'], 'the cycle repeats, also backwards');
  assert.equal(wf.shiftHours(W.shifts[1]), 7.5, 'a night shift over midnight, minus the break');
});

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qsmart-wf-')), DATA = path.join(DIR, 'data.json');
const H = bcrypt.hashSync('password', 4), db = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));
const person = (username, role, team, extra) => ({ username, name: username, firstName: username, lastName: 'Test', email: username + '@test.com', role, team, title: '', desc: '', languages: [], skills: [], phone: '', start: '', active: true, hash: H, mustChange: false, ...extra });
fs.writeFileSync(DATA, JSON.stringify({ boot: 5,
  users: [person('w.admin', 'admin', 't-admin'), person('w.qa', 'qa', 't-admin'), person('w.lead', 'lead', 't-admin'), person('w.lead2', 'lead', 't-admin'), person('w.trainer', 'trainer', 't-admin'),
    person('w.agent', 'agent', 't-a'), person('w.agent2', 'agent', 't-a', { start: '2026-12-23' }), person('w.agent3', 'agent', 't-b')],
  teams: [{ id: 't-admin', name: 'Administration', lead: 'w.admin', system: true }, { id: 't-a', name: 'Team A', lead: 'w.lead' }, { id: 't-b', name: 'Team B', lead: 'w.lead2' }],
  workspaces: [{ id: 'w-1', name: 'One', teams: ['t-a'], scorecards: ['sc-default'], staff: ['w.qa', 'w.lead', 'w.trainer'] }, { id: 'w-2', name: 'Two', teams: ['t-b'], scorecards: ['sc-default'], staff: ['w.lead2'] }],
  scorecards: [DEFAULT_SC], evaluations: [], settings: { pass: 85, teams: {}, ai: { key: 'v1:secret', playbook: 'internal rules' } }, skills: [], languages: [], rootCauses: [], categories: [], autoCats: [], conversations: [] }));

let BASE = '', srv = null;
test.before(async () => {
  srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '0', DATA_FILE: DATA, AUDIT_FILE: path.join(DIR, 'audit.json'), REC_DIR: path.join(DIR, 'rec'), BACKUPS_DIR: path.join(DIR, 'backups'), ANTHROPIC_API_KEY: '', SMTP_HOST: '' } });
  BASE = await new Promise((ok, no) => {
    const t = setTimeout(() => no(new Error('the server did not start')), 15000);
    srv.stdout.on('data', d => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) { clearTimeout(t); ok('http://localhost:' + m[1]); } });
    srv.on('exit', c => no(new Error('the server stopped: ' + c)));
  });
});
test.after(() => { if (srv) srv.kill(); try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) { /* temp folder */ } });

let NADDR = 0;
async function as(username) {
  let cookie = ''; const addr = '10.66.0.' + (++NADDR);
  const call = async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': addr, ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    return { status: r.status, json };
  };
  assert.equal((await call('POST', '/api/login', { username, password: 'password' })).status, 200);
  return { get: u => call('GET', u), put: (u, b) => call('PUT', u, b), post: (u, b = {}) => call('POST', u, b) };
}

test('the set-up: everybody reads the calendars and shifts (never the AI settings); only admins change them, and wrong values are refused', async () => {
  const a = await as('w.admin'), ag = await as('w.agent'), qa = await as('w.qa');
  const s = (await ag.get('/api/settings')).json;
  assert.equal(s.wf.calendars[0].country, 'BG'); assert.equal(s.wf.shifts[0].name, 'Day'); assert.ok(s.wf.calendars[0].holidays.length >= 28, 'two years of Bulgarian holidays by default');
  assert.equal(s.ai, undefined, 'the AI block (encrypted key, playbook) never leaves the server'); assert.equal((await a.get('/api/settings')).json.ai, undefined);
  assert.equal((await qa.put('/api/wf/settings', { defShift: 's-day' })).status, 403);
  assert.equal((await a.put('/api/wf/settings', { shifts: [] })).status, 400, 'at least one shift');
  assert.equal((await a.put('/api/wf/settings', { shifts: [{ name: 'Bad', start: '9am', end: '18:00' }] })).status, 400);
  assert.equal((await a.put('/api/wf/settings', { shifts: [{ name: 'Short', start: '09:00', end: '10:00', brk: 90 }] })).status, 400, 'the break is longer than the shift');
  assert.equal((await a.put('/api/wf/settings', { calendars: [{ name: 'Never', days: ['off', 'off', 'off', 'off', 'off', 'off', 'off'] }] })).status, 400);
  const r = await a.put('/api/wf/settings', { shifts: [s.wf.shifts[0], { name: 'Late', color: '#7c3aed', start: '14:00', end: '22:00', brk: 30 }],
    patterns: [{ name: 'Two weeks', days: ['s-day', 's-day', 's-day', 's-day', 's-day', 'off', 'off', 'gone', 'gone', 'off'] }] });
  assert.equal(r.status, 200); assert.equal(r.json.shifts.length, 2); assert.match(r.json.shifts[1].id, /^s-/);
  assert.deepEqual(r.json.patterns[0].days.slice(7, 9), ['s-day', 's-day'], 'a shift that does not exist becomes the default shift');
  const h = await a.post('/api/wf/holidays', { country: 'BG', year: 2027 }); assert.ok(h.json.some(x => x.d === '2027-05-02' && x.n === 'Easter'));
  assert.equal((await a.post('/api/wf/holidays', { country: 'DE', year: 2027 })).status, 400);
});

test('employment fields: saved and checked in Admin › Users; private details reach only admins and the person', async () => {
  const a = await as('w.admin'), late = db().settings.wf.shifts[1].id;
  const r = await a.put('/api/users/w.agent', { empId: 'E-100', empType: 'part', hours: 20, shift: late, birthday: '1990-05-01', ecName: 'Maria', ecPhone: '+359 88', manager: 'w.lead' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const u = db().users.find(x => x.username === 'w.agent');
  assert.deepEqual([u.empId, u.empType, u.hours, u.shift, u.birthday, u.ecName, u.manager, u.empStatus], ['E-100', 'part', 20, late, '1990-05-01', 'Maria', 'w.lead', 'active']);
  assert.equal((await a.put('/api/users/w.agent2', { empId: 'E-100' })).status, 400, 'an employee ID is used once');
  assert.equal((await a.put('/api/users/w.agent2', { manager: 'w.agent' })).status, 400, 'the manager is a member of staff');
  assert.equal((await a.put('/api/users/w.agent2', { hours: 'lots', empStatus: 'left' })).status, 200);
  const u2 = db().users.find(x => x.username === 'w.agent2'); assert.equal(u2.hours, 40); assert.ok(u2.exitDate, 'a leaving date is set');
  await a.put('/api/users/w.agent2', { empStatus: 'active' }); assert.equal(db().users.find(x => x.username === 'w.agent2').exitDate, '');
  const roster = JSON.stringify((await (await as('w.lead')).get('/api/roster')).json);
  assert.ok(!roster.includes('1990-05-01') && !roster.includes('Maria') && !roster.includes('E-100'), 'colleagues never get the private details');
  const ag = await as('w.agent'), me = (await ag.get('/api/me')).json;
  assert.deepEqual([me.birthday, me.ecName, me.hours, me.showBday], ['1990-05-01', 'Maria', 20, false], 'the person sees their own details');
  const p = await ag.put('/api/profile', { firstName: 'W', lastName: 'Agent', showBday: true, ecPhone: '+359 99' });
  assert.equal(p.status, 200); assert.deepEqual([p.json.showBday, p.json.ecPhone], [true, '+359 99']);
});

test('the rota: worked out day by day; team leads plan their own teams, QA looks, agents see only their own team', async () => {
  const lead = await as('w.lead'), lead2 = await as('w.lead2'), qa = await as('w.qa'), ag = await as('w.agent'), late = db().settings.wf.shifts[1].id;
  let R = (await lead.get('/api/wf/rota?team=t-a&from=2026-12-23')).json;
  assert.equal(R.from, '2026-12-21', 'weeks start on Monday'); assert.equal(R.edit, true);
  const A = R.people.find(p => p.u === 'w.agent'), A2 = R.people.find(p => p.u === 'w.agent2');
  assert.deepEqual(A.cells.map(c => c.v), [late, late, late, 'hol', 'hol', 'hol', 'off'], 'the usual late shift, Christmas, Sunday');
  assert.equal(A.planned, 22.5, '3 late shifts of 7.5 hours'); assert.equal(A.hours, 20);
  assert.deepEqual(A2.cells.slice(0, 3).map(c => c.v), ['none', 'none', 's-day'], 'nothing before the start date');
  assert.equal(R.days[0].on, 1); assert.deepEqual(R.days[3].hol, ['Christmas Eve']);
  assert.equal((await lead.put('/api/wf/rota', { cells: [{ u: 'w.agent', d: '2026-12-22', v: 'off' }] })).status, 200);
  assert.equal((await lead.put('/api/wf/rota', { cells: [{ u: 'w.agent', d: '2026-12-23', v: 'nope' }] })).status, 400, 'only shifts from the list');
  assert.equal((await lead.put('/api/wf/rota', { cells: [{ u: 'w.agent3', d: '2026-12-22', v: 'off' }] })).status, 403, 'not the team of another workspace');
  assert.equal((await lead2.put('/api/wf/rota', { cells: [{ u: 'w.agent', d: '2026-12-22', v: 's-day' }] })).status, 403);
  assert.equal((await qa.put('/api/wf/rota', { cells: [{ u: 'w.agent', d: '2026-12-22', v: 's-day' }] })).status, 403, 'QA looks but does not plan');
  assert.equal((await ag.put('/api/wf/rota', { cells: [{ u: 'w.agent', d: '2026-12-22', v: 's-day' }] })).status, 403);
  R = (await qa.get('/api/wf/rota?team=t-a&from=2026-12-21')).json; assert.equal(R.edit, false);
  assert.deepEqual(R.people.find(p => p.u === 'w.agent').cells[1], { v: 'off', src: 'set' });
  const mine = (await ag.get('/api/wf/rota?team=t-b')).json; assert.equal(mine.team, 't-a', 'an agent always gets their own team'); assert.equal(mine.edit, false);

  // copy last week: Monday 28 Dec is a public holiday and stays one; Tuesday becomes a day off like last Tuesday
  assert.equal((await lead.post('/api/wf/rota/copy', { team: 't-a', from: '2026-12-28' })).status, 200);
  R = (await lead.get('/api/wf/rota?team=t-a&from=2026-12-28')).json;
  assert.deepEqual(R.people.find(p => p.u === 'w.agent').cells.slice(0, 3).map(c => c.v), ['hol', 'off', late]);
  assert.equal((await lead.post('/api/wf/rota/copy', { team: 't-b', from: '2026-12-28' })).status, 403);

  // a repeating pattern for one person, from a start date
  const pat = db().settings.wf.patterns[0].id;
  assert.equal((await lead.post('/api/wf/assign', { users: ['w.agent2'], pattern: pat, patStart: '2027-01-04' })).status, 200);
  assert.equal((await lead.post('/api/wf/assign', { users: ['w.agent3'], shift: late })).status, 403);
  assert.equal((await lead.post('/api/wf/assign', { users: ['w.agent2'], shift: 'nope' })).status, 400);
  R = (await lead.get('/api/wf/rota?team=t-a&from=2027-01-04')).json;
  const c2 = R.people.find(p => p.u === 'w.agent2').cells; assert.deepEqual([c2[0].src, c2[5].v, c2[6].v], ['pattern', 'off', 'off']);
});
