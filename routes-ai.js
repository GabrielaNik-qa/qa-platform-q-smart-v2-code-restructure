// AI and voice settings (Admin › Integrations): the Claude API key, the model, the monthly budget, and the voice keys for later.
// Keys are kept encrypted (AES-256-GCM). The encryption key lives in its own file next to the data (".qsmart-key", or
// $env:KEY_SECRET), so data.json and its backups never hold a usable API key. A key is never sent back to the browser:
// the page only sees whether it is set and its last 4 characters.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ai = require('./ai');
const SIM = require('./sim');
const scoredEv = db => db.evaluations.filter(e => !e.ns);       // decision 14: a review that is "not scored" is in no average                                   // the Call Simulator: segments, levels, written customers, indicators, outcomes

module.exports = ({ FILE, app, load, save, need, bad, newEval, scopeOf, limited, hex, iso, str, notify }) => {
  const KEYFILE = path.join(path.dirname(path.resolve(FILE)), '.qsmart-key');
  const MASTER = (() => {
    if (process.env.KEY_SECRET) return crypto.createHash('sha256').update(process.env.KEY_SECRET).digest();
    try { const k = Buffer.from(fs.readFileSync(KEYFILE, 'utf8').trim(), 'hex'); if (k.length === 32) return k; } catch (e) { /* first start: made below */ }
    const k = crypto.randomBytes(32); try { fs.writeFileSync(KEYFILE, k.toString('hex'), { mode: 0o600 }); } catch (e) { /* read-only folder: keys must be typed again after a restart */ }
    return k;
  })();
  const seal = s => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', MASTER, iv), e = Buffer.concat([c.update(String(s), 'utf8'), c.final()]); return 'v1:' + Buffer.concat([iv, c.getAuthTag(), e]).toString('base64'); };
  const unseal = s => { if (!s || !String(s).startsWith('v1:')) return ''; try { const b = Buffer.from(String(s).slice(3), 'base64'), d = crypto.createDecipheriv('aes-256-gcm', MASTER, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); } catch (e) { return ''; } };

  app.locals.seal = seal; app.locals.unseal = unseal;   // the Stripe keys are kept the same way (routes-billing.js)
  const MODELS = [['claude-opus-5-5', 'Claude Opus 5.5 — best quality'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 — balanced'], ['claude-haiku-5-5', 'Claude Haiku 5.5 — fastest and cheapest']];
  const VOICES = ['browser', 'elevenlabs', 'openai'], KEYS = { anthropic: 'key', elevenlabs: 'elevenKey', openai: 'openaiKey' };
  const month = () => new Date().toISOString().slice(0, 7);
  const conf = db => (db.settings || {}).ai || {};
  const play = db => app.locals.qiContext ? app.locals.qiContext(db) : conf(db).playbook;   // the playbook and the knowledge files (Q-Intelligence)
  // what the AI cost this month, in its own small file: a request that saves the data after an AI call can never wipe it out
  const UFILE = path.join(path.dirname(path.resolve(FILE)), 'ai-usage.json');
  const usage = () => { try { const u = JSON.parse(fs.readFileSync(UFILE, 'utf8')); if (u.month === month()) return u; } catch (e) { /* nothing spent yet */ } return { month: month(), usd: 0, calls: 0 }; };
  const addUse = usd => { const u = usage(); try { fs.writeFileSync(UFILE, JSON.stringify({ month: u.month, usd: Math.round((u.usd + usd) * 1e6) / 1e6, calls: u.calls + 1 })); } catch (e) { /* not fatal */ } };
  // the AI module asks for its settings at every request (a change in Admin › Integrations works at once) and reports what it spent
  ai.setConfig(() => {
    const db = load(), c = conf(db);
    return { key: unseal(c.key) || process.env.ANTHROPIC_API_KEY || '', model: MODELS.some(m => m[0] === c.model) ? c.model : (process.env.ANTHROPIC_MODEL || 'claude-opus-5-5'), budget: Number(c.budget) || 0, used: usage().usd };
  }, addUse);

  const show = db => {
    const c = conf(db), k = n => { const v = unseal(c[KEYS[n]]); return { set: !!v, last4: v ? v.slice(-4) : '', env: !v && n === 'anthropic' && !!process.env.ANTHROPIC_API_KEY }; };
    return { model: ai.MODEL(), models: MODELS.map(([id, name]) => ({ id, name, price: ai.PRICE[id] })), budget: Number(c.budget) || 0, usage: usage(),
      playbook: c.playbook || '', leadAuto: c.leadAuto !== false, rolePlay: !!c.rolePlay, analystAuto: !!c.analystAuto, voice: VOICES.includes(c.voice) ? c.voice : 'browser', elevenVoice: c.elevenVoice || '', keys: { anthropic: k('anthropic'), elevenlabs: k('elevenlabs'), openai: k('openai') }, enabled: ai.enabled() };
  };
  app.get('/api/ai/settings', need('admin'), (req, res) => res.json(show(load())));
  // { model, budget, voice, elevenVoice, anthropicKey, elevenKey, openaiKey } — a key: text to set it, "" to remove it, left out to keep it
  app.put('/api/ai/settings', need('admin'), (req, res) => {
    const b = req.body || {}, db = load(), c = { ...conf(db) };
    if (b.model !== undefined) { if (!MODELS.some(m => m[0] === b.model)) return bad(res, 'Choose one of the models in the list'); c.model = b.model; }
    if (b.budget !== undefined) { const n = Number(b.budget); if (!Number.isFinite(n) || n < 0 || n > 100000) return bad(res, 'The budget must be a number from 0 (no limit) to 100000'); c.budget = Math.round(n * 100) / 100; }
    if (b.voice !== undefined) { if (!VOICES.includes(b.voice)) return bad(res, 'Unknown voice provider'); c.voice = b.voice; }
    if (b.playbook !== undefined) c.playbook = str(b.playbook, 4000);
    if (b.leadAuto !== undefined) c.leadAuto = b.leadAuto === true;          // the AI team lead writes every team's summary on Monday morning   // the company's rules the AI team follows
    if (b.analystAuto !== undefined) c.analystAuto = b.analystAuto === true;  // the AI analyst writes last month's report on the 1st of every month
    if (b.rolePlay !== undefined) c.rolePlay = b.rolePlay === true;          // agents may practise with an AI customer (every message uses the budget)
    if (b.elevenVoice !== undefined) c.elevenVoice = String(b.elevenVoice || '').trim().slice(0, 80);
    for (const [field, slot] of [['anthropicKey', 'key'], ['elevenKey', 'elevenKey'], ['openaiKey', 'openaiKey']]) {
      if (b[field] === undefined) continue;
      const v = typeof b[field] === 'string' ? b[field].trim() : null;
      if (v === null || (v && (v.length < 20 || v.length > 300 || /\s/.test(v)))) return bad(res, 'That key does not look right: paste the whole key, without spaces');
      if (v) c[slot] = seal(v); else delete c[slot];
    }
    db.settings = db.settings || {}; db.settings.ai = c; save(db); res.json(show(db));
  });
  // checks the key and the model with a tiny request (a fraction of a cent)
  app.post('/api/ai/test', need('admin'), async (req, res) => {
    if (!ai.enabled()) return bad(res, 'Add the Claude API key first');
    try { res.json(await ai.ping()); } catch (e) { bad(res, e.message); }
  });

  // ---- AI QA reviewer: drafts on the company scorecard; a person approves them (maybe after changing answers) or rejects them.
  // Approving makes a normal review (the agent is told, it counts everywhere) and keeps how much the person agreed with the AI.
  const { build } = require('./scorecard'), QA = ['admin', 'qa'];
  const mineD = (db, u) => { const s = scopeOf(db, u); return (db.aiDrafts || []).filter(d => { if (!s) return true; const au = db.users.find(x => x.username === d.agent); return !!au && s.teams.has(au.team); }); };
  const simOf = (aiA, fin) => { let n = 0, same = 0; const cats = aiA.map((row, ci) => { let cn = 0, cs = 0; row.forEach((x, ii) => { n++; cn++; if (((fin[ci] || [])[ii] || [])[0] === x[0]) { same++; cs++; } }); return cn ? Math.round(cs / cn * 1000) / 10 : null; }); return { items: n ? Math.round(same / n * 1000) / 10 : null, n, cats }; };
  app.get('/api/ai/drafts', need(...QA), (req, res) => res.json(mineD(load(), req.session.user).slice(0, 300)));
  app.post('/api/ai/drafts', need(...QA), async (req, res) => {
    const b = req.body || {}; let db = load(), text = str(b.tx, 40000), agent = b.agent, date = b.dt, conv = null;
    if (b.conv !== undefined) { conv = (db.conversations || []).find(c => c.id === b.conv); if (!conv) return res.status(404).json({ error: 'not found' }); text = conv.text; agent = conv.agent; date = conv.date; }
    const s = scopeOf(db, req.session.user), sc = db.scorecards.find(x => x.id === b.scid), au = db.users.find(x => x.username === agent && x.role === 'agent' && x.active !== false);
    if (!sc || (s && !s.sc.has(sc.id))) return bad(res, 'Choose a scorecard');
    if (!au || (s && !s.teams.has(au.team))) return bad(res, 'Choose an agent');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return bad(res, 'Choose the date');
    const lead = str(b.id, 60) || (conv ? conv.id : ''); if (!lead) return bad(res, 'Enter the lead ID');
    if (String(text || '').trim().length < 40) return bad(res, 'Paste the transcript (at least a few lines)');
    if (app.locals.vocab) text = app.locals.vocab(db, text);                 // custom vocabulary (Admin › Organization › Business words)
    if (!ai.enabled()) return bad(res, 'Connect the AI (Admin › Integrations) to draft reviews with AI.');
    if (limited('ai-draft:' + req.session.user.username, 40, 36e5)) return res.status(429).json({ error: 'Too many AI drafts in one hour. Try again later.' });
    let r, prev; try { r = await ai.reviewDraft({ text, sc, playbook: play(db) }); prev = build(sc, r.a); } catch (e) { return bad(res, e.message || 'The AI answer did not fit the scorecard. Try again.'); }
    db = load();                                                                 // a fresh copy: the AI took a while to answer
    const d = { id: 'd' + hex(5), agent: au.username, agn: au.name, lead, ch: ['call', 'chat', 'email', 'other'].includes(b.ch) ? b.ch : 'call', dt: date, scid: sc.id, scn: sc.name, tx: text, conv: conv ? conv.id : '',
      a: r.a, cm: r.comment, conf: r.confidence, sc: prev.sc, model: ai.MODEL(), at: iso(), by: req.session.user.username, status: 'draft' };
    db.aiDrafts = [d, ...(db.aiDrafts || [])].slice(0, 500); save(db); res.json(d);
  });
  app.post('/api/ai/drafts/:id/approve', need(...QA), (req, res) => {
    const db = load(), b = req.body || {}, d = mineD(db, req.session.user).find(x => x.id === req.params.id);
    if (!d) return res.status(404).json({ error: 'not found' });
    if (d.status !== 'draft') return bad(res, 'This draft was already decided');
    const r = newEval(db, req.session.user, { scid: d.scid, agent: d.agent, id: d.lead, dt: d.dt, ch: d.ch, a: b.a !== undefined ? b.a : d.a, cm: b.cm !== undefined ? str(b.cm, 1000) : d.cm, tx: d.tx });
    if (r.err) return bad(res, r.err);
    const sim = simOf(d.a, r.ev.cs.map(c => c.it.map(i => [i.a])));
    r.ev.ai = { draft: d.id, model: d.model, aiSc: d.sc, sim: sim.items };
    Object.assign(d, { status: 'approved', rid: r.ev.rid, fsc: r.ev.sc, sim, decided: iso(), dby: req.session.user.username });
    if (d.conv) { const c = (db.conversations || []).find(x => x.id === d.conv); if (c && !c.rid) c.rid = r.ev.rid; }   // AutoQA can compare with this review too
    save(db); res.json({ draft: d, ev: r.ev });
  });
  app.post('/api/ai/drafts/:id/reject', need(...QA), (req, res) => {
    const db = load(), d = mineD(db, req.session.user).find(x => x.id === req.params.id);
    if (!d) return res.status(404).json({ error: 'not found' });
    if (d.status !== 'draft') return bad(res, 'This draft was already decided');
    Object.assign(d, { status: 'rejected', why: str((req.body || {}).why, 300), decided: iso(), dby: req.session.user.username }); save(db); res.json(d);
  });

  // ---- AI team lead: agents at risk (worked out from the reviews, no AI needed), the weekly team summary, coaching plan drafts.
  const LEADS = ['admin', 'qa', 'lead', 'trainer'], DAYMS = 864e5;
  const passOf = (db, t) => { const v = ((db.settings || {}).teams || {})[t]; return v === undefined || v === null || v === '' ? Number((db.settings || {}).pass) || 85 : Number(v); };
  const avgOf = l => l.length ? Math.round(l.reduce((a, x) => a + x, 0) / l.length * 10) / 10 : null;
  const inTeams = (db, u) => { const s = scopeOf(db, u); return t => !s || s.teams.has(t); };
  const evAge = e => (Date.now() - new Date(e.d)) / DAYMS;
  const catAvgs = l => { const m = {}; l.forEach(e => (e.cs || []).forEach(c => { if (c.m > 0) (m[c.n] = m[c.n] || []).push(c.e / c.m * 100); })); return Object.entries(m).map(([n, v]) => ({ n, v: avgOf(v), k: v.length })).sort((a, b) => a.v - b.v); };
  function riskOf(db, see) {
    return db.users.filter(u => u.role === 'agent' && u.active !== false && see(u.team)).map(u => {
      const mine = scoredEv(db).filter(e => e.agent === u.username), w2 = mine.filter(e => evAge(e) < 14), w1 = mine.filter(e => evAge(e) < 7), p1 = mine.filter(e => evAge(e) >= 7 && evAge(e) < 14);
      const a2 = avgOf(w2.map(e => e.sc)), t = passOf(db, u.team), why = [];
      if (w2.length >= 2 && a2 < t) why.push('below target for 2 weeks');
      if (w1.length >= 2 && p1.length >= 2 && avgOf(w1.map(e => e.sc)) <= avgOf(p1.map(e => e.sc)) - 5) why.push('score falling');
      if (w2.some(e => e.sc === 0)) why.push('critical fail');
      if (mine.filter(e => e.dp && e.dp.status === 'open').length >= 2) why.push('several open disputes');
      return { agent: u.username, name: u.name, team: u.team, avg: a2, n: w2.length, target: t, why, weak: catAvgs(mine.filter(e => evAge(e) < 30)).slice(0, 2) };
    }).filter(x => x.why.length).sort((a, b) => b.why.length - a.why.length || (a.avg ?? 100) - (b.avg ?? 100));
  }
  const monday = () => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  function weekStats(db, team) {
    const l = scoredEv(db).filter(e => !team || e.tid === team || (db.users.find(u => u.username === e.agent) || {}).team === team), w = l.filter(e => evAge(e) < 7), p = l.filter(e => evAge(e) >= 7 && evAge(e) < 14), t = passOf(db, team);
    const per = list => ({ reviews: list.length, average: avgOf(list.map(e => e.sc)), passRate: list.length ? Math.round(list.filter(e => e.sc >= t).length / list.length * 100) : null });
    return { team: team ? (db.teams.find(x => x.id === team) || {}).name : 'All teams', target: t, thisWeek: per(w), lastWeek: per(p), weakestCategories: catAvgs(w).slice(0, 3), strongestCategories: catAvgs(w).slice(-2),
      agentsAtRisk: riskOf(db, x => !team || x === team).slice(0, 6).map(x => ({ name: x.name, average: x.avg, why: x.why })), openDisputes: l.filter(e => e.dp && e.dp.status === 'open').length };
  }
  async function writeSummary(team, by, auto) {
    const db0 = load(), stats = weekStats(db0, team), text = await ai.teamSummary(stats, play(db0)), db = load();
    const x = { id: 'w' + hex(5), team: team || '', week: monday(), text, stats, at: iso(), by, auto: !!auto };
    db.aiSummaries = [x, ...(db.aiSummaries || [])].slice(0, 300);
    const lead = (db.teams.find(t => t.id === team) || {}).lead;
    [...new Set([lead, ...db.users.filter(u => u.role === 'admin' && u.active !== false).map(u => u.username)].filter(Boolean))].forEach(u => notify(db, u, 'news', `Weekly AI summary ready: ${stats.team}`, { aisum: x.id }));
    save(db); return x;
  }
  app.get('/api/ai/lead', need(...LEADS), (req, res) => {
    const db = load(), see = inTeams(db, req.session.user);
    res.json({ risk: riskOf(db, see), summaries: (db.aiSummaries || []).filter(x => x.team ? see(x.team) : !scopeOf(db, req.session.user)).slice(0, 40), plans: (db.aiPlans || []).filter(p => see((db.users.find(u => u.username === p.agent) || {}).team)).slice(0, 100) });
  });
  app.post('/api/ai/lead/summary', need(...LEADS), async (req, res) => {   // trainers write summaries too (Gabriela, 4 November)
    const db = load(), team = str((req.body || {}).team, 40);
    if (team ? !db.teams.some(t => t.id === team && !t.system) || !inTeams(db, req.session.user)(team) : scopeOf(db, req.session.user)) return bad(res, 'Choose a team');   // the all-teams summary is only for people who see every team
    if (!ai.enabled()) return bad(res, 'Connect the AI (Admin › Integrations) to write summaries.');
    if (limited('ai-sum:' + req.session.user.username, 20, 36e5)) return res.status(429).json({ error: 'Too many AI summaries in one hour. Try again later.' });
    try { res.json(await writeSummary(team, req.session.user.name, false)); } catch (e) { bad(res, e.message); }
  });
  app.post('/api/ai/lead/plan', need(...LEADS), async (req, res) => {
    const db = load(), au = db.users.find(u => u.username === (req.body || {}).agent && u.role === 'agent' && u.active !== false);
    if (!au || !inTeams(db, req.session.user)(au.team)) return bad(res, 'Choose an agent');
    if (!ai.enabled()) return bad(res, 'Connect the AI (Admin › Integrations) to draft coaching plans.');
    if (limited('ai-plan:' + req.session.user.username, 30, 36e5)) return res.status(429).json({ error: 'Too many AI coaching plans in one hour. Try again later.' });
    const mine = scoredEv(db).filter(e => e.agent === au.username && evAge(e) < 30), risk = riskOf(db, t => t === au.team).find(x => x.agent === au.username);
    const data = { agent: au.name, target: passOf(db, au.team), reviews: mine.length, average: avgOf(mine.map(e => e.sc)), why: risk ? risk.why : [], categories: catAvgs(mine),
      missedItems: mine.flatMap(e => (e.cs || []).flatMap(c => c.it.filter(i => i.a === 'n').map(i => ({ category: c.n, item: i.t, comment: i.cm || '' })))).slice(0, 25), reviewerComments: mine.map(e => e.cm).filter(Boolean).slice(0, 10) };
    if (!mine.length) return bad(res, 'This agent has no reviews in the last 30 days');
    let plan; try { plan = await ai.coachPlan(data, play(db)); } catch (e) { return bad(res, e.message); }
    const db2 = load(), p = { id: 'p' + hex(5), agent: au.username, agn: au.name, status: 'draft', plan, at: iso(), by: req.session.user.username, model: ai.MODEL() };
    db2.aiPlans = [p, ...(db2.aiPlans || [])].slice(0, 300); save(db2); res.json(p);
  });
  // the page makes the coaching session itself (same checks as Coaching), then tells us which session it became
  const planOf = (db, req) => (db.aiPlans || []).find(p => p.id === req.params.id && inTeams(db, req.session.user)((db.users.find(u => u.username === p.agent) || {}).team));
  app.post('/api/ai/lead/plan/:id/approve', need(...LEADS), (req, res) => {
    const db = load(), p = planOf(db, req), sid = str((req.body || {}).sid, 20); if (!p) return res.status(404).json({ error: 'not found' });
    if (p.status !== 'draft') return bad(res, 'This draft was already decided');
    if (!(db.sessions || []).some(s => s.id === sid && s.agents.includes(p.agent))) return bad(res, 'Create the coaching session first');
    Object.assign(p, { status: 'approved', sid, decided: iso(), dby: req.session.user.username }); save(db); res.json(p);
  });
  app.post('/api/ai/lead/plan/:id/reject', need(...LEADS), (req, res) => {
    const db = load(), p = planOf(db, req); if (!p) return res.status(404).json({ error: 'not found' });
    if (p.status !== 'draft') return bad(res, 'This draft was already decided');
    Object.assign(p, { status: 'rejected', decided: iso(), dby: req.session.user.username }); save(db); res.json(p);
  });
  // every hour: on Monday from 08:00, when switched on, the AI team lead writes the summary of every team that has none this week
  let busy = false;
  const weekly = async () => {
    if (busy) return; const now = new Date(); if (now.getDay() !== 1 || now.getHours() < 8) return;
    const db = load(); if (conf(db).leadAuto === false || !ai.enabled()) return;   // on unless an admin switched it off (Gabriela, 4 November)
    busy = true;
    try { for (const t of db.teams.filter(x => !x.system)) if (!(load().aiSummaries || []).some(x => x.team === t.id && x.week === monday())) await writeSummary(t.id, 'AI team lead', true).catch(() => {}); }
    finally { busy = false; }
  };
  if (!process.env.NO_SCHEDULE) setInterval(weekly, 36e5).unref();
  app.locals.aiWeekly = weekly;

  // ---- AI analyst: a question about the quality data, answered from numbers worked out here (the AI only writes the words)
  const PERIODS = { 30: 'Last 30 days', 90: 'Last 90 days', month: 'This month', lastmonth: 'Last month' };
  function spanOf(p, now = new Date()) {
    const d = (y, m) => new Date(y, m, 1);
    if (p === 'month') { const f = d(now.getFullYear(), now.getMonth()); return [f, now, d(now.getFullYear(), now.getMonth() - 1)]; }
    if (p === 'lastmonth') { const f = d(now.getFullYear(), now.getMonth() - 1), t = d(now.getFullYear(), now.getMonth()); return [f, t, d(now.getFullYear(), now.getMonth() - 2)]; }
    const n = Number(p) * DAYMS, t = now; return [new Date(t - n), t, new Date(t - 2 * n)];
  }
  function packOf(db, see, period, team) {
    const [from, to, pfrom] = spanOf(period), tmOf = e => e.tid || (db.users.find(u => u.username === e.agent) || {}).team;
    const all = scoredEv(db).filter(e => { const t = tmOf(e); return see(t) && (!team || t === team); }), at = e => new Date(e.d);
    const cur = all.filter(e => at(e) >= from && at(e) < to), prev = all.filter(e => at(e) >= pfrom && at(e) < from), t = passOf(db, team);
    const per = l => ({ reviews: l.length, average: avgOf(l.map(e => Number(e.sc))), passRate: l.length ? Math.round(l.filter(e => Number(e.sc) >= passOf(db, tmOf(e))).length / l.length * 100) : null, criticalFails: l.filter(e => Number(e.sc) === 0).length });
    const groupBy = (l, k) => l.reduce((m, e) => { const v = k(e) || 'unknown'; (m[v] = m[v] || []).push(e); return m; }, {});
    const tname = id => (db.teams.find(x => x.id === id) || {}).name || (id && id !== 'unknown' ? 'Removed team (' + id + ')' : 'No team');
    const byTeam = Object.entries(groupBy(cur, tmOf)).map(([id, l]) => ({ team: tname(id), ...per(l), previousAverage: avgOf(prev.filter(e => tmOf(e) === id).map(e => Number(e.sc))) }));
    const byChannel = Object.entries(groupBy(cur, e => e.ch || 'call')).map(([ch, l]) => ({ channel: ch, ...per(l) }));
    const pc = catAvgs(prev), byCategory = catAvgs(cur).map(c => ({ category: c.n, average: c.v, previous: (pc.find(x => x.n === c.n) || {}).v ?? null, reviews: c.k }));
    const wk = e => { const x = new Date(e.d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
    const weeks = Object.entries(groupBy(cur, wk)).sort().map(([w, l]) => ({ weekOf: w, reviews: l.length, average: avgOf(l.map(e => Number(e.sc))) }));
    const ag = Object.entries(groupBy(cur, e => e.agent)).filter(([, l]) => l.length >= 2).map(([a, l]) => ({ agent: (db.users.find(u => u.username === a) || {}).name || l[0].agn || a, team: tname(tmOf(l[0])), reviews: l.length, average: avgOf(l.map(e => Number(e.sc))) })).sort((a, b) => b.average - a.average);
    const reviewers = Object.entries(groupBy(cur, e => e.rv || e.by)).map(([r, l]) => ({ reviewer: r, reviews: l.length, average: avgOf(l.map(e => Number(e.sc))) })).sort((a, b) => b.reviews - a.reviews).slice(0, 15);
    const dps = all.filter(e => e.dp && e.dp.at && new Date(e.dp.at) >= from && new Date(e.dp.at) < to);
    const sims = (db.aiDrafts || []).filter(x => x.status === 'approved' && x.sim && new Date(x.decided || x.at) >= from && new Date(x.decided || x.at) < to).map(x => x.sim.items);
    return { period: PERIODS[period], from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), team: team ? tname(team) : 'All teams', target: t,
      thisPeriod: per(cur), previousPeriod: per(prev), byTeam, byChannel, byCategory, weeks, bestAgents: ag.slice(0, 5), lowestAgents: ag.slice(-5).reverse(), reviewers,
      disputes: { opened: dps.length, open: dps.filter(e => e.dp.status === 'open').length, outcomes: dps.reduce((m, e) => { const o = (e.dp.res || {}).outcome; if (o) m[o] = (m[o] || 0) + 1; return m; }, {}) },
      aiReviewerAgreement: sims.length ? { approvedDrafts: sims.length, averageSimilarity: avgOf(sims) } : null,
      attendance: app.locals.attPack ? app.locals.attPack(db, t => see(t) && (!team || t === team)) : null };
  }
  const seesAll = (db, u) => !scopeOf(db, u);
  async function writeReport(db0, see, q, period, team, by, byU, auto) {
    const pack = packOf(db0, see, period, team); if (!pack.thisPeriod.reviews) throw new Error('There are no reviews in this period');
    const text = await ai.analystReport(pack, q, play(db0)), db = load();
    const x = { id: 'a' + hex(5), q, period, team: team || '', text, pack, at: iso(), by, byU, auto: !!auto };
    db.aiReports = [x, ...(db.aiReports || [])].slice(0, 200); save(db); return x;
  }
  const MONTHLY = 'Write the monthly quality report: how we did, what changed against the month before, which teams, categories and agents need attention.';
  app.get('/api/ai/analyst', need(...LEADS), (req, res) => {
    const db = load(), see = inTeams(db, req.session.user), all = seesAll(db, req.session.user);
    res.json({ enabled: ai.enabled(), auto: !!conf(db).analystAuto, periods: PERIODS, reports: (db.aiReports || []).filter(x => x.team ? see(x.team) : all).slice(0, 50) });
  });
  app.post('/api/ai/analyst', need(...LEADS), async (req, res) => {
    const db = load(), b = req.body || {}, me = req.session.user, team = str(b.team, 40), period = String(b.period || '30'), q = str(b.q, 500) || MONTHLY;
    if (!PERIODS[period]) return bad(res, 'Choose the period');
    if (team ? !db.teams.some(t => t.id === team && !t.system) || !inTeams(db, me)(team) : !seesAll(db, me)) return bad(res, 'Choose a team');
    if (!ai.enabled()) return bad(res, 'Connect the AI (Admin › Integrations) to ask the AI analyst.');
    if (limited('ai-ana:' + me.username, 20, 36e5)) return res.status(429).json({ error: 'Too many questions to the AI analyst in one hour. Try again later.' });
    try { res.json(await writeReport(db, inTeams(db, me), q, period, team, me.name, me.username, false)); } catch (e) { bad(res, e.message); }
  });
  app.delete('/api/ai/analyst/:id', need(...LEADS), (req, res) => {
    const db = load(), me = req.session.user, x = (db.aiReports || []).find(r => r.id === req.params.id);
    if (!x || !(me.role === 'admin' || x.byU === me.username)) return res.status(404).json({ error: 'not found' });
    db.aiReports = db.aiReports.filter(r => r !== x); save(db); res.json({ ok: 1 });
  });
  // on the 1st of every month from 08:00, when switched on: last month's report for all teams; the admins are told
  let mbusy = false;
  const monthly = async () => {
    if (mbusy) return; const now = new Date(); if (now.getDate() !== 1 || now.getHours() < 8) return;
    const db = load(), c = conf(db), mon = now.toISOString().slice(0, 7); if (!c.analystAuto || !ai.enabled() || (db.aiReports || []).some(x => x.auto && x.at.slice(0, 7) === mon)) return;
    mbusy = true;
    try {
      const x = await writeReport(db, () => true, MONTHLY, 'lastmonth', '', 'AI analyst', '', true), d2 = load();
      d2.users.filter(u => u.role === 'admin' && u.active !== false).forEach(u => notify(d2, u.username, 'news', 'Monthly AI quality report ready', { aireport: x.id })); save(d2);
    } catch (e) { /* no reviews last month, or the AI is busy: tried again next hour */ } finally { mbusy = false; }
  };
  if (!process.env.NO_SCHEDULE) setInterval(monthly, 36e5).unref();
  app.locals.aiMonthly = monthly;

  // ---- AI trainer: practice calls with an AI customer (Call Simulator), training needs from the reviews, quiz drafts a person publishes
  const SCEN = [
    { id: 'price', name: 'Price objection', who: 'Price-sensitive customer', persona: 'a price-sensitive customer who likes the product', brief: 'You think the price is too high and you saw a cheaper offer. You stay if the agent shows the value and offers a fair option.', open: "Hi, I'm interested, but honestly your price is too high." },
    { id: 'late', name: 'Late delivery', who: 'Angry customer', persona: 'an angry customer', brief: 'Your order is a week late, nobody answered your two e-mails, and you need it for a birthday on Saturday.', open: 'My order is a week late and nobody answers my e-mails!' },
    { id: 'cancel', name: 'Cancellation', who: 'Customer who wants to leave', persona: 'a customer who wants to cancel', brief: 'You want to cancel because you hardly use the service. You might stay for a cheaper plan or a pause, but only if the agent first asks why.', open: 'I want to cancel my subscription today.' },
    { id: 'tech', name: 'Technical problem', who: 'Confused customer', persona: 'a confused, non-technical customer', brief: 'The app keeps logging you out. You do not know your app version and need simple step-by-step help.', open: "The app keeps logging me out and I don't know what to do." },
    { id: 'ident', name: 'Identity check', who: 'Customer in a hurry', persona: 'a customer in a hurry', brief: 'You want your delivery address changed right now and find security questions annoying, but you answer them when the agent explains why.', open: "Just change my address, I don't have time for questions." }
  ];
  const BUILT = [...SCEN, ...SIM.MORE];                           // the customer-service calls above and the reactivation calls of sim.js
  const rpOn = db => !!conf(db).rolePlay && ai.enabled();
  // the scenarios to practise: the built-in ones a trainer or admin did not switch off, and the ones they wrote (AI Simulator › Scenarios)
  const scenList = db => { const off = (db.settings && db.settings.scenOff) || []; return [...BUILT.filter(s => !off.includes(s.id)), ...(db.simScen || []).filter(s => s.active !== false)].map(SIM.full); };
  const scOf = (db, id) => scenList(db).find(s => s.id === id);
  const SCW = ['admin', 'trainer'];
  const scBody = b => {
    const name = str(b.name, 80); if (!name) throw new Error('Give the scenario a name');
    const open = str(b.open, 400); if (!open) throw new Error('Write the first sentence of the customer');
    const who = str(b.who, 60) || 'Customer';
    return { name, who, persona: str(b.persona, 120) || who.toLowerCase(), brief: str(b.brief, 1200), open, ...SIM.extraBody(b) };
  };
  const msgsOf = v => (Array.isArray(v) ? v : []).slice(0, 60).map(m => ({ r: m && m.r === 'a' ? 'a' : 'c', t: str(m && m.t, 600) })).filter(m => m.t);
  // the practice list for everybody: not the situation the customer knows, nor the right outcome (those would give the answers away)
  // the scenarios that train the categories where a person is below the pass mark in the last 30 days (rules only, no AI)
  const suggestFor = (db, un) => { const u = db.users.find(x => x.username === un); if (!u) return [];
    const weak = catAvgs(scoredEv(db).filter(e => e.agent === un && evAge(e) < 30)).filter(c => c.v < passOf(db, u.team)).sort((a, b) => a.v - b.v), list = scenList(db), out = [];
    weak.forEach(c => list.filter(s => SIM.trains(s, c.n) && !out.some(o => o.id === s.id)).sort((a, b) => a.level - b.level).slice(0, 2).forEach(s => out.push({ id: s.id, cat: c.n, avg: c.v })));
    return out.slice(0, 4); };
  app.get('/api/ai/roleplay', need(), (req, res) => { const db = load();
    res.json({ on: rpOn(db), langs: SIM.LANGS, suggested: suggestFor(db, req.session.user.username), scenarios: scenList(db).map(({ id, name, who, open, seg, level, lines, inds, outcomes }) => ({ id, name, who, open, seg, level, lines, inds: inds.map(({ t, kw }) => ({ t, kw })), outcomes })) }); });
  // the AI trainer sends the agents below target in a category a practice scenario that trains it (a notification with the link)
  app.post('/api/ai/trainer/practice', need(...LEADS), (req, res) => {
    const db = load(), me = req.session.user, cat = str((req.body || {}).cat, 80), see = inTeams(db, me), need1 = needsOf(db, see).find(x => x.cat === cat);
    if (!need1) return bad(res, 'Nobody is below target in this category');
    const sc = scenList(db).filter(s => SIM.trains(s, cat)).sort((a, b) => a.level - b.level)[0]; if (!sc) return bad(res, 'No scenario trains this category yet: write one in Q Trainer › Scenarios');
    need1.below.forEach(a => notify(db, a.agent, 'sim', `${me.name} suggests a practice call in Q Trainer: "${sc.name}", to train ${cat}`, { sc: sc.id }));
    save(db); res.json({ sent: need1.below.length, scenario: sc.name });
  });
  app.get('/api/ai/scenarios', need(...SCW), (req, res) => {
    const db = load(), off = (db.settings && db.settings.scenOff) || [];
    res.json({ builtin: BUILT.map(SIM.full).map(({ id, name, who, brief, open, seg, level, lines, inds, outcomes, correct }) => ({ id, name, who, brief, open, seg, level, lines, inds, outcomes, correct, off: off.includes(id) })), custom: db.simScen.map(SIM.full) });
  });
  app.post('/api/ai/scenarios', need(...SCW), (req, res) => {
    const db = load(); try { const s = { id: 'sc' + hex(4), ...scBody(req.body || {}), active: true, by: req.session.user.username, created: iso() }; db.simScen.push(s); save(db); res.json(s); } catch (e) { bad(res, e.message); }
  });
  app.put('/api/ai/scenarios/:id', need(...SCW), (req, res) => {
    const db = load(), b = req.body || {}, id = req.params.id;
    if (BUILT.some(s => s.id === id)) {                                   // a built-in scenario is only switched on or off
      const off = new Set((db.settings.scenOff || []).filter(x => BUILT.some(s => s.id === x))); if (b.off) off.add(id); else off.delete(id);
      db.settings.scenOff = [...off]; save(db); return res.json({ ok: 1 });
    }
    const s = db.simScen.find(x => x.id === id); if (!s) return res.status(404).json({ error: 'not found' });
    try { if (b.active !== undefined && Object.keys(b).length === 1) s.active = !!b.active; else Object.assign(s, scBody(b), { updated: iso() }); save(db); res.json(s); } catch (e) { bad(res, e.message); }
  });
  app.delete('/api/ai/scenarios/:id', need(...SCW), (req, res) => {
    const db = load(); db.simScen = db.simScen.filter(s => s.id !== req.params.id); save(db); res.json({ ok: 1 });
  });
  app.post('/api/ai/roleplay/turn', need(), async (req, res) => {
    const db = load(), b = req.body || {}, sc = scOf(db, b.sc), msgs = msgsOf(b.msgs);
    if (!rpOn(db)) return bad(res, 'Practice with the AI customer is switched off (Admin › Integrations).');
    if (!sc || !msgs.length || msgs[msgs.length - 1].r !== 'a') return bad(res, 'Write your reply first');
    if (msgs.filter(m => m.r === 'a').length > 25) return bad(res, 'This practice call is long enough: finish it to get your score.');
    if (limited('ai-rp:' + req.session.user.username, 150, 36e5)) return res.status(429).json({ error: 'Too many practice messages in one hour. Try again later.' });
    const lang = SIM.LANGS[b.lang], who = lang ? { ...sc, brief: sc.brief + ' Speak only ' + lang + '.' } : sc;
    try { res.json(await ai.roleCustomer(who, msgs, play(db))); } catch (e) { bad(res, e.message); }
  });
  app.post('/api/ai/roleplay/finish', need(), async (req, res) => {
    const db0 = load(), b = req.body || {}, sc = scOf(db0, b.sc), msgs = msgsOf(b.msgs), me = req.session.user;
    if (!rpOn(db0)) return bad(res, 'Practice with the AI customer is switched off (Admin › Integrations).');
    if (!sc || !msgs.some(m => m.r === 'a')) return bad(res, 'Write at least one reply first');
    if (limited('ai-rpf:' + me.username, 30, 36e5)) return res.status(429).json({ error: 'Too many practice calls in one hour. Try again later.' });
    let r; try { r = await ai.roleScore(sc, msgs, play(db0)); } catch (e) { return bad(res, e.message); }
    const db = load(), g = SIM.grade(sc, msgs, outOf(sc, b)), x = simRec(db, me, sc, msgs, b, g, { score: r.score, tips: r.tips, good: r.good, ai: true });
    db.simulations = [x, ...(db.simulations || [])]; save(db); res.json(x);
  });
  // ---- the Call Simulator with the written customer (no AI needed): the agent answers the lines of the scenario, the indicators
  // and the outcome the agent chose give the score (sim.js). It is checked again here: the page cannot send its own score.
  const outOf = (sc, b) => (sc.outcomes || []).includes(b.outcome) ? b.outcome : '';
  const simRec = (db, me, sc, msgs, b, g, more) => { const u = db.users.find(x => x.username === me.username) || {}, secs = Math.max(1, Math.min(14400, Math.round(Number(b.secs) || Number(b.minutes) * 60 || 60)));
    return { id: 'm' + hex(5), agent: me.username, team: u.team || '', sc: sc.id, scenario: sc.name, persona: sc.who, seg: sc.seg, level: sc.level, score: g.score, minutes: Math.max(1, Math.ceil(secs / 60)), secs,
      turns: msgs.filter(m => m.r === 'a').length, mode: b.mode === 'voice' ? 'voice' : 'text', lang: SIM.LANGS[b.lang] ? b.lang : 'en', outcome: outOf(sc, b), right: g.right, best: sc.correct || '', inds: g.inds, fb: g.fb,
      good: g.good, tips: g.tips, ai: false, ...more, result: (more.score ?? g.score) >= 85 ? 'winner' : 'keep practising', tx: ai.talk(msgs).slice(0, 8000), date: iso() }; };
  app.post('/api/sim/finish', need(), (req, res) => {
    const db = load(), b = req.body || {}, sc = scOf(db, b.sc), msgs = msgsOf(b.msgs), me = req.session.user;
    if (!sc || !msgs.some(m => m.r === 'a')) return bad(res, 'Write at least one reply first');
    if (limited('sim-f:' + me.username, 60, 36e5)) return res.status(429).json({ error: 'Too many practice calls in one hour. Try again later.' });
    const x = simRec(db, me, sc, msgs, b, SIM.grade(sc, msgs, outOf(sc, b)), {});
    db.simulations = [x, ...(db.simulations || [])]; save(db); res.json(x);
  });
  function needsOf(db, see) {
    const m = {};
    db.users.filter(u => u.role === 'agent' && u.active !== false && see(u.team)).forEach(u => catAvgs(scoredEv(db).filter(e => e.agent === u.username && evAge(e) < 30)).forEach(c => {
      const x = m[c.n] = m[c.n] || { cat: c.n, all: [], below: [] }; x.all.push(c.v); if (c.v < passOf(db, u.team)) x.below.push({ agent: u.username, name: u.name, avg: c.v });
    }));
    const list = scenList(db);
    return Object.values(m).filter(x => x.below.length).map(x => ({ cat: x.cat, avg: avgOf(x.all), agents: x.all.length, below: x.below.sort((a, b) => a.avg - b.avg), practice: list.filter(s => SIM.trains(s, x.cat)).slice(0, 3).map(s => s.name) }))
      .sort((a, b) => b.below.length - a.below.length || a.avg - b.avg).slice(0, 20);
  }
  const quizRow = q => ({ id: q.id, title: q.title, status: q.status, created: q.created, cat: (q.ai || {}).cat || '', n: ((q.assign || {}).users || []).length, qs: (q.questions || []).length });
  app.get('/api/ai/trainer', need(...LEADS), (req, res) => {
    const db = load(), see = inTeams(db, req.session.user), seeU = a => see((db.users.find(u => u.username === a) || {}).team);
    res.json({ on: rpOn(db), enabled: ai.enabled(), needs: needsOf(db, see), quizzes: (db.quizzes || []).filter(q => q.ai).slice(0, 30).map(quizRow),
      plays: (db.simulations || []).filter(s => s.ai && seeU(s.agent)).slice(0, 40).map(s => ({ ...s, name: (db.users.find(u => u.username === s.agent) || {}).name || s.agent })) });
  });
  app.post('/api/ai/trainer/quiz', need(...LEADS), async (req, res) => {
    const db = load(), b = req.body || {}, me = req.session.user, cat = str(b.cat, 80), see = inTeams(db, me);
    const items = (db.scorecards || []).flatMap(s => (s.cats || []).filter(c => c.n === cat).flatMap(c => (c.it || []).map(i => i.t)));
    if (!cat || !(items.length || db.evaluations.some(e => (e.cs || []).some(c => c.n === cat)))) return bad(res, 'Choose a category');
    if (!ai.enabled()) return bad(res, 'Connect the AI (Admin › Integrations) to draft quizzes.');
    if (limited('ai-quiz:' + me.username, 20, 36e5)) return res.status(429).json({ error: 'Too many AI quizzes in one hour. Try again later.' });
    const agents = [...new Set(Array.isArray(b.agents) ? b.agents : [])].filter(a => { const u = db.users.find(x => x.username === a && x.role === 'agent'); return u && see(u.team); }).slice(0, 200);
    const words = cat.toLowerCase().split(/[^a-z\u00c0-\u024f\u0400-\u04ff]+/).filter(w => w.length > 4);
    const arts = (db.kbArticles || []).filter(a => { const h = (a.title + ' ' + (a.topics || []).join(' ')).toLowerCase(); return h.includes(cat.toLowerCase()) || words.some(w => h.includes(w)); }).slice(0, 6);
    const seeA = a => see((db.users.find(u => u.username === a) || {}).team);   // only the reviews of the agents this person sees
    const missed = db.evaluations.filter(e => evAge(e) < 30 && seeA(e.agent) && (!agents.length || agents.includes(e.agent))).flatMap(e => (e.cs || []).filter(c => c.n === cat).flatMap(c => (c.it || []).filter(i => i.a === 'n').map(i => i.t + (i.cm ? ' (reviewer: ' + i.cm + ')' : '')))).slice(0, 30);
    const text = 'Quality category: ' + cat + '\n\nWhat the scorecard checks:\n' + [...new Set(items)].map(t => '- ' + t).join('\n')
      + (missed.length ? '\n\nWhat agents missed most in recent reviews:\n' + [...new Set(missed)].map(t => '- ' + t).join('\n') : '')
      + arts.map(a => '\n\n# ' + a.title + '\n' + String(a.body || '').slice(0, 15000)).join('');
    let questions; try { questions = (await ai.draftQuiz({ text, count: 5 })).questions; } catch (e) { return bad(res, e.message); }
    const db2 = load(), q = { id: 'q' + hex(4), title: cat + ': refresher quiz', desc: 'Drafted by the AI trainer from the reviews of the last 30 days.', kind: 'category', topics: [cat], articles: arts.map(a => a.id), pass: 80, due: '',
      assign: { all: false, teams: [], users: agents }, status: 'draft', questions, by: me.name, created: iso(), ai: { cat, model: ai.MODEL(), by: me.username } };
    db2.quizzes = [q, ...(db2.quizzes || [])]; save(db2); res.json(quizRow(q));
  });
};
