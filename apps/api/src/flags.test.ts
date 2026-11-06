// Quick Flags: who may give, change, delete and see them, the agent's notification, scores never change, the Excel
// file, and the company wall.
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
import ExcelJS from 'exceljs';
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
type Flag = { id: string; type: string; agentName: string; leadId: string; byName: string; comment: string };
const idOf = async (email: string) =>
  (await call('GET', '/api/people', 'admin'))
    .json<{ membershipId: string; email: string }[]>()
    .find((p) => p.email === email)?.membershipId ?? '';
const flag = async (overrides: object = {}) => ({
  type: 'red',
  agentId: await idOf('agent@demo.test'),
  leadId: 'F-1',
  flaggedOn: '2026-11-05',
  comment: 'Talked over the customer',
  ...overrides,
});

describe('Quick Flags', () => {
  let first: Flag;

  it('lets admins, reviewers, team leads and trainers flag an agent, and tells the agent', async () => {
    const made = await call('POST', '/api/flags', 'lead', await flag());
    expect(made.statusCode).toBe(201);
    first = made.json<Flag>();
    expect(first).toMatchObject({ type: 'red', agentName: 'Alex Agent', leadId: 'F-1', byName: 'Leo Lead' });
    const notes = (await call('GET', '/api/notifications', 'agent')).json<{ kind: string; details: object }[]>();
    expect(notes[0]).toMatchObject({
      kind: 'flagGiven',
      details: { name: 'Leo Lead', type: 'red', lead: 'F-1', comment: 'Talked over the customer' },
    });
    for (const who of ['admin', 'reviewer'])
      expect(
        (await call('POST', '/api/flags', who, await flag({ type: 'green', leadId: `G-${who}` }))).statusCode,
      ).toBe(201);
    const log = (await call('GET', '/api/activity', 'admin')).json<{ action: string }[]>();
    expect(log.some((e) => e.action === 'flagAdded')).toBe(true);
  });

  it('checks the agent, the lead ID, the date and the links', async () => {
    expect((await call('POST', '/api/flags', 'agent', await flag())).statusCode).toBe(403);
    expect((await call('POST', '/api/flags', 'admin', await flag({ leadId: ' ' }))).json()).toMatchObject({
      code: 'flagInvalid',
    });
    expect(
      (await call('POST', '/api/flags', 'admin', await flag({ conversationLink: 'javascript:x' }))).statusCode,
    ).toBe(400);
    // a flag is for an agent
    expect(
      (await call('POST', '/api/flags', 'admin', await flag({ agentId: await idOf('lead@demo.test') }))).json(),
    ).toMatchObject({ code: 'reviewAgent' });
  });

  it('shows agents only their own flags', async () => {
    const mine = (await call('GET', '/api/flags', 'agent')).json<Flag[]>();
    expect(mine.length).toBe(3);
    expect(mine.every((f) => f.agentName === 'Alex Agent')).toBe(true);
  });

  it('never changes a review or its score', async () => {
    const card = (await call('GET', '/api/scorecards', 'admin')).json<
      { id: string; categories: ScorecardCategory[] }[]
    >()[0];
    const review = (
      await call('POST', '/api/reviews', 'admin', {
        scorecardId: card?.id,
        agentId: await idOf('agent@demo.test'),
        leadId: 'F-1',
        reviewedOn: '2026-11-05',
        answers: card?.categories.map((c) => c.questions.map(() => ({ answer: 'y' }))),
      })
    ).json<{ id: string; score: number; flag: string }>();
    await call('POST', '/api/flags', 'reviewer', await flag({ type: 'red', leadId: 'F-1' }));
    expect((await call('GET', `/api/reviews/${review.id}`, 'admin')).json()).toMatchObject({ score: 100, flag: '' });
  });

  it('lets staff change and delete the flags of their workspaces', async () => {
    const ok = await call(
      'PUT',
      `/api/flags/${first.id}`,
      'trainer',
      await flag({ type: 'green', comment: 'Fine after all' }),
    );
    expect(ok.json<Flag>()).toMatchObject({ type: 'green', comment: 'Fine after all', byName: 'Leo Lead' });
    expect((await call('DELETE', `/api/flags/${first.id}`, 'agent')).statusCode).toBe(403);
    expect((await call('DELETE', `/api/flags/${first.id}`, 'admin')).statusCode).toBe(204);
    expect((await call('GET', '/api/flags', 'admin')).json<Flag[]>().some((f) => f.id === first.id)).toBe(false);
    // an agent of a team outside the reviewer's workspaces: not theirs to flag, see, change or delete
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
    const nora = await idOf('nora@demo.test');
    expect((await call('POST', '/api/flags', 'reviewer', await flag({ agentId: nora }))).json()).toMatchObject({
      code: 'reviewAgent',
    });
    const hers = (await call('POST', '/api/flags', 'admin', await flag({ agentId: nora, leadId: 'N-1' }))).json<Flag>();
    expect((await call('GET', '/api/flags', 'reviewer')).json<Flag[]>().some((f) => f.id === hers.id)).toBe(false);
    expect((await call('PUT', `/api/flags/${hers.id}`, 'reviewer', await flag({ agentId: nora }))).statusCode).toBe(
      404,
    );
    expect((await call('DELETE', `/api/flags/${hers.id}`, 'reviewer')).statusCode).toBe(404);
  });

  it('exports today’s file with only what the person may see', async () => {
    const flags = (await call('GET', '/api/flags', 'admin')).json<Flag[]>();
    const reviews = (await call('GET', '/api/reviews', 'admin')).json<{ id: string; leadId: string }[]>();
    const review = reviews.find((r) => r.leadId === 'F-1');
    const rows = [
      { reviewId: review?.id ?? null, flagIds: flags.filter((f) => f.leadId === 'F-1').map((f) => f.id) },
      { reviewId: null, flagIds: ['00000000-0000-4000-8000-000000000000'] }, // nobody's: left out
    ];
    const file = await call('POST', '/api/flags/export', 'admin', { rows });
    expect(file.statusCode).toBe(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file.rawPayload as unknown as ArrayBuffer);
    const sheet = book.worksheets[0];
    expect(sheet?.getRow(1).values).toEqual([
      undefined,
      'Lead ID',
      'Type',
      'Date',
      'Agent',
      'Team',
      'Campaign',
      'QA Score',
      'QA flag',
      'Quick flags',
      'Comments',
      'Flagged by',
    ]);
    expect(sheet?.rowCount).toBe(2);
    const row = sheet?.getRow(2);
    expect(row?.getCell(1).value).toBe('F-1');
    expect(row?.getCell(3).value).toBeInstanceOf(Date);
    expect(row?.getCell(7)).toMatchObject({ value: 1, numFmt: '0.00%' });
    expect(row?.getCell(9).value).toBe('red');
    expect((await call('POST', '/api/flags/export', 'agent', { rows })).statusCode).toBe(403);
  });

  it("never reaches another company's flags", async () => {
    expect((await call('GET', '/api/flags', 'admin', undefined, SECOND_COMPANY)).json()).toEqual([]);
    const any = (await call('GET', '/api/flags', 'admin')).json<Flag[]>()[0] as Flag;
    expect((await call('DELETE', `/api/flags/${any.id}`, 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(404);
    const rows = await db.execute(sql`select count(*)::int as n from quick_flags`);
    expect(rows.rows[0]).toEqual({ n: 0 });
  });
});
