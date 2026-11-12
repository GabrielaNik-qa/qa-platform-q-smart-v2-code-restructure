// AutoQA's figures (the AutoQA page) and the automatic brake, from the reviews a person can see:
// - pairs: conversations reviewed by both AutoQA and a person with the same scorecard (the accuracy score's material),
//   and the answers an agent marked "not what I said" that a person then decided (when no person reviewed it);
// - the brake: a category under the company's bar once 20 conversations were compared in it; the admins are told once
//   when it happens (again only if it recovers and falls again), and an admin can pause AI reviews for it.
import {
  type AiReviewRules,
  type AnswerMark,
  decidedMarks,
  getAiRules,
  listPeople,
  listReviews,
  notify,
  type Review,
  saveAiRules,
  type Tx,
} from '@qsmart/db';
import { type AccuracyPair, brakedCategories, DEFAULT_ACCURACY_BAR } from '@qsmart/shared';

/** The reviews of one conversation by AutoQA and by a person, with the same scorecard, as pairs. */
export function pairsOf(
  reviews: Review[],
  languageOf: (conversationId: string) => string,
  marks: Map<string, AnswerMark[]> = new Map(),
): AccuracyPair[] {
  const human = new Map<string, Review>();
  for (const r of reviews)
    if (r.source !== 'ai' && r.conversationId && r.scorecardId) {
      const k = `${r.conversationId}|${r.scorecardId}`;
      if (!human.has(k)) human.set(k, r);
    }
  return reviews.flatMap((r) => {
    if (r.source !== 'ai' || !r.conversationId || !r.scorecardId) return [];
    const person = human.get(`${r.conversationId}|${r.scorecardId}`);
    const decided = marks.get(r.id) ?? [];
    if (!person && !decided.length) return [];
    const strip = (cats: Review['categories']) =>
      cats.map((c) => ({ name: c.name, questions: c.questions.map((q) => ({ text: q.text, answer: q.answer })) }));
    return [
      {
        conversationId: r.conversationId,
        scorecardId: r.scorecardId,
        scorecardName: r.scorecardName,
        model: r.ai?.model ?? '',
        language: languageOf(r.conversationId) || '-',
        day: r.reviewedOn,
        ...(person ? { ai: strip(r.categories), human: strip(person.categories) } : fromMarks(decided)),
      },
    ];
  });
}

/** The marked answers as a comparison: AutoQA's answer when marked, against the person's decision. */
function fromMarks(marks: AnswerMark[]): Pick<AccuracyPair, 'ai' | 'human'> {
  const names = [...new Set(marks.map((m) => m.category))];
  const side = (pick: (m: AnswerMark) => AnswerMark['ai']) =>
    names.map((name) => ({
      name,
      questions: marks.filter((m) => m.category === name).map((m) => ({ text: m.question, answer: pick(m) })),
    }));
  return { ai: side((m) => m.ai), human: side((m) => m.right ?? 'na') };
}

export const barOf = (rules: AiReviewRules) => rules.bar ?? DEFAULT_ACCURACY_BAR;

/**
 * Checks the brake on all the company's reviews: the categories now under the bar are kept, and the admins are told
 * about the ones newly under it (with a link to the AutoQA page). Returns the braked categories' keys.
 */
export async function checkBrake(tx: Tx): Promise<string[]> {
  const rules = await getAiRules(tx);
  const reviews = await listReviews(tx, { all: true });
  const braked = brakedCategories(
    pairsOf(reviews, () => '', await decidedMarks(tx)),
    barOf(rules.reviews),
  );
  const before = new Set(rules.reviews.flagged ?? []);
  const fresh = braked.filter((k) => !before.has(k));
  if (fresh.length) {
    const admins = (await listPeople(tx)).filter((p) => p.role === 'admin' && p.active);
    for (const key of fresh) {
      const [scorecardId, category] = key.split('|');
      const card = reviews.find((r) => r.scorecardId === scorecardId)?.scorecardName ?? '';
      for (const admin of admins)
        await notify(
          tx,
          admin.membershipId,
          'aiAccuracyLow',
          { category: category ?? '', scorecard: card, bar: String(barOf(rules.reviews)) },
          '/quality/autoqa',
        );
    }
  }
  if (fresh.length || braked.length !== before.size)
    await saveAiRules(tx, { reviews: { ...rules.reviews, flagged: braked } });
  return braked;
}
