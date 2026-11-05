// Roles & permissions (29 October): per-person access, saved templates and "Reset to default". Made-up people only
// (test/fixture-round4.js), on a temporary copy.
const test = require('node:test'), assert = require('node:assert/strict');
const { startApp, client } = require('./fixture-round4');

let app;
test.before(async () => { app = await startApp(); });
test.after(() => { if (app) app.stop(); });

test('per-person access: only admins save it, each person only receives their own choices, odd names are dropped', async () => {
  const a = await client(app.base, 'f.admin'), b1 = await client(app.base, 'f.b1'), qa = await client(app.base, 'f.qa1');
  assert.equal((await qa.put('/api/settings/x/permu', { value: { dash: { 'f.b1': false } } })).status, 403, 'a QA cannot change permissions');
  const r = await a.put('/api/settings/x/permu', { value: { dash: { 'f.b1': false, 'f.c1': true, 'x"><img': true, __proto__x: true }, calls: { 'f.b2': 'yes' }, '<bad>': { 'f.b1': true } } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.permu, { dash: { 'f.b1': false, 'f.c1': true }, calls: {} }, 'only page names and usernames, only yes / no');
  assert.deepEqual((await b1.get('/api/settings')).json.permu, { dash: { 'f.b1': false } }, 'f.b1 sees only their own choice');
  assert.equal((await b1.get('/api/settings')).json.permtpl, undefined, 'templates are for admins only');
  // more than 60 pages are kept (the general cleaning keeps 60 entries per list)
  const many = Object.fromEntries(Array.from({ length: 90 }, (_, i) => ['page' + i, ['admin', 'qa', 'nobody']]));
  const p = await a.put('/api/settings/x/perm', { value: many });
  assert.equal(Object.keys(p.json.perm).length, 90); assert.deepEqual(p.json.perm.page5, ['admin', 'qa'], 'only real roles');
});

test('templates keep their name, id and date; Reset to default empties the roles and the personal choices but keeps the templates', async () => {
  const a = await client(app.base, 'f.admin');
  const t = await a.put('/api/settings/x/permtpl', { value: [{ id: 'pt1', name: '  Summer team ', at: '2026-10-29T10:00:00.000Z', perm: { dash: ['admin'] }, permu: { dash: { 'f.b1': true } } }, { name: '' }] });
  assert.equal(t.status, 200);
  assert.deepEqual(t.json.permtpl[0], { id: 'pt1', name: 'Summer team', at: '2026-10-29T10:00:00.000Z', perm: { dash: ['admin'] }, permu: { dash: { 'f.b1': true } } });
  assert.equal(t.json.permtpl[1].name, 'Template'); assert.ok(t.json.permtpl[1].id, 'a template without an id gets one');
  await a.put('/api/settings/x/perm', { value: {} }); const r = await a.put('/api/settings/x/permu', { value: {} });
  assert.deepEqual([r.json.perm, r.json.permu, r.json.permtpl.length], [{}, {}, 2]);
});

// Admin › GOVERNANCE registers (3 November): admins only; a link must be https://; the accessibility statement needs a text
test('the governance registers: only admins read and write them; links must be https://; a statement needs a text', async () => {
  const a = await client(app.base, 'f.admin'), qa = await client(app.base, 'f.qa1'), b1 = await client(app.base, 'f.b1');
  for (const c of ['ropa', 'subproc', 'dpas', 'consents', 'aireg', 'ainotices', 'breaches', 'a11y']) {
    for (const x of [qa, b1]) { assert.equal((await x.get('/api/c/' + c)).status, 403, c); assert.equal((await x.post('/api/c/' + c, { title: 'x' })).status, 403, c); }
    assert.equal((await a.get('/api/c/' + c)).status, 200, c);
  }
  const r = await a.post('/api/c/breaches', { title: 'Laptop lost', found: '2026-11-03', foundAt: '09:30', risk: 'high', authority: 'todo', status: 'open' });
  assert.equal(r.status, 200); assert.equal(r.json.title, 'Laptop lost'); assert.equal(r.json.by, 'f.admin');
  assert.equal((await a.post('/api/c/dpas', { party: 'Supplier', link: 'javascript:alert(1)' })).status, 400);
  assert.equal((await a.post('/api/c/dpas', { party: 'Supplier', link: 'https://files.example/dpa.pdf' })).status, 200);
  assert.equal((await a.post('/api/c/a11y', { status: 'partial', text: '  ' })).status, 400);
});

// Help Center, pins and reviewer checks (3 November)
test('Help Center: everybody reads, staff write; pins: an agent sees only their own; reviewer checks: staff only; video links must be https://', async () => {
  const a = await client(app.base, 'f.admin'), tr1 = await client(app.base, 'f.tr1'), b1 = await client(app.base, 'f.b1'), b2 = await client(app.base, 'f.b2');
  for (const c of ['faq', 'gloss', 'videos', 'tours']) { assert.equal((await b1.get('/api/c/' + c)).status, 200, c); assert.equal((await b1.post('/api/c/' + c, { q: 'x' })).status, 403, c); }
  assert.equal((await tr1.post('/api/c/faq', { q: 'How do I dispute a review?', a: 'Open it and press Dispute.' })).status, 200, 'a trainer writes the FAQ');
  assert.equal((await a.post('/api/c/videos', { title: 'Tour', link: 'http://plain.example' })).status, 400);
  await a.post('/api/c/pins', { rid: 'r1', agent: 'f.b1', note: 'The greeting at 00:10', status: 'todo' }); await a.post('/api/c/pins', { rid: 'r2', agent: 'f.b2', note: 'Another agent', status: 'todo' });
  assert.deepEqual((await b1.get('/api/c/pins')).json.map(x => x.agent), ['f.b1']); assert.deepEqual((await b2.get('/api/c/pins')).json.map(x => x.agent), ['f.b2']);
  assert.equal((await b1.post('/api/c/pins', { note: 'x' })).status, 403);
  assert.equal((await b1.get('/api/c/revqa')).status, 403); assert.equal((await tr1.post('/api/c/revqa', { rid: 'r1' })).status, 403, 'a trainer reads the checks but does not write them');
  assert.equal((await a.post('/api/c/revqa', { rid: 'r1', fair: 'yes', follows: 'no' })).status, 200);
});

// Tools & settings (3 November): sidebar, branding and regional settings for admins only and checked; feature requests with one vote each
test('sidebar, branding and regional settings: admins only, odd values dropped; feature requests: one vote per person; announcements: admins write', async () => {
  const a = await client(app.base, 'f.admin'), b1 = await client(app.base, 'f.b1'), qa = await client(app.base, 'f.qa1');
  assert.equal((await qa.put('/api/settings/x/sidebar', { value: { hide: ['home'] } })).status, 403);
  const s = await a.put('/api/settings/x/sidebar', { value: { hide: ['planning', '<img>'], order: ['coaching', 'home'], compact: ['app:tr'], apps: ['tr', 'qi'], views: [{ name: 'Agents', roles: ['agent', 'boss'], hide: ['reports'] }] } });
  assert.equal(s.status, 200); assert.deepEqual(s.json.sidebar.hide, ['planning']); assert.deepEqual(s.json.sidebar.views[0].roles, ['agent']); assert.ok(s.json.sidebar.views[0].id);
  assert.deepEqual((await b1.get('/api/settings')).json.sidebar.views[0].hide, ['reports'], 'everybody receives the layout');
  assert.equal((await a.put('/api/settings/x/brand', { value: { name: 'Acme', color: '#3b82f6', logo: 'data:image/svg+xml;base64,PHN2Zz4=' } })).status, 400, 'no SVG logos');
  const br = await a.put('/api/settings/x/brand', { value: { name: 'Acme', color: 'red', logo: 'data:image/png;base64,iVBORw0KGgo=' } });
  assert.deepEqual(br.json.brand, { name: 'Acme', color: '', logo: 'data:image/png;base64,iVBORw0KGgo=' });
  assert.deepEqual((await a.put('/api/settings/x/region', { value: { date: 'ymd', time: '99' } })).json.region, { date: 'ymd', time: 'auto' });
  const idea = (await b1.post('/api/c/ideas', { title: 'Dark mode for the reports' })).json;
  assert.deepEqual((await qa.post('/api/ideas/' + idea.id + '/vote')).json.votes, ['f.qa1']);
  assert.deepEqual((await a.post('/api/ideas/' + idea.id + '/vote')).json.votes, ['f.qa1', 'f.admin']);
  assert.deepEqual((await qa.post('/api/ideas/' + idea.id + '/vote')).json.votes, ['f.admin'], 'a second click takes the vote back');
  assert.equal((await qa.put('/api/c/ideas/' + idea.id, { title: 'Changed' })).status, 403, 'only its author or an admin changes an idea');
  assert.equal((await a.put('/api/c/ideas/' + idea.id, { status: 'planned' })).json.status, 'planned');
  assert.equal((await qa.post('/api/c/announce', { text: 'x' })).status, 403); assert.equal((await a.post('/api/c/announce', { text: 'Training on Friday' })).status, 200);
  assert.equal((await b1.get('/api/c/announce')).json[0].text, 'Training on Friday');
  await a.put('/api/settings/x/sidebar', { value: {} }); await a.put('/api/settings/x/brand', { value: {} }); await a.put('/api/settings/x/region', { value: {} });
});

// Contact support (3 November): a request with a file; a person sees their own, admins see all and set the status; only safe files
test('contact support: a request with a picture; the sender and the admins see it; only pictures, PDF and text under 1 MB', async () => {
  const a = await client(app.base, 'f.admin'), b1 = await client(app.base, 'f.b1'), b2 = await client(app.base, 'f.b2');
  const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
  assert.equal((await b1.post('/api/support', { email: 'not an e-mail', subject: 'x', desc: 'y' })).status, 400);
  assert.equal((await b1.post('/api/support', { email: 'b1@example.com', subject: 'x', desc: 'y', file: { name: 'a.html', type: 'text/html', data: png } })).status, 400, 'no web pages');
  const r = await b1.post('/api/support', { email: 'b1@example.com', subject: 'The export button does nothing', type: 'problem', desc: 'On Reviews, nothing happens.', file: { name: 'screen.png', type: 'image/png', data: png } });
  assert.equal(r.status, 200); assert.equal(r.json.file.name, 'screen.png'); assert.equal(r.json.file.path, undefined, 'where the file is kept is not shown');
  assert.equal((await b1.get('/api/support')).json.length, 1); assert.equal((await b2.get('/api/support')).json.length, 0, 'another agent sees nothing');
  assert.equal((await b2.get('/api/support/' + r.json.id + '/file')).status, 404); const f = await b1.get('/api/support/' + r.json.id + '/file'); assert.equal(f.status, 200); assert.equal(f.headers.get('content-type'), 'image/png');
  assert.equal((await b1.put('/api/support/' + r.json.id, { status: 'closed' })).status, 403);
  assert.equal((await a.put('/api/support/' + r.json.id, { status: 'answered' })).json.status, 'answered');
  assert.ok((await a.get('/api/support')).json.some(x => x.id === r.json.id));
});

// Knowledge Base like Confluence (3 November): folders for some teams only; reactions, comments, stars and the last versions
test('knowledge base: a folder for B2B only is hidden from B2C (pages, tests, export too); reactions, comments, stars, versions', async () => {
  const a = await client(app.base, 'f.admin'), b1 = await client(app.base, 'f.b1'), c1 = await client(app.base, 'f.c1');
  const f = (await a.post('/api/kb/folders', { name: 'B2B only', teams: ['t-b2b'] })).json;
  const art = (await a.post('/api/kb/articles', { title: 'B2B pricing', folder: f.id, body: '# Prices\nOne', emoji: '💶', cover: '#3b82f6', quiz: { pass: 80, questions: [{ q: 'Q?', opts: ['a', 'b'], a: 0 }] } })).json;
  assert.equal(art.emoji, '💶'); assert.equal(art.cover, '#3b82f6');
  assert.ok((await b1.get('/api/kb')).json.articles.some(x => x.id === art.id), 'B2B sees it');
  const c = (await c1.get('/api/kb')).json; assert.ok(!c.articles.some(x => x.id === art.id) && !c.folders.some(x => x.id === f.id), 'B2C does not');
  assert.equal((await c1.post('/api/kb/read', { id: art.id })).status, 404); assert.equal((await c1.post('/api/kb/articles/' + art.id + '/test', { answers: [0] })).status, 404);
  assert.equal((await c1.get('/api/kb/articles/' + art.id + '/export')).status, 404); assert.equal((await c1.post('/api/kb/articles/' + art.id + '/react', { e: '👍' })).status, 404);
  assert.deepEqual((await b1.post('/api/kb/articles/' + art.id + '/react', { e: '👍' })).json.reactions, { '👍': ['f.b1'] });
  assert.deepEqual((await b1.post('/api/kb/articles/' + art.id + '/react', { e: '👍' })).json.reactions, {}, 'a second click takes it back');
  assert.equal((await b1.post('/api/kb/articles/' + art.id + '/react', { e: 'x' })).status, 400);
  const cm = (await b1.post('/api/kb/articles/' + art.id + '/comments', { t: 'Clear, thank you' })).json.comments; assert.equal(cm[0].n, 'Agent B1');
  const b2 = await client(app.base, 'f.b2'); assert.equal((await b2.del('/api/kb/articles/' + art.id + '/comments/' + cm[0].id)).status, 403, 'not somebody else\'s comment');
  assert.deepEqual((await b1.post('/api/kb/star', { id: art.id })).json.stars, [art.id]); assert.deepEqual((await b1.get('/api/kb')).json.stars, [art.id]);
  await a.put('/api/kb/articles/' + art.id, { title: 'B2B pricing', folder: f.id, body: '# Prices\nTwo' });
  const v = (await a.get('/api/kb')).json.articles.find(x => x.id === art.id).versions; assert.equal(v.length, 1); assert.equal(v[0].body, '# Prices\nOne');
});

// The Help Center website (3 November): anybody reads the published articles without signing in; drafts and writing are for admins
test('Help Center website: public reading, drafts for admins only, one helpful answer per visitor, empty categories and sections only are deleted', async () => {
  const anon = await client(app.base), a = await client(app.base, 'f.admin'), qa = await client(app.base, 'f.qa1');
  const h = await anon.get('/api/hc?all=1');
  assert.equal(h.status, 200); assert.ok(h.json.cats.length >= 6 && h.json.arts.length >= 10, 'the starting articles about Q-smart'); assert.equal(h.json.editor, false);
  assert.equal(h.json.arts[0].body, undefined, 'the list has a short text for the search, not the whole article');
  for (const [m, u] of [['post', '/api/hc/arts'], ['put', '/api/hc/site'], ['del', '/api/hc/cats/c-start']]) { assert.equal((await qa[m](u, {})).status, 403, u); assert.equal((await anon[m](u, {})).status, 401, u); }
  const d = await a.post('/api/hc/arts', { sec: 's-first', title: 'Secret plans', body: '## Soon\nNot yet', draft: true, labels: ['soon'] });
  assert.equal(d.status, 200); assert.ok(d.json.author, 'the author is written down');
  assert.ok(!(await anon.get('/api/hc?all=1')).json.arts.some(x => x.id === d.json.id), 'a draft is hidden from visitors');
  assert.equal((await anon.get('/api/hc/a/' + d.json.id)).status, 404);
  assert.ok((await a.get('/api/hc?all=1')).json.arts.some(x => x.id === d.json.id), 'admins see drafts');
  assert.equal((await a.post('/api/hc/arts', { sec: 'nope', title: 'x' })).status, 400, 'an article needs a real section');
  await a.put('/api/hc/arts/' + d.json.id, { sec: 's-first', title: 'Plans', body: 'Now public', draft: false });
  const p = await anon.get('/api/hc/a/' + d.json.id); assert.equal(p.status, 200); assert.equal(p.json.body, 'Now public');
  // "Was this article helpful?": one answer per visitor, which can be changed
  assert.deepEqual((await anon.post('/api/hc/a/' + d.json.id + '/vote', { v: 'up' })).json, { up: 1, down: 0, mine: 'up' });
  assert.deepEqual((await anon.post('/api/hc/a/' + d.json.id + '/vote', { v: 'up' })).json, { up: 1, down: 0, mine: 'up' }, 'a second yes is not counted');
  assert.deepEqual((await anon.post('/api/hc/a/' + d.json.id + '/vote', { v: 'down' })).json, { up: 0, down: 1, mine: 'down' });
  assert.equal((await anon.post('/api/hc/a/' + d.json.id + '/vote', { v: 'maybe' })).status, 400);
  // a category or section with something in it is not deleted
  assert.equal((await a.del('/api/hc/cats/c-start')).status, 400); assert.equal((await a.del('/api/hc/secs/s-first')).status, 400);
  const c = await a.post('/api/hc/cats', { name: 'Empty', icon: '🧪' }); assert.equal((await a.del('/api/hc/cats/' + c.json.id)).status, 200);
  assert.equal((await a.put('/api/hc/site', { name: 'Acme help', intro: 'Hello' })).json.name, 'Acme help');
  assert.equal((await anon.get('/api/hc')).json.name, 'Acme help');
  // the help.… address opens the Help Center (sent as the tunnel sends it)
  const r = await fetch(app.base + '/', { redirect: 'manual', headers: { 'X-Forwarded-Host': 'help.example.com' } }); assert.equal(r.status, 302); assert.match(r.headers.get('location'), /\/hc\/$/);
});

// Q Trainer (3 November; the Call Simulator until 4 November): the written customer, the indicators and the right outcome give the score, counted by the server
test('Q Trainer: universal scenarios by segment and level; the server scores a written call (indicators + right outcome); only admins delete', async () => {
  const b1 = await client(app.base, 'f.b1'), b2 = await client(app.base, 'f.b2'), a = await client(app.base, 'f.admin'), tr = a;
  const rp = (await b1.get('/api/ai/roleplay')).json;
  assert.equal(rp.on, false, 'no AI: the written customer'); assert.ok(rp.langs.bg && rp.langs.fr);
  const r8 = rp.scenarios.find(s => s.id === 'wb30'); assert.equal(r8.seg, 'Retention'); assert.equal(r8.level, 1); assert.ok(r8.lines.length && r8.inds.length && r8.outcomes.length);
  assert.equal(r8.correct, undefined, 'the right outcome is not sent before the call'); assert.equal(r8.brief, undefined);
  assert.ok(!rp.scenarios.some(s => /casino|bonus|wager|player/i.test(s.name + s.who + s.open)), 'universal scenarios, for any company (4 November)');
  // practice suggestions (4 November): f.b1's review misses the first question of every category, so it is below the pass mark
  assert.ok(rp.suggested.length && rp.suggested.every(x => rp.scenarios.some(s => s.id === x.id) && x.cat), 'scenarios that train the weak categories');
  const tr1 = await client(app.base, 'f.tr1'), cat = rp.suggested[0].cat;
  const pr = await tr1.post('/api/ai/trainer/practice', { cat }); assert.equal(pr.status, 200, pr.text); assert.ok(pr.json.sent >= 1);
  assert.ok(app.db().notifications.some(n => n.to === 'f.b1' && /practice call in Q Trainer/.test(JSON.stringify(n))), 'the agent is told');
  assert.equal((await b1.post('/api/ai/trainer/practice', { cat })).status, 403, 'agents do not send practice calls');
  const msgs = [{ r: 'c', t: 'Hello?' }, { r: 'a', t: 'Hello, my name is Ana from Q-smart Demo. This call is recorded. How are you?' }, { r: 'c', t: r8.lines[0] },
    { r: 'a', t: 'We have a special offer: 20% off for three months, no contract, cancel anytime. I will send it by e-mail. Thank you, bye!' }];
  const f = await b1.post('/api/sim/finish', { sc: 'wb30', msgs, outcome: 'Won back: the customer accepted the offer', secs: 95, mode: 'voice', lang: 'en', score: 1 });
  assert.equal(f.status, 200, f.text);
  assert.deepEqual([f.json.score, f.json.right, f.json.turns, f.json.secs, f.json.mode, f.json.seg], [100, true, 2, 95, 'voice', 'Retention'], 'all 7 indicators and the right outcome; the page cannot send its own score');
  assert.equal(f.json.inds.find(x => x.t === 'Says the call is recorded').turn, 1);
  const w = await b1.post('/api/sim/finish', { sc: 'wb30', msgs: msgs.slice(0, 2), outcome: 'Not interested', secs: 30 });
  assert.equal(w.json.right, false); assert.equal(w.json.best, 'Won back: the customer accepted the offer'); assert.equal(w.json.score, Math.round(3 / 7 * 80), 'greets, says it is recorded, asks: 3 of 7, and the wrong outcome');
  assert.equal((await b1.post('/api/sim/finish', { sc: 'wb30', msgs: [{ r: 'c', t: 'Hello?' }] })).status, 400, 'at least one reply');
  assert.equal((await b1.post('/api/sim/finish', { sc: 'nope', msgs })).status, 400);
  assert.ok(!(await b2.get('/api/simulations')).json.some(x => x.id === f.json.id), 'another agent does not see it');
  // a scenario written by a trainer or admin keeps its segment, level, lines, indicators and outcomes
  const s = await tr.post('/api/ai/scenarios', { name: 'Refund', open: 'I want my money back.', seg: 'Billing', level: 4, lines: ['Now!'], inds: [{ t: 'Says sorry', kw: ['Sorry'] }], outcomes: ['Refunded', 'Refused'], correct: 'Refunded' });
  assert.deepEqual([s.json.seg, s.json.level, s.json.inds[0].kw[0], s.json.correct], ['Billing', 4, 'sorry', 'Refunded']);
  const g = await b1.post('/api/sim/finish', { sc: s.json.id, msgs: [{ r: 'c', t: 'x' }, { r: 'a', t: 'I am so sorry.' }], outcome: 'Refunded' }); assert.equal(g.json.score, 100);
  assert.equal((await b1.del('/api/simulations/' + f.json.id)).status, 403); assert.equal((await a.del('/api/simulations/' + f.json.id)).status, 200);
});

// The sandbox (3 November): an admin makes it and enters it; inside, everything reads and writes sandbox.json, never the real data
test('sandbox: only admins; inside it the data is the made-up company, changes stay there, the dangerous tools are off', async () => {
  const a = await client(app.base, 'f.admin'), qa = await client(app.base, 'f.qa1'), a2 = await client(app.base, 'f.admin');
  assert.equal((await qa.post('/api/sandbox', {})).status, 403);
  const realN = app.db().evaluations.length;
  const s = await a.post('/api/sandbox', { from: 'demo' }); assert.equal(s.status, 200, s.text); assert.equal(s.json.on, true); assert.equal(s.json.reviews, 180);
  const inside = (await a.get('/api/evaluations')).json; assert.ok(inside.length >= 100 && inside.every(e => e.agent.startsWith('sb.')), 'made-up people only');
  assert.equal((await a.get('/api/settings')).json.sandbox, true);
  assert.ok(!(await a2.get('/api/evaluations')).json.some(e => e.agent.startsWith('sb.')), 'another sign-in of the same admin still sees the real data');
  // a change inside stays inside
  const t = await a.post('/api/teams', { name: 'Practice team', lead: 'sb.lara' }); assert.equal(t.status, 200);
  assert.ok(!app.db().teams.some(x => x.name === 'Practice team'), 'the real data has no new team'); assert.equal(app.db().evaluations.length, realN);
  for (const [m, u] of [['post', '/api/backups'], ['get', '/api/backups/current/download'], ['post', '/api/demo/reset'], ['post', '/api/seed/refresh'], ['post', '/api/org/purge'], ['put', '/api/ai/settings']])
    assert.equal((await a[m](u, {})).status, 403, u + ' is off in the sandbox');
  assert.equal((await a.post('/api/sandbox/leave', {})).json.on, false);
  assert.ok(!(await a.get('/api/evaluations')).json.some(e => e.agent.startsWith('sb.')), 'back on the real data');
  // a copy of the data has no AI keys; Enter goes back in; Delete removes it
  const c = await a.post('/api/sandbox', { from: 'copy' }); assert.equal(c.json.from, 'copy'); assert.equal(c.json.reviews, realN);
  await a.post('/api/sandbox/leave', {}); assert.equal((await a.post('/api/sandbox/enter', {})).json.on, true);
  assert.equal((await a.del('/api/sandbox')).json.exists, false); assert.equal((await a.get('/api/settings')).json.sandbox, false);
  assert.equal((await a.post('/api/sandbox/enter', {})).status, 400, 'nothing to enter');
});

// Import data (3 November): CSV or Excel, a preview row by row that changes nothing, then the import
test('import data: users, teams and reviews from CSV; the preview changes nothing; bad rows are skipped with the reason', async () => {
  const a = await client(app.base, 'f.admin'), qa = await client(app.base, 'f.qa1');
  const file = (name, rows) => ({ name, data: Buffer.from('﻿' + rows.join('\r\n')).toString('base64') });
  assert.equal((await qa.post('/api/import/preview', { kind: 'teams', file: file('t.csv', ['Name', 'X']) })).status, 403);
  const tf = file('teams.csv', ['Name;Lead', 'Import team;f.lead1', 'B2B;', ';']);
  const p = await a.post('/api/import/preview', { kind: 'teams', file: tf }); assert.equal(p.status, 200, p.text);
  assert.deepEqual([p.json.add, p.json.skip], [1, 1], 'an empty row is dropped; B2B is already there'); assert.match(p.json.rows[1].why, /already exists/);
  assert.ok(!app.db().teams.some(t => t.name === 'Import team'), 'the preview saves nothing');
  assert.equal((await a.post('/api/import', { kind: 'teams', file: tf })).json.add, 1); assert.ok(app.db().teams.some(t => t.name === 'Import team' && t.lead === 'f.lead1'));
  const uf = file('users.csv', ['Name,Email,Role,Team', 'Maria Ivanova,maria@example.com,agent,Import team', '"Ivo, Jr Petrov",ivo@example.com,Team Lead,', 'Solo,solo@example.com,agent,B2B', 'Nora Stein,nora@example.com,pilot,B2B']);
  const u = await a.post('/api/import', { kind: 'users', file: uf }); assert.deepEqual([u.json.add, u.json.skip], [2, 2], 'no last name; unknown role');
  const m = app.db().users.find(x => x.email === 'maria@example.com'); assert.equal(m.mustChange, true); assert.ok(app.db().teams.find(t => t.id === m.team).name === 'Import team');
  assert.equal(app.db().users.find(x => x.email === 'ivo@example.com').role, 'lead');
  const rf = file('reviews.csv', ['Date,Agent,Lead ID,Score,Channel,Reviewer', '2026-11-02,f.b1,L-1,92,chat,Quinn QA', '03.11.2026,Agent B2,L-2,78%,call,', '2026-11-02,f.b1,L-1,92,chat,', 'yesterday,f.b1,L-3,50,,', '2026-11-02,f.qa1,L-4,50,,', '2026-11-02,f.b1,L-5,150,,']);
  const r = await a.post('/api/import', { kind: 'reviews', file: rf }); assert.deepEqual([r.json.add, r.json.skip], [2, 4]);
  const e = app.db().evaluations.find(x => x.id === 'L-2'); assert.deepEqual([e.agent, e.sc, e.ch, e.scn, String(e.d).slice(0, 10)], ['f.b2', 78, 'call', 'Imported', '2026-11-03']);
  assert.equal((await a.post('/api/import/preview', { kind: 'reviews', file: file('x.csv', ['Agent', 'f.b1']) })).status, 400, 'the needed columns are named');
  assert.equal((await a.post('/api/import/preview', { kind: 'users', file: { name: 'x.exe', data: 'AAAA' } })).status, 400);
  assert.equal((await a.get('/api/import/template/users')).status, 200);
});

// Beta features (3 November): admins switch a feature off for everybody; the Help Center website then answers as if it did not exist
test('beta features: only admins switch them; only yes / no values; the Help Center website can be switched off', async () => {
  const a = await client(app.base, 'f.admin'), qa = await client(app.base, 'f.qa1'), anon = await client(app.base);
  assert.equal((await qa.put('/api/settings/x/beta', { value: { hcsite: false } })).status, 403);
  const r = await a.put('/api/settings/x/beta', { value: { hcsite: false, callsim: 'no', 'bad key!': false } }); assert.deepEqual(r.json.beta, { hcsite: false });
  assert.equal((await anon.get('/api/hc')).status, 404); assert.equal((await qa.get('/api/settings')).json.beta.hcsite, false);
  await a.put('/api/settings/x/beta', { value: {} }); assert.equal((await anon.get('/api/hc')).status, 200);
});

// Decisions 15 and 16 (4 November): a quiz shows the right answers only once passed, with 3 tries; a CSAT answer imported twice counts once
test('quizzes: 3 tries and the answers only after passing; CSAT: the same answer imported twice counts once', async () => {
  const tr1 = await client(app.base, 'f.tr1'), b2 = await client(app.base, 'f.b2'), qa = await client(app.base, 'f.qa1');
  const q = (await tr1.post('/api/quizzes', { title: 'Greeting', status: 'published', assign: { all: true }, pass: 100, questions: [{ q: 'First words?', opts: ['Hello', 'Bye'], a: 0 }] })).json;
  assert.equal(q.tries, 3);
  const wrong = await b2.post('/api/quizzes/' + q.id + '/attempt', { answers: [1] });
  assert.equal(wrong.json.passed, false); assert.equal(wrong.json.results[0].a, undefined, 'no right answer shown before passing'); assert.equal(wrong.json.left, 2);
  await b2.post('/api/quizzes/' + q.id + '/attempt', { answers: [1] }); await b2.post('/api/quizzes/' + q.id + '/attempt', { answers: [1] });
  assert.equal((await b2.post('/api/quizzes/' + q.id + '/attempt', { answers: [0] })).status, 403, 'no fourth try');
  const ok = await (await client(app.base, 'f.b3')).post('/api/quizzes/' + q.id + '/attempt', { answers: [0] }); assert.equal(ok.json.results[0].a, 0, 'the answers once passed');
  const row = { agent: 'f.b1', date: '2026-11-02', score: 4, lead: 'CS-1' };
  assert.equal((await qa.post('/api/c/surveys', { bulk: [row, { ...row, lead: 'CS-2' }] })).json.added, 2);
  assert.deepEqual((await qa.post('/api/c/surveys', { bulk: [row, { ...row, lead: 'CS-3' }] })).json, { added: 1, skipped: 1 });
});
