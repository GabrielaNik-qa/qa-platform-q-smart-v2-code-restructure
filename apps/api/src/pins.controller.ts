// Pins, with today's rules: admins, reviewers, team leads and trainers pin a moment of a reviewed conversation to talk
// about with the agent in a coaching session (the review, the moment as mm:ss, what to talk about), and mark it
// "talked about" afterwards. Staff reach the pins of their workspaces' agents (admins: all); an agent reads their own.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  addPin,
  type Db,
  deletePin,
  getPin,
  getReview,
  listPins,
  logActivity,
  type Membership,
  membershipOfUser,
  updatePin,
  withCompany,
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
/** mm:ss (or h:mm:ss), or empty */
const moment = z
  .string()
  .trim()
  .regex(/^$|^(\d{1,2}:)?\d{1,3}:[0-5]\d$/);
const note = z.string().trim().min(1).max(2000);
const status = z.enum(['todo', 'done']);
const newPin = z.object({ reviewId: z.uuid(), moment: moment.default(''), note, status: status.default('todo') });
/** a change holds only what is sent: no defaults, so marking a pin "talked about" keeps its moment */
const pinChange = z
  .object({ moment: moment.optional(), note: note.optional(), status: status.optional() })
  .refine((c) => Object.values(c).some((v) => v !== undefined));

@Controller('pins')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class PinsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('pins.read')
  list(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope) {
    return withCompany(this.db, membership.companyId, async (tx) => listPins(tx, await reachOf(tx, membership, scope)));
  }

  @Post()
  @Allow('pins.write')
  async add(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Body() body: unknown) {
    const input = newPin.safeParse(body);
    if (!input.success) throw badRequest('pinInvalid');
    const { reviewId, ...given } = input.data;
    return withCompany(this.db, membership.companyId, async (tx) => {
      const review = await getReview(tx, reviewId, await reachOf(tx, membership, scope));
      if (!review) throw notFound('reviewNotFound');
      const id = await addPin(tx, {
        ...given,
        reviewId: review.id,
        leadId: review.leadId,
        reviewedOn: review.reviewedOn,
        agentId: review.agentId,
        agentName: review.agentName,
        teamId: review.teamId,
        byId: (await membershipOfUser(tx, membership.userId))?.id ?? null,
        byName: membership.userName,
      });
      await logActivity(tx, actorOf(membership), {
        action: 'pinAdded',
        targetName: review.agentName,
        details: { lead: review.leadId },
      });
      return getPin(tx, id, { all: true });
    });
  }

  /** Change the moment or what to talk about, or mark it talked about. */
  @Put(':id')
  @Allow('pins.write')
  async change(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const target = idParam.safeParse(id);
    const input = pinChange.safeParse(body);
    if (!target.success || !input.success) throw badRequest('pinInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const pin = await getPin(tx, target.data, await reachOf(tx, membership, scope));
      if (!pin) throw notFound('pinNotFound');
      await updatePin(tx, pin.id, input.data);
      return getPin(tx, pin.id, { all: true });
    });
  }

  @Delete(':id')
  @Allow('pins.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('pinNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const pin = await getPin(tx, target.data, await reachOf(tx, membership, scope));
      if (!pin) throw notFound('pinNotFound');
      await deletePin(tx, pin.id);
      await logActivity(tx, actorOf(membership), {
        action: 'pinDeleted',
        targetName: pin.agentName,
        details: { lead: pin.leadId },
      });
    });
  }
}
