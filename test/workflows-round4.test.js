// Round 4: the routines and server actions that had no functional test yet (BAU_SCENARIOS.md "—" steps and the routes the role
// matrix alone called): a review seen by its agent, notifications, pass rates, newsletters, reading a folder, saving imported
// articles, quiz drafts by the AI, workspaces, root causes, Auto QA categories and a rules run, goals, notification rules,
// repeating tasks. Made-up people (test/fixture-round4.js) on a temporary copy; the AI is the fake one.
const test = require('node:test'), assert = require('node:assert/strict');
const { startApp, client } = require('./fixture-round4');
const fakeAi = require('./fake-ai');

let app, fake;
const day = () => new Date().toISOString().slice(0, 10);
test.before(async () => { fake = await fakeAi.start(0); app = await startApp({ env: { ANTHROPIC_BASE_URL: fake.url } }); });
test.after(() => { if (app) app.stop(); if (fake) fake.srv.close(); });
const notes = un => app.db().notifications.filter(n => n.to === un);

test('a new review: unseen until its agent opens it; nobody else can mark it seen', async () => {
  const q = await client(app.base, 'f.qa1'), sc = (await q.get('/api/scorecards')).json[0];
  const r = await q.post('/api/evaluations', { scid: sc.id, agent: 'f.b2', id: 'SEEN-1', dt: day(), ch: 'call', a: sc.cats.map(c => c.it.map(() => ['y', '', ''])) });
  assert.equal(r.status, 200); assert.ok(!app.db().evaluations.find(e => e.rid === r.json.rid).seen);
  assert.equal((await (await client(app.base, 'f.b1')).post('/api/evaluations/' + r.json.rid + '/seen')).status, 404, 'another agent');
  const s = await (await client(app.base, 'f.b2')).post('/api/evaluations/' + r.json.rid + '/seen');
  assert.equal(s.status, 200); assert.ok(app.db().evaluations.find(e => e.rid === r.json.rid).seen, 'seen is saved');
});
test('notifications: "mark all as read" marks only my own', async () => {
  const b2 = await client(app.base, 'f.b2');
  assert.ok(notes('f.b2').some(n => !n.read), 'f.b2 has an unread notification (the new review)');
  const othersBefore = app.db().notifications.filter(n => n.to !== 'f.b2' && !n.read).length;
  assert.equal((await b2.post('/api/notifications/read')).status, 200);
  assert.ok(notes('f.b2').every(n => n.read));
  assert.equal(app.db().notifications.filter(n => n.to !== 'f.b2' && !n.read).length, othersBefore, 'nobody else\'s');
});
test('pass rates: the admin sets the general and a team target; wrong values are refused', async () => {
  const a = await client(app.base, 'f.admin');
  assert.equal((await a.put('/api/settings', { pass: 0 })).status, 400);
  assert.equal((await a.put('/api/settings', { pass: 101 })).status, 400);
  assert.equal((await a.put('/api/settings', { pass: 80, teams: { 't-b2b': 90 } })).status, 200);
  const s = app.db().settings; assert.equal(s.pass, 80); assert.equal(Number(s.teams['t-b2b']), 90);
  assert.equal((await (await client(app.base, 'f.qa1')).put('/api/settings', { pass: 50 })).status, 403);
});
test('newsletters: a draft tells nobody; publishing tells everybody except the author; changes and deleting', async () => {
  const t = await client(app.base, 'f.tr1');
  assert.equal((await t.post('/api/kb/newsletters', { title: '' })).status, 400);
  const n = await t.post('/api/kb/newsletters', { title: 'October news', intro: 'Hello', items: [{ title: 'Tip', text: 'Smile' }] });
  assert.equal(n.status, 200); assert.ok(!app.db().notifications.some(x => x.news === n.json.id), 'a draft tells nobody');
  assert.equal((await t.put('/api/kb/newsletters/' + n.json.id, { title: 'October news', published: true })).status, 200);
  const told = app.db().notifications.filter(x => x.news === n.json.id).map(x => x.to);
  assert.ok(told.includes('f.b1') && told.includes('w.a1') && !told.includes('f.tr1'), 'everybody but the author (organisation-wide, R-6)');
  assert.equal((await (await client(app.base, 'f.b1')).post('/api/kb/newsletters', { title: 'x' })).status, 403, 'agents cannot write');
  assert.equal((await t.del('/api/kb/newsletters/' + n.json.id)).status, 200); assert.ok(!app.db().newsletters.some(x => x.id === n.json.id));
});
test('knowledge base: imported articles are saved in their folder path; "read the whole folder" marks every article in it', async () => {
  const t = await client(app.base, 'f.tr1');
  const s = await t.post('/api/kb/import/save', { articles: [{ title: 'Greeting', folder: 'Calls/Opening', body: '## Hi' }, { title: '', folder: 'Calls/Opening', body: 'Text' }] });
  assert.equal(s.status, 200); assert.equal(s.json.created, 2);
  const db = app.db(), arts = db.kbArticles.filter(x => s.json.ids.includes(x.id));
  assert.deepEqual(arts.map(x => x.title), ['Greeting', 'Untitled']);
  const folder = arts[0].folder; assert.ok(folder && arts[1].folder === folder, 'both in the same folder');
  const top = db.kbFolders.find(f => f.id === folder).parent;
  const ag = await client(app.base, 'f.c1');
  assert.equal((await ag.post('/api/kb/read-folder', { id: top || folder })).status, 200);
  const reads = app.db().kbReads['f.c1'] || {}; assert.ok(s.json.ids.every(id => reads[id]), 'every article inside, also in sub-folders');
  assert.equal((await ag.post('/api/kb/read-folder', { id: 'nope' })).status, 404);
});
test('quiz drafts by the AI: from chosen articles; a clear message without articles or without the AI', async () => {
  const a = await client(app.base, 'f.admin'), t = await client(app.base, 'f.tr1');
  const art = app.db().kbArticles.find(x => x.title === 'Greeting');
  assert.equal((await t.post('/api/ai/quiz', { articleIds: [art.id] })).status, 400, 'no AI key yet');
  assert.equal((await a.put('/api/ai/settings', { anthropicKey: 'sk-ant-fake-round4-key-0123456789' })).status, 200);
  assert.equal((await t.get('/api/ai/status')).json.enabled, true);
  assert.equal((await t.post('/api/ai/quiz', { articleIds: [] })).status, 400);
  const q = await t.post('/api/ai/quiz', { articleIds: [art.id], count: 3 });
  assert.equal(q.status, 200, q.text); assert.equal(q.json.questions.length, 3);
  assert.match(fake.state.log[fake.state.log.length - 1].text, /# Greeting/, 'the article went to the AI');
});
test('workspaces: name required, admin teams and unknown teams are dropped, people see only their own', async () => {
  const a = await client(app.base, 'f.admin');
  assert.equal((await a.post('/api/workspaces', { name: '' })).status, 400);
  const w = await a.post('/api/workspaces', { name: 'Three', teams: ['t-admin', 't-nope', 't-b2c'], staff: ['f.qa2', 'f.b1', 'f.admin'], color: 'red' });
  assert.equal(w.status, 200); assert.deepEqual([w.json.teams, w.json.staff, w.json.color], [['t-b2c'], ['f.qa2'], '#2563eb']);
  assert.ok((await (await client(app.base, 'f.qa2')).get('/api/workspaces')).json.some(x => x.id === w.json.id));
  assert.ok(!(await (await client(app.base, 'w.qa')).get('/api/workspaces')).json.some(x => x.id === w.json.id));
  assert.equal((await a.put('/api/workspaces/' + w.json.id, { name: 'Three bis', teams: [] })).json.name, 'Three bis');
  assert.equal((await a.del('/api/workspaces/' + w.json.id)).status, 200);
  assert.equal((await a.del('/api/workspaces/zz')).status, 404);
});
test('root causes: QA and admins keep the list; the same name twice is refused', async () => {
  const q = await client(app.base, 'f.qa1');
  const r = await q.post('/api/root-causes', { name: 'No script' }); assert.equal(r.status, 200);
  assert.equal((await q.post('/api/root-causes', { name: 'no SCRIPT' })).status, 400);
  assert.equal((await q.put('/api/root-causes/' + r.json.id, { name: 'No script used', active: false })).json.active, false);
  assert.equal((await (await client(app.base, 'f.lead1')).post('/api/root-causes', { name: 'x' })).status, 403);
  assert.equal((await q.del('/api/root-causes/' + r.json.id)).status, 200); assert.ok(!app.db().rootCauses.some(x => x.id === r.json.id));
});
test('Auto QA: a category with its words, then a rules run rates only the conversations the person sees', async () => {
  const a = await client(app.base, 'f.admin');
  const c = await a.post('/api/auto-cats', { name: 'Empathy', pos: ['thanks', 'i understand'], neg: ['not my problem'], weight: 50 });
  assert.equal(c.status, 200); assert.equal(c.json.weight, 10, 'the weight is kept between 0.1 and 10');
  assert.equal((await a.put('/api/auto-cats/' + c.json.id, { name: 'Empathy', pos: ['thanks'], neg: [], weight: 2 })).json.weight, 2);
  const w = await client(app.base, 'w.qa'), run = await w.post('/api/autoqa/run', { mode: 'rules' });
  assert.equal(run.status, 200, run.text);
  const conv = app.db().conversations; assert.ok(conv.find(x => x.id === 'cv2').auto, 'workspace two\'s conversation is rated');
  assert.ok(!conv.find(x => x.id === 'cv1').auto, 'workspace one\'s is not touched');
  assert.equal((await a.del('/api/auto-cats/' + c.json.id)).status, 200);
});
test('goals: an agent goal reaches that agent only; agents see their own and their team\'s goals', async () => {
  const l = await client(app.base, 'f.lead1');
  const g = await l.post('/api/c/goals', { scope: 'agent', target: 'f.b1', title: 'Close better', metric: 'score', value: 90 });
  const t = await l.post('/api/c/goals', { scope: 'team', target: 't-b2b', title: 'Team 85%', metric: 'score', value: 85 });
  assert.equal(g.status, 200); assert.ok(notes('f.b1').some(n => n.type === 'goal'));
  const b1 = (await (await client(app.base, 'f.b1')).get('/api/c/goals')).json.map(x => x.id), c1 = (await (await client(app.base, 'f.c1')).get('/api/c/goals')).json.map(x => x.id);
  assert.ok(b1.includes(g.json.id) && b1.includes(t.json.id)); assert.ok(!c1.includes(g.json.id) && !c1.includes(t.json.id));
  assert.equal((await (await client(app.base, 'f.b1')).post('/api/c/goals', { title: 'x' })).status, 403);
});
test('notification rules: a switched-off kind of notification no longer reaches that role', async () => {
  const a = await client(app.base, 'f.admin'), l = await client(app.base, 'f.lead1');
  assert.equal((await a.put('/api/settings/x/notifOff', { value: { goal: ['agent'] } })).status, 200);
  const before = notes('f.b3').length;
  assert.equal((await l.post('/api/c/goals', { scope: 'agent', target: 'f.b3', title: 'Quiet goal' })).status, 200);
  assert.equal(notes('f.b3').length, before, 'agents get no goal notification any more');
  assert.equal((await (await client(app.base, 'f.qa1')).put('/api/settings/x/notifOff', { value: {} })).status, 403);
  await a.put('/api/settings/x/notifOff', { value: {} });
});
test('repeating tasks: a run can be switched off; an unknown one is "not found"', async () => {
  const l = await client(app.base, 'f.lead1');
  assert.equal((await l.put('/api/task-runs/zz', { active: false })).status, 404);
  const db = app.db(); db.taskRuns = [{ id: 'run1', tpl: 'x', active: true }]; require('fs').writeFileSync(app.DATA, JSON.stringify(db));
  const r = await l.put('/api/task-runs/run1', { active: false }); assert.equal(r.status, 200); assert.equal(app.db().taskRuns[0].active, false);
});
