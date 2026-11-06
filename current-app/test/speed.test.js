// Speed check: a medium made-up data set (50 agents, 20 reviews each, 60 days of attendance) on a temp copy, and the time of the
// main pages' data and of a save. The limits are generous (about 5 times what this computer needs today, see
// docs/audit/PERFORMANCE_AUDIT.md), so the test only fails when something became MUCH slower, not on a busy moment.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { make } = require('./gen-large');
const { measure } = require('./measure');

const LIMIT = { get: 1500, save: 3000 };
test('speed: the main pages answer and a save is done within the speed budget', { timeout: 120000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qsmart-speed-'));
  try {
    fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(make({ agents: 50, staff: 12, perAgent: 20, days: 60 })));
    const r = await measure(dir, { runs: 1, log: () => {} });
    t.diagnostic(`data ${(r.size / 1e6).toFixed(1)} MB · ready in ${r.start} ms · ` + r.rows.map(x => `${x.role} ${x.what} ${x.ms} ms`).join(' · '));
    const slow = r.rows.filter(x => x.ms > (x.what.startsWith('GET') ? LIMIT.get : LIMIT.save)).map(x => `${x.role} ${x.what}: ${x.ms} ms`);
    assert.deepEqual(slow, [], 'slower than the budget');
    assert.ok(r.rows.every(x => x.status === 200), 'every request answered 200: ' + r.rows.filter(x => x.status !== 200).map(x => x.what + ' ' + x.status).join(', '));
    assert.deepEqual([r.parallel.ok, r.parallel.kept], [20, 20], '20 saves at the same moment: every one answered and kept');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
