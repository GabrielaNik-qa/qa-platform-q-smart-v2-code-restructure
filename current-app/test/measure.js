// Speed measurement on a COPY of some data (never the real data.json): starts the app on that copy, signs in as each role and
// times the main pages' data, a few saves, and 20 saves at the same moment. Prints a table (and JSON with --json).
//   node test/measure.js <folder with data.json> [--json] [--runs 3]
// The data is copied into a new temp folder first, so the measured folder is never changed.
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');

async function measure(srcDir, { runs = 3, log = console.log } = {}) {
  const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qsmart-measure-')), DATA = path.join(DIR, 'data.json');
  fs.copyFileSync(path.join(srcDir, 'data.json'), DATA);
  const db = JSON.parse(fs.readFileSync(DATA, 'utf8')), size = fs.statSync(DATA).size;
  const first = r => (db.users.find(u => u.role === r && u.active !== false && !u.mustChange) || {}).username;
  const who = { admin: first('admin'), qa: first('qa'), lead: first('lead'), agent: first('agent') };
  const t0 = Date.now();
  const srv = spawn(process.execPath, ['--max-old-space-size=8192', 'server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '0', DATA_FILE: DATA, AUDIT_FILE: path.join(DIR, 'audit.json'), REC_DIR: path.join(DIR, 'rec'), BACKUPS_DIR: path.join(DIR, 'backups'), SMTP_HOST: '', ANTHROPIC_API_KEY: '', NO_SCHEDULE: '1' } });
  let out = ''; srv.stderr.on('data', x => { out += x; });
  const base = await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('no start ' + out)), 120000); srv.stdout.on('data', x => { const m = String(x).match(/http:\/\/localhost:(\d+)/); if (m) { clearTimeout(t); ok('http://localhost:' + m[1]); } }); srv.on('exit', c => no(new Error('stopped ' + c + out))); });
  const start = Date.now() - t0, rows = [];
  const login = async u => { const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'password' }) }); if (r.status !== 200) throw new Error(u + ' ' + r.status); return r.headers.get('set-cookie').split(';')[0]; };
  const time = async (role, cookie, method, url, body) => {
    const ms = [], sizes = []; let status = 0;
    for (let i = 0; i < runs; i++) {
      const s = performance.now(), r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'Accept-Encoding': 'gzip' }, body: body ? JSON.stringify(typeof body === 'function' ? body(i) : body) : undefined });
      const buf = Buffer.from(await r.arrayBuffer()); ms.push(performance.now() - s); sizes.push(Number(r.headers.get('content-length')) || buf.length); status = r.status;
    }
    ms.sort((a, b) => a - b);
    const row = { role, what: method + ' ' + url.split('?')[0], status, ms: Math.round(ms[Math.floor(ms.length / 2)]), kb: Math.round(sizes[0] / 1024) }; rows.push(row); log(`${row.role.padEnd(6)} ${row.what.padEnd(34)} ${String(row.status).padEnd(4)} ${String(row.ms).padStart(7)} ms ${String(row.kb).padStart(8)} KB`);
  };
  log(`data ${(size / 1e6).toFixed(1)} MB, ${db.users.length} people, ${db.evaluations.length} reviews · server ready in ${start} ms`);
  const c = {}; for (const [r, u] of Object.entries(who)) if (u) c[r] = await login(u);
  const m = new Date().toISOString().slice(0, 7), day = new Date().toISOString().slice(0, 10);
  for (const r of Object.keys(c)) for (const u of ['/api/me', '/api/settings', '/api/evaluations', '/api/roster']) await time(r, c[r], 'GET', u);
  for (const u of ['/api/wf/today', '/api/att/month?m=' + m, '/api/leave/calendar?m=' + m, '/api/cap?month=' + m, '/api/att/report', '/api/wf/rota', '/api/tasks', '/api/c/surveys']) await time('lead', c.lead, 'GET', u);
  await time('agent', c.agent, 'GET', '/api/att/me'); await time('agent', c.agent, 'GET', '/api/cap?month=' + m); await time('agent', c.agent, 'GET', '/api/leave');
  const ag = db.users.find(u => u.username === who.agent), sc = db.scorecards[0];
  await time('qa', c.qa, 'POST', '/api/evaluations', i => ({ scid: sc.id, agent: ag.username, id: 'MEASURE-' + i, dt: day, ch: 'call', a: sc.cats.map(x => x.it.map(() => ['y', '', ''])), cm: '' }));
  await time('agent', c.agent, 'POST', '/api/att/punch', i => ({ action: ['in', 'break', 'back'][i % 3] }));
  // 20 people save at the same moment: every change must be kept and the file must stay readable
  const before = JSON.parse(fs.readFileSync(DATA, 'utf8')).kudos || [], s = performance.now();
  const res = await Promise.all(Array.from({ length: 20 }, (_, i) => fetch(base + '/api/c/kudos', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: c.agent }, body: JSON.stringify({ to: who.admin, text: 'parallel ' + i }) }).then(r => r.status)));
  const par = Math.round(performance.now() - s), after = JSON.parse(fs.readFileSync(DATA, 'utf8')).kudos || [];
  const kept = after.filter(k => /^parallel /.test(k.text)).length - before.filter(k => /^parallel /.test(k.text)).length;
  log(`20 saves at the same moment: ${par} ms in all, ${res.filter(x => x === 200).length} answered 200, ${kept} of 20 kept in the file`);
  const mem = await new Promise(ok => { const ps = spawn('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${srv.pid}).WorkingSet64`]); let o = ''; ps.stdout.on('data', x => { o += x; }); ps.on('exit', () => ok(Math.round(Number(o.trim()) / 1048576))); });
  log(`server memory: ${mem} MB`);
  srv.kill(); fs.rmSync(DIR, { recursive: true, force: true });
  return { size, people: db.users.length, reviews: db.evaluations.length, start, rows, parallel: { ms: par, kept, ok: res.filter(x => x === 200).length }, mem };
}
module.exports = { measure };
if (require.main === module) {
  const a = process.argv.slice(2), dir = a.find(x => !x.startsWith('--')), runs = Number((a[a.indexOf('--runs') + 1]) || 3);
  measure(path.resolve(dir), { runs: a.includes('--runs') ? runs : 3 }).then(r => { if (a.includes('--json')) console.log(JSON.stringify(r)); }).catch(e => { console.error(e); process.exit(1); });
}
