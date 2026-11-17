// Learning › Knowledge Base, always behind the company wall (inside withCompany). Who may see or change what is decided
// by the server (staff change, everyone reads what is open to their team); the rules are in @qsmart/shared.
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { type KbComment, kbArticles, kbAttempts, kbFolders, type KbQuiz, kbReads, kbStars } from './schema.js';

const thisCompany = sql<string>`app_company()`;

export interface KbFolder {
  id: string;
  parentId: string | null;
  name: string;
  colour: string;
  icon: string;
  description: string;
  reqOn: boolean;
  reqTeams: string[];
  teams: string[];
  byName: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface KbArticle {
  id: string;
  folderId: string | null;
  title: string;
  emoji: string;
  topics: string[];
  body: string;
  reqOn: boolean;
  reqTeams: string[];
  quiz: KbQuiz | null;
  reactions: Record<string, string[]>;
  comments: KbComment[];
  authorId: string | null;
  authorName: string;
  editorName: string;
  createdAt: Date;
  updatedAt: Date;
}
export type KbFolderInput = Pick<
  KbFolder,
  'parentId' | 'name' | 'colour' | 'icon' | 'description' | 'reqOn' | 'reqTeams' | 'teams'
>;
export type KbArticleInput = Pick<
  KbArticle,
  'folderId' | 'title' | 'emoji' | 'topics' | 'body' | 'reqOn' | 'reqTeams' | 'quiz'
>;

const folderOf = ({ companyId: _c, ...f }: typeof kbFolders.$inferSelect): KbFolder => f;
const articleOf = ({ companyId: _c, ...a }: typeof kbArticles.$inferSelect): KbArticle => a;

export async function listKbFolders(tx: Tx): Promise<KbFolder[]> {
  return (await tx.select().from(kbFolders).orderBy(asc(kbFolders.name))).map(folderOf);
}
export async function listKbArticles(tx: Tx): Promise<KbArticle[]> {
  return (await tx.select().from(kbArticles).orderBy(asc(kbArticles.title))).map(articleOf);
}
export async function getKbArticle(tx: Tx, id: string): Promise<KbArticle | undefined> {
  const [row] = await tx.select().from(kbArticles).where(eq(kbArticles.id, id));
  return row && articleOf(row);
}

export async function addKbFolder(tx: Tx, v: KbFolderInput, byName: string): Promise<string> {
  const [row] = await tx
    .insert(kbFolders)
    .values({ ...v, companyId: thisCompany, byName })
    .returning({ id: kbFolders.id });
  if (!row) throw new Error('folder not saved');
  return row.id;
}
export async function updateKbFolder(tx: Tx, id: string, v: KbFolderInput): Promise<boolean> {
  const done = await tx
    .update(kbFolders)
    .set({ ...v, updatedAt: sql`now()` })
    .where(eq(kbFolders.id, id))
    .returning({ id: kbFolders.id });
  return done.length > 0;
}
/**
 * Deletes a folder. "move": what is inside moves up one level (to the folder's own parent); "cascade": everything inside
 * it goes too (the database removes it, with the reads, stars and tries of the articles).
 */
export async function deleteKbFolder(tx: Tx, id: string, mode: 'move' | 'cascade'): Promise<boolean> {
  const [folder] = await tx.select({ parentId: kbFolders.parentId }).from(kbFolders).where(eq(kbFolders.id, id));
  if (!folder) return false;
  if (mode === 'move') {
    await tx.update(kbFolders).set({ parentId: folder.parentId }).where(eq(kbFolders.parentId, id));
    await tx.update(kbArticles).set({ folderId: folder.parentId }).where(eq(kbArticles.folderId, id));
  }
  await tx.delete(kbFolders).where(eq(kbFolders.id, id));
  return true;
}

export async function addKbArticle(
  tx: Tx,
  v: KbArticleInput,
  author: { id: string | null; name: string },
): Promise<string> {
  const [row] = await tx
    .insert(kbArticles)
    .values({ ...v, companyId: thisCompany, authorId: author.id, authorName: author.name })
    .returning({ id: kbArticles.id });
  if (!row) throw new Error('article not saved');
  return row.id;
}
export async function updateKbArticle(tx: Tx, id: string, v: KbArticleInput, editorName: string): Promise<boolean> {
  const done = await tx
    .update(kbArticles)
    .set({ ...v, editorName, updatedAt: sql`now()` })
    .where(eq(kbArticles.id, id))
    .returning({ id: kbArticles.id });
  return done.length > 0;
}
export async function deleteKbArticle(tx: Tx, id: string): Promise<boolean> {
  const done = await tx.delete(kbArticles).where(eq(kbArticles.id, id)).returning({ id: kbArticles.id });
  return done.length > 0;
}
export async function setKbReactions(tx: Tx, id: string, reactions: Record<string, string[]>): Promise<void> {
  await tx.update(kbArticles).set({ reactions }).where(eq(kbArticles.id, id));
}
export async function setKbComments(tx: Tx, id: string, comments: KbComment[]): Promise<void> {
  await tx.update(kbArticles).set({ comments }).where(eq(kbArticles.id, id));
}

export interface KbMine {
  /** article id → when it was read */
  reads: Record<string, string>;
  stars: string[];
  attempts: { articleId: string; score: number; passed: boolean; at: Date }[];
}
/** One person's reading: what they read, starred and passed. */
export async function myKbState(tx: Tx, membershipId: string): Promise<KbMine> {
  const reads = await tx
    .select({ articleId: kbReads.articleId, readAt: kbReads.readAt })
    .from(kbReads)
    .where(eq(kbReads.membershipId, membershipId));
  const stars = await tx
    .select({ articleId: kbStars.articleId })
    .from(kbStars)
    .where(eq(kbStars.membershipId, membershipId));
  const attempts = await tx
    .select({
      articleId: kbAttempts.articleId,
      score: kbAttempts.score,
      passed: kbAttempts.passed,
      at: kbAttempts.at,
    })
    .from(kbAttempts)
    .where(eq(kbAttempts.membershipId, membershipId))
    .orderBy(asc(kbAttempts.at));
  return {
    reads: Object.fromEntries(reads.map((r) => [r.articleId, r.readAt.toISOString()])),
    stars: stars.map((s) => s.articleId),
    attempts,
  };
}

/** Marks articles read (or unread) for one person. */
export async function setKbRead(tx: Tx, membershipId: string, articleIds: string[], read: boolean): Promise<void> {
  if (!articleIds.length) return;
  if (read)
    await tx
      .insert(kbReads)
      .values(articleIds.map((articleId) => ({ companyId: thisCompany, membershipId, articleId })))
      .onConflictDoNothing();
  else
    await tx.delete(kbReads).where(and(eq(kbReads.membershipId, membershipId), inArray(kbReads.articleId, articleIds)));
}
export async function setKbStar(tx: Tx, membershipId: string, articleId: string, on: boolean): Promise<void> {
  if (on) await tx.insert(kbStars).values({ companyId: thisCompany, membershipId, articleId }).onConflictDoNothing();
  else await tx.delete(kbStars).where(and(eq(kbStars.membershipId, membershipId), eq(kbStars.articleId, articleId)));
}
export async function addKbAttempt(
  tx: Tx,
  membershipId: string,
  articleId: string,
  score: number,
  passed: boolean,
): Promise<void> {
  await tx.insert(kbAttempts).values({ companyId: thisCompany, membershipId, articleId, score, passed });
}
