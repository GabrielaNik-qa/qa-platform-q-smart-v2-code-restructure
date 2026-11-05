// Security regression tests (audit of October 2026). The real server is started on a free port with a temporary data file
// of made-up people in two workspaces (A and B); your data.json, recordings and backups are never touched.
// Each test tries something a person should NOT be able to do and checks that it is refused and that nothing changed.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const bcrypt = require('bcryptjs'), JSZip = require('jszip'), ExcelJS = require('exceljs');
const { md } = require('../public/js/md.js');
const { DEFAULT_SC } = require('../scorecard');
const RPT = require('../public/js/rpt-engine.js');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qsmart-sec-')), DATA = path.join(DIR, 'data.json');
const H = bcrypt.hashSync('password', 4);
const person = (username, name, role, team) => ({ username, name, email: username + '@test.com', role, team, title: '', desc: '', languages: [], skills: [], phone: '', start: '', active: true, hash: H, mustChange: false });
fs.writeFileSync(DATA, JSON.stringify({
  boot: 5,
  users: [person('t.admin', 'Test Admin', 'admin', 't-admin'), person('q.alpha', 'Quinn Alpha', 'qa', 't-admin'), person('q.beta', 'Quinn Beta', 'qa', 't-admin'),
    person('l.alpha', 'Lee Alpha', 'lead', 't-admin'), person('l.beta', 'Lee Beta', 'lead', 't-admin'), person('z.victim', 'Zed Victim', 'qa', 't-admin'),
    person('p.change', 'Pat Change', 'qa', 't-admin'), person('r.reset', 'Rae Reset', 'lead', 't-admin'), person('g.guess', 'Gil Guess', 'qa', 't-admin'), person('f.flood', 'Fay Flood', 'trainer', 't-admin'),
    person('a.one', 'Ana One', 'agent', 't-a'), person('a.two', 'Ben Two', 'agent', 't-b')],
  teams: [{ id: 't-admin', name: 'Administration', lead: 't.admin', system: true }, { id: 't-a', name: 'Team A', lead: 'l.alpha' }, { id: 't-b', name: 'Team B', lead: 'l.beta' }],
  workspaces: [{ id: 'w-a', name: 'A', teams: ['t-a'], scorecards: ['sc-default'], staff: ['q.alpha', 'l.alpha', 'z.victim', 'p.change', 'r.reset', 'g.guess', 'f.flood'] }, { id: 'w-b', name: 'B', teams: ['t-b'], scorecards: ['sc-default'], staff: ['q.beta', 'l.beta'] }],
  scorecards: [DEFAULT_SC], evaluations: [], settings: { pass: 85, teams: {} }, skills: [], languages: [], rootCauses: [], categories: [],
  autoCats: [{ id: 'ac1', name: 'Greeting', pos: ['hello'], neg: [], weight: 1, enabled: true }], conversations: []
}));

let BASE = '', srv = null, OUT = '';
test.before(async () => {
  srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '0', DATA_FILE: DATA, AUDIT_FILE: path.join(DIR, 'audit.json'), REC_DIR: path.join(DIR, 'rec'), BACKUPS_DIR: path.join(DIR, 'backups'), SECRET: 'test-only', SMTP_HOST: '', ANTHROPIC_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', d => { OUT += d; });
  BASE = await new Promise((ok, no) => {
    const t = setTimeout(() => no(new Error('the server did not start')), 15000);
    srv.stdout.on('data', d => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) { clearTimeout(t); ok('http://localhost:' + m[1]); } });
    srv.on('exit', c => no(new Error('the server stopped: ' + c)));
  });
});
test.after(() => { if (srv) srv.kill(); try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) { /* temp folder */ } });

// a signed-in person: keeps the session cookie between calls; extra headers can be added per call.
// Every person signs in from their own address (as if through the tunnel), so the many test sign-ins do not hit the limit per address.
let NADDR = 0;
async function as(username, password = 'password') {
  let cookie = ''; const addr = '10.77.' + (++NADDR >> 8 & 255) + '.' + (NADDR & 255);
  const call = async (method, url, body, headers = {}) => {
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': addr, ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const buf = Buffer.from(await r.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch (e) { /* not JSON */ }
    return { status: r.status, json, buf, headers: r.headers };
  };
  const login = await call('POST', '/api/login', { username, password });
  return { login, call, get: u => call('GET', u), post: (u, b = {}, h) => call('POST', u, b, h), put: (u, b, h) => call('PUT', u, b, h), del: u => call('DELETE', u) };
}
const allYes = () => DEFAULT_SC.cats.map(c => c.it.map(() => ['y', '', '']));
const db = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));
const wait = ms => new Promise(r => setTimeout(r, ms));

// one review in each workspace, used by several tests
let RA = '', RB = '';
test('setup: one review in workspace A and one in workspace B', async () => {
  const adm = await as('t.admin');
  RA = (await adm.post('/api/evaluations', { scid: 'sc-default', agent: 'a.one', id: 'A-1', dt: '2026-10-01', a: allYes() })).json.rid;
  RB = (await adm.post('/api/evaluations', { scid: 'sc-default', agent: 'a.two', id: 'B-1', dt: '2026-10-01', a: allYes() })).json.rid;
  assert.ok(RA && RB);
});

// ---------------------------------------------------------------- access control between workspaces
test('a QA specialist cannot delete the call recording of a review in another workspace', async () => {
  const adm = await as('t.admin');
  const up = await adm.call('POST', '/api/evaluations/' + RB + '/recording?ext=mp3', 'ID3-fake-audio', { 'Content-Type': 'audio/mpeg' });
  assert.equal(up.status, 200);
  const r = await (await as('q.alpha')).del('/api/evaluations/' + RB + '/recording');
  assert.equal(r.status, 404);
  assert.ok(db().evaluations.find(e => e.rid === RB).rec, 'the recording is still attached');
  assert.equal((await (await as('q.beta')).del('/api/evaluations/' + RB + '/recording')).status, 200, 'the QA of workspace B still can');
});

test('Auto QA conversations of another workspace cannot be corrected, re-linked or deleted', async () => {
  const c = (await (await as('t.admin')).post('/api/autoqa/conversations', { agent: 'a.two', text: 'hello there', date: '2026-10-01' })).json;
  const qa = await as('q.alpha');
  assert.ok(!(await qa.get('/api/autoqa')).json.conversations.some(x => x.id === c.id), 'not in the list');
  assert.equal((await qa.put('/api/autoqa/conversations/' + c.id + '/edit', { cat: 'ac1', score: 1 })).status, 404);
  assert.equal((await qa.put('/api/autoqa/conversations/' + c.id + '/link', { rid: RA })).status, 404);
  assert.equal((await qa.del('/api/autoqa/conversations/' + c.id)).status, 404);
  const saved = db().conversations.find(x => x.id === c.id);
  assert.ok(saved && !saved.edits && !saved.rid, 'nothing changed');
});

test('quick flags, tasks, coaching sessions and simulations of another workspace are not listed', async () => {
  const adm = await as('t.admin');
  const fl = (await adm.post('/api/qflags', { agent: 'a.two', lead: 'B-9', date: '2026-10-01', type: 'red', cm: 'B only' })).json;
  const tk = (await adm.post('/api/tasks', { title: 'B task', assignees: ['a.two'] })).json[0];
  const ss = (await adm.post('/api/sessions', { kind: 'coaching', date: '2026-10-01', agents: ['a.two'], notes: 'B notes' })).json;
  const sm = (await adm.post('/api/simulations', { agent: 'a.two', score: 50 })).json;
  const lead = await as('l.alpha');
  assert.ok(!(await lead.get('/api/qflags')).json.some(x => x.id === fl.id));
  assert.ok(!(await lead.get('/api/tasks')).json.some(x => x.id === tk.id));
  assert.ok(!(await lead.get('/api/sessions')).json.some(x => x.id === ss.id));
  assert.ok(!(await lead.get('/api/simulations')).json.some(x => x.id === sm.id));
  assert.ok(!(await lead.get('/api/kb/progress')).json.some(x => x.username === 'a.two'));
  assert.equal((await lead.put('/api/qflags/' + fl.id, { cm: 'changed' })).status, 404);
  assert.equal(db().qflags.find(x => x.id === fl.id).cm, 'B only');
  assert.equal((await lead.post('/api/qflags', { agent: 'a.two', lead: 'B-10', date: '2026-10-01' })).status, 400, 'cannot flag an agent of another workspace');
  const lb = await as('l.beta');                                                       // the people of workspace B still see their own
  assert.ok((await lb.get('/api/qflags')).json.some(x => x.id === fl.id));
  assert.ok((await lb.get('/api/tasks')).json.some(x => x.id === tk.id));
  assert.ok((await lb.get('/api/sessions')).json.some(x => x.id === ss.id));
});

test('a scheduled report can only be sent by its owner (or an admin), and only contains the owner\'s workspace', async () => {
  const la = await as('l.alpha');
  const rep = (await la.post('/api/c/reports', { name: 'Alpha weekly', cfg: { src: 'reviews', metrics: ['count'], period: { p: 'all' } }, schedule: { freq: 'none', to: 'l.alpha@test.com, outside@example.com' } })).json;   // only the account's address receives it (decision 17)
  assert.equal((await (await as('l.beta')).post('/api/c/reports/' + rep.id + '/send')).status, 404, 'another team lead cannot trigger it');
  OUT = '';
  assert.equal((await la.post('/api/c/reports/' + rep.id + '/send')).status, 200);
  await wait(200);
  assert.match(OUT, /All time · 1 records/, 'only the review of workspace A is counted (there are 2 in total)');
});

// ---------------------------------------------------------------- exports
test('an Excel export never contains formulas or links sent by the browser (spreadsheet injection)', async () => {
  const ag = await as('a.one');
  const rows = [['Lead', 'Date', 'Note', 'Link'], ['A-1', '2026-10-01', { formula: 'cmd|\' /C calc\'!A0' }, { text: 'click', hyperlink: 'javascript:alert(1)' }], ['A-2', '2026-10-02', '=1+1', 5]];
  const r = await ag.post('/api/export/call-reviews', { rows, pf: 99, pt: 99, name: 'Mine' });
  assert.equal(r.status, 200);
  const sheet = await (await JSZip.loadAsync(r.buf)).file('xl/worksheets/sheet1.xml').async('string');
  assert.ok(!/<f>/.test(sheet), 'no formula cells');
  assert.ok(!/hyperlink/i.test(sheet), 'no hyperlinks');
  assert.equal((await (await as('q.alpha')).post('/api/export/call-reviews', { rows, pf: 99, pt: 99, name: 'Staff copy' })).status, 200);
  const saved = db().exports[0];                                                              // (agents get no copy in the Export centre at all)
  assert.equal(saved.by, 'q.alpha');
  assert.ok(saved.rows.flat().every(v => v === null || ['string', 'number', 'boolean'].includes(typeof v)), 'the Export centre copy holds plain values only');
});

// ---------------------------------------------------------------- sessions, sign-in and browser protections
test('a request sent from another website is refused even with a valid sign-in (CSRF)', async () => {
  const q = await as('q.alpha');
  const r = await q.put('/api/prefs', { info: false }, { 'Sec-Fetch-Site': 'cross-site' });
  assert.equal(r.status, 403);
  assert.notEqual((db().users.find(u => u.username === 'q.alpha').prefs || {}).info, false, 'nothing was saved');
  assert.equal((await q.put('/api/prefs', { info: true }, { 'Sec-Fetch-Site': 'same-origin' })).status, 200, 'the app itself still works');
});

test('the sign-in cookie expires after a period without use', async () => {
  const q = await as('q.alpha');
  assert.match(q.login.headers.get('set-cookie'), /Expires=|Max-Age=/i);
});

test('one account cannot be guessed at forever, even from many addresses', async () => {
  let last;
  for (let i = 0; i < 11; i++) last = await (await as('z.victim', 'wrong-' + i)).login;
  assert.equal(last.status, 429);
  assert.equal((await as('z.victim')).login.status, 429, 'locked for a while, even with the right password');
  assert.equal((await as('q.alpha')).login.status, 200, 'other accounts are not affected');
});

test('people who are not signed in cannot send large requests', async () => {
  const big = JSON.stringify({ username: 'x', password: 'y', pad: 'a'.repeat(300 * 1024) });
  const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: big });
  assert.equal(r.status, 413);
});

test('the "show me how notifications look" button cannot be used to flood the notification list', async () => {
  const ag = await as('a.one');
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await ag.post('/api/notifications/sample')).status);
  assert.deepEqual(codes, [200, 200, 200, 429]);
});

test('unknown record types are refused instead of being created', async () => {
  const adm = await as('t.admin');
  assert.equal((await adm.put('/api/c/evaluations/A-1', { sc: 0 })).status, 404);
  assert.equal((await adm.put('/api/c/__proto__/x', {})).status, 404);
  assert.equal(db().evaluations.find(e => e.rid === RA).sc, 100);
});

test('an improvement plan whose goals are not a list is refused (it would break the page for everybody)', async () => {
  const adm = await as('t.admin');
  assert.equal((await adm.post('/api/c/pips', { agent: 'a.one', title: 'Plan', goals: 'not a list' })).status, 400);
  const ok = await adm.post('/api/c/pips', { agent: 'a.one', title: 'Plan', goals: [{ t: 'Average above 85%', done: false }] });
  assert.equal(ok.status, 200);
  assert.equal((await adm.put('/api/c/pips/' + ok.json.id, { goals: [1, 2] })).status, 400);
  assert.equal((await adm.put('/api/c/pips/' + ok.json.id, { goals: [{ t: 'Average above 85%', done: true }] })).status, 200, 'ticking a goal still works');
});

// ---------------------------------------------------------------- output encoding
test('report e-mails show names and titles as text, never as HTML', () => {
  const res = RPT.run({ src: 'reviews', metrics: ['count'], rows: 'campaign', period: { p: 'all' } },
    { ev: [{ d: '2026-10-01T12:00:00Z', agent: 'x', sc: 90, cp: '<img src=x onerror=alert(1)>' }], users: [], teams: [] });
  const html = RPT.toHtml(res, '<script>alert(1)</script>');
  assert.ok(!/<img|<script/i.test(html));
  assert.match(html, /&#60;script&#62;alert\(1\)/, 'shown as text');
});

// ================================================================ second audit round
// ---------------------------------------------------------------- dashboard views and widgets
test('a shared view cannot carry code: view ids and widget keys are reduced to letters, numbers, - and _', async () => {
  const qa = await as('q.alpha');
  const r = await qa.put('/api/shared-views', { page: 'dash', views: [{ id: "');alert(1)//", name: 'Team view', roles: ['all'], items: [{ k: 'kpi" onmouseover="alert(1)', id: 'kpi', size: 30 }, { k: "x');alert(2);//", id: 'trend', size: 60 }] }] });
  assert.equal(r.status, 200);
  const v = r.json.views.dash[0];
  assert.match(v.id, /^[\w-]+$/);
  v.items.forEach(x => assert.match(x.k, /^[\w-]+$/));
  const me = await (await as('a.one')).put('/api/views', { page: 'dash', views: [{ id: '"><img src=x>', name: 'Mine', items: [{ k: '"x', id: 'kpi' }] }] });
  assert.match(me.json.views.dash[0].id, /^[\w-]+$/, 'the same for personal views');
  assert.match(me.json.views.dash[0].items[0].k, /^[\w-]+$/);
});

test('a widget keeps its own "review type" filter after saving (regression: the server dropped it)', async () => {
  const r = await (await as('q.alpha')).put('/api/layout', { page: 'dash', items: [{ k: 'kpi-1', id: 'kpi', size: 30, f: { c: 'chat', t: 't-a', p: 'month' } }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.layouts.dash[0].f, { c: 'chat', t: 't-a', p: 'month' });
  const bad = await (await as('q.alpha')).put('/api/layout', { page: 'dash', items: [{ k: 'kpi-1', id: 'kpi', f: { c: '<b>', t: '"x', p: 'forever' } }] });
  assert.deepEqual(bad.json.layouts.dash[0].f, { c: '', t: 'x', p: 'forever' }, 'only a known review type is kept; ids keep safe characters');
});

test('page names of layouts and views must be simple names, and there are not endless of them', async () => {
  const q = await as('q.alpha');
  for (const page of ['__proto__', 'constructor', 'a b', '<x>']) assert.equal((await q.put('/api/layout', { page, items: [{ id: 'kpi' }] })).status, 400, page);
  assert.equal((await q.put('/api/views', { page: 'constructor', views: [] })).status, 400);
  let last;
  for (let i = 0; i < 21; i++) last = await q.put('/api/layout', { page: 'pg' + i, items: [{ id: 'kpi' }] });
  assert.equal(last.status, 400, 'at most 20 different pages per person');
});

// ---------------------------------------------------------------- sessions and passwords
test('changing your password signs out your other sessions (the current one stays signed in)', async () => {
  const a = await as('p.change'), b = await as('p.change');
  assert.equal((await b.get('/api/me')).status, 200);
  assert.equal((await a.post('/api/password', { current: 'password', next: 'New#Pass12345' })).status, 200);
  assert.equal((await a.get('/api/me')).status, 200, 'the session that changed it stays');
  assert.equal((await b.get('/api/me')).status, 401, 'the other session is ended');
});

test('a password reset by e-mail link ends every open session, and the link works only once', async () => {
  const open = await as('r.reset');
  OUT = '';
  assert.equal((await fetch(BASE + '/api/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'r.reset' }) })).status, 200);
  await wait(300);
  const token = (OUT.match(/reset=([0-9a-f]{64})&u=r\.reset/) || [])[1];
  assert.ok(token, 'the reset link was "e-mailed" (printed, because no e-mail server is set up in the tests)');
  const reset = body => fetch(BASE + '/api/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await reset({ username: 'r.reset', token, password: 'Reset#Pass2' })).status, 200);
  assert.equal((await open.get('/api/me')).status, 401, 'the session that was open before the reset is ended');
  assert.equal((await reset({ username: 'r.reset', token, password: 'Other#Pass3' })).status, 400, 'the link cannot be used twice');
  assert.equal((await as('r.reset', 'password')).login.status, 401);
  assert.equal((await as('r.reset', 'Reset#Pass2')).login.status, 200);
});

test('the current password cannot be guessed through "change password"', async () => {
  const g = await as('g.guess'); let last;
  for (let i = 0; i < 11; i++) last = await g.post('/api/password', { current: 'wrong-' + i, next: 'New#Pass1' });
  assert.equal(last.status, 429);
});

test('"forgot password" e-mails to one account are limited, whatever the address', async () => {
  OUT = '';
  for (let i = 0; i < 4; i++) assert.equal((await fetch(BASE + '/api/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.88.0.' + i }, body: JSON.stringify({ identifier: 'f.flood' }) })).status, 200);
  await wait(300);
  assert.equal((OUT.match(/Email to f\.flood@test\.com - Reset your password/g) || []).length, 3, 'at most 3 per hour; the answer stays the same');
});

test('API answers are never kept in the browser cache', async () => {
  const r = await (await as('a.one')).get('/api/evaluations');
  assert.match(r.headers.get('cache-control') || '', /no-store/);
});

// ---------------------------------------------------------------- browser protections
test('a change sent from a neighbouring site on the same domain is refused too', async () => {
  const q = await as('q.alpha');
  assert.equal((await q.put('/api/prefs', { info: false }, { 'Sec-Fetch-Site': 'same-site' })).status, 403);
  assert.equal((await q.put('/api/prefs', { info: true }, { 'Sec-Fetch-Site': 'none' })).status, 200, 'typed in by the person (no other site involved)');
});

test('the forwarded address is only trusted from this computer (the tunnel): others cannot dodge the sign-in limit', { skip: !Object.values(os.networkInterfaces()).flat().some(i => i && i.family === 'IPv4' && !i.internal) && 'no network address on this computer' }, async () => {
  const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal).address, port = new URL(BASE).port;
  const codes = [];
  for (let i = 0; i < 31; i++) {
    const r = await fetch(`http://${lan}:${port}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.' + i }, body: JSON.stringify({ username: 'nobody' + i, password: 'x' }) }).catch(() => null);
    if (!r) return;                                                                     // the address cannot be reached here: nothing to prove
    codes.push(r.status);
  }
  assert.equal(codes[30], 429, 'the 31st attempt from one machine is stopped, whatever address it claims');
});

// ---------------------------------------------------------------- resource use by signed-in people
test('agents cannot send very large requests', async () => {
  const r = await (await as('a.one')).put('/api/prefs', { info: true, pad: 'a'.repeat(2.5 * 1024 * 1024) });
  assert.equal(r.status, 413);
});

test('a list import ("bulk") is only possible where it exists (CSAT surveys)', async () => {
  const before = (db().kudos || []).length;
  const r = await (await as('a.one')).post('/api/c/kudos', { bulk: [{ to: 'a.two', text: 'hi' }, { to: 'a.two', text: 'hi' }] });
  assert.equal(r.status, 400);
  assert.equal((db().kudos || []).length, before);
});

test('the Export centre keeps copies only for staff, and not of very large files', async () => {
  const before = (db().exports || []).length;
  assert.equal((await (await as('a.one')).post('/api/export/call-reviews', { rows: [['Lead', 'Date'], ['A-1', '2026-10-01']], pf: 9, pt: 9, name: 'Mine' })).status, 200);
  assert.equal((db().exports || []).length, before, 'an agent cannot open the Export centre, so no copy is kept');
  const big = [['Lead', 'Date', 'Note'], ...Array.from({ length: 3000 }, (_, i) => ['L' + i, '2026-10-01', 'x'.repeat(800)])];
  assert.equal((await (await as('t.admin')).post('/api/export/call-reviews', { rows: big, pf: 9, pt: 9, name: 'Big' })).status, 200);
  assert.equal(db().exports[0].rows, null, 'a copy of more than 2 MB is not kept inside the data file');
});

test('staff cannot give tasks, sessions or simulator results to agents of another workspace', async () => {
  const lead = await as('l.alpha');
  assert.equal((await lead.post('/api/tasks', { title: 'Not mine', assignees: ['a.two'] })).status, 400);
  assert.equal((await lead.post('/api/tasks', { title: 'Not mine', teams: ['t-b'] })).status, 400);
  assert.equal((await lead.post('/api/sessions', { kind: 'o2o', date: '2026-10-01', agents: ['a.two'] })).status, 400);
  assert.equal((await lead.post('/api/simulations', { agent: 'a.two', score: 5 })).status, 400);
  const t = (await lead.post('/api/tasks', { title: 'Mine', assignees: ['a.one'] })).json[0];
  assert.equal((await lead.put('/api/tasks/' + t.id, { assignee: 'a.two' })).status, 400, 'nor move a task to them');
  assert.equal(db().tasks.find(x => x.id === t.id).assignee, 'a.one');
});

test('settings only admins use (e-mail templates, notification rules) are not sent to everybody', async () => {
  assert.equal((await (await as('t.admin')).put('/api/settings/x/mailtpl', { value: { approved: { subject: 'Welcome' } } })).status, 200);
  const s = (await (await as('a.one')).get('/api/settings')).json;
  assert.equal(s.mailtpl, undefined); assert.equal(s.notifOff, undefined);
  assert.ok(s.pass, 'the pass mark is still there');
  assert.ok((await (await as('t.admin')).get('/api/settings')).json.mailtpl, 'admins still get them');
});

// ---------------------------------------------------------------- slow text processing (a crafted text must not freeze the server)
test('the Markdown renderer stays fast on a crafted article (200,000 "[" characters)', () => {
  const t0 = Date.now(); md('['.repeat(200000)); const ms = Date.now() - t0;
  assert.ok(ms < 2000, 'took ' + ms + ' ms');
  assert.equal(md('[a](https://example.com) [b [c](https://example.com/c)'), '<p><a href="https://example.com" target="_blank" rel="noopener">a</a> [b <a href="https://example.com/c" target="_blank" rel="noopener">c</a></p>', 'links still work');
});

test('a long crafted comment does not slow down the Bulgarian and French screens', () => {
  const g = { window: {} }; const w = new Function('window', 'module', fs.readFileSync(path.join(__dirname, '../public/js/i18n.js'), 'utf8') + ';return window.I18N;');
  const I18N = w(g.window, undefined); g.window.I18N = I18N;
  new Function('window', 'I18N', fs.readFileSync(path.join(__dirname, '../public/js/i18n/bg.js'), 'utf8'))(g.window, I18N);
  const t0 = Date.now(); I18N.tr('x · Team '.repeat(700), 'bg'); const ms = Date.now() - t0;
  assert.ok(ms < 40, 'took ' + ms + ' ms');
  assert.equal(I18N.tr('Ana One · Team B2C', 'bg'), 'Ana One · Екип B2C', 'short labels made from a pattern are still translated');
  assert.notEqual(I18N.tr('Sign in', 'bg'), 'Sign in');
});

test('importing a crafted HTML file stays fast', async () => {
  const fileB64 = Buffer.from('<h1'.repeat(40000) + '<script'.repeat(10000) + '<'.repeat(40000)).toString('base64');
  const t0 = Date.now(); const r = await (await as('t.admin')).post('/api/kb/import', { fileB64, filename: 'x.html' }); const ms = Date.now() - t0;
  assert.equal(r.status, 200);
  assert.ok(ms < 1500, 'took ' + ms + ' ms');
  const ok = await (await as('t.admin')).post('/api/kb/import', { fileB64: Buffer.from('<h1 class="t">Refunds</h1><p>Say &amp; do</p><script>alert(1)</script><style>p{}</style><h2>Steps</h2><ul><li>One</li></ul>').toString('base64'), filename: 'guide.html' });
  assert.deepEqual(ok.json.articles.map(a => a.title), ['Refunds', 'Steps'], 'normal HTML still splits at its headings');
  assert.ok(!/alert|p\{\}/.test(JSON.stringify(ok.json)), 'scripts and styles are still dropped');
});

// ---------------------------------------------------------------- numbers in reports and Excel files
test('report rows per category count only the reviews that have that category', () => {
  const cs = (n, e) => [{ n, e, m: 10, it: [] }], d = '2026-10-05T12:00:00Z';
  const ev = [{ d, agent: 'a', sc: 95, cs: cs('Greeting', 10) }, { d, agent: 'a', sc: 90, cs: cs('Greeting', 8) },
    { d, agent: 'a', sc: 40, cs: cs('Closing', 2), fl: 'red' }, { d, agent: 'a', sc: 50, cs: cs('Closing', 3), fl: 'red' }];
  const res = RPT.run({ src: 'reviews', metrics: ['count', 'avg', 'pass', 'red'], rows: 'category', period: { p: 'all' } }, { ev, users: [], teams: [], pass: () => 85 });
  const row = k => res.rows.find(r => r.key === k).cells[0];
  assert.deepEqual([row('Greeting').count, row('Greeting').avg, row('Greeting').pass, row('Greeting').red], [2, 90, 100, 0]);
  assert.deepEqual([row('Closing').count, row('Closing').avg, row('Closing').pass, row('Closing').red], [2, 25, 0, 2]);
});

test('Excel files keep numbers as numbers and only real dates become dates (report and quick-flag exports)', async () => {
  const adm = await as('t.admin');
  const read = async buf => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); return wb.worksheets[0]; };
  const rep = await read((await adm.post('/api/export/call-reviews', { rows: [['Agent', 'Average score (%)'], ['Ana One', 92.5]], pf: -1, pt: -1, dc: -1, name: 'Report' })).buf);
  assert.equal(rep.getCell('B2').value, 0.925, 'a % column is a real percentage (4 November)'); assert.equal(rep.getCell('B2').numFmt, '0.00%');
  const fl = await read((await adm.post('/api/export/call-reviews', { rows: [['Lead ID', 'Type', 'Date'], ['L1', 'Call', '2026-10-01']], pf: 6, pt: 6, dc: 2, name: 'Quick Flags' })).buf);
  assert.equal(fl.getCell('B2').value, 'Call');
  assert.ok(fl.getCell('C2').value instanceof Date); assert.equal(fl.getCell('C2').numFmt, 'mm-dd-yy', 'the built-in short date (Date category)');
  const rv = await read((await adm.post('/api/export/call-reviews', { rows: [['Lead ID', 'Date'], ['L1', '2026-10-01'], ['L2', 'not a date']], pf: 9, pt: 9, name: 'Call Reviews' })).buf);
  assert.ok(rv.getCell('B2').value instanceof Date, 'the review export still turns its date column into dates');
  assert.equal(rv.getCell('B3').value, 'not a date', 'but leaves other text alone');
});

// ---------------------------------------------------------------- these two change the whole data file or the server, so they run last
test('a recording file name never leaves the recordings folder, whatever the review id', async () => {
  const adm = await as('t.admin'), d = db();
  d.evaluations.push({ ...d.evaluations[0], rid: '..\\escaped', rec: '' });                  // one level up = still inside this test's own temporary folder
  assert.equal((await adm.post('/api/backups/upload/restore', { data: d })).status, 200);
  const up = await adm.call('POST', '/api/evaluations/' + encodeURIComponent('..\\escaped') + '/recording?ext=mp3', 'ID3', { 'Content-Type': 'audio/mpeg' });
  assert.equal(up.status, 200);
  assert.ok(fs.readdirSync(path.join(DIR, 'rec')).some(f => f === up.json.rec), 'the file is inside the recordings folder');
  assert.match(up.json.rec, /^[\w-]+\.mp3$/);
});

test('a default layout cannot change how every object in the server behaves (prototype pollution)', async () => {
  const adm = await as('t.admin');
  assert.equal((await adm.put('/api/layouts/admin', { page: '__proto__', items: [{ id: 'kpi' }] })).status, 400);
  assert.equal((await adm.put('/api/layouts/qa', { page: 'constructor', items: [{ id: 'kpi' }] })).status, 400);
  assert.equal((await adm.get('/api/c/admin')).status, 404, 'still an unknown record type (a polluted server would answer 500)');
});
