// The scoring rules (scorecard.js). These numbers are what agents are judged on, so every rule has its own test.
const test = require('node:test'), assert = require('node:assert/strict');
const { DEFAULT_SC, build } = require('../scorecard');

const SC = { cats: [
  { n: 'Greeting', it: [{ t: 'Greets', p: 10 }, { t: 'Name', p: 10, k: true }] },        // second item is critical
  { n: 'Process', k: true, it: [{ t: 'Follows the process', p: 30 }] },                    // critical category
  { n: 'Closing', it: [{ t: 'Recap', p: 25 }, { t: 'Thanks', p: 25 }] }
] };
const ans = rows => rows.map(r => r.map(a => [a, '', '']));

test('all Yes gives 100%', () => {
  const r = build(SC, ans([['y', 'y'], ['y'], ['y', 'y']]));
  assert.equal(r.sc, 100); assert.equal(r.zero, false);
  assert.deepEqual(r.cs.map(c => [c.e, c.m]), [[20, 20], [30, 30], [50, 50]]);
});
test('No removes the points of that item only', () => {
  const r = build(SC, ans([['y', 'y'], ['y'], ['n', 'y']]));
  assert.equal(r.sc, 75);
});
test('N/A is left out of the possible points, so it never lowers the score', () => {
  const r = build(SC, ans([['y', 'y'], ['y'], ['na', 'y']]));
  assert.equal(r.cs[2].m, 25); assert.equal(r.cs[2].e, 25);
  assert.equal(r.sc, 100);
});
test('a critical item answered No sets its whole category to 0 points', () => {
  const r = build(SC, ans([['y', 'n'], ['y'], ['y', 'y']]));
  assert.equal(r.cs[0].e, 0); assert.equal(r.cs[0].z, 1);
  assert.equal(r.sc, 80);
});
test('a critical category with any No sets the whole review to 0%', () => {
  const r = build(SC, ans([['y', 'y'], ['n'], ['y', 'y']]));
  assert.equal(r.sc, 0); assert.equal(r.zero, true);
  assert.ok(r.cs.every(c => c.e === 0 && c.z === 1));
});
test('scores are rounded to one decimal', () => {
  const r = build({ cats: [{ n: 'A', it: [{ t: 'x', p: 1 }, { t: 'y', p: 2 }] }] }, ans([['y', 'n']]));
  assert.equal(r.sc, 33.3);
});
test('a root cause is only kept for No answers', () => {
  const r = build(SC, [[['n', 'c', 'Knowledge gap'], ['y', '', 'Knowledge gap']], [['y']], [['y'], ['y']]]);
  assert.equal(r.cs[0].it[0].rc, 'Knowledge gap'); assert.equal(r.cs[0].it[1].rc, '');
});
test('answers that do not match the scorecard are refused', () => {
  assert.throws(() => build(SC, ans([['y', 'y'], ['y']])));                       // a category missing
  assert.throws(() => build(SC, ans([['y'], ['y'], ['y', 'y']])));                // an item missing
  assert.throws(() => build(SC, 'nonsense'));
});
test('the default scorecard has 100 points in total', () => {
  assert.equal(DEFAULT_SC.cats.reduce((a, c) => a + c.it.reduce((x, i) => x + i.p, 0), 0), 100);
});
