// Starts the real server on a throw-away COPY of the seed data (your data.json is never touched) and checks the important rules through the API.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const { DATA } = require('../seed');

// a folder whose name starts with "." on purpose: the app often runs inside .claude\worktrees\..., and downloads must work there too
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), '.qsmart-test-')), FILE = path.join(DIR, 'data.json');
const PORT = 3300 + Math.floor(Math.random() * 600), BASE = 'http://localhost:' + PORT;
const hash = bcrypt.hashSync('password', 4);
const db0 = JSON.parse(JSON.stringify(DATA));
const staff = (username, role) => ({ username, name: 'Test ' + role, email: username + '@test.com', role, team: 't-admin', title: '', desc: '', languages: [], skills: [], phone: '', start: '', active: true, hash, mustChange: false });
db0.users.push(staff('t.admin', 'admin'), staff('t.qa', 'qa'), staff('t.qa2', 'qa'), staff('t.lead', 'lead'));
db0.workspaces.forEach(w => w.staff.push('t.qa', 't.qa2', 't.lead'));
const AGENT = db0.users.find(u => u.role === 'agent' && u.active !== false && db0.teams.some(t => t.id === u.team)).username;
db0.users.find(u => u.username === AGENT).hash = hash;
fs.writeFileSync(FILE, JSON.stringify(db0));
const readDb = () => JSON.parse(fs.readFileSync(FILE, 'utf8'));

let srv;
test.before(async () => {
  srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, DATA_FILE: FILE, AUDIT_FILE: path.join(DIR, 'audit.json'), RECORDINGS_DIR: path.join(DIR, 'rec'), BACKUPS_DIR: path.join(DIR, 'backups'), SMTP_HOST: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((ok, no) => { srv.stdout.on('data', d => /Running on/.test(d) && ok()); srv.on('exit', c => no(new Error('server exited ' + c))); setTimeout(() => no(new Error('server did not start')), 15000); });
});
test.after(() => { srv && srv.kill(); fs.rmSync(DIR, { recursive: true, force: true }); });

// a tiny browser: keeps its own sign-in cookie
const client = () => {
  let cookie = '';
  const call = async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, json, headers: r.headers, cookie };
  };
  return { call, get: u => call('GET', u), post: (u, b) => call('POST', u, b || {}), put: (u, b) => call('PUT', u, b || {}), login: (u, p = 'password') => call('POST', '/api/login', { username: u, password: p }), cookie: () => cookie };
};
// one signed-in session per person for the newer tests (the server allows 30 sign-ins per 15 minutes from one address)
const SIGNED = {}; const asU = u => SIGNED[u] = SIGNED[u] || (async () => { const c = client(); await c.login(u); return c; })();
const allYes = sc => sc.cats.map(c => c.it.map(() => ['y']));

test('basic browser protections are sent and the server type is hidden', async () => {
  const r = await client().get('/');
  assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(r.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.strictEqual(r.headers.get('x-powered-by'), null);
});

test('every sign-in gets a new session id', async () => {
  const c = client();
  assert.strictEqual((await c.login(AGENT)).status, 200); const first = c.cookie();
  assert.strictEqual((await c.login(AGENT)).status, 200);
  assert.notStrictEqual(c.cookie(), first);
});

test('wrong password is refused', async () => {
  assert.strictEqual((await client().login(AGENT, 'nope')).status, 401);
});

test('QA creates a review: the server calculates the score, the agent only sees their own reviews', async () => {
  const qa = client(), ag = client(); await qa.login('t.qa'); await ag.login(AGENT);
  const sc = (await qa.get('/api/scorecards')).json[0];
  const a = allYes(sc); a[0][0] = ['n', 'missed', 'Knowledge gap'];
  const r = await qa.post('/api/evaluations', { scid: sc.id, agent: AGENT, id: 'T-1001', dt: '2026-10-01', a, sc: 100 });
  assert.strictEqual(r.status, 200);
  const lost = sc.cats[0].it[0].p, total = sc.cats.reduce((s, c) => s + c.it.reduce((x, i) => x + i.p, 0), 0);
  assert.strictEqual(r.json.sc, Math.round((total - lost) / total * 1000) / 10, 'the score sent by the browser is ignored');
  assert.strictEqual((await qa.post('/api/evaluations', { scid: sc.id, agent: AGENT, id: 'T-1002', dt: '2026-10-01', a: [[['y']]] })).status, 400);
  assert.strictEqual((await ag.post('/api/evaluations', { scid: sc.id, agent: AGENT, id: 'T-1003', dt: '2026-10-01', a: allYes(sc) })).status, 403);
  const mine = (await ag.get('/api/evaluations')).json;
  assert.ok(mine.length > 0 && mine.every(e => e.agent === AGENT));
  assert.ok(mine.some(e => e.rid === r.json.rid));
});

test('decision 14: a review with an unanswered question is refused; one where everything is N/A is saved as "not scored" and is in no average', async () => {
  const qa = client(); await qa.login('t.qa');
  const sc = (await qa.get('/api/scorecards')).json[0], a = allYes(sc); a[0][0] = [];
  const r1 = await qa.post('/api/evaluations', { scid: sc.id, agent: AGENT, id: 'T-1401', dt: '2026-10-02', a });
  assert.strictEqual(r1.status, 400); assert.match(r1.json.error, /Answer every question/);
  const before = readDb().evaluations.filter(e => !e.ns && e.agent === AGENT).length;
  const na = sc.cats.map(c => c.it.map(() => ['na']));
  const r = await qa.post('/api/evaluations', { scid: sc.id, agent: AGENT, id: 'T-1402', dt: '2026-10-02', a: na });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.json.sc, null); assert.strictEqual(r.json.ns, true);
  const saved = readDb(); assert.strictEqual(saved.evaluations.filter(e => !e.ns && e.agent === AGENT).length, before, 'not counted with the scored reviews');
  assert.ok(saved.notifications.some(n => n.to === AGENT && n.text === 'You received a new review for Lead #T-1402 (not scored)'), 'the agent is told it is not scored');
  const upd = await qa.put('/api/evaluations/' + r.json.rid, { a: allYes(sc) });
  assert.strictEqual(upd.status, 200); assert.strictEqual(upd.json.sc, 100); assert.strictEqual(upd.json.ns, undefined, 'answered again: scored');
  assert.strictEqual((await qa.call('DELETE', '/api/evaluations/' + r.json.rid)).status, 200);
});

test('decision 7: a person has their own time zone; an unknown one is not saved', async () => {
  const ad = client(); await ad.login('t.admin');
  const u = (await ad.get('/api/users')).json.find(x => x.username === AGENT);
  assert.strictEqual((await ad.put('/api/users/' + AGENT, { ...u, tz: 'America/New_York' })).status, 200);
  assert.strictEqual(readDb().users.find(x => x.username === AGENT).tz, 'America/New_York');
  await ad.put('/api/users/' + AGENT, { ...u, tz: 'Mars/Base' });
  assert.strictEqual(readDb().users.find(x => x.username === AGENT).tz, '', 'unknown zone: the company time zone applies');
});

test('a task that needs review waits in In review; the one who checks it sends it back with a comment or approves it', async () => {
  const qa = await asU('t.qa'), ag = await asU(AGENT);
  const [t] = (await qa.post('/api/tasks', { title: 'Call summary', rev: true, assignees: [AGENT], due: '2026-12-01' })).json;
  assert.strictEqual(t.rev, true);
  assert.strictEqual((await ag.put('/api/tasks/' + t.id, { status: 'doing' })).json.status, 'doing');
  assert.strictEqual((await ag.put('/api/tasks/' + t.id, { status: 'done' })).json.status, 'review', 'the person\'s "done" waits for a check');
  const back = (await qa.put('/api/tasks/' + t.id, { status: 'doing', note: 'Add the names' })).json;
  assert.strictEqual(back.status, 'doing');
  assert.deepEqual(back.log.map(x => x.a), ['created', 'doing', 'review', 'returned']);
  assert.strictEqual(back.log[3].note, 'Add the names');
  await ag.put('/api/tasks/' + t.id, { status: 'done' });
  const ok = (await qa.put('/api/tasks/' + t.id, { status: 'done' })).json;
  assert.strictEqual(ok.status, 'done'); assert.ok(ok.completed); assert.strictEqual(ok.log.at(-1).a, 'approved');
  const [plain] = (await qa.post('/api/tasks', { title: 'Quick one', assignees: [AGENT] })).json;
  assert.strictEqual((await ag.put('/api/tasks/' + plain.id, { status: 'done' })).json.status, 'done', 'without review it goes straight to Done');
});

test('a sequence gives every step with its own dates; steps without a title are dropped', async () => {
  const qa = await asU('t.qa');
  const s = (await qa.post('/api/task-seqs', { name: 'First weeks', steps: [{ title: 'Read the guide', day: 0, days: 2 }, { title: '', day: 1 }, { title: 'First solo review', day: 7, days: 3, rev: true }] })).json;
  assert.strictEqual(s.steps.length, 2);
  const g = await qa.post('/api/task-seqs/' + s.id + '/give', { start: '2026-11-02', users: [AGENT] });
  assert.strictEqual(g.status, 200); assert.strictEqual(g.json.tasks, 2);
  const l = readDb().tasks.filter(t => t.run === g.json.run.id).map(t => [t.title, t.start, t.due, t.step, !!t.rev]);
  assert.deepEqual(l, [['Read the guide', '2026-11-02', '2026-11-03', 1, false], ['First solo review', '2026-11-09', '2026-11-11', 2, true]]);
  assert.strictEqual((await qa.post('/api/task-seqs/' + s.id + '/give', { start: 'soon', users: [AGENT] })).status, 400);
});

test('practice scenarios: trainers and admins add their own and switch built-in ones off; agents only see the list', async () => {
  const adm = await asU('t.admin'), ag = await asU(AGENT);
  assert.strictEqual((await ag.get('/api/ai/scenarios')).status, 403);
  assert.strictEqual((await ag.post('/api/ai/scenarios', { name: 'x', open: 'y' })).status, 403);
  assert.strictEqual((await adm.post('/api/ai/scenarios', { name: 'Refund' })).status, 400, 'the first sentence of the customer is needed');
  const s = (await adm.post('/api/ai/scenarios', { name: 'Refund', who: 'Upset customer', open: 'I want my money back.' })).json;
  assert.strictEqual((await adm.put('/api/ai/scenarios/price', { off: true })).status, 200);
  const names = (await ag.get('/api/ai/roleplay')).json.scenarios.map(x => x.name);
  assert.ok(names.includes('Refund') && !names.includes('Price objection'));
  await adm.put('/api/ai/scenarios/price', { off: false }); await adm.call('DELETE', '/api/ai/scenarios/' + s.id);
  assert.ok((await ag.get('/api/ai/roleplay')).json.scenarios.some(x => x.name === 'Price objection'));
});

test('one-to-ones: a template per team, sent to the agent to sign, and a monthly target only admins set', async () => {
  const qa = await asU('t.qa'), ag = await asU(AGENT), adm = await asU('t.admin');
  assert.strictEqual((await qa.post('/api/o2o-templates', { name: 'Monthly', sections: [] })).status, 400, 'a template needs a section');
  const tpl = (await qa.post('/api/o2o-templates', { name: 'Monthly', teams: ['t-b2c'], sections: [{ id: 's1', t: 'yesno', title: 'Strengths', items: ['Communication'] }, { id: 's2', t: 'bogus', title: 'Notes' }] })).json;
  assert.deepEqual(tpl.sections.map(x => x.t), ['yesno', 'text'], 'an unknown section type becomes free text');
  const draft = (await qa.post('/api/sessions', { kind: 'o2o', date: '2026-10-20', agents: [AGENT], tpl: tpl.id, status: 'planned', state: 'draft', ans: { s1: { 0: 'y' } } })).json;
  assert.strictEqual(draft.state, 'draft'); assert.ok(!draft.tl, 'a draft is not signed');
  const sent = (await qa.put('/api/sessions/' + draft.id, { status: 'done', state: 'sent' })).json;
  assert.strictEqual(sent.state, 'sent'); assert.ok(sent.tl && sent.sentAt); assert.deepEqual(sent.ans, { s1: { 0: 'y' } });
  assert.strictEqual((await ag.post('/api/sessions/' + draft.id + '/sign', { cm: 'ok' })).json.state, 'signed');
  assert.strictEqual((await qa.put('/api/o2o-target', { target: 2 })).status, 403);
  const set = (await adm.put('/api/o2o-target', { target: 0, teams: { 't-b2c': 3, 'no-such-team': 5 } })).json;
  assert.deepEqual(set.o2o, { target: 1, teams: { 't-b2c': 3 } });
});

test('calibration is blind: a participant sees the others\' scores only after giving their own; a dispute can end "partly changed"', async () => {
  const qa = await asU('t.qa'), qa2 = await asU('t.qa2'), adm = await asU('t.admin');
  const rid = readDb().evaluations[0].rid;
  const c = (await qa.post('/api/calibrations', { date: '2026-10-20', participants: ['t.qa2'], reviews: [rid] })).json;
  assert.strictEqual((await qa.put('/api/calibrations/' + c.id, { score: { rid, sc: 140 } })).status, 400);
  await qa.put('/api/calibrations/' + c.id, { score: { rid, sc: 80, note: 'missed the closing' } });
  let mine = (await qa2.get('/api/calibrations')).json.find(x => x.id === c.id);
  assert.deepEqual(Object.keys(mine.scores[rid]).filter(k => mine.scores[rid][k]), ['_n'], 'before scoring, t.qa2 only sees how many scored');
  await qa2.put('/api/calibrations/' + c.id, { score: { rid, sc: 90 } });
  mine = (await qa2.get('/api/calibrations')).json.find(x => x.id === c.id);
  assert.deepEqual([mine.scores[rid]['t.qa'].sc, mine.scores[rid]['t.qa2'].sc], [80, 90]);
  assert.strictEqual((await qa.put('/api/calibrations/' + c.id, { base: { rid, who: 't.qa2' } })).json.base[rid], 't.qa2');
  const ag = await asU(AGENT), sc = (await qa.get('/api/scorecards')).json[0];
  const ev = (await qa.post('/api/evaluations', { scid: sc.id, agent: AGENT, id: 'T-2001', dt: '2026-10-01', a: allYes(sc) })).json;
  await ag.post('/api/evaluations/' + ev.rid + '/dispute', { text: 'I do not agree' });
  const r = (await adm.post('/api/evaluations/' + ev.rid + '/dispute/resolve', { outcome: 'partly' })).json;
  assert.strictEqual(r.dp.res.outcome, 'partly');
});

test('organization: only admins change it; old notifications are deleted after the chosen months; a person\'s data downloads in one file', async () => {
  const adm = await asU('t.admin'), qa = await asU('t.qa');
  assert.strictEqual((await qa.put('/api/org', { org: { name: 'X' } })).status, 403);
  const s = (await adm.put('/api/org', { org: { name: 'Acme', vat: 'BG123', logo: 'javascript:alert(1)' }, signin: { pwMin: 3, lockAfter: 99 }, privacy: { keep: { notif: 1, rec: 'x' } } })).json;
  assert.deepEqual([s.org.name, s.org.logo, s.signin.pwMin, s.signin.lockAfter, s.privacy.keep.notif, s.privacy.keep.rec], ['Acme', '', 8, 20, 1, 0]);
  const db = readDb(); db.notifications.push({ id: 'old1', u: AGENT, t: 'x', text: 'old', at: '2020-01-01T00:00:00.000Z' }, { id: 'new1', u: AGENT, t: 'x', text: 'new', at: new Date().toISOString() }); fs.writeFileSync(FILE, JSON.stringify(db));
  const out = (await adm.post('/api/org/purge')).json;
  assert.ok(out.notif >= 1); const ids = readDb().notifications.map(n => n.id); assert.ok(!ids.includes('old1') && ids.includes('new1'));
  const p = await adm.get('/api/org/person/' + AGENT); assert.strictEqual(p.status, 200);
  assert.strictEqual(p.json.person.username, AGENT); assert.ok(!('hash' in p.json.person)); assert.ok(Array.isArray(p.json.reviews));
  assert.strictEqual((await qa.get('/api/org/person/' + AGENT)).status, 403);
  await adm.put('/api/org', { signin: { pwMin: 8, lockAfter: 10 }, privacy: { keep: {} } });
});

test('transcripts: after the chosen days only the text is deleted; the review, its scores, the comments and the dialer link stay', async () => {
  const adm = await asU('t.admin');
  assert.strictEqual((await adm.put('/api/org', { privacy: { keep: {}, txDays: 13 } })).json.privacy.txDays, 0, 'only the offered choices');
  assert.strictEqual((await adm.put('/api/org', { privacy: { keep: {}, txDays: 30 } })).json.privacy.txDays, 30);
  const db = readDb(), old = new Date(Date.now() - 40 * 864e5).toISOString(), fresh = new Date().toISOString(), base = db.evaluations.find(x => x.agent === AGENT);
  db.evaluations.push({ ...base, rid: 'rtx-old', id: 'TX-1', ch: 'chat', tx: 'Agent: hello', cl: 'https://dialer.example.com/c/1', at: old, d: old }, { ...base, rid: 'rtx-new', id: 'TX-2', ch: 'chat', tx: 'Agent: hi', at: fresh, d: fresh });
  fs.writeFileSync(FILE, JSON.stringify(db));
  const out = (await adm.post('/api/org/purge')).json; assert.ok(out.tx >= 1);
  const after = readDb().evaluations, o = after.find(x => x.rid === 'rtx-old'), n = after.find(x => x.rid === 'rtx-new');
  assert.deepEqual([o.tx, !!o.txGone, o.cl, o.sc, o.cs.length > 0], ['', true, 'https://dialer.example.com/c/1', base.sc, true], 'only the text goes');
  assert.strictEqual(n.tx, 'Agent: hi', 'a newer transcript stays');
  const clean = readDb(); clean.evaluations = clean.evaluations.filter(x => !x.rid.startsWith('rtx-')); fs.writeFileSync(FILE, JSON.stringify(clean));
  await adm.put('/api/org', { privacy: { keep: {}, txDays: 0 } });
});

test('data protection works: agents can be kept from recordings and reviewer names, the sign-in page shows the privacy note, transcripts get the custom vocabulary', async () => {
  const adm = await asU('t.admin'), qa = await asU('t.qa'), ag = await asU(AGENT);
  const db = readDb(), e = db.evaluations.find(x => x.agent === AGENT); e.rec = 'old-rec.mp3'; e.rl = 'https://example.com/rec'; fs.writeFileSync(FILE, JSON.stringify(db));
  await adm.put('/api/org', { privacy: { keep: {}, agentsRec: false, agentsReviewer: false, note: 'We keep calls 6 months.' }, words: { types: [], topics: [], vocab: [{ term: 'AcmeBank', wrong: ['Acme Bank'] }] } });
  const mine = (await ag.get('/api/evaluations')).json.find(x => x.rid === e.rid);
  assert.ok(mine && !('rec' in mine) && !('rl' in mine) && !('rv' in mine) && !('by' in mine), 'the agent gets no recording and no reviewer');
  assert.strictEqual((await ag.get('/api/recordings/old-rec.mp3')).status, 403);
  const staffView = (await qa.get('/api/evaluations')).json.find(x => x.rid === e.rid); assert.ok('rec' in staffView && 'rv' in staffView, 'staff still see everything');
  const n = await fetch(BASE + '/api/notice').then(r => r.json()); assert.strictEqual(n.note, 'We keep calls 6 months.');
  const conv = (await qa.post('/api/autoqa/conversations', { agent: AGENT, date: '2026-10-20', text: 'Agent: Welcome to Acme Bank, how can I help?' })).json;
  assert.strictEqual(conv.text, 'Agent: Welcome to AcmeBank, how can I help?');
  await adm.put('/api/org', { privacy: { keep: {} }, words: { types: [], topics: [], vocab: [] } });
  assert.ok('rv' in (await ag.get('/api/evaluations')).json.find(x => x.rid === e.rid), 'switched back on: the agent sees the reviewer again');
});

test('a new review keeps when it was made and how long QA Entry took (at most 4 hours)', async () => {
  const qa = await asU('t.qa');
  const sc = (await qa.get('/api/scorecards')).json[0], t0 = Date.now();
  const r = await qa.post('/api/evaluations', { scid: sc.id, agent: AGENT, id: 'T-1004', dt: '2026-09-01', a: allYes(sc), rt: 312.4 });
  assert.strictEqual(r.status, 200);
  const e = readDb().evaluations.find(x => x.rid === r.json.rid);
  assert.ok(Date.parse(e.at) >= t0 - 1000, 'the review date is today, not the conversation date');
  assert.strictEqual(e.rt, 312);
  const long = await qa.post('/api/evaluations', { scid: sc.id, agent: AGENT, id: 'T-1005', dt: '2026-09-01', a: allYes(sc), rt: 99999 });
  assert.strictEqual(readDb().evaluations.find(x => x.rid === long.json.rid).rt, 4 * 3600);
  const none = await qa.post('/api/evaluations', { scid: sc.id, agent: AGENT, id: 'T-1006', dt: '2026-09-01', a: allYes(sc), rt: 'abc' });
  assert.ok(!('rt' in readDb().evaluations.find(x => x.rid === none.json.rid)));
});

test('quick flags keep their CRM and recording links (regression)', async () => {
  const lead = client(); await lead.login('t.lead');
  const r = await lead.post('/api/qflags', { agent: AGENT, lead: 'T-2001', date: '2026-10-02', type: 'red', lk: 'https://crm.example.com/lead/1', rl: 'https://rec.example.com/1', cm: 'test' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.lk, 'https://crm.example.com/lead/1');
  assert.strictEqual(r.json.rl, 'https://rec.example.com/1');
  assert.strictEqual((await lead.post('/api/qflags', { agent: AGENT, lead: 'T-2002', date: '2026-10-02', lk: 'javascript:alert(1)' })).json.lk, '');
  assert.strictEqual(readDb().qflags.find(f => f.id === r.json.id).lk, 'https://crm.example.com/lead/1');
});

test('a deactivated user is signed out at once, not at the next login', async () => {
  const adm = await asU('t.admin'), ag = await asU(AGENT);
  assert.strictEqual((await ag.get('/api/evaluations')).status, 200);
  assert.strictEqual((await adm.put('/api/users/' + AGENT, { active: false })).status, 200);
  assert.strictEqual((await ag.get('/api/evaluations')).status, 401);
  assert.strictEqual((await ag.get('/api/me')).status, 401);
  await adm.put('/api/users/' + AGENT, { active: true });
});

test('a changed role takes effect at once', async () => {
  const adm = client(), qa = client(); await adm.login('t.admin'); await qa.login('t.qa2');
  assert.strictEqual((await qa.get('/api/calibrations')).status, 200);
  assert.strictEqual((await qa.post('/api/evaluations', {})).status, 400, 'QA may create reviews (400 = form incomplete)');
  assert.strictEqual((await adm.put('/api/users/t.qa2', { role: 'trainer' })).status, 200);
  assert.strictEqual((await qa.post('/api/evaluations', {})).status, 403, 'a trainer may not');
  assert.strictEqual((await qa.get('/api/me')).json.role, 'trainer');
});

// (until October 2026 the open session itself could choose the new password; that session may be the reason for the reset, so it now ends)
test('a password reset by the admin signs the person out everywhere, and the new password pop-up comes at the next sign-in', async () => {
  const adm = client(), ld = client(); await adm.login('t.admin'); await ld.login('t.lead');
  assert.strictEqual((await adm.post('/api/users/t.lead/reset')).status, 200);
  assert.strictEqual((await ld.get('/api/tasks')).status, 401, 'the session that was open is ended');
  assert.strictEqual((await ld.post('/api/password/first', { next: 'Lead#Pass9' })).status, 401, 'and cannot choose the new password');
  const again = client(); await again.login('t.lead');                                        // with the temporary password
  const r = await again.get('/api/tasks');
  assert.strictEqual(r.status, 403); assert.strictEqual(r.json.mustChange, true);
  const fresh = 'Lead#Pass9'; assert.strictEqual((await again.post('/api/password/first', { next: fresh })).status, 200);
  assert.strictEqual((await again.get('/api/tasks')).status, 200);
});

test('a saved Excel export can only be opened again by the person who made it (or an admin)', async () => {
  const qa = client(), adm = client(); await qa.login('t.qa'); await adm.login('t.admin');
  const rows = [['Lead', 'Date', 'Score'], ['L1', '2026-10-01', 90]];
  const x = await qa.call('POST', '/api/export/call-reviews', { rows, pf: 2, pt: 2, name: 'Mine' });
  assert.strictEqual(x.status, 200);
  const id = readDb().exports.find(e => e.by === 't.qa').id;
  assert.strictEqual((await qa.get('/api/exports/' + id)).status, 200);
  assert.strictEqual((await adm.get('/api/exports/' + id)).status, 200);
  const qa3 = client(); await qa3.login('t.qa2');   // t.qa2 is a trainer now (previous test) - still staff, but not the owner
  assert.strictEqual((await qa3.get('/api/exports/' + id)).status, 404);
});

// a real (tiny) Word file with two "Heading 1" paragraphs
async function wordFile() {
  const JSZip = require('jszip'), W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', R = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const p = (t, h) => `<w:p>${h ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' : ''}<w:r><w:t>${t}</w:t></w:r></w:p>`, z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file('_rels/.rels', `<?xml version="1.0"?><Relationships xmlns="${R}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  z.file('word/_rels/document.xml.rels', `<?xml version="1.0"?><Relationships xmlns="${R}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  z.file('word/styles.xml', `<?xml version="1.0"?><w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`);
  z.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body>${p('Refund policy', 1)}${p('Refunds within 14 days.')}${p('Escalation steps', 1)}${p('Escalate &amp; inform the lead.')}</w:body></w:document>`);
  return (await z.generateAsync({ type: 'nodebuffer' })).toString('base64');
}

test('importing a Word file (without the AI) splits it into articles at its headings', async () => {
  const qa = client(); await qa.login('t.qa');
  const r = await qa.post('/api/kb/import', { fileB64: await wordFile(), filename: 'policy.docx' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.json.articles.map(a => a.title), ['Refund policy', 'Escalation steps']);
  assert.strictEqual(r.json.articles[1].body, 'Escalate & inform the lead.');
});

test('importing an HTML page drops its scripts and splits it at its headings', async () => {
  const qa = client(); await qa.login('t.qa');
  const html = '<h1>Hold</h1><p>Max 2 minutes &amp;lt;b&amp;gt;</p><script>alert(1)</script><h2>Transfers</h2><p>Warm only.</p>';
  const r = await qa.post('/api/kb/import', { fileB64: Buffer.from(html).toString('base64'), filename: 'page.html' });
  assert.deepStrictEqual(r.json.articles.map(a => a.title), ['Hold', 'Transfers']);
  assert.ok(!JSON.stringify(r.json).includes('alert(1)'));
  assert.strictEqual(r.json.articles[0].body, 'Max 2 minutes &lt;b&gt;', 'encoded text is decoded only once');
});

test('survey answers (CSAT) need a date and a whole score from 1 to 5, also when imported in bulk', async () => {
  const qa = client(); await qa.login('t.qa');
  const ok = { date: '2026-10-20', agent: AGENT, score: 4, comment: 'fine' };
  assert.strictEqual((await qa.post('/api/c/surveys', ok)).status, 200);
  for (const wrong of [{ ...ok, score: 9 }, { ...ok, score: 0 }, { ...ok, score: 2.5 }, { ...ok, score: '5' }, { ...ok, date: '' }])
    assert.strictEqual((await qa.post('/api/c/surveys', wrong)).status, 400, JSON.stringify(wrong));
  const n = readDb().surveys.length;
  assert.strictEqual((await qa.post('/api/c/surveys', { bulk: [ok, { ...ok, score: 7 }] })).status, 400, 'one wrong line stops the whole import');
  assert.strictEqual(readDb().surveys.length, n, 'nothing was half-imported');
  const id = readDb().surveys[0].id;
  assert.strictEqual((await qa.put('/api/c/surveys/' + id, { score: 6 })).status, 400);
  assert.strictEqual((await qa.put('/api/c/surveys/' + id, { score: 3 })).status, 200);
});

test('restoring an uploaded backup works (regression: it always answered "not found") and keeps a safety copy', async () => {
  const adm = client(); await adm.login('t.admin');
  assert.strictEqual((await adm.post('/api/backups/upload/restore', { data: { users: [{ username: 'x', role: 'agent' }], evaluations: [] } })).status, 400, 'a file without an admin is refused');
  const before = readDb(), copy = JSON.parse(JSON.stringify(before));
  copy.settings = { ...copy.settings, pass: 77 };
  const r = await adm.post('/api/backups/upload/restore', { data: copy });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(readDb().settings.pass, 77, 'the uploaded data is now the data');
  assert.ok(fs.existsSync(path.join(DIR, 'backups', r.json.safety)), 'the data from before the restore was backed up');
  assert.strictEqual((await adm.get('/api/settings')).json.pass, 77);
  assert.strictEqual((await adm.post('/api/backups/upload/restore', { data: before })).status, 200);   // put it back for the next tests
});

test('the admin can download the current data and a saved backup (also when the app runs inside a "." folder)', async () => {
  const adm = client(); await adm.login('t.admin');
  const cur = await adm.get('/api/backups/current/download');
  assert.strictEqual(cur.status, 200); assert.ok(Array.isArray(cur.json.users));
  const made = await adm.post('/api/backups', { label: 'test' }); assert.strictEqual(made.status, 200);
  const one = await adm.get('/api/backups/' + made.json.f);
  assert.strictEqual(one.status, 200); assert.ok(Array.isArray(one.json.evaluations));
});

test('errors never show technical details (file paths) to the browser', async () => {
  const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken json' });
  const t = await r.text();
  assert.strictEqual(r.status, 400);
  assert.ok(!/node_modules|[A-Z]:\\|at \w+ \(/.test(t), 'no stack trace in: ' + t.slice(0, 120));
});

test('the database file is always complete JSON and no temporary file is left behind', () => {
  assert.doesNotThrow(() => readDb());
  assert.ok(!fs.existsSync(FILE + '.tmp'));
});
