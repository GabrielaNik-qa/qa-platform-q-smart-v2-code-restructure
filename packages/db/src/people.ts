// The people of a company: always read and changed behind the company wall (inside withCompany).
import type { Role } from '@qsmart/shared';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { memberships, teams, users } from './schema.js';

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
  return rows;
}

export async function getPerson(tx: Tx, membershipId: string): Promise<Person | undefined> {
  return (await listPeople(tx)).find((p) => p.membershipId === membershipId);
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
