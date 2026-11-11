// Planning › Review planner (today's planning.js): the company's plan of reviews per agent per month (a default, a
// team's own, an agent's own) and who reviews whom. Staff read it (the Dashboard's plan widgets too); admins and
// reviewers change it, as today. The reviews done are counted on the pages with the shared rules (planner.ts).
import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';
import {
  companyPlanner,
  type Db,
  listPeople,
  listTeams,
  logActivity,
  type Membership,
  setCompanyPlanner,
  withCompany,
} from '@qsmart/db';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership } from './decorators.js';
import { badRequest } from './errors.js';
import { DB } from './tokens.js';

const count = z.number().int().min(0).max(100);
const plan = z.object({
  target: count.optional(),
  teams: z
    .record(z.uuid(), count)
    .refine((r) => Object.keys(r).length <= 500)
    .optional(),
  agents: z
    .record(z.uuid(), count)
    .refine((r) => Object.keys(r).length <= 10000)
    .optional(),
  assign: z
    .record(z.uuid(), z.uuid())
    .refine((r) => Object.keys(r).length <= 10000)
    .optional(),
});

@Controller('planner')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class PlannerController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('planner.read')
  get(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, (tx) => companyPlanner(tx));
  }

  /** The whole plan, as the page has it: only the company's teams and agents, reviewed by active admins or reviewers. */
  @Put()
  @Allow('planner.write')
  async save(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = plan.safeParse(body);
    if (!input.success) throw badRequest('plannerInvalid');
    const p = input.data;
    return withCompany(this.db, membership.companyId, async (tx) => {
      const people = await listPeople(tx);
      const teams = await listTeams(tx);
      const agents = new Set(people.filter((x) => x.role === 'agent').map((x) => x.membershipId));
      const reviewers = new Set(
        people.filter((x) => x.active && (x.role === 'admin' || x.role === 'reviewer')).map((x) => x.membershipId),
      );
      const teamIds = new Set(teams.filter((x) => !x.isAdministration).map((x) => x.id));
      const ok =
        Object.keys(p.teams ?? {}).every((id) => teamIds.has(id)) &&
        Object.keys(p.agents ?? {}).every((id) => agents.has(id)) &&
        Object.entries(p.assign ?? {}).every(([agent, reviewer]) => agents.has(agent) && reviewers.has(reviewer));
      if (!ok) throw badRequest('plannerInvalid');
      await setCompanyPlanner(tx, p);
      await logActivity(tx, actorOf(membership), { action: 'plannerChanged', targetName: '', details: {} });
      return companyPlanner(tx);
    });
  }
}
