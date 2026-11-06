// Quick flags, always behind the company wall (inside withCompany). Who may see or give which flag is decided by the
// server (today's rules: staff the agents of their workspaces, admins all; agents read their own).
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { type ReviewScope, scopeWhere } from './reviews.js';
import { quickFlags } from './schema.js';

const thisCompany = sql<string>`app_company()`;

export interface QuickFlag {
  id: string;
  type: 'red' | 'green';
  channel: 'call' | 'chat' | 'email' | 'other';
  agentId: string | null;
  agentName: string;
  teamId: string | null;
  teamName: string;
  leadId: string;
  flaggedOn: string;
  campaign: string;
  leadLink: string;
  conversationLink: string;
  comment: string;
  byId: string | null;
  byName: string;
  createdAt: Date;
  updatedAt: Date;
}
export type NewQuickFlag = Omit<QuickFlag, 'id' | 'createdAt' | 'updatedAt'>;
export type QuickFlagChange = Omit<NewQuickFlag, 'byId' | 'byName'>;

const strip = ({ companyId: _company, ...flag }: typeof quickFlags.$inferSelect): QuickFlag => flag;

/** Newest first. */
export async function listQuickFlags(tx: Tx, scope: ReviewScope): Promise<QuickFlag[]> {
  const rows = await tx
    .select()
    .from(quickFlags)
    .where(scopeWhere(scope, quickFlags))
    .orderBy(desc(quickFlags.flaggedOn), desc(quickFlags.createdAt));
  return rows.map(strip);
}

export async function getQuickFlag(tx: Tx, id: string, scope: ReviewScope): Promise<QuickFlag | undefined> {
  const [row] = await tx
    .select()
    .from(quickFlags)
    .where(and(eq(quickFlags.id, id), scopeWhere(scope, quickFlags)));
  return row ? strip(row) : undefined;
}

export async function addQuickFlag(tx: Tx, flag: NewQuickFlag): Promise<string> {
  const [row] = await tx
    .insert(quickFlags)
    .values({ companyId: thisCompany, ...flag })
    .returning({ id: quickFlags.id });
  if (!row) throw new Error('The flag was not saved.');
  return row.id;
}

export async function updateQuickFlag(tx: Tx, id: string, change: QuickFlagChange): Promise<void> {
  await tx
    .update(quickFlags)
    .set({ ...change, updatedAt: sql`now()` })
    .where(eq(quickFlags.id, id));
}

export async function deleteQuickFlag(tx: Tx, id: string): Promise<void> {
  await tx.delete(quickFlags).where(eq(quickFlags.id, id));
}
