// Calibration, with today's rules:
// - admins, reviewers, team leads and trainers make sessions; only the participants (and admins) see them;
// - the person who made a session (or an admin) changes its title, date, status, participants, teams and notes, takes
//   reviews off, chooses each review's reference score, and deletes it;
// - each participant writes only their own part (impressions, what they have done), adds reviews they can see, scores
//   the reviews and keeps the decisions;
// - blind scoring (from Zendesk QA): until you have scored a review, the others' scores of it stay hidden from you (the
//   maker and admins always see them, and everybody does once the session is closed). The server hides them.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  addCalibration,
  addCalibrationReview,
  type Calibration,
  type Db,
  deleteCalibration,
  getCalibration,
  getReview,
  listCalibrations,
  listPeople,
  listTeams,
  logActivity,
  type Membership,
  membershipOfUser,
  notify,
  removeCalibrationReview,
  setCalibrationScore,
  setParticipants,
  type Tx,
  updateCalibration,
  withCompany,
  writeMyPart,
} from '@qsmart/db';
import { type Scope, scopeOf } from '@qsmart/shared';
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
const fields = z.object({
  title: z.string().trim().max(150).default(''),
  heldOn: z.iso.date(),
  status: z.enum(['planned', 'held', 'closed']).default('planned'),
  notes: z.string().max(5000).default(''),
  teamIds: z.array(z.uuid()).max(20).default([]),
  participantIds: z.array(z.uuid()).max(30).default([]),
});
const part = z.object({ impression: z.string().max(4000).default(''), done: z.string().max(4000).default('') });
const scoreInput = z.object({ score: z.number().int().min(0).max(100), note: z.string().trim().max(500).default('') });
const decisionsInput = z.object({
  decisions: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(250),
        ownerId: z.union([z.uuid(), z.literal('')]).default(''),
        due: z.union([z.iso.date(), z.literal('')]).default(''),
        done: z.boolean().default(false),
      }),
    )
    .max(30),
});
const STAFF = ['admin', 'reviewer', 'lead', 'trainer'];
const MAX_REVIEWS = 30;

/** Who is asking: their membership, whether they made the session (or are an admin), and their participant row. */
interface Viewer {
  me: string | undefined;
  admin: boolean;
}
const ownerOf = (c: Calibration, v: Viewer) => v.admin || (Boolean(v.me) && c.byId === v.me);
const partOf = (c: Calibration, v: Viewer) => c.participants.find((p) => p.membershipId === v.me);

/**
 * The session as a person may see it. Blind scoring: before the session is closed, someone who neither made it nor
 * is an admin sees the others' scores of a review only after scoring it; until then only how many have scored it.
 */
function asSeenBy(c: Calibration, v: Viewer, teams: Map<string, string>) {
  const mine = partOf(c, v);
  const open = ownerOf(c, v) || c.status === 'closed';
  const scoredByMe = new Set(c.scores.filter((s) => s.participantId === mine?.id).map((s) => s.reviewId));
  return {
    ...c,
    owner: ownerOf(c, v),
    myParticipantId: mine?.id ?? null,
    scores: c.scores.filter((s) => open || scoredByMe.has(s.reviewId) || s.participantId === mine?.id),
    /** the names of the teams discussed: participants see them even outside their own workspaces */
    teamNames: c.teamIds.map((id) => teams.get(id)).filter((name): name is string => Boolean(name)),
    scoredCount: Object.fromEntries(c.reviews.map((r) => [r.id, c.scores.filter((s) => s.reviewId === r.id).length])),
  };
}

@Controller('calibrations')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class CalibrationsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('calibrations.take')
  list(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const v = await this.viewer(tx, membership, scope);
      const rows = await listCalibrations(tx, v.admin ? null : (v.me ?? '00000000-0000-0000-0000-000000000000'));
      const teams = await this.teamNames(tx);
      return rows.map((c) => asSeenBy(c, v, teams));
    });
  }

  @Get(':id')
  @Allow('calibrations.take')
  async one(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Param('id') id: string) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { calibration, viewer } = await this.find(tx, membership, scope, id);
      return asSeenBy(calibration, viewer, await this.teamNames(tx));
    });
  }

  @Post()
  @Allow('calibrations.take')
  async add(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Body() body: unknown) {
    const input = fields.safeParse(body);
    if (!input.success) throw badRequest('calibrationInvalid');
    const { participantIds, ...rest } = input.data;
    return withCompany(this.db, membership.companyId, async (tx) => {
      const v = await this.viewer(tx, membership, scope);
      const people = await this.staff(tx, [...participantIds, ...(v.me ? [v.me] : [])]);
      const id = await addCalibration(
        tx,
        { ...rest, title: rest.title || 'Calibration session', teamIds: await this.teams(tx, rest.teamIds) },
        { id: v.me ?? null, name: membership.userName },
        people,
      );
      await this.invite(tx, people, v.me, membership.userName, id);
      await logActivity(tx, actorOf(membership), {
        action: 'calibrationAdded',
        targetName: rest.title || 'Calibration session',
      });
      return this.seen(tx, id, v);
    });
  }

  /** The maker (or an admin) changes the session: title, date, status, participants, teams, notes. */
  @Put(':id')
  @Allow('calibrations.take')
  async change(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = fields.safeParse(body);
    if (!input.success) throw badRequest('calibrationInvalid');
    const { participantIds, ...rest } = input.data;
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { calibration, viewer } = await this.find(tx, membership, scope, id);
      if (!ownerOf(calibration, viewer)) throw forbidden('calibrationOwner');
      await updateCalibration(tx, calibration.id, {
        ...rest,
        title: rest.title || calibration.title,
        teamIds: await this.teams(tx, rest.teamIds),
      });
      // the maker always stays in it
      const keep = calibration.byId && (await this.staff(tx, [calibration.byId])).length ? [calibration.byId] : [];
      const added = await setParticipants(tx, calibration.id, await this.staff(tx, [...participantIds, ...keep]));
      await this.invite(tx, added, viewer.me, membership.userName, calibration.id);
      return this.seen(tx, calibration.id, viewer);
    });
  }

  @Delete(':id')
  @Allow('calibrations.take')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Param('id') id: string) {
    await withCompany(this.db, membership.companyId, async (tx) => {
      const { calibration, viewer } = await this.find(tx, membership, scope, id);
      if (!ownerOf(calibration, viewer)) throw forbidden('calibrationOwner');
      await deleteCalibration(tx, calibration.id);
      await logActivity(tx, actorOf(membership), { action: 'calibrationDeleted', targetName: calibration.title });
    });
  }

  /** My own part: impressions of the team(s), and what I have done. */
  @Put(':id/my-part')
  @Allow('calibrations.take')
  async myPart(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = part.safeParse(body);
    if (!input.success) throw badRequest('calibrationInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { calibration, viewer } = await this.find(tx, membership, scope, id);
      const mine = partOf(calibration, viewer);
      if (!mine) throw forbidden('calibrationParticipant');
      await writeMyPart(tx, mine.id, input.data.impression, input.data.done);
      return this.seen(tx, calibration.id, viewer);
    });
  }

  /** A participant adds a review they can see (up to 30 per session). */
  @Post(':id/reviews')
  @Allow('calibrations.take')
  async addReview(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = z.object({ reviewId: z.uuid() }).safeParse(body);
    if (!input.success) throw badRequest('calibrationReview');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { calibration, viewer } = await this.find(tx, membership, scope, id);
      if (!partOf(calibration, viewer) && !ownerOf(calibration, viewer)) throw forbidden('calibrationParticipant');
      const reach = await reachOf(tx, membership, scopeOf(membership.role, 'reviews.read') ?? 'own');
      const review = await getReview(tx, input.data.reviewId, reach);
      if (!review || calibration.reviews.length >= MAX_REVIEWS) throw badRequest('calibrationReview');
      await addCalibrationReview(tx, calibration.id, review.id);
      return this.seen(tx, calibration.id, viewer);
    });
  }

  /** The maker (or an admin) takes a review off, with its scores. */
  @Delete(':id/reviews/:reviewId')
  @Allow('calibrations.take')
  async removeReview(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Param('reviewId') reviewId: string,
  ) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { calibration, viewer } = await this.find(tx, membership, scope, id);
      if (!ownerOf(calibration, viewer)) throw forbidden('calibrationOwner');
      await removeCalibrationReview(tx, calibration.id, reviewId);
      return this.seen(tx, calibration.id, viewer);
    });
  }

  /** My own score of a review (blind until I save it). */
  @Put(':id/scores/:reviewId')
  @Allow('calibrations.take')
  async score(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Param('reviewId') reviewId: string,
    @Body() body: unknown,
  ) {
    const input = scoreInput.safeParse(body);
    if (!input.success) throw badRequest('calibrationScore');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { calibration, viewer } = await this.find(tx, membership, scope, id);
      const mine = partOf(calibration, viewer);
      if (!mine) throw forbidden('calibrationParticipant');
      if (calibration.status === 'closed') throw badRequest('calibrationClosed');
      if (!calibration.reviews.some((r) => r.id === reviewId)) throw badRequest('calibrationReview');
      await setCalibrationScore(tx, calibration.id, reviewId, mine.id, input.data.score, input.data.note);
      return this.seen(tx, calibration.id, viewer);
    });
  }

  /** The maker (or an admin) chooses a review's reference score: the review itself, or one participant's score. */
  @Put(':id/reference/:reviewId')
  @Allow('calibrations.take')
  async reference(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Param('reviewId') reviewId: string,
    @Body() body: unknown,
  ) {
    const input = z.object({ who: z.union([z.literal('review'), z.uuid()]) }).safeParse(body);
    if (!input.success) throw badRequest('calibrationInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { calibration, viewer } = await this.find(tx, membership, scope, id);
      if (!ownerOf(calibration, viewer)) throw forbidden('calibrationOwner');
      const { who } = input.data;
      if (!calibration.reviews.some((r) => r.id === reviewId)) throw badRequest('calibrationReview');
      if (who !== 'review' && !calibration.participants.some((p) => p.id === who))
        throw badRequest('calibrationInvalid');
      await updateCalibration(tx, calibration.id, { reference: { ...calibration.reference, [reviewId]: who } });
      return this.seen(tx, calibration.id, viewer);
    });
  }

  /** The decisions and actions, kept by the participants. */
  @Put(':id/decisions')
  @Allow('calibrations.take')
  async decisions(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = decisionsInput.safeParse(body);
    if (!input.success) throw badRequest('calibrationInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { calibration, viewer } = await this.find(tx, membership, scope, id);
      if (!partOf(calibration, viewer) && !ownerOf(calibration, viewer)) throw forbidden('calibrationParticipant');
      const people = new Set(calibration.participants.map((p) => p.membershipId));
      const decisions = input.data.decisions.map((d) => ({ ...d, ownerId: people.has(d.ownerId) ? d.ownerId : '' }));
      await updateCalibration(tx, calibration.id, { decisions });
      return this.seen(tx, calibration.id, viewer);
    });
  }

  private async viewer(tx: Tx, membership: Membership, scope: Scope): Promise<Viewer> {
    return { me: (await membershipOfUser(tx, membership.userId))?.id, admin: scope === 'all' };
  }

  /** The session, if the person takes part in it (or is an admin); otherwise "not found". */
  private async find(tx: Tx, membership: Membership, scope: Scope, id: string) {
    const target = idParam.safeParse(id);
    const calibration = target.success ? await getCalibration(tx, target.data) : undefined;
    const viewer = await this.viewer(tx, membership, scope);
    if (!calibration || (!viewer.admin && !partOf(calibration, viewer))) throw notFound('calibrationNotFound');
    return { calibration, viewer };
  }

  private async seen(tx: Tx, id: string, viewer: Viewer) {
    const calibration = await getCalibration(tx, id);
    if (!calibration) throw notFound('calibrationNotFound');
    return asSeenBy(calibration, viewer, await this.teamNames(tx));
  }

  private async teamNames(tx: Tx): Promise<Map<string, string>> {
    return new Map((await listTeams(tx)).map((t) => [t.id, t.name]));
  }

  /** Participants are active admins, reviewers, team leads and trainers of the company (today's rule). */
  private async staff(tx: Tx, ids: string[]): Promise<string[]> {
    const ok = new Set(
      (await listPeople(tx)).filter((p) => p.active && STAFF.includes(p.role)).map((p) => p.membershipId),
    );
    return [...new Set(ids)].filter((id) => ok.has(id));
  }

  private async teams(tx: Tx, ids: string[]): Promise<string[]> {
    const known = new Set((await listTeams(tx)).filter((t) => !t.isAdministration).map((t) => t.id));
    return [...new Set(ids)].filter((id) => known.has(id));
  }

  private async invite(tx: Tx, people: string[], me: string | undefined, name: string, id: string) {
    const calibration = await getCalibration(tx, id);
    if (!calibration) return;
    for (const person of people.filter((p) => p !== me))
      await notify(
        tx,
        person,
        'calibrationInvite',
        { name, title: calibration.title, date: calibration.heldOn },
        `/calibration/${id}`,
      );
  }
}
