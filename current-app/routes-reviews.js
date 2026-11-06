// Reviews: evaluations, disputes, scorecards, the Excel export of call reviews and the call recordings.
// These routes were part of server.js until 3 November; they use the same helpers, handed over by server.js.
module.exports = ({ BASE, DAY, EXT, EXTS, ExcelJS, FLAGS, REC, STAFF, agentInScope, app, bad, build, canSee, cellOf, chFields, chOf, cleanSC, cur, evDate, evOf, express, findEv, forAgent, fs, hex, inScope, isAudio, isOwner, iso, lday, leadId, link, load, mail, need, newEval, notify, path, recFiles, save, scopeOf, staffUsers, str, userBy }) => {
  app.get('/api/evaluations', need(), (req, res) => { const db = load(), u = req.session.user, l = db.evaluations.filter(e => canSee(u, e) && inScope(db, u, e)), have = l.some(e => e.rec) ? recFiles() : null;
    res.json(l.map(e => forAgent(db, u, e.rec && !have.has(path.basename(e.rec)) ? { ...e, recMissing: true } : e))); });
  app.post('/api/evaluations', need('admin', 'qa'), (req, res) => { const db = load(), r = newEval(db, req.session.user, req.body || {}); if (r.err) return bad(res, r.err); save(db); res.json(r.ev); });
  app.put('/api/evaluations/:rid', need('admin', 'qa'), (req, res) => {
    const db = load(), ev = evOf(db, req.session.user, req.params.rid), b = req.body || {};
    if (!ev) return res.status(404).json({ error: 'not found' });
    const oldSc = ev.sc;
    if (b.a !== undefined) {
      if (!ev.cs.some(c => c.it.length)) return bad(res, 'This older record has no item answers, so its scores cannot be edited');
      try {
        const r = build({ cats: ev.cs.map(c => ({ n: c.n, k: c.k, it: c.it.map(i => ({ t: i.t, p: i.p, k: i.k, cp: i.cp })) })) }, b.a, { all: true });
        ev.cs = r.cs; ev.sc = r.sc; if (r.ns) ev.ns = true; else delete ev.ns;
      } catch (err) { return bad(res, err.code === 'ANSWER' ? err.message : 'The answers do not match the scorecard'); }
    }
    if (b.id !== undefined) { const id = leadId(b.id); if (!id || id.length > 60) return bad(res, 'Enter the lead ID (up to 60 characters)'); ev.id = id; }
    if (b.agent !== undefined && b.agent !== ev.agent) {
      const au = db.users.find(x => x.username === b.agent && x.role === 'agent');
      if (!au || !agentInScope(db, req.session.user, au)) return bad(res, 'Choose an agent');
      ev.agent = au.username; ev.agn = au.name; ev.tid = au.team;
    }
    if (b.dt !== undefined) {
      if (!DAY.test(b.dt)) return bad(res, 'Choose the date');
      if (lday(new Date(ev.d)) !== b.dt) ev.d = evDate(b.dt);
    }
    if (b.fl !== undefined) ev.fl = FLAGS.includes(b.fl) ? b.fl : '';
    if (b.cp !== undefined) ev.cp = str(b.cp, 80);
    if (b.cm !== undefined) ev.cm = str(b.cm, 1000);
    if (b.lk !== undefined) ev.lk = link(b.lk);
    if (b.rl !== undefined) ev.rl = link(b.rl);
    if (b.ch !== undefined) { ev.ch = chOf(b.ch); Object.assign(ev, chFields(b, ev.ch)); if (ev.ch !== 'call') ev.rl = ''; }
    if (ev.sc !== oldSc) notify(db, ev.agent, 'review', ev.ns ? `Your review for Lead #${ev.id} was updated (not scored)` : `Your review for Lead #${ev.id} was updated (score ${ev.sc}%)`, { rid: ev.rid, lead: ev.id });
    save(db); res.json(ev);
  });
  app.delete('/api/evaluations/:rid', need('admin', 'qa'), (req, res) => {
    const db = load(), ev = evOf(db, req.session.user, req.params.rid);
    if (!ev) return res.status(404).json({ error: 'not found' });
    db.evaluations = db.evaluations.filter(e => e !== ev);
    db.notifications = db.notifications.filter(n => n.rid !== ev.rid);
    save(db);
    if (ev.rec) try { fs.unlinkSync(path.join(REC, path.basename(ev.rec))); } catch (e) {}
    res.json({ ok: 1 });
  });
  app.post('/api/evaluations/:rid/seen', need('agent'), (req, res) => {           // the agent opening the review marks it as seen
    const db = load(), ev = findEv(db, req.params.rid);
    if (!ev || !isOwner(req.session.user, ev)) return res.status(404).json({ error: 'not found' });
    if (!ev.seen) { ev.seen = iso(); save(db); }
    res.json({ seen: ev.seen });
  });
  app.post('/api/evaluations/:rid/remind', need('admin', 'qa'), (req, res) => {   // QA reminds the agent to open the review
    const db = load(), ev = evOf(db, req.session.user, req.params.rid);
    if (!ev) return res.status(404).json({ error: 'not found' });
    if (ev.seen) return bad(res, 'The agent has already seen this review');
    const u = userBy(db, ev.agent);
    if (!u || u.active === false) return bad(res, 'This agent no longer has an active account, so there is nobody to remind');
    if (ev.rm && Date.now() - new Date(ev.rm) < 6e5) return bad(res, 'A reminder was already sent a moment ago');
    notify(db, u.username, 'remind', `Reminder: please open your call review for Lead #${ev.id}`, { rid: ev.rid, lead: ev.id });
    mail(u.email, 'Reminder: you have a call review waiting', `Hi ${u.name},\n\nPlease open your call review for Lead #${ev.id}:\n${BASE}\n`, 'reminder', { name: u.name, link: BASE, lead: ev.id });
    ev.rm = iso(); save(db); res.json({ ok: 1 });
  });
  // ---- disputes: the agent disagrees, QA and the agent talk in a thread, QA resolves it
  app.post('/api/evaluations/:rid/dispute', need('agent'), (req, res) => {
    const db = load(), ev = findEv(db, req.params.rid), u = req.session.user;
    if (!ev || !isOwner(u, ev)) return res.status(404).json({ error: 'not found' });
    if (ev.dp) return bad(res, 'This review has already been disputed');
    const text = str((req.body || {}).text, 1000);
    if (!text) return bad(res, 'Write the reason for your dispute');
    ev.dp = { status: 'open', at: iso(), msgs: [{ u: u.username, n: u.name, r: 'agent', t: text, at: iso() }] };
    ev.st = 'disputed';
    staffUsers(db).forEach(s => notify(db, s.username, 'dispute', `${u.name} has disputed the review for Lead #${ev.id}`, { rid: ev.rid, lead: ev.id }));
    save(db); res.json(ev);
  });
  app.post('/api/evaluations/:rid/dispute/msg', need(), (req, res) => {
    const db = load(), u = req.session.user, ev = evOf(db, u, req.params.rid);
    if (!ev || !ev.dp) return res.status(404).json({ error: 'not found' });
    const staff = u.role === 'admin' || u.role === 'qa';
    if (!staff && !isOwner(u, ev)) return res.status(403).json({ error: 'not allowed' });
    if (ev.dp.status !== 'open') return bad(res, 'This dispute is already resolved');
    const text = str((req.body || {}).text, 1000);
    if (!text) return bad(res, 'Write a message first');
    ev.dp.msgs.push({ u: u.username, n: u.name, r: u.role, t: text, at: iso() });
    const to = staff ? [userBy(db, ev.agent)].filter(Boolean) : staffUsers(db);
    to.forEach(x => { if (x.username !== u.username) notify(db, x.username, 'msg', `${u.name} wrote in the dispute for Lead #${ev.id}: "${text.slice(0, 70)}"`, { rid: ev.rid, lead: ev.id }); });
    save(db); res.json(ev);
  });
  app.post('/api/evaluations/:rid/dispute/resolve', need('admin', 'qa'), (req, res) => {
    const db = load(), u = req.session.user, ev = evOf(db, u, req.params.rid), b = req.body || {};
    if (!ev || !ev.dp) return res.status(404).json({ error: 'not found' });
    if (ev.dp.status !== 'open') return bad(res, 'This dispute is already resolved');
    const outcome = ['changed', 'partly'].includes(b.outcome) ? b.outcome : 'kept', note = str(b.note, 500), ow = { kept: 'kept', changed: 'changed', partly: 'partly changed' }[outcome];   // partly = the agent was partly right
    ev.dp.status = 'resolved'; ev.dp.res = { outcome, note, by: u.name, at: iso() };
    ev.dp.msgs.push({ u: u.username, n: u.name, r: u.role, sys: 1, t: `Dispute resolved - score ${ow}${note ? ': ' + note : ''}`, at: iso() });
    ev.st = 'ok';
    notify(db, ev.agent, 'resolved', `Your dispute for Lead #${ev.id} was resolved: score ${ow}`, { rid: ev.rid, lead: ev.id });
    save(db); res.json(ev);
  });
  app.get('/api/scorecards', need(), (req, res) => { const db = load(), s = scopeOf(db, req.session.user); res.json(db.scorecards.filter(c => !s || s.sc.has(c.id))); });
  app.post('/api/scorecards', need('admin'), (req, res) => {
    try { const db = load(), s = cleanSC(req.body || {}); s.id = 'sc-' + hex(4); db.scorecards.push(s); const ws = db.workspaces.find(w => w.id === (req.body || {}).workspace) || db.workspaces[0]; if (ws) ws.scorecards.push(s.id); save(db); res.json(s); } catch (err) { bad(res, err.message); }
  });
  app.put('/api/scorecards/:id', need('admin'), (req, res) => {
    const db = load(), cur = db.scorecards.find(s => s.id === req.params.id);
    if (!cur) return res.status(404).json({ error: 'not found' });
    try { Object.assign(cur, cleanSC(req.body || {})); save(db); res.json(cur); } catch (err) { bad(res, err.message); }
  });
  app.delete('/api/scorecards/:id', need('admin'), (req, res) => {
    const db = load();
    if (db.scorecards.length <= 1) return bad(res, 'At least one scorecard is required');
    if (!db.scorecards.some(s => s.id === req.params.id)) return res.status(404).json({ error: 'not found' });
    db.scorecards = db.scorecards.filter(s => s.id !== req.params.id); db.workspaces.forEach(w => { w.scorecards = w.scorecards.filter(x => x !== req.params.id); }); save(db); res.json({ ok: 1 });
  });
  // dc = the column that holds the dates (Call Reviews: 1, Quick Flags: 2, reports: none = -1); only a real YYYY-MM-DD value in it becomes an Excel date
  app.post('/api/export/call-reviews', need(), async (req, res) => {
    const b = req.body || {}, raw = b.rows, pf = Number(b.pf), pt = Number(b.pt), dc = b.dc === undefined ? 1 : Number(b.dc), name = str(b.name, 30) || 'Call Reviews', u = req.session.user;
    if (!Array.isArray(raw) || !raw.length || raw.length > 20000) return res.status(400).json({ error: 'bad rows' });
    const rows = raw.map(r => (Array.isArray(r) ? r : []).slice(0, 200).map(cellOf));
    if (!b.again && STAFF.includes(u.role)) {   // the Export centre (staff only) keeps a copy, but never a big one inside the data file
      const db = load(), keep = rows.length <= 5001 && JSON.stringify(rows).length <= 2e6; db.exports = Array.isArray(db.exports) ? db.exports : [];
      db.exports.unshift({ id: 'x' + hex(5), name, n: rows.length - 1, pf, pt, dc, by: u.username, byName: u.name, at: iso(), rows: keep ? rows : null }); db.exports = db.exports.slice(0, 200); save(db);
    }
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet(name.replace(/[\\/?*[\]:]/g, ' '));
    // which columns are dates and percentages: the ones the page names (dc, pf..pt), and any column whose header says so (reports send none)
    const head = rows[0].map(h => String(h == null ? '' : h)), isDate = j => j === dc || /(date|day|created|updated|completed|due|reviewed)/i.test(head[j]), isPct = j => (j >= pf && j <= pt) || /%/.test(head[j]);
    rows.forEach((r, i) => ws.addRow(r.map((v, j) => (i && isDate(j) && typeof v === 'string' && DAY.test(v)) ? new Date(v + 'T12:00:00') : v)));
    ws.eachRow((row, n) => row.eachCell((c, j) => {
      c.font = { name: 'Calibri', size: 12, bold: n === 1 };
      // Excel's own formats (Gabriela, 4 November): a real Date in the Date category (the short date of the computer that opens it), and a
      // score as a real Percentage (85.6 is saved as 0.856 and shown as 85.60%), so formulas, filters and pivot tables read them as numbers
      if (n > 1 && isDate(j - 1) && c.value instanceof Date) c.numFmt = 'mm-dd-yy';   // built-in format 14: Excel shows it in the Date category
      if (n > 1 && isPct(j - 1) && typeof c.value === 'number') { c.value = Math.round(c.value * 10) / 1000; c.numFmt = '0.00%'; }   // built-in format 10: Percentage
    }));
    const nC = rows[0].length, wide = { 5: 34, [nC - 2]: 30, [nC - 1]: 40, [nC]: 40 };
    ws.columns.forEach((col, i) => { col.width = wide[i + 1] || Math.min(34, Math.max(11, String(rows[0][i]).length + 4)); });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Export.xlsx"');
    await wb.xlsx.write(res); res.end();
  });
  app.post('/api/evaluations/:rid/recording', need('admin', 'qa'), express.raw({ type: () => true, limit: '100mb' }), (req, res) => {
    const db = load(), ev = evOf(db, req.session.user, req.params.rid);
    const q = String(req.query.ext || '').toLowerCase(), ext = EXT[String(req.headers['content-type']).split(';')[0]] || (EXTS.includes(q) ? q : '');   // some browsers send no audio type: the file name decides
    if (!ev) return res.status(404).json({ error: 'evaluation not found' });
    if (!ext) return res.status(415).json({ error: 'unsupported audio type' });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'empty file' });
    if (!isAudio(req.body, ext)) return res.status(415).json({ error: 'This file is not a real audio recording' });
    fs.mkdirSync(REC, { recursive: true });
    const name = String(ev.rid).replace(/[^\w-]/g, '') + '-' + Date.now() + '.' + ext;   // only letters and numbers: the file always lands in the recordings folder
    fs.writeFileSync(path.join(REC, name), req.body);
    if (ev.rec) fs.rm(path.join(REC, path.basename(ev.rec)), () => {});      // the old file is replaced
    ev.rec = name; save(db); res.json({ rec: name });
  });
  app.delete('/api/evaluations/:rid/recording', need('admin', 'qa'), (req, res) => {
    const db = load(), ev = evOf(db, req.session.user, req.params.rid);
    if (!ev) return res.status(404).json({ error: 'evaluation not found' });
    if (ev.rec) fs.rm(path.join(REC, path.basename(ev.rec)), () => {});
    ev.rec = ''; save(db); res.json({ ok: 1 });
  });
  app.get('/api/recordings/:file', need(), (req, res) => {
    const db = load(), f = path.basename(req.params.file), ev = db.evaluations.find(e => e.rec === f);
    if (!ev || !canSee(req.session.user, ev) || !inScope(db, req.session.user, ev)) return res.status(404).json({ error: 'not found' });
    if (req.session.user.role === 'agent' && ((db.settings || {}).privacy || {}).agentsRec === false) return res.status(403).json({ error: 'Recordings are not shared with agents' });
    if (!fs.existsSync(path.join(REC, f))) return res.status(404).json({ error: 'The recording file is missing' });
    res.sendFile(path.join(REC, f), { dotfiles: 'allow' });   // the folder path may contain a "." folder (e.g. .claude); the file name itself was checked above
  });
};
