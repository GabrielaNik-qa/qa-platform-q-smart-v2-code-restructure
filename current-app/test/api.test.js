// The real server, started on a free port with a temporary data file of made-up test users (the real data.json is never used).
// Two workspaces (A and B) with one QA specialist and one agent each show that people only reach the reviews they are allowed to.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const { DEFAULT_SC } = require('../scorecard');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qsmart-test-')), DATA = path.join(DIR, 'data.json');
const H = bcrypt.hashSync('password', 4);
const person = (username, name, role, team) => ({ username, name, email: username + '@test.com', role, team, title: '', desc: '', languages: [], skills: [], phone: '', start: '', active: true, hash: H, mustChange: false });
fs.writeFileSync(DATA, JSON.stringify({
  boot: 5, users: [person('t.admin', 'Test Admin', 'admin', 't-admin'), person('q.alpha', 'Quinn Alpha', 'qa', 't-admin'), person('q.beta', 'Quinn Beta', 'qa', 't-admin'),
    person('l.lead', 'Lee Lead', 'lead', 't-admin'), person('a.one', 'Ana One', 'agent', 't-a'), person('a.two', 'Ben Two', 'agent', 't-b')],
  teams: [{ id: 't-admin', name: 'Administration', lead: 't.admin', system: true }, { id: 't-a', name: 'Team A', lead: 'l.lead' }, { id: 't-b', name: 'Team B', lead: 'l.lead' }],
  workspaces: [{ id: 'w-a', name: 'A', teams: ['t-a'], scorecards: ['sc-default'], staff: ['q.alpha', 'l.lead'] }, { id: 'w-b', name: 'B', teams: ['t-b'], scorecards: ['sc-default'], staff: ['q.beta'] }],
  scorecards: [DEFAULT_SC], evaluations: [], settings: { pass: 85, teams: {} }, skills: [], languages: [], rootCauses: [], categories: [], autoCats: [], conversations: []
}));

let BASE = '', srv = null;
test.before(async () => {
  srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '0', DATA_FILE: DATA, AUDIT_FILE: path.join(DIR, 'audit.json'), REC_DIR: path.join(DIR, 'rec'), SECRET: 'test-only' }, stdio: ['ignore', 'pipe', 'pipe'] });
  BASE = await new Promise((ok, no) => {
    const t = setTimeout(() => no(new Error('the server did not start')), 15000);
    srv.stdout.on('data', d => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) { clearTimeout(t); ok('http://localhost:' + m[1]); } });
    srv.on('exit', c => no(new Error('the server stopped: ' + c)));
  });
});
test.after(() => { if (srv) srv.kill(); try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) { /* temp folder */ } });

// a signed-in person: keeps the session cookie between calls
async function as(username, password = 'password') {
  let cookie = '';
  const call = async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    return { status: r.status, json, headers: r.headers };
  };
  const login = await call('POST', '/api/login', { username, password });
  return { login, get: u => call('GET', u), post: (u, b = {}) => call('POST', u, b), put: (u, b) => call('PUT', u, b), del: u => call('DELETE', u) };
}
const allYes = () => DEFAULT_SC.cats.map(c => c.it.map(() => ['y', '', '']));
const db = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));

test('sign-in: wrong password is refused, the right one works and returns the default pop-up preferences', async () => {
  assert.equal((await as('q.alpha', 'wrong')).login.status, 401);
  const q = await as('q.alpha');
  assert.equal(q.login.status, 200);
  assert.deepEqual(q.login.json.prefs, { info: true, confirm: true, off: {} });
});
test('security headers are sent and the session cookie is HttpOnly', async () => {
  const r = await fetch(BASE + '/');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
  const q = await as('q.alpha');
  assert.match(q.login.headers.get('set-cookie'), /HttpOnly/i);
});
test('preferences need a signed-in person', async () => {
  const r = await fetch(BASE + '/api/prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"info":false}' });
  assert.equal(r.status, 401);
});
test('"Don\'t show me this again" is saved for that person only, and survives signing in again', async () => {
  const a = await as('q.alpha'), b = await as('q.beta');
  const r = await a.put('/api/prefs', { dismiss: ['tip.roots'] });
  assert.equal(r.status, 200); assert.ok(r.json.prefs.off['tip.roots']);
  assert.deepEqual((await b.get('/api/me')).json.prefs.off, {}, 'another person is not affected');
  assert.ok(db().users.find(u => u.username === 'q.alpha').prefs.off['tip.roots'], 'written to the data file');
  assert.ok((await as('q.alpha')).login.json.prefs.off['tip.roots'], 'still there after a new sign-in');
});
test('switches, show again, reset and restore defaults', async () => {
  const a = await as('q.alpha');
  let p = (await a.put('/api/prefs', { info: false, confirm: false, dismiss: ['tip.categories', 'welcome'] })).json.prefs;
  assert.equal(p.info, false); assert.equal(p.confirm, false); assert.ok(p.off.welcome && p.off['tip.categories']);
  p = (await a.put('/api/prefs', { info: 'no', confirm: 0 })).json.prefs;                       // only real true / false change a switch
  assert.equal(p.info, false); assert.equal(p.confirm, false);
  p = (await a.put('/api/prefs', { restore: ['welcome'] })).json.prefs;
  assert.ok(!p.off.welcome && p.off['tip.categories']);
  p = (await a.put('/api/prefs', { clear: true })).json.prefs;
  assert.deepEqual(p.off, {}); assert.equal(p.info, false);
  p = (await a.put('/api/prefs', { defaults: true })).json.prefs;
  assert.deepEqual(p, { info: true, confirm: true, off: {} });
});
test('bad preference data is refused or ignored', async () => {
  const a = await as('q.beta');
  assert.equal((await a.put('/api/prefs', { dismiss: ['<script>'] })).status, 400);
  assert.equal((await a.put('/api/prefs', { dismiss: ['Tip.Roots'] })).status, 400);
  const p = (await a.put('/api/prefs', { off: { 'any.thing': 'x' }, prefs: { info: false } })).json.prefs;   // unknown fields cannot write the list directly
  assert.deepEqual(p, { info: true, confirm: true, off: {} });
  const ids = n => Array.from({ length: n }, (_, i) => 'tip.x' + i);
  for (let i = 0; i < 3; i++) assert.equal((await a.put('/api/prefs', { dismiss: ids(30 * (i + 1)).slice(30 * i) })).status, 200);
  assert.equal((await a.put('/api/prefs', { dismiss: ids(120).slice(90) })).status, 400, 'at most 100 dismissed messages');
  await a.put('/api/prefs', { defaults: true });
});

// ---- reviews and workspaces
let RA = '', RB = '';
test('a review is scored by the server with the scorecard rules', async () => {
  const adm = await as('t.admin');
  const a = await adm.post('/api/evaluations', { scid: 'sc-default', agent: 'a.one', id: 'A-1', dt: '2026-10-01', a: allYes() });
  const b = await adm.post('/api/evaluations', { scid: 'sc-default', agent: 'a.two', id: 'B-1', dt: '2026-10-01', a: allYes() });
  assert.equal(a.status, 200); assert.equal(a.json.sc, 100); RA = a.json.rid; RB = b.json.rid;
  const one = allYes(); one[0][0] = ['n', 'missed the greeting', ''];
  const c = await adm.post('/api/evaluations', { scid: 'sc-default', agent: 'a.one', id: 'A-2', dt: '2026-10-02', a: one });
  assert.equal(c.json.sc, 94);
});
test('a QA specialist only sees and changes the reviews of their own workspace', async () => {
  const qa = await as('q.alpha');
  const list = (await qa.get('/api/evaluations')).json.map(e => e.rid);
  assert.ok(list.includes(RA) && !list.includes(RB));
  assert.equal((await qa.put('/api/evaluations/' + RB, { cm: 'not mine' })).status, 404);
  assert.equal((await qa.del('/api/evaluations/' + RB)).status, 404);
  assert.equal((await qa.post('/api/evaluations/' + RB + '/remind')).status, 404);
  assert.equal((await qa.post('/api/evaluations', { scid: 'sc-default', agent: 'a.two', id: 'X', dt: '2026-10-03', a: allYes() })).status, 400);
  assert.equal((await qa.put('/api/evaluations/' + RA, { agent: 'a.two' })).status, 400, 'cannot move a review to an agent of another workspace');
  assert.equal((await qa.put('/api/evaluations/' + RA, { cm: 'checked' })).status, 200);
  assert.equal((await (await as('q.beta')).put('/api/evaluations/' + RB, { cm: 'checked' })).status, 200);
  assert.ok(db().evaluations.find(e => e.rid === RB), 'the other review is untouched');
});
test('agents see only their own reviews and cannot change them', async () => {
  const ag = await as('a.one');
  const list = (await ag.get('/api/evaluations')).json;
  assert.ok(list.length >= 1 && list.every(e => e.agent === 'a.one'));
  assert.equal((await ag.put('/api/evaluations/' + RA, { cm: 'x' })).status, 403);
  assert.equal((await ag.del('/api/evaluations/' + RA)).status, 403);
});
test('dispute: the agent disputes, QA of the same workspace resolves, QA of another workspace cannot', async () => {
  const ag = await as('a.one');
  assert.equal((await ag.post('/api/evaluations/' + RA + '/dispute', { text: 'Please listen again' })).status, 200);
  assert.equal((await ag.post('/api/evaluations/' + RA + '/dispute', { text: 'again' })).status, 400, 'only one dispute per review');
  assert.equal((await (await as('a.two')).post('/api/evaluations/' + RA + '/dispute/msg', { text: 'hi' })).status, 404, 'another agent cannot write in it');
  assert.equal((await (await as('q.beta')).post('/api/evaluations/' + RA + '/dispute/resolve', { outcome: 'kept' })).status, 404);
  const r = await (await as('q.alpha')).post('/api/evaluations/' + RA + '/dispute/resolve', { outcome: 'kept', note: 'agreed' });
  assert.equal(r.status, 200); assert.equal(r.json.dp.status, 'resolved'); assert.equal(r.json.st, 'ok');
});
test('an agent ticking a checklist with a broken item gets a normal answer (not a server error)', async () => {
  const lead = await as('l.lead');
  const t = (await lead.post('/api/tasks', { title: 'Listen to 3 calls', assignees: ['a.one'], checklist: ['one', 'two'] })).json[0];
  const r = await (await as('a.one')).put('/api/tasks/' + t.id, { checklist: [null, { done: true }] });
  assert.equal(r.status, 200); assert.deepEqual(r.json.checklist.map(c => c.done), [false, true]);
});
test('saving never leaves a half-written file behind, and the change is in the audit log', async () => {
  await (await as('q.alpha')).put('/api/prefs', { dismiss: ['tip.entry'] });
  assert.ok(!fs.existsSync(DATA + '.tmp'));
  assert.doesNotThrow(() => db());
  await new Promise(r => setTimeout(r, 600));                                                 // the audit log is written a moment later
  const log = (await (await as('t.admin')).get('/api/audit')).json;
  assert.ok(log.some(x => x.a === 'Changed own pop-up and confirmation settings' && x.u === 'q.alpha'));
});

test('language: saved with each person, kept after signing in again, never changes another person', async () => {
  const q = await as('q.alpha'), b = await as('q.beta');
  assert.equal(q.login.json.prefs.lang, undefined);                                           // nothing chosen yet = English
  assert.equal((await q.put('/api/prefs', { lang: 'xx' })).status, 400);                     // only en, bg and fr exist
  const r = await q.put('/api/prefs', { lang: 'bg' });
  assert.equal(r.status, 200); assert.equal(r.json.prefs.lang, 'bg');
  assert.equal((await q.get('/api/me')).json.prefs.lang, 'bg');
  assert.equal((await as('q.alpha')).login.json.prefs.lang, 'bg');                           // a new sign-in brings it back
  assert.equal((await b.get('/api/me')).json.prefs.lang, undefined);                          // the other person is untouched
  assert.equal((await q.put('/api/prefs', { defaults: true })).json.prefs.lang, 'bg');        // "Restore default settings" keeps the language
  assert.equal((await q.put('/api/prefs', { lang: 'fr', info: false })).json.prefs.lang, 'fr');
  assert.equal(db().users.find(u => u.username === 'q.alpha').prefs.lang, 'fr');
  assert.equal((db().users.find(u => u.username === 'q.beta').prefs || {}).lang, undefined);
});
