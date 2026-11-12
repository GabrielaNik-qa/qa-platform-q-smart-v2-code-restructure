// Quality › Conversations, customers, transcripts and Admin › Fields, always behind the company wall (inside
// withCompany). Who may see or change which conversation is decided by the server (the same reach as reviews: agents
// their own, staff their workspaces, admins all). A transcript is only text, and is deleted after the company's days.
import type { FieldObject, StoredField } from '@qsmart/shared';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import type { Db } from './client.js';
import type { Tx } from './company.js';
import { type ReviewScope, scopeWhere } from './reviews.js';
import { DEMO_COMPANY } from './seed.js';
import { companies, conversations, customers, fields, reviews, transcripts } from './schema.js';

const thisCompany = sql<string>`app_company()`;

// ---------------------------------------------------------------------------------------------- fields

export async function listStoredFields(tx: Tx): Promise<StoredField[]> {
  const rows = await tx.select().from(fields);
  return rows.map(({ companyId: _c, updatedAt: _u, ...f }) => ({
    ...f,
    object: f.object as FieldObject,
    type: f.type as StoredField['type'],
  }));
}

export async function saveStoredFields(tx: Tx, list: StoredField[]): Promise<void> {
  for (const f of list)
    await tx
      .insert(fields)
      .values({ companyId: thisCompany, ...f })
      .onConflictDoUpdate({
        target: [fields.companyId, fields.object, fields.key],
        set: {
          labels: f.labels,
          type: f.type,
          options: f.options,
          required: f.required,
          ai: f.ai,
          hidden: f.hidden,
          position: f.position,
          updatedAt: sql`now()`,
        },
      });
}

/** Deletes one of the company's own fields for good, with its values on every customer or conversation. */
export async function deleteStoredField(tx: Tx, object: FieldObject, key: string): Promise<void> {
  await tx.delete(fields).where(and(eq(fields.object, object), eq(fields.key, key)));
  const table = object === 'customer' ? customers : conversations;
  await tx
    .update(table)
    .set({ values: sql`${table.values} - ${key}` })
    .where(sql`${table.values} ? ${key}`);
}

// ---------------------------------------------------------------------------------------------- transcript days

export const TRANSCRIPT_DAYS = [0, 7, 14, 30, 60, 90, 180, 365] as const;

export async function transcriptDays(tx: Tx): Promise<number> {
  const [row] = await tx.select({ days: companies.transcriptDays }).from(companies);
  return row?.days ?? 90;
}

export async function setTranscriptDays(tx: Tx, days: number): Promise<void> {
  await tx.update(companies).set({ transcriptDays: days }).where(eq(companies.id, thisCompany));
}

/** The timed job: deletes the transcripts older than each company's days, in every company. Returns how many. */
export async function deleteOldTranscripts(db: Db): Promise<number> {
  const result = await db.execute<{ n: number }>(sql`SELECT delete_old_transcripts() AS n`);
  return Number(result.rows[0]?.n ?? 0);
}

// ---------------------------------------------------------------------------------------------- customers

export interface Customer {
  id: string;
  externalId: string;
  values: Record<string, unknown>;
}

export async function getCustomer(tx: Tx, id: string): Promise<Customer | undefined> {
  const [row] = await tx
    .select({ id: customers.id, externalId: customers.externalId, values: customers.values })
    .from(customers)
    .where(eq(customers.id, id));
  return row;
}

export async function findCustomer(tx: Tx, externalId: string): Promise<Customer | undefined> {
  if (!externalId) return undefined;
  const [row] = await tx
    .select({ id: customers.id, externalId: customers.externalId, values: customers.values })
    .from(customers)
    .where(eq(customers.externalId, externalId))
    .limit(1);
  return row;
}

export async function saveCustomer(tx: Tx, c: Omit<Customer, 'id'> & { id?: string }): Promise<string> {
  if (c.id) {
    await tx
      .update(customers)
      .set({ externalId: c.externalId, values: c.values, updatedAt: sql`now()` })
      .where(eq(customers.id, c.id));
    return c.id;
  }
  const [row] = await tx
    .insert(customers)
    .values({ companyId: thisCompany, externalId: c.externalId, values: c.values })
    .returning({ id: customers.id });
  if (!row) throw new Error('The customer was not saved.');
  return row.id;
}

// ---------------------------------------------------------------------------------------------- conversations

export type ConversationChannel = 'call' | 'chat' | 'email' | 'other';

export interface ConversationRow {
  id: string;
  channel: ConversationChannel;
  channelName: string;
  startedAt: Date;
  agentId: string | null;
  agentName: string;
  teamId: string | null;
  teamName: string;
  customerId: string | null;
  link: string;
  values: Record<string, unknown>;
  /** held for a person: AutoQA found what looks like instructions to the AI ('' when not held) */
  aiHold: string;
  byName: string;
  createdAt: Date;
  hasTranscript: boolean;
  /** the reviews made of it */
  reviewIds: string[];
  /** AutoQA reviewed it */
  aiReviewed: boolean;
  /** the scorecard of its first review by a person (AutoQA uses the same, so the two can be compared) */
  humanScorecardId: string | null;
}
export interface Conversation extends ConversationRow {
  transcript: string | null;
  customer: Customer | null;
}

export interface ConversationFilter {
  from?: string;
  to?: string;
  agentId?: string;
  channel?: ConversationChannel;
}

const listColumns = {
  id: conversations.id,
  channel: conversations.channel,
  channelName: conversations.channelName,
  startedAt: conversations.startedAt,
  agentId: conversations.agentId,
  agentName: conversations.agentName,
  teamId: conversations.teamId,
  teamName: conversations.teamName,
  customerId: conversations.customerId,
  link: conversations.link,
  values: conversations.values,
  aiHold: conversations.aiHold,
  byName: conversations.byName,
  createdAt: conversations.createdAt,
  // the outer table named in full: inside a sub-query a bare id would be the sub-query's own
  hasTranscript: sql<boolean>`exists (select 1 from transcripts t where t.conversation_id = "conversations"."id")`,
  reviewIds: sql<
    string[]
  >`coalesce((select array_agg(r.id::text order by r.reviewed_on) from reviews r where r.conversation_id = "conversations"."id"), '{}')`,
  aiReviewed: sql<boolean>`exists (select 1 from reviews r where r.conversation_id = "conversations"."id" and r.source = 'ai')`,
  humanScorecardId: sql<
    string | null
  >`(select r.scorecard_id::text from reviews r where r.conversation_id = "conversations"."id" and r.source = 'human' order by r.created_at limit 1)`,
};

/** Newest first, at most 2000 (filtered by date, agent and channel). */
export async function listConversations(
  tx: Tx,
  scope: ReviewScope,
  filter: ConversationFilter = {},
): Promise<ConversationRow[]> {
  return tx
    .select(listColumns)
    .from(conversations)
    .where(
      and(
        scopeWhere(scope, conversations),
        filter.from ? gte(conversations.startedAt, new Date(`${filter.from}T00:00:00Z`)) : undefined,
        filter.to ? lte(conversations.startedAt, new Date(`${filter.to}T23:59:59.999Z`)) : undefined,
        filter.agentId ? eq(conversations.agentId, filter.agentId) : undefined,
        filter.channel ? eq(conversations.channel, filter.channel) : undefined,
      ),
    )
    .orderBy(desc(conversations.startedAt), desc(conversations.createdAt))
    .limit(2000);
}

export async function getConversation(tx: Tx, id: string, scope: ReviewScope): Promise<Conversation | undefined> {
  const [row] = await tx
    .select(listColumns)
    .from(conversations)
    .where(and(eq(conversations.id, id), scopeWhere(scope, conversations)));
  if (!row) return undefined;
  const [t] = await tx.select({ text: transcripts.text }).from(transcripts).where(eq(transcripts.conversationId, id));
  const customer = row.customerId ? ((await getCustomer(tx, row.customerId)) ?? null) : null;
  return { ...row, transcript: t?.text ?? null, customer };
}

export interface ConversationInput {
  channel: ConversationChannel;
  channelName: string;
  startedAt: Date;
  agentId: string | null;
  agentName: string;
  teamId: string | null;
  teamName: string;
  customerId: string | null;
  link: string;
  values: Record<string, unknown>;
}

export async function addConversation(
  tx: Tx,
  c: ConversationInput & { byId: string | null; byName: string },
  transcript: string,
): Promise<string> {
  const [row] = await tx
    .insert(conversations)
    .values({ companyId: thisCompany, ...c })
    .returning({ id: conversations.id });
  if (!row) throw new Error('The conversation was not saved.');
  if (transcript)
    await tx.insert(transcripts).values({ companyId: thisCompany, conversationId: row.id, text: transcript });
  return row.id;
}

export async function updateConversation(tx: Tx, id: string, c: ConversationInput): Promise<void> {
  await tx
    .update(conversations)
    .set({ ...c, updatedAt: sql`now()` })
    .where(eq(conversations.id, id));
}

/** Replaces the transcript (empty: deletes it). */
export async function setTranscript(tx: Tx, id: string, text: string): Promise<void> {
  if (!text) {
    await tx.delete(transcripts).where(eq(transcripts.conversationId, id));
    return;
  }
  await tx
    .insert(transcripts)
    .values({ companyId: thisCompany, conversationId: id, text })
    .onConflictDoUpdate({ target: transcripts.conversationId, set: { text } });
}

export async function deleteConversation(tx: Tx, id: string): Promise<void> {
  await tx.delete(conversations).where(eq(conversations.id, id));
}

/** Links reviews to the conversation they reviewed (the reviews must be the company's). */
export async function linkReviews(tx: Tx, conversationId: string, reviewIds: string[]): Promise<void> {
  if (reviewIds.length) await tx.update(reviews).set({ conversationId }).where(inArray(reviews.id, reviewIds));
}

// ---------------------------------------------------------------------------------------------- demo

interface DemoConversation {
  lead: string;
  at: string;
  channel: ConversationChannel;
  channelName: string;
  subject: string;
  link: string;
  text: string;
}
/** The file with today's demo transcripts (packages/db/demo/conversations.json, made by scripts/make-demo-conversations.ts). */
export const demoConversations = (): DemoConversation[] =>
  JSON.parse(readFileSync(new URL('../demo/conversations.json', import.meta.url), 'utf8')) as DemoConversation[];

/**
 * Adds today's 540 demo transcripts to the demo company as conversations, once (when it has none yet), each linked to
 * its demo review by the lead ID, with the review's agent and team. The demo company keeps transcripts for a year, so
 * the six months of demo data stay. Returns how many were added. Runs as qsmart_owner, like the rest of the demo seed.
 */
export async function seedDemoConversations(owner: Db): Promise<number> {
  const data = demoConversations();
  return owner.transaction(async (tx) => {
    const [demo] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.name, DEMO_COMPANY));
    if (!demo) return 0;
    const companyId = demo.id;
    const [any] = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.companyId, companyId))
      .limit(1);
    if (any) return 0;
    const byLead = new Map(
      (
        await tx
          .select({
            id: reviews.id,
            lead: reviews.leadId,
            agentId: reviews.agentId,
            agentName: reviews.agentName,
            teamId: reviews.teamId,
            teamName: reviews.teamName,
          })
          .from(reviews)
          .where(eq(reviews.companyId, companyId))
      ).map((r) => [r.lead, r]),
    );
    await tx.update(companies).set({ transcriptDays: 365 }).where(eq(companies.id, companyId));
    let added = 0;
    for (const c of data) {
      const review = byLead.get(c.lead);
      if (!review) continue;
      const [row] = await tx
        .insert(conversations)
        .values({
          companyId,
          channel: c.channel,
          channelName: c.channelName,
          startedAt: new Date(c.at),
          agentId: review.agentId,
          agentName: review.agentName,
          teamId: review.teamId,
          teamName: review.teamName,
          link: c.link,
          values: {
            direction: 'in',
            language: 'en',
            reference: c.lead,
            ...(c.subject ? { subject: c.subject } : {}),
          },
          byName: 'Q-smart demo',
        })
        .returning({ id: conversations.id });
      if (!row) continue;
      await tx.insert(transcripts).values({ companyId, conversationId: row.id, text: c.text });
      await tx.update(reviews).set({ conversationId: row.id }).where(eq(reviews.id, review.id));
      added++;
    }
    return added;
  });
}

/** Holds a conversation for a person (AutoQA found what looks like instructions to the AI), or releases it (''). */
export async function setAiHold(tx: Tx, id: string, hold: '' | 'injection'): Promise<void> {
  await tx.update(conversations).set({ aiHold: hold }).where(eq(conversations.id, id));
}

/** The AI review of a conversation with a scorecard, when there is one (scored again, it is updated). */
export async function aiReviewOf(tx: Tx, conversationId: string, scorecardId: string): Promise<string | undefined> {
  const [row] = await tx
    .select({ id: reviews.id })
    .from(reviews)
    .where(
      and(eq(reviews.conversationId, conversationId), eq(reviews.scorecardId, scorecardId), eq(reviews.source, 'ai')),
    );
  return row?.id;
}

/** The company is the demo (its data is made up: the AI counts it as test data, not a client's). */
export async function isDemoCompany(tx: Tx): Promise<boolean> {
  const [row] = await tx.select({ name: companies.name }).from(companies);
  return row?.name === DEMO_COMPANY;
}

/** The demo company's guide for choosing a conversation's outcome (AutoQA's outcome check reads it). */
const DEMO_OUTCOME_GUIDES: Record<string, string> = {
  resolved:
    "The customer's question or problem was fully answered or fixed in this conversation, and nothing is left to do.",
  followUp:
    'Something is still to do after the conversation: a call back, a check, a document to send, or an answer the agent promised to give later.',
  notResolved:
    "The customer's problem was not solved and no next step was agreed, or the customer left without a solution.",
  noAnswer: 'Nobody answered, or the customer left before any real conversation took place.',
};

/**
 * Gives the demo company's outcomes their guide, once (while it never changed its outcome field), so the demo shows
 * AutoQA's outcome check. Returns true when added. Runs as qsmart_owner, like the rest of the demo seed.
 */
export async function seedDemoOutcomeGuides(owner: Db): Promise<boolean> {
  return owner.transaction(async (tx) => {
    const [demo] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.name, DEMO_COMPANY));
    if (!demo) return false;
    const added = await tx
      .insert(fields)
      .values({
        companyId: demo.id,
        object: 'conversation',
        key: 'outcome',
        type: 'dropdown',
        ai: true,
        position: 70,
        options: Object.entries(DEMO_OUTCOME_GUIDES).map(([id, guide]) => ({ id, labels: {}, guide })),
      })
      .onConflictDoNothing()
      .returning({ key: fields.key });
    return added.length > 0;
  });
}
