// Learning › Knowledge Base (Phase 6, piece 1), with today's rules:
// - staff (admins, reviewers, team leads, trainers) write folders and articles and see everything; everyone reads;
// - a folder can be open to some teams only: an agent of another team never sees it, its sub-folders or its articles
//   (the server decides, so the pages never even receive them);
// - a folder or an article can be required reading, for some teams or all agents;
// - an article can end with a lesson test: the pass mark and the questions; agents receive the questions without the
//   right answers, and passing marks the article as read;
// - everyone can mark an article as read (or a whole folder), star it, react to it and comment on it; the author is
//   told about a comment.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  addKbArticle,
  addKbAttempt,
  addKbFolder,
  type Db,
  deleteKbArticle,
  deleteKbFolder,
  getKbArticle,
  type KbArticle,
  type KbFolder,
  listKbArticles,
  listKbFolders,
  listTeams,
  logActivity,
  type Membership,
  membershipOfUser,
  myKbState,
  notify,
  setKbComments,
  setKbRead,
  setKbReactions,
  setKbStar,
  type Tx,
  updateKbArticle,
  updateKbFolder,
  withCompany,
} from '@qsmart/db';
import { can, cleanQuestions, folderSeen, folderTree, gradeAnswers, KB_REACTIONS, type KbViewer } from '@qsmart/shared';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership } from './decorators.js';
import { badRequest, forbidden, notFound } from './errors.js';
import { DB } from './tokens.js';

const id = z.uuid();
const teamIds = z.array(z.uuid()).max(30);
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const folderInput = z
  .object({
    parentId: z.uuid().nullable().default(null),
    name: z.string().trim().min(1).max(60),
    colour: colour.default('#2563eb'),
    icon: z.string().trim().min(1).max(8).default('📁'),
    description: z.string().trim().max(400).default(''),
    reqOn: z.boolean().default(false),
    reqTeams: teamIds.default([]),
    teams: teamIds.default([]),
  })
  .strict();
const question = z.object({
  q: z.string().max(300),
  opts: z.array(z.string().max(200)).max(6),
  a: z.number().int().min(0).max(5),
  why: z.string().max(400).default(''),
});
const articleInput = z
  .object({
    folderId: z.uuid().nullable().default(null),
    title: z.string().trim().min(1).max(150),
    emoji: z.string().trim().max(8).default(''),
    topics: z
      .array(z.string().trim().min(1).max(40))
      .max(10)
      .transform((t) => [...new Set(t)])
      .default([]),
    body: z.string().max(200_000).default(''),
    reqOn: z.boolean().default(false),
    reqTeams: teamIds.default([]),
    quiz: z
      .object({ pass: z.number().int().min(1).max(100).default(80), questions: z.array(question).max(30) })
      .nullable()
      .default(null),
  })
  .strict();

/** Who is asking: staff see everything; an agent sees what is open to their team. */
async function viewerOf(tx: Tx, membership: Membership) {
  const me = await membershipOfUser(tx, membership.userId);
  const staff = can(membership.role, 'learning.write');
  const viewer: KbViewer = { staff, teamId: me?.teamId ?? null };
  return { me, staff, viewer };
}

/** The agents' copy of a lesson test: the questions and options, never the right answers. */
const forReader = (a: KbArticle, staff: boolean): KbArticle =>
  staff || !a.quiz
    ? a
    : {
        ...a,
        quiz: { pass: a.quiz.pass, questions: a.quiz.questions.map((x) => ({ q: x.q, opts: x.opts, a: -1, why: '' })) },
      };

const facts = (f: KbFolder) => ({
  id: f.id,
  parentId: f.parentId,
  teams: f.teams,
  reqOn: f.reqOn,
  reqTeams: f.reqTeams,
});

/** An article the person may open (a missing or hidden one is "not found"). */
async function openArticle(tx: Tx, membership: Membership, articleId: string) {
  const who = await viewerOf(tx, membership);
  const article = id.safeParse(articleId).success ? await getKbArticle(tx, articleId) : undefined;
  if (!article) throw notFound('kbArticleNotFound');
  const folders = (await listKbFolders(tx)).map(facts);
  if (!folderSeen(folders, article.folderId, who.viewer)) throw notFound('kbArticleNotFound');
  return { ...who, article, folders };
}

@Controller('kb')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class KnowledgeController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Everything the page needs: the folders and articles this person may see, and their own reading. */
  @Get()
  @Allow('learning.read')
  list(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { me, staff, viewer } = await viewerOf(tx, membership);
      const allFolders = await listKbFolders(tx);
      const folders = allFolders.filter((f) => folderSeen(allFolders.map(facts), f.id, viewer));
      const articles = (await listKbArticles(tx))
        .filter((a) => folderSeen(allFolders.map(facts), a.folderId, viewer))
        .map((a) => forReader(a, staff));
      const mine = me ? await myKbState(tx, me.id) : { reads: {}, stars: [], attempts: [] };
      return { folders, articles, me: { id: me?.id ?? null, teamId: viewer.teamId, staff }, ...mine };
    });
  }

  // ------------------------------------------------------------------------------------------ folders

  @Post('folders')
  @Allow('learning.write')
  async addFolder(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = folderInput.safeParse(body);
    if (!input.success) throw badRequest('kbInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const folders = await listKbFolders(tx);
      if (input.data.parentId && !folders.some((f) => f.id === input.data.parentId)) throw badRequest('kbInvalid');
      const known = new Set((await listTeams(tx)).map((t) => t.id));
      const saved = {
        ...input.data,
        reqTeams: input.data.reqTeams.filter((t) => known.has(t)),
        teams: input.data.teams.filter((t) => known.has(t)),
      };
      const folderId = await addKbFolder(tx, saved, membership.userName);
      await logActivity(tx, actorOf(membership), { action: 'kbFolderAdded', targetName: saved.name });
      return { id: folderId };
    });
  }

  @Put('folders/:id')
  @Allow('learning.write')
  async changeFolder(
    @CurrentMembership() membership: Membership,
    @Param('id') folderId: string,
    @Body() body: unknown,
  ) {
    const input = folderInput.safeParse(body);
    if (!input.success || !id.safeParse(folderId).success) throw badRequest('kbInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const folders = await listKbFolders(tx);
      if (!folders.some((f) => f.id === folderId)) throw notFound('kbFolderNotFound');
      const parent = input.data.parentId;
      if (parent && (!folders.some((f) => f.id === parent) || folderTree(folders, folderId).has(parent)))
        throw badRequest('kbLoop');
      const known = new Set((await listTeams(tx)).map((t) => t.id));
      await updateKbFolder(tx, folderId, {
        ...input.data,
        reqTeams: input.data.reqTeams.filter((t) => known.has(t)),
        teams: input.data.teams.filter((t) => known.has(t)),
      });
      await logActivity(tx, actorOf(membership), { action: 'kbFolderChanged', targetName: input.data.name });
      return { id: folderId };
    });
  }

  /** `?mode=cascade` deletes everything inside; otherwise the content moves up one level. */
  @Delete('folders/:id')
  @Allow('learning.write')
  @HttpCode(204)
  async removeFolder(
    @CurrentMembership() membership: Membership,
    @Param('id') folderId: string,
    @Query('mode') mode?: string,
  ) {
    if (!id.safeParse(folderId).success) throw notFound('kbFolderNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const folder = (await listKbFolders(tx)).find((f) => f.id === folderId);
      if (!folder) throw notFound('kbFolderNotFound');
      await deleteKbFolder(tx, folderId, mode === 'cascade' ? 'cascade' : 'move');
      await logActivity(tx, actorOf(membership), { action: 'kbFolderDeleted', targetName: folder.name });
    });
  }

  // ------------------------------------------------------------------------------------------ articles

  private async checkArticle(tx: Tx, input: z.infer<typeof articleInput>) {
    if (input.folderId && !(await listKbFolders(tx)).some((f) => f.id === input.folderId))
      throw badRequest('kbInvalid');
    const known = new Set((await listTeams(tx)).map((t) => t.id));
    const questions = input.quiz ? cleanQuestions(input.quiz.questions) : [];
    return {
      folderId: input.folderId,
      title: input.title,
      emoji: input.emoji,
      topics: input.topics,
      body: input.body,
      reqOn: input.reqOn,
      reqTeams: input.reqTeams.filter((t) => known.has(t)),
      quiz: input.quiz && questions.length ? { pass: input.quiz.pass, questions } : null,
    };
  }

  @Post('articles')
  @Allow('learning.write')
  async addArticle(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = articleInput.safeParse(body);
    if (!input.success) throw badRequest('kbInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const me = await membershipOfUser(tx, membership.userId);
      const articleId = await addKbArticle(tx, await this.checkArticle(tx, input.data), {
        id: me?.id ?? null,
        name: membership.userName,
      });
      await logActivity(tx, actorOf(membership), { action: 'kbArticleAdded', targetName: input.data.title });
      return { id: articleId };
    });
  }

  @Put('articles/:id')
  @Allow('learning.write')
  async changeArticle(
    @CurrentMembership() membership: Membership,
    @Param('id') articleId: string,
    @Body() body: unknown,
  ) {
    const input = articleInput.safeParse(body);
    if (!input.success || !id.safeParse(articleId).success) throw badRequest('kbInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      if (!(await getKbArticle(tx, articleId))) throw notFound('kbArticleNotFound');
      await updateKbArticle(tx, articleId, await this.checkArticle(tx, input.data), membership.userName);
      await logActivity(tx, actorOf(membership), { action: 'kbArticleChanged', targetName: input.data.title });
      return { id: articleId };
    });
  }

  @Delete('articles/:id')
  @Allow('learning.write')
  @HttpCode(204)
  async removeArticle(@CurrentMembership() membership: Membership, @Param('id') articleId: string) {
    if (!id.safeParse(articleId).success) throw notFound('kbArticleNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const article = await getKbArticle(tx, articleId);
      if (!article) throw notFound('kbArticleNotFound');
      await deleteKbArticle(tx, articleId);
      await logActivity(tx, actorOf(membership), { action: 'kbArticleDeleted', targetName: article.title });
    });
  }

  // ------------------------------------------------------------------------------------------ reactions, comments, stars

  @Post('articles/:id/react')
  @Allow('learning.read')
  async react(@CurrentMembership() membership: Membership, @Param('id') articleId: string, @Body() body: unknown) {
    const input = z
      .object({ e: z.enum(KB_REACTIONS) })
      .strict()
      .safeParse(body);
    if (!input.success) throw badRequest('kbInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { me, article } = await openArticle(tx, membership, articleId);
      if (!me) throw forbidden('notAllowed');
      const people = new Set(article.reactions[input.data.e] ?? []);
      if (!people.delete(me.id)) people.add(me.id);
      const others = Object.entries(article.reactions).filter(([e]) => e !== input.data.e);
      const reactions = Object.fromEntries(people.size ? [...others, [input.data.e, [...people]]] : others);
      await setKbReactions(tx, articleId, reactions);
      return { reactions };
    });
  }

  @Post('articles/:id/comments')
  @Allow('learning.read')
  async comment(@CurrentMembership() membership: Membership, @Param('id') articleId: string, @Body() body: unknown) {
    const input = z
      .object({ t: z.string().trim().min(1).max(2000) })
      .strict()
      .safeParse(body);
    if (!input.success) throw badRequest('kbCommentEmpty');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { me, article } = await openArticle(tx, membership, articleId);
      const comments = [
        ...article.comments,
        {
          id: randomUUID(),
          byId: me?.id ?? null,
          name: membership.userName,
          text: input.data.t,
          at: new Date().toISOString(),
        },
      ].slice(-200);
      await setKbComments(tx, articleId, comments);
      if (article.authorId && article.authorId !== me?.id)
        await notify(
          tx,
          article.authorId,
          'kbComment',
          { name: membership.userName, title: article.title.slice(0, 80), text: input.data.t.slice(0, 70) },
          `/learning/knowledge-base?article=${articleId}`,
        );
      return { comments };
    });
  }

  /** Its writer removes a comment, and staff remove any. */
  @Delete('articles/:id/comments/:commentId')
  @Allow('learning.read')
  async removeComment(
    @CurrentMembership() membership: Membership,
    @Param('id') articleId: string,
    @Param('commentId') commentId: string,
  ) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { me, staff, article } = await openArticle(tx, membership, articleId);
      const found = article.comments.find((c) => c.id === commentId);
      if (!found) throw notFound('kbArticleNotFound');
      if (!staff && (!me || found.byId !== me.id)) throw forbidden('notAllowed');
      const comments = article.comments.filter((c) => c !== found);
      await setKbComments(tx, articleId, comments);
      return { comments };
    });
  }

  @Post('star')
  @Allow('learning.read')
  @HttpCode(200)
  async star(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = z
      .object({ id, on: z.boolean().default(true) })
      .strict()
      .safeParse(body);
    if (!input.success) throw badRequest('kbInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { me } = await openArticle(tx, membership, input.data.id);
      if (!me) throw forbidden('notAllowed');
      await setKbStar(tx, me.id, input.data.id, input.data.on);
      return { stars: (await myKbState(tx, me.id)).stars };
    });
  }

  // ------------------------------------------------------------------------------------------ reading and lesson tests

  @Post('read')
  @Allow('learning.read')
  @HttpCode(200)
  async read(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = z
      .object({ id, read: z.boolean().default(true) })
      .strict()
      .safeParse(body);
    if (!input.success) throw badRequest('kbInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { me } = await openArticle(tx, membership, input.data.id);
      if (!me) throw forbidden('notAllowed');
      await setKbRead(tx, me.id, [input.data.id], input.data.read);
      return { ok: true };
    });
  }

  /** Marks everything in a folder (and below it) that this person can see as read, or as unread. */
  @Post('read-folder')
  @Allow('learning.read')
  @HttpCode(200)
  async readFolder(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = z
      .object({ id, read: z.boolean().default(true) })
      .strict()
      .safeParse(body);
    if (!input.success) throw badRequest('kbInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { me, viewer } = await viewerOf(tx, membership);
      const folders = await listKbFolders(tx);
      if (!me || !folders.some((f) => f.id === input.data.id) || !folderSeen(folders.map(facts), input.data.id, viewer))
        throw notFound('kbFolderNotFound');
      const inside = folderTree(folders, input.data.id);
      const ids = (await listKbArticles(tx)).filter((a) => a.folderId && inside.has(a.folderId)).map((a) => a.id);
      await setKbRead(tx, me.id, ids, input.data.read);
      return { count: ids.length };
    });
  }

  /** Takes the lesson test: the score, whether it passed, and for each question the right answer and why. */
  @Post('articles/:id/test')
  @Allow('learning.read')
  @HttpCode(200)
  async test(@CurrentMembership() membership: Membership, @Param('id') articleId: string, @Body() body: unknown) {
    const input = z
      .object({ answers: z.array(z.number().int().min(0).max(5).nullable()).max(30) })
      .strict()
      .safeParse(body);
    if (!input.success) throw badRequest('kbInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { me, article } = await openArticle(tx, membership, articleId);
      if (!me) throw forbidden('notAllowed');
      if (!article.quiz) throw notFound('kbNoTest');
      const graded = gradeAnswers(article.quiz.questions, input.data.answers);
      const passed = graded.score >= article.quiz.pass;
      await addKbAttempt(tx, me.id, articleId, graded.score, passed);
      if (passed) await setKbRead(tx, me.id, [articleId], true);
      return { score: graded.score, passed, pass: article.quiz.pass, results: graded.results };
    });
  }
}
