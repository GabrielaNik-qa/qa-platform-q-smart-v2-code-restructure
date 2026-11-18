// Phase 6: the minimum call length ("calls shorter than [ ] seconds don't enter") and the count of calls left out:
// who sets it, which calls it keeps out (calls only, and only with a known length), and the company wall.
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
import type { TokenVerifier } from './auth/token-verifier.js';

const verifier: TokenVerifier = {
  async verify(token) {
    if (!['admin', 'reviewer', 'lead', 'trainer', 'agent'].includes(token)) throw new Error('invalid token');
    return { uid: `demo-${token}`, email: `${token}@demo.test`, emailVerified: true };
  },
};

let server: LocalPostgres;
let owner: Db;
let db: Db;
let app: NestFastifyApplication;
const company: Record<string, string> = {};
let agentId = '';

beforeAll(async () => {
  server = await startLocalPostgres();
  await runMigrations(server.ownerUrl);
  owner = createDb(server.ownerUrl);
  await seedDemo(owner);
  for (const c of await owner.select().from(schema.companies)) company[c.name] = c.id;
  db = createDb(server.appUrl);
  app = await createApp({ db, verifier });
  const people = (await call('GET', '/people', 'admin')).json<{ membershipId: string; email: string }[]>();
  agentId = people.find((p) => p.email === 'agent@demo.test')?.membershipId ?? '';
}, 180_000);

afterAll(async () => {
  await app?.close();
  await owner?.$client.end();
  await db?.$client.end();
  await server?.stop();
});

const call = (
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
  url: string,
  who: string,
  payload?: object,
  at = DEMO_COMPANY,
) =>
  app.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${who}`, 'x-company-id': company[at] ?? '' },
    ...(payload ? { payload } : {}),
  });
const conversation = (channel: string, values: object) => ({
  channel,
  startedAt: new Date(Date.now() - 86_400_000).toISOString(),
  agentId,
  transcript: 'Customer: Hello.\nAgent: Hi.',
  values: { direction: 'in', outcome: 'resolved', language: 'en', ...values },
});
const intake = async (at = DEMO_COMPANY) =>
  (await call('GET', '/intake', 'admin', undefined, at)).json<{
    minCallSeconds: number | null;
    callsLeftOut: number;
  }>();

describe('the minimum call length', () => {
  it('starts empty: every call enters, and nothing is counted', async () => {
    expect(await intake()).toEqual({ minCallSeconds: null, callsLeftOut: 0 });
    const short = await call('POST', '/conversations', 'admin', conversation('call', { duration: 5 }));
    expect(short.statusCode).toBe(201);
  });

  it('is changed only by those who change settings, and only with a whole number of seconds', async () => {
    expect((await call('PUT', '/intake', 'agent', { minCallSeconds: 30 })).statusCode).toBe(403);
    expect((await call('PUT', '/intake', 'reviewer', { minCallSeconds: 30 })).statusCode).toBe(403);
    for (const bad of [0, -1, 1.5, 100_000, '30', {}])
      expect((await call('PUT', '/intake', 'admin', { minCallSeconds: bad })).statusCode, String(bad)).toBe(400);
    const saved = await call('PUT', '/intake', 'admin', { minCallSeconds: 30 });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ minCallSeconds: 30, callsLeftOut: 0 });
  });

  it('keeps a shorter call out and counts it; longer calls, chats, e-mails and unknown lengths still enter', async () => {
    const left = await call('POST', '/conversations', 'admin', conversation('call', { duration: 29 }));
    expect(left.statusCode).toBe(201);
    expect(left.json()).toEqual({ leftOut: true, minCallSeconds: 30 });
    expect((await intake()).callsLeftOut).toBe(1);
    const before = (await call('GET', '/conversations', 'admin')).json<unknown[]>().length;
    for (const body of [
      conversation('call', { duration: 30 }),
      conversation('call', { duration: 300 }),
      conversation('call', {}),
      conversation('chat', { duration: 5 }),
      conversation('email', { duration: 1 }),
    ])
      expect((await call('POST', '/conversations', 'admin', body)).json()).toHaveProperty('id');
    expect((await call('GET', '/conversations', 'admin')).json<unknown[]>().length).toBe(before + 5);
    expect((await intake()).callsLeftOut).toBe(1);
  });

  it('is empty again to let every call in, keeping the count', async () => {
    expect((await call('PUT', '/intake', 'admin', { minCallSeconds: null })).json()).toEqual({
      minCallSeconds: null,
      callsLeftOut: 1,
    });
    expect(
      (await call('POST', '/conversations', 'admin', conversation('call', { duration: 2 }))).json(),
    ).toHaveProperty('id');
  });

  it("stays behind the company wall: another company's setting and count are its own", async () => {
    expect(await intake(SECOND_COMPANY)).toEqual({ minCallSeconds: null, callsLeftOut: 0 });
    await call('PUT', '/intake', 'admin', { minCallSeconds: 60 });
    expect(await intake(SECOND_COMPANY)).toEqual({ minCallSeconds: null, callsLeftOut: 0 });
    expect((await intake()).minCallSeconds).toBe(60);
  });
});
