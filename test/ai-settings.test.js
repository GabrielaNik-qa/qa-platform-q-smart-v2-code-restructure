// Admin › Integrations › AI and voice: keys are stored encrypted and never sent back, a wrong key or a busy service gives a clear
// message (no crash), every request counts towards the monthly budget and the AI pauses when it is used up.
// The AI service is a small fake on this computer (ANTHROPIC_BASE_URL): no real AI is called and nothing is paid.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), { spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const { DEFAULT_SC } = require('../scorecard');

const GOOD = 'sk-ant-good-key-1234567890ABCD', WRONG = 'sk-ant-wrong-key-000000000000';
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qsmart-ai-')), DATA = path.join(DIR, 'data.json');
const H = bcrypt.hashSync('password', 4), db = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));
const person = (username, role) => ({ username, name: username, email: username + '@test.com', role, team: 't-admin', title: '', desc: '', languages: [], skills: [], phone: '', start: '', active: true, hash: H, mustChange: false });
fs.writeFileSync(DATA, JSON.stringify({ boot: 5, users: [person('k.admin', 'admin'), person('k.qa', 'qa'), { ...person('k.agent', 'agent'), team: 't-a' }, { ...person('k.agent2', 'agent'), team: 't-a' }, { ...person('k.lead', 'lead'), team: 't-admin' }, { ...person('k.trainer', 'trainer'), team: 't-admin' }], teams: [{ id: 't-admin', name: 'Administration', lead: 'k.admin', system: true }, { id: 't-a', name: 'Team A', lead: 'k.lead' }, { id: 't-b', name: 'Team B', lead: 'k.admin' }], sessions: [], tasks: [], workspaces: [],
  scorecards: [DEFAULT_SC], evaluations: [], settings: { pass: 85, teams: {} }, skills: [], languages: [], rootCauses: [], categories: [], autoCats: [], conversations: [] }));

let BASE = '', srv = null, fake = null, CALLS = 0;
test.before(async () => {
  fake = http.createServer((req, res) => {                    // answers like the Claude Messages API
    let b = ''; req.on('data', d => { b += d; }); req.on('end', () => {
      CALLS++; const ok = req.headers['x-api-key'] === GOOD;
      res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
      const reviewer = ok && /quality reviewer/.test(JSON.parse(b).system || '');   // the AI QA reviewer: the first item No, the rest Yes
      const sys = ok ? JSON.parse(b).system || '' : '', summary = /weekly quality summary/.test(sys), plan = /coaching plan/.test(sys);
      const customer = /play the CUSTOMER/.test(sys), trainer = /call-center trainer/.test(sys), quiz = /multiple-choice quiz/.test(sys), said = ok ? JSON.stringify(JSON.parse(b).messages) : '';
      const analyst = /senior data analyst/.test(sys), pack = analyst ? JSON.parse(JSON.parse(b).messages[0].content[0].text.split('Data (JSON):\n')[1]) : null;
      const morning = /morning brief/.test(sys);
      const text = morning ? 'Good morning! **' + JSON.parse(JSON.parse(b).messages[0].content[0].text).team + '** has a calm day.' : analyst ? '**' + pack.thisPeriod.reviews + ' reviews**, average ' + pack.thisPeriod.average + '%.\n\n## Recommended actions\n- Coach ' + pack.lowestAgents.map(x => x.agent).join(', ') : customer ? (/sorry/i.test(said.split('Agent:').pop()) ? 'Thank you, that really helps. [END]' : 'That is not good enough!') : trainer ? JSON.stringify({ score: 88, good: ['You said sorry'], tips: ['Offer a date'] }) : quiz ? JSON.stringify({ questions: [1, 2, 3].map(i => ({ q: 'Question ' + i, opts: ['A', 'B', 'C', 'D'], a: 0, why: 'Because' })) }) : summary ? '**Team A** had a hard week: the average fell. Help **k.agent** with the greeting.' : plan ? JSON.stringify({ title: 'Greet every customer', goals: 'Reach the target in two weeks', focus: ['Opening'], actions: [{ t: 'Listen to two calls with a great greeting', days: 3 }, { t: 'Use the greeting on every call', days: 99 }], notes: 'Talk about the greeting.' }) : reviewer ? JSON.stringify({ answers: DEFAULT_SC.cats.map((c, ci) => c.it.map((i, ii) => ({ a: ci === 0 && ii === 0 ? 'n' : 'y', cm: ci === 0 && ii === 0 ? 'No greeting at the start' : '' }))), comment: 'Good call, greet the customer first.', confidence: 82 }) : 'OK';
      res.end(JSON.stringify(ok ? { content: [{ type: 'text', text }], usage: { input_tokens: 10000, output_tokens: 10000 }, stop_reason: 'end_turn', model: JSON.parse(b).model } : { error: { message: 'invalid x-api-key' } }));
    });
  });
  await new Promise(ok => fake.listen(0, '127.0.0.1', ok));
  srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '0', DATA_FILE: DATA, AUDIT_FILE: path.join(DIR, 'audit.json'), REC_DIR: path.join(DIR, 'rec'), BACKUPS_DIR: path.join(DIR, 'backups'), ANTHROPIC_API_KEY: '', KEY_SECRET: '', ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + fake.address().port } });
  BASE = await new Promise((ok, no) => {
    const t = setTimeout(() => no(new Error('the server did not start')), 15000);
    srv.stdout.on('data', d => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) { clearTimeout(t); ok('http://localhost:' + m[1]); } });
    srv.on('exit', c => no(new Error('the server stopped: ' + c)));
  });
});
test.after(() => { if (srv) srv.kill(); if (fake) fake.close(); try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) { /* temp folder */ } });

let NADDR = 0;
async function as(username) {
  let cookie = ''; const addr = '10.88.0.' + (++NADDR);
  const call = async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': addr, ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    return { status: r.status, json };
  };
  assert.equal((await call('POST', '/api/login', { username, password: 'password' })).status, 200);
  return { get: u => call('GET', u), put: (u, b) => call('PUT', u, b), post: (u, b = {}) => call('POST', u, b), del: u => call('DELETE', u) };
}

test('the admin manages the AI key, model and budget; keys are encrypted and never come back; the budget is kept', async () => {
  const a = await as('k.admin');
  let s = (await a.get('/api/ai/settings')).json;
  assert.equal(s.enabled, false); assert.equal(s.keys.anthropic.set, false);
  assert.equal((await a.post('/api/ai/test')).status, 400, 'no key yet');
  assert.equal((await a.put('/api/ai/settings', { anthropicKey: 'short' })).status, 400);
  assert.equal((await a.put('/api/ai/settings', { model: 'gpt-4' })).status, 400);
  assert.equal((await a.put('/api/ai/settings', { budget: -1 })).status, 400);
  assert.equal((await a.put('/api/ai/settings', { voice: 'robot' })).status, 400);

  // a wrong key: saved encrypted, a clear message from the test, no crash
  s = (await a.put('/api/ai/settings', { anthropicKey: WRONG })).json;
  assert.deepEqual([s.keys.anthropic.set, s.keys.anthropic.last4, s.enabled], [true, '0000', true]);
  assert.ok(!JSON.stringify(s).includes(WRONG), 'the key is not sent back');
  let raw = fs.readFileSync(DATA, 'utf8'); assert.ok(!raw.includes(WRONG) && /"key":\s*"v1:/.test(raw), 'only the encrypted key is in the data file');
  const t1 = await a.post('/api/ai/test'); assert.equal(t1.status, 400); assert.match(t1.json.error, /not accepted/);

  // the right key, the cheapest model and a tiny budget: two requests fit, the third is refused before calling the AI
  s = (await a.put('/api/ai/settings', { anthropicKey: GOOD, model: 'claude-haiku-5-5', budget: 0.01, voice: 'elevenlabs', elevenKey: 'xi-eleven-key-123456789012345', elevenVoice: 'Rachel' })).json;
  assert.deepEqual([s.model, s.budget, s.voice, s.elevenVoice, s.keys.elevenlabs.set], ['claude-haiku-5-5', 0.01, 'elevenlabs', 'Rachel', true]);
  const t2 = await a.post('/api/ai/test'); assert.equal(t2.status, 200); assert.equal(t2.json.model, 'claude-haiku-5-5');
  s = (await a.get('/api/ai/settings')).json; assert.equal(s.usage.calls, 1); assert.equal(s.usage.usd, 0.006, '10,000 tokens in and out with Haiku 5.5');
  assert.equal((await a.post('/api/ai/test')).status, 200);
  const before = CALLS, t4 = await a.post('/api/ai/test');
  assert.equal(t4.status, 400); assert.match(t4.json.error, /budget is used up/); assert.equal(CALLS, before, 'the AI was not called');
  raw = fs.readFileSync(DATA, 'utf8'); assert.ok(!raw.includes(GOOD) && !raw.includes('xi-eleven-key'), 'no readable key in the data file');
  assert.ok(fs.existsSync(path.join(DIR, '.qsmart-key')), 'the encryption key sits next to this copy of the data, not in the project');

  // removing the key switches the AI off
  s = (await a.put('/api/ai/settings', { anthropicKey: '' })).json;
  assert.deepEqual([s.keys.anthropic.set, s.enabled], [false, false]);
  assert.equal((await (await as('k.qa')).get('/api/ai/settings')).status, 403, 'only admins see the AI settings');
});

test('the AI QA reviewer drafts a review on the company scorecard; a person approves it (with changes) or rejects it; the similarity is kept', async () => {
  const a = await as('k.admin'), T = ['Agent: Hello, how can I help?', 'Customer: My order is late.', 'Agent: I am sorry, let me check it for you right away.'].join('\n');
  await a.put('/api/ai/settings', { anthropicKey: GOOD, model: 'claude-sonnet-5-5', budget: 0, playbook: 'Three reviews per agent per category per month.' });
  const base = { agent: 'k.agent', id: 'L-77', dt: '2026-10-20', ch: 'chat', scid: 'sc-default' };
  assert.equal((await a.post('/api/ai/drafts', { ...base, tx: 'too short' })).status, 400);
  assert.equal((await a.post('/api/ai/drafts', { ...base, agent: 'k.qa', tx: T })).status, 400, 'only agents are reviewed');
  const d = (await a.post('/api/ai/drafts', { ...base, tx: T })).json;
  assert.equal(d.status, 'draft'); assert.equal(d.a[0][0][0], 'n'); assert.equal(d.a[0][0][1], 'No greeting at the start'); assert.equal(d.conf, 82); assert.ok(d.sc > 0 && d.sc < 100);
  assert.equal((await a.get('/api/ai/drafts')).json.length, 1);
  // the reviewer disagrees on one item: the first item was done after all
  const fin = d.a.map((row, ci) => row.map((x, ii) => ci === 0 && ii === 0 ? ['y', ''] : x));
  const ap = await a.post('/api/ai/drafts/' + d.id + '/approve', { a: fin, cm: 'Well done.' });
  assert.equal(ap.status, 200); assert.equal(ap.json.ev.sc, 100); assert.equal(ap.json.ev.ai.draft, d.id);
  const n = d.a.flat().length; assert.equal(ap.json.draft.sim.items, Math.round((n - 1) / n * 1000) / 10, 'all items but one agree');
  assert.equal(ap.json.draft.sim.cats[0], 50); assert.equal(ap.json.draft.status, 'approved');
  assert.ok(db().evaluations.some(e => e.rid === ap.json.ev.rid && e.cm === 'Well done.' && e.by === 'k.admin'), 'a normal review was made');
  assert.equal((await a.post('/api/ai/drafts/' + d.id + '/approve', {})).status, 400, 'decided only once');
  const d2 = (await a.post('/api/ai/drafts', { ...base, id: 'L-78', tx: T })).json;
  const rj = await a.post('/api/ai/drafts/' + d2.id + '/reject', { why: 'Wrong call' });
  assert.deepEqual([rj.status, rj.json.status, rj.json.why], [200, 'rejected', 'Wrong call']);
  assert.equal((await (await as('k.qa')).post('/api/ai/drafts/' + d2.id + '/approve', {})).status, 400, 'a rejected draft cannot be approved later');
  assert.equal((await (await as('k.agent')).get('/api/ai/drafts')).status, 403, 'agents never see AI drafts');
});

test('the AI team lead: agents at risk from the reviews, the weekly summary, coaching plans a person approves (a real session) or rejects', async () => {
  const a = await as('k.admin'), day = n => new Date(Date.now() - n * 864e5).toISOString();
  await a.put('/api/ai/settings', { anthropicKey: GOOD, model: 'claude-haiku-5-5', budget: 0, leadAuto: true });
  // k.agent: three low reviews in the last two weeks, one a critical fail; k.agent2 scores well
  const ev = (agent, sc, d) => ({ rid: 'R' + Math.random().toString(36).slice(2, 8), agent, tid: 't-a', d: day(d), sc, by: 'k.qa', cm: 'Greet the customer', cs: [{ n: 'Opening', e: sc / 10, m: 10, it: [{ t: 'Greeting', a: sc < 85 ? 'n' : 'y', cm: '' }] }] });
  const d0 = db(); d0.evaluations.push(ev('k.agent', 60, 1), ev('k.agent', 0, 3), ev('k.agent', 70, 9), ev('k.agent2', 95, 2), ev('k.agent2', 98, 5)); fs.writeFileSync(DATA, JSON.stringify(d0));
  let L = (await a.get('/api/ai/lead')).json;
  assert.deepEqual(L.risk.map(x => x.agent), ['k.agent'], 'only the low scorer is at risk');
  assert.ok(L.risk[0].why.includes('below target for 2 weeks') && L.risk[0].why.includes('critical fail')); assert.equal(L.risk[0].weak[0].n, 'Opening');
  assert.equal((await (await as('k.agent')).get('/api/ai/lead')).status, 403, 'agents never see the AI team lead');
  assert.equal((await (await as('k.agent')).post('/api/ai/lead/summary', { team: 't-a' })).status, 403, 'agents do not write summaries (trainers do, since 4 November: see below)');

  // the weekly summary: written on request; the team lead is told
  assert.equal((await a.post('/api/ai/lead/summary', { team: 't-admin' })).status, 400, 'not the Administration team');
  const w = await a.post('/api/ai/lead/summary', { team: 't-a' });
  assert.equal(w.status, 200); assert.match(w.json.text, /hard week/); assert.ok(w.json.stats.thisWeek.reviews >= 4, 'the reviews of this week'); assert.equal(w.json.stats.agentsAtRisk[0].name, 'k.agent');
  assert.ok((await (await as('k.lead')).get('/api/notifications')).json.some(n => JSON.stringify(n).includes(w.json.id)), 'the team lead is told');
  assert.equal((await (await as('k.trainer')).post('/api/ai/lead/summary', { team: 't-a' })).status, 200, 'trainers write summaries too (Gabriela, 4 November)');

  // a coaching plan draft; approving it needs a real session with that agent
  assert.equal((await a.post('/api/ai/lead/plan', { agent: 'k.qa' })).status, 400, 'only agents');
  const lead = await as('k.lead'), p = (await lead.post('/api/ai/lead/plan', { agent: 'k.agent' })).json;
  assert.equal(p.status, 'draft'); assert.equal(p.plan.title, 'Greet every customer'); assert.equal(p.plan.actions[1].days, 60, 'days are kept within two months');
  assert.equal((await lead.post('/api/ai/lead/plan/' + p.id + '/approve', { sid: 'nope' })).status, 400, 'no session yet');
  const s = await lead.post('/api/sessions', { kind: 'o2o', date: day(0).slice(0, 10), agents: ['k.agent'], title: p.plan.title, goals: p.plan.goals, focus: p.plan.focus, notes: p.plan.notes, actions: p.plan.actions.map(x => ({ t: x.t, owner: 'k.agent', due: day(-x.days).slice(0, 10) })), makeTasks: true });
  assert.equal(s.status, 200, JSON.stringify(s.json));
  const ap = await lead.post('/api/ai/lead/plan/' + p.id + '/approve', { sid: s.json.id });
  assert.deepEqual([ap.status, ap.json.status, ap.json.sid], [200, 'approved', s.json.id]);
  assert.equal(db().tasks.length, 2, 'every action became a task');
  assert.equal((await lead.post('/api/ai/lead/plan/' + p.id + '/reject', {})).status, 400, 'decided only once');
  const p2 = (await a.post('/api/ai/lead/plan', { agent: 'k.agent' })).json, rj = await a.post('/api/ai/lead/plan/' + p2.id + '/reject', {});
  assert.deepEqual([rj.status, rj.json.status], [200, 'rejected']);
  L = (await lead.get('/api/ai/lead')).json; assert.equal(L.plans.length, 2); assert.equal(L.summaries.length, 2, 'the one of admin and the one of the trainer');
});

test('the AI trainer: practice calls with an AI customer (switched on by the admin), training needs from the reviews, quiz drafts a person publishes', async () => {
  const a = await as('k.admin'), ag = await as('k.agent'), lead = await as('k.lead');
  await a.put('/api/ai/settings', { anthropicKey: GOOD, rolePlay: false });
  assert.equal((await ag.get('/api/ai/roleplay')).json.on, false, 'off until the admin switches it on');
  const call = [{ r: 'c', t: 'My order is a week late and nobody answers my e-mails!' }, { r: 'a', t: 'Where is it?' }];
  assert.equal((await ag.post('/api/ai/roleplay/turn', { sc: 'late', msgs: call })).status, 400);
  assert.equal((await a.put('/api/ai/settings', { rolePlay: true })).json.rolePlay, true);
  const rp = (await ag.get('/api/ai/roleplay')).json; assert.equal(rp.on, true); assert.ok(rp.scenarios.some(x => x.id === 'late' && x.open) && !rp.scenarios[0].brief, 'the hidden brief stays on the server');
  let t = await ag.post('/api/ai/roleplay/turn', { sc: 'late', msgs: call }); assert.deepEqual([t.status, t.json.reply, t.json.end], [200, 'That is not good enough!', false]);
  call.push({ r: 'c', t: t.json.reply }, { r: 'a', t: 'I am so sorry, I will send it today with express delivery.' });
  t = await ag.post('/api/ai/roleplay/turn', { sc: 'late', msgs: call }); assert.deepEqual([t.json.reply, t.json.end], ['Thank you, that really helps.', true], 'the [END] tag is taken out');
  assert.equal((await ag.post('/api/ai/roleplay/turn', { sc: 'nope', msgs: call })).status, 400);
  assert.equal((await ag.post('/api/ai/roleplay/turn', { sc: 'late', msgs: [...call, { r: 'c', t: 'ok' }] })).status, 400, 'the agent speaks first');
  const fin = await ag.post('/api/ai/roleplay/finish', { sc: 'late', msgs: call, minutes: 4 });
  assert.equal(fin.status, 200); assert.deepEqual([fin.json.score, fin.json.result, fin.json.tips, fin.json.agent, fin.json.ai], [88, 'winner', ['Offer a date'], 'k.agent', true]);
  assert.match(fin.json.tx, /Agent: I am so sorry/);
  assert.ok((await ag.get('/api/simulations')).json.some(x => x.id === fin.json.id), 'saved on the Agents page');

  // training needs and quiz drafts
  assert.equal((await ag.get('/api/ai/trainer')).status, 403, 'agents never see the AI trainer');
  const T = (await lead.get('/api/ai/trainer')).json, op = T.needs.find(n => n.cat === 'Opening');
  assert.ok(op && op.below.some(x => x.agent === 'k.agent') && !op.below.some(x => x.agent === 'k.agent2'), 'only the agent below target');
  assert.ok(T.plays.some(p => p.id === fin.json.id && p.name === 'k.agent'));
  assert.equal((await lead.post('/api/ai/trainer/quiz', { cat: 'Nope' })).status, 400);
  const q = await lead.post('/api/ai/trainer/quiz', { cat: 'Opening', agents: ['k.agent', 'k.qa'] });
  assert.deepEqual([q.status, q.json.status, q.json.qs, q.json.n], [200, 'draft', 3, 1], 'a draft with 3 questions, given only to the agent');
  const saved = db().quizzes.find(x => x.id === q.json.id); assert.deepEqual([saved.ai.cat, saved.assign.users, saved.kind], ['Opening', ['k.agent'], 'category']);
  assert.ok(!(await ag.get('/api/quizzes')).json.quizzes.some(x => x.id === q.json.id), 'agents do not see it before it is published');
  assert.equal((await lead.get('/api/ai/trainer')).json.quizzes[0].id, q.json.id);
});

test('the AI analyst answers questions about the quality data from numbers worked out by the app; reports are kept and can be deleted', async () => {
  const a = await as('k.admin'), lead = await as('k.lead');
  await a.put('/api/ai/settings', { anthropicKey: GOOD, analystAuto: true });
  assert.equal((await (await as('k.agent')).get('/api/ai/analyst')).status, 403, 'agents never see the AI analyst');
  assert.equal((await a.post('/api/ai/analyst', { period: 'year' })).status, 400);
  assert.equal((await a.post('/api/ai/analyst', { team: 't-admin' })).status, 400, 'not the Administration team');
  const none = await a.post('/api/ai/analyst', { team: 't-b' }); assert.deepEqual([none.status, none.json.error], [400, 'There are no reviews in this period']);
  const r = await a.post('/api/ai/analyst', { period: '30' });
  assert.equal(r.status, 200); assert.match(r.json.q, /monthly quality report/, 'an empty question asks for the monthly report');
  const n = db().evaluations.filter(e => Date.now() - new Date(e.d) < 30 * 864e5).length;
  assert.equal(r.json.pack.thisPeriod.reviews, n); assert.ok(r.json.text.startsWith('**' + n + ' reviews**'), 'the AI wrote from the numbers it was given');
  assert.ok(r.json.pack.byTeam.some(t => t.team === 'Team A') && r.json.pack.byCategory.some(c => c.category === 'Opening'));
  assert.ok(r.json.pack.lowestAgents.some(x => x.agent === 'k.agent'));
  assert.ok(r.json.pack.attendance && r.json.pack.attendance.next14Days.length === 14, 'the analyst can also answer questions about attendance');
  const mb = await lead.post('/api/wf/brief', { team: 't-a' });
  assert.deepEqual([mb.status, mb.json.ai, mb.json.text], [200, true, 'Good morning! **Team A** has a calm day.'], 'the AI writes the morning brief when it is connected');
  const q = await lead.post('/api/ai/analyst', { q: 'Where do we lose the most points?', period: '90', team: 't-a' });
  assert.deepEqual([q.status, q.json.q, q.json.team, q.json.pack.team], [200, 'Where do we lose the most points?', 't-a', 'Team A']);
  const L = (await lead.get('/api/ai/analyst')).json; assert.equal(L.reports.length, 2); assert.equal(L.auto, true); assert.equal(L.periods.lastmonth, 'Last month');
  assert.equal((await lead.del('/api/ai/analyst/' + r.json.id)).status, 404, 'only your own report (or an admin)');
  assert.equal((await a.del('/api/ai/analyst/' + q.json.id)).status, 200);
  assert.equal((await a.get('/api/ai/analyst')).json.reports.length, 1);
});
