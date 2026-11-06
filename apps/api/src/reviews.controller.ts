// Reviews (QA Entry and Reviews), with today's rules:
// - agents see their own reviews, staff those of their workspaces, admins all (the permission matrix's reviews.read);
// - admins and reviewers add, change and delete reviews (reviewers: in their workspaces), with a scorecard they can
//   use and an active agent they can see; every question needs Yes, No or N/A; the agent is told about a new review
//   and about a changed score; the agent opening a review marks it as seen; staff can remind the agent to open it.
// Call recordings are never stored: a review keeps only a link to the recording.
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
  addReview,
  type Db,
  deleteReview,
  findMembership,
  getReview,
  getPerson,
  listReviews,
  logActivity,
  markSeen,
  type Membership,
  membershipOfUser,
  notify,
  type Review,
  type ReviewScope,
  type Tx,
  updateReview,
  visibleScorecards,
  visibleTeams,
  withCompany,
} from '@qsmart/db';
import {
  ANSWERS,
  type Scope,
  type ScorecardCategory,
  type ScoredCategory,
  ScoringError,
  scopeOf,
  scoreReview,
} from '@qsmart/shared';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, CurrentScope } from './decorators.js';
import { badRequest, notFound } from './errors.js';
import { reviewsWorkbook } from './excel.js';
import { DB } from './tokens.js';

const idParam = z.uuid();
/** a link, as today: empty, or an http(s) address */
export const link = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v))
  .default('');
const answers = z.array(
  z.array(
    z.object({
      answer: z.enum(ANSWERS),
      comment: z.string().max(300).default(''),
      rootCause: z.string().max(60).default(''),
    }),
  ),
);
const details = {
  leadId: z.string().trim().min(1).max(60),
  agentId: z.uuid(),
  reviewedOn: z.iso.date(),
  channel: z.enum(['call', 'chat', 'email', 'other']).default('call'),
  channelName: z.string().trim().max(40).default(''),
  flag: z.enum(['', 'green', 'red']).default(''),
  campaign: z.string().trim().max(80).default(''),
  comment: z.string().trim().max(1000).default(''),
  leadLink: link,
  recordingLink: link,
  conversationLink: link,
  transcript: z.string().max(20000).default(''),
  emailSubject: z.string().trim().max(200).default(''),
};
const newReview = z.object({
  ...details,
  scorecardId: z.uuid(),
  answers,
  /** how long QA Entry took, in seconds */
  reviewSeconds: z.number().int().positive().optional(),
});
const reviewChange = z.object({ ...details, answers: answers.optional() }).partial();

/** Today's rule: each channel keeps only its own fields (a chat has no recording, a call no transcript). */
function channelFields<T extends { channel?: string; channelName?: string; recordingLink?: string }>(input: T): T {
  const channel = input.channel ?? 'call';
  return {
    ...input,
    recordingLink: channel === 'call' ? input.recordingLink : '',
    channelName: channel === 'other' ? input.channelName : '',
    ...(channel === 'call' ? { conversationLink: '', transcript: '', emailSubject: '' } : {}),
    ...(channel !== 'email' ? { emailSubject: '' } : {}),
  };
}

/** The scorecard a review was scored with, back from its own copy (to score it again when it is edited). */
const scorecardOf = (scored: ScoredCategory[]): ScorecardCategory[] =>
  scored.map((c) => ({
    name: c.name,
    critical: c.critical,
    questions: c.questions.map((q) => ({
      text: q.text,
      points: q.points,
      critical: q.critical,
      compliance: q.compliance,
    })),
  }));

function score(categories: ScorecardCategory[], given: z.infer<typeof answers>) {
  try {
    return scoreReview(categories, given);
  } catch (error) {
    if (error instanceof ScoringError)
      throw badRequest(error.code === 'unanswered' ? 'reviewUnanswered' : 'reviewAnswers');
    throw error;
  }
}

/** Whose reviews a person reaches with a right: everyone's, their workspaces' teams, or their own. */
export async function reachOf(tx: Tx, membership: Membership, scope: Scope): Promise<ReviewScope> {
  if (scope === 'all') return { all: true };
  if (scope === 'own') {
    const me = await membershipOfUser(tx, membership.userId);
    return { agentId: me?.id ?? '00000000-0000-0000-0000-000000000000' };
  }
  const teams = await visibleTeams(tx, membership.userId, 'workspace');
  return teams ? { teamIds: [...teams] } : { all: true };
}

/** An active agent the reviewer can reach (today: in their workspaces). */
export async function agentFor(tx: Tx, reach: ReviewScope, agentId: string) {
  const agent = await findMembership(tx, agentId);
  if (!agent || agent.role !== 'agent' || !agent.active) throw badRequest('reviewAgent');
  if ('teamIds' in reach && !(agent.teamId && reach.teamIds.includes(agent.teamId))) throw badRequest('reviewAgent');
  const person = await getPerson(tx, agent.id);
  return { id: agent.id, name: person?.name ?? '', teamId: agent.teamId, teamName: person?.teamName ?? '' };
}

const notifyScore = (review: Pick<Review, 'leadId' | 'score' | 'notScored' | 'channel'>) => ({
  lead: review.leadId,
  score: review.notScored || review.score === null ? '' : String(review.score),
  channel: review.channel,
});

@Controller('reviews')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class ReviewsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('reviews.read')
  list(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope) {
    return withCompany(this.db, membership.companyId, async (tx) =>
      listReviews(tx, await reachOf(tx, membership, scope)),
    );
  }

  @Get(':id')
  @Allow('reviews.read')
  async one(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('reviewNotFound');
    const review = await withCompany(this.db, membership.companyId, async (tx) =>
      getReview(tx, target.data, await reachOf(tx, membership, scope)),
    );
    if (!review) throw notFound('reviewNotFound');
    return review;
  }

  /**
   * Export to Excel (as today): the reviews of the list, in its order, but only those the person may see. Written in
   * the activity log's "Exports & downloads".
   */
  @Post('export')
  @Allow('reviews.read')
  @HttpCode(200)
  async export(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = z
      .object({ ids: z.array(z.uuid()).min(1).max(20000), name: z.string().trim().min(1).max(30).default('Reviews') })
      .safeParse(body);
    if (!input.success) throw badRequest('nothingToExport');
    const { ids, name } = input.data;
    const picked = await withCompany(this.db, membership.companyId, async (tx) => {
      const byId = new Map((await listReviews(tx, await reachOf(tx, membership, scope))).map((r) => [r.id, r]));
      const rows = ids.map((id) => byId.get(id)).filter((r): r is Review => Boolean(r));
      await logActivity(tx, actorOf(membership), {
        action: 'exportReviews',
        targetName: name,
        details: { rows: String(rows.length) },
      });
      return rows;
    });
    const file = await reviewsWorkbook(picked, name);
    const fileName = `${name.replace(/[^p{L}p{N}]+/gu, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    return new StreamableFile(file);
  }

  /** QA Entry: a new review. */
  @Post()
  @Allow('reviews.write')
  async add(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Body() body: unknown) {
    const parsed = newReview.safeParse(body);
    if (!parsed.success) throw badRequest('reviewInvalid');
    const input = channelFields(parsed.data);
    return withCompany(this.db, membership.companyId, async (tx) => {
      const reach = await reachOf(tx, membership, scope);
      const cardScope = scopeOf(membership.role, 'scorecards.read') ?? 'own';
      const card = (await visibleScorecards(tx, membership.userId, cardScope)).find((s) => s.id === input.scorecardId);
      if (!card) throw badRequest('reviewScorecard');
      const agent = await agentFor(tx, reach, input.agentId);
      const scored = score(card.categories, input.answers);
      const me = await membershipOfUser(tx, membership.userId);
      const id = await addReview(tx, {
        leadId: input.leadId,
        agentId: agent.id,
        agentName: agent.name,
        teamId: agent.teamId,
        teamName: agent.teamName,
        reviewedOn: input.reviewedOn,
        channel: input.channel,
        channelName: input.channelName,
        scorecardId: card.id,
        scorecardName: card.name,
        categories: scored.categories,
        score: scored.score,
        zero: scored.zero,
        notScored: scored.notScored,
        flag: input.flag,
        campaign: input.campaign,
        comment: input.comment,
        leadLink: input.leadLink,
        recordingLink: input.recordingLink,
        conversationLink: input.conversationLink,
        transcript: input.transcript,
        emailSubject: input.emailSubject,
        reviewerId: me?.id ?? null,
        reviewerName: membership.userName,
        reviewSeconds: input.reviewSeconds ? Math.min(4 * 3600, input.reviewSeconds) : null,
      });
      await notify(tx, agent.id, 'reviewNew', notifyScore({ ...input, ...scored }), `/review/${id}`);
      await logActivity(tx, actorOf(membership), {
        action: 'reviewAdded',
        targetName: agent.name,
        details: { lead: input.leadId },
      });
      return getReview(tx, id, { all: true });
    });
  }

  @Put(':id')
  @Allow('reviews.write')
  async change(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const target = idParam.safeParse(id);
    const parsed = reviewChange.safeParse(body);
    if (!target.success || !parsed.success) throw badRequest('reviewInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const reach = await reachOf(tx, membership, scope);
      const review = await getReview(tx, target.data, reach);
      if (!review) throw notFound('reviewNotFound');
      const { answers: given, agentId, ...fields } = parsed.data;
      const change = channelFields({ channel: review.channel, ...fields });
      const scored = given ? score(scorecardOf(review.categories), given) : null;
      const agent = agentId && agentId !== review.agentId ? await agentFor(tx, reach, agentId) : null;
      await updateReview(tx, review.id, {
        ...change,
        ...(scored
          ? { categories: scored.categories, score: scored.score, zero: scored.zero, notScored: scored.notScored }
          : {}),
        ...(agent ? { agentId: agent.id, agentName: agent.name, teamId: agent.teamId, teamName: agent.teamName } : {}),
      });
      const after = await getReview(tx, review.id, { all: true });
      if (after?.agentId && (after.score !== review.score || after.notScored !== review.notScored))
        await notify(tx, after.agentId, 'reviewUpdated', notifyScore(after), `/review/${after.id}`);
      await logActivity(tx, actorOf(membership), {
        action: 'reviewEdited',
        targetName: after?.agentName ?? review.agentName,
        details: { lead: after?.leadId ?? review.leadId },
      });
      return after;
    });
  }

  @Delete(':id')
  @Allow('reviews.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw badRequest('nothingToDelete');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const review = await getReview(tx, target.data, await reachOf(tx, membership, scope));
      if (!review) throw notFound('reviewNotFound');
      await deleteReview(tx, review.id);
      await logActivity(tx, actorOf(membership), {
        action: 'reviewDeleted',
        targetName: review.agentName,
        details: { lead: review.leadId },
      });
    });
  }

  /** The agent opening their review marks it as seen (today's rule). */
  @Post(':id/seen')
  @Allow('reviews.read')
  @HttpCode(204)
  async seen(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('reviewNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const me = await membershipOfUser(tx, membership.userId);
      const review = me ? await getReview(tx, target.data, { agentId: me.id }) : undefined;
      if (review) await markSeen(tx, review.id);
    });
  }

  /** Staff remind the agent to open the review (today's rule). */
  @Post(':id/remind')
  @Allow('reviews.write')
  @HttpCode(204)
  async remind(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('reviewNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const review = await getReview(tx, target.data, await reachOf(tx, membership, scope));
      if (!review) throw notFound('reviewNotFound');
      if (review.agentId)
        await notify(tx, review.agentId, 'reviewReminder', { lead: review.leadId }, `/review/${review.id}`);
    });
  }
}
