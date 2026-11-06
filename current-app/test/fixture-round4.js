// The fixed set of made-up people of the round 4 audit (test/pentest-round4.test.js, test/e2e), and a helper that starts the app
// on a temporary copy with them, next to the fake AI (test/fake-ai.js). Never the real data.json: every run gets a new temp folder.
//   workspace w-1 (teams B2B and B2C): 2 QA, 2 team leads (one is the other's deputy), 2 trainers, 6 agents
//   workspace w-2 (team W2): its own QA, lead, trainer and 3 agents
//   plus 1 admin, 1 deactivated agent, 1 agent who must still change the first password, 1 pending registration
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const { DEFAULT_SC } = require('../scorecard');

const ROOT = path.join(__dirname, '..'), H = bcrypt.hashSync('password', 4), DAY = 864e5;
const person = (username, role, team, extra = {}) => ({ username, name: extra.name || username, email: username + '@example.com', role, team, title: '', desc: '', languages: [], skills: [], phone: '', start: '', active: true, hash: H, mustChange: false, ...extra });
const day = n => new Date(Date.now() - n * DAY).toISOString();

function data() {
  const users = [
    person('f.admin', 'admin', 't-admin', { name: 'Ada Admin' }),
    person('f.qa1', 'qa', 't-admin', { name: 'Quinn QA' }), person('f.qa2', 'qa', 't-admin', { name: 'Quentin QA' }),
    person('f.lead1', 'lead', 't-admin', { name: 'Lea Lead', deputy: { u: 'f.lead2', from: '', to: '' } }), person('f.lead2', 'lead', 't-admin', { name: 'Leo Lead' }),
    person('f.tr1', 'trainer', 't-admin', { name: 'Tara Trainer' }), person('f.tr2', 'trainer', 't-admin', { name: 'Theo Trainer' }),
    ...['b1', 'b2', 'b3'].map(x => person('f.' + x, 'agent', 't-b2b', { name: 'Agent ' + x.toUpperCase() })),
    ...['c1', 'c2', 'c3'].map(x => person('f.' + x, 'agent', 't-b2c', { name: 'Agent ' + x.toUpperCase() })),
    person('w.qa', 'qa', 't-admin', { name: 'Wanda QA' }), person('w.lead', 'lead', 't-admin', { name: 'Walt Lead' }), person('w.tr', 'trainer', 't-admin', { name: 'Wren Trainer' }),
    ...['1', '2', '3'].map(x => person('w.a' + x, 'agent', 't-w2', { name: 'Wagent ' + x })),
    person('f.gone', 'agent', 't-b2b', { name: 'Gone Agent', active: false }),
    person('f.new', 'agent', 't-b2c', { name: 'New Agent', mustChange: true })
  ];
  const teams = [{ id: 't-admin', name: 'Administration', lead: 'f.admin', system: true }, { id: 't-b2b', name: 'B2B', lead: 'f.lead1' }, { id: 't-b2c', name: 'B2C', lead: 'f.lead2' }, { id: 't-w2', name: 'W2 team', lead: 'w.lead' }];
  const workspaces = [
    { id: 'w-1', name: 'Workspace one', teams: ['t-b2b', 't-b2c'], scorecards: ['sc-default'], staff: ['f.qa1', 'f.qa2', 'f.lead1', 'f.lead2', 'f.tr1', 'f.tr2'] },
    { id: 'w-2', name: 'Workspace two', teams: ['t-w2'], scorecards: ['sc-default'], staff: ['w.qa', 'w.lead', 'w.tr'] }
  ];
  // one review per agent, with a comment that names its workspace (so a test can see whose data reached a prompt or a page)
  const evaluations = users.filter(u => u.role === 'agent').map((u, i) => {
    const ws = u.team === 't-w2' ? 'WS2' : 'WS1';
    return { rid: 'r-' + u.username.replace('.', '-'), id: 'LEAD-' + (1000 + i), agent: u.username, agn: u.name, tid: u.team, d: day(2 + i % 5), at: day(2 + i % 5), sc: 60 + i, scid: 'sc-default', scn: DEFAULT_SC.name,
      cs: DEFAULT_SC.cats.map(c => ({ n: c.n, k: !!c.k, e: 1, m: 2, z: 0, it: c.it.map((it, k) => ({ t: it.t, p: it.p, k: !!it.k, a: k === 0 ? 'n' : 'y', cm: k === 0 ? 'SECRET-' + ws + '-ITEM ' + u.username : '' })) })),
      cm: 'SECRET-' + ws + '-COMMENT ' + u.username, by: ws === 'WS2' ? 'w.qa' : 'f.qa1', rv: ws === 'WS2' ? 'Wanda QA' : 'Quinn QA', st: 'done', fl: '', seen: true };
  });
  return {
    boot: 5, users, teams, workspaces, evaluations, scorecards: [DEFAULT_SC], settings: { pass: 85, teams: {} },
    registrations: [{ id: 'g-pending', username: 'p.ending', name: 'Pending Person', email: 'pending@example.com', hash: H, at: day(1), status: 'pending' }],
    surveys: [{ id: 'sv1', agent: 'f.b1', date: day(3), score: 2, comment: 'SECRET-WS1-SURVEY too expensive' }, { id: 'sv2', agent: 'w.a1', date: day(3), score: 5, comment: 'SECRET-WS2-SURVEY lovely' }],
    conversations: [{ id: 'cv1', agent: 'f.c1', date: day(2).slice(0, 10), at: day(2), text: 'SECRET-WS1-CONVERSATION Customer: I switched to a competitor.' }, { id: 'cv2', agent: 'w.a2', date: day(2).slice(0, 10), at: day(2), text: 'SECRET-WS2-CONVERSATION Customer: thanks.' }],
    skills: [], languages: [], rootCauses: [], categories: [], autoCats: []
  };
}

// starts the app on a new temp folder (its own data, audit log, recordings, backups and encryption key)
async function startApp({ env = {}, mutate } = {}) {
  const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qsmart-r4-')), DATA = path.join(DIR, 'data.json'), d = data();
  if (mutate) mutate(d);
  fs.writeFileSync(DATA, JSON.stringify(d));
  const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: '0', DATA_FILE: DATA, AUDIT_FILE: path.join(DIR, 'audit.json'), REC_DIR: path.join(DIR, 'rec'), BACKUPS_DIR: path.join(DIR, 'backups'), SMTP_HOST: '', ANTHROPIC_API_KEY: '', KEY_SECRET: '', NO_SCHEDULE: '1', ...env } });
  let out = ''; srv.stdout.on('data', x => { out += x; }); srv.stderr.on('data', x => { out += x; });
  const base = await new Promise((ok, no) => {
    const t = setTimeout(() => no(new Error('the server did not start:\n' + out)), 15000);
    srv.stdout.on('data', x => { const m = String(x).match(/http:\/\/localhost:(\d+)/); if (m) { clearTimeout(t); ok('http://localhost:' + m[1]); } });
    srv.on('exit', c => no(new Error('the server stopped: ' + c + '\n' + out)));
  });
  const db = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const stop = () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) { /* temp folder */ } };
  return { base, DIR, DATA, db, srv, stop, log: () => out };
}

// a signed-in client: each one from its own made-up address, so the sign-in limits of one never slow down another
let NADDR = 0;
async function client(base, username, password = 'password') {
  let cookie = ''; const addr = '10.66.' + (++NADDR >> 8 & 255) + '.' + (NADDR & 255);
  const call = async (method, url, body, headers = {}) => {
    const r = await fetch(base + url, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': addr, ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    return { status: r.status, json, text, headers: r.headers };
  };
  const c = { call, get: u => call('GET', u), post: (u, b = {}) => call('POST', u, b), put: (u, b = {}) => call('PUT', u, b), del: u => call('DELETE', u), cookie: () => cookie, setCookie: v => { cookie = v; } };
  if (username) { const r = await call('POST', '/api/login', { username, password }); if (r.status !== 200) throw new Error(username + ' could not sign in: ' + r.status + ' ' + r.text); }
  return c;
}
module.exports = { data, startApp, client, person, H };
