// Admin › Platform (3 November): the sandbox, Import data and Beta features.
//  - Sandbox: a second data file (sandbox.json). An admin makes it (a made-up company, or a copy of the data), enters it and leaves it;
//    while inside, every page reads and writes only that file (server.js). Nothing there reaches the real data, people or money.
//  - Import data: users, teams or reviews from a CSV or Excel file. The preview runs the import on a copy, so it shows exactly what
//    will happen, row by row; Import does the same on the data. Inside the sandbox it imports into the sandbox (a safe first try).
const fs = require('fs'), ExcelJS = require('exceljs'), bcrypt = require('bcryptjs');
const { company } = require('./sandbox-data');
module.exports = ({ app, load, save, need, bad, hex, iso, str, SBOX_FILE, SBX, addUser, addTeam, DEFAULT_PASSWORD, ADMIN_TEAM }) => {
  // ---------------------------------------------------------------- the sandbox
  const sbInfo = () => { try { const st = fs.statSync(SBOX_FILE), d = JSON.parse(fs.readFileSync(SBOX_FILE, 'utf8'));
    return { exists: true, at: st.mtime.toISOString(), from: d.sandboxFrom || 'demo', made: d.sandboxAt || '', people: (d.users || []).length, reviews: (d.evaluations || []).length, sims: (d.simulations || []).length }; } catch (e) { return { exists: false }; } };
  app.get('/api/sandbox', need('admin'), (req, res) => res.json({ ...sbInfo(), on: !!req.sandbox }));
  // a new sandbox replaces the old one; it is always made from the real data (also when you are inside the sandbox)
  app.post('/api/sandbox', need('admin'), (req, res) => SBX.exit(() => {
    const from = (req.body || {}).from === 'copy' ? 'copy' : 'demo', real = load(), me = real.users.find(u => u.username === req.session.user.username);
    if (!me) return bad(res, 'Your account was not found');
    const d = from === 'copy' ? JSON.parse(JSON.stringify(real)) : company(me);
    if (d.settings) { delete d.settings.ai; delete d.settings.mailtpl; delete d.settings.billing; }   // and no Stripe keys   // no AI keys and no e-mail texts in the copy: the sandbox never spends money or writes to people
    Object.assign(d, { sandbox: true, sandboxFrom: from, sandboxAt: iso() });
    const tmp = SBOX_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(d, null, 2)); fs.renameSync(tmp, SBOX_FILE);
    req.session.sandbox = true; res.json({ ...sbInfo(), on: true });
  }));
  app.post('/api/sandbox/enter', need('admin'), (req, res) => { if (!fs.existsSync(SBOX_FILE)) return bad(res, 'Make the sandbox first'); req.session.sandbox = true; res.json({ ...sbInfo(), on: true }); });
  app.post('/api/sandbox/leave', need('admin'), (req, res) => { req.session.sandbox = false; res.json({ ...sbInfo(), on: false }); });
  app.delete('/api/sandbox', need('admin'), (req, res) => { try { fs.rmSync(SBOX_FILE, { force: true }); } catch (e) { /* already gone */ } req.session.sandbox = false; res.json({ exists: false, on: false }); });

  // ---------------------------------------------------------------- Import data
  // the columns of each kind; a file may use any of the names on the right (upper or lower case, any order)
  const COLS = {
    users: { name: ['name', 'full name'], firstName: ['first name', 'firstname'], lastName: ['last name', 'lastname', 'surname'], username: ['username', 'user'], email: ['email', 'e-mail'], role: ['role'], team: ['team'] },
    teams: { name: ['name', 'team', 'team name'], lead: ['lead', 'team lead', 'leader'] },
    reviews: { date: ['date', 'day'], agent: ['agent', 'agent username', 'agent name'], id: ['lead', 'lead id', 'id', 'conversation', 'ticket'], score: ['score', 'score %', 'result'], channel: ['channel', 'type'], reviewer: ['reviewer', 'qa', 'reviewed by'], comment: ['comment', 'comments', 'feedback'] }
  };
  const EXAMPLE = { users: [['Name', 'Email', 'Role', 'Team'], ['Maria Ivanova', 'maria@example.com', 'agent', 'B2B']], teams: [['Name', 'Lead'], ['VIP KAM', '']],   // the lead of the example is the admin who downloads it
    reviews: [['Date', 'Agent', 'Lead ID', 'Score', 'Channel', 'Reviewer', 'Comment'], ['2026-11-02', 'Maria Ivanova', 'LEAD-1001', '92', 'call', 'Quinn Harper', 'Clear offer, good close']] };
  const ROLE = { agent: 'agent', qa: 'qa', 'qa specialist': 'qa', lead: 'lead', 'team lead': 'lead', trainer: 'trainer', admin: 'admin', administrator: 'admin' };
  const CHN = { call: 'call', phone: 'call', voice: 'call', chat: 'chat', email: 'email', 'e-mail': 'email', mail: 'email', other: 'other' };
  // a CSV line: commas or semicolons, "quoted" values may hold them
  function csv(text) {
    const t = String(text).replace(/^﻿/, ''), first = t.split(/\r?\n/)[0] || '', sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], v = '', q = false;
    for (let i = 0; i < t.length; i++) { const c = t[i];
      if (q) { if (c === '"' && t[i + 1] === '"') { v += '"'; i++; } else if (c === '"') q = false; else v += c; continue; }
      if (c === '"') q = true; else if (c === sep) { row.push(v); v = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(v); rows.push(row); row = []; v = ''; } else v += c; }
    if (v || row.length) { row.push(v); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim()));
  }
  async function readFile(f) {
    if (!f || typeof f.data !== 'string' || f.data.length > 7e6) throw new Error('Choose a CSV or Excel file smaller than 5 MB');
    const buf = Buffer.from(f.data, 'base64'), name = String(f.name || '').toLowerCase();
    if (name.endsWith('.xlsx')) { const wb = new ExcelJS.Workbook(); try { await wb.xlsx.load(buf); } catch (e) { throw new Error('This Excel file could not be read'); }
      const ws = wb.worksheets[0]; if (!ws) return []; const out = [];
      ws.eachRow({ includeEmpty: false }, r => { const vals = []; for (let c = 1; c <= ws.columnCount; c++) { let x = r.getCell(c).value; if (x && typeof x === 'object') x = x instanceof Date ? x.toISOString().slice(0, 10) : x.text || x.result || ''; vals.push(x == null ? '' : String(x)); } out.push(vals); });
      return out.filter(r => r.some(x => x.trim())); }
    if (name.endsWith('.csv') || name.endsWith('.txt')) return csv(buf.toString('utf8'));
    throw new Error('Choose a CSV or Excel (.xlsx) file');
  }
  // the header row tells which column is which
  const mapRows = (kind, rows) => { const C = COLS[kind], head = (rows[0] || []).map(h => String(h).trim().toLowerCase()), at = {};
    for (const [k, names] of Object.entries(C)) { const i = head.findIndex(h => names.includes(h)); if (i >= 0) at[k] = i; }
    return { cols: Object.keys(at), rows: rows.slice(1, 2001).map(r => Object.fromEntries(Object.entries(at).map(([k, i]) => [k, String(r[i] == null ? '' : r[i]).trim()]))), more: rows.length > 2001 }; };
  const teamId = (db, v) => { const t = db.teams.find(x => x.id === v || x.name.toLowerCase() === String(v).toLowerCase()); return t ? t.id : ''; };
  const userOf = (db, v) => { const s = String(v).toLowerCase(); return db.users.find(u => u.username === s) || db.users.find(u => (u.name || '').toLowerCase() === s); };
  const DAYRE = /^(\d{4})-(\d{2})-(\d{2})$|^(\d{1,2})[./](\d{1,2})[./](\d{4})$/;
  const dayOf = v => { const m = String(v).match(DAYRE); if (!m) return ''; const d = m[1] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[6]}-${m[5].padStart(2, '0')}-${m[4].padStart(2, '0')}`; return isNaN(new Date(d)) ? '' : d; };   // 2026-11-03 or 03.11.2026 / 03/11/2026 (day first)
  // one row: what would happen ("add") or why it is skipped; it changes db, so the preview gives it a copy
  const ONE = {
    users: (db, r, ctx) => { const role = ROLE[String(r.role || 'agent').toLowerCase()]; if (!role) throw new Error('Unknown role: ' + r.role);
      const team = role === 'agent' ? teamId(db, r.team) : ADMIN_TEAM; if (role === 'agent' && !team) throw new Error(r.team ? 'No team called ' + r.team : 'Choose a team. Every agent must belong to a team.');
      if (r.username && db.users.some(u => u.username === r.username.toLowerCase())) throw new Error('That username already exists');
      return addUser(db, { name: r.name, firstName: r.firstName, lastName: r.lastName, username: r.username, email: r.email, role, team }, ctx.hash).username; },
    teams: (db, r) => { if (!r.name) throw new Error('Give the team a name'); if (db.teams.some(t => t.name.toLowerCase() === r.name.toLowerCase())) throw new Error('A team with this name already exists');
      const lead = r.lead ? userOf(db, r.lead) : null; if (r.lead && !lead) throw new Error('No person called ' + r.lead); return addTeam(db, { name: r.name, lead: lead ? lead.username : '' }).name; },
    reviews: (db, r, ctx) => { const d = dayOf(r.date); if (!d) throw new Error('The date must look like 2026-11-03 or 03.11.2026');
      const a = userOf(db, r.agent || ''); if (!a || a.role !== 'agent') throw new Error(r.agent ? 'No agent called ' + r.agent : 'Write the agent');
      const id = str(r.id, 60); if (!id) throw new Error('Write the lead ID'); const sc = Number(String(r.score).replace('%', '').replace(',', '.'));
      if (!(sc >= 0 && sc <= 100) || r.score === '') throw new Error('The score must be a number from 0 to 100');
      if (db.evaluations.some(e => e.agent === a.username && e.id === id && String(e.d).slice(0, 10) === d)) throw new Error('This review is already there');
      const rv = r.reviewer ? userOf(db, r.reviewer) : null;
      db.evaluations.unshift({ rid: 'r' + hex(6), id, agent: a.username, agn: a.name, tid: a.team, d: new Date(d + 'T12:00:00Z').toISOString(), sc: Math.round(sc * 10) / 10, cs: [], scid: '', scn: 'Imported', st: 'ok', fl: '', cp: '', cm: str(r.comment, 1000),
        ch: CHN[String(r.channel || 'call').toLowerCase()] || 'other', rv: rv ? rv.name : str(r.reviewer, 80) || ctx.me.name, by: rv ? rv.username : ctx.me.username, seen: null, at: iso(), imp: true });
      return `${a.name} · ${id}`; }
  };
  // one review from another program (the API and MCP of routes-api.js use the same checks)
  app.locals.importReview = (db, r, me) => ONE.reviews(db, r, { me });
  app.locals.readTable = readFile;   // a CSV or Excel file as rows (Capacity planning imports the worked leads with it)
  function run(db, kind, rows, me) {
    const ctx = { me, hash: kind === 'users' ? bcrypt.hashSync(DEFAULT_PASSWORD, 10) : '' };   // one password hash for the whole file (everybody must change it at the first sign-in)
    return rows.map((r, i) => { try { return { n: i + 2, r, ok: true, what: ONE[kind](db, r, ctx) }; } catch (e) { return { n: i + 2, r, ok: false, why: e.message }; } });
  }
  async function prep(req, res) {
    const b = req.body || {}, kind = b.kind; if (!COLS[kind]) { bad(res, 'Choose what to import'); return null; }
    let rows; try { rows = await readFile(b.file); } catch (e) { bad(res, e.message); return null; }
    const m = mapRows(kind, rows); if (!m.rows.length) { bad(res, 'The file has no rows under its header'); return null; }
    const need1 = { users: ['name', 'firstName'], teams: ['name'], reviews: ['date', 'agent', 'score'] }[kind];
    // users need a name or a first name; teams a name; reviews a date, an agent and a score
    if (kind === 'users' ? !m.cols.some(c => need1.includes(c)) : !need1.every(c => m.cols.includes(c))) { bad(res, 'The first row must name the columns, for example: ' + EXAMPLE[kind][0].join(', ')); return null; }
    return { kind, m };
  }
  app.post('/api/import/preview', need('admin'), async (req, res) => {
    const p = await prep(req, res); if (!p) return;
    const db = JSON.parse(JSON.stringify(load())), out = run(db, p.kind, p.m.rows, req.session.user);
    res.json({ cols: p.m.cols, more: p.m.more, rows: out.slice(0, 500), add: out.filter(x => x.ok).length, skip: out.filter(x => !x.ok).length, sandbox: !!req.sandbox });
  });
  app.post('/api/import', need('admin'), async (req, res) => {
    const p = await prep(req, res); if (!p) return;
    const db = load(), out = run(db, p.kind, p.m.rows, req.session.user), add = out.filter(x => x.ok).length;
    if (add) save(db);
    res.json({ add, skip: out.length - add, sandbox: !!req.sandbox });
  });
  app.get('/api/import/template/:kind', need('admin'), (req, res) => { let e = EXAMPLE[req.params.kind]; if (!e) return res.status(404).json({ error: 'not found' }); if (req.params.kind === 'teams') e = [e[0], ['VIP KAM', req.session.user.username]];
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="q-smart-${req.params.kind}.csv"` }).send('﻿' + e.map(r => r.map(x => /[",;\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x).join(',')).join('\r\n') + '\r\n'); });
};
