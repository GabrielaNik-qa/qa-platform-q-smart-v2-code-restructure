// The Auto QA rule engine (autoqa.js), written down as tests.
const test = require('node:test'), assert = require('node:assert');
const { scoreRules, scoreConv, agentText } = require('../autoqa');

test('only the agent lines are read when the transcript has speaker names', () => {
  assert.strictEqual(agentText('Customer: hello\nAgent: Good morning'), 'agent: good morning');
  assert.strictEqual(agentText('no speakers here'), 'no speakers here');
});
test('good phrases: 30 when none is found, 70 + 15 per phrase found, max 100', () => {
  const c = { pos: ['hello', 'welcome', 'my name is'] };
  assert.strictEqual(scoreRules('nothing', c).s, 30);
  assert.strictEqual(scoreRules('hello', c).s, 85);
  assert.strictEqual(scoreRules('hello welcome my name is', c).s, 100);
});
test('no good phrases = starts at 100; each bad phrase takes 35 off, never below 0', () => {
  const c = { pos: [], neg: ['whatever', 'no idea', 'calm down'] };
  assert.strictEqual(scoreRules('fine', c).s, 100);
  assert.strictEqual(scoreRules('whatever', c).s, 65);
  assert.strictEqual(scoreRules('whatever no idea calm down', c).s, 0);
});
test('the total is the weighted average of the enabled categories', () => {
  const cats = [{ id: 'a', pos: ['hello'], weight: 3 }, { id: 'b', pos: ['bye'], weight: 1 }, { id: 'c', pos: [], enabled: false }];
  const r = scoreConv('Agent: hello', cats);                    // a = 85, b = 30 -> (85*3 + 30) / 4 = 71.25
  assert.strictEqual(r.total, 71);
  assert.ok(!('c' in r.scores));
});
