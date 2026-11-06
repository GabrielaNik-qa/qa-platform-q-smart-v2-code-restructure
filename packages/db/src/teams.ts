// Teams, workspaces, skills and languages of a company: always read and changed behind the company wall
// (inside withCompany). The rules about them (who may, what is allowed) are checked by the server.
import type { Scope } from '@qsmart/shared';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { grouped } from './group.js';
import { administrationTeam, membershipOfUser } from './people.js';
import {
  memberships,
  membershipSkills,
  skills,
  teams,
  teamSkills,
  users,
  workspaces,
  workspaceScorecards,
  workspaceStaff,
  workspaceTeams,
} from './schema.js';

/** The company named for this transaction: new rows always land in it (the wall refuses any other). */
const thisCompany = sql<string>`app_company()`;

// ------------------------------------------------------------------------------------------------ teams

export interface Team {
  id: string;
  name: string;
  isAdministration: boolean;
  description: string;
  color: string;
  /** the lead's membership, or null when the team has none (yet) */
  leadId: string | null;
  leadName: string | null;
  members: number;
  /** its skills and languages */
  skillIds: string[];
}

export interface TeamChange {
  name: string;
  description: string;
  color: string;
  leadId: string | null;
  skillIds: string[];
}

/** Administration first, then the working teams by name. */
export async function listTeams(tx: Tx): Promise<Team[]> {
  const rows = await tx
    .select({
      id: teams.id,
      name: teams.name,
      isAdministration: teams.isAdministration,
      description: teams.description,
      color: teams.color,
      leadId: teams.leadId,
      leadName: users.name,
    })
    .from(teams)
    .leftJoin(memberships, eq(memberships.id, teams.leadId))
    .leftJoin(users, eq(users.id, memberships.userId))
    .orderBy(desc(teams.isAdministration), asc(teams.name));
  const counts = await tx
    .select({ teamId: memberships.teamId, n: sql<number>`count(*)::int` })
    .from(memberships)
    .groupBy(memberships.teamId);
  const links = grouped(await tx.select({ owner: teamSkills.teamId, id: teamSkills.skillId }).from(teamSkills));
  return rows.map((t) => ({
    ...t,
    members: counts.find((c) => c.teamId === t.id)?.n ?? 0,
    skillIds: links.get(t.id) ?? [],
  }));
}

export async function addTeam(tx: Tx, team: TeamChange): Promise<string> {
  const [row] = await tx
    .insert(teams)
    .values({
      companyId: thisCompany,
      name: team.name,
      description: team.description,
      color: team.color,
      leadId: team.leadId,
    })
    .returning({ id: teams.id });
  if (!row) throw new Error('The team was not saved.');
  await setTeamSkills(tx, row.id, team.skillIds);
  return row.id;
}

export async function updateTeam(tx: Tx, id: string, team: TeamChange): Promise<void> {
  await tx
    .update(teams)
    .set({ name: team.name, description: team.description, color: team.color, leadId: team.leadId })
    .where(eq(teams.id, id));
  await setTeamSkills(tx, id, team.skillIds);
}

async function setTeamSkills(tx: Tx, teamId: string, skillIds: string[]): Promise<void> {
  await tx.delete(teamSkills).where(eq(teamSkills.teamId, teamId));
  if (skillIds.length)
    await tx.insert(teamSkills).values(skillIds.map((skillId) => ({ companyId: thisCompany, teamId, skillId })));
}

export async function deleteTeam(tx: Tx, id: string): Promise<void> {
  await tx.delete(teams).where(eq(teams.id, id));
}

/** A person who is no longer staff can't lead a team: their teams wait for a new lead. */
export async function stopLeading(tx: Tx, membershipId: string): Promise<void> {
  await tx.update(teams).set({ leadId: null }).where(eq(teams.leadId, membershipId));
}

/**
 * The teams a member may see, as today: null when they see every team (admins, and everybody while the company has
 * no workspaces). Otherwise Administration and the teams of their own workspaces; agents also see their own team.
 */
export async function visibleTeams(tx: Tx, userId: string, scope: Scope): Promise<Set<string> | null> {
  if (scope === 'all') return null;
  const [anyWorkspace] = await tx.select({ id: workspaces.id }).from(workspaces).limit(1);
  if (!anyWorkspace) return null;
  const seen = new Set<string>();
  const admin = await administrationTeam(tx);
  if (admin) seen.add(admin);
  const me = await membershipOfUser(tx, userId);
  if (!me) return seen;
  if (me.role === 'agent' && me.teamId) seen.add(me.teamId);
  const own = await ownWorkspaces(tx, me);
  if (own.length) {
    const rows = await tx
      .select({ teamId: workspaceTeams.teamId })
      .from(workspaceTeams)
      .where(inArray(workspaceTeams.workspaceId, own));
    for (const r of rows) seen.add(r.teamId);
  }
  return seen;
}

// ------------------------------------------------------------------------------------------------ workspaces

export interface Workspace {
  id: string;
  name: string;
  description: string;
  color: string;
  teamIds: string[];
  /** memberships of its reviewers, team leads and trainers */
  staffIds: string[];
  /** the scorecards its people use (Phase 2) */
  scorecardIds: string[];
}

export type WorkspaceChange = Omit<Workspace, 'id'>;

/** In the order they were made: the first one is where new staff and new teams go by default (as today). */
export async function listWorkspaces(tx: Tx): Promise<Workspace[]> {
  const rows = await tx
    .select({ id: workspaces.id, name: workspaces.name, description: workspaces.description, color: workspaces.color })
    .from(workspaces)
    .orderBy(asc(workspaces.createdAt), asc(workspaces.name));
  const teamLinks = grouped(
    await tx.select({ owner: workspaceTeams.workspaceId, id: workspaceTeams.teamId }).from(workspaceTeams),
  );
  const staffLinks = grouped(
    await tx.select({ owner: workspaceStaff.workspaceId, id: workspaceStaff.membershipId }).from(workspaceStaff),
  );
  const scorecardLinks = grouped(
    await tx
      .select({ owner: workspaceScorecards.workspaceId, id: workspaceScorecards.scorecardId })
      .from(workspaceScorecards),
  );
  return rows.map((w) => ({
    ...w,
    teamIds: teamLinks.get(w.id) ?? [],
    staffIds: staffLinks.get(w.id) ?? [],
    scorecardIds: scorecardLinks.get(w.id) ?? [],
  }));
}

/** The workspaces a member is in: staff explicitly, agents through their team. */
export async function ownWorkspaces(
  tx: Tx,
  me: { id: string; role: string; teamId: string | null },
): Promise<string[]> {
  if (me.role === 'agent') {
    if (!me.teamId) return [];
    const rows = await tx
      .select({ id: workspaceTeams.workspaceId })
      .from(workspaceTeams)
      .where(eq(workspaceTeams.teamId, me.teamId));
    return rows.map((r) => r.id);
  }
  const rows = await tx
    .select({ id: workspaceStaff.workspaceId })
    .from(workspaceStaff)
    .where(eq(workspaceStaff.membershipId, me.id));
  return rows.map((r) => r.id);
}

export async function addWorkspace(tx: Tx, workspace: WorkspaceChange): Promise<string> {
  const [row] = await tx
    .insert(workspaces)
    .values({
      companyId: thisCompany,
      name: workspace.name,
      description: workspace.description,
      color: workspace.color,
    })
    .returning({ id: workspaces.id });
  if (!row) throw new Error('The workspace was not saved.');
  await setWorkspaceLinks(tx, row.id, workspace);
  return row.id;
}

export async function updateWorkspace(tx: Tx, id: string, workspace: WorkspaceChange): Promise<void> {
  await tx
    .update(workspaces)
    .set({ name: workspace.name, description: workspace.description, color: workspace.color })
    .where(eq(workspaces.id, id));
  await setWorkspaceLinks(tx, id, workspace);
}

async function setWorkspaceLinks(tx: Tx, workspaceId: string, w: WorkspaceChange): Promise<void> {
  await tx.delete(workspaceTeams).where(eq(workspaceTeams.workspaceId, workspaceId));
  await tx.delete(workspaceStaff).where(eq(workspaceStaff.workspaceId, workspaceId));
  await tx.delete(workspaceScorecards).where(eq(workspaceScorecards.workspaceId, workspaceId));
  if (w.scorecardIds.length)
    await tx
      .insert(workspaceScorecards)
      .values(w.scorecardIds.map((scorecardId) => ({ companyId: thisCompany, workspaceId, scorecardId })));
  if (w.teamIds.length)
    await tx
      .insert(workspaceTeams)
      .values(w.teamIds.map((teamId) => ({ companyId: thisCompany, workspaceId, teamId })));
  if (w.staffIds.length)
    await tx
      .insert(workspaceStaff)
      .values(w.staffIds.map((membershipId) => ({ companyId: thisCompany, workspaceId, membershipId })));
}

export async function deleteWorkspace(tx: Tx, id: string): Promise<void> {
  await tx.delete(workspaces).where(eq(workspaces.id, id));
}

export async function addTeamToWorkspace(tx: Tx, teamId: string, workspaceId: string): Promise<void> {
  await tx.insert(workspaceTeams).values({ companyId: thisCompany, workspaceId, teamId }).onConflictDoNothing();
}

/** Sets the workspaces of a reviewer, team lead or trainer (an empty list takes them out of all of them). */
export async function setStaffWorkspaces(tx: Tx, membershipId: string, workspaceIds: string[]): Promise<void> {
  await tx.delete(workspaceStaff).where(eq(workspaceStaff.membershipId, membershipId));
  if (workspaceIds.length)
    await tx
      .insert(workspaceStaff)
      .values(workspaceIds.map((workspaceId) => ({ companyId: thisCompany, workspaceId, membershipId })));
}

// ------------------------------------------------------------------------------------------------ skills and languages

export type SkillKind = 'skill' | 'language';

export interface Skill {
  id: string;
  kind: SkillKind;
  name: string;
  /** how many people and teams have it */
  people: number;
  teams: number;
}

export async function listSkills(tx: Tx): Promise<Skill[]> {
  const rows = await tx
    .select({ id: skills.id, kind: skills.kind, name: skills.name })
    .from(skills)
    .orderBy(asc(skills.kind), sql`lower(${skills.name})`);
  const people = await tx
    .select({ id: membershipSkills.skillId, n: sql<number>`count(*)::int` })
    .from(membershipSkills)
    .groupBy(membershipSkills.skillId);
  const inTeams = await tx
    .select({ id: teamSkills.skillId, n: sql<number>`count(*)::int` })
    .from(teamSkills)
    .groupBy(teamSkills.skillId);
  return rows.map((s) => ({
    ...s,
    people: people.find((p) => p.id === s.id)?.n ?? 0,
    teams: inTeams.find((p) => p.id === s.id)?.n ?? 0,
  }));
}

export async function addSkill(tx: Tx, kind: SkillKind, name: string): Promise<string> {
  const [row] = await tx.insert(skills).values({ companyId: thisCompany, kind, name }).returning({ id: skills.id });
  if (!row) throw new Error('The skill was not saved.');
  return row.id;
}

/** People and teams point at the skill, so a new name shows everywhere at once. */
export async function renameSkill(tx: Tx, id: string, name: string): Promise<void> {
  await tx.update(skills).set({ name }).where(eq(skills.id, id));
}

/** Also taken away from every person and team that had it (as today). */
export async function deleteSkill(tx: Tx, id: string): Promise<void> {
  await tx.delete(skills).where(eq(skills.id, id));
}

export async function setPersonSkills(tx: Tx, membershipId: string, skillIds: string[]): Promise<void> {
  await tx.delete(membershipSkills).where(eq(membershipSkills.membershipId, membershipId));
  if (skillIds.length)
    await tx
      .insert(membershipSkills)
      .values(skillIds.map((skillId) => ({ companyId: thisCompany, membershipId, skillId })));
}
