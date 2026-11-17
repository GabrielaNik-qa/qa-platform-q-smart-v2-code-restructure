// Phase 6: the owner of Q-smart may open Q-smart's own demo company (made-up data) as an administrator, to measure the
// AI models on its test set and see the detailed AI views, and never a client company or anybody else's.
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
    if (!['admin', 'agent', 'owner'].includes(token)) throw new Error('invalid token');
    return { uid: `demo-${token}`, email: `${token}@demo.test`, emailVerified: true };
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

const call = (url: string, who: string, at: string) =>
  app.inject({
    method: 'GET',
    url: `/api${url}`,
    headers: { authorization: `Bearer ${who}`, 'x-company-id': company[at] ?? '' },
  });

describe('the owner in the demo company', () => {
  it('finds the demo company, and only the owner may ask', async () => {
    const found = await app.inject({
      method: 'GET',
      url: '/api/platform/companies/demo',
      headers: { authorization: 'Bearer owner' },
    });
    expect(found.json()).toEqual({ id: company[DEMO_COMPANY], name: DEMO_COMPANY });
    const other = await app.inject({
      method: 'GET',
      url: '/api/platform/companies/demo',
      headers: { authorization: 'Bearer agent' },
    });
    expect(other.statusCode).toBe(403);
  });

  it("opens the demo company's AI views and its test set as an administrator", async () => {
    expect((await call('/ai', 'owner', DEMO_COMPANY)).statusCode).toBe(200);
    expect((await call('/autoqa/test-set', 'owner', DEMO_COMPANY)).statusCode).toBe(200);
  });

  it('never opens a client company', async () => {
    expect((await call('/ai', 'owner', SECOND_COMPANY)).statusCode).toBe(403);
    expect((await call('/people', 'owner', SECOND_COMPANY)).statusCode).toBe(403);
  });

  it('gives nobody else the same way in: not an agent (of either company)', async () => {
    expect((await call('/ai', 'agent', DEMO_COMPANY)).statusCode).toBe(403);
    expect((await call('/ai', 'agent', SECOND_COMPANY)).statusCode).toBe(403);
  });
});
