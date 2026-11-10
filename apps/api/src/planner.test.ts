// The review planner: staff read the plan, only admins and reviewers change it, only real teams, agents and
// reviewers, and the company wall.
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
    if (!['admin', 'reviewer', 'lead', 'trainer', 'agent', 'bo'].includes(token)) throw new Error('invalid token');
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

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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
const idOf = async (email: string) =>
  (await call('GET', '/api/people', 'admin'))
    .json<{ membershipId: string; email: string }[]>()
    .find((p) => p.email === email)?.membershipId ?? '';
type Plan = {
  target?: number;
  teams?: Record<string, number>;
  agents?: Record<string, number>;
  assign?: Record<string, string>;
};
const teamId = async (name: string) =>
  (await call('GET', '/api/teams', 'admin')).json<{ id: string; name: string }[]>().find((t) => t.name === name)?.id ??
  '';

describe('Review planner', () => {
  it('starts empty, and staff read it, never agents', async () => {
    expect((await call('GET', '/api/planner', 'lead')).json<Plan>()).toEqual({});
    expect((await call('GET', '/api/planner', 'trainer')).statusCode).toBe(200);
    expect((await call('GET', '/api/planner', 'agent')).statusCode).toBe(403);
  });

  it('lets admins and reviewers save the plan, never team leads', async () => {
    const plan = {
      target: 6,
      teams: { [await teamId('B2C')]: 8 },
      agents: { [await idOf('agent@demo.test')]: 3 },
      assign: { [await idOf('agent@demo.test')]: await idOf('reviewer@demo.test') },
    };
    expect((await call('PUT', '/api/planner', 'lead', plan)).statusCode).toBe(403);
    const saved = await call('PUT', '/api/planner', 'reviewer', plan);
    expect(saved.statusCode).toBe(200);
    expect(saved.json<Plan>()).toEqual(plan);
    expect((await call('GET', '/api/planner', 'lead')).json<Plan>()).toEqual(plan);
  });

  it('refuses wrong numbers, unknown teams, a reviewer who is an agent, or an agent who is staff', async () => {
    const alex = await idOf('agent@demo.test');
    const rita = await idOf('reviewer@demo.test');
    expect((await call('PUT', '/api/planner', 'admin', { target: 101 })).statusCode).toBe(400);
    expect((await call('PUT', '/api/planner', 'admin', { target: 2.5 })).statusCode).toBe(400);
    expect(
      (await call('PUT', '/api/planner', 'admin', { teams: { [await teamId('Administration')]: 3 } })).statusCode,
    ).toBe(400);
    expect((await call('PUT', '/api/planner', 'admin', { assign: { [alex]: alex } })).statusCode).toBe(400);
    expect((await call('PUT', '/api/planner', 'admin', { agents: { [rita]: 3 } })).statusCode).toBe(400);
    expect(
      (await call('PUT', '/api/planner', 'admin', { assign: { [alex]: await idOf('lead@demo.test') } })).statusCode,
    ).toBe(400);
  });

  it('never shows or changes another company’s plan', async () => {
    expect((await call('GET', '/api/planner', 'admin', undefined, SECOND_COMPANY)).json<Plan>()).toEqual({});
    const b2c = await teamId('B2C');
    expect((await call('PUT', '/api/planner', 'admin', { teams: { [b2c]: 9 } }, SECOND_COMPANY)).statusCode).toBe(400);
    expect((await call('GET', '/api/planner', 'admin')).json<Plan>().teams?.[b2c]).toBe(8);
  });
});
