// Reviewer QA, always behind the company wall (inside withCompany). Who may see or make which check is decided by the
// server (today's rules: staff read the checks of their workspaces, admins all; admins, reviewers and team leads write).
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { type ReviewScope, scopeWhere } from './reviews.js';
import { reviewerChecks } from './schema.js';

const thisCompany = sql<string>`app_company()`;

export interface ReviewerCheck {
  id: string;
  reviewId: string | null;
  leadId: string;
  reviewedOn: string;
  agentId: string | null;
  agentName: string;
  teamId: string | null;
  reviewerId: string | null;
  reviewerName: string;
  fair: boolean;
  follows: boolean;
  critical: boolean;
  useful: boolean;
  note: string;
  byId: string | null;
  byName: string;
  createdAt: Date;
  updatedAt: Date;
}
export type NewReviewerCheck = Omit<ReviewerCheck, 'id' | 'createdAt' | 'updatedAt'>;
export type ReviewerCheckAnswers = Pick<ReviewerCheck, 'fair' | 'follows' | 'critical' | 'useful' | 'note'>;

const strip = ({ companyId: _company, ...check }: typeof reviewerChecks.$inferSelect): ReviewerCheck => check;

/** Newest first. */
export async function listReviewerChecks(tx: Tx, scope: ReviewScope): Promise<ReviewerCheck[]> {
  const rows = await tx
    .select()
    .from(reviewerChecks)
    .where(scopeWhere(scope, reviewerChecks))
    .orderBy(desc(reviewerChecks.createdAt));
  return rows.map(strip);
}

export async function getReviewerCheck(tx: Tx, id: string, scope: ReviewScope): Promise<ReviewerCheck | undefined> {
  const [row] = await tx
    .select()
    .from(reviewerChecks)
    .where(and(eq(reviewerChecks.id, id), scopeWhere(scope, reviewerChecks)));
  return row ? strip(row) : undefined;
}

export async function addReviewerCheck(tx: Tx, check: NewReviewerCheck): Promise<string> {
  const [row] = await tx
    .insert(reviewerChecks)
    .values({ companyId: thisCompany, ...check })
    .returning({ id: reviewerChecks.id });
  if (!row) throw new Error('The check was not saved.');
  return row.id;
}

export async function updateReviewerCheck(tx: Tx, id: string, answers: ReviewerCheckAnswers): Promise<void> {
  await tx
    .update(reviewerChecks)
    .set({ ...answers, updatedAt: sql`now()` })
    .where(eq(reviewerChecks.id, id));
}

export async function deleteReviewerCheck(tx: Tx, id: string): Promise<void> {
  await tx.delete(reviewerChecks).where(eq(reviewerChecks.id, id));
}
