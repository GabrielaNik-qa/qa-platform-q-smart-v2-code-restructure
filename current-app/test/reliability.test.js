// Reliability (round 4): the app stopped hard in the middle of saving never leaves a broken data file, it starts again on the
// same file without losing what was saved, records that point to a deleted person or team do not break any page, and the
// health check answers. Made-up people on a temporary copy (test/fixture-round4.js).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { startApp, client } = require('./fixture-round4');

test('health check: public, short, nothing private', async () => {
  const app = await startApp();
  try {
    const r = await fetch(app.base + '/api/health'), j = await r.json();
    assert.equal(r.status, 200); assert.equal(j.ok, true); assert.deepEqual(Object.keys(j).sort(), ['ok', 'up']);
  } finally { app.stop(); }
});

test('stopped hard while saving: data.json is always complete, and after a restart every answered save is still there', async () => {
  const app = await startApp();
  const a = await client(app.base, 'f.admin'), done = [];
  // many saves in a row; the app is killed (like a power cut) while they are still going on
  const writer = (async () => { for (let i = 0; i < 400; i++) { const r = await a.post('/api/c/risks', { title: 'risk ' + i }).catch(() => null); if (!r) break; if (r.status === 200) done.push(r.json.id); } })();
  await new Promise(r => setTimeout(r, 1200));
  app.srv.kill('SIGKILL'); await writer;
  const raw = fs.readFileSync(app.DATA, 'utf8'); let db = null;
  assert.doesNotThrow(() => { db = JSON.parse(raw); }, 'data.json can still be read');
  const kept = new Set((db.risks || []).map(r => r.id)), lost = done.filter(id => !kept.has(id));
  assert.ok(done.length > 0, 'some saves were answered before the stop');
  assert.deepEqual(lost, [], 'every save that was answered is in the file');
  // the same folder starts again, and works
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '0', DATA_FILE: app.DATA, AUDIT_FILE: path.join(app.DIR, 'audit.json'), REC_DIR: path.join(app.DIR, 'rec'), BACKUPS_DIR: path.join(app.DIR, 'backups'), SMTP_HOST: '', ANTHROPIC_API_KEY: '', NO_SCHEDULE: '1' } });
  try {
    const base = await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('no restart')), 15000); srv.stdout.on('data', x => { const m = String(x).match(/http:\/\/localhost:(\d+)/); if (m) { clearTimeout(t); ok('http://localhost:' + m[1]); } }); });
    const a2 = await client(base, 'f.admin'), risks = (await a2.get('/api/c/risks')).json;
    assert.ok(done.every(id => risks.some(r => r.id === id)), 'after the restart the app shows them all');
  } finally { srv.kill(); app.stop(); }
});

test('records of a deleted person or team, and leave of a deactivated one, never break a page', async () => {
  const app = await startApp({ mutate: d => {
    d.evaluations.push({ ...d.evaluations[0], rid: 'r-orphan', agent: 'ghost.agent', agn: 'Ghost', tid: 't-gone', scid: 'sc-gone' });
    d.leaves = [{ id: 'l-ghost', u: 'ghost.agent', lt: 'lt-annual', from: '2026-11-04', to: '2026-11-04', part: 'full', hours: 0, days: 1, status: 'pending', at: new Date().toISOString(), by: 'ghost.agent' },
      { id: 'l-gone', u: 'f.gone', lt: 'lt-annual', from: '2026-11-05', to: '2026-11-05', part: 'full', hours: 0, days: 1, status: 'approved', at: new Date().toISOString(), by: 'f.gone' }];
    d.capPlans = [{ id: 'cp-gone', month: new Date().toISOString().slice(0, 7), name: 'Old team', teams: ['t-gone'], campaigns: [], pct: {}, versions: [], at: new Date().toISOString(), by: 'f.admin' }];
    d.tasks = [{ id: 'k-ghost', title: 'x', assignee: 'ghost.agent', status: 'todo', checklist: [], by: 'ghost.lead', created: new Date().toISOString() }];
    d.sessions = [{ id: 's-ghost', kind: 'o2o', date: '2026-10-01', title: 'x', agents: ['ghost.agent'], by: 'ghost.lead', at: new Date().toISOString() }];
  } });
  try {
    const m = new Date().toISOString().slice(0, 7);
    for (const who of ['f.admin', 'f.qa1', 'f.lead1', 'f.b1']) {
      const c = await client(app.base, who);
      for (const u of ['/api/evaluations', '/api/tasks', '/api/sessions', '/api/leave', '/api/leave/calendar?m=' + m, '/api/cap?month=' + m, '/api/ai/lead', '/api/ai/trainer', '/api/roster', '/api/settings', '/api/att/me',
        ...(who === 'f.b1' ? [] : ['/api/wf/today', '/api/att/report', '/api/att/month', '/api/leave/team', '/api/ai/analyst'])]) {
        const r = await c.get(u); assert.ok(r.status < 500, `${who} ${u} → ${r.status}`);
      }
    }
    const a = await client(app.base, 'f.admin');
    assert.equal((await a.get('/api/org/person/ghost.agent')).status, 404, 'there is no account to export');
    assert.ok((await a.del('/api/users/f.b3')).status < 500, 'deleting a person who has reviews');
    assert.equal((await a.get('/api/evaluations')).status, 200);
  } finally { app.stop(); }
});
