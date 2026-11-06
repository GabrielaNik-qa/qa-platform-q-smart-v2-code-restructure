// The company wall: these tests try to reach another company's data in every way the server could.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client.js';
import { membershipsFor, withCompany } from './company.js';
import { startLocalPostgres, type LocalPostgres } from './local-postgres.js';
import { runMigrations } from './migrate.js';
import { companies, memberships, teams, users } from './schema.js';

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
});
