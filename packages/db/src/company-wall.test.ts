// The company wall: these tests try to reach another company's data in every way the server could.
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client.js';
import { claimInvitation, membershipsFor, withCompany } from './company.js';
import { isPlatformAdmin, platformCompanies, platformCreateCompany } from './platform.js';
import { startLocalPostgres, type LocalPostgres } from './local-postgres.js';
import { runMigrations } from './migrate.js';
import {
  companies,
  memberships,
  membershipSkills,
  skills,
  teams,
  users,
  workspaces,
  workspaceTeams,
} from './schema.js';
import { addSkill, addWorkspace, listSkills, listTeams, listWorkspaces } from './teams.js';

let server: LocalPostgres;
let owner: Db; // owns the tables: used here only to prepare the test data
let app: Db; // what the server uses: always behind the company wall
let A = '';
let B = '';
let salesOfB = '';
let sam = '';

function found<T>(row: T | undefined): T {
  if (!row) throw new Error('test data missing');
  return row;
}

beforeAll(async () => {
  server = await startLocalPostgres();
  await runMigrations(server.ownerUrl);
  owner = createDb(server.ownerUrl);
  app = createDb(server.appUrl);

  const [a, b] = await owner
    .insert(companies)
    .values([{ name: 'Company A' }, { name: 'Company B' }])
    .returning();
  if (!a || !b) throw new Error('companies not created');
  A = a.id;
  B = b.id;
  const t = await owner
    .insert(teams)
    .values([
      { companyId: A, name: 'Administration', isAdministration: true },
      { companyId: A, name: 'B2C' },
      { companyId: B, name: 'Administration', isAdministration: true },
      { companyId: B, name: 'Sales' },
    ])
    .returning();
  const team = (company: string, name: string) => found(t.find((x) => x.companyId === company && x.name === name)).id;
  salesOfB = team(B, 'Sales');
  const people = await owner
    .insert(users)
    .values([
      { firebaseUid: 'uid-ann', email: 'ann@a.test', name: 'Ann' },
      { firebaseUid: 'uid-bob', email: 'bob@b.test', name: 'Bob' },
      { firebaseUid: 'uid-sam', email: 'sam@both.test', name: 'Sam' },
    ])
    .returning();
  const person = (name: string) => found(people.find((p) => p.name === name)).id;
  sam = person('Sam');
  await owner.insert(memberships).values([
    { companyId: A, userId: person('Ann'), role: 'admin', teamId: team(A, 'Administration') },
    { companyId: A, userId: sam, role: 'agent', teamId: team(A, 'B2C') },
    { companyId: B, userId: person('Bob'), role: 'admin', teamId: team(B, 'Administration') },
    { companyId: B, userId: sam, role: 'reviewer', teamId: team(B, 'Administration') },
  ]);
}, 180_000);

afterAll(async () => {
  await owner?.$client.end();
  await app?.$client.end();
  await server?.stop();
});

/** The PostgreSQL error code of a refused query (42501 = not allowed, 23503 = points at a missing row). */
const refusal = (query: Promise<unknown>) =>
  query.then(
    () => 'accepted',
    (error: { code?: string; cause?: { code?: string } }) => error.cause?.code ?? error.code ?? 'unknown error',
  );

const teamNames = (company: string) =>
  withCompany(app, company, (tx) => tx.select({ name: teams.name }).from(teams).orderBy(teams.name)).then((rows) =>
    rows.map((r) => r.name),
  );

describe('the company wall', () => {
  it('shows each company only its own rows', async () => {
    expect(await teamNames(A)).toEqual(['Administration', 'B2C']);
    expect(await teamNames(B)).toEqual(['Administration', 'Sales']);
    const own = await withCompany(app, A, (tx) => tx.select({ name: companies.name }).from(companies));
    expect(own).toEqual([{ name: 'Company A' }]);
  });

  it('shows nothing at all when no company is named', async () => {
    expect(await app.select().from(teams)).toEqual([]);
    expect(await app.select().from(companies)).toEqual([]);
    expect(await app.select().from(memberships)).toEqual([]);
    expect(await app.select().from(users)).toEqual([]);
  });

  it('refuses to add a row for another company', async () => {
    expect(await refusal(withCompany(app, A, (tx) => tx.insert(teams).values({ companyId: B, name: 'Sneaky' })))).toBe(
      '42501',
    );
    expect(await teamNames(B)).toEqual(['Administration', 'Sales']);
  });

  it("can't change or delete another company's rows", async () => {
    const changed = await withCompany(app, A, (tx) =>
      tx.update(teams).set({ name: 'Hacked' }).where(eq(teams.companyId, B)).returning(),
    );
    const deleted = await withCompany(app, A, (tx) => tx.delete(teams).where(eq(teams.companyId, B)).returning());
    expect(changed).toEqual([]);
    expect(deleted).toEqual([]);
    expect(await teamNames(B)).toEqual(['Administration', 'Sales']);
  });

  it('shows a person only to the companies they belong to', async () => {
    const names = (company: string) =>
      withCompany(app, company, (tx) => tx.select({ name: users.name }).from(users).orderBy(users.name)).then((rows) =>
        rows.map((r) => r.name),
      );
    expect(await names(A)).toEqual(['Ann', 'Sam']);
    expect(await names(B)).toEqual(['Bob', 'Sam']);
  });

  it('finds all the companies of a person at sign-in, and nothing else', async () => {
    const samsCompanies = await membershipsFor(app, 'uid-sam');
    expect(samsCompanies.map((m) => [m.companyName, m.role])).toEqual([
      ['Company A', 'agent'],
      ['Company B', 'reviewer'],
    ]);
    expect((await membershipsFor(app, 'uid-ann')).map((m) => m.companyName)).toEqual(['Company A']);
    expect(await membershipsFor(app, 'uid-nobody')).toEqual([]);
  });

  it("never links a membership to another company's team", async () => {
    const linked = withCompany(app, A, (tx) =>
      tx.update(memberships).set({ teamId: salesOfB }).where(eq(memberships.userId, sam)).returning(),
    );
    expect(await refusal(linked)).toBe('23503');
  });

  it("the server's database user can't switch the wall off", async () => {
    const me = await app.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
    );
    expect(me.rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
    expect(await refusal(app.execute(sql`alter table teams disable row level security`))).toBe('42501');
  });

  it('has the wall switched on for every table', async () => {
    const open = await owner.execute<{ relname: string }>(
      sql`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(open.rows).toEqual([]);
  });

  it('accepts only a real company id', () => {
    expect(() => withCompany(app, "x' or 1=1 --", async () => 1)).toThrow();
  });

  it("lets nobody make themselves platform owner, or take another person's account", async () => {
    const promote = withCompany(app, A, (tx) =>
      tx.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, sam)),
    );
    expect(await refusal(promote)).toBe('42501');
    const steal = withCompany(app, A, (tx) =>
      tx.update(users).set({ firebaseUid: 'uid-thief' }).where(eq(users.id, sam)),
    );
    expect(await refusal(steal)).toBe('42501');
    const rename = await withCompany(app, A, (tx) =>
      tx.update(users).set({ name: 'Sam S.' }).where(eq(users.id, sam)).returning({ name: users.name }),
    );
    expect(rename).toEqual([{ name: 'Sam S.' }]);
  });
});

describe('the platform owner area', () => {
  beforeAll(async () => {
    await owner.insert(users).values({ firebaseUid: 'uid-owner', email: 'owner@qsmart.test', name: 'Owner' });
    await owner.update(users).set({ isPlatformAdmin: true }).where(eq(users.firebaseUid, 'uid-owner'));
  });

  it('shows all companies to the platform owner, and nothing to anyone else', async () => {
    const list = await platformCompanies(app, 'uid-owner');
    expect(list.map((c) => [c.name, c.people, c.admins])).toEqual([
      ['Company A', 2, 1],
      ['Company B', 2, 1],
    ]);
    expect(await platformCompanies(app, 'uid-ann')).toEqual([]);
    expect(await isPlatformAdmin(app, 'uid-owner')).toBe(true);
    expect(await isPlatformAdmin(app, 'uid-ann')).toBe(false);
  });

  it('creates a client company with its Administration team and first admin, for the owner only', async () => {
    expect(
      await refusal(platformCreateCompany(app, 'uid-ann', { name: 'Sneaky', adminEmail: 'x@x.test', adminName: 'X' })),
    ).toBe('42501');
    const id = await platformCreateCompany(app, 'uid-owner', {
      name: 'Company C',
      adminEmail: 'Carla@C.test',
      adminName: 'Carla',
    });
    expect(await teamNames(id)).toEqual(['Administration']);
    expect(await claimInvitation(app, 'uid-carla', 'carla@c.test')).toBe(true);
    expect((await membershipsFor(app, 'uid-carla')).map((m) => [m.companyName, m.role])).toEqual([
      ['Company C', 'admin'],
    ]);
  });
});

describe('teams, workspaces, skills and languages behind the wall', () => {
  const bob = async () =>
    found(
      (
        await owner
          .select({ id: memberships.id })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(eq(users.name, 'Bob'))
      )[0],
    ).id;

  it("never puts another company's team in a workspace", async () => {
    const sneaky = withCompany(app, A, (tx) =>
      addWorkspace(tx, { name: 'Sneaky', description: '', color: '#2563eb', teamIds: [salesOfB], staffIds: [] }),
    );
    expect(await refusal(sneaky)).toBe('23503');
    const own = await withCompany(app, A, (tx) =>
      addWorkspace(tx, { name: 'Main', description: '', color: '#2563eb', teamIds: [], staffIds: [] }),
    );
    expect((await withCompany(app, B, (tx) => listWorkspaces(tx))).map((w) => w.id)).not.toContain(own);
    const intoB = withCompany(app, B, (tx) =>
      tx.insert(workspaceTeams).values({ companyId: A, workspaceId: own, teamId: salesOfB }),
    );
    expect(await refusal(intoB)).toBe('42501');
  });

  it("keeps each company's skills and languages to itself", async () => {
    const french = await withCompany(app, B, (tx) => addSkill(tx, 'language', 'French'));
    expect((await withCompany(app, A, (tx) => listSkills(tx))).map((s) => s.name)).not.toContain('French');
    const samInA = found(
      (
        await owner
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.companyId, A), eq(memberships.userId, sam)))
      )[0],
    ).id;
    const borrowed = withCompany(app, A, (tx) =>
      tx.insert(membershipSkills).values({ companyId: A, membershipId: samInA, skillId: french }),
    );
    expect(await refusal(borrowed)).toBe('23503');
    const renamedFromA = await withCompany(app, A, (tx) =>
      tx.update(skills).set({ name: 'Hacked' }).where(eq(skills.id, french)).returning(),
    );
    expect(renamedFromA).toEqual([]);
  });

  it('never makes a team Administration, a second Administration, or a lead from another company', async () => {
    const promote = withCompany(app, A, (tx) => tx.update(teams).set({ isAdministration: true }));
    expect(await refusal(promote)).toBe('42501');
    const second = withCompany(app, A, (tx) =>
      tx.insert(teams).values({ companyId: A, name: 'Admin 2', isAdministration: true }),
    );
    expect(await refusal(second)).toBe('23505');
    const bobInB = await bob();
    const foreignLead = withCompany(app, A, (tx) =>
      tx.update(teams).set({ leadId: bobInB }).where(eq(teams.name, 'B2C')),
    );
    expect(await refusal(foreignLead)).toBe('23503');
  });

  it('leaves a team without a lead when the lead leaves the company', async () => {
    const bobId = await bob();
    await withCompany(app, B, (tx) => tx.update(teams).set({ leadId: bobId }).where(eq(teams.id, salesOfB)));
    expect((await withCompany(app, B, (tx) => listTeams(tx))).find((t) => t.id === salesOfB)?.leadName).toBe('Bob');
    await owner.delete(memberships).where(eq(memberships.id, bobId));
    const sales = (await withCompany(app, B, (tx) => listTeams(tx))).find((t) => t.id === salesOfB);
    expect(sales?.leadId).toBeNull();
    expect(await owner.select().from(workspaces).where(eq(workspaces.companyId, B))).toEqual([]);
  });
});
