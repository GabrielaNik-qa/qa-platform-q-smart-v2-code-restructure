// AutoQA's accuracy score (V2_PLAN §7 and §17, like Zendesk QA's): on conversations reviewed by both AutoQA and a
// person with the same scorecard, how often they give the same answer, per category, scorecard, AI model, period and
// language. N/A is left out (a question either of them marked N/A isn't compared). Bands as in Zendesk QA: high
// 75-100%, medium 25-74%, low 0-24%. The automatic brake: a category under the company's bar (75% by default) once at
// least 20 conversations were compared in it. The sample reviewers score is random and spread across agents,
// channels and languages.
import type { Answer } from './scoring.js';

export interface ComparedCategory {
  name: string;
  questions: { text: string; answer: Answer }[];
}

/** One conversation reviewed by both: AutoQA's answers and a person's, with what they are grouped by. */
export interface AccuracyPair {
  conversationId: string;
  scorecardId: string;
  scorecardName: string;
  model: string;
  language: string;
  /** the AI review's date (yyyy-mm-dd) */
  day: string;
  ai: ComparedCategory[];
  human: ComparedCategory[];
}

export interface Agreement {
  /** questions with the same answer */
  same: number;
  /** questions compared (N/A left out) */
  compared: number;
  /** conversations with at least one question compared */
  conversations: number;
  /** 0-100, or null when nothing was compared */
  score: number | null;
  band: AccuracyBand | null;
}
export type AccuracyBand = 'high' | 'medium' | 'low';

export const bandOf = (score: number): AccuracyBand => (score >= 75 ? 'high' : score >= 25 ? 'medium' : 'low');

/** The minimum of compared conversations before a category can be braked, and the default bar. */
export const BRAKE_MIN_CONVERSATIONS = 20;
export const DEFAULT_ACCURACY_BAR = 75;

/** A category's key for the brake: its scorecard and its name. */
export const categoryKey = (scorecardId: string, category: string) => `${scorecardId}|${category}`;

interface Tally {
  same: number;
  compared: number;
  conversations: Set<string>;
}
const finish = (t: Tally): Agreement => {
  const score = t.compared ? Math.round((t.same / t.compared) * 1000) / 10 : null;
  return {
    same: t.same,
    compared: t.compared,
    conversations: t.conversations.size,
    score,
    band: score === null ? null : bandOf(score),
  };
};

/**
 * The agreement of every question both answered (Yes or No: N/A left out), matched by category name and question
 * text, so a scorecard changed between the two reviews compares only what both had.
 */
export function comparedQuestions(pair: AccuracyPair): { category: string; question: string; same: boolean }[] {
  return pair.ai.flatMap((c) => {
    const other = pair.human.find((h) => h.name === c.name);
    if (!other) return [];
    return c.questions.flatMap((q) => {
      const h = other.questions.find((x) => x.text === q.text);
      if (!h || q.answer === 'na' || h.answer === 'na') return [];
      return [{ category: c.name, question: q.text, same: q.answer === h.answer }];
    });
  });
}

/** The agreement of all pairs, grouped by a key of each compared question (null: left out of every group). */
export function agreementBy(
  pairs: AccuracyPair[],
  key: (pair: AccuracyPair, category: string) => string | null,
): Map<string, Agreement> {
  const groups = new Map<string, Tally>();
  for (const pair of pairs)
    for (const q of comparedQuestions(pair)) {
      const k = key(pair, q.category);
      if (k === null) continue;
      const t = groups.get(k) ?? { same: 0, compared: 0, conversations: new Set<string>() };
      t.compared++;
      if (q.same) t.same++;
      t.conversations.add(pair.conversationId);
      groups.set(k, t);
    }
  return new Map([...groups].map(([k, t]) => [k, finish(t)]));
}

/** Overall: all pairs together. */
export const overallAgreement = (pairs: AccuracyPair[]): Agreement =>
  agreementBy(pairs, () => 'all').get('all') ?? { same: 0, compared: 0, conversations: 0, score: null, band: null };

/** The categories under the bar, with enough compared conversations (keys as `categoryKey`). */
export function brakedCategories(pairs: AccuracyPair[], bar: number = DEFAULT_ACCURACY_BAR): string[] {
  const perCategory = agreementBy(pairs, (p, c) => categoryKey(p.scorecardId, c));
  return [...perCategory]
    .filter(([, a]) => a.conversations >= BRAKE_MIN_CONVERSATIONS && a.score !== null && a.score < bar)
    .map(([k]) => k)
    .sort();
}

/** The questions where AutoQA and people disagree most (for the scorecard's owner to look at). */
export function biggestDisagreements(pairs: AccuracyPair[], top = 6) {
  const byQuestion = new Map<string, { category: string; question: string; same: number; compared: number }>();
  for (const pair of pairs)
    for (const q of comparedQuestions(pair)) {
      const k = `${q.category}|${q.question}`;
      const t = byQuestion.get(k) ?? { category: q.category, question: q.question, same: 0, compared: 0 };
      t.compared++;
      if (q.same) t.same++;
      byQuestion.set(k, t);
    }
  return [...byQuestion.values()]
    .map((t) => ({ ...t, score: Math.round((t.same / t.compared) * 1000) / 10 }))
    .filter((t) => t.same < t.compared)
    .sort((a, b) => a.score - b.score || b.compared - a.compared)
    .slice(0, top);
}

/**
 * A random sample spread evenly across groups (agent, channel and language): one from each group in turn, in a
 * random order, until there are `n`. `random` returns 0 to 1 (Math.random in the app; fixed in the tests).
 */
export function stratifiedSample<T>(items: T[], group: (item: T) => string, n: number, random = Math.random): T[] {
  const shuffle = <X>(list: X[]) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j] as X, out[i] as X];
    }
    return out;
  };
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(group(item), [...(groups.get(group(item)) ?? []), item]);
  const queues = shuffle([...groups.values()].map(shuffle));
  const picked: T[] = [];
  while (picked.length < n && queues.some((q) => q.length))
    for (const q of queues) {
      const next = q.shift();
      if (next !== undefined && picked.length < n) picked.push(next);
    }
  return picked;
}
