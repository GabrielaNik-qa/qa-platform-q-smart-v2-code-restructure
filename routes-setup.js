// Skills and languages catalog, workspaces, reusable categories, root causes, Auto QA categories.
module.exports = ({ app, load, save, need, bad, hex, iso, str, list, scopeOf, ADMIN_TEAM }) => {
  const EDIT = ['admin', 'qa'];
  const KEY = { skill: 'skills', language: 'languages' };
  const cnt = (db, k) => Object.fromEntries(db[k].map(n => [n, db.users.filter(u => (u[k] || []).includes(n)).length]));

  // ---------------------------------------------------------------- skills and languages (people can only pick from these lists)
  app.get('/api/skills', need(), (req, res) => { const db = load(); res.json({ skills: db.skills, languages: db.languages, counts: { skills: cnt(db, 'skills'), languages: cnt(db, 'languages') } }); });
  app.post('/api/skills', need('admin'), (req, res) => {
    const db = load(), k = KEY[(req.body || {}).kind], name = str((req.body || {}).name, 40);
    if (!k) return bad(res, 'Choose skill or language'); if (!name) return bad(res, 'Enter a name');
    if (db[k].some(x => x.toLowerCase() === name.toLowerCase())) return bad(res, 'That one already exists');
    db[k].push(name); db[k].sort((a, b) => a.localeCompare(b)); save(db); res.json({ ok: 1, name });
  });
  app.put('/api/skills', need('admin'), (req, res) => {                          // rename everywhere
    const db = load(), b = req.body || {}, k = KEY[b.kind], to = str(b.to, 40), from = str(b.name, 40);
    if (!k || !db[k].includes(from)) return res.status(404).json({ error: 'not found' }); if (!to) return bad(res, 'Enter a name');
    if (db[k].some(x => x !== from && x.toLowerCase() === to.toLowerCase())) return bad(res, 'That name already exists');
    const swap = a => (a || []).map(x => x === from ? to : x);
    db[k] = db[k].map(x => x === from ? to : x).sort((a, b) => a.localeCompare(b)); db.users.forEach(u => { u[k] = swap(u[k]); }); db.teams.forEach(t => { t[k] = swap(t[k]); });
    save(db); res.json({ ok: 1 });
  });
  app.delete('/api/skills', need('admin'), (req, res) => {                       // removed from everybody too
    const db = load(), k = KEY[req.query.kind], name = str(req.query.name, 40);
    if (!k || !db[k].includes(name)) return res.status(404).json({ error: 'not found' });
    db[k] = db[k].filter(x => x !== name); db.users.forEach(u => { u[k] = (u[k] || []).filter(x => x !== name); }); db.teams.forEach(t => { t[k] = (t[k] || []).filter(x => x !== name); });
    save(db); res.json({ ok: 1 });
  });

  // ---------------------------------------------------------------- workspaces
  const wsBody = (b, db) => {
    const name = str(b.name, 60); if (!name) throw new Error('Give the workspace a name');
    return { name, desc: str(b.desc, 400), color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#2563eb',
      teams: list(b.teams, 40, 40).filter(id => id !== ADMIN_TEAM && db.teams.some(t => t.id === id)), scorecards: list(b.scorecards, 40, 40).filter(id => db.scorecards.some(s => s.id === id)),
      staff: list(b.staff, 100, 40).filter(u => db.users.some(x => x.username === u && x.role !== 'agent' && x.role !== 'admin')) };
  };
  app.get('/api/workspaces', need(), (req, res) => {
    const db = load(), u = req.session.user;
    res.json(u.role === 'admin' ? db.workspaces : db.workspaces.filter(w => u.role === 'agent' ? w.teams.includes(u.team) : (w.staff || []).includes(u.username)));
  });
  app.post('/api/workspaces', need('admin'), (req, res) => { const db = load(); try { const w = { id: 'w-' + hex(3), ...wsBody(req.body || {}, db), created: iso() }; db.workspaces.push(w); save(db); res.json(w); } catch (e) { bad(res, e.message); } });
  app.put('/api/workspaces/:id', need('admin'), (req, res) => { const db = load(), w = db.workspaces.find(x => x.id === req.params.id); if (!w) return res.status(404).json({ error: 'not found' }); try { Object.assign(w, wsBody(req.body || {}, db)); save(db); res.json(w); } catch (e) { bad(res, e.message); } });
  app.delete('/api/workspaces/:id', need('admin'), (req, res) => {
    const db = load(); if (db.workspaces.length <= 1) return bad(res, 'At least one workspace is required');
    if (!db.workspaces.some(w => w.id === req.params.id)) return res.status(404).json({ error: 'not found' });
    db.workspaces = db.workspaces.filter(w => w.id !== req.params.id); save(db); res.json({ ok: 1 });
  });

  // ---------------------------------------------------------------- root causes (why was an item answered "No")
  app.get('/api/root-causes', need(), (req, res) => res.json(load().rootCauses));
  const rcBody = b => { const name = str(b.name, 60); if (!name) throw new Error('Give the root cause a name'); return { name, desc: str(b.desc, 300), active: b.active !== false }; };
  app.post('/api/root-causes', need(...EDIT), (req, res) => { const db = load(); try { const r = { id: 'rc' + hex(3), ...rcBody(req.body || {}) }; if (db.rootCauses.some(x => x.name.toLowerCase() === r.name.toLowerCase())) throw new Error('That root cause already exists'); db.rootCauses.push(r); save(db); res.json(r); } catch (e) { bad(res, e.message); } });
  app.put('/api/root-causes/:id', need(...EDIT), (req, res) => { const db = load(), r = db.rootCauses.find(x => x.id === req.params.id); if (!r) return res.status(404).json({ error: 'not found' }); try { Object.assign(r, rcBody(req.body || {})); save(db); res.json(r); } catch (e) { bad(res, e.message); } });
  app.delete('/api/root-causes/:id', need(...EDIT), (req, res) => { const db = load(); db.rootCauses = db.rootCauses.filter(x => x.id !== req.params.id); save(db); res.json({ ok: 1 }); });

  // ---------------------------------------------------------------- reusable category library (scorecards copy categories from here)
  // older library categories (from the seed) keep their name in "n": they are sent with "name" like the ones made in the app
  app.get('/api/categories', need(), (req, res) => res.json((load().categories || []).map(c => c && !c.name && c.n ? { ...c, name: c.n } : c)));
  const catBody = b => {
    const name = str(b.name, 80); if (!name) throw new Error('Give the category a name');
    if (!Array.isArray(b.it) || !b.it.length || b.it.length > 30) throw new Error('A category needs at least one item');
    const it = b.it.map(i => { const t = str(i.t, 300), p = Number(i.p); if (!t) throw new Error('Every item needs a description'); if (!Number.isInteger(p) || p < 0 || p > 100) throw new Error('Points must be whole numbers from 0 to 100'); return { t, p, k: !!i.k }; });
    return { name, desc: str(b.desc, 300), k: !!b.k, it, active: b.active !== false };
  };
  app.post('/api/categories', need('admin'), (req, res) => { const db = load(); try { const c = { id: 'cat' + hex(3), ...catBody(req.body || {}) }; db.categories.push(c); save(db); res.json(c); } catch (e) { bad(res, e.message); } });
  app.put('/api/categories/:id', need('admin'), (req, res) => { const db = load(), c = db.categories.find(x => x.id === req.params.id); if (!c) return res.status(404).json({ error: 'not found' }); try { Object.assign(c, catBody(req.body || {})); save(db); res.json(c); } catch (e) { bad(res, e.message); } });
  app.delete('/api/categories/:id', need('admin'), (req, res) => { const db = load(); db.categories = db.categories.filter(x => x.id !== req.params.id); save(db); res.json({ ok: 1 }); });

  // ---------------------------------------------------------------- Auto QA categories (rated automatically for every conversation)
  app.get('/api/auto-cats', need(), (req, res) => res.json(load().autoCats));
  const acBody = (b, db) => {
    const name = str(b.name, 60); if (!name) throw new Error('Give the category a name');
    const maps = str(b.maps, 80); const w = Math.min(10, Math.max(0.1, Number(b.weight) || 1));
    return { name, desc: str(b.desc, 300), maps, pos: list(b.pos, 30, 80), neg: list(b.neg, 30, 80), weight: w, enabled: b.enabled !== false };
  };
  app.post('/api/auto-cats', need('admin'), (req, res) => { const db = load(); try { const c = { id: 'ac' + hex(3), ...acBody(req.body || {}, db) }; db.autoCats.push(c); save(db); res.json(c); } catch (e) { bad(res, e.message); } });
  app.put('/api/auto-cats/:id', need('admin'), (req, res) => { const db = load(), c = db.autoCats.find(x => x.id === req.params.id); if (!c) return res.status(404).json({ error: 'not found' }); try { Object.assign(c, acBody(req.body || {}, db)); save(db); res.json(c); } catch (e) { bad(res, e.message); } });
  app.delete('/api/auto-cats/:id', need('admin'), (req, res) => { const db = load(); db.autoCats = db.autoCats.filter(x => x.id !== req.params.id); save(db); res.json({ ok: 1 }); });
};
