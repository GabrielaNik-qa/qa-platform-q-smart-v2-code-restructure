// Learning › Newsletter (Phase 6, piece 3; today's monthly newsletter): a short update for a month, with an introduction
// and items that can link to Knowledge Base articles. Staff (admins, reviewers, team leads, trainers) write it; a draft is
// seen by staff only; publishing tells everybody once (the bell). Everyone can mark an issue as read.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  addNewsletter,
  type Db,
  deleteNewsletter,
  getNewsletter,
  listKbArticles,
  listKbFolders,
  listNewsletters,
  listPeople,
  logActivity,
  type Membership,
  membershipOfUser,
  myNewsletterReads,
  type Newsletter,
  notify,
  setNewsletterRead,
  type Tx,
  updateNewsletter,
  withCompany,
} from '@qsmart/db';
import { can, folderSeen, type KbViewer } from '@qsmart/shared';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership } from './decorators.js';
import { badRequest, forbidden, notFound } from './errors.js';
import { DB } from './tokens.js';

const id = z.uuid();
const issueInput = z
  .object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    title: z.string().trim().min(1).max(150),
    intro: z.string().trim().max(3000).default(''),
    published: z.boolean().default(false),
    items: z
      .array(
        z.object({
          title: z.string().trim().max(150).default(''),
          text: z.string().trim().max(2000).default(''),
          articleId: z.uuid().nullable().default(null),
        }),
      )
      .max(40)
      .default([]),
  })
  .strict();

async function viewerOf(tx: Tx, membership: Membership) {
  const me = await membershipOfUser(tx, membership.userId);
  const staff = can(membership.role, 'learning.write');
  return { me, staff, viewer: { staff, teamId: me?.teamId ?? null } satisfies KbViewer };
}

/** Tells everybody a newsletter is out (not the one who published it). */
async function tellEveryone(tx: Tx, issue: Newsletter, byName: string, bySelf: string | null) {
  for (const p of await listPeople(tx))
    if (p.active && p.membershipId !== bySelf)
      await notify(
        tx,
        p.membershipId,
        'newsletterPublished',
        { name: byName, title: issue.title.slice(0, 80) },
        '/learning/newsletter',
      );
}

@Controller('newsletters')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class NewslettersController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Staff: every issue. Everyone else: the published ones, with links only to articles they may open. */
  @Get()
  @Allow('learning.read')
  list(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { me, staff, viewer } = await viewerOf(tx, membership);
      const all = await listNewsletters(tx);
      let issues = all;
      if (!staff) {
        const folders = (await listKbFolders(tx)).map((f) => ({
          id: f.id,
          parentId: f.parentId,
          teams: f.teams,
          reqOn: f.reqOn,
          reqTeams: f.reqTeams,
        }));
        const visible = new Set(
          (await listKbArticles(tx)).filter((a) => folderSeen(folders, a.folderId, viewer)).map((a) => a.id),
        );
        issues = all
          .filter((n) => n.published)
          .map((n) => ({
            ...n,
            items: n.items.map((i) => ({
              ...i,
              articleId: i.articleId && visible.has(i.articleId) ? i.articleId : null,
            })),
          }));
      }
      return { staff, newsletters: issues, reads: me ? await myNewsletterReads(tx, me.id) : [] };
    });
  }

  private async clean(tx: Tx, input: z.infer<typeof issueInput>) {
    const articles = new Set((await listKbArticles(tx)).map((a) => a.id));
    return {
      ...input,
      items: input.items
        .filter((i) => i.title || i.text)
        .map((i) => ({ ...i, articleId: i.articleId && articles.has(i.articleId) ? i.articleId : null })),
    };
  }

  @Post()
  @Allow('learning.write')
  async add(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = issueInput.safeParse(body);
    if (!input.success) throw badRequest('newsletterInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const saved = await this.clean(tx, input.data);
      const issueId = await addNewsletter(tx, saved, membership.userName);
      const issue = await getNewsletter(tx, issueId);
      const me = await membershipOfUser(tx, membership.userId);
      if (issue?.published) await tellEveryone(tx, issue, membership.userName, me?.id ?? null);
      await logActivity(tx, actorOf(membership), { action: 'newsletterAdded', targetName: saved.title });
      return { id: issueId };
    });
  }

  @Put(':id')
  @Allow('learning.write')
  async change(@CurrentMembership() membership: Membership, @Param('id') issueId: string, @Body() body: unknown) {
    const input = issueInput.safeParse(body);
    if (!input.success || !id.safeParse(issueId).success) throw badRequest('newsletterInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const before = await getNewsletter(tx, issueId);
      if (!before) throw notFound('newsletterNotFound');
      const saved = await this.clean(tx, input.data);
      await updateNewsletter(tx, issueId, saved);
      const issue = await getNewsletter(tx, issueId);
      const me = await membershipOfUser(tx, membership.userId);
      if (issue && !before.published && issue.published)
        await tellEveryone(tx, issue, membership.userName, me?.id ?? null);
      await logActivity(tx, actorOf(membership), { action: 'newsletterChanged', targetName: saved.title });
      return { id: issueId };
    });
  }

  @Delete(':id')
  @Allow('learning.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') issueId: string) {
    if (!id.safeParse(issueId).success) throw notFound('newsletterNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const issue = await getNewsletter(tx, issueId);
      if (!issue) throw notFound('newsletterNotFound');
      await deleteNewsletter(tx, issueId);
      await logActivity(tx, actorOf(membership), { action: 'newsletterDeleted', targetName: issue.title });
    });
  }

  @Post(':id/read')
  @Allow('learning.read')
  @HttpCode(200)
  async read(@CurrentMembership() membership: Membership, @Param('id') issueId: string, @Body() body: unknown) {
    const input = z
      .object({ read: z.boolean().default(true) })
      .strict()
      .safeParse(body);
    if (!input.success || !id.safeParse(issueId).success) throw badRequest('newsletterInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { me, staff } = await viewerOf(tx, membership);
      const issue = await getNewsletter(tx, issueId);
      if (!issue || (!issue.published && !staff)) throw notFound('newsletterNotFound');
      if (!me) throw forbidden('notAllowed');
      await setNewsletterRead(tx, me.id, issueId, input.data.read);
      return { ok: true };
    });
  }
}
