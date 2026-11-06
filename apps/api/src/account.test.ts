// My account: a person changes only their own name, language, skills and languages, in any company they belong to.
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
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { TokenVerifier, VerifiedPerson } from './auth/token-verifier.js';

const PEOPLE: Record<string, VerifiedPerson> = {
  admin: { uid: 'demo-admin', email: 'admin@demo.test', emailVerified: true },
  agent: { uid: 'demo-agent', email: 'agent@demo.test', emailVerified: true },
  owner: { uid: 'demo-owner', email: 'owner@demo.test', emailVerified: true },
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

beforeAll(async () => {
  server = await startLocalPostgres();
  await runMigrations(server.ownerUrl);
  owner = createDb(server.ownerUrl);
  await seedDemo(owner);
  for (const c of await owner.select().from(schema.companies)) company[c.name] = c.id;
  db = createDb(server.appUrl);
  app = await createApp({ db, verifier });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await owner?.$client.end();
  await db?.$client.end();
  await server?.stop();
});

const call = (method: 'GET' | 'PATCH' | 'PUT', url: string, who: string, payload?: object, at?: string) =>
  app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${who}`, ...(at ? { 'x-company-id': company[at] ?? '' } : {}) },
    ...(payload ? { payload } : {}),
  });
const me = async (who: string) =>
  (await call('GET', '/api/me', who)).json<{ name: string; language: string | null; companies: unknown[] }>();

describe('my account', () => {
  it('saves my name and my language with my account', async () => {
    expect((await me('agent')).language).toBeNull();
    expect((await call('PATCH', '/api/me', 'agent', { name: 'Alex A. Agent', language: 'bg' })).statusCode).toBe(204);
    expect(await me('agent')).toMatchObject({ name: 'Alex A. Agent', language: 'bg' });
    // only my own account changed
    expect((await me('admin')).name).toBe('Ada Admin');
  });

  it('refuses a bad name or an unknown language', async () => {
    expect((await call('PATCH', '/api/me', 'agent', { name: 'A' })).statusCode).toBe(400);
    const unknown = await call('PATCH', '/api/me', 'agent', { language: 'de' });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toMatchObject({ code: 'profileInvalid' });
    expect((await call('PATCH', '/api/me', 'agent', {})).statusCode).toBe(400);
  });

  it('works for the owner of Q-smart, who belongs to no company', async () => {
    expect((await call('PATCH', '/api/me', 'owner', { language: 'fr' })).statusCode).toBe(204);
    expect(await me('owner')).toMatchObject({ language: 'fr', companies: [] });
  });

  it('lets everyone set their own skills and languages, never someone else’s', async () => {
    const skills = (await call('GET', '/api/skills', 'agent', undefined, DEMO_COMPANY)).json<
      { id: string; name: string }[]
    >();
    const french = skills.find((s) => s.name === 'French')?.id;
    const saved = await call('PUT', '/api/me/skills', 'agent', { skillIds: [french] }, DEMO_COMPANY);
    expect(saved.statusCode).toBe(200);
    const people = (await call('GET', '/api/people', 'admin', undefined, DEMO_COMPANY)).json<
      { email: string; skillIds: string[] }[]
    >();
    expect(people.find((p) => p.email === 'agent@demo.test')?.skillIds).toEqual([french]);
    expect(people.find((p) => p.email === 'admin@demo.test')?.skillIds).toEqual([]);
    // the agent isn't in the second company: no way in there
    expect((await call('PUT', '/api/me/skills', 'agent', { skillIds: [] }, SECOND_COMPANY)).statusCode).toBe(403);
  });

  it('keeps only known languages in the database itself', async () => {
    const bad = owner.update(schema.users).set({ language: 'xx' }).where(eq(schema.users.email, 'agent@demo.test'));
    await expect(bad).rejects.toThrow();
  });
});
