/**
 * Scoring a review, exactly as today's app (current-app/scorecard.js, `build`), shared by the pages and the server:
 * - every question is answered Yes, No or N/A; N/A ("not applicable") leaves its points out, so it never lowers the score;
 * - a critical question answered No makes its whole category score 0 points;
 * - a critical category with any No makes the whole review 0%;
 * - when every question is N/A there is nothing to score: the review is "not scored" and stays out of every average;
 * - the score is the points earned out of the points possible, as a percentage with one decimal.
 * A scorecard's points add up to exactly 100.
 */

export const ANSWERS = ['y', 'n', 'na'] as const;
export type Answer = (typeof ANSWERS)[number];

export interface ScorecardQuestion {
  text: string;
  points: number;
  /** critical: answered No, its category scores 0 */
  critical: boolean;
  /** a compliance question (Compliance & CX counts them) */
  compliance: boolean;
  /** the company's guidance for AutoQA on how to judge it (Phase 3b); not copied into reviews */
  aiGuide?: string;
}
export interface ScorecardCategory {
  name: string;
  /** critical: any No in it makes the whole review 0% */
  critical: boolean;
  questions: ScorecardQuestion[];
}

/** One answer: Yes/No/N/A, a comment, and the root cause of a No. */
export interface GivenAnswer {
  answer: Answer;
  comment?: string;
  rootCause?: string;
}

export interface ScoredQuestion extends ScorecardQuestion {
  answer: Answer;
  comment: string;
  /** kept only for a No */
  rootCause: string;
}
export interface ScoredCategory {
  name: string;
  critical: boolean;
  /** points earned and possible */
  earned: number;
  possible: number;
  /** true when a critical question or category set it to 0 */
  zeroed: boolean;
  questions: ScoredQuestion[];
}
export interface ScoredReview {
  categories: ScoredCategory[];
  /** the percentage, or null when not scored */
  score: number | null;
  /** a critical category failed: the review is 0% */
  zero: boolean;
  /** every question N/A: nothing to score, out of every average */
  notScored: boolean;
}

export class ScoringError extends Error {
  constructor(
    readonly code: 'unanswered' | 'shape',
    message: string,
  ) {
    super(message);
  }
}

/** Scores the answers (one list per category, one answer per question) against the scorecard. */
export function scoreReview(categories: ScorecardCategory[], answers: GivenAnswer[][]): ScoredReview {
  if (answers.length !== categories.length) throw new ScoringError('shape', 'The answers do not match the scorecard.');
  let zeroAll = false;
  const scored = categories.map((category, ci) => {
    const row = answers[ci];
    if (!row || row.length !== category.questions.length)
      throw new ScoringError('shape', 'The answers do not match the scorecard.');
    let earned = 0;
    let possible = 0;
    let criticalNo = false;
    let anyNo = false;
    const questions = category.questions.map((q, qi) => {
      const given = row[qi];
      // every question needs Yes, No or N/A: nothing is counted as Yes in silence (today's decision 14)
      if (!given || !ANSWERS.includes(given.answer))
        throw new ScoringError('unanswered', 'Answer every question before you save the review.');
      const { answer } = given;
      if (answer !== 'na') {
        possible += q.points;
        if (answer === 'y') earned += q.points;
      }
      if (answer === 'n') {
        anyNo = true;
        if (q.critical) criticalNo = true;
      }
      return {
        text: q.text,
        points: q.points,
        critical: q.critical,
        compliance: q.compliance,
        answer,
        comment: (given.comment ?? '').slice(0, 300),
        rootCause: answer === 'n' ? (given.rootCause ?? '').slice(0, 60) : '',
      };
    });
    if (criticalNo) earned = 0;
    if (category.critical && anyNo) zeroAll = true;
    return { name: category.name, critical: category.critical, earned, possible, zeroed: criticalNo, questions };
  });
  if (zeroAll) for (const c of scored) Object.assign(c, { earned: 0, zeroed: true });
  const earned = scored.reduce((sum, c) => sum + c.earned, 0);
  const possible = scored.reduce((sum, c) => sum + c.possible, 0);
  if (!zeroAll && possible === 0) return { categories: scored, score: null, zero: false, notScored: true };
  return {
    categories: scored,
    score: zeroAll ? 0 : Math.round((earned / possible) * 1000) / 10,
    zero: zeroAll,
    notScored: false,
  };
}

/** A scorecard's points must add up to exactly 100 (today's rule). */
export const totalPoints = (categories: ScorecardCategory[]) =>
  categories.reduce((sum, c) => sum + c.questions.reduce((s, q) => s + q.points, 0), 0);

/** A review passes when its score reaches the pass rate (the team's own, or the company's). */
export const passes = (score: number | null, passRate: number) => score !== null && score >= passRate;
