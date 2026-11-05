// Workflow tests (audit of October 2026): scorecards and old reviews, editing reviews, disputes, repeating missions, coaching action items,
// registration, team and admin rules, quizzes, knowledge base folders, and the report engine's pass marks, dates and empty periods.
// The real server runs on a free port with a temporary data file of made-up people; your data.json is never touched.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const { DEFAULT_SC } = require('../scorecard');
const RPT = require('../public/js/rpt-engine.js');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qsmart-wf-')), DATA = path.join(DIR, 'data.json');
const H = bcrypt.hashSync('password', 4);
const person = (username, name, role, team) => ({ username, name, email: username + '@test.com', role, team, title: '', desc: '', languages: [], skills: [], phone: '', start: '', active: true, hash: H, mustChange: false });
fs.writeFileSync(DATA, JSON.stringify({
  boot: 5,
  users: [person('t.admin', 'Test Admin', 'admin', 't-admin'), person('q.qa', 'Quinn QA', 'qa', 't-admin'), person('l.lead', 'Lee Lead', 'lead', 't-admin'), person('t.trainer', 'Tia Trainer', 'trainer', 't-admin'),
    person('a.one', 'Ana One', 'agent', 't-a'), person('a.two', 'Ben Two', 'agent', 't-b')],
  teams: [{ id: 't-admin', name: 'Administration', lead: 't.admin', system: true }, { id: 't-a', name: 'Team A', lead: 'l.lead' }, { id: 't-b', name: 'Team B', lead: 'l.lead' }],
  workspaces: [{ id: 'w-1', name: 'Main', teams: ['t-a', 't-b'], scorecards: ['sc-default'], staff: ['q.qa', 'l.lead', 't.trainer'] }],
  scorecards: [DEFAULT_SC], evaluations: [], settings: { pass: 85, teams: {} }, skills: [], languages: [], rootCauses: [], categories: [], autoCats: [], conversations: []
}));

let BASE = '', srv = null;
test.before(async () => {
  srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '0', DATA_FILE: DATA, AUDIT_FILE: path.join(DIR, 'audit.json'), REC_DIR: path.join(DIR, 'rec'), BACKUPS_DIR: path.join(DIR, 'backups'), SECRET: 'test-only', SMTP_HOST: '', ANTHROPIC_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  BASE = await new Promise((ok, no) => {
    const t = setTimeout(() => no(new Error('the server did not start')), 15000);
    srv.stdout.on('data', d => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) { clearTimeout(t); ok('http://localhost:' + m[1]); } });
    srv.on('exit', c => no(new Error('the server stopped: ' + c)));
  });
});
test.after(() => { if (srv) srv.kill(); try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) { /* temp folder */ } });

let NADDR = 0;   // every person signs in from their own address (as through the tunnel), so the sign-in limit per address is not reached
async function as(username, password = 'password') {
  let cookie = ''; const addr = '10.66.' + (++NADDR >> 8 & 255) + '.' + (NADDR & 255);
  const call = async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': addr, ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    return { status: r.status, json };
  };
  const login = await call('POST', '/api/login', { username, password });
  return { login, get: u => call('GET', u), post: (u, b = {}) => call('POST', u, b), put: (u, b) => call('PUT', u, b), del: u => call('DELETE', u) };
}
const db = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));
const answers = (sc, f = () => 'y') => sc.cats.map((c, ci) => c.it.map((i, ii) => [f(ci, ii), '', '']));

// ---------------------------------------------------------------- scorecards and reviews
const SC2 = { name: 'Two categories', chs: ['call'], cats: [{ n: 'Opening', it: [{ t: 'Greets', p: 40 }, { t: 'Names the company', p: 10 }] }, { n: 'Solution', k: true, it: [{ t: 'Solves the problem', p: 50 }] }] };
let SCID = '', RID = '';
test('a review is scored by the server from the answers; a score sent by the browser is ignored', async () => {
  const adm = await as('t.admin');
  const sc = await adm.post('/api/scorecards', SC2); assert.equal(sc.status, 200); SCID = sc.json.id;
  const r = await adm.post('/api/evaluations', { scid: SCID, agent: 'a.one', id: 'W-1', dt: '2026-10-05', sc: 100, a: [[['y'], ['n']], [['y']]] });
  assert.equal(r.status, 200); RID = r.json.rid;
  assert.equal(r.json.sc, 90, '40 + 50 of 100 points (the "No" loses its 10 points)');
  const crit = await adm.post('/api/evaluations', { scid: SCID, agent: 'a.one', id: 'W-2', dt: '2026-10-05', sc: 100, a: [[['y'], ['y']], [['n']]] });
  assert.equal(crit.json.sc, 0, 'a "No" in a critical category makes the whole review 0%');
});

test('changing a scorecard later never changes the reviews already made with it', async () => {
  const adm = await as('t.admin');
  const before = db().evaluations.find(e => e.rid === RID);
  const changed = { ...SC2, cats: [{ n: 'Opening (new)', it: [{ t: 'Greets', p: 20 }, { t: 'Names the company', p: 30 }] }, { n: 'Solution', it: [{ t: 'Solves the problem', p: 50 }] }] };
  assert.equal((await adm.put('/api/scorecards/' + SCID, changed)).status, 200);
  const after = db().evaluations.find(e => e.rid === RID);
  assert.equal(after.sc, before.sc); assert.deepEqual(after.cs, before.cs);
  // editing the old review recalculates with ITS OWN points (40/10/50), not the new ones (20/30/50)
  const r = await adm.put('/api/evaluations/' + RID, { a: [[['n'], ['y']], [['y']]] });
  assert.equal(r.json.sc, 60, '10 + 50: the old points');
  assert.equal(r.json.cs[0].n, 'Opening', 'the old category name stays');
});

test('a changed score tells the agent; a changed comment does not', async () => {
  const adm = await as('t.admin'), ag = await as('a.one');
  const n0 = (await ag.get('/api/notifications')).json.length;
  await adm.put('/api/evaluations/' + RID, { cm: 'Only a comment' });
  assert.equal((await ag.get('/api/notifications')).json.length, n0);
  await adm.put('/api/evaluations/' + RID, { a: [[['y'], ['y']], [['y']]] });
  const l = (await ag.get('/api/notifications')).json;
  assert.equal(l.length, n0 + 1); assert.match(l[0].text, /was updated \(score 100%\)/);
});

test('scorecards have free tags (trimmed, no doubles, at most 12) and any scorecard can score any type of conversation', async () => {
  const adm = await as('t.admin');
  const tags = [' Chats ', 'chats', 'B2C', ...Array.from({ length: 15 }, (_, i) => 'T' + i)];
  const sc = await adm.post('/api/scorecards', { ...SC2, name: 'Tagged', tags });
  assert.equal(sc.status, 200);
  assert.equal(sc.json.tags.length, 12); assert.deepEqual(sc.json.tags.slice(0, 3), ['Chats', 'B2C', 'T0']);
  const r = await adm.post('/api/evaluations', { scid: sc.json.id, agent: 'a.one', id: 'W-TAG', dt: '2026-10-05', ch: 'email', subj: 'Invoice', tx: 'Hello', a: [[['y'], ['y']], [['y']]] });
  assert.equal(r.status, 200, 'an e-mail scored with a scorecard tagged only "Chats" is accepted');
  assert.equal(r.json.ch, 'email');
  assert.equal((await adm.del('/api/scorecards/' + sc.json.id)).status, 200);
});

test('a dashboard widget can be as wide (any of the 60 columns) and as high as you drag it; bad sizes fall back safely', async () => {
  const a = await as('a.one');
  const r = await a.put('/api/layout', { page: 'dash', items: [{ k: 'k1', id: 'kpi_avg', size: 13, h: 223 }, { k: 'k2', id: 'last5', size: 61, h: 50 }, { k: 'k3', id: 'top', size: 'x', h: 99999 }, { k: 'k4', id: 'low', size: 0.4, h: '1e3' }] });
  assert.equal(r.status, 200);
  const l = db().users.find(u => u.username === 'a.one').layouts.dash;
  assert.deepEqual(l.map(x => [x.size, x.h]), [[13, 223], [30, undefined], [30, 1400], [30, 1000]]);
});

test('a dashboard an admin arranged by hand keeps that mark (only a real true counts)', async () => {
  const a = await as('a.one');
  const r = await a.put('/api/layout', { page: 'dash', items: [{ k: 'k1', id: 'kpi_avg', size: 29, ar: true }, { k: 'k2', id: 'last5', size: 60, ar: 'yes' }, { k: 'k3', id: 'top', size: 30 }] });
  assert.equal(r.status, 200);
  assert.deepEqual(db().users.find(u => u.username === 'a.one').layouts.dash.map(x => [x.size, x.ar]), [[29, true], [60, undefined], [30, undefined]]);
});

test('everyone keeps their own table columns (short keys only, no doubles; null = the standard columns again)', async () => {
  const a = await as('a.two');
  let r = await a.put('/api/prefs', { cols: { page: 'calls', keys: ['id', 'ag', 'ag', 'sc', 'BAD', '<x>', 'res'] } });
  assert.equal(r.status, 200); assert.deepEqual(r.json.prefs.cols, { calls: ['id', 'ag', 'sc', 'res'] });
  r = await a.put('/api/prefs', { cols: { page: 'users', keys: ['n'] } });
  assert.deepEqual(r.json.prefs.cols, { calls: ['id', 'ag', 'sc', 'res'], users: ['n'] });
  r = await a.put('/api/prefs', { cols: { page: 'calls', keys: null } });
  assert.deepEqual(r.json.prefs.cols, { users: ['n'] });
  assert.equal((await a.put('/api/prefs', { cols: { page: '../x', keys: [] } })).status, 400);
  assert.equal((await a.put('/api/prefs', { cols: { page: 'calls', keys: 'id' } })).status, 400);
  assert.deepEqual(db().users.find(u => u.username === 'a.two').prefs.cols, { users: ['n'] });
});

test('library categories saved the old way (name kept in "n") are sent with their name', async () => {
  const d = db(); d.categories.push({ id: 'cat-old', n: 'Old style', k: false, it: [{ t: 'Said hello', p: 10, k: false }] }); fs.writeFileSync(DATA, JSON.stringify(d));
  const r = await (await as('q.qa')).get('/api/categories');
  assert.equal(r.status, 200); assert.equal(r.json.find(c => c.id === 'cat-old').name, 'Old style');
});

test('deleting a scorecard keeps the reviews made with it', async () => {
  const adm = await as('t.admin');
  assert.equal((await adm.del('/api/scorecards/' + SCID)).status, 200);
  const e = db().evaluations.find(x => x.rid === RID);
  assert.ok(e); assert.equal(e.scn, 'Two categories');
  assert.equal((await adm.del('/api/scorecards/sc-default')).status, 400, 'the last scorecard cannot be deleted');
});

test('a resolved dispute is closed: no new messages, no second dispute, and an agent cannot resolve it', async () => {
  const ag = await as('a.one'), qa = await as('q.qa');
  assert.equal((await ag.post('/api/evaluations/' + RID + '/dispute/resolve', { outcome: 'changed' })).status, 403);
  assert.equal((await ag.post('/api/evaluations/' + RID + '/dispute', { text: 'Please check item 2' })).status, 200);
  assert.equal(db().evaluations.find(e => e.rid === RID).st, 'disputed');
  assert.equal((await qa.post('/api/evaluations/' + RID + '/dispute/resolve', { outcome: 'changed', note: 'Re-scored' })).status, 200);
  assert.equal((await ag.post('/api/evaluations/' + RID + '/dispute/msg', { text: 'thanks' })).status, 400);
  assert.equal((await ag.post('/api/evaluations/' + RID + '/dispute', { text: 'again' })).status, 400);
  const e = db().evaluations.find(x => x.rid === RID);
  assert.equal(e.st, 'ok'); assert.equal(e.dp.res.outcome, 'changed');
});

// ---------------------------------------------------------------- tasks and coaching
test('a daily mission appears once a day for every agent of the team, however often the page is opened', async () => {
  const lead = await as('l.lead');
  const tpl = await lead.post('/api/task-templates', { title: 'Daily check', freq: 'daily', teams: ['t-a'], kind: 'checklist', checklist: ['Read the news'] });
  assert.equal(tpl.status, 200);
  await lead.get('/api/tasks'); await lead.get('/api/tasks'); await (await as('a.one')).get('/api/tasks');
  const cards = db().tasks.filter(t => t.tpl === tpl.json.id);
  assert.equal(cards.length, 1); assert.equal(cards[0].assignee, 'a.one');
});

test('action items of a coaching session become tasks once (saving again does not copy them)', async () => {
  const tr = await as('t.trainer');
  const s = await tr.post('/api/sessions', { kind: 'coaching', date: '2026-10-05', agents: ['a.one'], actions: [{ t: 'Listen to two calls', owner: 'a.one', due: '2026-10-12' }], makeTasks: true });
  assert.equal(s.status, 200); assert.ok(s.json.actions[0].taskId);
  await tr.put('/api/sessions/' + s.json.id, { ...s.json, makeTasks: true });
  assert.equal(db().tasks.filter(t => t.title === 'Listen to two calls').length, 1);
});

// ---------------------------------------------------------------- people, teams, registration
test('registration: the request waits for an admin; after approval the person signs in and must choose a password', async () => {
  // decision 12 (4 November): by invitation only, until an admin opens registration
  const closed = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.66.250.9' }, body: JSON.stringify({ firstName: 'No', lastName: 'Body', email: 'nobody@example.com' }) });
  assert.equal(closed.status, 403, 'closed by default');
  assert.equal((await (await as('t.admin')).put('/api/org', { signin: { openReg: true, pwMin: 10, lockAfter: 10 } })).status, 200);
  const reg = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.66.250.1' }, body: JSON.stringify({ firstName: 'Nina', lastName: "O'Neil", email: 'nina@test.com' }) });
  assert.equal(reg.status, 200);
  assert.equal((await as('n.oneil')).login.status, 403, 'pending');
  const adm = await as('t.admin'), req = (await adm.get('/api/registrations')).json.find(r => r.username === 'n.oneil');
  assert.ok(req && !req.hash, 'the request is listed without its password hash');
  assert.equal((await adm.post('/api/registrations/' + req.id + '/approve', { role: 'agent', team: 't-admin' })).status, 400, 'an agent needs a working team');
  assert.equal((await adm.post('/api/registrations/' + req.id + '/approve', { role: 'agent', team: 't-b' })).status, 200);
  const n = await as('n.oneil');
  assert.equal(n.login.status, 200); assert.equal(n.login.json.mustChange, true);
  assert.equal((await n.get('/api/evaluations')).status, 403);
  assert.equal((await n.post('/api/password/first', { next: 'Nina#Pass1' })).status, 200);
  assert.equal((await n.get('/api/evaluations')).status, 200);
  const again = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.66.250.2' }, body: JSON.stringify({ firstName: 'Nina', lastName: 'Other', email: 'NINA@test.com' }) });
  assert.equal(again.status, 409, 'the same e-mail cannot register twice');
});

test('team rules: a team with people, the Administration team and a team lead in use are protected', async () => {
  const adm = await as('t.admin');
  assert.equal((await adm.del('/api/teams/t-a')).status, 400);
  assert.equal((await adm.del('/api/teams/t-admin')).status, 400);
  assert.equal((await adm.put('/api/users/l.lead', { active: false })).status, 400, 'the lead of a team cannot be deactivated');
  assert.equal((await adm.put('/api/users/t.admin', { role: 'qa' })).status, 400, 'the last admin stays an admin');
  assert.equal((await adm.del('/api/users/t.admin')).status, 400, 'an admin cannot delete their own account');
  assert.ok(db().users.some(u => u.username === 't.admin' && u.role === 'admin'));
});

// ---------------------------------------------------------------- learning
test('a quiz reaches only the team it is for, without its answers, and is graded by the server', async () => {
  const tr = await as('t.trainer');
  const q = await tr.post('/api/quizzes', { title: 'Basics', status: 'published', pass: 50, assign: { teams: ['t-a'] }, questions: [{ q: 'Two plus two?', opts: ['3', '4'], a: 1, why: 'Arithmetic' }] });
  assert.equal(q.status, 200);
  const one = await as('a.one'), two = await as('a.two');
  const mine = (await one.get('/api/quizzes')).json.quizzes.find(x => x.id === q.json.id);
  assert.ok(mine); assert.equal(mine.questions[0].a, undefined, 'the right answer is not sent');
  assert.ok(!(await two.get('/api/quizzes')).json.quizzes.some(x => x.id === q.json.id));
  assert.equal((await two.post('/api/quizzes/' + q.json.id + '/attempt', { answers: [1] })).status, 404);
  const r = await one.post('/api/quizzes/' + q.json.id + '/attempt', { answers: [1] });
  assert.equal(r.json.score, 100); assert.equal(r.json.passed, true);
});

test('deleting a knowledge base folder moves its articles up; deleting with everything inside removes them and their read marks', async () => {
  const tr = await as('t.trainer'), ag = await as('a.one');
  const f = (await tr.post('/api/kb/folders', { name: 'Processes' })).json, sub = (await tr.post('/api/kb/folders', { name: 'Refunds', parent: f.id })).json;
  const a = (await tr.post('/api/kb/articles', { title: 'Refund steps', folder: sub.id, body: 'Step 1' })).json;
  await ag.post('/api/kb/read', { id: a.id });
  assert.equal((await tr.del('/api/kb/folders/' + sub.id)).status, 200);
  assert.equal(db().kbArticles.find(x => x.id === a.id).folder, f.id, 'moved up one level');
  assert.equal((await tr.del('/api/kb/folders/' + f.id + '?mode=cascade')).status, 200);
  assert.ok(!db().kbArticles.some(x => x.id === a.id));
  assert.equal((db().kbReads['a.one'] || {})[a.id], undefined, 'the read mark is gone too');
});

// ---------------------------------------------------------------- report engine: pass marks, date boundaries, empty periods
test('reports use each team\'s own pass mark (a score equal to the mark passes)', () => {
  const ev = [{ d: '2026-10-05T12:00:00Z', agent: 'x', tm: 't-a', sc: 90 }, { d: '2026-10-05T12:00:00Z', agent: 'y', tm: 't-b', sc: 90 }, { d: '2026-10-05T12:00:00Z', agent: 'z', tm: 't-b', sc: 85 }];
  const pass = t => ({ 't-a': 95 })[t] || 85;
  const res = RPT.run({ src: 'reviews', metrics: ['pass'], rows: 'team', period: { p: 'all' } }, { ev, users: [], teams: [{ id: 't-a', name: 'A' }, { id: 't-b', name: 'B' }], pass });
  assert.equal(res.rows.find(r => r.key === 'A').cells[0].pass, 0, '90 is below the 95 of team A');
  assert.equal(res.rows.find(r => r.key === 'B').cells[0].pass, 100, '90 and exactly 85 pass in team B');
});

test('a custom period includes its first and last day completely, and nothing outside', () => {
  const at = s => ({ d: new Date(s), agent: 'x', sc: 80 });
  const ev = [at('2026-10-01T00:00:00'), at('2026-10-31T23:59:59'), at('2026-09-30T23:59:59'), at('2026-11-01T00:00:00')];
  const res = RPT.run({ src: 'reviews', metrics: ['count'], period: { p: 'custom', f: '2026-10-01', t: '2026-10-31' } }, { ev, users: [], teams: [] });
  assert.equal(res.grand.count, 2);
});

test('an empty period shows "no data" (—), not 0%', () => {
  const res = RPT.run({ src: 'reviews', metrics: ['count', 'avg', 'pass'], period: { p: 'all' } }, { ev: [], users: [], teams: [] });
  assert.deepEqual([res.grand.count, res.grand.avg, res.grand.pass], [0, null, null]);
  assert.match(RPT.toHtml({ ...res, rows: [{ key: 'Total', cells: [res.grand] }] }, 'Empty'), /<td>—<\/td>/);
});
