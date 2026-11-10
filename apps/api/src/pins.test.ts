// Pins: who may pin which conversation, an agent sees only their own, "talked about", workspaces, what stays when a
// review goes, and the company wall.
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
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { TokenVerifier } from './auth/token-verifier.js';

const verifier: TokenVerifier = {
  async verify(token) {
    if (!['admin', 'reviewer', 'lead', 'trainer', 'agent', 'nora'].includes(token)) throw new Error('invalid token');
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
type Pin = {
  id: string;
  reviewId: string | null;
  leadId: string;
  agentName: string;
  moment: string;
  note: string;
  status: string;
  byName: string;
};
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

describe('Pins', () => {
  let alexs = '';
  let first: Pin;

  it('lets staff pin a moment of a reviewed conversation', async () => {
    alexs = await review('P-1');
    const made = await call('POST', '/api/pins', 'trainer', {
      reviewId: alexs,
      moment: '02:15',
      note: 'The greeting at the start',
    });
    expect(made.statusCode).toBe(201);
    first = made.json<Pin>();
    expect(first).toMatchObject({
      leadId: 'P-1',
      agentName: 'Alex Agent',
      moment: '02:15',
      status: 'todo',
      byName: 'Tina Trainer',
    });
    for (const who of ['admin', 'reviewer', 'lead'])
      expect((await call('POST', '/api/pins', who, { reviewId: alexs, note: `From ${who}` })).statusCode).toBe(201);
    const log = (await call('GET', '/api/activity', 'admin')).json<{ action: string }[]>();
    expect(log.some((e) => e.action === 'pinAdded')).toBe(true);
  });

  it('checks what to talk about and the moment', async () => {
    expect((await call('POST', '/api/pins', 'admin', { reviewId: alexs, note: ' ' })).json()).toMatchObject({
      code: 'pinInvalid',
    });
    expect((await call('POST', '/api/pins', 'admin', { reviewId: alexs, note: 'x', moment: 'soon' })).statusCode).toBe(
      400,
    );
    expect((await call('POST', '/api/pins', 'agent', { reviewId: alexs, note: 'Mine' })).statusCode).toBe(403);
  });

  it('marks a pin talked about, and lets staff change and delete it', async () => {
    const done = await call('PUT', `/api/pins/${first.id}`, 'lead', { status: 'done' });
    expect(done.json<Pin>()).toMatchObject({ status: 'done', note: 'The greeting at the start', moment: '02:15' });
    expect((await call('PUT', `/api/pins/${first.id}`, 'agent', { status: 'todo' })).statusCode).toBe(403);
    expect((await call('PUT', `/api/pins/${first.id}`, 'reviewer', {})).statusCode).toBe(400);
    const extra = (await call('GET', '/api/pins', 'admin')).json<Pin[]>().find((p) => p.note === 'From admin');
    expect((await call('DELETE', `/api/pins/${extra?.id}`, 'reviewer')).statusCode).toBe(204);
  });

  it('shows an agent only their own pins, and staff only their workspaces', async () => {
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
    await owner.update(schema.users).set({ firebaseUid: 'demo-nora' }).where(eq(schema.users.email, 'nora@demo.test'));
    const hers = await review('N-1', 'nora@demo.test');
    expect((await call('POST', '/api/pins', 'reviewer', { reviewId: hers, note: 'Hm' })).statusCode).toBe(404);
    const noras = (await call('POST', '/api/pins', 'admin', { reviewId: hers, note: 'The ending' })).json<Pin>();
    expect((await call('GET', '/api/pins', 'agent')).json<Pin[]>().every((p) => p.agentName === 'Alex Agent')).toBe(
      true,
    );
    expect((await call('GET', '/api/pins', 'nora')).json<Pin[]>().map((p) => p.note)).toEqual(['The ending']);
    expect((await call('GET', '/api/pins', 'reviewer')).json<Pin[]>().some((p) => p.id === noras.id)).toBe(false);
    expect((await call('DELETE', `/api/pins/${noras.id}`, 'reviewer')).statusCode).toBe(404);
  });

  it('keeps a pin when its review is deleted', async () => {
    expect((await call('DELETE', `/api/reviews/${alexs}`, 'admin')).statusCode).toBe(204);
    const kept = (await call('GET', '/api/pins', 'agent')).json<Pin[]>().find((p) => p.id === first.id);
    expect(kept).toMatchObject({ reviewId: null, leadId: 'P-1', agentName: 'Alex Agent' });
  });

  it("never reaches another company's pins", async () => {
    expect((await call('GET', '/api/pins', 'admin', undefined, SECOND_COMPANY)).json()).toEqual([]);
    expect((await call('DELETE', `/api/pins/${first.id}`, 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(404);
    const rows = await db.execute(sql`select count(*)::int as n from pins`);
    expect(rows.rows[0]).toEqual({ n: 0 });
  });
});
