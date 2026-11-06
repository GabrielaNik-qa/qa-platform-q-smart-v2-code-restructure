// People in a company: invitations, roles, teams, accounts switched off, and the company wall around them.
import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  createDb,
  type Db,
  DEMO_COMPANY,
  type LocalPostgres,
  runMigrations,
  schema,
  SECOND_COMPANY,
  seedDemo,
  startLocalPostgres,
} from '@qsmart/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { TokenVerifier, VerifiedPerson } from './auth/token-verifier.js';

const PEOPLE: Record<string, VerifiedPerson> = {
  admin: { uid: 'demo-admin', email: 'admin@demo.test', emailVerified: true },
  reviewer: { uid: 'demo-reviewer', email: 'reviewer@demo.test', emailVerified: true },
  agent: { uid: 'demo-agent', email: 'agent@demo.test', emailVerified: true },
  stranger: { uid: 'stranger', email: 'stranger@other.test', emailVerified: true },
  nina: { uid: 'nina-google', email: 'nina@demo.test', emailVerified: true },
};
const verifier: TokenVerifier = {
  async verify(token) {
    const person = PEOPLE[token];
    if (!person) throw new Error('invalid token');
    return person;
  },
};

let server: LocalPostgres;
let owner: Db;
let db: Db;
let app: NestFastifyApplication;
const company: Record<string, string> = {};
const team: Record<string, string> = {};

beforeAll(async () => {
  server = await startLocalPostgres();
  await runMigrations(server.ownerUrl);
  owner = createDb(server.ownerUrl);
  await seedDemo(owner);
  for (const c of await owner.select().from(schema.companies)) company[c.name] = c.id;
  for (const t of await owner.select().from(schema.teams))
    if (t.companyId === company[DEMO_COMPANY]) team[t.name] = t.id;
  db = createDb(server.appUrl);
  app = await createApp({ db, verifier });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await owner?.$client.end();
  await db?.$client.end();
  await server?.stop();
});

const call = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  who: string,
  payload?: object,
  at = DEMO_COMPANY,
) =>
  app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${who}`, 'x-company-id': company[at] ?? '' },
    ...(payload ? { payload } : {}),
  });
type Row = {
  membershipId: string;
  name: string;
  email: string;
  role: string;
  teamName: string;
  active: boolean;
  accepted: boolean;
};
const people = async (who = 'admin') => (await call('GET', '/api/people', who)).json() as Row[];
const byEmail = async (email: string) => (await people()).find((p) => p.email === email);

describe('people in a company', () => {
  it('lists the people of the company to its members only', async () => {
    expect((await people('agent')).map((p) => p.name)).toContain('Rita Reviewer');
    expect((await call('GET', '/api/people', 'stranger')).statusCode).toBe(403);
  });

  it('lets only admins invite, and follows the team rules', async () => {
    const nina = { name: 'Nina New', email: 'Nina@demo.test', role: 'agent' };
    expect((await call('POST', '/api/people', 'reviewer', { ...nina, teamId: team['B2C'] })).statusCode).toBe(403);
    expect((await call('POST', '/api/people', 'admin', nina)).statusCode).toBe(400); // an agent needs a team
    expect((await call('POST', '/api/people', 'admin', { ...nina, teamId: team['Administration'] })).statusCode).toBe(
      400,
    );
    expect((await call('POST', '/api/people', 'admin', { ...nina, teamId: team['B2C'] })).statusCode).toBe(201);
    expect((await call('POST', '/api/people', 'admin', { ...nina, teamId: team['B2C'] })).statusCode).toBe(409);
    expect(await byEmail('nina@demo.test')).toMatchObject({ role: 'agent', teamName: 'B2C', accepted: false });
    // staff always sit in Administration, whatever team is sent
    await call('POST', '/api/people', 'admin', {
      name: 'Tom Trainer',
      email: 'tom@demo.test',
      role: 'trainer',
      teamId: team['B2C'],
    });
    expect(await byEmail('tom@demo.test')).toMatchObject({ teamName: 'Administration' });
  });

  it('gives the invitation to the person at their first sign-in', async () => {
    const nina = (await call('GET', '/api/me', 'nina')).json();
    expect(nina.companies.map((c: { name: string }) => c.name)).toEqual([DEMO_COMPANY]);
    expect(await byEmail('nina@demo.test')).toMatchObject({ accepted: true });
  });

  it('changes a role and a team, moving staff into Administration by themselves', async () => {
    const nina = await byEmail('nina@demo.test');
    const moved = await call('PATCH', `/api/people/${nina?.membershipId}`, 'admin', { teamId: team['B2B'] });
    expect(moved.json()).toMatchObject({ teamName: 'B2B', role: 'agent' });
    const promoted = await call('PATCH', `/api/people/${nina?.membershipId}`, 'admin', { role: 'reviewer' });
    expect(promoted.json()).toMatchObject({ teamName: 'Administration', role: 'reviewer' });
    const back = await call('PATCH', `/api/people/${nina?.membershipId}`, 'admin', {
      role: 'agent',
      teamId: team['B2C'],
    });
    expect(back.json()).toMatchObject({ teamName: 'B2C', role: 'agent' });
  });

  it("doesn't let admins switch themselves off or change their own role", async () => {
    const me = await byEmail('admin@demo.test');
    expect((await call('PATCH', `/api/people/${me?.membershipId}`, 'admin', { active: false })).statusCode).toBe(400);
    expect((await call('PATCH', `/api/people/${me?.membershipId}`, 'admin', { role: 'agent' })).statusCode).toBe(400);
    expect((await call('DELETE', `/api/people/${me?.membershipId}`, 'admin')).statusCode).toBe(400);
  });

  it('closes the company to a person who is switched off, until they are switched on again', async () => {
    const nina = await byEmail('nina@demo.test');
    await call('PATCH', `/api/people/${nina?.membershipId}`, 'admin', { active: false });
    expect((await call('GET', '/api/me', 'nina')).json().companies).toEqual([]);
    expect((await call('GET', '/api/teams', 'nina')).statusCode).toBe(403);
    await call('PATCH', `/api/people/${nina?.membershipId}`, 'admin', { active: true });
    expect((await call('GET', '/api/teams', 'nina')).statusCode).toBe(200);
  });

  it("can't reach another company's people", async () => {
    const nina = await byEmail('nina@demo.test');
    // the admin of the demo company is also admin of the second company: from there, Nina is invisible
    const fromSecond = await call(
      'PATCH',
      `/api/people/${nina?.membershipId}`,
      'admin',
      { active: false },
      SECOND_COMPANY,
    );
    expect(fromSecond.statusCode).toBe(404);
    expect(
      (await call('GET', '/api/people', 'admin', undefined, SECOND_COMPANY)).json().map((p: Row) => p.name),
    ).toEqual(['Ada Admin']);
  });

  it('removes a person from the company (their account stays for their other companies)', async () => {
    const tom = await byEmail('tom@demo.test');
    expect((await call('DELETE', `/api/people/${tom?.membershipId}`, 'admin')).statusCode).toBe(204);
    expect(await byEmail('tom@demo.test')).toBeUndefined();
  });
});
