// Audit log: remembers who changed what (every successful create / change / delete, plus sign-ins). Passwords are never stored.
// Lives in its own file (audit.json) so data.json stays small. Only admins can read it.
const fs = require('fs'), path = require('path');
const FILE = process.env.AUDIT_FILE ? path.resolve(process.env.AUDIT_FILE) : path.join(__dirname, 'audit.json'), MAX = 5000;   // AUDIT_FILE = another file, used by the tests
let LOG = [];
try { LOG = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { LOG = []; }
let timer = null;
const flush = () => { clearTimeout(timer); timer = setTimeout(() => { try { fs.writeFileSync(FILE, JSON.stringify(LOG)); } catch (e) { /* not fatal */ } }, 400); };
const flushNow = () => { if (!timer) return; clearTimeout(timer); timer = null; fs.writeFileSync(FILE, JSON.stringify(LOG)); };   // when the app stops

const SHOW = ['name', 'username', 'role', 'team', 'active', 'pass', 'outcome', 'status', 'title', 'fl', 'lead', 'workspace', 'email'];
const NAMES = [
  [/^POST \/api\/login/, 'Signed in'], [/^POST \/api\/logout/, 'Signed out'],
  [/^POST \/api\/evaluations\/[^/]+\/dispute\/resolve/, 'Resolved a dispute'], [/^POST \/api\/evaluations\/[^/]+\/dispute/, 'Disputed a review'],
  [/^POST \/api\/evaluations/, 'Created a review'], [/^PUT \/api\/evaluations/, 'Changed a review (score, flag or comment)'], [/^DELETE \/api\/evaluations/, 'Deleted a review'],
  [/^POST \/api\/users/, 'Created a user'], [/^PUT \/api\/users/, 'Changed a user'], [/^DELETE \/api\/users/, 'Deleted a user'],
  [/^POST \/api\/teams/, 'Created a team'], [/^PUT \/api\/teams/, 'Changed a team'], [/^DELETE \/api\/teams/, 'Deleted a team'],
  [/demo\/reset/, 'Reset the demo data'], [/^PUT \/api\/settings/, 'Changed system settings / pass rates'], [/^POST \/api\/scorecards/, 'Created a scorecard'], [/^PUT \/api\/scorecards/, 'Changed a scorecard'], [/^DELETE \/api\/scorecards/, 'Deleted a scorecard'],
  [/^POST \/api\/workspaces/, 'Created a workspace'], [/^PUT \/api\/workspaces/, 'Changed a workspace'], [/^DELETE \/api\/workspaces/, 'Deleted a workspace'],
  [/\/api\/skills/, 'Changed the skills / languages catalog'], [/\/api\/registrations/, 'Handled an access request'], [/\/api\/password|\/api\/me\/password/, 'Changed a password'],
  [/\/api\/autoqa/, 'Changed Auto QA'], [/\/api\/calibrations/, 'Changed a calibration'], [/\/api\/sessions/, 'Changed a coaching / one-to-one session'],
  [/^PUT \/api\/prefs/, 'Changed own pop-up and confirmation settings']
];
const label = k => { const f = NAMES.find(n => n[0].test(k)); return f ? f[1] : k; };

function middleware(req, res, next) {
  if (!/^\/api\//.test(req.path) || !['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();
  const who = req.session && req.session.user;
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  res.on('finish', () => {
    const u = req.session && req.session.user || who;
    const isLogin = /^\/api\/login/.test(req.path);
    if (res.statusCode >= 500 || (!u && !isLogin)) return;
    if (res.statusCode >= 400 && !isLogin) return;
    const key = req.method + ' ' + req.path, det = [];
    if (!isLogin) for (const k of SHOW) if (b[k] !== undefined && typeof b[k] !== 'object') det.push(k + ': ' + String(b[k]).slice(0, 60));
    if (b.teams && typeof b.teams === 'object' && !Array.isArray(b.teams)) det.push('team pass rates: ' + JSON.stringify(b.teams).slice(0, 100));
    if (b.sc !== undefined) det.push('score: ' + b.sc);
    // a failed sign-in names the account only when the typed name or e-mail belongs to one (R-25: a password typed into the username box is never kept)
    LOG.push({ t: new Date().toISOString(), u: u ? u.username : res.locals.loginAs || (isLogin ? '(unknown account)' : ''), n: u ? u.name : '', r: u ? u.role : '',
      a: isLogin ? (res.statusCode < 400 ? 'Signed in' : 'Failed sign-in') : label(key), p: req.method + ' ' + req.path, d: det.join(' · '), ok: res.statusCode < 400, ip: req.ip });
    if (LOG.length > MAX) LOG.splice(0, LOG.length - MAX);
    flush();
  });
  next();
}
function routes(app, need) {
  app.get('/api/audit', need('admin'), (req, res) => res.json(LOG.slice(-1000).reverse()));
}
// data protection (Admin › Organization): entries older than the chosen months are removed; returns how many
const prune = months => { const cut = Date.now() - months * 30.44 * 864e5, n = LOG.length; LOG = LOG.filter(x => !x.t || new Date(x.t).getTime() >= cut); if (LOG.length !== n) flush(); return n - LOG.length; };
// the entries of one person (Admin › Organization › personal data download)
const of = username => LOG.filter(x => x.u === username);
module.exports = { middleware, routes, prune, of, flushNow };
