// Disputes, with today's rules:
// - an agent disputes their own review, once, with a reason; the review then shows as "disputed";
// - the agent, admins and the reviewers of the agent's workspaces write in its conversation while it is open (team
//   leads and trainers read it, as they read the review);
// - an admin or reviewer resolves it: score kept, changed or partly changed (the agent was right about some points),
//   with an optional closing note; changing the score itself is done with Edit, as today;
// - the other side is told of each step in the bell, and opening and resolving go into the activity log.
// - AI reviews (Phase 3b) are disputed the same way, and an agent can also mark single answers "not what I said": the
//   first mark opens the dispute, and the person who resolves it decides each marked answer (counted in AutoQA's
//   accuracy score).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import {
  type Author,
  type Db,
  type Dispute,
  DisputeExists,
  disputeOfReview,
  getReview,
  listDisputes,
  listPeople,
  listWorkspaces,
  logActivity,
  markAnswer,
  type Membership,
  membershipOfUser,
  notify,
  openDispute,
  resolveDispute,
  type Review,
  type Tx,
  withCompany,
  writeInDispute,
} from '@qsmart/db';
import type { Scope } from '@qsmart/shared';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, CurrentScope } from './decorators.js';
import { badRequest, notFound } from './errors.js';
import { reachOf } from './reviews.controller.js';
import { DB } from './tokens.js';

const idParam = z.uuid();
const text = z.object({ text: z.string().trim().min(1).max(1000) });
const answer = z.enum(['y', 'n', 'na']);
const place = { ci: z.number().int().min(0).max(99), qi: z.number().int().min(0).max(99) };
const resolution = z.object({
  outcome: z.enum(['kept', 'changed', 'partly']),
  note: z.string().trim().max(500).default(''),
  /** the person's decision on each answer the agent marked "not what I said" */
  marks: z
    .array(z.object({ ...place, right: answer }))
    .max(50)
    .default([]),
});
const marking = z.object({ ...place, text: z.string().trim().min(1).max(1000) });

/** The dispute as a person sees it: which messages are their own. */
const asSeenBy = (dispute: Dispute, me: string | undefined) => ({
  ...dispute,
  messages: dispute.messages.map((m) => ({ ...m, mine: Boolean(me && m.authorId === me) })),
});

/**
 * Who answers a dispute: the active admins, and the active reviewers who reach the agent's team (all of them while the
 * company has no workspaces), as today's "QA team".
 */
async function staffFor(tx: Tx, teamId: string | null): Promise<string[]> {
  const people = await listPeople(tx);
  const workspaces = await listWorkspaces(tx);
  const reaching = new Set(workspaces.filter((w) => teamId && w.teamIds.includes(teamId)).map((w) => w.id));
  return people
    .filter(
      (p) =>
        p.active &&
        (p.role === 'admin' ||
          (p.role === 'reviewer' && (!workspaces.length || p.workspaceIds.some((w) => reaching.has(w))))),
    )
    .map((p) => p.membershipId);
}

@Controller('disputes')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class DisputesController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Quality › Disputes: the disputes of the reviews the person may see. */
  @Get()
  @Allow('reviews.read')
  list(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const me = (await membershipOfUser(tx, membership.userId))?.id;
      return (await listDisputes(tx, await reachOf(tx, membership, scope))).map((d) => asSeenBy(d, me));
    });
  }

  /** The dispute of a review, or null when it has none. */
  @Get(':reviewId')
  @Allow('reviews.read')
  async one(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Param('reviewId') id: string) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const review = await this.review(tx, membership, scope, id);
      const dispute = await disputeOfReview(tx, review.id);
      const me = (await membershipOfUser(tx, membership.userId))?.id;
      return dispute ? asSeenBy(dispute, me) : null;
    });
  }

  /** The agent disputes their own review (once). */
  @Post(':reviewId')
  @Allow('disputes.open')
  async open(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('reviewId') id: string,
    @Body() body: unknown,
  ) {
    const input = text.safeParse(body);
    if (!input.success) throw badRequest('disputeReason');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const review = await this.review(tx, membership, scope, id);
      const author = await this.author(tx, membership);
      try {
        await openDispute(tx, review.id, author, input.data.text);
      } catch (error) {
        if (error instanceof DisputeExists) throw badRequest('disputeExists');
        throw error;
      }
      for (const to of await staffFor(tx, review.teamId))
        await notify(tx, to, 'disputeOpened', { name: author.name, lead: review.leadId }, `/review/${review.id}`);
      await logActivity(tx, actorOf(membership), {
        action: 'disputeOpened',
        targetName: review.agentName,
        details: { lead: review.leadId },
      });
      return this.seen(tx, review.id, author.membershipId);
    });
  }

  /**
   * "Not what I said": the agent marks one answer of their AI review, with what they actually said or did. The first
   * mark opens the review's dispute; later ones join it while it is open. A person then decides each marked answer.
   */
  @Post(':reviewId/marks')
  @Allow('disputes.open')
  async mark(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('reviewId') id: string,
    @Body() body: unknown,
  ) {
    const input = marking.safeParse(body);
    if (!input.success) throw badRequest('disputeReason');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const review = await this.review(tx, membership, scope, id);
      if (review.source !== 'ai') throw badRequest('notAiReview');
      const { ci, qi, text: reason } = input.data;
      const category = review.categories[ci];
      const question = category?.questions[qi];
      if (!category || !question) throw badRequest('markInvalid');
      const author = await this.author(tx, membership);
      const before = await disputeOfReview(tx, review.id);
      const mark = { ci, qi, category: category.name, question: question.text, ai: question.answer, right: null };
      if (!(await markAnswer(tx, review.id, author, mark, reason))) throw badRequest('disputeClosed');
      const details = { name: author.name, lead: review.leadId, text: `${question.text}: ${reason}`.slice(0, 70) };
      for (const to of await staffFor(tx, review.teamId))
        await notify(tx, to, before ? 'disputeMessage' : 'disputeOpened', details, `/review/${review.id}`);
      if (!before)
        await logActivity(tx, actorOf(membership), {
          action: 'disputeOpened',
          targetName: review.agentName,
          details: { lead: review.leadId },
        });
      return this.seen(tx, review.id, author.membershipId);
    });
  }

  /** A message in an open dispute, from the agent or from the staff who answer it. */
  @Post(':reviewId/messages')
  @Allow('disputes.write')
  async write(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('reviewId') id: string,
    @Body() body: unknown,
  ) {
    const input = text.safeParse(body);
    if (!input.success) throw badRequest('disputeMessage');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const review = await this.review(tx, membership, scope, id);
      const dispute = await this.openOne(tx, review.id);
      const author = await this.author(tx, membership);
      await writeInDispute(tx, dispute.id, author, input.data.text);
      const to =
        membership.role === 'agent' ? await staffFor(tx, review.teamId) : review.agentId ? [review.agentId] : [];
      const details = { name: author.name, lead: review.leadId, text: input.data.text.slice(0, 70) };
      for (const person of to.filter((p) => p !== author.membershipId))
        await notify(tx, person, 'disputeMessage', details, `/review/${review.id}`);
      return this.seen(tx, review.id, author.membershipId);
    });
  }

  /** An admin or reviewer resolves it; the agent is told. It cannot be reopened (today's rule). */
  @Post(':reviewId/resolve')
  @Allow('disputes.resolve')
  @HttpCode(200)
  async resolve(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('reviewId') id: string,
    @Body() body: unknown,
  ) {
    const input = resolution.safeParse(body);
    if (!input.success) throw badRequest('disputeResolveInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const review = await this.review(tx, membership, scope, id);
      const dispute = await this.openOne(tx, review.id);
      const author = await this.author(tx, membership);
      const { outcome, note } = input.data;
      // every answer the agent marked gets the person's decision (it also counts in AutoQA's accuracy score)
      const decided = dispute.marks.map((m) => {
        const right = input.data.marks.find((d) => d.ci === m.ci && d.qi === m.qi)?.right;
        return right ? { ...m, right } : null;
      });
      if (decided.some((m) => m === null)) throw badRequest('marksUndecided');
      const marks = dispute.marks.length ? decided.filter((m) => m !== null) : undefined;
      if (!(await resolveDispute(tx, dispute.id, author, outcome, note, marks))) throw badRequest('disputeClosed');
      if (review.agentId)
        await notify(tx, review.agentId, 'disputeResolved', { lead: review.leadId, outcome }, `/review/${review.id}`);
      await logActivity(tx, actorOf(membership), {
        action: 'disputeResolved',
        targetName: review.agentName,
        details: { lead: review.leadId, outcome },
      });
      return this.seen(tx, review.id, author.membershipId);
    });
  }

  /** The review, if the person reaches it with this right; otherwise "not found", as for any review. */
  private async review(tx: Tx, membership: Membership, scope: Scope, id: string): Promise<Review> {
    const target = idParam.safeParse(id);
    const review = target.success ? await getReview(tx, target.data, await reachOf(tx, membership, scope)) : undefined;
    if (!review) throw notFound('reviewNotFound');
    return review;
  }

  private async openOne(tx: Tx, reviewId: string): Promise<Dispute> {
    const dispute = await disputeOfReview(tx, reviewId);
    if (!dispute) throw notFound('disputeNotFound');
    if (dispute.state === 'resolved') throw badRequest('disputeClosed');
    return dispute;
  }

  private async author(tx: Tx, membership: Membership): Promise<Author> {
    const me = await membershipOfUser(tx, membership.userId);
    return { membershipId: me?.id ?? null, name: membership.userName, role: membership.role };
  }

  private async seen(tx: Tx, reviewId: string, me: string | null) {
    const dispute = await disputeOfReview(tx, reviewId);
    return dispute ? asSeenBy(dispute, me ?? undefined) : null;
  }
}
