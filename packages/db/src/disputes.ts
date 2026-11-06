// Disputes, always behind the company wall (inside withCompany). Who may open, write in or resolve one is decided by
// the server (today's rules: the agent opens one on their own review, once; admins and reviewers answer and resolve).
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { type ReviewScope, scopeWhere } from './reviews.js';
import { disputeMessages, disputes, reviews } from './schema.js';

const thisCompany = sql<string>`app_company()`;

export type DisputeOutcome = 'kept' | 'changed' | 'partly';
/** disputed: nobody answered the agent yet · progress: staff answered · resolved: closed (today's three states) */
export type DisputeState = 'disputed' | 'progress' | 'resolved';

export interface DisputeMessage {
  id: string;
  authorId: string | null;
  authorName: string;
  authorRole: string;
  /** the closing message: its text is the outcome's code (kept, changed, partly) */
  system: boolean;
  text: string;
  at: Date;
}

export interface Dispute {
  id: string;
  reviewId: string;
  agentId: string | null;
  openedAt: Date;
  state: DisputeState;
  outcome: DisputeOutcome | null;
  note: string;
  resolvedByName: string;
  resolvedAt: Date | null;
  messages: DisputeMessage[];
}

/** Who writes: kept as name and role too, in case the person leaves later. */
export interface Author {
  membershipId: string | null;
  name: string;
  role: string;
}

const stateOf = (resolved: boolean, messages: DisputeMessage[]): DisputeState =>
  resolved ? 'resolved' : messages.some((m) => !m.system && m.authorRole !== 'agent') ? 'progress' : 'disputed';

async function withMessages(tx: Tx, rows: (typeof disputes.$inferSelect)[]): Promise<Dispute[]> {
  if (!rows.length) return [];
  const messages = await tx
    .select()
    .from(disputeMessages)
    .where(
      inArray(
        disputeMessages.disputeId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(disputeMessages.at), asc(disputeMessages.id));
  const byDispute = new Map<string, DisputeMessage[]>();
  for (const { companyId: _c, disputeId, ...m } of messages)
    byDispute.set(disputeId, [...(byDispute.get(disputeId) ?? []), m]);
  return rows.map((r) => {
    const list = byDispute.get(r.id) ?? [];
    return {
      id: r.id,
      reviewId: r.reviewId,
      agentId: r.agentId,
      openedAt: r.openedAt,
      state: stateOf(r.resolvedAt !== null, list),
      outcome: r.outcome,
      note: r.note,
      resolvedByName: r.resolvedByName,
      resolvedAt: r.resolvedAt,
      messages: list,
    };
  });
}

/** The disputes of the reviews a person reaches, newest first. */
export async function listDisputes(tx: Tx, scope: ReviewScope): Promise<Dispute[]> {
  const rows = await tx
    .select({ dispute: disputes })
    .from(disputes)
    .innerJoin(reviews, eq(reviews.id, disputes.reviewId))
    .where(scopeWhere(scope))
    .orderBy(sql`${disputes.openedAt} desc`);
  return withMessages(
    tx,
    rows.map((r) => r.dispute),
  );
}

/** The dispute of a review (the server has already checked that the person reaches the review). */
export async function disputeOfReview(tx: Tx, reviewId: string): Promise<Dispute | undefined> {
  const rows = await tx.select().from(disputes).where(eq(disputes.reviewId, reviewId));
  return (await withMessages(tx, rows))[0];
}

async function addMessage(tx: Tx, disputeId: string, author: Author, text: string, system = false): Promise<void> {
  await tx.insert(disputeMessages).values({
    companyId: thisCompany,
    disputeId,
    authorId: author.membershipId,
    authorName: author.name,
    authorRole: author.role,
    system,
    text,
  });
}

/** The agent disputes their review: the first message is their reason, and the review shows as disputed. */
export async function openDispute(tx: Tx, reviewId: string, author: Author, reason: string): Promise<string> {
  const [row] = await tx
    .insert(disputes)
    .values({ companyId: thisCompany, reviewId, agentId: author.membershipId })
    .onConflictDoNothing()
    .returning({ id: disputes.id });
  if (!row) throw new DisputeExists();
  await addMessage(tx, row.id, author, reason);
  await tx.update(reviews).set({ status: 'disputed' }).where(eq(reviews.id, reviewId));
  return row.id;
}

/** Raised when the review was already disputed (once per review, as today). */
export class DisputeExists extends Error {
  constructor() {
    super('This review has already been disputed.');
  }
}

export async function writeInDispute(tx: Tx, disputeId: string, author: Author, text: string): Promise<void> {
  await addMessage(tx, disputeId, author, text);
}

/**
 * An admin or reviewer closes it: the outcome, an optional note, a closing message in the conversation, and the review
 * is no longer shown as disputed. False when it was already resolved. The closing message holds the outcome's code, so
 * the pages word it in each reader's language.
 */
export async function resolveDispute(
  tx: Tx,
  disputeId: string,
  author: Author,
  outcome: DisputeOutcome,
  note: string,
): Promise<boolean> {
  const [row] = await tx
    .update(disputes)
    .set({
      resolvedAt: sql`now()`,
      outcome,
      note,
      resolvedById: author.membershipId,
      resolvedByName: author.name,
    })
    .where(and(eq(disputes.id, disputeId), isNull(disputes.resolvedAt)))
    .returning({ reviewId: disputes.reviewId });
  if (!row) return false;
  await addMessage(tx, disputeId, author, outcome, true);
  await tx.update(reviews).set({ status: 'ok' }).where(eq(reviews.id, row.reviewId));
  return true;
}
