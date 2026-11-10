// The team average of the Agents page: an agent gets only the totals of their own team (never a colleague's review,
// and nothing under 3 reviews), staff only for teams they reach, and the company wall.
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
import type { ScorecardCategory } from '@qsmart/shared';
import { eq } from 'drizzle-orm';
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
async function review(leadId: string, agentEmail = 'agent@demo.test'): Promise<string> {
  const card = (await call('GET', '/api/scorecards', 'admin')).json<
    { id: string; categories: ScorecardCategory[] }[]
  >()[0];
  const made = await call('POST', '/api/reviews', 'admin', {
    scorecardId: card?.id,
    agentId: await idOf(agentEmail),
    leadId,
    reviewedOn: '2026-11-05',
    answers: card?.categories.map((c) => c.questions.map(() => ({ answer: 'y' }))),
  });
  expect(made.statusCode).toBe(201);
  return made.json<{ id: string }>().id;
}

type Average = {
  teamId: string | null;
  reviews: number;
  average: number | null;
  categories: { name: string; value: number }[];
};
const average = async (who: string, query = '', at = DEMO_COMPANY) => {
  const res = await call('GET', `/api/team-average${query}`, who, undefined, at);
  expect(res.statusCode).toBe(200);
  return res.json<Average>();
};
const teamId = async (name: string) =>
  (await call('GET', '/api/teams', 'admin')).json<{ id: string; name: string }[]>().find((t) => t.name === name)?.id ??
  '';

describe('Team average', () => {
  it('sends an agent no average under 3 reviews, so one colleague’s score never shows', async () => {
    await review('T-1');
    const mine = await average('agent');
    expect(mine).toMatchObject({ teamId: await teamId('B2C'), reviews: 1, average: null, categories: [] });
  });

  it('then counts every review of the agent’s team, and sends only the totals', async () => {
    await call('POST', '/api/people', 'admin', {
      name: 'Bo Brown',
      email: 'bo@demo.test',
      role: 'agent',
      teamId: await teamId('B2C'),
    });
    await owner.update(schema.users).set({ firebaseUid: 'demo-bo' }).where(eq(schema.users.email, 'bo@demo.test'));
    await review('T-2', 'bo@demo.test');
    await review('T-3', 'bo@demo.test');
    const mine = await average('agent');
    expect(mine.reviews).toBe(3);
    expect(mine.average).toBe(100);
    expect(mine.categories.length).toBeGreaterThan(0);
    expect(Object.keys(mine).sort()).toEqual(['average', 'categories', 'reviews', 'teamId']);
    // Bo gets the same team numbers; his own reviews stay his
    expect((await average('bo')).reviews).toBe(3);
    expect((await call('GET', '/api/reviews', 'agent')).json<{ leadId: string }[]>().map((r) => r.leadId)).toEqual([
      'T-1',
    ]);
  });

  it('keeps an agent to their own team, whatever team they ask for', async () => {
    const b2b = await teamId('B2B');
    expect((await average('agent', `?teamId=${b2b}`)).teamId).toBe(await teamId('B2C'));
  });

  it('counts only the period asked for', async () => {
    expect((await average('agent', '?from=2026-11-06')).reviews).toBe(0);
    expect((await average('admin', `?teamId=${await teamId('B2C')}&from=2026-11-05&to=2026-11-06`)).reviews).toBe(3);
    expect((await call('GET', '/api/team-average?from=5 November', 'agent')).statusCode).toBe(400);
  });

  it('answers staff only for the teams they reach', async () => {
    const leo = await idOf('lead@demo.test');
    const desk = (await call('POST', '/api/workspaces', 'admin', { name: 'Night shift' })).json<{ id: string }>();
    const night = (
      await call('POST', '/api/teams', 'admin', { name: 'Night', leadId: leo, workspaceId: desk.id })
    ).json<{ id: string }>();
    await call('POST', '/api/people', 'admin', {
      name: 'Nina Night',
      email: 'nina@demo.test',
      role: 'agent',
      teamId: night.id,
    });
    await review('N-1', 'nina@demo.test');
    expect((await average('reviewer', `?teamId=${night.id}`)).teamId).toBeNull();
    expect(await average('admin', `?teamId=${night.id}`)).toMatchObject({ teamId: night.id, reviews: 1 });
  });

  it('never counts another company’s reviews', async () => {
    const b2c = await teamId('B2C');
    expect((await average('admin', `?teamId=${b2c}`, SECOND_COMPANY)).reviews).toBe(0);
  });
});
