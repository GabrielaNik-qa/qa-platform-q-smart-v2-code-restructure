// Reports, Planning, Performance, Compliance & CX, Backups and the extra admin settings.
// Most of these are simple lists of records ("collections") with the same four routes: list, add, change, delete.
const fs = require('fs'), path = require('path');
const RPT = require('./public/js/rpt-engine.js');
module.exports = ({ FILE, DIR, app, load, save, need, bad, hex, iso, str, notify, userBy, mail, BASE, scopeOf, setOut }) => {
  const ADMIN1 = ['admin'], EDIT = ['admin', 'qa', 'lead', 'trainer'], ALL = ['admin', 'qa', 'lead', 'trainer', 'agent'];
  // who may read / write each collection; mine(u, x) = an agent may only see the records about themselves
  const COLS = {
    reports: { read: EDIT, write: EDIT, ownOnly: true },
    goals: { read: ALL, write: ['admin', 'qa', 'lead'], mine: (u, x, db) => x.scope === 'agent' ? x.target === u.username : x.scope === 'team' ? x.target === (userBy(db, u.username) || {}).team : true },
    pips: { read: ALL, write: ['admin', 'qa', 'lead', 'trainer'], mine: (u, x) => x.agent === u.username, agentFields: ['ack', 'agentNote'] },
    kudos: { read: ALL, write: ALL, ownOnly: true },
    risks: { read: EDIT, write: EDIT },
    complaints: { read: EDIT, write: EDIT },
    surveys: { read: ALL, write: ['admin', 'qa', 'lead'], mine: (u, x) => x.agent === u.username },
    // the registers of Admin › GOVERNANCE (GDPR, EU AI Act, data breaches, accessibility): admins only (3 November)
    ropa: { read: ADMIN1, write: ADMIN1 }, subproc: { read: ADMIN1, write: ADMIN1 }, dpas: { read: ADMIN1, write: ADMIN1 }, consents: { read: ADMIN1, write: ADMIN1 },
    aireg: { read: ADMIN1, write: ADMIN1 }, ainotices: { read: ADMIN1, write: ADMIN1 }, breaches: { read: ADMIN1, write: ADMIN1 }, a11y: { read: ADMIN1, write: ADMIN1 },
    // Help Center (read by everybody, written by staff), pins (an agent sees their own) and reviewer checks (3 November)
    faq: { read: ALL, write: EDIT }, gloss: { read: ALL, write: EDIT }, videos: { read: ALL, write: EDIT }, tours: { read: ALL, write: EDIT },
    pins: { read: ALL, write: EDIT, mine: (u, x) => x.agent === u.username }, revqa: { read: EDIT, write: ['admin', 'qa', 'lead'] },
    // call scripts (staff write), announcements (admins write), feature requests (everybody writes their own, an admin sets the status) (3 November)
    scripts: { read: ALL, write: EDIT }, announce: { read: ALL, write: ADMIN1 }, ideas: { read: ALL, write: ALL, ownOnly: true }
  };
  // cleans whatever the browser sends: only text, numbers, yes/no, lists and small objects are kept
  const clean = (v, depth = 0) => {
    if (v == null) return v; if (typeof v === 'string') return v.slice(0, 4000); if (typeof v === 'number') return Number.isFinite(v) ? v : 0; if (typeof v === 'boolean') return v;
    if (Array.isArray(v)) return depth > 4 ? [] : v.slice(0, 300).map(x => clean(x, depth + 1));
    if (typeof v === 'object') { if (depth > 4) return {}; const o = {}; Object.keys(v).slice(0, 60).forEach(k => { if (!/^[_$]/.test(k) && !['id', 'by', 'byName', 'at', 'updated'].includes(k)) o[k.slice(0, 40)] = clean(v[k], depth + 1); }); return o; }
    return undefined;
  };
  // the few records whose numbers feed reports are checked here too (the page checks first, but the server must not trust the page)
  const CHECK = { dpas: x => !x.link || /^https:\/\/[^\s"'<>`]+$/i.test(String(x.link)) ? '' : 'Links must start with https://', a11y: x => String(x.text || '').trim() ? '' : 'Write the statement',
    videos: x => /^https:\/\/[^\s"'<>`]+$/i.test(String(x.link || '')) ? '' : 'Links must start with https://',
    surveys: x => Number.isInteger(x.score) && x.score >= 1 && x.score <= 5 && /^\d{4}-\d{2}-\d{2}$/.test(String(x.date || '')) ? '' : 'Each survey answer needs a date (YYYY-MM-DD) and a score from 1 to 5',
    // the pages count the goals of a plan, so anything but a list of goals would break them for everybody
    pips: x => x.goals == null || (Array.isArray(x.goals) && x.goals.every(g => g && typeof g === 'object' && !Array.isArray(g))) ? '' : 'The goals of an improvement plan must be a list' };
  const coll = (db, c) => { if (!Array.isArray(db[c])) db[c] = []; return db[c]; };
  const canRead = (c, u) => COLS[c] && COLS[c].read.includes(u.role);
  const canWrite = (c, u) => COLS[c] && COLS[c].write.includes(u.role);
  const visible = (c, u, db) => coll(db, c).filter(x => u.role !== 'agent' || !COLS[c].mine || COLS[c].mine(u, x, db)).filter(x => c !== 'reports' || x.by === u.username || x.shared || u.role === 'admin');
  const after = (db, c, x, me, isNew) => {                     // notifications that go with a new record
    if (!isNew) return;
    if (c === 'kudos' && x.to && x.to !== me.username) notify(db, x.to, 'kudos', `${me.name} gave you kudos${x.badge ? ' ' + x.badge : ''}: ${String(x.text || '').slice(0, 90)}`, {});
    if (c === 'pips' && x.agent) notify(db, x.agent, 'pip', `${me.name} started an improvement plan with you: ${x.title || ''}`, {});
    if (c === 'goals' && x.scope === 'agent' && x.target) notify(db, x.target, 'goal', `New goal for you: ${x.title || x.metric}`, {});
    if (c === 'risks' && x.owner && x.owner !== me.username) notify(db, x.owner, 'risk', `${me.name} assigned a risk case to you: ${x.title || ''}`, {});
  };
  const known = (req, res, next) => COLS[req.params.col] ? next() : res.status(404).json({ error: 'not found' });   // only the collections above exist
  app.get('/api/c/:col', need(), known, (req, res) => { const c = req.params.col, u = req.session.user; if (!canRead(c, u)) return res.status(403).json({ error: 'not allowed' }); res.json(visible(c, u, load())); });
  app.post('/api/c/:col', need(), known, (req, res) => {
    const c = req.params.col, u = req.session.user, db = load(), b = req.body || {};
    if (!canWrite(c, u)) return res.status(403).json({ error: 'Your role cannot add these' });
    if (Array.isArray(b.bulk) && c !== 'surveys') return bad(res, 'Only survey answers can be imported as a list');
    const list = Array.isArray(b.bulk) ? b.bulk.slice(0, 3000) : [b];                // bulk = an imported list (surveys)
    if (JSON.stringify(list).length > 3e6) return bad(res, 'Too much data at once');
    let out = list.map(x => ({ ...clean(x), id: c.slice(0, 1) + hex(5), by: u.username, byName: u.name, at: iso() }));
    const wrong = CHECK[c] && out.map(CHECK[c]).find(Boolean); if (wrong) return bad(res, wrong);
    // decision 16 (4 November): a survey answer already there (same agent, date and lead) is not added again
    const dupKey = x => [x.agent, x.date, x.lead || ''].join('|'), had = new Set(c === 'surveys' ? coll(db, c).map(dupKey) : []), before = out.length;
    if (c === 'surveys' && Array.isArray(b.bulk)) out = out.filter(x => { const k = dupKey(x); if (had.has(k)) return false; had.add(k); return true; });
    out.forEach(x => { coll(db, c).unshift(x); after(db, c, x, u, true); });
    save(db); res.json(Array.isArray(b.bulk) ? { added: out.length, skipped: before - out.length } : out[0]);
  });
  app.put('/api/c/:col/:id', need(), known, (req, res) => {
    const c = req.params.col, u = req.session.user, db = load(), x = coll(db, c).find(r => r.id === req.params.id);
    if (!x) return res.status(404).json({ error: 'not found' });
    const b = clean(req.body || {});
    if (u.role === 'agent' && COLS[c] && COLS[c].agentFields && COLS[c].mine(u, x, db)) { COLS[c].agentFields.forEach(k => { if (b[k] !== undefined) x[k] = b[k]; }); x.updated = iso(); save(db); return res.json(x); }
    if (!canWrite(c, u)) return res.status(403).json({ error: 'not allowed' });
    if (COLS[c].ownOnly && x.by !== u.username && u.role !== 'admin') return res.status(403).json({ error: 'Only the person who made it can change it' });
    const wrong = CHECK[c] && CHECK[c]({ ...x, ...b }); if (wrong) return bad(res, wrong);
    Object.assign(x, b, { updated: iso() }); save(db); res.json(x);
  });
  app.delete('/api/c/:col/:id', need(), known, (req, res) => {
    const c = req.params.col, u = req.session.user, db = load(), x = coll(db, c).find(r => r.id === req.params.id);
    if (!x) return res.status(404).json({ error: 'not found' });
    if (!canWrite(c, u) || (COLS[c].ownOnly && x.by !== u.username && u.role !== 'admin')) return res.status(403).json({ error: 'not allowed' });
    db[c] = coll(db, c).filter(r => r !== x); save(db); res.json({ ok: 1 });
  });

  // ---------------------------------------------------------------- settings that admins (and for the planner QA) change on their own pages
  const KEYS = { planner: ['admin', 'qa'], perm: ['admin'], permu: ['admin'], permtpl: ['admin'], sidebar: ['admin'], brand: ['admin'], region: ['admin'], beta: ['admin'], integ: ['admin'], notifOff: ['admin'], mailtpl: ['admin'] };
  app.put('/api/settings/x/:key', need(), (req, res) => {
    const k = req.params.key, u = req.session.user; if (!KEYS[k]) return res.status(404).json({ error: 'unknown setting' }); if (!KEYS[k].includes(u.role)) return res.status(403).json({ error: 'not allowed' });
    // the permissions have their own checks below (more than 60 pages, and a template keeps its id and date)
    let v = ['perm', 'permu', 'permtpl', 'sidebar', 'brand'].includes(k) ? (req.body || {}).value : clean((req.body || {}).value);
    if (k === 'integ') {                                          // the integration links are shown to everybody as links: only https:// addresses (R-13)
      if (!v || typeof v !== 'object' || Array.isArray(v)) return bad(res, 'Links must start with https://');
      const out = {};
      for (const [x, s] of Object.entries(v)) { const t = typeof s === 'string' ? s.trim() : ''; if (t && !/^https:\/\/[^\s"'<>`]+$/i.test(t)) return bad(res, 'Links must start with https://'); out[x] = t.slice(0, 400); }
      v = out;
    }
    // per-person access (Roles & permissions): { page: { username: true / false } }, only yes / no values
    const plain = o => o && typeof o === 'object' && !Array.isArray(o), okKey = x => typeof x === 'string' && /^[A-Za-z0-9][\w.@-]{0,79}$/.test(x);   // page names and usernames only
    const permuOf = o => { const out = {}; if (!plain(o)) return out; for (const [p, m] of Object.entries(o).slice(0, 500)) { if (!okKey(p) || !plain(m)) continue; const x = {}; for (const [un, on] of Object.entries(m).slice(0, 2000)) if (okKey(un) && typeof on === 'boolean') x[un] = on; out[p] = x; } return out; };
    const permOf = o => { const out = {}; if (!plain(o)) return out; for (const [p, l] of Object.entries(o).slice(0, 500)) if (okKey(p) && Array.isArray(l)) out[p] = l.filter(x => ['admin', 'qa', 'lead', 'trainer', 'agent'].includes(x)); return out; };
    if (k === 'permu') v = permuOf(v);
    if (k === 'perm') v = permOf(v);
    // saved permission templates: a name, when, and the roles and per-person access at that moment (30 at most)
    if (k === 'permtpl') v = (Array.isArray(v) ? v : []).slice(0, 30).filter(plain).map((t, i) => ({ id: String(t.id || '').replace(/[^\w-]/g, '').slice(0, 40) || 'pt' + Date.now() + i, name: String(t.name || '').trim().slice(0, 60) || 'Template', at: String(t.at || '').replace(/[^\dT:.Z-]/g, '').slice(0, 30), perm: permOf(t.perm), permu: permuOf(t.permu) }));
    // the sidebar (Admin › Setup › Sidebar settings): lists of group ids and app names only; saved views per role
    const ids = (l, n = 100) => (Array.isArray(l) ? l : []).filter(okKey).slice(0, n);
    const lay = o => ({ hide: ids(o.hide), order: ids(o.order), compact: ids(o.compact), apps: ids(o.apps, 10) });
    if (k === 'sidebar') { const o = plain(v) ? v : {}; v = { ...lay(o), views: (Array.isArray(o.views) ? o.views : []).slice(0, 20).filter(plain).map((x, i) => ({ id: String(x.id || '').replace(/[^\w-]/g, '').slice(0, 30) || 'v' + Date.now() + i, name: String(x.name || '').trim().slice(0, 40) || 'View', roles: ids(x.roles, 5).filter(r => ['admin', 'qa', 'lead', 'trainer', 'agent'].includes(r)), ...lay(x) })) }; }
    // branding: a name, a colour and a small logo (PNG, JPG or WEBP only, under about 150 KB)
    if (k === 'brand') { const o = plain(v) ? v : {}, logo = typeof o.logo === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(o.logo) && o.logo.length <= 210000 ? o.logo : '';
      if (o.logo && !logo) return bad(res, 'The logo must be a PNG, JPG or WEBP picture smaller than 150 KB');
      v = { name: String(o.name || '').trim().slice(0, 40), color: /^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : '', logo }; }
    if (k === 'region') { const o = plain(v) ? v : {}; v = { date: ['auto', 'dmy.', 'dmy/', 'mdy', 'ymd'].includes(o.date) ? o.date : 'auto', time: ['auto', '24', '12'].includes(o.time) ? o.time : 'auto' }; }
    // Beta features: the features an admin switched off (true = on, false = off; a feature not listed is on)
    if (k === 'beta') { const o = plain(v) ? v : {}; v = Object.fromEntries(Object.entries(o).filter(([x, on]) => /^[a-z0-9_]{1,30}$/.test(x) && typeof on === 'boolean').slice(0, 40)); }
    const db = load(); db.settings = { ...db.settings, [k]: v }; save(db); res.json(setOut(db, u));
  });
  // a vote for a feature request: one per person, a second click takes it back
  app.post('/api/ideas/:id/vote', need(), (req, res) => {
    const db = load(), u = req.session.user, x = coll(db, 'ideas').find(r => r.id === req.params.id); if (!x) return res.status(404).json({ error: 'not found' });
    const v = new Set(Array.isArray(x.votes) ? x.votes : []); if (v.has(u.username)) v.delete(u.username); else v.add(u.username); x.votes = [...v]; save(db); res.json(x);
  });

  // ---------------------------------------------------------------- export centre: every Excel file that was made, ready to download again
  // ---------------------------------------------------------------- Contact support (Gabriela, 3 November): a form with an e-mail, a subject, a type, a description and one file
  // or picture. The file is kept as a file next to the data (not inside it); a person sees their own requests, admins see all and set the status.
  const SUPT = ['question', 'problem', 'idea', 'billing', 'other'], SUPST = ['new', 'open', 'answered', 'closed'];
  const SUPF = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'application/pdf': '.pdf', 'text/plain': '.txt' };
  const supDir = () => path.join(path.dirname(FILE), 'support-files');
  const supOut = x => { const { file, ...r } = x; return { ...r, file: file ? { name: file.name, type: file.type, size: file.size } : null }; };
  app.get('/api/support', need(), (req, res) => { const u = req.session.user; res.json(coll(load(), 'support').filter(x => u.role === 'admin' || x.by === u.username).map(supOut)); });
  app.post('/api/support', need(), (req, res) => {
    const u = req.session.user, b = req.body || {}, email = str(b.email, 120), subject = str(b.subject, 150), desc = str(b.desc, 5000), type = SUPT.includes(b.type) ? b.type : 'question';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, 'Write a valid e-mail address');
    if (!subject) return bad(res, 'Write a subject'); if (!desc) return bad(res, 'Describe your request');
    const id = 's' + hex(5); let file = null;
    if (b.file && typeof b.file === 'object') {
      const ext = SUPF[b.file.type], data = typeof b.file.data === 'string' ? b.file.data : '';
      if (!ext || !/^[A-Za-z0-9+/=]+$/.test(data)) return bad(res, 'Attach a picture (PNG, JPG, WEBP, GIF), a PDF or a text file');
      const buf = Buffer.from(data, 'base64'); if (buf.length > 1048576) return bad(res, 'The file must be smaller than 1 MB');
      fs.mkdirSync(supDir(), { recursive: true }); fs.writeFileSync(path.join(supDir(), id + ext), buf);
      file = { name: str(b.file.name, 120).replace(/[\\/:*?"<>|]/g, '_') || 'file' + ext, type: b.file.type, size: buf.length, path: id + ext };
    }
    const db = load(), x = { id, email, subject, type, desc, file, status: 'new', by: u.username, byName: u.name, at: iso() };
    coll(db, 'support').unshift(x); db.users.filter(p => p.role === 'admin' && p.active !== false).forEach(p => notify(db, p.username, 'support', `${u.name} sent a support request: ${subject.slice(0, 80)}`, {}));
    save(db); res.json(supOut(x));
  });
  app.put('/api/support/:id', need('admin'), (req, res) => { const db = load(), x = coll(db, 'support').find(r => r.id === req.params.id); if (!x) return res.status(404).json({ error: 'not found' });
    const st = (req.body || {}).status; if (!SUPST.includes(st)) return bad(res, 'Choose a status'); x.status = st; x.updated = iso(); save(db); res.json(supOut(x)); });
  app.get('/api/support/:id/file', need(), (req, res) => { const u = req.session.user, x = coll(load(), 'support').find(r => r.id === req.params.id && (u.role === 'admin' || r.by === u.username));
    if (!x || !x.file) return res.status(404).json({ error: 'not found' }); const f = path.join(supDir(), path.basename(x.file.path)); if (!fs.existsSync(f)) return res.status(404).json({ error: 'not found' });
    res.setHeader('Content-Type', x.file.type); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(x.file.name) + '"'); fs.createReadStream(f).pipe(res); });

  app.get('/api/exports', need(...EDIT), (req, res) => { const u = req.session.user; res.json(coll(load(), 'exports').filter(x => u.role === 'admin' || x.by === u.username).map(({ rows, ...x }) => x)); });
  app.get('/api/exports/:id', need(...EDIT), (req, res) => { const u = req.session.user, x = coll(load(), 'exports').find(r => r.id === req.params.id && (u.role === 'admin' || r.by === u.username)); if (!x) return res.status(404).json({ error: 'not found' }); res.json(x); });
  app.delete('/api/exports/:id', need(...EDIT), (req, res) => { const db = load(); db.exports = coll(db, 'exports').filter(r => r.id !== req.params.id || (r.by !== req.session.user.username && req.session.user.role !== 'admin')); save(db); res.json({ ok: 1 }); });

  // ---------------------------------------------------------------- scheduled reports (daily / weekly / monthly, at the chosen hour)
  // Gabriela, 4 November: nothing is sent unless a person schedules it. A scheduled report arrives as a notification in the app
  // (everything can be seen there); it is also e-mailed only when "Also by e-mail" is ticked.
  // the data a report is made of: only what its owner may see (their workspace), like the Reports page in the browser
  const reportData = (db, owner) => {
    const teamOf = un => (db.users.find(x => x.username === un) || {}).team || '', s = scopeOf(db, owner);
    const ok = (un, tm) => !s || s.teams.has(teamOf(un) || tm || ''), okOpt = un => !un || ok(un);   // surveys and complaints may have no agent
    return { ev: db.evaluations.filter(e => !e.ns && ok(e.agent, e.tid)).map(e => ({ ...e, tm: teamOf(e.agent) || e.tid })), qf: (db.qflags || []).filter(f => ok(f.agent, f.tid)), tasks: (db.tasks || []).filter(t => ok(t.assignee)),
      surveys: (db.surveys || []).filter(x => okOpt(x.agent)), complaints: (db.complaints || []).filter(x => okOpt(x.agent)), users: db.users.filter(u => ok(u.username)), teams: db.teams.filter(t => !s || s.teams.has(t.id)),
      pass: tm => { const v = (db.settings.teams || {})[tm]; return v == null || v === '' ? (+db.settings.pass || 85) : +v; } };
  };
  async function sendReport(db, r) {
    const owner = userBy(db, r.by); if (!owner || owner.active === false) return 0;   // the report of a person who left is not sent any more
    // decision 17 (4 November): only to the e-mail addresses of active accounts of the company
    const mine = new Set(db.users.filter(x => x.active !== false && x.email).map(x => x.email.toLowerCase()));
    const res = RPT.run(r.cfg || {}, reportData(db, owner)), to = String((r.schedule || {}).to || '').split(/[,;\s]+/).filter(x => /@/.test(x) && mine.has(x.toLowerCase()));
    if (!to.length) return 0;
    const html = RPT.toHtml(res, r.name) + `<p style="font-family:sans-serif;font-size:12px;color:#888">Sent by Q-smart · <a href="${BASE}">open the app</a></p>`;
    for (const t of to) await mail(t, 'Q-smart report: ' + r.name, `${r.name}\n${res.periodName} · ${res.n} records\nOpen ${BASE} to see the full report.`, 'report', { name: r.name, link: BASE }, html);
    return to.length;
  }
  app.post('/api/c/reports/:id/send', need(...EDIT), async (req, res) => {
    const db = load(), u = req.session.user, r = coll(db, 'reports').find(x => x.id === req.params.id && (x.by === u.username || u.role === 'admin')); if (!r) return res.status(404).json({ error: 'not found' });
    const n = await sendReport(db, r); if (!n) return bad(res, 'Add at least one e-mail address of a Q-smart account in "Send to"');
    markSent([r.id]); res.json({ sent: n });
  });
  // sending e-mails takes a while: the data is read again before saving, so changes other people made meanwhile are not overwritten
  const markSent = (ids, tell) => { const db = load(); let n = 0; coll(db, 'reports').forEach(r => { if (ids.includes(r.id)) { r.lastSent = iso(); n++;
    if (tell && r.by) notify(db, r.by, 'report', `Your report "${r.name}" is ready`, { report: r.id }); } }); if (n) save(db); };
  async function scheduler() {
    try {
      const db = load(), now = new Date(), today = now.toISOString().slice(0, 10), sent = [];
      for (const r of coll(db, 'reports')) {
        const s = r.schedule || {}; if (!s.freq || s.freq === 'none' || now.getHours() < (+s.hour || 8) || String(r.lastSent || '').slice(0, 10) === today) continue;
        if (s.freq === 'weekly' && now.getDay() !== (+s.weekday || 1)) continue;
        if (s.freq === 'monthly' && now.getDate() !== (+s.day || 1)) continue;
        if (s.email) await sendReport(db, r); sent.push(r.id);
      }
      if (sent.length) markSent(sent, true);
    } catch (e) { console.log('Scheduled reports problem:', e.message); }
  }
  setInterval(scheduler, 10 * 60 * 1000); setTimeout(scheduler, 20000);

  // ---------------------------------------------------------------- backups & data (admins)
  const BK = process.env.BACKUPS_DIR ? path.resolve(process.env.BACKUPS_DIR) : path.join(DIR, 'backups'), stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/(\d{8})(\d{4})/, '$1-$2');
  const okName = f => /^[\w.-]+\.json$/.test(f);
  const DL = { dotfiles: 'allow' };   // downloads must also work when the app runs inside a "." folder (e.g. .claude\worktrees\...); file names are checked by okName
  const backupNow = label => { fs.mkdirSync(BK, { recursive: true }); const f = `data-${stamp()}${label ? '-' + label : ''}.json`; fs.copyFileSync(FILE, path.join(BK, f)); return f; };
  app.get('/api/backups', need('admin'), (req, res) => { fs.mkdirSync(BK, { recursive: true }); res.json(fs.readdirSync(BK).filter(okName).map(f => { const s = fs.statSync(path.join(BK, f)); return { f, size: s.size, at: s.mtime }; }).sort((a, b) => b.at - a.at)); });
  app.post('/api/backups', need('admin'), (req, res) => res.json({ f: backupNow(str((req.body || {}).label, 20).replace(/[^\w-]/g, '')) }));
  app.get('/api/backups/current/download', need('admin'), (req, res) => res.download(FILE, `q-smart-data-${stamp()}.json`, DL));
  app.get('/api/backups/:f', need('admin'), (req, res) => { const f = req.params.f; if (!okName(f) || !fs.existsSync(path.join(BK, f))) return res.status(404).json({ error: 'not found' }); res.download(path.join(BK, f), f, DL); });
  app.delete('/api/backups/:f', need('admin'), (req, res) => { const f = req.params.f; if (okName(f)) fs.rmSync(path.join(BK, f), { force: true }); res.json({ ok: 1 }); });
  const validData = d => d && Array.isArray(d.users) && Array.isArray(d.evaluations) && d.users.some(u => u.role === 'admin');
  // the upload route must come BEFORE "/:f/restore", otherwise "upload" is taken for a backup file name and the restore always answers "not found"
  app.post('/api/backups/upload/restore', need('admin'), (req, res) => {
    const d = (req.body || {}).data; if (!validData(d)) return bad(res, 'That file is not a Q-smart backup with an admin user');
    const safety = backupNow('before-restore'); save(d); res.json({ ok: 1, safety });
  });
  app.post('/api/backups/:f/restore', need('admin'), (req, res) => {
    const f = req.params.f, p = path.join(BK, f); if (!okName(f) || !fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
    let d; try { d = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return bad(res, 'That backup file is damaged'); }
    if (!validData(d)) return bad(res, 'That file is not a Q-smart backup with an admin user');
    const safety = backupNow('before-restore'); save(d); res.json({ ok: 1, safety });
  });
  // the data saved inside seed.js becomes today's data (what "node seed.js" brings back). Only when the app runs on its own data.json:
  // a copy started with DATA_FILE (the tests, a demo copy) must never write its made-up data into the project's seed.js
  app.post('/api/seed/refresh', need('admin'), (req, res) => {
    if (!app.locals.devTools) return res.status(403).json({ error: 'The developer tools are switched off on this server' });
    if (path.resolve(FILE) !== path.join(DIR, 'data.json')) return bad(res, 'This copy of the app works on another data file, so seed.js was not changed');
    const p = path.join(DIR, 'seed.js'); let s; try { s = fs.readFileSync(p, 'utf8'); } catch (e) { return bad(res, 'seed.js was not found'); }
    const a = s.indexOf('const DATA = '), b = s.indexOf(';\n\nfunction restore'), b2 = s.indexOf(';\r\n\r\nfunction restore'), end = b >= 0 ? b : b2;
    if (a < 0 || end < 0) return bad(res, 'seed.js does not have the expected layout');
    fs.writeFileSync(p, s.slice(0, a) + 'const DATA = ' + JSON.stringify(load()) + s.slice(end)); res.json({ ok: 1, at: iso() });
  });
};
