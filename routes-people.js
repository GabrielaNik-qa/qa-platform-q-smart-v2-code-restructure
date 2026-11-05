// People: teams (admins write, everybody sees the roster of their workspace) and user accounts (admins).
// These routes were part of server.js until 3 November; they use the same helpers, handed over by server.js.
module.exports = ({ BASE, DEFAULT_PASSWORD, addTeam, addUser, app, bad, iso, leadsTeam, load, mail, need, newPw, pub, rosterPub, save, scopeOf, setStaffWs, teamBody, userBody, userBy }) => {
  app.get('/api/roster', need(), (req, res) => { const db = load(), s = scopeOf(db, req.session.user); res.json(db.users.filter(u => !s || s.teams.has(u.team)).map(rosterPub)); });
  app.get('/api/teams', need(), (req, res) => { const db = load(), s = scopeOf(db, req.session.user); res.json(db.teams.filter(t => !s || s.teams.has(t.id))); });
  app.post('/api/teams', need('admin'), (req, res) => {
    const db = load(), b = req.body || {};
    try {
      const t = addTeam(db, b);
      save(db); res.json(t);
    } catch (e) { bad(res, e.message); }
  });
  app.put('/api/teams/:id', need('admin'), (req, res) => {
    const db = load(), t = db.teams.find(x => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    try { Object.assign(t, teamBody(req.body || {}, db, t)); save(db); res.json(t); } catch (e) { bad(res, e.message); }
  });
  app.delete('/api/teams/:id', need('admin'), (req, res) => {
    const db = load(), t = db.teams.find(x => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    if (t.system) return bad(res, 'The Administration team is built in and cannot be deleted');
    if (db.users.some(u => u.team === t.id)) return bad(res, 'Move the members of this team to another team first');
    if (db.teams.filter(x => !x.system).length <= 1) return bad(res, 'At least one working team is required');
    db.oldTeams[t.id] = t.name; db.workspaces.forEach(w => { w.teams = w.teams.filter(x => x !== t.id); });
    db.teams = db.teams.filter(x => x !== t); delete db.settings.teams[t.id]; save(db); res.json({ ok: 1 });
  });
  app.get('/api/users', need('admin'), (req, res) => { const db = load(); res.json(db.users.map(({ hash, reset, pwv, ...u }) => ({ ...u, workspaces: u.role === 'agent' ? db.workspaces.filter(w => w.teams.includes(u.team)).map(w => w.id) : db.workspaces.filter(w => (w.staff || []).includes(u.username)).map(w => w.id) }))); });
  app.post('/api/users', need('admin'), (req, res) => {
    const db = load(), b = req.body || {};
    try {
      const u = addUser(db, b), username = u.username; save(db); res.json({ ok: 1, username });
      mail(u.email, 'Your account has been created', `Hi ${u.name},\n\nAn account was created for you.\n\nAddress: ${BASE}\nUsername: ${username}\nTemporary password: ${DEFAULT_PASSWORD}\n\nYou will be asked to choose a new password the first time you log in.\n`, 'account', { name: u.name, link: BASE, username, password: DEFAULT_PASSWORD });
    } catch (e) { bad(res, e.message); }
  });
  app.put('/api/users/:username', need('admin'), (req, res) => {
    const db = load(), u = userBy(db, req.params.username), b = req.body || {};
    if (!u) return res.status(404).json({ error: 'not found' });
    try {
      const nb = userBody({ ...u, ...b }, db, u);
      if (u.role === 'admin' && nb.role !== 'admin' && db.users.filter(x => x.role === 'admin' && x.active !== false).length < 2) throw new Error('There must be at least one admin');
      if (u.username === req.session.user.username && nb.active === false) throw new Error('You cannot deactivate your own account');
      const lt = leadsTeam(db, u.username);
      if (lt && (nb.active === false || nb.role === 'agent')) throw new Error(`${u.name} is the team lead of ${lt.name}. Choose another team lead for it first.`);
      if (nb.team !== (u.team || '')) { (u.teamHistory = u.teamHistory || []).push({ from: u.team || '', to: nb.team, at: iso(), by: req.session.user.name }); }
      Object.assign(u, nb); setStaffWs(db, u.username, u.role, b.workspaces !== undefined ? b.workspaces : db.workspaces.filter(w => (w.staff || []).includes(u.username)).map(w => w.id)); save(db);
      if (req.session.user.username === u.username) req.session.user = pub(u);
      res.json({ ok: 1 });
    } catch (e) { bad(res, e.message); }
  });
  app.delete('/api/users/:username', need('admin'), (req, res) => {
    const db = load(), u = userBy(db, req.params.username);
    if (!u) return res.status(404).json({ error: 'not found' });
    if (u.username === req.session.user.username) return bad(res, 'You cannot delete your own account');
    if (u.role === 'admin' && db.users.filter(x => x.role === 'admin').length < 2) return bad(res, 'There must be at least one admin');
    const lt = leadsTeam(db, u.username); if (lt) return bad(res, `${u.name} is the team lead of ${lt.name}. Choose another team lead for it first.`);
    db.users = db.users.filter(x => x !== u); db.workspaces.forEach(w => { w.staff = (w.staff || []).filter(x => x !== u.username); });
    db.notifications = db.notifications.filter(n => n.to !== u.username);
    save(db); res.json({ ok: 1 });
  });
  app.post('/api/users/:username/reset', need('admin'), (req, res) => {   // the person is signed out everywhere and chooses a new password at the next sign-in
    const db = load(), u = userBy(db, req.params.username);
    if (!u) return res.status(404).json({ error: 'not found' });
    newPw(u, DEFAULT_PASSWORD); u.mustChange = true; save(db); res.json({ ok: 1 });
  });
};
