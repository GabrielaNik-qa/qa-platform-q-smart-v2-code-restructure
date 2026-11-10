// Reviewer QA, with today's rules: admins, reviewers and team leads check reviews made by someone else with four yes/no
// questions (the score is fair, it follows the scorecard, the critical items are right, the comment helps the agent)
// and a note. Staff read the checks of their workspaces (admins: all). A reviewer's score is the share of "yes".
// New in v2: nobody checks, changes or deletes a check of their own review.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  addReviewerCheck,
  type Db,
  deleteReviewerCheck,
  getReview,
  getReviewerCheck,
  listReviewerChecks,
  logActivity,
  type Membership,
  membershipOfUser,
  type Tx,
  updateReviewerCheck,
  withCompany,
} from '@qsmart/db';
import type { Scope } from '@qsmart/shared';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, CurrentScope } from './decorators.js';
import { badRequest, forbidden, notFound } from './errors.js';
import { reachOf } from './reviews.controller.js';
import { DB } from './tokens.js';

const idParam = z.uuid();
const answers = z.object({
  fair: z.boolean(),
  follows: z.boolean(),
  critical: z.boolean(),
  useful: z.boolean(),
  note: z.string().trim().max(2000).default(''),
});
const newCheck = answers.extend({ reviewId: z.uuid() });

@Controller('reviewer-checks')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class ReviewerChecksController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('reviewerQa.read')
  list(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope) {
    return withCompany(this.db, membership.companyId, async (tx) =>
      listReviewerChecks(tx, await reachOf(tx, membership, scope)),
    );
  }

  @Post()
  @Allow('reviewerQa.write')
  async add(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Body() body: unknown) {
    const input = newCheck.safeParse(body);
    if (!input.success) throw badRequest('reviewerCheckInvalid');
    const { reviewId, ...given } = input.data;
    return withCompany(this.db, membership.companyId, async (tx) => {
      const reach = await reachOf(tx, membership, scope);
      const review = await getReview(tx, reviewId, reach);
      if (!review) throw notFound('reviewNotFound');
      const me = (await membershipOfUser(tx, membership.userId))?.id ?? null;
      if (review.reviewerId && review.reviewerId === me) throw forbidden('reviewerCheckOwn');
      const id = await addReviewerCheck(tx, {
        ...given,
        reviewId: review.id,
        leadId: review.leadId,
        reviewedOn: review.reviewedOn,
        agentId: review.agentId,
        agentName: review.agentName,
        teamId: review.teamId,
        reviewerId: review.reviewerId,
        reviewerName: review.reviewerName,
        byId: me,
        byName: membership.userName,
      });
      await logActivity(tx, actorOf(membership), {
        action: 'reviewerCheckAdded',
        targetName: review.reviewerName,
        details: { lead: review.leadId },
      });
      return getReviewerCheck(tx, id, { all: true });
    });
  }

  @Put(':id')
  @Allow('reviewerQa.write')
  async change(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const target = idParam.safeParse(id);
    const input = answers.safeParse(body);
    if (!target.success || !input.success) throw badRequest('reviewerCheckInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const check = await this.mineToChange(tx, membership, scope, target.data);
      await updateReviewerCheck(tx, check.id, input.data);
      await logActivity(tx, actorOf(membership), {
        action: 'reviewerCheckEdited',
        targetName: check.reviewerName,
        details: { lead: check.leadId },
      });
      return getReviewerCheck(tx, check.id, { all: true });
    });
  }

  @Delete(':id')
  @Allow('reviewerQa.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('reviewerCheckNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const check = await this.mineToChange(tx, membership, scope, target.data);
      await deleteReviewerCheck(tx, check.id);
      await logActivity(tx, actorOf(membership), {
        action: 'reviewerCheckDeleted',
        targetName: check.reviewerName,
        details: { lead: check.leadId },
      });
    });
  }

  /** A check in the person's reach, and not about their own review. */
  private async mineToChange(tx: Tx, membership: Membership, scope: Scope, id: string) {
    const check = await getReviewerCheck(tx, id, await reachOf(tx, membership, scope));
    if (!check) throw notFound('reviewerCheckNotFound');
    const me = (await membershipOfUser(tx, membership.userId))?.id;
    if (check.reviewerId && check.reviewerId === me) throw forbidden('reviewerCheckOwn');
    return check;
  }
}
