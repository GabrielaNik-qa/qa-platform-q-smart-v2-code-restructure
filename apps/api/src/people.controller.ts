// The people of a company (Admin › Users): everyone reads the people of their own workspaces (admins: everybody),
// only admins invite and change. Today's rules apply: staff (admin, reviewer, team lead, trainer) always sit in the
// Administration team, every agent needs a team, and a company always keeps at least one active admin. Reviewers,
// team leads and trainers are in at least one workspace (the first one unless the admin chooses); only staff lead
// teams.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  administrationTeam,
  type Db,
  getPerson,
  invitePerson,
  isAgentTeam,
  listPeople,
  listWorkspaces,
  type Membership,
  otherActiveAdmins,
  removeMembership,
  setPersonSkills,
  setStaffWorkspaces,
  stopLeading,
  type Tx,
  updateMembership,
  visibleTeams,
  withCompany,
} from '@qsmart/db';
import { isStaff, isWorkspaceStaff, type Role, roleSchema, type Scope } from '@qsmart/shared';
import { z } from 'zod';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import type { VerifiedPerson } from './auth/token-verifier.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, CurrentScope, Person } from './decorators.js';
import { knownSkills } from './setup.controller.js';
import { DB } from './tokens.js';
import { badRequest, conflict, forbidden, notFound } from './errors.js';

const invitation = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  role: roleSchema,
  teamId: z.uuid().optional(),
});
const change = z
  .object({
    role: roleSchema.optional(),
    teamId: z.uuid().optional(),
    active: z.boolean().optional(),
    skillIds: z.array(z.uuid()).max(200).optional(),
    /** reviewers, team leads and trainers: their workspaces (none chosen: the first one) */
    workspaceIds: z.array(z.uuid()).max(100).optional(),
  })
  .refine((c) => Object.keys(c).length > 0);
const idParam = z.uuid();

/** The team a person with this role sits in: Administration for staff, the chosen agent team for agents. */
async function teamFor(tx: Tx, role: Role, teamId: string | undefined | null): Promise<string> {
  if (isStaff(role)) {
    const admin = await administrationTeam(tx);
    if (!admin) throw badRequest('noAdministration');
    return admin;
  }
  if (!teamId || !(await isAgentTeam(tx, teamId))) throw badRequest('agentNeedsTeam');
  return teamId;
}

/**
 * Puts a reviewer, team lead or trainer in the workspaces chosen (only real ones), or in the first workspace when none
 * is chosen, as today. Admins and agents are in no workspace by name.
 */
async function placeInWorkspaces(tx: Tx, membershipId: string, role: Role, chosen: string[]): Promise<void> {
  if (!isWorkspaceStaff(role)) return setStaffWorkspaces(tx, membershipId, []);
  const workspaces = await listWorkspaces(tx);
  const want = [...new Set(chosen)].filter((id) => workspaces.some((w) => w.id === id));
  const first = workspaces[0];
  if (!want.length && first) want.push(first.id);
  await setStaffWorkspaces(tx, membershipId, want);
}

const pgCode = (error: unknown) =>
  (error as { cause?: { code?: string }; code?: string }).cause?.code ?? (error as { code?: string }).code;

@Controller('people')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class PeopleController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('people.read')
  list(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const seen = await visibleTeams(tx, membership.userId, scope);
      const people = await listPeople(tx);
      return seen ? people.filter((p) => p.teamId && seen.has(p.teamId)) : people;
    });
  }

  @Post()
  @Allow('people.manage')
  async invite(@CurrentMembership() membership: Membership, @Person() person: VerifiedPerson, @Body() body: unknown) {
    const input = invitation.safeParse(body);
    if (!input.success) throw badRequest('invitationInvalid');
    try {
      const id = await withCompany(this.db, membership.companyId, async (tx) => {
        const teamId = await teamFor(tx, input.data.role, input.data.teamId);
        const made = await invitePerson(tx, person.uid, { ...input.data, teamId });
        await placeInWorkspaces(tx, made, input.data.role, []);
        return made;
      });
      return { id };
    } catch (error) {
      if (pgCode(error) === '23505') throw conflict('alreadyMember');
      if (pgCode(error) === '42501') throw forbidden('adminInvitesOnly');
      throw error;
    }
  }

  @Patch(':id')
  @Allow('people.manage')
  async change(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const target = idParam.safeParse(id);
    const input = change.safeParse(body);
    if (!target.success || !input.success) throw badRequest('nothingToChange');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const current = await getPerson(tx, target.data);
      if (!current) throw notFound('personNotFound');
      const role = input.data.role ?? current.role;
      const active = input.data.active ?? current.active;
      if (current.userId === membership.userId && (!active || role !== current.role)) {
        throw badRequest('notYourOwnAccount');
      }
      if (current.role === 'admin' && current.active && (role !== 'admin' || !active)) {
        if ((await otherActiveAdmins(tx, current.membershipId)) === 0) throw badRequest('keepOneAdmin');
      }
      const teamId = await teamFor(tx, role, input.data.teamId ?? current.teamId);
      await updateMembership(tx, current.membershipId, { role, teamId, active });
      if (input.data.skillIds)
        await setPersonSkills(tx, current.membershipId, await knownSkills(tx, input.data.skillIds));
      if (input.data.workspaceIds || role !== current.role)
        await placeInWorkspaces(tx, current.membershipId, role, input.data.workspaceIds ?? current.workspaceIds);
      if (!isStaff(role)) await stopLeading(tx, current.membershipId);
      return getPerson(tx, current.membershipId);
    });
  }

  @Delete(':id')
  @Allow('people.manage')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw badRequest('nothingToDelete');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const current = await getPerson(tx, target.data);
      if (!current) throw notFound('personNotFound');
      if (current.userId === membership.userId) throw badRequest('notYourself');
      if (current.role === 'admin' && current.active && (await otherActiveAdmins(tx, current.membershipId)) === 0)
        throw badRequest('keepOneAdmin');
      await removeMembership(tx, current.membershipId);
    });
  }
}
