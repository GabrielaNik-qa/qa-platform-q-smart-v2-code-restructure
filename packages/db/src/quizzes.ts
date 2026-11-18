// Learning › Quizzes, always behind the company wall (inside withCompany). Who may see or change what is decided by the
// server; the rules (who a quiz is given to, what is left) are in @qsmart/shared.
import { asc, desc, eq, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { kbAttempts, kbReads, type KbQuestion, quizAttempts, quizzes } from './schema.js';

const thisCompany = sql<string>`app_company()`;

export interface Quiz {
  id: string;
  title: string;
  description: string;
  kind: 'weekly' | 'monthly' | 'category' | 'custom';
  topics: string[];
  articleIds: string[];
  pass: number;
  dueOn: string | null;
  assignAll: boolean;
  assignTeams: string[];
  assignPeople: string[];
  status: 'draft' | 'published';
  tries: number;
  questions: KbQuestion[];
  byName: string;
  createdAt: Date;
  updatedAt: Date;
}
export type QuizInput = Omit<Quiz, 'id' | 'byName' | 'createdAt' | 'updatedAt'>;

const quizOf = ({ companyId: _c, ...q }: typeof quizzes.$inferSelect): Quiz => ({
  ...q,
  kind: q.kind as Quiz['kind'],
  status: q.status as Quiz['status'],
});

export async function listQuizzes(tx: Tx): Promise<Quiz[]> {
  return (await tx.select().from(quizzes).orderBy(desc(quizzes.createdAt))).map(quizOf);
}
export async function getQuiz(tx: Tx, id: string): Promise<Quiz | undefined> {
  const [row] = await tx.select().from(quizzes).where(eq(quizzes.id, id));
  return row && quizOf(row);
}
export async function addQuiz(tx: Tx, v: QuizInput, byName: string): Promise<string> {
  const [row] = await tx
    .insert(quizzes)
    .values({ ...v, companyId: thisCompany, byName })
    .returning({ id: quizzes.id });
  if (!row) throw new Error('quiz not saved');
  return row.id;
}
export async function updateQuiz(tx: Tx, id: string, v: QuizInput): Promise<boolean> {
  const done = await tx
    .update(quizzes)
    .set({ ...v, updatedAt: sql`now()` })
    .where(eq(quizzes.id, id))
    .returning({ id: quizzes.id });
  return done.length > 0;
}
export async function deleteQuiz(tx: Tx, id: string): Promise<boolean> {
  const done = await tx.delete(quizzes).where(eq(quizzes.id, id)).returning({ id: quizzes.id });
  return done.length > 0;
}

export interface QuizAttempt {
  quizId: string;
  membershipId: string;
  score: number;
  passed: boolean;
  at: Date;
}
export async function listQuizAttempts(tx: Tx): Promise<QuizAttempt[]> {
  return tx
    .select({
      quizId: quizAttempts.quizId,
      membershipId: quizAttempts.membershipId,
      score: quizAttempts.score,
      passed: quizAttempts.passed,
      at: quizAttempts.at,
    })
    .from(quizAttempts)
    .orderBy(asc(quizAttempts.at));
}
export async function addQuizAttempt(
  tx: Tx,
  quizId: string,
  membershipId: string,
  score: number,
  passed: boolean,
): Promise<void> {
  await tx.insert(quizAttempts).values({ companyId: thisCompany, quizId, membershipId, score, passed });
}

/** Everybody's reading, for the progress report: who read which article, and who passed which lesson test. */
export async function allReading(tx: Tx): Promise<{
  reads: { membershipId: string; articleId: string }[];
  testsPassed: { membershipId: string; articleId: string }[];
}> {
  const reads = await tx.select({ membershipId: kbReads.membershipId, articleId: kbReads.articleId }).from(kbReads);
  const testsPassed = await tx
    .selectDistinct({ membershipId: kbAttempts.membershipId, articleId: kbAttempts.articleId })
    .from(kbAttempts)
    .where(eq(kbAttempts.passed, true));
  return { reads, testsPassed };
}
