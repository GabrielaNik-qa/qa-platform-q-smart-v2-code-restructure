// Learning › Newsletter, always behind the company wall (inside withCompany).
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { type NewsletterItem, newsletterReads, newsletters } from './schema.js';

const thisCompany = sql<string>`app_company()`;

export interface Newsletter {
  id: string;
  month: string;
  title: string;
  intro: string;
  published: boolean;
  items: NewsletterItem[];
  byName: string;
  createdAt: Date;
  updatedAt: Date;
}
export type NewsletterInput = Pick<Newsletter, 'month' | 'title' | 'intro' | 'published' | 'items'>;

const issueOf = ({ companyId: _c, ...n }: typeof newsletters.$inferSelect): Newsletter => n;

export async function listNewsletters(tx: Tx): Promise<Newsletter[]> {
  return (await tx.select().from(newsletters).orderBy(desc(newsletters.month), desc(newsletters.createdAt))).map(
    issueOf,
  );
}
export async function getNewsletter(tx: Tx, id: string): Promise<Newsletter | undefined> {
  const [row] = await tx.select().from(newsletters).where(eq(newsletters.id, id));
  return row && issueOf(row);
}
export async function addNewsletter(tx: Tx, v: NewsletterInput, byName: string): Promise<string> {
  const [row] = await tx
    .insert(newsletters)
    .values({ ...v, companyId: thisCompany, byName })
    .returning({ id: newsletters.id });
  if (!row) throw new Error('newsletter not saved');
  return row.id;
}
export async function updateNewsletter(tx: Tx, id: string, v: NewsletterInput): Promise<boolean> {
  const done = await tx
    .update(newsletters)
    .set({ ...v, updatedAt: sql`now()` })
    .where(eq(newsletters.id, id))
    .returning({ id: newsletters.id });
  return done.length > 0;
}
export async function deleteNewsletter(tx: Tx, id: string): Promise<boolean> {
  const done = await tx.delete(newsletters).where(eq(newsletters.id, id)).returning({ id: newsletters.id });
  return done.length > 0;
}

/** The newsletters this person has read. */
export async function myNewsletterReads(tx: Tx, membershipId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: newsletterReads.newsletterId })
    .from(newsletterReads)
    .where(eq(newsletterReads.membershipId, membershipId));
  return rows.map((r) => r.id);
}
export async function setNewsletterRead(
  tx: Tx,
  membershipId: string,
  newsletterId: string,
  read: boolean,
): Promise<void> {
  if (read)
    await tx
      .insert(newsletterReads)
      .values({ companyId: thisCompany, membershipId, newsletterId })
      .onConflictDoNothing();
  else
    await tx
      .delete(newsletterReads)
      .where(
        and(eq(newsletterReads.membershipId, membershipId), inArray(newsletterReads.newsletterId, [newsletterId])),
      );
}
