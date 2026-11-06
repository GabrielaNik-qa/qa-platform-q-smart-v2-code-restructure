// v2's scoring against today's: today's own function (current-app/scorecard.js) and v2's score the same answers on
// today's real scorecards, thousands of times, with critical questions and categories switched on at random.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  ANSWERS,
  type GivenAnswer,
  passes,
  type ScorecardCategory,
  ScoringError,
  scoreReview,
  totalPoints,
} from './scoring.js';

interface TodayCategory {
  n: string;
  k?: boolean;
  it: { t: string; p: number; k?: boolean; cp?: boolean }[];
}
type TodayResult = { cs: { e: number; m: number; z: number }[]; sc: number | null; zero: boolean; ns?: boolean };
const require = createRequire(import.meta.url);
const today = require('../../../current-app/scorecard.js') as {
  build: (sc: { cats: TodayCategory[] }, answers: string[][][], opt?: { all?: boolean }) => TodayResult;
};
const data = JSON.parse(readFileSync(new URL('../../../current-app/data.json', import.meta.url), 'utf8')) as {
  scorecards: { cats: TodayCategory[] }[];
};

const toV2 = (cats: TodayCategory[]): ScorecardCategory[] =>
  cats.map((c) => ({
    name: c.n,
    critical: !!c.k,
    questions: c.it.map((i) => ({ text: i.t, points: i.p, critical: !!i.k, compliance: !!i.cp })),
  }));

/** a small, repeatable random generator, so a failure can always be reproduced */
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('scoring a review', () => {
  it('gives exactly today’s results on today’s scorecards, for 5000 random sets of answers', () => {
    const next = random(42);
    for (let round = 0; round < 5000; round++) {
      const base = data.scorecards[round % data.scorecards.length];
      if (!base) throw new Error('no scorecard');
      // switch critical questions and categories on at random, so every rule is exercised
      const cats: TodayCategory[] = base.cats.map((c) => ({
        ...c,
        k: next() < 0.15,
        it: c.it.map((i) => ({ ...i, k: next() < 0.1 })),
      }));
      const naShare = next() < 0.05 ? 1 : 0.2; // now and then everything N/A
      const answers = cats.map((c) =>
        c.it.map(() => {
          const r = next();
          return r < naShare ? 'na' : r < naShare + (1 - naShare) * 0.25 ? 'n' : 'y';
        }),
      );
      const theirs = today.build(
        { cats },
        answers.map((row) => row.map((a) => [a, '', ''])),
        { all: true },
      );
      const ours = scoreReview(
        toV2(cats),
        answers.map((row) => row.map((a) => ({ answer: a as GivenAnswer['answer'] }))),
      );
      expect(ours.score, `round ${round}`).toBe(theirs.sc);
      expect(ours.zero, `round ${round}`).toBe(theirs.zero);
      expect(ours.notScored, `round ${round}`).toBe(!!theirs.ns);
      expect(
        ours.categories.map((c) => [c.earned, c.possible, c.zeroed ? 1 : 0]),
        `round ${round}`,
      ).toEqual(theirs.cs.map((c) => [c.e, c.m, c.z]));
    }
  });

  const card: ScorecardCategory[] = [
    {
      name: 'Greeting',
      critical: false,
      questions: [
        { text: 'Greeted', points: 40, critical: false, compliance: false },
        { text: 'Named the company', points: 10, critical: true, compliance: true },
      ],
    },
    {
      name: 'Compliance',
      critical: true,
      questions: [{ text: 'Read the disclaimer', points: 50, critical: false, compliance: true }],
    },
  ];
  const all = (a: GivenAnswer['answer'][][]) => a.map((row) => row.map((answer) => ({ answer })));

  it('follows each of today’s rules', () => {
    expect(scoreReview(card, all([['y', 'y'], ['y']])).score).toBe(100);
    // N/A leaves its points out: 40 of 90
    expect(scoreReview(card, all([['n', 'na'], ['y']])).score).toBe(55.6);
    // a critical question answered No: its category scores 0
    const critical = scoreReview(card, all([['y', 'n'], ['y']]));
    expect([critical.score, critical.categories[0]?.earned, critical.categories[0]?.zeroed]).toEqual([50, 0, true]);
    // a No in a critical category: the whole review is 0%
    expect(scoreReview(card, all([['y', 'y'], ['n']]))).toMatchObject({ score: 0, zero: true });
    // everything N/A: not scored
    expect(scoreReview(card, all([['na', 'na'], ['na']]))).toMatchObject({ score: null, notScored: true });
  });

  it('keeps a root cause only for a No, and needs an answer to every question', () => {
    const scored = scoreReview(card, [
      [
        { answer: 'y', rootCause: 'Knowledge gap' },
        { answer: 'n', comment: 'Forgot', rootCause: 'Knowledge gap' },
      ],
      [{ answer: 'y' }],
    ]);
    expect(scored.categories[0]?.questions.map((q) => q.rootCause)).toEqual(['', 'Knowledge gap']);
    expect(() => scoreReview(card, [[{ answer: 'y' }], [{ answer: 'y' }]])).toThrow(ScoringError);
    expect(() => scoreReview(card, [[{ answer: 'y' }, { answer: 'maybe' as 'y' }], [{ answer: 'y' }]])).toThrow(
      'Answer every question',
    );
  });

  it('adds up the points, and passes at the pass rate or above (as today)', () => {
    expect(totalPoints(card)).toBe(100);
    expect(ANSWERS).toEqual(['y', 'n', 'na']);
    expect([passes(85, 85), passes(84.9, 85), passes(null, 85)]).toEqual([true, false, false]);
  });
});
