// The Help Center website (3 November): a public website like the Zendesk Help Center, at /hc (and at the help.… subdomain).
// Categories hold sections, sections hold articles about Q-smart. Anybody can read the published articles, without signing in;
// only admins write them (Admin › Help Center website). Nothing of the company's own data (reviews, people) is ever shown here.
const fresh = require('./hc-default');
module.exports = ({ app, load, save, need, bad, hex, iso, str, list }) => {
  // the website as it is now: the starting articles until an admin saves the first change (reading never writes data.json)
  const hcOf = db => db.hc || fresh();
  // an admin can switch the whole website off (Admin › Features › Beta features): then it answers as if it did not exist
  app.use('/api/hc', (req, res, next) => ((load().settings || {}).beta || {}).hcsite === false && req.method === 'GET' ? res.status(404).json({ error: 'The Help Center is switched off' }) : next());
  const own = db => { if (!db.hc) db.hc = fresh(); return db.hc; };
  const isAdm = req => !!(req.session && req.session.user && req.session.user.role === 'admin' && !req.session.user.mustChange);
  const plainText = s => String(s || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#>*`_-]+/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
  const pubArt = a => ({ id: a.id, sec: a.sec, title: a.title, promoted: !!a.promoted, draft: !!a.draft, labels: a.labels || [], updated: a.updated, order: a.order || 0, text: plainText(a.body).slice(0, 3000) });
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

  // the whole website for the visitor: drafts only for admins (the editor asks with ?all=1)
  app.get('/api/hc', (req, res) => {
    const db = load(), h = hcOf(db), all = isAdm(req) && req.query.all === '1', b = (db.settings || {}).brand || {};
    res.json({ name: h.name, intro: h.intro, brand: { name: b.name || '', color: b.color || '', logo: b.logo || '' },
      cats: [...h.cats].sort(byOrder), secs: [...h.secs].sort(byOrder),
      arts: h.arts.filter(a => all || !a.draft).sort(byOrder).map(a => all ? { ...pubArt(a), up: a.up || 0, down: a.down || 0 } : pubArt(a)), editor: isAdm(req) });
  });
  app.get('/api/hc/a/:id', (req, res) => {
    const db = load(), a = hcOf(db).arts.find(x => x.id === req.params.id);
    if (!a || (a.draft && !isAdm(req))) return res.status(404).json({ error: 'This article does not exist (any more)' });
    const v = ((req.session || {}).hcv || {})[a.id] || '';
    res.json({ id: a.id, sec: a.sec, title: a.title, body: a.body, labels: a.labels || [], author: a.author || '', created: a.created, updated: a.updated, draft: !!a.draft, up: a.up || 0, down: a.down || 0, mine: v });
  });

  // "Was this article helpful?": one answer per visitor (it can be changed); at most 30 answers an hour from one address
  const VOTES = new Map();
  app.post('/api/hc/a/:id/vote', (req, res) => {
    const v = (req.body || {}).v; if (!['up', 'down'].includes(v)) return bad(res, 'Answer yes or no');
    const now = Date.now(), k = req.ip, l = (VOTES.get(k) || []).filter(t => now - t < 36e5);
    if (l.length >= 30) return res.status(429).json({ error: 'Too many answers, try again later' });
    const db = load(), art = own(db).arts.find(x => x.id === req.params.id);
    if (!art || art.draft) return res.status(404).json({ error: 'This article does not exist (any more)' });
    const hv = req.session.hcv = req.session.hcv || {}, was = hv[art.id];
    if (was !== v) { if (was) art[was] = Math.max(0, (art[was] || 0) - 1); art[v] = (art[v] || 0) + 1; hv[art.id] = v; l.push(now); VOTES.set(k, l); save(db); }
    if (VOTES.size > 5000) VOTES.clear();
    res.json({ up: art.up || 0, down: art.down || 0, mine: v });
  });

  // ---------------------------------------------------------------- the editor (admins only)
  const int = v => Number.isInteger(v) ? Math.max(0, Math.min(v, 9999)) : 0;
  const BODY = {
    cats: (b, h) => { const name = str(b.name, 80); if (!name) throw new Error('Give the category a name'); return { name, desc: str(b.desc, 300), icon: str(b.icon, 8) || '📁', order: int(b.order ?? h.cats.length) }; },
    secs: (b, h) => { const name = str(b.name, 80); if (!name) throw new Error('Give the section a name'); if (!h.cats.some(c => c.id === b.cat)) throw new Error('Choose a category');
      return { cat: b.cat, name, desc: str(b.desc, 300), order: int(b.order ?? h.secs.length) }; },
    arts: (b, h) => { const title = str(b.title, 160); if (!title) throw new Error('Give the article a title'); if (!h.secs.some(s => s.id === b.sec)) throw new Error('Choose a section');
      return { sec: b.sec, title, body: str(b.body, 100000), labels: list(b.labels, 10, 40), promoted: !!b.promoted, draft: !!b.draft, order: int(b.order ?? h.arts.length) }; }
  };
  const PFX = { cats: 'c-', secs: 's-', arts: 'a-' };
  app.put('/api/hc/site', need('admin'), (req, res) => { const db = load(), h = own(db), b = req.body || {}; const name = str(b.name, 80); if (!name) return bad(res, 'Give the website a name');
    h.name = name; h.intro = str(b.intro, 200); save(db); res.json({ name: h.name, intro: h.intro }); });
  app.post('/api/hc/:kind', need('admin'), (req, res, next) => { const k = req.params.kind; if (!BODY[k]) return next();
    const db = load(), h = own(db); try { const x = { id: PFX[k] + hex(4), ...BODY[k](req.body || {}, h) };
      if (k === 'arts') Object.assign(x, { author: req.session.user.name, created: iso(), updated: iso(), up: 0, down: 0 });
      h[k].push(x); save(db); res.json(x); } catch (e) { bad(res, e.message); } });
  app.put('/api/hc/:kind/:id', need('admin'), (req, res, next) => { const k = req.params.kind; if (!BODY[k]) return next();
    const db = load(), h = own(db), x = h[k].find(r => r.id === req.params.id); if (!x) return res.status(404).json({ error: 'not found' });
    try { Object.assign(x, BODY[k]({ order: x.order, ...(req.body || {}) }, h), k === 'arts' ? { updated: iso(), editor: req.session.user.name } : {}); save(db); res.json(x); } catch (e) { bad(res, e.message); } });
  // a category or section can only be deleted when it is empty, so no article is ever lost by mistake
  app.delete('/api/hc/:kind/:id', need('admin'), (req, res, next) => { const k = req.params.kind; if (!BODY[k]) return next();
    const db = load(), h = own(db), x = h[k].find(r => r.id === req.params.id); if (!x) return res.status(404).json({ error: 'not found' });
    if (k === 'cats' && h.secs.some(s => s.cat === x.id)) return bad(res, 'Move or delete its sections first');
    if (k === 'secs' && h.arts.some(a => a.sec === x.id)) return bad(res, 'Move or delete its articles first');
    h[k] = h[k].filter(r => r !== x); save(db); res.json({ ok: 1 }); });
};
