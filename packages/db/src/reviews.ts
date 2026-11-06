// Reviews (QA Entry and Reviews), always behind the company wall (inside withCompany). Who may see or change which
// review is decided by the server (today's rules: agents their own, staff their workspaces, admins all).
import type { ScoredCategory } from '@qsmart/shared';
import { and, type AnyColumn, desc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { reviews } from './schema.js';

const thisCompany = sql<string>`app_company()`;

export type Channel = 'call' | 'chat' | 'email' | 'other';
export type Flag = '' | 'green' | 'red';

export interface Review {
  id: string;
  leadId: string;
  agentId: string | null;
  agentName: string;
  teamId: string | null;
  teamName: string;
  reviewedOn: string;
  channel: Channel;
  channelName: string;
  scorecardId: string | null;
  scorecardName: string;
  categories: ScoredCategory[];
  score: number | null;
  zero: boolean;
  notScored: boolean;
  status: string;
  flag: Flag;
  campaign: string;
  comment: string;
  leadLink: string;
  recordingLink: string;
  conversationLink: string;
  transcript: string;
  emailSubject: string;
  reviewerId: string | null;
  reviewerName: string;
  seenAt: Date | null;
  reviewSeconds: number | null;
  createdAt: Date;
  updatedAt: Date;
}
export type NewReview = Omit<Review, 'id' | 'status' | 'seenAt' | 'createdAt' | 'updatedAt'>;
export type ReviewChange = Partial<
  Pick<
    Review,
    | 'leadId'
    | 'agentId'
    | 'agentName'
    | 'teamId'
    | 'teamName'
    | 'reviewedOn'
    | 'channel'
    | 'channelName'
    | 'categories'
    | 'score'
    | 'zero'
    | 'notScored'
    | 'status'
    | 'flag'
    | 'campaign'
    | 'comment'
    | 'leadLink'
    | 'recordingLink'
    | 'conversationLink'
    | 'transcript'
    | 'emailSubject'
  >
>;

/** Whose reviews: everyone's (admins), those of some teams (staff: their workspaces), or one agent's own. */
export type ReviewScope = { all: true } | { teamIds: string[] } | { agentId: string };

/** The rows of a table (reviews, quick flags …) that a scope reaches, through their agent and team columns. */
export const scopeWhere = (
  scope: ReviewScope,
  table: { agentId: AnyColumn; teamId: AnyColumn } = reviews,
): SQL | undefined => {
  if ('all' in scope) return undefined;
  if ('agentId' in scope) return eq(table.agentId, scope.agentId);
  return scope.teamIds.length ? inArray(table.teamId, scope.teamIds) : sql`false`;
};

/** Newest first (today: by review date, then by when it was saved). */
export async function listReviews(tx: Tx, scope: ReviewScope): Promise<Review[]> {
  return tx
    .select()
    .from(reviews)
    .where(scopeWhere(scope))
    .orderBy(desc(reviews.reviewedOn), desc(reviews.createdAt))
    .then((rows) => rows.map(({ companyId: _company, ...r }) => r as Review));
}

export async function getReview(tx: Tx, id: string, scope: ReviewScope): Promise<Review | undefined> {
  const [row] = await tx
    .select()
    .from(reviews)
    .where(and(eq(reviews.id, id), scopeWhere(scope)));
  if (!row) return undefined;
  const { companyId: _company, ...review } = row;
  return review as Review;
}

export async function addReview(tx: Tx, review: NewReview): Promise<string> {
  const [row] = await tx
    .insert(reviews)
    .values({ companyId: thisCompany, ...review })
    .returning({ id: reviews.id });
  if (!row) throw new Error('The review was not saved.');
  return row.id;
}

export async function updateReview(tx: Tx, id: string, change: ReviewChange): Promise<void> {
  await tx
    .update(reviews)
    .set({ ...change, updatedAt: sql`now()` })
    .where(eq(reviews.id, id));
}

export async function deleteReview(tx: Tx, id: string): Promise<void> {
  await tx.delete(reviews).where(eq(reviews.id, id));
}

/** The agent opened it for the first time. */
export async function markSeen(tx: Tx, id: string): Promise<void> {
  await tx
    .update(reviews)
    .set({ seenAt: sql`now()` })
    .where(and(eq(reviews.id, id), isNull(reviews.seenAt)));
}
