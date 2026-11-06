// The developer platform (4 November), like the developer pages of ElevenLabs:
//  - API keys: made by admins, each with its own access per area (No access / Read / Write) and a limit of requests per hour.
//    Only a fingerprint (SHA-256) of a key is kept: the full key is shown once, when it is made.
//  - The API (/api/v1/…): read reviews, agents, teams, scorecards, numbers, practice calls and flags; add reviews.
//  - Webhooks: Q-smart sends an event to another program when something happens (a review is saved, a dispute opened …),
//    signed with the webhook's secret so the other program can check it really came from Q-smart.
//  - MCP (/mcp): AI assistants such as Claude read the same data through the same keys and the same access.
// Inside the sandbox nothing is ever sent out, and the API and MCP always read the real data.
const crypto = require('crypto'), dns = require('dns').promises, net = require('net');
module.exports = ({ app, load, save, need, bad, hex, iso, str, SBX }) => {
  const AREAS = { reviews: ['Reviews', 'rw'], people: ['Agents and teams', 'r'], scorecards: ['Scorecards', 'r'], stats: ['Numbers (averages, pass rate, categories)', 'r'], simulations: ['Practice calls', 'r'], flags: ['Quick flags', 'r'] };
  const LEVEL = { none: 0, read: 1, write: 2 };
  const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
  const real = fn => SBX.exit(fn);                                  // the keys, hooks and their logs always live in the real data
  const pass = (db, tid) => (((db.settings || {}).teams || {})[tid] || {}).pass || (db.settings || {}).pass || 85;
  const tname = (db, id) => (db.teams.find(t => t.id === id) || {}).name || '';
  const pct = (e, m) => m ? Math.round(e / m * 1000) / 10 : null;
  const day = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';

  // ---------------------------------------------------------------- what the API, the webhooks and MCP give out
  const reviewOut = (db, e) => ({ id: e.rid, lead: e.id, agent: e.agent, agent_name: e.agn, team: tname(db, e.tid), date: String(e.d).slice(0, 10), score: e.ns ? null : e.sc, scored: !e.ns, passed: !e.ns && e.sc >= pass(db, e.tid),
    channel: e.ch || 'call', scorecard: e.scn, reviewer: e.rv, comment: e.cm || '', flag: e.fl || '', imported: !!e.imp, seen: !!e.seen, created: e.at || e.d,
    categories: (e.cs || []).map(c => ({ name: c.n, score: pct(c.e, c.m), critical_failed: !!c.z })),
    dispute: e.dp ? { status: e.dp.status, opened: e.dp.at, messages: (e.dp.msgs || []).map(m => ({ by: m.n, role: m.r, text: m.t, at: m.at })) } : null });
  const agentOut = (db, u) => ({ username: u.username, name: u.name, email: u.email || '', team: tname(db, u.team), active: u.active !== false, title: u.title || '' });
  const simOut = s => ({ id: s.id, agent: s.agent, scenario: s.scenario, segment: s.seg || '', level: s.level || null, score: s.score, passed: s.score >= 85, outcome: s.outcome || '', right_outcome: s.right ?? null,
    seconds: s.secs || (s.minutes || 0) * 60, turns: s.turns || null, mode: s.mode || 'text', indicators: (s.inds || []).map(x => ({ name: x.t, met: x.ok })), date: s.date });
  const flagOut = f => ({ id: f.id, agent: f.agent, lead: f.lead, type: f.type, comment: f.cm || '', by: f.byName || f.by, date: f.at });
  // the filters every list understands: from, to (YYYY-MM-DD), team (name or id), agent (username), limit (up to 500), offset
  const filt = (db, q, dOf, aOf, tOf) => { const from = day(q.from), to = day(q.to), t = q.team ? (db.teams.find(x => x.id === q.team || x.name.toLowerCase() === String(q.team).toLowerCase()) || { id: '-' }).id : '';
    return x => { const d = String(dOf(x) || '').slice(0, 10); return (!from || d >= from) && (!to || d <= to) && (!q.agent || aOf(x) === q.agent) && (!t || tOf(x) === t); }; };
  const page = (l, q) => { const limit = Math.max(1, Math.min(500, parseInt(q.limit) || 50)), offset = Math.max(0, parseInt(q.offset) || 0); return { data: l.slice(offset, offset + limit), total: l.length, limit, offset }; };
  const teamOfU = (db, u) => (db.users.find(x => x.username === u) || {}).team;
  const F = {
    reviews: (db, q) => page(db.evaluations.filter(filt(db, q, e => e.d, e => e.agent, e => e.tid)).sort((a, b) => String(b.d).localeCompare(String(a.d))).map(e => reviewOut(db, e)), q),
    review: (db, id) => { const e = db.evaluations.find(x => x.rid === id || x.id === id); return e ? reviewOut(db, e) : null; },
    agents: (db, q) => page(db.users.filter(u => u.role === 'agent' && (!q.team || tname(db, u.team).toLowerCase() === String(q.team).toLowerCase() || u.team === q.team) && (q.all || u.active !== false)).map(u => agentOut(db, u)), q),
    teams: db => ({ data: db.teams.filter(t => !t.system).map(t => ({ id: t.id, name: t.name, lead: t.lead, agents: db.users.filter(u => u.role === 'agent' && u.team === t.id && u.active !== false).length, pass_mark: pass(db, t.id) })) }),
    scorecards: db => ({ data: db.scorecards.map(s => ({ id: s.id, name: s.name, categories: (s.cats || []).map(c => ({ name: c.n, critical: !!c.k, items: (c.it || []).map(i => ({ question: i.t, points: i.p, critical: !!i.k })) })) })) }),
    simulations: (db, q) => page((db.simulations || []).filter(filt(db, q, s => s.date, s => s.agent, s => s.team || teamOfU(db, s.agent))).map(simOut), q),
    flags: (db, q) => page((db.qflags || []).filter(filt(db, q, f => f.at, f => f.agent, f => teamOfU(db, f.agent))).map(flagOut), q),
    stats: (db, q) => { const l = db.evaluations.filter(e => !e.ns).filter(filt(db, q, e => e.d, e => e.agent, e => e.tid)), avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
      const group = (key, name) => { const m = {}; l.forEach(e => { const k = key(e); (m[k] = m[k] || []).push(e); }); return Object.entries(m).map(([k, x]) => ({ ...name(k, x), reviews: x.length, average: avg(x.map(e => e.sc)), pass_rate: Math.round(x.filter(e => e.sc >= pass(db, e.tid)).length / x.length * 1000) / 10 })).sort((a, b) => b.reviews - a.reviews); };
      const cats = {}; l.forEach(e => (e.cs || []).forEach(c => { if (c.m) (cats[c.n] = cats[c.n] || []).push(c.e / c.m * 100); }));
      return { from: day(q.from) || null, to: day(q.to) || null, reviews: l.length, average: avg(l.map(e => e.sc)), pass_rate: l.length ? Math.round(l.filter(e => e.sc >= pass(db, e.tid)).length / l.length * 1000) / 10 : null,
        disputes: l.filter(e => e.dp).length, by_team: group(e => e.tid, k => ({ team: tname(db, k) })), by_agent: group(e => e.agent, (k, x) => ({ agent: k, name: x[0].agn })),
        by_category: Object.entries(cats).map(([n, v]) => ({ category: n, average: avg(v) })).sort((a, b) => a.average - b.average) }; }
  };

  // ---------------------------------------------------------------- API keys (admins)
  const scopesOf = o => Object.fromEntries(Object.entries(AREAS).map(([k, [, can]]) => { const v = (o || {})[k]; return [k, v === 'write' && can.includes('w') ? 'write' : v === 'read' || v === 'write' ? 'read' : 'none']; }));
  const keyPub = k => ({ id: k.id, name: k.name, hint: k.hint, scopes: k.scopes, limit: k.limit, active: k.active !== false, created: k.created, by: k.byName, last: k.last || null, uses: k.uses || 0, days: k.days || {} });
  const USE = new Map();                                            // the uses since the last save, written every 30 seconds (not at every request)
  const flushUse = () => { if (!USE.size) return; real(() => { const db = load(); for (const [id, u] of USE) { const k = (db.apiKeys || []).find(x => x.id === id); if (!k) continue;
    k.uses = (k.uses || 0) + u.n; k.last = u.last; k.days = k.days || {}; for (const [d, n] of Object.entries(u.days)) k.days[d] = (k.days[d] || 0) + n;
    const keep = Object.keys(k.days).sort().slice(-30); k.days = Object.fromEntries(keep.map(d => [d, k.days[d]])); } USE.clear(); save(db); }); };
  setInterval(flushUse, 30000).unref();
  app.get('/api/devkeys', need('admin'), (req, res) => { flushUse(); real(() => res.json((load().apiKeys || []).map(keyPub))); });
  app.post('/api/devkeys', need('admin'), (req, res) => real(() => {
    const b = req.body || {}, name = str(b.name, 60); if (!name) return bad(res, 'Give the key a name');
    const db = load(); db.apiKeys = db.apiKeys || []; if (db.apiKeys.length >= 50) return bad(res, 'You can have at most 50 keys');
    const full = 'qs_' + hex(24), k = { id: 'k' + hex(4), name, hash: sha(full), hint: full.slice(0, 7) + '…' + full.slice(-4), scopes: scopesOf(b.scopes), limit: Math.max(10, Math.min(100000, parseInt(b.limit) || 1000)), active: true, created: iso(), by: req.session.user.username, byName: req.session.user.name };
    db.apiKeys.push(k); save(db); res.json({ ...keyPub(k), key: full });   // the only time the full key is sent
  }));
  app.put('/api/devkeys/:id', need('admin'), (req, res) => real(() => { const db = load(), k = (db.apiKeys || []).find(x => x.id === req.params.id); if (!k) return res.status(404).json({ error: 'not found' });
    const b = req.body || {}; if (b.name !== undefined) k.name = str(b.name, 60) || k.name; if (b.scopes !== undefined) k.scopes = scopesOf(b.scopes);
    if (b.limit !== undefined) k.limit = Math.max(10, Math.min(100000, parseInt(b.limit) || 1000)); if (b.active !== undefined) k.active = !!b.active; save(db); res.json(keyPub(k)); }));
  app.delete('/api/devkeys/:id', need('admin'), (req, res) => real(() => { const db = load(), n = (db.apiKeys || []).length; db.apiKeys = (db.apiKeys || []).filter(x => x.id !== req.params.id);
    if (db.apiKeys.length === n) return res.status(404).json({ error: 'not found' }); save(db); res.json({ ok: 1 }); }));

  // which key a request carries (Authorization: Bearer qs_… or X-API-Key: qs_…), and whether it may do this
  const HITS = new Map();
  // the answer: { k, db } when the key may do it, or { status, error } when not
  function keyOf(req, area, lvl) {
    const h = String(req.get('authorization') || ''), raw = (h.match(/^Bearer\s+(\S+)$/i) || [])[1] || req.get('x-api-key') || '';
    if (!raw) return { status: 401, error: 'Send your API key in the Authorization header: Bearer qs_…' };
    const db = real(() => load()), k = (db.apiKeys || []).find(x => x.hash === sha(raw));
    if (!k || k.active === false) return { status: 401, error: 'This API key is not valid or was switched off' };
    // every request of a valid key counts towards its hourly limit, also one it has no access for
    const now = Date.now(), l = (HITS.get(k.id) || []).filter(t => now - t < 36e5); if (l.length >= (k.limit || 1000)) return { status: 429, error: 'Too many requests for this key in one hour' };
    l.push(now); HITS.set(k.id, l); const u = USE.get(k.id) || { n: 0, days: {} }, d = iso().slice(0, 10); u.n++; u.last = iso(); u.days[d] = (u.days[d] || 0) + 1; USE.set(k.id, u);
    if (area && LEVEL[(k.scopes || {})[area] || 'none'] < lvl) return { status: 403, error: `This key has no ${lvl > 1 ? 'write' : 'read'} access to ${area}` };
    return { k, db };
  }
  const api = (area, lvl, fn) => (req, res) => real(() => { const c = keyOf(req, area, lvl); if (c.error) return res.status(c.status).json({ error: c.error }); try { const out = fn(c.db, req, c.k); if (out === null) return res.status(404).json({ error: 'not found' }); res.json(out); } catch (e) { bad(res, e.message); } });
  app.get('/api/v1/me', api('', 0, (db, req, k) => ({ key: k.name, scopes: k.scopes, limit_per_hour: k.limit })));
  app.get('/api/v1/reviews', api('reviews', 1, (db, req) => F.reviews(db, req.query)));
  app.get('/api/v1/reviews/:id', api('reviews', 1, (db, req) => F.review(db, req.params.id)));
  app.get('/api/v1/agents', api('people', 1, (db, req) => F.agents(db, req.query)));
  app.get('/api/v1/teams', api('people', 1, db => F.teams(db)));
  app.get('/api/v1/scorecards', api('scorecards', 1, db => F.scorecards(db)));
  app.get('/api/v1/stats', api('stats', 1, (db, req) => F.stats(db, req.query)));
  app.get('/api/v1/simulations', api('simulations', 1, (db, req) => F.simulations(db, req.query)));
  app.get('/api/v1/flags', api('flags', 1, (db, req) => F.flags(db, req.query)));
  // a review from another tool, with its total score (the same checks as Import data)
  const addReview = (db, b, k) => { const add = app.locals.importReview; if (!add) throw new Error('not available');
    add(db, { date: b.date, agent: b.agent, id: b.lead, score: b.score === undefined ? '' : String(b.score), channel: b.channel, reviewer: b.reviewer, comment: b.comment }, { username: 'api:' + k.id, name: 'API · ' + k.name });
    save(db); const e = db.evaluations[0]; emit('review.created', reviewOut(db, e)); return reviewOut(db, e); };
  app.post('/api/v1/reviews', api('reviews', 2, (db, req, k) => addReview(db, req.body || {}, k)));
  app.use('/api/v1', (req, res) => res.status(404).json({ error: 'This API address does not exist. See Admin › Integrations › Developer API.' }));

  // ---------------------------------------------------------------- webhooks
  const EVENTS = { 'review.created': 'A review was saved', 'review.updated': 'A review was changed', 'review.deleted': 'A review was deleted', 'dispute.opened': 'An agent disputed a review',
    'dispute.resolved': 'QA resolved a dispute', 'flag.created': 'A quick flag was given', 'task.completed': 'A task was marked done', 'user.created': 'A new user was added', 'simulation.finished': 'A practice call was finished' };
  const PRIV = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^f[cd]/i, /^fe80/i, /^::$/, /^::ffff:(10|127|192\.168|169\.254)\./i];
  const LOCAL_OK = process.env.WEBHOOK_ALLOW_LOCAL === '1';           // only the tests send to a receiver on this computer
  // a webhook address: https only, and never a computer of the local network (a webhook must not be a way into it)
  async function safeUrl(u) {
    let x; try { x = new URL(String(u)); } catch (e) { throw new Error('Write the full address, starting with https://'); }
    if (LOCAL_OK && x.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(x.hostname)) return x.href;
    if (x.protocol !== 'https:' || x.username || x.password) throw new Error('The address must start with https://');
    const ips = net.isIP(x.hostname) ? [{ address: x.hostname }] : await dns.lookup(x.hostname, { all: true }).catch(() => { throw new Error('This address cannot be found'); });
    if (ips.some(i => PRIV.some(r => r.test(i.address)))) throw new Error('A webhook cannot send to an address of a local network');
    return x.href;
  }
  const hookPub = h => ({ id: h.id, name: h.name, url: h.url, events: h.events, active: h.active !== false, secret: h.secret, created: h.created, last: h.last || null, fails: h.fails || 0 });
  const evts = l => (Array.isArray(l) ? l : []).filter(e => Object.hasOwn(EVENTS, e));
  app.get('/api/hooks', need('admin'), (req, res) => real(() => { const db = load(); res.json({ hooks: (db.webhooks || []).map(hookPub), log: (db.hookLog || []).slice(0, 100), events: EVENTS }); }));
  app.post('/api/hooks', need('admin'), async (req, res) => { const b = req.body || {}; let url; try { url = await safeUrl(b.url); } catch (e) { return bad(res, e.message); }
    const ev = evts(b.events); if (!ev.length) return bad(res, 'Choose at least one event');
    real(() => { const db = load(); db.webhooks = db.webhooks || []; if (db.webhooks.length >= 20) return bad(res, 'You can have at most 20 webhooks');
      const h = { id: 'w' + hex(4), name: str(b.name, 60) || new URL(url).hostname, url, events: ev, active: true, secret: 'whsec_' + hex(24), created: iso(), by: req.session.user.username };
      db.webhooks.push(h); save(db); res.json(hookPub(h)); }); });
  app.put('/api/hooks/:id', need('admin'), async (req, res) => { const b = req.body || {}; let url; if (b.url !== undefined) { try { url = await safeUrl(b.url); } catch (e) { return bad(res, e.message); } }
    real(() => { const db = load(), h = (db.webhooks || []).find(x => x.id === req.params.id); if (!h) return res.status(404).json({ error: 'not found' });
      if (url) h.url = url; if (b.name !== undefined) h.name = str(b.name, 60) || h.name; if (b.events !== undefined) { const ev = evts(b.events); if (!ev.length) return bad(res, 'Choose at least one event'); h.events = ev; }
      if (b.active !== undefined) { h.active = !!b.active; if (h.active) h.fails = 0; } if (b.newSecret) h.secret = 'whsec_' + hex(24); save(db); res.json(hookPub(h)); }); });
  app.delete('/api/hooks/:id', need('admin'), (req, res) => real(() => { const db = load(), n = (db.webhooks || []).length; db.webhooks = (db.webhooks || []).filter(x => x.id !== req.params.id);
    if (db.webhooks.length === n) return res.status(404).json({ error: 'not found' }); save(db); res.json({ ok: 1 }); }));
  // one delivery: signed like Stripe (t = time, v1 = HMAC-SHA256 of "time.body" with the secret); up to 3 tries; 20 failures in a row switch the webhook off
  async function deliver(h, payload, attempt = 1) {
    const body = JSON.stringify(payload), t = Math.floor(Date.now() / 1000), sig = crypto.createHmac('sha256', h.secret).update(t + '.' + body).digest('hex'), t0 = Date.now();
    let status = 0, err = '';
    try { await safeUrl(h.url); const r = await fetch(h.url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000), body,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Q-smart-Webhooks/1.0', 'Q-smart-Event': payload.type, 'Q-smart-Delivery': payload.id, 'Q-smart-Signature': `t=${t},v1=${sig}` } });
      status = r.status; await r.arrayBuffer().catch(() => {}); } catch (e) { err = e.name === 'TimeoutError' ? 'No answer within 8 seconds' : String(e.message || e).slice(0, 120); }
    const ok = status >= 200 && status < 300;
    real(() => { const db = load(), x = (db.webhooks || []).find(w => w.id === h.id); if (!x) return;
      x.last = { at: iso(), status, ok }; x.fails = ok ? 0 : (x.fails || 0) + 1; if (x.fails >= 20) x.active = false;
      db.hookLog = [{ id: 'd' + hex(4), hook: h.id, name: h.name, event: payload.type, delivery: payload.id, status, ok, err, ms: Date.now() - t0, attempt, at: iso() }, ...(db.hookLog || [])].slice(0, 200); save(db); });
    if (!ok && attempt < 3) setTimeout(() => deliver(h, payload, attempt + 1), attempt === 1 ? 5000 : 30000).unref();
    return { status, ok, err };
  }
  function emit(type, data) {
    real(() => { const hooks = (load().webhooks || []).filter(h => h.active !== false && h.events.includes(type)); if (!hooks.length) return;
      const payload = { id: 'evt_' + hex(8), type, created: iso(), data }; hooks.forEach(h => { deliver(h, payload).catch(() => {}); }); });
  }
  app.post('/api/hooks/:id/test', need('admin'), async (req, res) => { const h = real(() => (load().webhooks || []).find(x => x.id === req.params.id)); if (!h) return res.status(404).json({ error: 'not found' });
    res.json(await deliver(h, { id: 'evt_' + hex(8), type: 'test.ping', created: iso(), data: { message: 'This is a test from Q-smart. Your webhook works.', webhook: h.name } })); });
  // the events: after a change of the app succeeded, its answer says what happened (one list here, so no route needs to know about webhooks)
  const ON = [
    ['POST', /^\/api\/evaluations$/, 'review.created'], ['PUT', /^\/api\/evaluations\/([^/]+)$/, 'review.updated'], ['DELETE', /^\/api\/evaluations\/([^/]+)$/, 'review.deleted'],
    ['POST', /^\/api\/evaluations\/([^/]+)\/dispute$/, 'dispute.opened'], ['POST', /^\/api\/evaluations\/([^/]+)\/dispute\/resolve$/, 'dispute.resolved'],
    ['POST', /^\/api\/qflags$/, 'flag.created'], ['PUT', /^\/api\/tasks\/[^/]+$/, 'task.completed'], ['POST', /^\/api\/users$/, 'user.created'],
    ['POST', /^\/api\/(sim\/finish|ai\/roleplay\/finish|simulations)$/, 'simulation.finished']
  ];
  app.use('/api', (req, res, next) => {
    const hit = !req.sandbox && ON.find(([m, re]) => m === req.method && re.test(req.baseUrl + req.path)); if (!hit) return next();
    const json = res.json.bind(res); let out; res.json = v => { out = v; return json(v); };
    res.on('finish', () => { if (res.statusCode !== 200 || !out) return; const [, re, type] = hit, m = (req.baseUrl + req.path).match(re);
      real(() => { const db = load(), byRid = rid => { const e = db.evaluations.find(x => x.rid === rid); return e ? reviewOut(db, e) : null; };
        let data = null;
        if (type === 'review.created' || type === 'review.updated') data = out.rid ? reviewOut(db, out) : byRid(m[1]);
        else if (type === 'review.deleted') data = { id: m[1] };
        else if (type.startsWith('dispute.')) data = byRid(m[1]);
        else if (type === 'flag.created') data = flagOut(out);
        else if (type === 'task.completed') data = out.status === 'done' ? { id: out.id, title: out.title, assignee: out.assignee, due: out.due || '', done: iso() } : null;
        else if (type === 'user.created') { const u = db.users.find(x => x.username === out.username); data = u ? { username: u.username, name: u.name, role: u.role, team: tname(db, u.team) } : null; }
        else if (type === 'simulation.finished') data = out.id ? simOut(out) : null;
        if (data) emit(type, data); }); });
    next();
  });

  // ---------------------------------------------------------------- MCP: the same data for AI assistants (JSON-RPC over HTTP, "Streamable HTTP")
  const P = (props, req = []) => ({ type: 'object', properties: props, required: req });
  const S = d => ({ type: 'string', description: d }), N = d => ({ type: 'number', description: d });
  const FIL = { from: S('First day, YYYY-MM-DD'), to: S('Last day, YYYY-MM-DD'), team: S('Team name'), agent: S('Agent username'), limit: N('How many (up to 500, 50 if not given)') };
  const TOOLS = [
    ['get_stats', 'Quality numbers for a period: reviews, average score, pass rate, disputes, and the same per team, per agent and per category (weakest first).', P({ from: FIL.from, to: FIL.to, team: FIL.team, agent: FIL.agent }), 'stats', 1, (db, a) => F.stats(db, a)],
    ['list_reviews', 'QA reviews (newest first) with score, pass or fail, category scores, reviewer comment and dispute.', P(FIL), 'reviews', 1, (db, a) => F.reviews(db, a)],
    ['get_review', 'One review by its id (or by its lead id).', P({ id: S('The review id or the lead id') }, ['id']), 'reviews', 1, (db, a) => F.review(db, String(a.id || '')) || { error: 'No review with this id' }],
    ['list_agents', 'The agents, with their team.', P({ team: FIL.team }), 'people', 1, (db, a) => F.agents(db, { ...a, limit: 500 })],
    ['list_teams', 'The teams, with their lead, number of agents and pass mark.', P({}), 'people', 1, db => F.teams(db)],
    ['list_scorecards', 'The scorecards: categories and questions with their points.', P({}), 'scorecards', 1, db => F.scorecards(db)],
    ['list_simulations', 'Practice calls of the Call Simulator: scenario, score, outcome and indicators.', P(FIL), 'simulations', 1, (db, a) => F.simulations(db, a)],
    ['list_flags', 'Quick flags (red or green) on conversations.', P(FIL), 'flags', 1, (db, a) => F.flags(db, a)],
    ['create_review', 'Save a review from another tool with its total score.', P({ agent: S('Agent username or name'), lead: S('Lead or conversation id'), date: S('YYYY-MM-DD'), score: N('0 to 100'), channel: S('call, chat, email or other'), comment: S('Comment for the agent') }, ['agent', 'lead', 'date', 'score']), 'reviews', 2, (db, a, k) => addReview(db, a, k)]
  ];
  const VERS = ['2025-06-18', '2025-03-26', '2024-11-05'];
  const rpc = (id, result) => ({ jsonrpc: '2.0', id, result }), rpcErr = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  app.get('/mcp', (req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Use POST: this is the Q-smart MCP server (Admin › Integrations › MCP connectors)' }));
  app.post('/mcp', (req, res) => real(() => {
    const m = req.body || {}; if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return res.status(400).json(rpcErr(null, -32600, 'Not a JSON-RPC 2.0 request'));
    if (m.id === undefined) return res.status(202).end();            // a notification (e.g. notifications/initialized): nothing to answer
    const c = keyOf(req, '', 0);
    if (c.error) return res.status(c.status).set('WWW-Authenticate', 'Bearer').json(rpcErr(m.id, -32001, c.error));
    const { k, db } = c, p = m.params || {};
    if (m.method === 'initialize') return res.json(rpc(m.id, { protocolVersion: VERS.includes(p.protocolVersion) ? p.protocolVersion : VERS[0], capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'q-smart', title: 'Q-smart', version: '1.0.0' }, instructions: 'Q-smart is a quality-assurance platform for contact centres. Use get_stats for numbers, list_reviews for the reviews behind them.' }));
    if (m.method === 'ping') return res.json(rpc(m.id, {}));
    const allowed = TOOLS.filter(t => LEVEL[(k.scopes || {})[t[3]] || 'none'] >= t[4]);
    if (m.method === 'tools/list') return res.json(rpc(m.id, { tools: allowed.map(([name, description, inputSchema, , lvl]) => ({ name, description, inputSchema, annotations: { readOnlyHint: lvl < 2 } })) }));
    if (m.method === 'tools/call') { const t = allowed.find(x => x[0] === p.name); if (!t) return res.json(rpcErr(m.id, -32602, 'Unknown tool, or this key has no access to it: ' + p.name));
      try { const out = t[5](db, p.arguments || {}, k); return res.json(rpc(m.id, { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], structuredContent: Array.isArray(out) ? { data: out } : out })); }
      catch (e) { return res.json(rpc(m.id, { content: [{ type: 'text', text: e.message }], isError: true })); } }
    res.json(rpcErr(m.id, -32601, 'Unknown method: ' + m.method));
  }));

  // what the Developers pages show: the address of this app as the visitor sees it (the tunnel's address changes), the areas, events and tools
  app.get('/api/devinfo', need('admin'), (req, res) => res.json({ base: `${req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`, areas: AREAS, events: EVENTS,
    tools: TOOLS.map(([name, description, , area, lvl]) => ({ name, description, area, write: lvl > 1 })) }));
};
