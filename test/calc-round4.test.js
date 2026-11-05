// Round 4: dates that often go wrong, with the expected numbers worked out by hand before running the code: a request over
// New Year, 29 February, the nights the clocks change and Orthodox Easter (the Bradford score is in test/today.test.js).
const test = require('node:test'), assert = require('node:assert/strict');
const wf = require('../wf'), cap = require('../cap');

const S = wf.settingsOf({ rules: { since: '2026-01-01' } }, '2026-10-28'), A = S.leaveTypes.find(t => t.id === 'lt-annual'), u = { username: 'a' };

test('time off over New Year: 30 Dec 2026 (Wed) – 4 Jan 2027 (Mon) takes 3 days, 2 in 2026 and 1 in 2027', () => {
  // Wed 30 and Thu 31 December are working days; Fri 1 January is New Year; Sat 2 and Sun 3 are the weekend; Mon 4 is a working day
  const span = wf.leaveSpan(S, A, u, { from: '2026-12-30', to: '2027-01-04', part: 'full' }, {});
  assert.deepEqual(span, { '2026-12-30': 1, '2026-12-31': 1, '2027-01-04': 1 });
  const byYear = {}; Object.entries(span).forEach(([d, v]) => { byYear[d.slice(0, 4)] = (byYear[d.slice(0, 4)] || 0) + v; });
  assert.deepEqual(byYear, { 2026: 2, 2027: 1 }, 'each year\'s balance pays for its own days');
  assert.deepEqual(wf.leaveSpan(S, A, u, { from: '2026-12-31', to: '2026-12-31', part: 'am' }, {}), { '2026-12-31': 0.5 }, 'a half day on 31 December');
});
test('29 February and the length of the months', () => {
  assert.equal(cap.monthDays('2028-02').length, 29, '2028 is a leap year');
  assert.equal(cap.monthDays('2027-02').length, 28);
  assert.equal(cap.monthDays('2100-02').length, 28, '2100 is not a leap year (divisible by 100, not by 400)');
  assert.equal(wf.addDays('2028-02-28', 1), '2028-02-29'); assert.equal(wf.addDays('2028-02-29', 1), '2028-03-01');
  assert.equal(wf.addDays('2026-12-31', 1), '2027-01-01'); assert.equal(wf.addDays('2027-01-01', -1), '2026-12-31');
});
test('the nights the clocks change (Europe/Sofia: last Sunday of March and of October) never skip or repeat a day', () => {
  assert.equal(wf.addDays('2026-10-24', 1), '2026-10-25'); assert.equal(wf.addDays('2026-10-25', 1), '2026-10-26');
  assert.equal(wf.addDays('2026-03-28', 1), '2026-03-29'); assert.equal(wf.addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(wf.diffDays('2026-10-01', '2026-10-31'), 30); assert.equal(wf.diffDays('2026-03-01', '2026-03-31'), 30);
  assert.equal(cap.monthDays('2026-10').length, 31); assert.equal(cap.monthDays('2026-03').length, 31);
});
test('Bulgarian public holidays of 2027: Orthodox Easter is on 2 May; Labour Day on a Saturday gives Tuesday 4 May off', () => {
  const h = Object.fromEntries(wf.bgHolidays(2027).map(x => [x.d + ' ' + x.n, 1]));
  for (const k of ['2027-01-01 New Year', '2027-03-03', '2027-04-30 Good Friday', '2027-05-02 Easter', '2027-05-03 Easter Monday', '2027-05-04 Day off for Labour Day', '2027-05-06 St George\'s Day', '2027-05-24', '2027-09-06', '2027-09-22', '2027-12-24', '2027-12-25', '2027-12-26'])
    assert.ok(Object.keys(h).some(x => x.startsWith(k)), k);
});
