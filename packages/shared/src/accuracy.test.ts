// The accuracy score: same answers on the questions both answered (N/A left out), grouped every way; Zendesk's
// bands; the brake (under the bar, at least 20 conversations); the biggest disagreements; the spread-out sample.
import { describe, expect, it } from 'vitest';
import {
  type AccuracyPair,
  agreementBy,
  bandOf,
  biggestDisagreements,
  brakedCategories,
  categoryKey,
  comparedQuestions,
  overallAgreement,
  stratifiedSample,
} from './accuracy.js';
import type { Answer } from './scoring.js';

const cat = (name: string, answers: Answer[]) => ({
  name,
  questions: answers.map((answer, i) => ({ text: `${name} q${i + 1}`, answer })),
});
const pair = (id: string, ai: Answer[][], human: Answer[][], over: Partial<AccuracyPair> = {}): AccuracyPair => ({
  conversationId: id,
  scorecardId: 'card-1',
  scorecardName: 'Support',
  model: 'gpt-oss-120b',
  language: 'en',
  day: '2026-11-11',
  ai: ai.map((a, i) => cat(['Greeting', 'Solution'][i] ?? 'Other', a)),
  human: human.map((h, i) => cat(['Greeting', 'Solution'][i] ?? 'Other', h)),
  ...over,
});

describe('the accuracy score', () => {
  it('compares only the questions both answered Yes or No', () => {
    const p = pair('c1', [['y', 'n', 'na', 'y']], [['y', 'y', 'y', 'na']]);
    expect(comparedQuestions(p)).toEqual([
      { category: 'Greeting', question: 'Greeting q1', same: true },
      { category: 'Greeting', question: 'Greeting q2', same: false },
    ]);
    expect(overallAgreement([p])).toEqual({ same: 1, compared: 2, conversations: 1, score: 50, band: 'medium' });
  });

  it('matches categories by name and questions by text, so a changed scorecard compares only what both had', () => {
    const p = pair('c1', [['y', 'y']], [['y']]);
    p.human[0]?.questions.push({ text: 'A new question', answer: 'n' });
    expect(comparedQuestions(p)).toHaveLength(1);
    expect(overallAgreement([pair('c2', [], [])]).score).toBeNull();
  });

  it('groups by category, model, language or anything else, counting the conversations', () => {
    const pairs = [
      pair('c1', [['y', 'y'], ['y']], [['y', 'y'], ['n']], { model: 'a' }),
      pair('c2', [['n', 'y'], ['y']], [['y', 'y'], ['y']], { model: 'b', language: 'bg' }),
    ];
    const byCategory = agreementBy(pairs, (_, c) => c);
    expect(byCategory.get('Greeting')).toMatchObject({
      same: 3,
      compared: 4,
      conversations: 2,
      score: 75,
      band: 'high',
    });
    expect(byCategory.get('Solution')).toMatchObject({ same: 1, compared: 2, score: 50 });
    expect(agreementBy(pairs, (p) => p.model).get('a')?.score).toBe(66.7);
    expect(agreementBy(pairs, (p) => p.language).get('bg')?.score).toBe(66.7);
  });

  it("uses Zendesk's bands: high 75-100, medium 25-74, low 0-24", () => {
    expect([100, 75, 74.9, 25, 24.9, 0].map(bandOf)).toEqual(['high', 'high', 'medium', 'medium', 'low', 'low']);
  });
});

describe('the brake and the disagreements', () => {
  it('brakes a category under the bar only after 20 compared conversations', () => {
    const bad = (n: number) =>
      Array.from({ length: n }, (_, i) => pair(`c${i}`, [['y', 'y'], ['y']], [['n', 'y'], ['y']]));
    // Greeting: 50%; Solution: 100%
    expect(brakedCategories(bad(19))).toEqual([]);
    expect(brakedCategories(bad(20))).toEqual([categoryKey('card-1', 'Greeting')]);
    expect(brakedCategories(bad(20), 40)).toEqual([]);
    const worst = biggestDisagreements(bad(3));
    expect(worst).toEqual([{ category: 'Greeting', question: 'Greeting q1', same: 0, compared: 3, score: 0 }]);
  });
});

describe('the sample', () => {
  it('spreads the picks across groups before taking a second from any', () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, agent: 'Nina' })),
      { id: 'b1', agent: 'Omar' },
      { id: 'c1', agent: 'Ana' },
    ];
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const picked = stratifiedSample(items, (x) => x.agent, 3, random);
    expect(new Set(picked.map((x) => x.agent))).toEqual(new Set(['Nina', 'Omar', 'Ana']));
    expect(stratifiedSample(items, (x) => x.agent, 50, random)).toHaveLength(12);
    expect(stratifiedSample([], () => 'x', 5)).toEqual([]);
  });
});
