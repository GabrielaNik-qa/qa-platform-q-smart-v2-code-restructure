// Help inside the app and the script builder (Phase 6, piece 4), always behind the company wall (inside withCompany).
import { asc, eq, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { type HelpStepRow, helpItems } from './schema.js';

const thisCompany = sql<string>`app_company()`;

export interface HelpItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  topic: string;
  link: string;
  minutes: number | null;
  role: string;
  page: string;
  steps: HelpStepRow[];
  byName: string;
  createdAt: Date;
  updatedAt: Date;
}
export type HelpInput = Pick<
  HelpItem,
  'kind' | 'title' | 'body' | 'topic' | 'link' | 'minutes' | 'role' | 'page' | 'steps'
>;

const itemOf = ({ companyId: _c, ...x }: typeof helpItems.$inferSelect): HelpItem => x;

export async function listHelp(tx: Tx): Promise<HelpItem[]> {
  return (await tx.select().from(helpItems).orderBy(asc(helpItems.createdAt))).map(itemOf);
}
export async function getHelp(tx: Tx, id: string): Promise<HelpItem | undefined> {
  const [row] = await tx.select().from(helpItems).where(eq(helpItems.id, id));
  return row && itemOf(row);
}
export async function addHelp(tx: Tx, v: HelpInput, byName: string): Promise<string> {
  const [row] = await tx
    .insert(helpItems)
    .values({ ...v, companyId: thisCompany, byName })
    .returning({ id: helpItems.id });
  if (!row) throw new Error('help item not saved');
  return row.id;
}
/** The kind never changes. */
export async function updateHelp(tx: Tx, id: string, v: Omit<HelpInput, 'kind'>): Promise<boolean> {
  const done = await tx
    .update(helpItems)
    .set({ ...v, updatedAt: sql`now()` })
    .where(eq(helpItems.id, id))
    .returning({ id: helpItems.id });
  return done.length > 0;
}
export async function deleteHelp(tx: Tx, id: string): Promise<boolean> {
  const done = await tx.delete(helpItems).where(eq(helpItems.id, id)).returning({ id: helpItems.id });
  return done.length > 0;
}
