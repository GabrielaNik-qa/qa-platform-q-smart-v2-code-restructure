// The people of a company: always read and changed behind the company wall (inside withCompany).
import type { Role } from '@qsmart/shared';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { grouped } from './group.js';
import { memberships, membershipSkills, teams, users, workspaceStaff, workspaceTeams } from './schema.js';

export interface Person {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  teamId: string | null;
  teamName: string | null;
  active: boolean;
  /** false while the invitation waits for the person's first sign-in */
  accepted: boolean;
  /** their skills and languages */
  skillIds: string[];
  /** staff: the workspaces they are in; agents: the workspaces of their team */
  workspaceIds: string[];
}

export async function listPeople(tx: Tx): Promise<Person[]> {
  const rows = await tx
    .select({
      membershipId: memberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      teamId: memberships.teamId,
      teamName: teams.name,
      active: memberships.active,
      accepted: sql<boolean>`${users.firebaseUid} is not null`,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(teams, eq(teams.id, memberships.teamId))
    .orderBy(users.name);
  const skills = grouped(
    await tx.select({ owner: membershipSkills.membershipId, id: membershipSkills.skillId }).from(membershipSkills),
  );
  const staffIn = grouped(
    await tx.select({ owner: workspaceStaff.membershipId, id: workspaceStaff.workspaceId }).from(workspaceStaff),
  );
  const teamIn = grouped(
    await tx.select({ owner: workspaceTeams.teamId, id: workspaceTeams.workspaceId }).from(workspaceTeams),
  );
  return rows.map((p) => ({
    ...p,
    skillIds: skills.get(p.membershipId) ?? [],
    workspaceIds: (p.role === 'agent' ? teamIn.get(p.teamId ?? '') : staffIn.get(p.membershipId)) ?? [],
  }));
}

export async function getPerson(tx: Tx, membershipId: string): Promise<Person | undefined> {
  return (await listPeople(tx)).find((p) => p.membershipId === membershipId);
}

export interface MembershipRow {
  id: string;
  userId: string;
  role: Role;
  teamId: string | null;
  active: boolean;
}

const membershipColumns = {
  id: memberships.id,
  userId: memberships.userId,
  role: memberships.role,
  teamId: memberships.teamId,
  active: memberships.active,
};

export async function findMembership(tx: Tx, membershipId: string): Promise<MembershipRow | undefined> {
  const [row] = await tx.select(membershipColumns).from(memberships).where(eq(memberships.id, membershipId));
  return row;
}

/** A person's membership in the company of this transaction. */
export async function membershipOfUser(tx: Tx, userId: string): Promise<MembershipRow | undefined> {
  const [row] = await tx.select(membershipColumns).from(memberships).where(eq(memberships.userId, userId));
  return row;
}

/** The company's Administration team (staff always sit there, as today). */
export async function administrationTeam(tx: Tx): Promise<string | undefined> {
  const [team] = await tx.select({ id: teams.id }).from(teams).where(eq(teams.isAdministration, true));
  return team?.id;
}

export async function isAgentTeam(tx: Tx, teamId: string): Promise<boolean> {
  const [team] = await tx
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.isAdministration, false)));
  return Boolean(team);
}

/** How many other active admins the company has (a company must always keep one). */
export async function otherActiveAdmins(tx: Tx, membershipId: string): Promise<number> {
  const rows = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.role, 'admin'), eq(memberships.active, true), ne(memberships.id, membershipId)));
  return rows.length;
}

/** Invites a person (checked again in the database: the caller must be an active admin of this company). */
export async function invitePerson(
  tx: Tx,
  callerUid: string,
  person: { email: string; name: string; role: Role; teamId: string },
): Promise<string> {
  const result = await tx.execute<{ id: string }>(
    sql`select invite_person(${callerUid}, ${person.email}, ${person.name}, ${person.role}::member_role, ${person.teamId}::uuid) as id`,
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('The invitation was not saved.');
  return id;
}

export async function updateMembership(
  tx: Tx,
  membershipId: string,
  change: { role: Role; teamId: string; active: boolean },
): Promise<void> {
  await tx.update(memberships).set(change).where(eq(memberships.id, membershipId));
}

export async function removeMembership(tx: Tx, membershipId: string): Promise<void> {
  await tx.delete(memberships).where(eq(memberships.id, membershipId));
}
