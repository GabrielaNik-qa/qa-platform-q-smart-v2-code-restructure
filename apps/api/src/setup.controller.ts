// Teams, workspaces, skills and languages (Admin › Teams, Workspaces, Skills & languages), with today's rules:
// - everyone reads what is in their own workspaces (admins: everything); only admins change anything;
// - Administration is built in and can't be deleted; a team with people in it can't be deleted; the company keeps at
//   least one working team; every working team needs a lead, who is active staff;
// - a workspace holds working teams (never Administration) and reviewers, team leads and trainers; once there is one
//   workspace, there is always at least one; a new team goes into the workspace chosen, or the first one;
// - skills and languages are lists people and teams pick from: a new name shows everywhere, and deleting one takes it
//   away from everybody.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import {
  addSkill,
  addTeam,
  addTeamToWorkspace,
  addWorkspace,
  type Db,
  deleteSkill,
  deleteTeam,
  deleteWorkspace,
  findMembership,
  listPeople,
  listSkills,
  listTeams,
  listWorkspaces,
  type Membership,
  membershipOfUser,
  ownWorkspaces,
  renameSkill,
  type Tx,
  updateTeam,
  updateWorkspace,
  visibleTeams,
  withCompany,
} from '@qsmart/db';
import { isStaff, isWorkspaceStaff, type Scope } from '@qsmart/shared';
import { z } from 'zod';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, CurrentScope } from './decorators.js';
import { DB } from './tokens.js';
import { badRequest, conflict, notFound } from './errors.js';

const DEFAULT_COLOR = '#2563eb';
const color = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .catch(DEFAULT_COLOR);
const ids = (max: number) => z.array(z.uuid()).max(max).default([]);
const idParam = z.uuid();

const teamInput = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(600).default(''),
  color,
  leadId: z.uuid().nullable().default(null),
  skillIds: ids(200),
  /** for a new team: the workspace it goes into (the first one when not given) */
  workspaceId: z.uuid().optional(),
});

const workspaceInput = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(400).default(''),
  color,
  teamIds: ids(500),
  staffIds: ids(2000),
});

const skillInput = z.object({ kind: z.enum(['skill', 'language']), name: z.string().trim().min(1).max(40) });
const skillRename = z.object({ name: z.string().trim().min(1).max(40) });

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
const unique = (list: string[]) => [...new Set(list)];

/** Keeps only the skills and languages of this company (as today, anything else is ignored). */
export async function knownSkills(tx: Tx, skillIds: string[]): Promise<string[]> {
  const known = new Set((await listSkills(tx)).map((s) => s.id));
  return unique(skillIds).filter((id) => known.has(id));
}

/** A team lead is an active member of the staff (admin, reviewer, team lead or trainer), as today. */
async function checkLead(tx: Tx, leadId: string | null, required: boolean): Promise<string | null> {
  if (!leadId) {
    if (required) throw badRequest('teamNeedsLead');
    return null;
  }
  const lead = await findMembership(tx, leadId);
  if (!lead?.active || !isStaff(lead.role)) throw badRequest('leadNotStaff');
  return lead.id;
}

@Controller('teams')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class TeamsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('people.read')
  list(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const seen = await visibleTeams(tx, membership.userId, scope);
      const all = await listTeams(tx);
      return seen ? all.filter((t) => seen.has(t.id)) : all;
    });
  }

  @Post()
  @Allow('people.manage')
  async add(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = teamInput.safeParse(body);
    if (!input.success) throw badRequest('teamInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const teams = await listTeams(tx);
      if (teams.some((t) => same(t.name, input.data.name))) throw conflict('teamExists');
      const id = await addTeam(tx, {
        ...input.data,
        leadId: await checkLead(tx, input.data.leadId, true),
        skillIds: await knownSkills(tx, input.data.skillIds),
      });
      const workspaces = await listWorkspaces(tx);
      const into = workspaces.find((w) => w.id === input.data.workspaceId) ?? workspaces[0];
      if (into) await addTeamToWorkspace(tx, id, into.id);
      return (await listTeams(tx)).find((t) => t.id === id);
    });
  }

  @Put(':id')
  @Allow('people.manage')
  async change(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const target = idParam.safeParse(id);
    const input = teamInput.safeParse(body);
    if (!target.success || !input.success) throw badRequest('teamInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const teams = await listTeams(tx);
      const team = teams.find((t) => t.id === target.data);
      if (!team) throw notFound('teamNotFound');
      if (teams.some((t) => t.id !== team.id && same(t.name, input.data.name))) throw conflict('teamExists');
      await updateTeam(tx, team.id, {
        ...input.data,
        leadId: await checkLead(tx, input.data.leadId, !team.isAdministration),
        skillIds: await knownSkills(tx, input.data.skillIds),
      });
      return (await listTeams(tx)).find((t) => t.id === team.id);
    });
  }

  @Delete(':id')
  @Allow('people.manage')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw badRequest('nothingToDelete');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const teams = await listTeams(tx);
      const team = teams.find((t) => t.id === target.data);
      if (!team) throw notFound('teamNotFound');
      if (team.isAdministration) throw badRequest('administrationBuiltIn');
      if (team.members > 0) throw badRequest('teamHasPeople');
      if (teams.filter((t) => !t.isAdministration).length <= 1) throw badRequest('lastWorkingTeam');
      await deleteTeam(tx, team.id);
    });
  }
}

@Controller('workspaces')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class WorkspacesController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Admins see every workspace; the others only their own (staff by name, agents through their team). */
  @Get()
  @Allow('people.read')
  list(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const all = await listWorkspaces(tx);
      if (scope === 'all') return all;
      const me = await membershipOfUser(tx, membership.userId);
      const own = new Set(me ? await ownWorkspaces(tx, me) : []);
      return all.filter((w) => own.has(w.id));
    });
  }

  @Post()
  @Allow('people.manage')
  async add(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = workspaceInput.safeParse(body);
    if (!input.success) throw badRequest('workspaceInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      if ((await listWorkspaces(tx)).some((w) => same(w.name, input.data.name))) throw conflict('workspaceExists');
      const id = await addWorkspace(tx, await this.clean(tx, input.data));
      return (await listWorkspaces(tx)).find((w) => w.id === id);
    });
  }

  @Put(':id')
  @Allow('people.manage')
  async change(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const target = idParam.safeParse(id);
    const input = workspaceInput.safeParse(body);
    if (!target.success || !input.success) throw badRequest('workspaceInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const workspaces = await listWorkspaces(tx);
      if (!workspaces.some((w) => w.id === target.data)) throw notFound('workspaceNotFound');
      if (workspaces.some((w) => w.id !== target.data && same(w.name, input.data.name)))
        throw conflict('workspaceExists');
      await updateWorkspace(tx, target.data, await this.clean(tx, input.data));
      return (await listWorkspaces(tx)).find((w) => w.id === target.data);
    });
  }

  @Delete(':id')
  @Allow('people.manage')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw badRequest('nothingToDelete');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const workspaces = await listWorkspaces(tx);
      if (!workspaces.some((w) => w.id === target.data)) throw notFound('workspaceNotFound');
      if (workspaces.length <= 1) throw badRequest('lastWorkspace');
      await deleteWorkspace(tx, target.data);
    });
  }

  /** Only working teams, and only reviewers, team leads and trainers (admins see everything anyway). */
  private async clean(tx: Tx, input: z.infer<typeof workspaceInput>) {
    const working = new Set((await listTeams(tx)).filter((t) => !t.isAdministration).map((t) => t.id));
    const staff = new Set((await listPeople(tx)).filter((p) => isWorkspaceStaff(p.role)).map((p) => p.membershipId));
    return {
      ...input,
      teamIds: unique(input.teamIds).filter((id) => working.has(id)),
      staffIds: unique(input.staffIds).filter((id) => staff.has(id)),
    };
  }
}

@Controller('skills')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class SkillsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('people.read')
  list(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, (tx) => listSkills(tx));
  }

  @Post()
  @Allow('people.manage')
  async add(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = skillInput.safeParse(body);
    if (!input.success) throw badRequest('skillInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const list = await listSkills(tx);
      if (list.some((s) => s.kind === input.data.kind && same(s.name, input.data.name))) throw conflict('skillExists');
      const id = await addSkill(tx, input.data.kind, input.data.name);
      return (await listSkills(tx)).find((s) => s.id === id);
    });
  }

  @Patch(':id')
  @Allow('people.manage')
  async rename(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const target = idParam.safeParse(id);
    const input = skillRename.safeParse(body);
    if (!target.success || !input.success) throw badRequest('nameMissing');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const list = await listSkills(tx);
      const skill = list.find((s) => s.id === target.data);
      if (!skill) throw notFound('skillNotFound');
      if (list.some((s) => s.id !== skill.id && s.kind === skill.kind && same(s.name, input.data.name)))
        throw conflict('skillExists');
      await renameSkill(tx, skill.id, input.data.name);
      return (await listSkills(tx)).find((s) => s.id === skill.id);
    });
  }

  @Delete(':id')
  @Allow('people.manage')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw badRequest('nothingToDelete');
    await withCompany(this.db, membership.companyId, async (tx) => {
      if (!(await listSkills(tx)).some((s) => s.id === target.data)) throw notFound('skillNotFound');
      await deleteSkill(tx, target.data);
    });
  }
}
