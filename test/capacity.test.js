// Workforce, phase 4: Capacity planning. The fair split itself (every campaign adds up; every share and every total is the
// exact fair number rounded down or up), spreading leads over the days, and the plans: campaigns, publishing, what agents
// see, what changed (time off, new leads, a smaller share, days not worked) and the split the app suggests after it.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const { DEFAULT_SC } = require('../scorecard');
const wf = require('../wf'), cap = require('../cap');

test('the fair split: whole leads, every campaign adds up, nobody a whole lead away from fair', () => {
  let seed = 11; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let t = 0; t < 400; t++) {
    const rows = Array.from({ length: 1 + rnd(8) }, () => rnd(2500)), w = Array.from({ length: 1 + rnd(9) }, () => 1 + rnd(3000)), W = w.reduce((s, x) => s + x, 0), m = cap.apportion(rows, w);
    rows.forEach((n, r) => { assert.equal(m[r].reduce((s, x) => s + x, 0), n, 'a campaign adds up exactly');
      m[r].forEach((x, c) => { const e = n * w[c] / W; assert.ok(x >= Math.floor(e) && x <= Math.ceil(e), 'each share is the exact share rounded down or up'); }); });
    w.forEach((x, c) => { const s = m.reduce((a, row) => a + row[c], 0), e = rows.reduce((a, n) => a + n * x / W, 0); assert.ok(Math.abs(s - e) < 1, 'each total is less than one lead from fair'); });
  }
  // the sample of the proposal: 3,349 leads of 6 campaigns, 7 agents (one part-time, two with days off)
  const pool = [['a', 1240], ['b', 610], ['c', 905], ['d', 333], ['e', 187], ['f', 74]].map(([id, n]) => ({ id, n }));
  const people = [['ana', 21, 1], ['boris', 21, 1], ['petya', 16, 1], ['ivan', 21, 0.5], ['maria', 21, 1], ['georgi', 18, 1], ['elena', 21, 1]].map(([u, d, f]) => ({ u, w: d * 800 * f * 100 }));
  const sp = cap.fairSplit(pool, people), W = people.reduce((s, p) => s + p.w, 0);
  people.forEach(p => assert.ok(Math.abs(Object.values(sp[p.u]).reduce((s, x) => s + x, 0) - 3349 * p.w / W) < 1));
  assert.deepEqual(pool.map(c => people.reduce((s, p) => s + (sp[p.u][c.id] || 0), 0)), pool.map(c => c.n));
  assert.deepEqual(cap.fairSplit([{ id: 'a', n: 3 }], [{ u: 'x', w: 0 }, { u: 'y', w: 5 }]), { x: {}, y: { a: 3 } }, 'a share of 0 gets nothing');
  assert.throws(() => cap.fairSplit([{ id: 'a', n: 3 }], [{ u: 'x', w: 0 }]), /Nobody in this plan can work/);
  // one agent's leads over the days: every day gets its share rounded down or up, every campaign adds up
  const dl = cap.daily({ a: 67, b: 33, c: 5 }, [800, 800, 0, 400, 800]);
  assert.equal(dl[2], null, 'no leads on a day without work');
  assert.deepEqual(['a', 'b', 'c'].map(id => dl.reduce((s, o) => s + ((o || {})[id] || 0), 0)), [67, 33, 5]);
  dl.forEach((o, i) => { if (!o) return; const n = Object.values(o).reduce((s, x) => s + x, 0), e = 105 * [800, 800, 0, 400, 800][i] / 2800; assert.ok(n >= Math.floor(e) && n <= Math.ceil(e)); });
  // what people type
  assert.throws(() => cap.cleanCampaigns([{ name: 'A', leads: 1 }, { name: 'a', leads: 2 }], () => 'x'), /twice/);
  assert.throws(() => cap.cleanCampaigns([{ name: 'A', leads: -1 }], () => 'x'), /whole number/);
  assert.throws(() => cap.cleanCampaigns([{ name: 'A', leads: '' }], () => 'x'), /whole number/);
  assert.deepEqual(cap.cleanCampaigns([{ brand: 'Brand B', segment: '30-60', leads: '12' }], () => 'c1'), [{ id: 'c1', name: 'Brand B 30-60', brand: 'Brand B', segment: '30-60', leads: 12 }]);
  assert.deepEqual(cap.cleanPct({ a: '50', b: 300, c: -5, z: 10 }, new Set(['a', 'b', 'c'])), { a: 50, b: 200, c: 0 });
  assert.deepEqual(['360+', '30-60', '0-30', '90-120'].map(s => ({ brand: 'A', segment: s, name: s })).sort(cap.order).map(c => c.segment), ['0-30', '30-60', '90-120', '360+']);
});

// ---------------------------------------------------------------- a team of four agents, next month and this month
const today = wf.localDay(), NM = wf.addDays(today.slice(0, 8) + '01', 31).slice(0, 7), DAYS = cap.monthDays(NM), WD = DAYS.filter(d => [1, 2, 3, 4, 5].includes(wf.dow(d)));
const MON = WD.find(d => wf.dow(d) === 1), WEEK = [0, 1, 2, 3, 4].map(i => wf.addDays(MON, i));   // ivan is away the first whole week of next month
const TM = cap.monthDays(today.slice(0, 7)), PAST = TM.filter(d => d < today && [1, 2, 3, 4, 5].includes(wf.dow(d)));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qsmart-cap-')), DATA = path.join(DIR, 'data.json'), H = bcrypt.hashSync('password', 4);
const person = (username, role, team, extra) => ({ username, name: username, firstName: username, lastName: 'Test', email: username + '@test.com', role, team, title: '', desc: '', languages: [], skills: [], phone: '', start: '', active: true, hash: H, mustChange: false, ...extra });
const S0 = wf.settingsOf(null, today), at = (d, hm) => new Date(wf.atLocal(d, hm)).toISOString(), ATT = {};
[...PAST, today].forEach(d => { ATT[d] = { 'x.one': { in: at(d, '09:00'), out: at(d, '18:00'), brk: [] } }; });   // this month: x.one comes every day (today too: late in the evening today counts as well), x.two never
const hours = TM.map(d => [1, 2, 3, 4, 5].includes(wf.dow(d)) ? 800 : 0), twoEach = hours.filter(Boolean).length * 2;
fs.writeFileSync(DATA, JSON.stringify({ boot: 5,
  users: [person('d.admin', 'admin', 't-admin'), person('d.lead', 'lead', 't-admin'), person('d.lead2', 'lead', 't-admin'), person('d.qa', 'qa', 't-admin'),
    person('c.ana', 'agent', 't-a'), person('c.boris', 'agent', 't-a'), person('c.petya', 'agent', 't-a', { shift: 's-half' }), person('c.ivan', 'agent', 't-a'), person('c.zed', 'agent', 't-b'),
    person('x.one', 'agent', 't-c'), person('x.two', 'agent', 't-c')],
  teams: [{ id: 't-admin', name: 'Administration', lead: 'd.admin', system: true }, { id: 't-a', name: 'Team A', lead: 'd.lead' }, { id: 't-b', name: 'Team B', lead: 'd.lead2' }, { id: 't-c', name: 'Team C', lead: 'd.admin' }],
  workspaces: [{ id: 'w-1', name: 'One', teams: ['t-a'], scorecards: ['sc-default'], staff: ['d.lead', 'd.qa'] }, { id: 'w-2', name: 'Two', teams: ['t-b'], scorecards: ['sc-default'], staff: ['d.lead2'] }],
  scorecards: [DEFAULT_SC], evaluations: [], skills: [], languages: [], rootCauses: [], categories: [], autoCats: [], conversations: [], att: ATT,
  leaves: [{ id: 'l-1', u: 'c.ivan', lt: 'lt-unpaid', from: WEEK[0], to: WEEK[4], part: 'full', hours: 0, days: 5, status: 'approved', at: today, by: 'd.lead' }],
  // this month: a plan already published on the 1st (two agents, 2 leads a day each)
  capPlans: [{ id: 'cp-now', month: today.slice(0, 7), name: 'This month', teams: ['t-c'], pct: {}, at: today, by: 'd.admin',
    campaigns: [{ id: 'k1', name: 'K 0-30', brand: 'K', segment: '0-30', leads: twoEach * 2 }],
    versions: [{ no: 1, from: TM[0], at: TM[0] + 'T06:00:00.000Z', by: 'd.admin', cs: [{ id: 'k1', name: 'K 0-30', brand: 'K', segment: '0-30', leads: twoEach * 2 }], pool: { k1: twoEach * 2 },
      pct: { 'x.one': 100, 'x.two': 100 }, hours: { 'x.one': hours, 'x.two': hours }, split: { 'x.one': { k1: twoEach }, 'x.two': { k1: twoEach } }, why: [] }] }],
  settings: { pass: 85, teams: {}, wf: { ...S0, shifts: [S0.shifts[0], { ...S0.shifts[0], id: 's-half', name: 'Half', start: '09:00', end: '13:00', brk: 0 }],
    calendars: [{ id: 'c-bg', name: 'Week', country: '', days: ['off', 'work', 'work', 'work', 'work', 'work', 'off'], holidays: [] }], rules: { ...S0.rules, since: TM[0] } } } }));

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
  let cookie = ''; const addr = '10.45.0.' + (++NADDR);
  const call = async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': addr, ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    return { status: r.status, json };
  };
  assert.equal((await call('POST', '/api/login', { username, password: 'password' })).status, 200);
  return { get: u => call('GET', u), post: (u, b = {}) => call('POST', u, b), put: (u, b = {}) => call('PUT', u, b), del: u => call('DELETE', u) };
}
const tot = o => Object.values(o || {}).reduce((s, x) => s + x, 0);

test('a plan for next month: campaigns, the fair split by working hours, publishing, and what each agent sees', async () => {
  const lead = await as('d.lead'), lead2 = await as('d.lead2'), qa = await as('d.qa'), ana = await as('c.ana');
  assert.equal((await ana.post('/api/cap/plans', { month: NM, teams: ['t-a'] })).status, 403, 'agents do not plan');
  assert.equal((await lead2.post('/api/cap/plans', { month: NM, teams: ['t-a'] })).status, 403, 'a team lead plans their own teams only');
  const id = (await lead.post('/api/cap/plans', { month: NM, name: 'Collections', teams: ['t-a'] })).json.id;
  assert.equal((await lead.put('/api/cap/plans/' + id, { campaigns: [{ name: 'A', leads: 1 }, { name: 'a', leads: 1 }] })).status, 400, 'the same campaign twice');
  const C = [{ name: 'Brand A 0-30', brand: 'Brand A', segment: '0-30', leads: 1000 }, { name: 'Brand A 30-60', brand: 'Brand A', segment: '30-60', leads: 401 }, { name: 'Brand B 360+', brand: 'Brand B', segment: '360+', leads: 77 }];
  assert.equal((await lead.put('/api/cap/plans/' + id, { campaigns: C })).status, 200);
  const g = (await lead.get(`/api/cap?month=${NM}&plan=${id}`)).json, P = g.plan, pv = P.preview;
  assert.deepEqual([P.canEdit, P.version, pv.from, P.campaigns.length], [true, null, DAYS[0], 3], 'a new plan: the split starts on the first day of the month');
  const hrs = Object.fromEntries(pv.people.map(x => [x.u, x.hours]));
  assert.deepEqual(hrs, { 'c.ana': WD.length * 8, 'c.boris': WD.length * 8, 'c.ivan': (WD.length - 5) * 8, 'c.petya': WD.length * 4 }, 'hours from the rota: a part-time shift, a week of leave');
  const N = 1478, Wt = Object.values(hrs).reduce((s, h) => s + h, 0);
  pv.people.forEach(x => { assert.ok(Math.abs(x.total - N * x.hours / Wt) < 1, x.u + ' is within one lead of fair');
    P.campaigns.forEach(c => { const e = c.leads * x.hours / Wt; assert.ok((x.split[c.id] || 0) >= Math.floor(e) && (x.split[c.id] || 0) <= Math.ceil(e)); }); });
  P.campaigns.forEach(c => assert.equal(pv.people.reduce((s, x) => s + (x.split[c.id] || 0), 0), c.leads, c.name + ' adds up'));
  assert.equal((await ana.get(`/api/cap?month=${NM}`)).json.mine.length, 0, 'agents see nothing before it is published');
  // QA can look but not plan; the other team's lead does not even see it
  assert.equal((await qa.get(`/api/cap?month=${NM}`)).json.plan.canEdit, false);
  assert.equal((await qa.post(`/api/cap/plans/${id}/publish`)).status, 403);
  assert.equal((await lead2.get(`/api/cap?month=${NM}`)).json.plans.length, 0);
  const pub = await lead.post(`/api/cap/plans/${id}/publish`); assert.deepEqual([pub.status, pub.json.no, pub.json.from], [200, 1, DAYS[0]]);
  const me = (await ana.get(`/api/cap?month=${NM}`)).json.mine[0], mine = pv.people.find(x => x.u === 'c.ana');
  assert.deepEqual([me.total, me.left, me.today, me.campaigns.length], [mine.total, mine.total, 0, 3]);
  assert.equal(me.days.reduce((s, x) => s + (x.n || 0), 0), me.total, 'the days add up to the month');
  assert.ok(me.days.filter(x => [0, 6].includes(wf.dow(x.d))).every(x => x.n === null), 'no leads at the weekend');
  const per = me.days.filter(x => x.n).map(x => x.n); assert.ok(Math.max(...per) - Math.min(...per) <= 1, 'every working day about the same');
  assert.ok(Math.abs(me.share - mine.share) < 1e-9);
  assert.ok(!JSON.stringify(me).includes('c.boris'), 'an agent sees only their own numbers');
  const nf = (await ana.get('/api/notifications')).json; assert.ok(nf.some(n => n.type === 'cap' && /Your leads for/.test(n.text)), 'agents are told');
  const live = (await lead.get(`/api/cap?month=${NM}&plan=${id}`)).json.plan;
  assert.deepEqual([live.version.no, live.reasons.length, live.preview], [1, 0, null], 'nothing changed yet: no new split suggested');
  assert.deepEqual(live.campaigns.map(c => live.assigned[c.id]), [1000, 401, 77], 'every lead has an agent');
});

test('after changes the app suggests a new split of the leads not worked yet; a person approves it', async () => {
  const lead = await as('d.lead'), boris = await as('c.boris');
  const id = (await lead.get(`/api/cap?month=${NM}`)).json.plans[0].id, url = `/api/cap?month=${NM}&plan=${id}`;
  // boris is sick for three days, petya's share goes down to 50 %, and 100 new leads arrive for Brand A 0-30
  assert.equal((await lead.post('/api/leave', { u: 'c.boris', lt: 'lt-sick', from: WEEK[1], to: WEEK[3] })).status, 200);
  const P0 = (await lead.get(url)).json.plan;
  assert.equal((await lead.put('/api/cap/plans/' + id, { pct: { 'c.petya': 50 } })).status, 200);
  const C = P0.campaigns.map(c => c.name === 'Brand A 0-30' ? { ...c, leads: 1100 } : c);
  assert.equal((await lead.put('/api/cap/plans/' + id, { campaigns: C })).status, 200);
  const P = (await lead.get(url)).json.plan, R = P.reasons;
  assert.ok(R.some(r => r.k === 'hours' && r.name === 'c.boris' && r.h === -24), 'boris: 24 hours less');
  assert.ok(R.some(r => r.k === 'pct' && r.name === 'c.petya' && r.before === 100 && r.now === 50), 'petya: half the share');
  assert.ok(!R.some(r => r.k === 'hours' && r.name === 'c.petya'), 'her hours did not change');
  assert.ok(R.some(r => r.k === 'leads' && r.name === 'Brand A 0-30' && r.before === 1000 && r.now === 1100));
  const b = P.preview.people.find(x => x.u === 'c.boris'), p = P.preview.people.find(x => x.u === 'c.petya');
  assert.deepEqual([b.hours, p.hours, p.pct], [WD.length * 8 - 24, WD.length * 4, 50], 'boris can work 24 hours less; petya keeps her hours with half the share');
  assert.ok(p.total < p.before, 'petya gets fewer leads');
  assert.ok(Math.abs(b.share - b.hours / P.preview.people.reduce((s, x) => s + x.hours * x.pct / 100, 0)) < 1e-9, 'shares follow hours × share %');
  assert.equal(P.preview.people.reduce((s, x) => s + x.total, 0), 1578, 'all the leads of next month are split again (none is worked yet)');
  // agents still see the published split until somebody approves the new one
  assert.equal((await boris.get(`/api/cap?month=${NM}`)).json.mine[0].total, b.before);
  assert.equal((await lead.post(`/api/cap/plans/${id}/publish`)).json.no, 2);
  assert.equal((await boris.get(`/api/cap?month=${NM}`)).json.mine[0].total, b.total);
  const P2 = (await lead.get(url)).json.plan;
  assert.deepEqual([P2.version.no, P2.reasons.length, P2.history.length, P2.history[0].why.length], [2, 0, 2, R.length], 'the reasons are kept in the history');
  assert.equal((await lead.post(`/api/cap/plans/${id}/publish`)).status, 400, 'nothing has changed since');
  assert.ok((await boris.get('/api/notifications')).json.some(n => n.type === 'cap' && /have changed/.test(n.text)));
});

test('this month: leads not worked on days that are over go back into the split (attendance decides)', async () => {
  const adm = await as('d.admin'), two = await as('x.two'), url = `/api/cap?month=${today.slice(0, 7)}&plan=cp-now`;
  const P = (await adm.get(url)).json.plan, one = P.people.find(x => x.u === 'x.one'), x2 = P.people.find(x => x.u === 'x.two');
  assert.equal((await two.get(`/api/cap?month=${today.slice(0, 7)}`)).json.mine[0].name, 'This month');
  if (!PAST.length) return;   // the first working day of the month: no day is over yet
  assert.ok(x2.lost >= PAST.length * 2, 'x.two never came: the leads of those days were not worked');
  assert.equal(one.lost, 0);
  assert.ok(P.reasons.some(r => r.k === 'lost' && r.name === 'x.two' && r.n === x2.lost));
  if (!P.open) return;   // the last day of the month: nothing left to split
  const kept = P.people.reduce((s, x) => s + x.total - x.left + x.today, 0);
  assert.equal(P.preview.people.reduce((s, x) => s + x.total, 0), twoEach * 2 - kept, 'the new split takes every lead not worked yet');
  assert.equal((await adm.post('/api/cap/plans/cp-now/publish')).status, 200);
  const P2 = (await adm.get(url)).json.plan;
  assert.equal(P2.reasons.length, 0, 'once split again, the days not worked are no longer a change');
  assert.equal(P2.assigned.k1, twoEach * 2, 'every lead has an agent again');
});

// the worked leads from the dialer (Gabriela, 4 November): a template with the plan's agents and campaigns, a file checked row by row,
// and for the days in it the real numbers instead of "at work = worked"
test('worked leads from the dialer: the template, a checked import, and the real numbers count for those days', async () => {
  const adm = await as('d.admin'), two = await as('x.two'), url = `/api/cap?month=${today.slice(0, 7)}&plan=cp-now`;
  assert.equal((await two.get('/api/cap/plans/cp-now/worked-template')).status, 403);
  assert.equal((await adm.get('/api/cap/plans/cp-now/worked-template')).status, 200);
  const file = rows => ({ name: 'worked.csv', data: Buffer.from(rows.join('\n')).toString('base64') });
  assert.equal((await adm.post('/api/cap/plans/cp-now/worked', { file: file(['Agent,Leads', 'x.one,3']), preview: true })).status, 400, 'the columns are named');
  const tomorrow = wf.addDays(today, 1), day0 = PAST[0] || today;
  const f = file(['Date,Agent,Campaign,Worked leads', day0 + ',x.one,K 0-30,0', tomorrow + ',x.one,K 0-30,1', day0 + ',nobody,K 0-30,1', day0 + ',x.one,Other,1', day0 + ',x.one,K 0-30,1.5']);
  const before = (await adm.get(url)).json.plan, pv = await adm.post('/api/cap/plans/cp-now/worked', { file: f, preview: true });
  assert.deepEqual([pv.json.add, pv.json.skip], [1, 4]);
  assert.match(pv.json.rows[1].why, /over or today/); assert.match(pv.json.rows[2].why, /No agent/); assert.match(pv.json.rows[3].why, /No campaign/); assert.match(pv.json.rows[4].why, /whole number/);
  assert.equal((await adm.get(url)).json.plan.actualDays, 0, 'the preview saves nothing');
  assert.equal((await adm.post('/api/cap/plans/cp-now/worked', { file: f })).json.add, 1);
  const after = (await adm.get(url)).json.plan; assert.equal(after.actualDays, 1);
  if (PAST.length && before.open) assert.notDeepEqual(after.preview, before.preview, 'a past day with 0 worked leads changes what is left to split');
});

test('a month that is over cannot be split; plans can be deleted', async () => {
  const lead = await as('d.lead'), past = wf.addDays(today.slice(0, 8) + '01', -1).slice(0, 7);
  const id = (await lead.post('/api/cap/plans', { month: past, teams: ['t-a'] })).json.id;
  await lead.put('/api/cap/plans/' + id, { campaigns: [{ name: 'Old', leads: 10 }] });
  const r = await lead.post(`/api/cap/plans/${id}/publish`); assert.deepEqual([r.status, r.json.error], [400, 'This month is over']);
  assert.equal((await lead.del('/api/cap/plans/' + id)).status, 200);
  assert.equal((await lead.get(`/api/cap?month=${past}`)).json.plans.length, 0);
});
