// Auto QA: conversations (transcripts) rated automatically by the Auto QA categories.
const ai = require('./ai');
const { scoreConv } = require('./autoqa');
module.exports = ({ app, load, save, need, bad, hex, iso, str, userBy, scopeOf, seesUser, limited }) => {
  const EDIT = ['admin', 'qa'], DAY = /^\d{4}-\d{2}-\d{2}$/;
  const visible = (db, u) => { const s = scopeOf(db, u); return db.conversations.filter(c => { if (u.role === 'agent') return c.agent === u.username; const us = userBy(db, c.agent); return !s || s.teams.has(us ? us.team : ''); }); };
  const convOf = (db, u, id) => visible(db, u).find(c => c.id === id);                 // one conversation this person may change (their own workspace)
  app.get('/api/autoqa', need(), (req, res) => { const db = load(); res.json({ cats: db.autoCats, conversations: visible(db, req.session.user), ai: ai.enabled() }); });
  app.post('/api/autoqa/conversations', need(...EDIT), (req, res) => {
    const db = load(), b = req.body || {}, text = (app.locals.vocab || ((d, t) => t))(db, str(b.text, 30000));   // custom vocabulary fixes the transcription's spellings
    const ag = userBy(db, str(b.agent, 40)); if (!ag || ag.role !== 'agent' || !seesUser(db, req.session.user, ag.username)) return bad(res, 'Choose the agent');
    if (!text) return bad(res, 'Paste the conversation'); if (!DAY.test(b.date || '')) return bad(res, 'Choose the date');
    const c = { id: 'cv' + hex(4), agent: ag.username, agn: ag.name, date: b.date, text, rid: str(b.rid, 40), auto: scoreConv(text, db.autoCats.filter(x => x.enabled !== false)), by: req.session.user.name, created: iso() };
    db.conversations.unshift(c); save(db); res.json(c);
  });
  app.post('/api/autoqa/run', need(...EDIT), async (req, res) => {                // (re)rate every conversation with the current categories
    const db = load(), mode = (req.body || {}).mode === 'ai' ? 'ai' : 'rules', cats = db.autoCats.filter(x => x.enabled !== false);
    if (mode === 'ai' && limited('ai-run:' + req.session.user.username, 5, 36e5)) return res.status(429).json({ error: 'Too many AI requests. Try again later.' });   // one run = up to 40 AI requests
    try {
      const got = new Map();
      for (const c of visible(db, req.session.user)) { if (!c.text) continue; if (mode === 'ai' && got.size >= 40) break; got.set(c.id, mode === 'ai' ? await ai.scoreConversation(c.text, cats) : scoreConv(c.text, cats)); }
      const now = load(); now.conversations.forEach(c => { if (got.has(c.id)) c.auto = got.get(c.id); });   // AI rating takes a while: save onto fresh data so nobody's changes are lost
      save(now); res.json({ ok: 1, count: got.size, mode });
    } catch (e) { bad(res, e.message); }
  });
  app.put('/api/autoqa/conversations/:id/edit', need(...EDIT), (req, res) => {    // a reviewer corrects one Auto QA score ("modified")
    const db = load(), c = convOf(db, req.session.user, req.params.id), b = req.body || {}; if (!c) return res.status(404).json({ error: 'not found' });
    if (!db.autoCats.some(x => x.id === b.cat)) return bad(res, 'Unknown category'); const s = Number(b.score); if (!(s >= 0 && s <= 100)) return bad(res, 'The score must be between 0 and 100');
    c.edits = c.edits || {}; if (b.clear) delete c.edits[b.cat]; else c.edits[b.cat] = Math.round(s); c.editedBy = req.session.user.name; save(db); res.json(c);
  });
  app.put('/api/autoqa/conversations/:id/link', need(...EDIT), (req, res) => {    // connect the conversation to a manual review (used for the accuracy score)
    const db = load(), c = convOf(db, req.session.user, req.params.id), rid = str((req.body || {}).rid, 40); if (!c) return res.status(404).json({ error: 'not found' });
    if (rid && !db.evaluations.some(e => e.rid === rid)) return bad(res, 'No such review'); c.rid = rid; save(db); res.json(c);
  });
  app.delete('/api/autoqa/conversations/:id', need(...EDIT), (req, res) => {
    const db = load(), c = convOf(db, req.session.user, req.params.id); if (!c) return res.status(404).json({ error: 'not found' });
    db.conversations = db.conversations.filter(x => x !== c); save(db); res.json({ ok: 1 });
  });
};
