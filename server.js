// Q-smart server: the start-up, the security of every request (headers, sign-in, CSRF, limits), the data file (data.json, or sandbox.json
// inside the sandbox), e-mail and notifications, and the shared helpers. The routes are in the routes-*.js files (see docs/ARCHITECTURE.md).
const express = require('express'), session = require('express-session');
const bcrypt = require('bcryptjs'), fs = require('fs'), path = require('path');
const crypto = require('crypto'), nodemailer = require('nodemailer'), ExcelJS = require('exceljs');
const { DEFAULT_SC, build } = require('./scorecard');
const { ensureBootstrap, uname, ADMIN_TEAM } = require('./bootstrap');
const wfm = require('./wf');
const { AsyncLocalStorage } = require('async_hooks');                                    // workforce rules: work calendars, shifts, the rota

const FILE = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : path.join(__dirname, 'data.json');   // <- this file IS the database (DATA_FILE = use another copy, e.g. for the tests)
// the sandbox (Admin › Sandbox): a second data file next to data.json. While an admin is inside it, every load() and save() of their
// requests uses sandbox.json (SBX remembers it for the whole request, also across await); everybody else, and the timers, use data.json.
const SBOX_FILE = path.join(path.dirname(FILE), 'sandbox.json'), SBX = new AsyncLocalStorage();
const cur = () => (SBX.getStore() || {}).file || FILE;
const DEFAULT_PASSWORD = 'password';                       // every user created in the app starts with this and must change it at first login
const ROLES = ['admin', 'qa', 'lead', 'trainer', 'agent'];
const STAFF = ['admin', 'qa', 'lead', 'trainer'];          // everyone who is not an agent
const FLAGS = ['', 'green', 'red'];
const LEGACY = ['Greeting & Introduction', 'Vocabulary & Professionalism', 'Empathy & Active Listening', 'Documentation & Reasoning',
  'Persuasion & Objection Handling', 'Process Adherence', 'Closing & Positive Outcome'];
const hex = n => crypto.randomBytes(n).toString('hex');
const iso = () => new Date().toISOString();

// ------------------------------------------------------------------ database
function save(db) {                                       // write a copy first, then swap it in: a crash half-way never leaves a broken data.json
  const F = cur(), s = JSON.stringify(db, null, 2), tmp = F + '.tmp';
  try { fs.writeFileSync(tmp, s); fs.renameSync(tmp, F); }
  catch (e) { fs.writeFileSync(F, s); try { fs.unlinkSync(tmp); } catch (x) { /* nothing left to clean */ } }   // e.g. OneDrive briefly locks the file
}
function load() {
  const F = cur();
  if (F === FILE && !fs.existsSync(FILE)) require('./seed').restore();      // a new folder starts with the data saved in seed.js
  const db = fs.existsSync(F) ? JSON.parse(fs.readFileSync(F, 'utf8')) : { users: [], evaluations: [] };
  let dirty = false;
  if (!Array.isArray(db.scorecards) || !db.scorecards.length) db.scorecards = [DEFAULT_SC];
  for (const k of ['notifications', 'registrations', 'tasks', 'taskTpl', 'taskSeq', 'taskRuns', 'simScen', 'o2oTpl', 'sessions', 'calibrations', 'kbFolders', 'kbArticles', 'newsletters', 'quizzes', 'attempts', 'simulations', 'qflags'])
    if (!Array.isArray(db[k])) db[k] = [];
  if (!db.kbReads) db.kbReads = {};
  if (!db.settings) db.settings = { pass: 85, teams: {} };
  if (!db.oldTeams) db.oldTeams = {};
  db.evaluations.forEach(e => {
    if (!e.cs && Array.isArray(e.c)) {   // records from earlier versions: a percent per category, no item answers
      if (e.c.length === 6) {
        e.c = [e.c[0], e.c[2], Math.round(e.c.reduce((x, y) => x + y) / 6), e.c[3], e.c[4], e.c[1], e.c[5]];
        e.sc = Math.round(e.c.reduce((x, y) => x + y) / 7);
      }
      e.cs = LEGACY.map((n, k) => ({ n, e: e.c[k], m: 100, it: [] })); e.scn = 'Imported';
    }
    delete e.c;
    e.fl = e.fl === true ? 'red' : (e.fl || '');
    if (!e.rid) { e.rid = 'r' + hex(6); dirty = true; }
    if (typeof e.id !== 'string') e.id = String(e.id);
    if (e.seen === undefined) e.seen = null;
  });
  // October 2026: the written scorecard uses the same 7 category names as the call scorecard, so Analytics shows one list of 7.
  // Only the names change (its questions, points and scores stay); it runs once (settings.catNames7), also after a restore from seed.js.
  if (db.settings && !db.settings.catNames7) {
    const M = { 'Greeting & Personalisation': 'Greeting & Introduction', 'Writing Quality': 'Vocabulary & Professionalism', 'Understanding the Request': 'Empathy & Active Listening', 'Compliance & Data Protection': 'Documentation & Reasoning', Timeliness: 'Process Adherence', 'Accuracy & Solution': 'Persuasion & Objection Handling', Closing: 'Closing & Positive Outcome' };
    const sc = (db.scorecards || []).find(s => s.id === 'sc-written');
    if (sc) sc.cats.forEach(c => { if (M[c.n]) c.n = M[c.n]; });
    db.evaluations.forEach(e => { if (e.scid === 'sc-written') (e.cs || []).forEach(c => { if (M[c.n]) c.n = M[c.n]; }); });
    db.settings.catNames7 = true; dirty = true;
  }
  if (ensureBootstrap(db)) dirty = true;
  if (dirty) save(db);
  return db;
}
const link = v => /^https?:\/\//i.test(String(v || '')) ? String(v).slice(0, 300) : '';
// a review is about one kind of conversation; old reviews without a type are calls
const CHANNELS = ['call', 'chat', 'email', 'other'], CHN = { call: 'call', chat: 'chat', email: 'email', other: 'conversation' };
const chOf = v => CHANNELS.includes(v) ? v : 'call';
// the extra fields of chats, emails and other conversations (a call keeps its recording link and file)
const chFields = (b, ch) => ch === 'call' ? { cl: '', tx: '', subj: '', chn: '' } : { cl: link(b.cl), tx: str(b.tx, 20000), subj: ch === 'email' ? str(b.subj, 200) : '', chn: ch === 'other' ? str(b.chn, 40) : '' };
const bad = (res, msg) => res.status(400).json({ error: msg });
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const list = (v, n = 20, m = 40) => (Array.isArray(v) ? v : String(v || '').split(',')).map(x => str(x, m)).filter(Boolean).slice(0, n);

// ------------------------------------------------------------------ email, notifications, limits
const BASE = process.env.PUBLIC_URL || 'http://localhost:' + (process.env.PORT || 3000);
const mailer = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587, secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }) : null;
async function mail(to, subject, text, key, vars = {}, html) {
  if (!to || SBX.getStore()) return;   // the sandbox never sends e-mails to real people
  const t = key && ((load().settings || {}).mailtpl || {})[key], fill = s => String(s).replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? vars[k] : m);
  if (t && (t.subject || t.body)) { if (t.subject) subject = fill(t.subject); if (t.body) text = fill(t.body); }
  try {
    if (mailer) { await mailer.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, ...(html ? { html } : {}) }); console.log('Email sent to ' + to + ': ' + subject); }
    // without SMTP the e-mail is printed for the person running the app on their own computer; on a production server it never is
    // (it can hold a reset link), only the fact that it could not be sent (R-9)
    else if (process.env.NODE_ENV === 'production') console.log('[no SMTP configured] An e-mail to ' + to + ' could not be sent: ' + subject);
    else console.log('[no SMTP configured] Email to ' + to + ' - ' + subject + '\n' + text + '\n');
  } catch (e) { console.error('Mail failed:', e.message); }
}
function notify(db, to, type, text, extra = {}) {
  const u = db.users.find(x => x.username === to); if (u && (((db.settings || {}).notifOff || {})[type] || []).includes(u.role)) return;
  db.notifications.unshift({ id: 'n' + hex(5), to, type, text, at: iso(), read: false, ...extra });
  if (db.notifications.length > 5000) db.notifications.length = 5000;
}
const staffUsers = db => db.users.filter(u => u.role === 'admin' || u.role === 'qa');
const userBy = (db, username) => db.users.find(u => u.username === username);
const hits = {};
function limited(key, max, ms) {
  const now = Date.now(); hits[key] = (hits[key] || []).filter(t => now - t < ms);
  if (hits[key].length >= max) return true;
  hits[key].push(now);
  if (Object.keys(hits).length > 5000) for (const k in hits) if (!hits[k].some(t => now - t < 36e5)) delete hits[k];   // forget old visitors so the list cannot grow forever
  return false;
}
const recent = (key, ms) => (hits[key] || []).filter(t => Date.now() - t < ms).length;   // how many times, without counting this one
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const pwBad = p => {
  p = String(p || '');
  const min = Math.max(6, ((load().settings || {}).signin || {}).pwMin || 10);   // Admin › Organization › Sign-in; 10 characters unless an admin chose another length (decision 11, 4 November)
  if (p.length < min) return 'The password must be at least ' + min + ' characters';
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p)) return 'Use both uppercase and lowercase letters';
  if (!/\d/.test(p)) return 'Include at least one number';
  if (!/[^A-Za-z0-9]/.test(p)) return 'Include at least one special character';
  return '';
};
// first letter of the first name + "." + last name, lowercase, no accents or spaces
const plain = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const makeUsername = (first, last) => plain(first).slice(0, 1) + '.' + plain(last);
// first and last name come as two fields; the full name is always "First Last" (older callers may still send only a full name)
const nameParts = b => {
  let f = str(b.firstName, 40), l = str(b.lastName, 40);
  if (!f && !l) { const p = str(b.name, 80).split(/\s+/); f = p[0] || ''; l = p.slice(1).join(' '); }
  return { firstName: f, lastName: l, name: (f + ' ' + l).trim() };
};
const validEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
// pop-up preferences of one person: tips they switched off and whether routine confirmations are asked (errors and safeguards are never stored here)
const PREF_ID = /^[a-z][a-z0-9.-]{1,39}$/;
const LANGS = ['en', 'bg', 'fr'];
const cleanPrefs = p => {
  p = p && typeof p === 'object' ? p : {};
  const off = {};
  Object.entries(p.off && typeof p.off === 'object' && !Array.isArray(p.off) ? p.off : {}).slice(0, 100).forEach(([k, v]) => { if (PREF_ID.test(k)) off[k] = String(v || '').slice(0, 30); });
  const out = { info: p.info !== false, confirm: p.confirm !== false, off };
  if (LANGS.includes(p.lang)) out.lang = p.lang;                  // the language of the app (My account > Language); nothing saved = English
  // the columns each person shows in a table, in their order: { calls: ['id', 'ag', 'sc'] } (short lowercase keys only)
  const cols = {};
  Object.entries(p.cols && typeof p.cols === 'object' && !Array.isArray(p.cols) ? p.cols : {}).slice(0, 20).forEach(([k, v]) => {
    if (/^[a-z]{1,20}$/.test(k) && Array.isArray(v)) cols[k] = [...new Set(v.filter(c => typeof c === 'string' && /^[a-z]{1,12}$/.test(c)))].slice(0, 30);
  });
  if (Object.keys(cols).length) out.cols = cols;
  return out;
};
const pub = u => ({ username: u.username, name: u.name, firstName: u.firstName || '', lastName: u.lastName || '', email: u.email || '', role: u.role, team: u.team || '', title: u.title || '', mustChange: !!u.mustChange, layouts: u.layouts || {}, prefs: cleanPrefs(u.prefs), views: u.views || {},
  empId: u.empId || '', empType: u.empType || 'full', hours: u.hours || 40, manager: u.manager || '', cal: u.cal || '', shift: u.shift || '', pattern: u.pattern || '', birthday: u.birthday || '', showBday: !!u.showBday, ecName: u.ecName || '', ecPhone: u.ecPhone || '', ecRel: u.ecRel || '' });
// skills and languages can only be picked from the catalog (Admin > Skills); unknown names are dropped, spelling is normalised
const pick = (v, catalog) => { const out = []; (Array.isArray(v) ? v : String(v || '').split(',')).forEach(x => { const m = (catalog || []).find(c => c.toLowerCase() === String(x).trim().toLowerCase()); if (m && !out.includes(m)) out.push(m); }); return out; };
const rosterPub = u => ({ username: u.username, name: u.name, role: u.role, team: u.team || '', title: u.title || '', desc: u.desc || '', languages: u.languages || [], skills: u.skills || [], start: u.start || '', active: u.active !== false });

// ------------------------------------------------------------------ app + sessions
const app = express();
// the real visitor IP is read from the tunnel's X-Forwarded-For header only when the request comes from this computer (cloudflared runs here);
// a visitor on the network cannot fake their address to get around the sign-in limits. TRUST_PROXY = another setting, e.g. 1 behind a hosted proxy.
const TP = process.env.TRUST_PROXY;
app.set('trust proxy', /^\d+$/.test(TP || '') ? Number(TP) : TP === 'true' ? true : TP || 'loopback');
app.disable('x-powered-by');
// the Help Center website has its own address (help.<your domain>): its home page is the Help Center, not the app
app.use((req, res, next) => /^help\./i.test(req.hostname || '') && req.path === '/' ? res.redirect('/hc/') : next());
// the Content-Security-Policy: the pages still use inline onclick="…" handlers (R-7), so scripts must allow 'unsafe-inline' for now,
// but nothing can be loaded from or sent to another site (connect-src 'self'), no plug-ins, no <base> tricks, no framing by others.
// Images and audio may come from https links (company logo, recording links); fonts only from the app itself (public/fonts, R-24).
const CSP = ["default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "font-src 'self'",
  "img-src 'self' data: blob: https:", "media-src 'self' blob: https:", "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'"].join('; ');
app.use((req, res, next) => {   // basic browser protections: no framing by other sites (clickjacking), no guessing of file types; data answers are never cached
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': CSP,
    'Permissions-Policy': 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)' });   // the microphone: the AI Simulator's voice answers
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});
// compression (zlib is part of Node, nothing to install): an answer over 8 KB is sent gzipped to browsers that accept it. Through
// the tunnel this makes the big lists several times smaller (the reviews of a QA user: about 2 MB → a few hundred KB).
const zlib = require('zlib'), GZ = /\bgzip\b/;
app.use((req, res, next) => {
  if (!GZ.test(req.get('accept-encoding') || '')) return next();
  const send = res.send;
  res.send = function (body) {
    const type = String(res.get('Content-Type') || '');
    if (!res.get('Content-Encoding') && (typeof body === 'string' || Buffer.isBuffer(body)) && /json|javascript|css|html|text/.test(type) && Buffer.byteLength(body) > 8192) {
      res.set({ 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' }); res.removeHeader('Content-Length');
      return send.call(this, zlib.gzipSync(body, { level: 6 }));
    }
    return send.call(this, body);
  };
  next();
});
// the page's own files (scripts, styles, the page) gzipped once and kept in memory until the file changes; the browser still asks
// "has it changed?" every time (ETag), so a new version is always picked up at once
const PUB = path.join(__dirname, 'public'), ZC = new Map();
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const rel = req.path === '/' ? 'index.html' : req.path.slice(1), m = rel.match(/^(?:js\/(?:i18n\/)?[\w.-]+\.js|css\/[\w.-]+\.css|index\.html)$/);
  if (!m || !GZ.test(req.get('accept-encoding') || '')) return next();
  const f = path.join(PUB, rel); let st; try { st = fs.statSync(f); } catch (e) { return next(); }
  const tag = `W/"gz-${st.size}-${Math.round(st.mtimeMs)}"`;
  let z = ZC.get(f); if (!z || z.tag !== tag) { z = { tag, buf: zlib.gzipSync(fs.readFileSync(f), { level: 9 }) }; ZC.set(f, z); }
  res.set({ 'Content-Type': rel.endsWith('.js') ? 'text/javascript; charset=UTF-8' : rel.endsWith('.css') ? 'text/css; charset=UTF-8' : 'text/html; charset=UTF-8', 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', ETag: tag, 'Cache-Control': 'public, max-age=0' });
  if (req.get('if-none-match') === tag) return res.status(304).end();
  res.set('Content-Length', String(z.buf.length)); return req.method === 'HEAD' ? res.end() : res.end(z.buf);
});
app.use((req, res, next) => {   // a change sent by another website (CSRF) is refused, also from a neighbouring site of the same domain; the app itself sends "same-origin"
  const from = req.get('sec-fetch-site'), origin = req.get('origin');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (from && from !== 'same-origin' && from !== 'none') return res.status(403).json({ error: 'Requests from other websites are not allowed' });
    // older browsers send no Sec-Fetch-Site: their Origin header must then be this app's own address (as the visitor sees it: behind the tunnel, the forwarded host)
    let host = ''; try { host = !from && origin ? (origin === 'null' ? 'null' : new URL(origin).host) : ''; } catch (e) { host = 'bad'; }
    if (host && host !== req.get('host') && host !== req.get('x-forwarded-host')) return res.status(403).json({ error: 'Requests from other websites are not allowed' });
  }
  next();
});
app.use(session({
  secret: process.env.SECRET || hex(32),      // without $env:SECRET a random one is made at every start (sign-ins live in memory and end at a restart anyway)
  resave: false, saveUninitialized: false, rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 12 * 36e5 }   // 'auto': HTTPS-only when opened through HTTPS (the tunnel); signed out after 12 hours without use
}));
// only signed-in staff may send large data (imports, backups); an agent never needs more than a few hundred KB (an Excel file of their own reviews)
// the Stripe webhook is signed over its exact bytes, so for that one address the raw body is kept next to the parsed one
const keepRaw = (req, res, buf) => { if (req.originalUrl === '/api/billing/stripe-webhook') req.rawBody = buf; };
const bigJson = express.json({ limit: '25mb', verify: keepRaw }), midJson = express.json({ limit: '2mb', verify: keepRaw }), smallJson = express.json({ limit: '100kb', verify: keepRaw });
app.use((req, res, next) => { const u = req.session && req.session.user; (!u ? smallJson : u.role === 'agent' ? midJson : bigJson)(req, res, next); });
// no real page sends data nested more than a few levels deep; thousands of levels would crash whatever reads it next (it is checked without recursion)
const tooDeep = (v, max = 64) => { const st = [[v, 0]]; while (st.length) { const [x, d] = st.pop(); if (x && typeof x === 'object') { if (d >= max) return true; for (const k in x) st.push([x[k], d + 1]); } } return false; };
app.use((req, res, next) => req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) && tooDeep(req.body) ? res.status(400).json({ error: 'The request could not be read' }) : next());
// inside the sandbox: only for an admin who entered it, and only while the file exists; what could reach the real data, real people
// or real money is switched off there (backups and restores, the developer tools, purge, recordings, AI settings)
app.use((req, res, next) => { const u = req.session && req.session.user;
  if (!(req.session && req.session.sandbox && u && u.role === 'admin' && fs.existsSync(SBOX_FILE))) return next();
  req.sandbox = true; SBX.run({ file: SBOX_FILE }, next); });
const SBNO = /^\/api\/(backups|seed|demo|billing|org\/purge|evaluations\/[^/]+\/recording|ai\/(settings|keys|test|usage))/;
app.use((req, res, next) => req.sandbox && SBNO.test(req.path) && (req.method !== 'GET' || /^\/api\/backups/.test(req.path)) ? res.status(403).json({ error: 'This is switched off in the sandbox' }) : next());
const AUDIT = require('./audit');
app.use((req, res, next) => req.sandbox ? next() : AUDIT.middleware(req, res, next));   // the sandbox is practice: it is not written in the audit log
// the account as it is saved right now (re-read only when data.json changed), so a deactivated user or a changed role takes effect at once, not at the next login
let UC = { key: null, users: null };
function liveUser(username) { return SBX.exit(() => liveUser0(username)); }
function liveUser0(username) {
  let key = ''; try { const s = fs.statSync(FILE); key = s.mtimeMs + ':' + s.size; } catch (e) {}
  if (key !== UC.key || !UC.users) UC = { key, users: new Map(load().users.map(u => [u.username, u])) };
  return UC.users.get(username);
}
// false = the account is gone or deactivated, or its password was changed / reset after this sign-in (the sign-in is ended and 401 is sent)
function refreshSession(req, res) {
  const cur = liveUser(req.session.user.username);
  if (!cur || cur.active === false || (cur.pwv || 0) !== (req.session.pwv || 0)) { req.session.destroy(() => res.status(401).json({ error: 'login required' })); return false; }
  const s = req.session.user;
  if (s.role !== cur.role || s.team !== (cur.team || '') || s.name !== cur.name || s.mustChange !== !!cur.mustChange) req.session.user = pub(cur);
  return true;
}
const authed = (req, res, next) => !req.session.user ? res.status(401).json({ error: 'login required' }) : refreshSession(req, res) && next();
// must be logged in (and have finished the first-login password change) and, optionally, have one of the roles
const need = (...roles) => (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'login required' });
  if (!refreshSession(req, res)) return;
  const u = req.session.user;
  if (u.mustChange) return res.status(403).json({ error: 'You must set a new password first', mustChange: true });
  if (roles.length && !roles.includes(u.role)) return res.status(403).json({ error: 'not allowed' });
  next();
};
AUDIT.routes(app, need);
// the developer tools ("Reset to the seed data", "Refresh seed.js") work on your own computer; on a production server
// (NODE_ENV=production) they are off unless DEV_TOOLS=1 is set, so a customer's admin can never wipe the data (R-26)
const DEV_TOOLS = process.env.DEV_TOOLS === '1' || (process.env.DEV_TOOLS !== '0' && process.env.NODE_ENV !== 'production');
app.locals.devTools = DEV_TOOLS;
const devOnly = (req, res, next) => DEV_TOOLS ? next() : res.status(403).json({ error: 'The developer tools are switched off on this server' });
// puts back the data saved in seed.js (same as running "node seed.js"); the current data is kept in data.backup.json
app.post('/api/demo/reset', need('admin'), devOnly, (req, res) => {
  try { require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'seed.js')], { cwd: __dirname, stdio: 'ignore' }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'The reset failed - run "node seed.js" in the terminal to see why' }); }
});
// what the browser receives of the system settings: e-mail templates and notification rules are only for admins
const setOut = (db, u) => { const s = { ...db.settings, oldTeams: db.oldTeams, wf: wfm.settingsOf(db.settings.wf, wfm.localDay()), sandbox: !!SBX.getStore() }; delete s.ai; if (u.role !== 'admin') { delete s.mailtpl; delete s.notifOff; delete s.permtpl; s.permu = Object.fromEntries(Object.entries(s.permu || {}).filter(([, m]) => m && Object.hasOwn(m, u.username)).map(([p, m]) => [p, { [u.username]: m[u.username] }])); } return s; };   // a person only gets their own per-person access
const ctx = { newEval, addUser, addTeam, DEFAULT_PASSWORD, FILE, SBOX_FILE, SBX, DIR: __dirname, app, load, save, need, authed, bad, hex, iso, str, list, pick, notify, userBy, staffUsers, mail, BASE, ROLES, STAFF, express, ADMIN_TEAM, pub, limited, setOut,
  scopeOf: (db, u) => scopeOf(db, u), seesUser: (db, u, username, team) => seesUser(db, u, username, team) };
// a password version: changing or resetting a password ends the sign-ins made with the old one (see refreshSession)
const newPw = (u, pw) => { u.hash = bcrypt.hashSync(String(pw), 10); u.pwv = (u.pwv || 0) + 1; };
const DUMMY = bcrypt.hashSync(hex(8), 10);   // checked when the account does not exist, so a wrong username takes as long as a wrong password

// ------------------------------------------------------------------ workspace scope: admins see everything, everybody else only their workspace
function scopeOf(db, u) {
  if (u.role === 'admin' || !(db.workspaces || []).length) return null;
  const mine = db.workspaces.filter(w => u.role === 'agent' ? w.teams.includes(u.team) : (w.staff || []).includes(u.username));
  const teams = new Set([ADMIN_TEAM]), sc = new Set();
  if (u.role === 'agent' && u.team) teams.add(u.team);
  mine.forEach(w => { w.teams.forEach(x => teams.add(x)); (w.scorecards || []).forEach(x => sc.add(x)); });
  return { teams, sc };
}
const inScope = (db, u, ev) => { const s = scopeOf(db, u); if (!s) return true; const us = userBy(db, ev.agent); return s.teams.has(us ? us.team : ev.tid); };
// a record about one person (flag, task, session ...) is in this person's workspace; team = the team saved on the record, for people who were deleted
const seesUser = (db, u, username, team) => { const s = scopeOf(db, u); if (!s) return true; const x = userBy(db, username); return s.teams.has(x ? x.team : team || ''); };

// ------------------------------------------------------------------ teams and users: the checks and helpers (their routes are in routes-people.js)
const teamBody = (b, db, cur) => {
  const name = str(b.name, 60); if (!name) throw new Error('Give the team a name');
  if (db.teams.some(t => t !== cur && t.name.toLowerCase() === name.toLowerCase())) throw new Error('A team with this name already exists');
  const lead = str(b.lead, 40), lu = userBy(db, lead);
  if (!lu || lu.active === false || !['lead', 'admin', 'qa', 'trainer'].includes(lu.role)) throw new Error('Every team needs a team lead. Choose one.');
  return { name, desc: str(b.desc, 600), lead, languages: pick(b.languages, db.languages), skills: pick(b.skills, db.skills), region: str(b.region, 80), hours: str(b.hours, 60), channels: list(b.channels), notes: str(b.notes, 1000), color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#2563eb' };
};
// a new team, in the workspace chosen (or the first one); throws the message to show when something is wrong
function addTeam(db, b) { const t = { id: 't-' + hex(3), ...teamBody(b, db), created: iso() }; db.teams.push(t);
  const ws = (db.workspaces || []).find(w => w.id === b.workspace) || (db.workspaces || [])[0]; if (ws) ws.teams.push(t.id); return t; }

const userBody = (b, db, cur) => {
  const np = nameParts(b); if (!np.firstName) throw new Error('Enter the first name'); if (!np.lastName) throw new Error('Enter the last name');
  const email = str(b.email, 120).toLowerCase();
  if (email && !validEmail(email)) throw new Error('Enter a valid email address');
  if (email && db.users.some(u => u !== cur && (u.email || '').toLowerCase() === email)) throw new Error('That email is already used by another account');
  const role = ROLES.includes(b.role) ? b.role : (cur ? cur.role : 'agent');
  let team = b.team === undefined ? (cur ? cur.team : '') : b.team;
  if (role !== 'agent') team = ADMIN_TEAM;                                   // admins, QA, team leads and trainers always sit in the Administration team
  else if (!db.teams.some(t => t.id === team && t.id !== ADMIN_TEAM)) throw new Error('Choose a team. Every agent must belong to a team.');
  const start = /^\d{4}-\d{2}-\d{2}$/.test(b.start || '') ? b.start : '';
  return { ...np, email, role, team, title: str(b.title, 80), desc: str(b.desc, 600), languages: pick(b.languages, db.languages), skills: pick(b.skills, db.skills), phone: str(b.phone, 40), tz: b.tz === undefined ? ((cur || {}).tz || '') : (wfm.okTz(b.tz) ? b.tz : ''), start, active: b.active === undefined ? (cur ? cur.active !== false : true) : !!b.active, ...empBody(b, db, cur, np.name) };
};
// employment (Workforce): employee ID, type and hours, reporting manager, work calendar, usual shift or repeating pattern,
// status and leaving date, and the private details (birthday, emergency contact) only admins and the person see
const EMPTYPES = ['full', 'part', 'contract', 'intern'], EMPSTATUS = ['active', 'leave', 'left'];
const empBody = (b, db, cur, name) => {
  const W = wfm.settingsOf(db.settings.wf, wfm.localDay()), has = (l, id) => typeof id === 'string' && l.some(x => x.id === id), d = v => DAY.test(typeof v === 'string' ? v : '') ? v : '';
  const empId = str(b.empId, 30), manager = str(b.manager, 40), hours = Number(b.hours), status = EMPSTATUS.includes(b.empStatus) ? b.empStatus : 'active', pattern = has(W.patterns, b.pattern) ? b.pattern : '';
  if (empId && db.users.some(u => u !== cur && u.empId === empId)) throw new Error('That employee ID is already used by ' + db.users.find(u => u !== cur && u.empId === empId).name);
  if (manager && (manager === (cur && cur.username) || !db.users.some(u => u.username === manager && u.role !== 'agent'))) throw new Error('Choose the reporting manager from the list');
  return { empId, empType: EMPTYPES.includes(b.empType) ? b.empType : 'full', hours: b.hours !== '' && b.hours !== null && Number.isFinite(hours) && hours >= 1 && hours <= 60 ? Math.round(hours * 2) / 2 : 40,
    manager, cal: has(W.calendars, b.cal) ? b.cal : '', location: str(b.location, 80), shift: has(W.shifts, b.shift) ? b.shift : '', pattern, patStart: pattern ? d(b.patStart) || wfm.localDay() : '',
    empStatus: status, exitDate: status === 'left' ? d(b.exitDate) || wfm.localDay() : '', exitReason: status === 'left' ? str(b.exitReason, 200) : '',
    birthday: d(b.birthday), ecName: str(b.ecName, 80), ecPhone: str(b.ecPhone, 40), ecRel: str(b.ecRel, 40) };
};
const setStaffWs = (db, username, role, ids) => {                          // staff belong to workspaces explicitly, agents through their team
  db.workspaces.forEach(w => { w.staff = (w.staff || []).filter(x => x !== username); });
  if (role === 'agent' || role === 'admin') return;
  const want = (Array.isArray(ids) ? ids : []).filter(id => db.workspaces.some(w => w.id === id)); if (!want.length && db.workspaces[0]) want.push(db.workspaces[0].id);
  want.forEach(id => db.workspaces.find(w => w.id === id).staff.push(username));
};
// a new account with the first password (it must be changed at the first sign-in); throws the message to show when something is wrong
function addUser(db, b, hash) {
  let username = str(b.username, 30).toLowerCase() || uname(nameParts(b).name);
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('Username: 3-30 characters, letters, numbers, dots, dashes or underscores');
  if (db.users.some(u => u.username === username)) { if (b.username) throw new Error('That username already exists'); let n = 2; while (db.users.some(u => u.username === username + n)) n++; username += n; }
  const u = { username, ...userBody(b, db), hash: hash || bcrypt.hashSync(DEFAULT_PASSWORD, 10), mustChange: true, teamHistory: [] };
  db.users.push(u); setStaffWs(db, username, u.role, b.workspaces); return u;
}
const leadsTeam = (db, username) => db.teams.find(t => t.lead === username);

// ------------------------------------------------------------------ dashboard layouts: every role has a default view (set by admins), everybody can personalise their own
// a page name is a short simple word (dash, autoqa): never a name every JavaScript object already has (__proto__, constructor ...),
// which would change the server for everybody; and at most 20 pages with their own layout or views, so the data file cannot be filled up
const okPage = p => /^[a-z][a-z0-9]{0,19}$/.test(p) && !(p in Object.prototype);
const roomFor = (o, page) => Object.hasOwn(o, page) || Object.keys(o).length < 20;
app.put('/api/layout', need(), (req, res) => {                                  // my own layout of one page
  const db = load(), u = userBy(db, req.session.user.username), items = cleanLayout((req.body || {}).items), page = str((req.body || {}).page, 20);
  if (!okPage(page) || !items) return bad(res, 'Bad layout');
  u.layouts = u.layouts || {};
  if ((req.body || {}).reset) delete u.layouts[page]; else { if (!roomFor(u.layouts, page)) return bad(res, 'Too many pages'); u.layouts[page] = items; }
  save(db); req.session.user = pub(u); res.json(req.session.user);
});
app.put('/api/layouts/:role', need('admin'), (req, res) => {                    // the default view of a role
  const db = load(), items = cleanLayout((req.body || {}).items), page = str((req.body || {}).page, 20);
  if (!ROLES.includes(req.params.role) || !okPage(page) || !items) return bad(res, 'Bad layout');
  db.settings.layouts = db.settings.layouts || {}; if (!roomFor(db.settings.layouts, page)) return bad(res, 'Too many pages');
  db.settings.layouts[page] = db.settings.layouts[page] || {};
  if ((req.body || {}).reset) delete db.settings.layouts[page][req.params.role]; else db.settings.layouts[page][req.params.role] = items;
  save(db); res.json(setOut(db, req.session.user));
});
// a widget on a page: k = its own key (the same widget can be added twice), id = the kind of widget, size and height, an own title and own filters (review type, team, period).
// Keys and ids go inside onclick="..." on the page, so they keep only letters, numbers, - and _ (a shared view must not be able to carry code to other people)
const safeId = (v, n) => str(v, n).replace(/[^\w-]/g, '');
// a widget is as wide as any number of the 60 columns (old layouts used 3 … 12) and as high as its content, or a height in px chosen by dragging
const wSize = s => { s = Math.round(Number(s)); return s >= 1 && s <= 60 ? s : 30; }, wHigh = h => { h = Math.round(Number(h)); return h >= 90 ? Math.min(h, 1400) : undefined; };
const cleanLayout = a => Array.isArray(a) && a.length <= 80 ? a.filter(x => x && typeof x === 'object').map(x => ({ k: safeId(x.k, 40) || undefined, id: safeId(x.id, 30), size: wSize(x.size), h: wHigh(x.h), on: x.on !== false, ar: x.ar === true || undefined, title: str(x.title, 60) || undefined,
  f: x.f && typeof x.f === 'object' ? { c: CHANNELS.includes(x.f.c) ? x.f.c : '', t: safeId(x.f.t, 40), p: safeId(x.f.p, 10) } : undefined })).filter(x => x.id) : null;
// named dashboard views: personal ones (everybody) and shared ones (admins and QA) that are shown to chosen roles or to everyone
const cleanViews = (a, shared) => Array.isArray(a) && a.length <= 20 ? a.filter(v => v && typeof v === 'object').map(v => ({ id: safeId(v.id, 20) || 'v' + hex(4), name: str(v.name, 40) || 'My view', items: cleanLayout(v.items) || [], ...(shared ? { roles: list(v.roles, 6, 10).filter(r => r === 'all' || ROLES.includes(r)), by: str(v.by, 60) } : {}) })) : null;
app.put('/api/views', need(), (req, res) => {
  const db = load(), u = userBy(db, req.session.user.username), page = str((req.body || {}).page, 20), views = cleanViews((req.body || {}).views);
  if (!okPage(page) || !views) return bad(res, 'Bad views');
  u.views = u.views || {}; if (!roomFor(u.views, page)) return bad(res, 'Too many pages');
  u.views[page] = views; save(db); req.session.user = pub(u); res.json(req.session.user);
});
app.put('/api/shared-views', need('admin', 'qa'), (req, res) => {
  const db = load(), page = str((req.body || {}).page, 20), views = cleanViews((req.body || {}).views, true);
  if (!okPage(page) || !views) return bad(res, 'Bad views');
  db.settings.views = db.settings.views || {}; if (!roomFor(db.settings.views, page)) return bad(res, 'Too many pages');
  db.settings.views[page] = views; save(db); res.json(setOut(db, req.session.user));
});

// ------------------------------------------------------------------ system settings (pass rate thresholds)
// the sign-in page shows the company name and its privacy note before anyone signs in (nothing else)
// a health check for a monitor or the hosting: is the app up and can it read its data? (no details, nothing private)
app.get('/api/health', (req, res) => { try { fs.accessSync(FILE, fs.constants.R_OK | fs.constants.W_OK); res.json({ ok: true, up: Math.round(process.uptime()) }); } catch (e) { res.status(503).json({ ok: false }); } });
app.get('/api/notice', (req, res) => { const s = load().settings || {}; res.json({ company: ((s.org || {}).name) || '', note: ((s.privacy || {}).note) || '', signup: ((s.signin || {}).openReg) === true }); });
app.get('/api/settings', need(), (req, res) => res.json(setOut(load(), req.session.user)));
app.put('/api/settings', need('admin'), (req, res) => {
  const b = req.body || {}, db = load(), pass = Number(b.pass);
  if (!(pass >= 1 && pass <= 100)) return bad(res, 'The pass rate must be between 1 and 100');
  const teams = {};
  for (const [k, v] of Object.entries(b.teams || {})) {
    if (v === null || v === '') continue;
    const n = Number(v);
    if (!db.teams.some(t => t.id === k) || !(n >= 1 && n <= 100)) return bad(res, 'Each team pass rate must be between 1 and 100');
    teams[k] = n;
  }
  db.settings = { ...db.settings, pass, teams }; save(db); res.json(setOut(db, req.session.user));
});

// ------------------------------------------------------------------ notifications (each user only sees their own)
app.get('/api/notifications', need(), (req, res) =>
  res.json(load().notifications.filter(n => n.to === req.session.user.username).slice(0, 200)));
app.post('/api/notifications/read', need(), (req, res) => {
  const db = load(); db.notifications.forEach(n => { if (n.to === req.session.user.username) n.read = true; });
  save(db); res.json({ ok: 1 });
});
app.delete('/api/notifications/:id', need(), (req, res) => {
  const db = load(), n = db.notifications.find(x => x.id === req.params.id && x.to === req.session.user.username);
  if (!n) return res.status(404).json({ error: 'not found' });
  db.notifications = db.notifications.filter(x => x !== n); save(db); res.json({ ok: 1 });
});

// "show me how notifications look": creates one example of every kind for the person who asks
app.post('/api/notifications/sample', need(), (req, res) => {
  if (limited('sample:' + req.session.user.username, 3, 36e5)) return res.status(429).json({ error: 'You have already created example notifications. Try again later.' });   // the list of all notifications is capped, so it must not be flooded
  const db = load(), u = req.session.user, ev = db.evaluations.find(e => canSee(u, e) && inScope(db, u, e)) || {}, id = ev.id || '4312345', rid = ev.rid;
  const S = [['review', `You received a new call review for Lead #${id} (score 92%)`, { rid, lead: id }], ['dispute', `Alex Example has disputed the review for Lead #${id}`, { rid, lead: id }], ['msg', `Alex Example wrote in the dispute for Lead #${id}: "Could we listen to the call again?"`, { rid, lead: id }],
    ['resolved', `Your dispute for Lead #${id} was resolved: score kept`, { rid, lead: id }], ['remind', `Reminder: please open your call review for Lead #${id}`, { rid, lead: id }], ['task', 'New mission: Listen to 3 recorded calls (due ' + new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10) + ')', {}],
    ['taskdone', 'Alex Example completed: Update your CRM notes', {}], ['quiz', 'New quiz: Weekly quiz (due Friday)', {}], ['news', 'Newsletter: Monthly update', {}], ['cal', 'Lena Hart invited you to the calibration "Monthly calibration"', {}], ['reg', 'Sam Newcomer (@s.newcomer) has requested access to the platform', {}]];
  S.forEach(([type, text, extra]) => notify(db, u.username, type, text, { ...extra, sample: true }));
  save(db); res.json({ ok: 1, count: S.length });
});

// ------------------------------------------------------------------ evaluations: the helpers (the routes are in routes-reviews.js)
const lday = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const evDate = dt => dt === lday(new Date()) ? new Date().toISOString() : new Date(dt + 'T12:00:00').toISOString();
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isOwner = (u, ev) => u.role === 'agent' && ev.agent === u.username;
const canSee = (u, ev) => u.role !== 'agent' || isOwner(u, ev);          // agents only see their own reviews
const leadId = v => String(v == null ? '' : v).trim();
const findEv = (db, rid) => db.evaluations.find(e => e.rid === rid);
// a review this person may open or change: the same rule as the list (their own workspace; agents only their own reviews)
const evOf = (db, u, rid) => { const ev = findEv(db, rid); return ev && canSee(u, ev) && inScope(db, u, ev) ? ev : null; };
const agentInScope = (db, u, au) => { const s = scopeOf(db, u); return !s || s.teams.has(au.team); };

// recMissing = the review points to an audio file that is not in the recordings folder (the player would show 0 seconds)
// Admin › Organization › Data protection: agents may be kept from their recordings and from the name of who reviewed them
const forAgent = (db, u, e) => { if (u.role !== 'agent') return e; const p = (db.settings || {}).privacy || {}; let x = e;
  if (p.agentsRec === false) { const { rec, rl, recMissing, ...r } = x; x = r; }
  if (p.agentsReviewer === false) { const { rv, by, ...r } = x; x = r; if (x.dp) x = { ...x, dp: { ...x.dp, msgs: (x.dp.msgs || []).map(m => m.u === u.username ? m : { ...m, u: '', n: 'QA' }), res: x.dp.res ? { ...x.dp.res, by: 'QA' } : x.dp.res } }; }
  return x; };
// the recordings folder is read once per request (not once per review) to mark the reviews whose file is gone
const recFiles = () => { try { return new Set(fs.readdirSync(REC)); } catch (e) { return new Set(); } };

// a new review (QA Entry, or an AI draft approved by a person): checks everything, scores it and tells the agent; the caller saves
function newEval(db, user, b) {
  const scope = scopeOf(db, user), sc = db.scorecards.find(s => s.id === b.scid);
  if (!sc || (scope && !scope.sc.has(sc.id))) return { err: 'Choose a scorecard' };
  const au = db.users.find(x => x.username === b.agent && x.role === 'agent' && x.active !== false);
  if (!au || !agentInScope(db, user, au)) return { err: 'Choose an agent' };
  const id = leadId(b.id);
  if (!id || id.length > 60) return { err: 'Enter the lead ID (up to 60 characters)' };
  if (!DAY.test(b.dt || '')) return { err: 'Choose the date' };
  const ch = chOf(b.ch);
  let r; try { r = build(sc, b.a, { all: true }); } catch (err) { return { err: err.code === 'ANSWER' ? err.message : 'The answers do not match the scorecard' }; }
  const ev = {
    rid: 'r' + hex(6), id, agent: au.username, agn: au.name, tid: au.team, d: evDate(b.dt), sc: r.sc, ...(r.ns ? { ns: true } : {}), cs: r.cs, scid: sc.id, scn: sc.name, st: 'ok',
    fl: FLAGS.includes(b.fl) ? b.fl : '', cp: str(b.cp, 80), cm: str(b.cm, 1000),
    lk: link(b.lk), rl: ch === 'call' ? link(b.rl) : '', ch, ...chFields(b, ch), rv: user.name, by: user.username, seen: null,
    at: iso(), ...(Number(b.rt) > 0 ? { rt: Math.min(4 * 3600, Math.round(Number(b.rt))) } : {})   // when it was reviewed, and how long QA Entry took (seconds, at most 4 hours)
  };
  db.evaluations.unshift(ev);
  notify(db, au.username, 'review', r.ns ? `You received a new review for Lead #${id} (not scored)` : `You received a new ${CHN[ch]} review for Lead #${id} (score ${r.sc}%)`, { rid: ev.rid, lead: id });
  return { ev };
}

// ------------------------------------------------------------------ scorecards: the checks (the routes are in routes-reviews.js; everyone reads, only admins change)
const cleanSC = b => {
  const name = str(b.name, 80);
  if (!name) throw new Error('Give the scorecard a name');
  if (!Array.isArray(b.cats) || !b.cats.length || b.cats.length > 20) throw new Error('Add at least one category');
  let total = 0;
  const cats = b.cats.map(c => {
    const n = str(c.n, 80);
    if (!n) throw new Error('Every category needs a name');
    if (!Array.isArray(c.it) || !c.it.length || c.it.length > 30) throw new Error('Category "' + n + '" needs at least one item');
    const it = c.it.map(i => {
      const t = str(i.t, 300), p = Number(i.p);
      if (!t) throw new Error('Every item needs a description');
      if (!Number.isInteger(p) || p < 0 || p > 100) throw new Error('Points must be whole numbers from 0 to 100');
      total += p; return { t, p, k: !!i.k, cp: !!i.cp };
    });
    return { n, k: !!c.k, it };
  });
  if (total !== 100) throw new Error('Total points must equal 100 (currently ' + total + ')');
  // tags: free words (Calls, Chats, B2C, Retention ...) that show what the scorecard is for and filter the list. They never limit which reviews it can score.
  const tags = []; (Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',')).forEach(t => { t = str(t, 30); if (t && tags.length < 12 && !tags.some(x => x.toLowerCase() === t.toLowerCase())) tags.push(t); });
  const chs = (Array.isArray(b.chs) ? b.chs : []).filter(c => CHANNELS.includes(c));     // older scorecards: the review types they were first made for (kept, shown as tags while they have none)
  return { name, desc: str(b.desc, 200), tags, chs: [...new Set(chs)], cats };
};

// ------------------------------------------------------------------ Excel export: the cells of the file (the route is in routes-reviews.js: the page sends the rows it shows, we return a real .xlsx file)
// only plain text, numbers and yes/no become cells: an object could be turned into a formula or a link inside Excel (spreadsheet injection)
const cellOf = v => typeof v === 'number' ? (Number.isFinite(v) ? v : null) : typeof v === 'boolean' ? v : v == null || typeof v === 'object' ? null : String(v).slice(0, 32000);

// ------------------------------------------------------------------ call recordings: where they are kept (the routes are in routes-reviews.js)
// The audio files live in ONE folder outside the project (Documents\Q-smart recordings), so every copy of the project plays the same files.
// Set RECORDINGS_DIR to use another folder (REC_DIR is used by the tests). Files from an old "recordings" folder inside the project are copied there once.
const REC = path.resolve(process.env.REC_DIR || process.env.RECORDINGS_DIR || path.join(require('os').homedir(), 'Documents', 'Q-smart recordings'));
try { fs.mkdirSync(REC, { recursive: true }); const old = path.join(__dirname, 'recordings'); if (!process.env.REC_DIR && fs.existsSync(old)) fs.readdirSync(old).forEach(f => { const t = path.join(REC, f); if (!fs.existsSync(t)) fs.copyFileSync(path.join(old, f), t); }); } catch (e) { console.log('Recordings folder problem:', e.message); }
const EXT = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/webm': 'webm' };
const EXTS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'webm'];
// the first bytes of each kind of audio file: a web page or a program renamed ".mp3" is refused (R-15)
const isAudio = (b, ext) => {
  const at = (s, o = 0) => b.length >= o + s.length && b.toString('latin1', o, o + s.length) === s, sync = b.length > 1 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0;
  return { mp3: at('ID3') || sync, wav: at('RIFF') && at('WAVE', 8), m4a: at('ftyp', 4), aac: sync || at('ADIF') || at('ftyp', 4), ogg: at('OggS'), webm: b.length > 3 && b.readUInt32BE(0) === 0x1a45dfa3 }[ext] || false;
};

// ------------------------------------------------------------------ the other modules
// the routes that were part of this file: the helpers they use are handed over by name
const core = { ADMIN_TEAM, BASE, DAY, DEFAULT_PASSWORD, DUMMY, EXT, EXTS, ExcelJS, FLAGS, LANGS, PREF_ID, REC, ROLES, STAFF, addTeam, addUser, agentInScope, app, authed, bad, bcrypt, build, canSee, cellOf, chFields, chOf, cleanPrefs, cleanSC, crypto, cur, evDate, evOf, express, findEv, forAgent, fs, hex, hits, inScope, isAudio, isOwner, iso, lday, leadId, leadsTeam, limited, link, list, load, mail, makeUsername, nameParts, need, newEval, newPw, notify, path, pub, pwBad, recFiles, recent, rosterPub, save, scopeOf, setStaffWs, sha, staffUsers, str, teamBody, userBody, userBy, validEmail };
require('./routes-api')(ctx);
require('./routes-quinn')(ctx);        // Quinn: predefined answers, Help Center search, cache, then AI (Haiku) only when needed; the hand-over to a person          // API keys, the API (/api/v1), webhooks and MCP (/mcp): first, so the webhook events see every change
require('./routes-account')(core);    // sign-in and accounts
require('./routes-people')(core);     // people
require('./routes-reviews')(core);    // reviews
require('./routes-work')(ctx);
app.locals.audit = AUDIT;
require('./routes-org')(ctx);                                    // Admin › Organization and Q-Intelligence
require('./routes-more')(ctx);        // reports, planning, performance, compliance & CX, backups, admin settings        // tasks, coaching sessions, calibrations
require('./routes-learning')(ctx);    // knowledge base, quizzes, newsletter, import, ZIP export
require('./routes-setup')(ctx);       // skills, workspaces, categories, root causes, Auto QA categories
require('./routes-autoqa')(ctx);      // Auto QA conversations and scoring
require('./routes-ai')(ctx);          // AI and voice settings: keys (encrypted), model, monthly budget, test
require('./routes-wf')(ctx);          // Workforce: work calendars, shifts and patterns, the rota of every team
const att = require('./routes-att')(ctx);   // Workforce: check-ins, the status of every day, corrections, time off and balances
require('./routes-today')({ ...ctx, att });   // Workforce: Team today, the morning brief, the Bradford score, attendance reports
require('./routes-cap')({ ...ctx, att });     // Workforce: Capacity planning, the fair split of the leads of every campaign among the agents
require('./routes-hc')(ctx);
require('./routes-platform')(ctx);
require('./routes-billing')(ctx);     // Admin › Billing with Stripe: plans, subscription, invoices, the card (Stripe's own pages)    // Admin › Platform: the sandbox, Import data, Beta features          // the Help Center website (public, at /hc): categories, sections and articles about Q-smart

// the font files never change (a new font gets a new file name), so the browser keeps them for a year instead of asking every time
app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts'), { maxAge: '365d', immutable: true }));
app.use(express.static(path.join(__dirname, 'public')));
// any error that reaches this point: a short message for the browser (the details, with the folder paths of this computer, only go to the terminal)
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(req.method + ' ' + req.path + ':', err);
  if (res.headersSent) return next(err);
  res.status(status).json({ error: status === 404 ? 'not found' : status === 413 ? 'This is too large' : status < 500 ? 'The request could not be read' : 'Something went wrong on the server' });
});
const PORT = process.env.PORT || 3000;
const srv = app.listen(PORT, () => console.log('Running on http://localhost:' + srv.address().port));   // PORT=0 picks any free port (used by the tests)
// Ctrl+C (or a stop from Windows): no new requests, the audit log entries of the last moment are written, then the app stops.
// data.json itself is always complete, because every save writes a copy first and then swaps it in.
let stopping = false;
const shutdown = sig => { if (stopping) return; stopping = true; console.log(sig + ': stopping…'); try { AUDIT.flushNow(); } catch (e) { /* not fatal */ } srv.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGINT', () => shutdown('SIGINT')); process.on('SIGTERM', () => shutdown('SIGTERM'));
