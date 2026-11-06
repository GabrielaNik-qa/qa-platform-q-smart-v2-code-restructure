// The server: sign-in is checked on every route, and a company's data reaches only its members.
import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  createDb,
  type Db,
  DEMO_COMPANY,
  inviteToDemo,
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

// In the tests, Firebase's proof of sign-in is replaced by simple test tokens.
const PEOPLE: Record<string, VerifiedPerson> = {
  'token-admin': { uid: 'demo-admin', email: 'admin@demo.test', emailVerified: true },
  'token-agent': { uid: 'demo-agent', email: 'agent@demo.test', emailVerified: true },
  'token-stranger': { uid: 'someone-else', email: 'stranger@other.test', emailVerified: true },
  // invited by e-mail: the first with an unverified e-mail, then the right person, then someone trying it a second time
  'token-unverified': { uid: 'google-unverified', email: 'invited@demo.test', emailVerified: false },
  'token-invited': { uid: 'google-invited', email: 'Invited@Demo.test', emailVerified: true },
  'token-second-claim': { uid: 'google-other', email: 'invited@demo.test', emailVerified: true },
};
const verifier: TokenVerifier = {
  async verify(idToken) {
    const person = PEOPLE[idToken];
    if (!person) throw new Error('invalid token');
    return person;
  },
};

let server: LocalPostgres;
let owner: Db;
let db: Db;
let app: NestFastifyApplication;
const companyIds: Record<string, string> = {};

beforeAll(async () => {
  server = await startLocalPostgres();
  await runMigrations(server.ownerUrl);
  owner = createDb(server.ownerUrl);
  await seedDemo(owner);
  await inviteToDemo(owner, { email: 'invited@demo.test', name: 'Ivo Invited', role: 'trainer' });
  for (const c of await owner.select().from(schema.companies)) companyIds[c.name] = c.id;
  db = createDb(server.appUrl);
  app = await createApp({ db, verifier });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await owner?.$client.end();
  await db?.$client.end();
  await server?.stop();
});

const get = (url: string, token?: string, company?: string) =>
  app.inject({
    method: 'GET',
    url,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(company ? { 'x-company-id': company } : {}),
    },
  });

describe('the server', () => {
  it('answers the health check without sign-in', async () => {
    const res = await get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('refuses everything else without a valid sign-in', async () => {
    expect((await get('/api/me')).statusCode).toBe(401);
    expect((await get('/api/me', 'made-up-token')).statusCode).toBe(401);
    expect((await get('/api/teams', undefined, companyIds[DEMO_COMPANY])).statusCode).toBe(401);
  });

  it('tells a person who they are and which companies they can open', async () => {
    const admin = (await get('/api/me', 'token-admin')).json();
    expect(admin.name).toBe('Ada Admin');
    expect(admin.companies.map((c: { name: string; role: string }) => [c.name, c.role])).toEqual([
      [DEMO_COMPANY, 'admin'],
      [SECOND_COMPANY, 'admin'],
    ]);
    const agent = (await get('/api/me', 'token-agent')).json();
    expect(agent.companies.map((c: { name: string }) => c.name)).toEqual([DEMO_COMPANY]);
    const stranger = (await get('/api/me', 'token-stranger')).json();
    expect(stranger.companies).toEqual([]);
  });

  it("shows a company's teams to its members, behind the company wall", async () => {
    const demoTeams = await get('/api/teams', 'token-agent', companyIds[DEMO_COMPANY]);
    expect(demoTeams.statusCode).toBe(200);
    expect(demoTeams.json().map((t: { name: string }) => t.name)).toEqual(['Administration', 'B2B', 'B2C']);
    const secondTeams = await get('/api/teams', 'token-admin', companyIds[SECOND_COMPANY]);
    expect(secondTeams.json().map((t: { name: string }) => t.name)).toEqual(['Administration']);
  });

  it('gives an invitation only to the invited, verified e-mail, and only once', async () => {
    const companiesOf = async (token: string) =>
      (await get('/api/me', token)).json().companies.map((c: { name: string; role: string }) => [c.name, c.role]);
    expect(await companiesOf('token-unverified')).toEqual([]);
    expect(await companiesOf('token-invited')).toEqual([[DEMO_COMPANY, 'trainer']]);
    expect(await companiesOf('token-invited')).toEqual([[DEMO_COMPANY, 'trainer']]);
    expect(await companiesOf('token-second-claim')).toEqual([]);
    expect(await companiesOf('token-unverified')).toEqual([]);
  });

  it("refuses a company the person doesn't belong to", async () => {
    expect((await get('/api/teams', 'token-agent', companyIds[SECOND_COMPANY])).statusCode).toBe(403);
    expect((await get('/api/teams', 'token-stranger', companyIds[DEMO_COMPANY])).statusCode).toBe(403);
  });

  it('asks for a company when none (or nonsense) is named', async () => {
    expect((await get('/api/teams', 'token-agent')).statusCode).toBe(400);
    expect((await get('/api/teams', 'token-agent', "x' or 1=1 --")).statusCode).toBe(400);
  });
});
