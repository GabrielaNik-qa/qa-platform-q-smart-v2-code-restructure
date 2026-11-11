// Quick Flags, with today's rules: a red or green flag on a conversation, kept apart from QA reviews (scores never
// change). Admins, reviewers, team leads and trainers give, change and delete them for the agents of their workspaces
// (admins: all); agents read their own and are told of each new one. Recordings are never stored, only links.
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  addQuickFlag,
  type Db,
  deleteQuickFlag,
  getQuickFlag,
  listQuickFlags,
  listReviews,
  logActivity,
  type Membership,
  membershipOfUser,
  notify,
  type QuickFlag,
  type Review,
  updateQuickFlag,
  withCompany,
} from '@qsmart/db';
import { type Scope, scopeOf } from '@qsmart/shared';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, CurrentScope } from './decorators.js';
import { badRequest, notFound } from './errors.js';
import { type FlagRow, flagsWorkbook } from './excel.js';
import { logExport } from './exports-log.js';
import { agentFor, link, reachOf } from './reviews.controller.js';
import { DB } from './tokens.js';

const idParam = z.uuid();
const flagInput = z.object({
  type: z.enum(['red', 'green']),
  channel: z.enum(['call', 'chat', 'email', 'other']).default('call'),
  agentId: z.uuid(),
  leadId: z.string().trim().min(1).max(60),
  flaggedOn: z.iso.date(),
  campaign: z.string().trim().max(80).default(''),
  leadLink: link,
  conversationLink: link,
  comment: z.string().trim().max(1000).default(''),
});

@Controller('flags')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class FlagsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Staff: the flags of their workspaces' agents (admins all); agents: their own. */
  @Get()
  @Allow('flags.read')
  list(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope) {
    return withCompany(this.db, membership.companyId, async (tx) =>
      listQuickFlags(tx, await reachOf(tx, membership, scope)),
    );
  }

  @Post()
  @Allow('flags.write')
  async add(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Body() body: unknown) {
    const parsed = flagInput.safeParse(body);
    if (!parsed.success) throw badRequest('flagInvalid');
    const { agentId, ...input } = parsed.data;
    return withCompany(this.db, membership.companyId, async (tx) => {
      const reach = await reachOf(tx, membership, scope);
      const agent = await agentFor(tx, reach, agentId);
      const me = await membershipOfUser(tx, membership.userId);
      const id = await addQuickFlag(tx, {
        ...input,
        agentId: agent.id,
        agentName: agent.name,
        teamId: agent.teamId,
        teamName: agent.teamName,
        byId: me?.id ?? null,
        byName: membership.userName,
      });
      await notify(tx, agent.id, 'flagGiven', {
        name: membership.userName,
        type: input.type,
        lead: input.leadId,
        comment: input.comment.slice(0, 80),
      });
      await logActivity(tx, actorOf(membership), {
        action: 'flagAdded',
        targetName: agent.name,
        details: { lead: input.leadId, type: input.type },
      });
      return getQuickFlag(tx, id, { all: true });
    });
  }

  @Put(':id')
  @Allow('flags.write')
  async change(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const target = idParam.safeParse(id);
    const parsed = flagInput.safeParse(body);
    if (!target.success || !parsed.success) throw badRequest('flagInvalid');
    const { agentId, ...input } = parsed.data;
    return withCompany(this.db, membership.companyId, async (tx) => {
      const reach = await reachOf(tx, membership, scope);
      const flag = await getQuickFlag(tx, target.data, reach);
      if (!flag) throw notFound('flagNotFound');
      const agent =
        agentId === flag.agentId
          ? { id: flag.agentId, name: flag.agentName, teamId: flag.teamId, teamName: flag.teamName }
          : await agentFor(tx, reach, agentId);
      await updateQuickFlag(tx, flag.id, {
        ...input,
        agentId: agent.id,
        agentName: agent.name,
        teamId: agent.teamId,
        teamName: agent.teamName,
      });
      await logActivity(tx, actorOf(membership), {
        action: 'flagEdited',
        targetName: agent.name,
        details: { lead: input.leadId, type: input.type },
      });
      return getQuickFlag(tx, flag.id, { all: true });
    });
  }

  @Delete(':id')
  @Allow('flags.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('flagNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const flag = await getQuickFlag(tx, target.data, await reachOf(tx, membership, scope));
      if (!flag) throw notFound('flagNotFound');
      await deleteQuickFlag(tx, flag.id);
      await logActivity(tx, actorOf(membership), {
        action: 'flagDeleted',
        targetName: flag.agentName,
        details: { lead: flag.leadId, type: flag.type },
      });
    });
  }

  /**
   * Export (as today): the conversations of the page, in its order, each with its review and its quick flags, but only
   * what the person may see. Written in the activity log's "Exports & downloads".
   */
  @Post('export')
  @Allow('flags.write')
  @HttpCode(200)
  async export(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = z
      .object({
        rows: z
          .array(z.object({ reviewId: z.uuid().nullable().default(null), flagIds: z.array(z.uuid()).max(500) }))
          .min(1)
          .max(20000),
      })
      .safeParse(body);
    if (!input.success) throw badRequest('nothingToExport');
    const rows = await withCompany(this.db, membership.companyId, async (tx) => {
      const reviewScope = scopeOf(membership.role, 'reviews.read') ?? scope;
      const reviews = new Map<string, Review>(
        (await listReviews(tx, await reachOf(tx, membership, reviewScope))).map((r) => [r.id, r]),
      );
      const flags = new Map<string, QuickFlag>(
        (await listQuickFlags(tx, await reachOf(tx, membership, scope))).map((f) => [f.id, f]),
      );
      const picked: FlagRow[] = input.data.rows
        .map((r) => ({
          review: r.reviewId ? reviews.get(r.reviewId) : undefined,
          flags: r.flagIds.map((id) => flags.get(id)).filter((f): f is QuickFlag => Boolean(f)),
        }))
        .filter((r) => r.review || r.flags.length);
      await logActivity(tx, actorOf(membership), {
        action: 'exportFlags',
        targetName: 'Quick Flags',
        details: { rows: String(picked.length) },
      });
      await logExport(tx, membership, {
        kind: 'flags',
        name: 'Quick Flags',
        request: { rows: input.data.rows },
        rows: picked.length,
      });
      return picked;
    });
    const file = await flagsWorkbook(rows);
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header(
      'Content-Disposition',
      `attachment; filename="Quick_Flags_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    );
    return new StreamableFile(file);
  }
}
