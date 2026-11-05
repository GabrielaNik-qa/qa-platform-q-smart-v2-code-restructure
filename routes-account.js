// Sign-in and accounts: login, logout, my profile, password, preferences, registration (approved by an admin), forgot / reset password.
// These routes were part of server.js until 3 November; they use the same helpers, handed over by server.js.
module.exports = ({ ADMIN_TEAM, BASE, DAY, DEFAULT_PASSWORD, DUMMY, LANGS, PREF_ID, ROLES, app, authed, bad, bcrypt, cleanPrefs, crypto, hex, hits, iso, limited, list, load, mail, makeUsername, nameParts, need, newPw, notify, pub, pwBad, recent, save, sha, str, userBy, validEmail }) => {
  app.post('/api/login', (req, res) => {
    if (limited('login:' + req.ip, 30, 9e5)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    const { username, password } = req.body || {};
    const id = String(username || '').trim().toLowerCase(), db = load();
    const u = db.users.find(x => x.username === id || (x.email || '').toLowerCase() === id);   // username OR email
    const fail = 'fail:' + (u ? u.username : id);                                               // wrong passwords are also counted per account, whatever the address
    res.locals.loginAs = u ? u.username : '';   // the audit log keeps the account of a failed sign-in, never the typed text (it may be a password typed in the wrong box)
    if (recent(fail, 9e5) >= (((db.settings || {}).signin || {}).lockAfter || 10)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    if (u && u.active !== false && bcrypt.compareSync(String(password || ''), u.hash)) {   // a fresh session id at every sign-in (an id planted before the sign-in is useless)
      delete hits[fail]; u.lastIn = iso(); save(db);                                         // last sign-in, shown in Admin › Users
      return req.session.regenerate(err => { if (err) return res.status(500).json({ error: 'Could not sign in, try again' }); req.session.user = pub(u); req.session.pwv = u.pwv || 0; res.json(req.session.user); });
    }
    if (!u) bcrypt.compareSync(String(password || ''), DUMMY);
    if (u && u.active === false && bcrypt.compareSync(String(password || ''), u.hash)) return res.status(403).json({ error: 'This account is deactivated. Please contact the administrator.' });
    const r = db.registrations.find(x => (x.username === id || x.email === id) && x.status !== 'approved' && bcrypt.compareSync(String(password || ''), x.hash));
    if (r) return res.status(403).json({ error: r.status === 'pending'
      ? 'Your registration is still pending approval by an administrator.'
      : 'Your registration was declined. Please contact the administrator of the application.' });
    limited(fail, 10, 9e5);
    res.status(401).json({ error: 'Wrong username/email or password' });
  });
  app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: 1 })));
  app.get('/api/me', authed, (req, res) => {
    const u = load().users.find(x => x.username === req.session.user.username);
    if (!u || u.active === false) return req.session.destroy(() => res.status(401).json({ error: 'login required' }));
    req.session.user = pub(u); res.json(req.session.user);
  });
  app.put('/api/profile', need(), (req, res) => {
    const db = load(), u = userBy(db, req.session.user.username), b = req.body || {};
    const np = nameParts(b), email = str(b.email, 120).toLowerCase();
    if (!np.firstName) return bad(res, 'Enter your first name');
    if (!np.lastName) return bad(res, 'Enter your last name');
    if (email && !validEmail(email)) return bad(res, 'Enter a valid email address');
    if (email && db.users.some(x => x !== u && (x.email || '').toLowerCase() === email)) return bad(res, 'That email is already used by another account');
    Object.assign(u, np); u.email = email;
    if (b.desc !== undefined) u.desc = str(b.desc, 600);
    if (b.languages !== undefined) u.languages = list(b.languages);
    if (b.skills !== undefined) u.skills = list(b.skills);
    if (b.phone !== undefined) u.phone = str(b.phone, 40);
    if (b.birthday !== undefined) u.birthday = DAY.test(b.birthday || '') ? b.birthday : '';
    if (b.showBday !== undefined) u.showBday = b.showBday === true;
    if (b.ecName !== undefined) u.ecName = str(b.ecName, 80);
    if (b.ecPhone !== undefined) u.ecPhone = str(b.ecPhone, 40);
    if (b.ecRel !== undefined) u.ecRel = str(b.ecRel, 40);
    save(db); req.session.user = pub(u); res.json(req.session.user);
  });
  // a new password ends the person's other sign-ins (someone else may be using one); the sign-in that changed it stays
  app.post('/api/password', need(), (req, res) => {
    const { current, next } = req.body || {};
    const db = load(), u = userBy(db, req.session.user.username), key = 'pw:' + req.session.user.username;
    if (recent(key, 9e5) >= 10) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });   // the current password cannot be guessed here either
    if (!u || !bcrypt.compareSync(String(current || ''), u.hash)) { limited(key, 10, 9e5); return bad(res, 'Your current password is wrong'); }
    const pe = pwBad(next); if (pe) return bad(res, pe);
    if (bcrypt.compareSync(String(next), u.hash)) return bad(res, 'The new password cannot be the same as your current password');
    delete hits[key]; newPw(u, next); u.mustChange = false; save(db); req.session.pwv = u.pwv; res.json({ ok: 1 });
  });
  app.post('/api/password/first', authed, (req, res) => {   // the pop-up every new user sees at their first login
    if (!req.session.user.mustChange) return bad(res, 'Your password was already changed');
    const next = (req.body || {}).next, pe = pwBad(next); if (pe) return bad(res, pe);
    const db = load(), u = userBy(db, req.session.user.username);
    if (bcrypt.compareSync(String(next), u.hash)) return bad(res, 'Please choose a different password than the temporary one');
    newPw(u, next); u.mustChange = false; save(db);
    req.session.pwv = u.pwv; req.session.user = pub(u); res.json(req.session.user);
  });
  // My account > Notifications & Confirmations. Only ever changes the person who is signed in.
  //   { info: true|false }      welcome messages and tips on / off       { confirm: true|false }  routine confirmations on / off
  //   { dismiss: ['tip.roots'] } "Don't show me this again"               { restore: ['tip.roots'] } show one again
  //   { clear: true }            show every dismissed message again        { defaults: true }         everything back to the start
  //   { cols: { page: 'calls', keys: ['id', 'ag', 'sc'] } }  the columns shown in a table, in that order (keys: null = the standard columns)
  app.put('/api/prefs', need(), (req, res) => {
    const db = load(), u = userBy(db, req.session.user.username), b = req.body || {};
    if (!u) return res.status(401).json({ error: 'login required' });
    const p = b.defaults ? cleanPrefs({ lang: (u.prefs || {}).lang }) : cleanPrefs(u.prefs);   // "Restore default settings" keeps the chosen language
    if (b.lang !== undefined) { if (!LANGS.includes(b.lang)) return bad(res, 'Unknown language'); p.lang = b.lang; }
    if (typeof b.info === 'boolean') p.info = b.info;
    if (typeof b.confirm === 'boolean') p.confirm = b.confirm;
    if (b.clear) p.off = {};
    for (const id of list(b.restore, 30, 40)) delete p.off[id];
    for (const id of list(b.dismiss, 30, 40)) { if (!PREF_ID.test(id)) return bad(res, 'Unknown message'); p.off[id] = iso(); }
    if (Object.keys(p.off).length > 100) return bad(res, 'Too many dismissed messages');
    if (b.cols !== undefined) {                                     // { cols: { page: 'calls', keys: ['id', 'ag'] } } — keys null = the standard columns again
      const c = b.cols || {}, page = String(c.page || '');
      if (!/^[a-z]{1,20}$/.test(page) || (c.keys !== null && !Array.isArray(c.keys))) return bad(res, 'Unknown table');
      const all = { ...(p.cols || {}) }; if (c.keys === null) delete all[page]; else all[page] = c.keys;
      const cols = cleanPrefs({ cols: all }).cols; if (cols) p.cols = cols; else delete p.cols;
    }
    u.prefs = p; save(db); req.session.user = pub(u); res.json(req.session.user);
  });
  app.post('/api/register', (req, res) => {
    if (limited('reg:' + req.ip, 6, 36e5)) return res.status(429).json({ error: 'Too many registrations from this connection. Try again later.' });
    const b = req.body || {}, db = load();
    if (((db.settings || {}).signin || {}).openReg !== true) return res.status(403).json({ error: 'Accounts are by invitation only. Ask your admin for an account.' });   // decision 12, 4 November
    const first = str(b.firstName, 40), last = str(b.lastName, 40), email = str(b.email, 120).toLowerCase();
    if (!first) return bad(res, 'Enter your first name');
    if (!last) return bad(res, 'Enter your last name');
    if (!validEmail(email)) return bad(res, 'Enter a valid email address');
    const name = first + ' ' + last, username = makeUsername(first, last);   // e.g. Gabriela Pencheva -> g.pencheva
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) return bad(res, 'Your first and last name must contain letters or numbers so a username can be made');
    if (db.users.some(u => u.username.toLowerCase() === username) || db.registrations.some(r => r.status === 'pending' && r.username === username))
      return res.status(409).json({ error: 'The username ' + username + ' already exists. Please contact the administrator.' });
    if (db.users.some(u => (u.email || '').toLowerCase() === email) || db.registrations.some(r => r.status === 'pending' && r.email === email))
      return res.status(409).json({ error: 'That email address is already registered' });
    const reg = { id: 'g' + hex(5), username, name, firstName: first, lastName: last, email, hash: bcrypt.hashSync(DEFAULT_PASSWORD, 10), at: iso(), status: 'pending' };
    db.registrations.push(reg);
    db.users.filter(u => u.role === 'admin').forEach(a => notify(db, a.username, 'reg', `${name} (@${username}) has requested access to the platform`, { reg: reg.id }));
    save(db); res.json({ ok: 1 });
    mail(email, 'Your registration is pending approval',
      `Hi ${name},\n\nThank you for registering. Your registration is pending approval by an administrator.\nYou will receive another email as soon as it has been reviewed.\n`);
  });
  app.get('/api/registrations', need('admin'), (req, res) =>
    res.json(load().registrations.filter(r => r.status === 'pending').map(({ hash, ...r }) => r).reverse()));
  app.post('/api/registrations/:id/approve', need('admin'), (req, res) => {
    const db = load(), r = db.registrations.find(x => x.id === req.params.id && x.status === 'pending'), b = req.body || {};
    if (!r) return res.status(404).json({ error: 'not found' });
    if (db.users.some(u => u.username === r.username)) return res.status(409).json({ error: 'That username is already taken' });
    const role = ROLES.includes(b.role) ? b.role : 'agent';
    const team = role === 'agent' ? b.team : ADMIN_TEAM;
    if (!db.teams.some(t => t.id === team && (role !== 'agent' ? true : t.id !== ADMIN_TEAM))) return bad(res, 'Choose the team of this agent first');
    db.users.push({ username: r.username, name: r.name, firstName: r.firstName || nameParts(r).firstName, lastName: r.lastName || nameParts(r).lastName, email: r.email, role, team, title: '', desc: '', languages: [], skills: [], phone: '', start: '', active: true, hash: bcrypt.hashSync(DEFAULT_PASSWORD, 10), mustChange: true });
    if (role !== 'agent' && role !== 'admin' && db.workspaces[0]) db.workspaces[0].staff.push(r.username);
    r.status = 'approved'; r.by = req.session.user.username; r.decided = iso();
    db.notifications = db.notifications.filter(n => !(n.type === 'reg' && n.reg === r.id));
    save(db); res.json({ ok: 1 });
    mail(r.email, 'Your registration has been approved',
      `Hi ${r.name},\n\nGood news - your registration has been approved. You can now log in:\n${BASE}\n\nUsername: ${r.username}\nInitial password: ${DEFAULT_PASSWORD}\n\nYou will be asked to choose a new password the first time you log in.\n`, 'approved', { name: r.name, link: BASE, username: r.username });
  });
  app.post('/api/registrations/:id/decline', need('admin'), (req, res) => {
    const db = load(), r = db.registrations.find(x => x.id === req.params.id && x.status === 'pending');
    if (!r) return res.status(404).json({ error: 'not found' });
    r.status = 'declined'; r.by = req.session.user.username; r.decided = iso();
    db.notifications = db.notifications.filter(n => !(n.type === 'reg' && n.reg === r.id));
    save(db); res.json({ ok: 1 });
    mail(r.email, 'Your registration was declined',
      `Hi ${r.name},\n\nUnfortunately your registration has been declined. Please contact the administrator of the application if you have any questions.\n`);
  });
  app.post('/api/forgot', async (req, res) => {
    const now = Date.now();
    if (limited('forgot:' + req.ip, 5, 9e5)) return res.status(429).json({ error: 'Too many requests, try again later' });
    const id = str((req.body || {}).identifier, 120).toLowerCase();
    const db = load(), u = id && db.users.find(x => x.username === id || (x.email || '').toLowerCase() === id);
    if (u && u.email && limited('forgot-acct:' + u.username, 3, 36e5)) console.log('Reset requested again for ' + u.username + ': no new e-mail (at most 3 per hour)');   // nobody can flood a mailbox
    else if (u && u.email) {
      const token = crypto.randomBytes(32).toString('hex');
      u.reset = { h: sha(token), exp: now + 36e5 }; save(db);          // link is valid for 1 hour
      const url = `${BASE}/?reset=${token}&u=${encodeURIComponent(u.username)}`;
      await mail(u.email, 'Reset your password', `Hi ${u.name},\n\nChoose a new password here (valid for 1 hour):\n${url}\n\nIf you did not ask for this, ignore this email.`, 'reset', { name: u.name, link: url });
    } else console.log('Reset requested, but no account with an email address matched');   // the typed text is not printed (it may be a password)
    res.json({ ok: 1 });   // same answer whether or not the account exists
  });
  app.post('/api/reset', (req, res) => {
    const { username, token, password } = req.body || {};
    const db = load(), u = userBy(db, String(username || '').toLowerCase());
    const ok = u && u.reset && u.reset.exp > Date.now() && typeof token === 'string' &&
      crypto.timingSafeEqual(Buffer.from(sha(token)), Buffer.from(u.reset.h));
    if (!ok) return bad(res, 'This reset link is invalid or has expired');
    const pe = pwBad(password); if (pe) return bad(res, pe);
    if (bcrypt.compareSync(String(password), u.hash)) return bad(res, 'For security, the new password cannot be the same as your current password');
    newPw(u, password); u.mustChange = false; delete u.reset; save(db); res.json({ ok: 1 });   // every sign-in made before the reset ends
  });
};
