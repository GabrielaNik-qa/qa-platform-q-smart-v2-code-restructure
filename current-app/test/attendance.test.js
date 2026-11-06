// Workforce, phase 2: the status of a day (late, early, short, absent, automatic check-out), leave days and balances,
// then the whole flow on a server: check in / break / check out, corrections the team lead approves, warnings after too
// many late arrivals, time off with approvals, cancelling, the team calendar, deputies, and who may do what.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const { DEFAULT_SC } = require('../scorecard');
const wf = require('../wf');

const S = wf.settingsOf({ rules: { since: '2026-01-01', shortGrace: 15 } }, '2026-10-27');
const at = (d, hm) => new Date(wf.atLocal(d, hm)).toISOString(), T27 = '2026-10-27', day = { v: 's-day' };   // Tuesday; the default shift is 09:00–18:00, grace 5 minutes
const st = (rec, now, lv, d = T27, plan = day) => wf.dayStatus(S, S.rules, d, plan, rec, lv || null, now || wf.atLocal('2026-10-28', '12:00'));

// decision 7 (Gabriela, 4 November): each person their own time zone; a shift is in the person's local time
test('time zones: a 09:00 shift is 09:00 where the person lives; the company zone applies when the person has none', () => {
  const NY = 'America/New_York', SOF = 'Europe/Sofia', utc = (h, m) => new Date(Date.UTC(2026, 9, 27, h, m)).toISOString(), late = (tz, rec) => wf.dayStatus(S, S.rules, T27, day, rec, null, Date.UTC(2026, 9, 28, 12), tz);
  assert.equal(late(NY, { in: utc(13, 3), out: utc(22, 0) }).late, 0, '13:03 UTC is 09:03 in New York (within the grace minutes)');
  assert.equal(late(SOF, { in: utc(7, 20), out: utc(15, 0) }).late, 20, '07:20 UTC is 09:20 in Sofia: 20 minutes late');
  assert.equal(new Date(wf.atLocal('2026-03-29', '09:00', SOF)).toISOString(), '2026-03-29T06:00:00.000Z', 'right after the clocks change');
  assert.equal(wf.tzOf({ tz: SOF }, { tz: NY }), NY, 'the person first'); assert.equal(wf.tzOf({ tz: SOF }, { tz: '' }), SOF, 'then the company');
  assert.equal(wf.tzOf({ tz: 'Nowhere/Land' }, { tz: 'Mars/Base' }), '', 'an unknown zone is ignored: the server time zone');
  assert.equal(wf.dayOfTime(Date.UTC(2026, 10, 4, 23, 30), SOF), '2026-11-05', 'past midnight in Sofia');
});
test('the status of a day: late and early only beyond the grace minutes, short days, absences, and the automatic check-out', () => {
  assert.deepEqual([st({ in: at(T27, '09:04'), out: at(T27, '17:57') }).late, st({ in: at(T27, '09:04'), out: at(T27, '17:57') }).early], [0, 0], 'within the 5 grace minutes');
  const s = st({ in: at(T27, '09:20'), out: at(T27, '17:30'), brk: [{ s: at(T27, '12:00'), e: at(T27, '12:30') }] });
  assert.deepEqual([s.st, s.late, s.early, s.worked, s.short], ['done', 20, 30, 460, 20]);
  const auto = st({ in: at(T27, '09:00'), out: '' }); assert.deepEqual([auto.auto, auto.out, auto.early], ['end', at(T27, '18:00'), 0], 'nobody checked out: the shift end');
  const W2 = { ...S, shifts: [{ ...S.shifts[0], autoOut: 'none' }] }, open = wf.dayStatus(W2, S.rules, T27, day, { in: at(T27, '09:00'), out: '' }, null, wf.atLocal('2026-10-28', '12:00'));
  assert.equal(open.noOut, true, '"never" leaves the missing check-out visible');
  assert.equal(st(null).st, 'absent');
  assert.equal(st(null, wf.atLocal(T27, '09:40')).st, 'missing', 'the shift started and nobody checked in');
  assert.equal(st(null, wf.atLocal(T27, '09:40')).late, undefined, 'not checked in yet is not a late arrival (it never counts towards the warnings)');
  assert.equal(st(null, wf.atLocal(T27, '08:00')).st, 'upcoming');
  assert.equal(wf.dayStatus(S, { ...S.rules, since: '' }, T27, day, null, null, Date.now()).st, 'untracked', 'before tracking starts nobody is absent');
  assert.equal(st({ in: at(T27, '13:30'), out: at(T27, '18:00') }, null, { lt: 'lt-annual', part: 'am' }).late, 0, 'a morning off excuses the late start');
  assert.equal(st(null, null, { lt: 'lt-annual', part: 'full' }).st, 'leave');
  assert.equal(st({ in: at('2026-10-31', '10:00'), out: at('2026-10-31', '12:00') }, null, null, '2026-10-31', { v: 'off' }).st, 'extra', 'worked on a day off');
  const W3 = { ...S, shifts: [{ ...S.shifts[0], id: 's-n', start: '22:00', end: '06:00', brk: 30 }] }, night = wf.dayStatus(W3, S.rules, T27, { v: 's-n' }, { in: at(T27, '22:10'), out: at('2026-10-28', '06:00') }, null, wf.atLocal('2026-10-29', '12:00'));
  assert.deepEqual([night.late, night.worked, night.early], [10, 470, 0], 'a night shift over midnight');
});

test('time off: working days only (or with the sandwich rule), half days, hours; balances with part of a year, carry-over and adjustments', () => {
  const A = S.leaveTypes.find(t => t.id === 'lt-annual'), u = { username: 'a' };
  assert.deepEqual(Object.keys(wf.leaveSpan(S, A, u, { from: '2026-10-30', to: '2026-11-02', part: 'full' }, {})), ['2026-10-30', '2026-11-02'], 'Friday to Monday: the weekend is not taken');
  assert.equal(Object.keys(wf.leaveSpan(S, { ...A, sandwich: true }, u, { from: '2026-10-30', to: '2026-11-02', part: 'full' }, {})).length, 4);
  assert.deepEqual(wf.leaveSpan(S, A, u, { from: '2026-12-23', to: '2026-12-29', part: 'full' }, {}), { '2026-12-23': 1, '2026-12-29': 1 }, 'Christmas and the moved day off are not taken');
  assert.deepEqual(wf.leaveSpan(S, A, u, { from: T27, to: T27, part: 'pm' }, {}), { [T27]: 0.5 });
  const H = S.leaveTypes.find(t => t.unit === 'hour'); assert.deepEqual(wf.leaveSpan(S, H, u, { from: T27, to: T27, hours: 3 }, {}), { [T27]: 3 });
  const L = [{ u: 'a', lt: A.id, status: 'approved', from: '2026-10-30', to: '2026-11-02', part: 'full' }, { u: 'a', lt: A.id, status: 'pending', from: '2026-11-10', to: '2026-11-10', part: 'full' }];
  assert.deepEqual(wf.balance(S, A, { username: 'a', start: '2026-04-15' }, 2026, L, [], {}), { lt: A.id, allowance: 15, carried: 0, adjust: 0, taken: 2, pending: 1, left: 13 }, 'started in April: 9 months of 20 days');
  const b27 = wf.balance(S, A, { username: 'a', start: '2025-01-01' }, 2027, L, [{ u: 'a', lt: A.id, year: 2027, days: 2 }], {});
  assert.deepEqual([b27.allowance, b27.carried, b27.adjust, b27.left], [20, 5, 2, 27], 'at most 5 days carried over, plus 2 added by an admin');
  assert.equal(wf.balance(S, A, { username: 'a', start: '2025-01-01' }, 2027, L, [], {}, 0, 2027).carried, 0, 'nothing is carried over from a year before the app had time off (it comes in as an adjustment)');
  assert.equal(wf.balance(S, S.leaveTypes.find(t => t.id === 'lt-sick'), u, 2026, L, [], {}).unlimited, true);
  const miss = wf.missingCheckIns(S, { ...S.rules, missingAfter: 30 }, [{ username: 'a', role: 'agent' }, { username: 'b', role: 'agent' }, { username: 'c', role: 'agent' }], T27, {}, { [T27]: { b: { in: at(T27, '09:01') } } }, (x, d) => x.username === 'c' && d === T27, wf.atLocal(T27, '09:45'));
  assert.deepEqual(miss.map(x => x.u), ['a'], 'not the one who checked in, not the one on leave');
});

// ---------------------------------------------------------------- the flow on a server
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qsmart-att-')), DATA = path.join(DIR, 'data.json');
const HASH = bcrypt.hashSync('password', 4), db = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));
const person = (username, role, team, extra) => ({ username, name: username, firstName: username, lastName: 'Test', email: username + '@test.com', role, team, title: '', desc: '', languages: [], skills: [], phone: '', start: '', active: true, hash: HASH, mustChange: false, ...extra });
const ALL = { id: 's-all', name: 'All day', color: '#2563eb', start: '00:00', end: '23:59', brk: 0, graceIn: 5, graceOut: 5, coreFrom: '', coreTo: '', autoOut: 'end', autoAt: '' };
fs.writeFileSync(DATA, JSON.stringify({ boot: 5,
  users: [person('a.admin', 'admin', 't-admin'), person('a.lead', 'lead', 't-admin'), person('a.lead2', 'lead', 't-admin'), person('a.qa', 'qa', 't-admin'),
    person('a.agent', 'agent', 't-a', { shift: 's-all', cal: 'c-all' }), person('a.agent2', 'agent', 't-a'), person('a.agent3', 'agent', 't-b')],
  teams: [{ id: 't-admin', name: 'Administration', lead: 'a.admin', system: true }, { id: 't-a', name: 'Team A', lead: 'a.lead' }, { id: 't-b', name: 'Team B', lead: 'a.lead2' }],
  workspaces: [{ id: 'w-1', name: 'One', teams: ['t-a'], scorecards: ['sc-default'], staff: ['a.qa', 'a.lead'] }, { id: 'w-2', name: 'Two', teams: ['t-b'], scorecards: ['sc-default'], staff: ['a.lead2'] }],
  scorecards: [DEFAULT_SC], evaluations: [], skills: [], languages: [], rootCauses: [], categories: [], autoCats: [], conversations: [],
  settings: { pass: 85, teams: {}, wf: { shifts: [S.shifts[0], ALL], calendars: [{ ...S.calendars[0], holidays: [...wf.bgHolidays(2026), ...wf.bgHolidays(2027)] }, { id: 'c-all', name: 'Every day', country: '', days: Array(7).fill('work'), holidays: [] }],
    patterns: [], defShift: 's-day', defCal: 'c-bg', leaveTypes: wf.LT0, rules: { ...wf.RULES0, since: '2020-01-01', lateLimit: 0 } } } }));

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
  let cookie = ''; const addr = '10.55.0.' + (++NADDR);
  const call = async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': addr, ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    return { status: r.status, json };
  };
  assert.equal((await call('POST', '/api/login', { username, password: 'password' })).status, 200);
  return { get: u => call('GET', u), put: (u, b) => call('PUT', u, b), post: (u, b = {}) => call('POST', u, b) };
}
const notes = (who, type) => db().notifications.filter(n => n.to === who && n.type === type);

test('checking in, breaks and checking out (the server clock); a late check-in past the allowed number warns the person and the team lead', async () => {
  const ag = await as('a.agent'), lateNow = new Date().getHours() * 60 + new Date().getMinutes() > 6;   // the "all day" shift starts at 00:00
  assert.equal((await ag.post('/api/att/punch', { action: 'out' })).status, 400, 'check in first');
  assert.equal((await ag.post('/api/att/punch', { action: 'dance' })).status, 400);
  let r = await ag.post('/api/att/punch', { action: 'in' }); assert.equal(r.status, 200); assert.equal(r.json.today.st, 'working');
  if (lateNow) { assert.ok(r.json.today.late > 5); assert.equal(notes('a.agent', 'att').length, 1); assert.equal(notes('a.lead', 'att').length, 1, 'the team lead is warned too'); }
  assert.equal((await ag.post('/api/att/punch', { action: 'in' })).status, 400, 'already checked in');
  r = await ag.post('/api/att/punch', { action: 'break' }); assert.equal(r.json.today.brk, true);
  assert.equal((await ag.post('/api/att/punch', { action: 'break' })).status, 400);
  r = await ag.post('/api/att/punch', { action: 'back' }); assert.equal(r.json.today.brk, false);
  r = await ag.post('/api/att/punch', { action: 'out' }); assert.equal(r.json.today.st, 'done');
  r = await ag.post('/api/att/punch', { action: 'in' }); assert.deepEqual([r.json.today.st, r.json.today.brks.length], ['working', 2], 'checking in again: the time in between is a break');
  await ag.post('/api/att/punch', { action: 'out' });
  if (lateNow) assert.equal(notes('a.agent', 'att').length, 1, 'only the first check-in of the day counts');
});

test('corrections: asked by the person within the allowed days, approved only by their team lead; a lead can also correct directly', async () => {
  const ag = await as('a.agent'), lead = await as('a.lead'), lead2 = await as('a.lead2'), qa = await as('a.qa'), d = wf.addDays(wf.localDay(), -1);
  const ask = { d, in: '09:00', out: '18:00', reason: 'Forgot to check in', note: 'Phone call at the door' };
  assert.equal((await ag.post('/api/att/fix', { ...ask, reason: 'My cat' })).status, 400, 'a reason from the list');
  assert.equal((await ag.post('/api/att/fix', { ...ask, d: wf.addDays(d, -20) })).status, 400, 'at most 7 days back');
  assert.equal((await ag.post('/api/att/fix', { ...ask, d: wf.addDays(d, 3) })).status, 400, 'not in the future');
  const f = (await ag.post('/api/att/fix', ask)).json; assert.equal(f.status, 'pending'); assert.equal(notes('a.lead', 'fix').length, 1);
  assert.equal((await ag.post('/api/att/fix', ask)).status, 400, 'one request per day');
  assert.equal((await lead2.post('/api/att/fix/' + f.id + '/decide', { ok: true })).status, 403, 'not the lead of another team');
  assert.equal((await ag.post('/api/att/fix/' + f.id + '/decide', { ok: true })).status, 403);
  const ok = await lead.post('/api/att/fix/' + f.id + '/decide', { ok: true }); assert.equal(ok.json.status, 'approved');
  assert.deepEqual([db().att[d]['a.agent'].in, db().att[d]['a.agent'].out], [new Date(wf.atLocal(d, '09:00')).toISOString(), new Date(wf.atLocal(d, '18:00')).toISOString()]);
  assert.equal((await lead.post('/api/att/fix/' + f.id + '/decide', { ok: true })).status, 400, 'decided once');
  const row = (await lead.get('/api/att/day?team=t-a&d=' + d)).json.rows.find(x => x.u === 'a.agent');
  assert.deepEqual([row.st, row.late, row.edit], ['done', Math.round((wf.atLocal(d, '09:00') - wf.atLocal(d, '00:00')) / 6e4), true], '09:00 on a shift that starts at midnight (real minutes: a day when the clocks change has one hour more or less)');
  assert.equal((await ag.get('/api/att/day?team=t-a')).status, 403, 'agents see only their own attendance');
  assert.equal((await lead.put('/api/att/rec', { u: 'a.agent', d, in: '08:00' })).status, 400, 'a direct correction needs a reason');
  assert.equal((await lead.put('/api/att/rec', { u: 'a.agent3', d, in: '08:00', reason: 'Badge' })).status, 403);
  assert.equal((await qa.put('/api/att/rec', { u: 'a.agent', d, in: '08:00', reason: 'Badge' })).status, 403, 'QA looks, the team lead corrects');
  assert.equal((await lead.put('/api/att/rec', { u: 'a.agent', d, in: '08:00', reason: 'Badge reader' })).status, 200);
  assert.ok(notes('a.agent', 'fix').length >= 2, 'the person is told about the decision and the direct correction');
  const m = (await qa.get('/api/att/month?team=t-a&m=' + d.slice(0, 7))).json.rows.find(x => x.u === 'a.agent'); assert.ok(m.present >= 1);
});

test('time off: requests with balances and team warnings, approval by the team lead or their deputy, cancelling, the calendar and the rota', async () => {
  const ag = await as('a.agent'), ag2 = await as('a.agent2'), lead = await as('a.lead'), lead2 = await as('a.lead2'), adm = await as('a.admin');
  // the team lead registers a day off for a.agent (approved at once); then a.agent2 asks for the same week
  const reg = await lead.post('/api/leave', { u: 'a.agent', lt: 'lt-annual', from: '2027-03-02', to: '2027-03-02' });
  assert.deepEqual([reg.status, reg.json.status], [200, 'approved']);
  assert.equal((await lead2.post('/api/leave', { u: 'a.agent', lt: 'lt-annual', from: '2027-03-09', to: '2027-03-09' })).status, 403, 'not for the people of another team');
  const ask = { lt: 'lt-annual', from: '2027-03-01', to: '2027-03-05' };
  const pvr = await ag2.post('/api/leave/preview', ask), pv = pvr.json; assert.equal(pvr.status, 200, JSON.stringify(pv));
  assert.equal(pv.days, 4, 'Wednesday 3 March is a public holiday'); assert.deepEqual(pv.after, [{ year: '2027', left: 25, after: 21 }], '20 days plus 5 carried over from 2026');
  assert.deepEqual(pv.warn.map(w => w.d), ['2027-03-02'], 'both agents of the team would be off on Tuesday');
  const L = (await ag2.post('/api/leave', { ...ask, note: 'Family trip' })).json; assert.equal(L.status, 'pending'); assert.equal(notes('a.lead', 'leave').length, 1);
  assert.equal((await ag2.post('/api/leave', ask)).status, 400, 'no overlapping time off');
  assert.equal((await ag2.post('/api/leave', { lt: 'lt-annual', from: '2027-04-01', to: '2027-06-30' })).status, 400, 'not more than is left');
  const W = (await lead.get('/api/leave')).json.waiting.find(x => x.id === L.id); assert.deepEqual([W.left, W.warn.length], [25, 1]);
  assert.equal((await lead2.post('/api/leave/' + L.id + '/decide', { ok: true })).status, 403);
  assert.equal((await lead.post('/api/leave/' + L.id + '/decide', { ok: true })).json.status, 'approved');
  let me2 = (await ag2.get('/api/leave')).json; assert.equal(me2.balances.find(b => b.lt === 'lt-annual').taken, 0, '2026 is untouched');
  // the rota and the calendar show it; an agent does not see why a colleague is away
  const rota = (await lead.get('/api/wf/rota?team=t-a&from=2027-03-01')).json, cA = rota.people.find(p => p.u === 'a.agent').cells[1];
  assert.deepEqual(cA.lv, { lt: 'lt-annual', part: 'full', pend: false });
  assert.equal((await ag2.get('/api/wf/rota?team=t-a&from=2027-03-01')).json.people.find(p => p.u === 'a.agent').cells[1].lv.lt, '');
  const cal = (await ag2.get('/api/leave/calendar?team=t-a&m=2027-03')).json;
  assert.equal(cal.people.find(p => p.u === 'a.agent').days['2027-03-02'].lt, ''); assert.equal(cal.people.find(p => p.u === 'a.agent2').days['2027-03-04'].lt, 'lt-annual');
  assert.equal(cal.days.find(x => x.d === '2027-03-02').warn, true);
  // cancel one day (the person), then the rest (the team lead)
  let c = await ag2.post('/api/leave/' + L.id + '/cancel', { dates: ['2027-03-05'] }); assert.deepEqual([c.json.status, c.json.days, c.json.off], ['approved', 3, ['2027-03-05']]);
  c = await lead.post('/api/leave/' + L.id + '/cancel', {}); assert.equal(c.json.status, 'cancelled');
  assert.equal((await ag.post('/api/leave/' + L.id + '/cancel', {})).status, 403, 'not somebody else’s time off');
  // sick leave needs no approval; hours count in hours
  const sick = (await ag2.post('/api/leave', { lt: 'lt-sick', from: '2027-02-01', to: '2027-02-02' })).json; assert.equal(sick.status, 'approved');
  assert.ok(notes('a.lead', 'leave').some(n => n.text.includes('is off')), 'the team lead is told');
  const hrs = await ag2.post('/api/leave', { lt: 'lt-hours', from: '2027-02-10', hours: 3 }); assert.deepEqual([hrs.json.days, hrs.json.part], [3, 'hours']);
  assert.equal((await ag2.post('/api/leave', { lt: 'lt-hours', from: '2027-02-11', hours: 6 })).status, 400, '8 hours a year: 5 are left');
  // an admin adjusts a balance; a deputy decides while the team lead is away
  assert.equal((await lead.post('/api/leave/adjust', { u: 'a.agent2', lt: 'lt-annual', year: 2027, days: 2 })).status, 403);
  assert.equal((await adm.post('/api/leave/adjust', { u: 'a.agent2', lt: 'lt-sick', year: 2027, days: 2 })).status, 400, 'only types with a yearly allowance');
  assert.equal((await adm.post('/api/leave/adjust', { u: 'a.agent2', lt: 'lt-annual', year: 2027, days: 2, note: 'From the old system' })).status, 200);
  assert.equal((await ag2.post('/api/leave/preview', { lt: 'lt-annual', from: '2027-05-12', to: '2027-05-12' })).json.after[0].left, 27);
  assert.equal((await lead.put('/api/leave/deputy', { u: 'a.agent' })).status, 400, 'a deputy is a member of staff');
  assert.equal((await lead.put('/api/leave/deputy', { u: 'a.lead2', from: wf.localDay() })).status, 200);
  const L2 = (await ag2.post('/api/leave', { lt: 'lt-annual', from: '2027-05-12', to: '2027-05-12' })).json;
  assert.ok(notes('a.lead2', 'leave').length >= 1, 'the deputy is told too');
  assert.equal((await lead2.post('/api/leave/' + L2.id + '/decide', { ok: false, why: 'Busy week' })).json.status, 'rejected');
  me2 = (await ag2.get('/api/leave')).json; assert.equal(me2.mine.find(x => x.id === L2.id).why, 'Busy week');
});
