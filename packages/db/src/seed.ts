import { isStaff, type Role } from '@qsmart/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { companies, memberships, teams, users } from './schema.js';

export interface DemoPerson {
  firebaseUid: string;
  email: string;
  name: string;
  role: Role;
}

/** Made-up demo people, one per role. In Firebase's local test version their password is "password". */
export const DEMO_PEOPLE: readonly DemoPerson[] = [
  { firebaseUid: 'demo-admin', email: 'admin@demo.test', name: 'Ada Admin', role: 'admin' },
  { firebaseUid: 'demo-reviewer', email: 'reviewer@demo.test', name: 'Rita Reviewer', role: 'reviewer' },
  { firebaseUid: 'demo-lead', email: 'lead@demo.test', name: 'Leo Lead', role: 'lead' },
  { firebaseUid: 'demo-trainer', email: 'trainer@demo.test', name: 'Tina Trainer', role: 'trainer' },
  { firebaseUid: 'demo-agent', email: 'agent@demo.test', name: 'Alex Agent', role: 'agent' },
];

/** A made-up owner of Q-smart, for trying the platform owner area with Firebase's local test version. */
export const DEMO_OWNER = { firebaseUid: 'demo-owner', email: 'owner@demo.test', name: 'Olga Owner' } as const;

export const DEMO_COMPANY = 'Q-smart Demo';
export const SECOND_COMPANY = 'Second Demo Company';

/**
 * Fills a fresh database with the demo company (teams Administration, B2C and B2B, as today, and one person per
 * role), plus a second company where only the admin is a member, to show the company wall. Safe to run again.
 * Runs as qsmart_owner: the wall doesn't apply to the tables' owner.
 */
export async function seedDemo(owner: Db): Promise<void> {
  await owner
    .insert(users)
    .values({ ...DEMO_OWNER, isPlatformAdmin: true })
    .onConflictDoNothing({ target: users.email });
  const existing = await owner.select({ id: companies.id }).from(companies).where(eq(companies.name, DEMO_COMPANY));
  if (existing.length) return;
  await owner.transaction(async (tx) => {
    const made = await tx
      .insert(companies)
      .values([{ name: DEMO_COMPANY }, { name: SECOND_COMPANY }])
      .returning();
    const company = (name: string) => {
      const row = made.find((c) => c.name === name);
      if (!row) throw new Error(`company ${name} missing`);
      return row.id;
    };
    const demo = company(DEMO_COMPANY);
    const second = company(SECOND_COMPANY);
    const madeTeams = await tx
      .insert(teams)
      .values([
        { companyId: demo, name: 'Administration', isAdministration: true },
        { companyId: demo, name: 'B2C' },
        { companyId: demo, name: 'B2B' },
        { companyId: second, name: 'Administration', isAdministration: true },
      ])
      .returning();
    const team = (companyId: string, name: string) => {
      const row = madeTeams.find((t) => t.companyId === companyId && t.name === name);
      if (!row) throw new Error(`team ${name} missing`);
      return row.id;
    };
    const people = await tx
      .insert(users)
      .values(DEMO_PEOPLE.map(({ firebaseUid, email, name }) => ({ firebaseUid, email, name })))
      .returning();
    const userId = (firebaseUid: string) => {
      const row = people.find((p) => p.firebaseUid === firebaseUid);
      if (!row) throw new Error(`person ${firebaseUid} missing`);
      return row.id;
    };
    await tx.insert(memberships).values([
      ...DEMO_PEOPLE.map((p) => ({
        companyId: demo,
        userId: userId(p.firebaseUid),
        role: p.role,
        teamId: team(demo, p.role === 'agent' ? 'B2C' : 'Administration'),
      })),
      {
        companyId: second,
        userId: userId('demo-admin'),
        role: 'admin' as const,
        teamId: team(second, 'Administration'),
      },
    ]);
  });
}

/**
 * Invites a person into the demo company by e-mail (used on your PC with the real Firebase project). They get the
 * company the first time they sign in with that e-mail, verified by Firebase. Safe to run again.
 */
export async function inviteToDemo(
  owner: Db,
  person: { email: string; name: string; role: Role; platformAdmin?: boolean },
): Promise<void> {
  const email = person.email.trim().toLowerCase();
  await owner.transaction(async (tx) => {
    const [demo] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.name, DEMO_COMPANY));
    if (!demo) throw new Error('The demo company is missing: start v2 once first.');
    const teamName = isStaff(person.role) ? 'Administration' : 'B2C';
    const [team] = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.companyId, demo.id), eq(teams.name, teamName)));
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`);
    const userId =
      existing?.id ?? (await tx.insert(users).values({ email, name: person.name }).returning({ id: users.id }))[0]?.id;
    if (!userId) throw new Error('The invitation could not be saved.');
    if (person.platformAdmin) await tx.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, userId));
    await tx
      .insert(memberships)
      .values({ companyId: demo.id, userId, role: person.role, teamId: team?.id ?? null })
      .onConflictDoUpdate({
        target: [memberships.companyId, memberships.userId],
        set: { role: person.role, teamId: team?.id ?? null },
      });
  });
}
