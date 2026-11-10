// Reviewer QA: who may check which review, nobody checks their own, workspaces, what stays when a review goes, and the
// company wall.
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
import { sql } from 'drizzle-orm';
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
type Check = {
  id: string;
  reviewId: string | null;
  leadId: string;
  agentName: string;
  reviewerName: string;
  byName: string;
  fair: boolean;
  note: string;
};
const idOf = async (email: string) =>
  (await call('GET', '/api/people', 'admin'))
    .json<{ membershipId: string; email: string }[]>()
    .find((p) => p.email === email)?.membershipId ?? '';
/** a review of an agent, made by `who` */
async function review(who: string, leadId: string, agentEmail = 'agent@demo.test'): Promise<string> {
  const card = (await call('GET', '/api/scorecards', 'admin')).json<
    { id: string; categories: ScorecardCategory[] }[]
  >()[0];
  const made = await call('POST', '/api/reviews', who, {
    scorecardId: card?.id,
    agentId: await idOf(agentEmail),
    leadId,
    reviewedOn: '2026-11-05',
    answers: card?.categories.map((c) => c.questions.map(() => ({ answer: 'y' }))),
  });
  expect(made.statusCode).toBe(201);
  return made.json<{ id: string }>().id;
}
const yes = { fair: true, follows: true, critical: true, useful: true };

describe('Reviewer QA', () => {
  let adas = '';
  let ritas = '';
  let first: Check;
  let leos: Check;

  it('lets admins, reviewers and team leads check a review made by someone else', async () => {
    adas = await review('admin', 'RQ-1');
    ritas = await review('reviewer', 'RQ-2');
    const made = await call('POST', '/api/reviewer-checks', 'reviewer', {
      reviewId: adas,
      ...yes,
      useful: false,
      note: 'Add a tip for the agent',
    });
    expect(made.statusCode).toBe(201);
    first = made.json<Check>();
    expect(first).toMatchObject({
      leadId: 'RQ-1',
      agentName: 'Alex Agent',
      reviewerName: 'Ada Admin',
      byName: 'Rita Reviewer',
      fair: true,
    });
    const byLeo = await call('POST', '/api/reviewer-checks', 'lead', { reviewId: ritas, ...yes });
    expect(byLeo.statusCode).toBe(201);
    leos = byLeo.json<Check>();
    const log = (await call('GET', '/api/activity', 'admin')).json<{ action: string }[]>();
    expect(log.some((e) => e.action === 'reviewerCheckAdded')).toBe(true);
  });

  it('never lets anyone check their own review', async () => {
    expect((await call('POST', '/api/reviewer-checks', 'reviewer', { reviewId: ritas, ...yes })).json()).toMatchObject({
      code: 'reviewerCheckOwn',
    });
    // Rita can't change or delete Leo's check of her own review either
    expect((await call('PUT', `/api/reviewer-checks/${leos.id}`, 'reviewer', { ...yes, fair: false })).statusCode).toBe(
      403,
    );
    expect((await call('DELETE', `/api/reviewer-checks/${leos.id}`, 'reviewer')).statusCode).toBe(403);
  });

  it('is read by staff, written by admins, reviewers and team leads', async () => {
    expect((await call('POST', '/api/reviewer-checks', 'trainer', { reviewId: adas, ...yes })).statusCode).toBe(403);
    expect((await call('POST', '/api/reviewer-checks', 'agent', { reviewId: adas, ...yes })).statusCode).toBe(403);
    expect((await call('GET', '/api/reviewer-checks', 'agent')).statusCode).toBe(403);
    expect((await call('GET', '/api/reviewer-checks', 'trainer')).json<Check[]>()).toHaveLength(2);
    expect((await call('POST', '/api/reviewer-checks', 'lead', { reviewId: adas, fair: 'yes' })).json()).toMatchObject({
      code: 'reviewerCheckInvalid',
    });
  });

  it('lets staff change and delete the checks of their workspaces', async () => {
    const changed = await call('PUT', `/api/reviewer-checks/${first.id}`, 'lead', { ...yes, note: 'Fine now' });
    expect(changed.json<Check>()).toMatchObject({ note: 'Fine now', byName: 'Rita Reviewer' });
    expect((await call('DELETE', `/api/reviewer-checks/${leos.id}`, 'admin')).statusCode).toBe(204);
    // an agent of a team outside the reviewer's workspaces
    const leo = await idOf('lead@demo.test');
    const desk = (await call('POST', '/api/workspaces', 'admin', { name: 'Night shift' })).json<{ id: string }>();
    const night = (
      await call('POST', '/api/teams', 'admin', { name: 'Night', leadId: leo, workspaceId: desk.id })
    ).json<{ id: string }>();
    await call('POST', '/api/people', 'admin', {
      name: 'Nora Night',
      email: 'nora@demo.test',
      role: 'agent',
      teamId: night.id,
    });
    const hers = await review('admin', 'N-1', 'nora@demo.test');
    expect((await call('POST', '/api/reviewer-checks', 'reviewer', { reviewId: hers, ...yes })).statusCode).toBe(404);
    const adminCheck = (await call('POST', '/api/reviewer-checks', 'lead', { reviewId: hers, ...yes })).json<Check>();
    expect(
      (await call('GET', '/api/reviewer-checks', 'reviewer')).json<Check[]>().some((c) => c.id === adminCheck.id),
    ).toBe(false);
    expect((await call('DELETE', `/api/reviewer-checks/${adminCheck.id}`, 'reviewer')).statusCode).toBe(404);
  });

  it('keeps a check when its review is deleted', async () => {
    expect((await call('DELETE', `/api/reviews/${adas}`, 'admin')).statusCode).toBe(204);
    const kept = (await call('GET', '/api/reviewer-checks', 'admin')).json<Check[]>().find((c) => c.id === first.id);
    expect(kept).toMatchObject({ reviewId: null, leadId: 'RQ-1', reviewerName: 'Ada Admin' });
  });

  it("never reaches another company's checks", async () => {
    expect((await call('GET', '/api/reviewer-checks', 'admin', undefined, SECOND_COMPANY)).json()).toEqual([]);
    expect(
      (await call('DELETE', `/api/reviewer-checks/${first.id}`, 'admin', undefined, SECOND_COMPANY)).statusCode,
    ).toBe(404);
    const rows = await db.execute(sql`select count(*)::int as n from reviewer_checks`);
    expect(rows.rows[0]).toEqual({ n: 0 });
  });
});
