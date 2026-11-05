// Organization (Admin › Organization): the company profile, data protection (how long each kind of data is kept, after which it is
// deleted by itself; a person's data downloaded on request), sign-in rules, and the business words (call types, topics tracked in
// conversations, custom vocabulary that fixes misspelled words in transcripts).
// Q-Intelligence: knowledge files the AI reads with every answer, AI agents run on one review or one agent, and AI insights
// (objections, competitors, product feedback) found in what customers and reviewers wrote; topics are counted without the AI.
const fs = require('fs'), path = require('path'), ai = require('./ai');
module.exports = ({ app, load, save, need, bad, hex, iso, str, list, setOut, limited, seesUser, scopeOf }) => {
  const STAFF = ['admin', 'qa', 'lead', 'trainer'];
  const MONTHS = v => Math.min(120, Math.max(0, parseInt(v) || 0));   // 0 = keep for ever
  const TXDAYS = [0, 7, 14, 30, 60, 90, 180, 365];                       // transcripts: kept this many days (0 = for ever)
  const KEEP = ['rec', 'notif', 'sim', 'ai', 'audit'];

  // ---------------------------------------------------------------- the organization settings (admins)
  app.put('/api/org', need('admin'), (req, res) => {
    const db = load(), b = req.body || {}, s = db.settings;
    if (b.org) { const o = b.org; s.org = { name: str(o.name, 120), legal: str(o.legal, 160), address: str(o.address, 200), city: str(o.city, 80), country: str(o.country, 80), vat: str(o.vat, 40), web: str(o.web, 160), billing: str(o.billing, 160), support: str(o.support, 160), dpo: str(o.dpo, 120), dpoEmail: str(o.dpoEmail, 160), tz: str(o.tz, 60), logo: /^https:\/\//.test(o.logo || '') ? str(o.logo, 400) : '' }; }
    if (b.privacy) { const p = b.privacy; s.privacy = { keep: Object.fromEntries(KEEP.map(k => [k, MONTHS((p.keep || {})[k])])), agentsRec: p.agentsRec !== false, agentsReviewer: p.agentsReviewer !== false, note: str(p.note, 2000), txDays: TXDAYS.includes(+p.txDays) ? +p.txDays : 0 }; }
    if (b.signin) { const g = b.signin; s.signin = { pwMin: Math.min(32, Math.max(8, parseInt(g.pwMin) || 10)), lockAfter: Math.min(20, Math.max(3, parseInt(g.lockAfter) || 10)), openReg: g.openReg === true }; }   // openReg: anybody may ask for an account (else by invitation only)
    if (b.words) { const w = b.words; s.words = { types: list(w.types, 60, 40), topics: (Array.isArray(w.topics) ? w.topics : []).slice(0, 60).map(t => ({ name: str(t && t.name, 60), words: list(t && t.words, 40, 60).map(x => x.toLowerCase()) })).filter(t => t.name && t.words.length), vocab: (Array.isArray(w.vocab) ? w.vocab : []).slice(0, 200).map(v => ({ term: str(v && v.term, 60), wrong: list(v && v.wrong, 30, 60) })).filter(v => v.term && v.wrong.length) }; }
    save(db); res.json(setOut(db, req.session.user));
  });

  // ---------------------------------------------------------------- data protection: delete what is older than the chosen months
  const REC = path.resolve(process.env.REC_DIR || process.env.RECORDINGS_DIR || path.join(require('os').homedir(), 'Documents', 'Q-smart recordings'));
  const olderThan = (d, m) => d && m && Date.now() - new Date(d).getTime() > m * 30.44 * 864e5;
  function purge(db, audit) {
    const pv = (db.settings || {}).privacy || {}, k = pv.keep || {}, out = { rec: 0, notif: 0, sim: 0, ai: 0, audit: 0, tx: 0 };
    // transcripts (4 November): after the chosen days only the text goes; the review, its scores, the comments and the dialer link stay
    const txOld = d => pv.txDays && d && Date.now() - new Date(d).getTime() > pv.txDays * 864e5;
    if (pv.txDays) { db.evaluations.forEach(e => { if (e.tx && txOld(e.at || e.d)) { e.tx = ''; e.txGone = iso(); out.tx++; } }); (db.conversations || []).forEach(c => { if (c.text && txOld(c.created || c.date)) { c.text = ''; c.txGone = iso(); out.tx++; } }); }
    if (k.rec) db.evaluations.forEach(e => { if (e.rec && olderThan(e.at || e.d, k.rec)) { try { fs.rmSync(path.join(REC, path.basename(e.rec)), { force: true }); } catch (x) { /* already gone */ } e.rec = ''; out.rec++; } });
    if (k.notif) { const n = db.notifications.length; db.notifications = db.notifications.filter(x => !olderThan(x.at, k.notif)); out.notif = n - db.notifications.length; }
    if (k.sim) (db.simulations || []).forEach(x => { if (x.tx && olderThan(x.date, k.sim)) { delete x.tx; out.sim++; } });
    if (k.ai) ['aiDrafts', 'aiReports', 'aiPlans', 'aiWeekly'].forEach(c => { if (!Array.isArray(db[c])) return; const n = db[c].length; db[c] = db[c].filter(x => !olderThan(x.at, k.ai)); out.ai += n - db[c].length; });
    if (k.audit && audit && audit.prune) out.audit = audit.prune(k.audit);
    return out;
  }
  const runPurge = () => { try { const db = load(), o = purge(db, app.locals.audit); if (Object.values(o).some(Boolean)) { (db.settings.privacy = db.settings.privacy || {}).last = { at: iso(), ...o }; save(db); } } catch (e) { /* tried again later */ } };
  setTimeout(runPurge, 20000); setInterval(runPurge, 12 * 36e5).unref();
  app.post('/api/org/purge', need('admin'), (req, res) => { const db = load(), o = purge(db, app.locals.audit); (db.settings.privacy = db.settings.privacy || {}).last = { at: iso(), ...o }; save(db); res.json(o); });

  // a person's data (the right of access): everything stored about one person, in one file
  app.get('/api/org/person/:u', need('admin'), (req, res) => {
    const db = load(), un = req.params.u, u = db.users.find(x => x.username === un); if (!u) return res.status(404).json({ error: 'not found' });
    const { hash, reset, pwv, ...me } = u, mine = (c, f) => (Array.isArray(db[c]) ? db[c] : []).filter(x => x && f(x)), has = (l, v) => Array.isArray(l) && l.includes(v);
    const email = String(u.email || '').toLowerCase(), aud = app.locals.audit && app.locals.audit.of ? app.locals.audit.of(un) : [];
    res.setHeader('Content-Disposition', `attachment; filename="personal-data-${un.replace(/[^\w.-]/g, '')}.json"`);
    res.json({ exported: iso(), by: req.session.user.username, person: me,
      registration: mine('registrations', r => r.username === un || (email && String(r.email || '').toLowerCase() === email)).map(({ hash: h, ...r }) => r),
      reviews: mine('evaluations', e => e.agent === un || e.by === un), tasks: mine('tasks', t => t.assignee === un || t.by === un), sessions: mine('sessions', s => has(s.agents, un) || s.by === un),
      calibrations: mine('calibrations', c => has(c.participants, un)), quickFlags: mine('qflags', f => f.agent === un), simulations: mine('simulations', s => s.agent === un), surveys: mine('surveys', s => s.agent === un),
      autoQa: mine('conversations', c => c.agent === un), aiDrafts: mine('aiDrafts', d => d.agent === un), aiCoachingPlans: mine('aiPlans', p => p.agent === un),
      goals: mine('goals', g => g.scope === 'agent' && g.target === un), improvementPlans: mine('pips', p => p.agent === un), recognition: mine('kudos', k => k.to === un || k.by === un),
      complaints: mine('complaints', c => c.agent === un), risks: mine('risks', r => r.agent === un || r.owner === un), quizAttempts: mine('attempts', a => a.u === un || a.user === un || a.agent === un),
      articlesRead: (db.kbReads || {})[un] || {}, attendance: Object.fromEntries(Object.entries(db.att || {}).map(([d, m]) => [d, m && m[un]]).filter(([, v]) => v)),
      attendanceCorrections: mine('attFix', f => f.u === un), timeOff: mine('leaves', l => l.u === un), timeOffAdjustments: mine('leaveAdj', a => a.u === un),
      notifications: mine('notifications', n => n.u === un || n.to === un), auditLog: aud });
  });

  // ---------------------------------------------------------------- Q-Intelligence: knowledge files
  const kn = db => (db.knowledge = Array.isArray(db.knowledge) ? db.knowledge : []);
  app.get('/api/qi/knowledge', need(...STAFF), (req, res) => res.json(kn(load()).map(({ text, ...f }) => ({ ...f, preview: String(text || '').slice(0, 300) }))));
  app.post('/api/qi/knowledge', need('admin', 'qa', 'trainer'), (req, res) => {
    const db = load(), b = req.body || {}, name = str(b.name, 100), text = String(b.text || '').slice(0, 300000);
    if (!/\.(md|txt)$/i.test(name)) return bad(res, 'Only .md and .txt files');
    if (!text.trim()) return bad(res, 'The file is empty');
    if (kn(db).length >= 40) return bad(res, 'At most 40 knowledge files');
    const f = { id: 'n' + hex(4), name, size: text.length, text, at: iso(), by: req.session.user.username }; kn(db).push(f); save(db); const { text: t, ...out } = f; res.json(out);
  });
  app.delete('/api/qi/knowledge/:id', need('admin', 'qa', 'trainer'), (req, res) => { const db = load(); db.knowledge = kn(db).filter(f => f.id !== req.params.id); save(db); res.json({ ok: 1 }); });
  // what the AI reads with every answer: the playbook (Admin › Integrations) and the knowledge files
  const context = db => { const k = kn(db).map(f => `### ${f.name}\n${f.text}`).join('\n\n').slice(0, 24000), p = ((db.settings || {}).ai || {}).playbook || ''; return [p, k && 'Company knowledge:\n' + k].filter(Boolean).join('\n\n'); };
  app.locals.qiContext = context;
  // custom vocabulary (Business words): every wrong spelling the transcription makes becomes the right one
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  app.locals.vocab = (db, t) => (((db.settings || {}).words || {}).vocab || []).reduce((s, v) => v.wrong.reduce((x, w) => x.replace(new RegExp('(^|[^\\p{L}\\p{N}])' + reEsc(w) + '(?![\\p{L}\\p{N}])', 'giu'), (m, a) => a + v.term), s), String(t || ''));

  // ---------------------------------------------------------------- Q-Intelligence: AI agents on one review or one agent
  const reviewText = e => [`Review of lead ${e.id} · agent ${e.agent} · ${e.ch || 'call'} · ${String(e.d || '').slice(0, 10)} · ${e.ns ? 'not scored' : 'score ' + e.sc + '%'} · scorecard ${e.scn || ''}`, ...(e.cs || []).map(c => `${c.n}: ${c.e}/${c.m}` + (c.it || []).filter(i => i.a === 'n' || i.cm).map(i => `\n  - ${i.t}: ${i.a === 'n' ? 'missed' : i.a}${i.rc ? ' (root cause: ' + i.rc + ')' : ''}${i.cm ? ' — ' + i.cm : ''}`).join('')), e.cm ? 'Reviewer comment: ' + e.cm : '', e.tx ? 'Transcript:\n' + String(e.tx).slice(0, 12000) : ''].filter(Boolean).join('\n');
  const AGENTS = {
    summary: ['call summary', 'Write a short call summary for a team lead: what happened, what went well, what went wrong, in 5-8 bullet points. Plain language, no jargon.'],
    next: ['next steps', 'List the concrete next steps after this call: for the agent, for the team lead, and anything owed to the customer, each with who and when. Short bullet points.'],
    email: ['follow-up email', 'Draft a short, friendly follow-up email from the agent to the customer that recaps what was agreed and the next steps. Do not invent facts that are not in the review.'],
    coach: ['coaching brief', 'Write a coaching brief for the team lead: the 2-3 behaviours to work on (from the missed items and root causes), one example question to ask the agent for each, and one thing to praise.'],
    o2o: ['one-to-one prep', 'Prepare the team lead for a one-to-one with this agent: performance in numbers, strengths, the 3 areas to improve with evidence, objectives to propose for next month, and 3 questions to ask.']
  };
  app.post('/api/qi/agent', need(...STAFF), async (req, res) => {
    const db = load(), b = req.body || {}, me = req.session.user, a = AGENTS[b.kind]; if (!a) return bad(res, 'Choose an AI agent');
    if (!ai.enabled()) return bad(res, 'Connect the AI (Admin › Integrations) to use the AI agents.');
    if (limited('qi-agent:' + me.username, 40, 36e5)) return res.status(429).json({ error: 'Too many AI requests in one hour. Try again later.' });
    let text;
    if (b.kind === 'o2o') {
      const u = db.users.find(x => x.username === b.agent && x.role === 'agent'); if (!u || !seesUser(db, me, u.username)) return bad(res, 'Choose the agent');
      const l = db.evaluations.filter(e => !e.ns && e.agent === u.username && Date.now() - new Date(e.d || e.at) < 31 * 864e5).slice(0, 25);
      if (!l.length) return bad(res, 'This agent has no reviews in the last 30 days');
      text = `Agent: ${u.name}\nReviews in the last 30 days: ${l.length}, average ${Math.round(l.reduce((s, e) => s + e.sc, 0) / l.length * 10) / 10}%\n\n` + l.map(reviewText).join('\n\n').slice(0, 30000);
    } else {
      const e = db.evaluations.find(x => x.rid === b.rid && seesUser(db, me, x.agent)); if (!e) return bad(res, 'Choose a review');
      text = reviewText(e);
    }
    try {
      const out = await ai.ask(`You are Q-Intelligence, the AI of a customer-service quality platform. Task: ${a[0]}. ${a[1]} Use Markdown. Answer in the language of the reviews.` + (context(db) ? '\n\nCompany context (follow it):\n' + context(db) : ''), [{ type: 'text', text }], 1500);
      res.json({ kind: b.kind, text: out });
    } catch (e) { bad(res, e.message); }
  });

  // ---------------------------------------------------------------- Q-Intelligence: insights from what customers and reviewers wrote
  // only the texts about the agents the person sees: reviews, survey answers and AutoQA conversations of other workspaces never reach the AI
  const texts = (db, me, days) => { const since = Date.now() - days * 864e5, out = [];
    db.evaluations.filter(e => new Date(e.d || e.at) >= since && seesUser(db, me, e.agent)).forEach(e => { if (e.cm) out.push(['review', e.cm]); (e.cs || []).forEach(c => (c.it || []).forEach(i => { if (i.cm) out.push(['review', i.cm]); })); if (e.tx) out.push(['transcript', String(e.tx).slice(0, 3000)]); });
    (db.surveys || []).filter(s => s.comment && new Date(s.date) >= since && seesUser(db, me, s.agent)).forEach(s => out.push(['survey', s.comment]));
    (db.conversations || []).filter(c => new Date(c.at || c.date || 0) >= since && seesUser(db, me, c.agent)).forEach(c => { if (c.text) out.push(['conversation', String(c.text).slice(0, 3000)]); });
    return out; };
  // an insight keeps the teams it was made from (none = every team): it is shown only to people who see all of those teams
  const teamsOf = (db, me) => { const s = scopeOf(db, me); return s ? [...s.teams].sort() : null; };
  const seesInsight = (db, me, x) => { const s = scopeOf(db, me); return !s || (Array.isArray(x.teams) && x.teams.every(t => s.teams.has(t))); };
  // topics: the keywords of each topic counted in the texts (no AI needed)
  app.get('/api/qi/topics', need(...STAFF), (req, res) => {
    const db = load(), days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30)), tops = (((db.settings || {}).words || {}).topics) || [], l = texts(db, req.session.user, days).map(x => x[1].toLowerCase());
    res.json({ days, texts: l.length, topics: tops.map(t => ({ name: t.name, words: t.words, hits: l.filter(x => t.words.some(w => x.includes(w))).length })) });
  });
  const KINDS = { objections: 'the customer objections (why customers say no, hesitate or complain)', competitors: 'the competitors and other brands customers mention, and what they say about them', feedback: 'the product and service feedback (what customers like, dislike or ask for)' };
  app.post('/api/qi/insights', need(...STAFF), async (req, res) => {
    const db = load(), b = req.body || {}, me = req.session.user, k = KINDS[b.kind]; if (!k) return bad(res, 'Choose what to look for');
    if (!ai.enabled()) return bad(res, 'Connect the AI (Admin › Integrations) to find insights.');
    if (limited('qi-ins:' + me.username, 15, 36e5)) return res.status(429).json({ error: 'Too many AI requests in one hour. Try again later.' });
    const days = Math.min(365, Math.max(7, parseInt(b.days) || 30)), l = texts(db, me, days); if (!l.length) return bad(res, 'Nothing was written in this period');
    const body = l.map(([s, t]) => `[${s}] ${t}`).join('\n').slice(0, 60000);
    try {
      const raw = await ai.ask(`You are Q-Intelligence, the AI of a customer-service quality platform. From the texts below (review comments, transcripts, survey comments), find ${k}. Group them into themes. Reply ONLY with JSON: {"themes":[{"theme":"short name","count":number of texts,"summary":"one sentence","examples":["short quote", "short quote"]}]}, at most 8 themes, the biggest first.` + (context(db) ? '\n\nCompany context:\n' + context(db).slice(0, 6000) : ''), [{ type: 'text', text: body }], 2000);
      const m = String(raw).match(/\{[\s\S]*\}/); let j = null; try { j = m && JSON.parse(m[0]); } catch (e) { j = null; }
      const themes = (j && Array.isArray(j.themes) ? j.themes : []).slice(0, 8).map(t => ({ theme: str(t.theme, 80), count: Math.max(0, parseInt(t.count) || 0), summary: str(t.summary, 300), examples: list(t.examples, 3, 200) })).filter(t => t.theme);
      const x = { id: 'i' + hex(4), kind: b.kind, days, texts: l.length, themes, text: themes.length ? '' : str(raw, 4000), at: iso(), by: me.username, teams: teamsOf(db, me) };
      db.qiInsights = [x, ...(db.qiInsights || []).filter(y => y.kind !== b.kind || y.by !== me.username)].slice(0, 30); save(db); res.json(x);
    } catch (e) { bad(res, e.message); }
  });
  app.get('/api/qi/insights', need(...STAFF), (req, res) => { const db = load(); res.json((db.qiInsights || []).filter(x => seesInsight(db, req.session.user, x))); });
};
