import { isStaff, type Role } from '@qsmart/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import {
  companies,
  memberships,
  membershipSkills,
  skills,
  teams,
  teamSkills,
  users,
  workspaces,
  workspaceStaff,
  workspaceTeams,
} from './schema.js';

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
 * role), plus a second company where only the admin is a member, to show the company wall. Then gives the demo
 * company its first workspace, team leads, skills and languages (see seedDemoSetup). Safe to run again.
 * Runs as qsmart_owner: the wall doesn't apply to the tables' owner.
 */
export async function seedDemo(owner: Db): Promise<void> {
  await owner
    .insert(users)
    .values({ ...DEMO_OWNER, isPlatformAdmin: true })
    .onConflictDoNothing({ target: users.email });
  const existing = await owner.select({ id: companies.id }).from(companies).where(eq(companies.name, DEMO_COMPANY));
  if (!existing.length) await createDemoCompanies(owner);
  await seedDemoSetup(owner);
}

async function createDemoCompanies(owner: Db): Promise<void> {
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

/** Made-up skills and languages of the demo company, and which team has which (as in today's demo). */
const DEMO_SKILLS = ['Sales', 'Retention', 'Objection handling', 'Account management', 'Negotiation'];
const DEMO_LANGUAGES = ['English', 'French', 'Bulgarian'];
const DEMO_TEAMS: Record<string, { description: string; color: string; skills: string[] }> = {
  Administration: { description: 'Admins, reviewers, team leads and trainers', color: '#475569', skills: [] },
  B2C: {
    description: 'Consumer sales and retention',
    color: '#2563eb',
    skills: ['English', 'French', 'Sales', 'Retention', 'Objection handling'],
  },
  B2B: {
    description: 'Business accounts and partnerships',
    color: '#7c3aed',
    skills: ['English', 'Account management', 'Negotiation'],
  },
};

/**
 * The demo company's first workspace (B2C and B2B, with the reviewer, team lead and trainer), its teams' details and
 * leads, and its skills and languages. Done once, while the company has no workspace yet (a company always keeps at
 * least one afterwards), so it never undoes what you changed.
 */
async function seedDemoSetup(owner: Db): Promise<void> {
  await owner.transaction(async (tx) => {
    const [demo] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.name, DEMO_COMPANY));
    if (!demo) return;
    const companyId = demo.id;
    const [hasWorkspace] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.companyId, companyId))
      .limit(1);
    if (hasWorkspace) return;
    const members = await tx
      .select({ id: memberships.id, firebaseUid: users.firebaseUid, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.companyId, companyId));
    const memberOf = (firebaseUid: string) => members.find((m) => m.firebaseUid === firebaseUid)?.id;
    const madeSkills = await tx
      .insert(skills)
      .values([
        ...DEMO_SKILLS.map((name) => ({ companyId, kind: 'skill' as const, name })),
        ...DEMO_LANGUAGES.map((name) => ({ companyId, kind: 'language' as const, name })),
      ])
      .onConflictDoNothing()
      .returning();
    const skillId = (name: string) => madeSkills.find((s) => s.name === name)?.id;
    const companyTeams = await tx.select().from(teams).where(eq(teams.companyId, companyId));
    const lead = memberOf('demo-lead') ?? null;
    for (const team of companyTeams) {
      const details = DEMO_TEAMS[team.name];
      if (!details) continue;
      await tx
        .update(teams)
        .set({
          description: team.description || details.description,
          color: details.color,
          leadId: team.leadId ?? (team.isAdministration ? null : lead),
        })
        .where(eq(teams.id, team.id));
      const ids = details.skills.map(skillId).filter((id): id is string => Boolean(id));
      if (ids.length)
        await tx
          .insert(teamSkills)
          .values(ids.map((id) => ({ companyId, teamId: team.id, skillId: id })))
          .onConflictDoNothing();
    }
    const [workspace] = await tx
      .insert(workspaces)
      .values({ companyId, name: 'Customer care', description: 'The B2C and B2B teams', color: '#0d9488' })
      .returning();
    if (!workspace) return;
    const working = companyTeams.filter((t) => !t.isAdministration);
    if (working.length)
      await tx
        .insert(workspaceTeams)
        .values(working.map((t) => ({ companyId, workspaceId: workspace.id, teamId: t.id })));
    const staff = members.filter((m) => m.role === 'reviewer' || m.role === 'lead' || m.role === 'trainer');
    if (staff.length)
      await tx
        .insert(workspaceStaff)
        .values(staff.map((m) => ({ companyId, workspaceId: workspace.id, membershipId: m.id })));
    const agent = memberOf('demo-agent');
    const agentSkills = ['English', 'Sales'].map(skillId).filter((id): id is string => Boolean(id));
    if (agent && agentSkills.length)
      await tx
        .insert(membershipSkills)
        .values(agentSkills.map((id) => ({ companyId, membershipId: agent, skillId: id })))
        .onConflictDoNothing();
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
    const [membership] = await tx
      .insert(memberships)
      .values({ companyId: demo.id, userId, role: person.role, teamId: team?.id ?? null })
      .onConflictDoUpdate({
        target: [memberships.companyId, memberships.userId],
        set: { role: person.role, teamId: team?.id ?? null },
      })
      .returning({ id: memberships.id });
    // reviewers, team leads and trainers go into the first workspace, as when an admin invites them
    if (membership && (person.role === 'reviewer' || person.role === 'lead' || person.role === 'trainer')) {
      const [first] = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.companyId, demo.id))
        .orderBy(workspaces.createdAt)
        .limit(1);
      if (first)
        await tx
          .insert(workspaceStaff)
          .values({ companyId: demo.id, workspaceId: first.id, membershipId: membership.id })
          .onConflictDoNothing();
    }
  });
}
