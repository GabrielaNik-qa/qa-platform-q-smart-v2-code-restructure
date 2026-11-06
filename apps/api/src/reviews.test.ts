// Reviews (QA Entry): who may make, see and change them, the scoring, the agent's notifications, and the wall.
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
type Card = { id: string; name: string; categories: ScorecardCategory[] };
type Review = {
  id: string;
  score: number | null;
  zero: boolean;
  notScored: boolean;
  agentName: string;
  scorecardId: string | null;
  scorecardName: string;
  recordingLink: string;
  seenAt: string | null;
  categories: { earned: number; zeroed: boolean }[];
};
const everyone = async () =>
  (await call('GET', '/api/people', 'admin')).json<{ membershipId: string; name: string; email: string }[]>();
const idOf = async (email: string) => (await everyone()).find((p) => p.email === email)?.membershipId ?? '';
const yes = (card: Card, change?: (ci: number, qi: number) => 'y' | 'n' | 'na') =>
  card.categories.map((c, ci) => c.questions.map((_, qi) => ({ answer: change?.(ci, qi) ?? 'y' })));
let card: Card;
const entry = async (overrides: object = {}) => ({
  scorecardId: card.id,
  agentId: await idOf('agent@demo.test'),
  leadId: 'L-1001',
  reviewedOn: '2026-11-05',
  answers: yes(card),
  recordingLink: 'https://recordings.example.test/1001',
  ...overrides,
});

describe('QA Entry', () => {
  it('scores a review, tells the agent and writes the activity log', async () => {
    card = (await call('GET', '/api/scorecards', 'admin')).json<Card[]>()[0] as Card;
    const made = await call('POST', '/api/reviews', 'admin', await entry());
    expect(made.statusCode).toBe(201);
    expect(made.json<Review>()).toMatchObject({ score: 100, agentName: 'Alex Agent', scorecardName: card.name });
    const notes = (await call('GET', '/api/notifications', 'agent')).json<{ kind: string; details: object }[]>();
    expect(notes[0]).toMatchObject({ kind: 'reviewNew', details: { lead: 'L-1001', score: '100', channel: 'call' } });
    const log = (await call('GET', '/api/activity', 'admin')).json<{ action: string }[]>();
    expect(log.some((e) => e.action === 'reviewAdded')).toBe(true);
  });

  it('applies today’s rules: a critical item answered No zeroes its category', async () => {
    const ci = card.categories.findIndex((c) => c.questions.some((q) => q.critical));
    const qi = card.categories[ci]?.questions.findIndex((q) => q.critical) ?? 0;
    const made = (
      await call(
        'POST',
        '/api/reviews',
        'admin',
        await entry({ answers: yes(card, (c, q) => (c === ci && q === qi ? 'n' : 'y')) }),
      )
    ).json<Review>();
    expect(made.categories[ci]).toMatchObject({ earned: 0, zeroed: true });
    expect(made.score).toBeLessThan(100);
  });

  it('needs every answer, a real link, and today’s limits', async () => {
    const missing = yes(card);
    missing[0]?.pop();
    expect((await call('POST', '/api/reviews', 'admin', await entry({ answers: missing }))).json()).toMatchObject({
      code: 'reviewAnswers',
    });
    expect(
      (await call('POST', '/api/reviews', 'admin', await entry({ recordingLink: 'javascript:alert(1)' }))).statusCode,
    ).toBe(400);
    expect((await call('POST', '/api/reviews', 'admin', await entry({ leadId: 'x'.repeat(61) }))).statusCode).toBe(400);
    // a chat keeps no recording link
    const chat = (
      await call('POST', '/api/reviews', 'admin', await entry({ channel: 'chat', transcript: 'Hi!' }))
    ).json<Review>();
    expect(chat.recordingLink).toBe('');
  });

  it('is for admins and reviewers only, and reviewers only for agents of their workspaces', async () => {
    for (const who of ['lead', 'trainer', 'agent'])
      expect((await call('POST', '/api/reviews', who, await entry())).statusCode).toBe(403);
    expect((await call('POST', '/api/reviews', 'reviewer', await entry())).statusCode).toBe(201);
    // an agent of a team in no workspace of the reviewer
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
    expect((await call('POST', '/api/reviews', 'reviewer', await entry({ agentId: nora }))).json()).toMatchObject({
      code: 'reviewAgent',
    });
    const hers = (
      await call('POST', '/api/reviews', 'admin', await entry({ agentId: nora, leadId: 'NIGHT-1' }))
    ).json<Review>();
    // the reviewer doesn't see it either
    expect((await call('GET', `/api/reviews/${hers.id}`, 'reviewer')).statusCode).toBe(404);
    expect((await call('GET', `/api/reviews/${hers.id}`, 'admin')).statusCode).toBe(200);
  });
});

describe('Export to Excel', () => {
  const sheetOf = async (body: Buffer) => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(body as unknown as ArrayBuffer);
    const sheet = book.worksheets[0];
    if (!sheet) throw new Error('no sheet');
    return sheet;
  };

  it('makes today’s file: English headers, real dates and real percentages', async () => {
    const all = (await call('GET', '/api/reviews', 'admin')).json<Review[]>();
    const exported = await call('POST', '/api/reviews/export', 'admin', { ids: all.map((r) => r.id), name: 'Reviews' });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-type']).toContain('spreadsheetml');
    const sheet = await sheetOf(exported.rawPayload);
    const head = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(head.slice(0, 6)).toEqual(['Lead ID', 'Date', 'Agent', 'Team', 'Campaign', 'Reviewer']);
    expect(head).toContain('Total Score (%)');
    expect(head).toContain(card.categories[0]?.name);
    expect(sheet.rowCount).toBe(all.length + 1);
    const total = head.indexOf('Total Score (%)') + 1;
    const row = (sheet.getRow(2).values as unknown[]).slice(1);
    expect(sheet.getRow(2).getCell(2).value).toBeInstanceOf(Date);
    expect(sheet.getRow(2).getCell(total).numFmt).toBe('0.00%');
    expect(typeof row[total - 1]).toBe('number');
    const log = (await call('GET', '/api/activity?kind=exports', 'admin')).json<
      { action: string; details: object }[]
    >();
    expect(log[0]).toMatchObject({ action: 'exportReviews', details: { rows: String(all.length) } });
  });

  it('never puts reviews in the file that the person may not see', async () => {
    const all = (await call('GET', '/api/reviews', 'admin')).json<Review[]>();
    const exported = await call('POST', '/api/reviews/export', 'agent', { ids: all.map((r) => r.id) });
    const sheet = await sheetOf(exported.rawPayload);
    const agents = new Set<string>();
    for (let i = 2; i <= sheet.rowCount; i++) agents.add(String(sheet.getRow(i).getCell(3).value));
    expect([...agents]).toEqual(['Alex Agent']);
    expect((await call('POST', '/api/reviews/export', 'agent', { ids: [] })).statusCode).toBe(400);
  });
});

describe('seeing and changing reviews', () => {
  it('shows agents only their own reviews, and marks them seen when they open them', async () => {
    const mine = (await call('GET', '/api/reviews', 'agent')).json<Review[]>();
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((r) => r.agentName === 'Alex Agent')).toBe(true);
    const first = mine[0] as Review;
    expect((await call('POST', `/api/reviews/${first.id}/seen`, 'agent')).statusCode).toBe(204);
    expect((await call('GET', `/api/reviews/${first.id}`, 'agent')).json<Review>().seenAt).not.toBeNull();
  });

  it('scores again when the answers change, and tells the agent', async () => {
    const review = (await call('GET', '/api/reviews', 'admin'))
      .json<Review[]>()
      .find((r) => r.score === 100 && r.agentName === 'Alex Agent') as Review;
    const changed = await call('PUT', `/api/reviews/${review.id}`, 'reviewer', {
      answers: yes(card, (ci, qi) => (ci === 0 && qi === 0 ? 'n' : 'y')),
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json<Review>().score).toBeLessThan(100);
    const notes = (await call('GET', '/api/notifications', 'agent')).json<{ kind: string }[]>();
    expect(notes[0]?.kind).toBe('reviewUpdated');
    expect((await call('PUT', `/api/reviews/${review.id}`, 'lead', { flag: 'red' })).statusCode).toBe(403);
  });

  it('keeps the reviews when their scorecard is deleted', async () => {
    const extra = await call('POST', '/api/scorecards', 'admin', {
      name: 'Short',
      categories: [{ name: 'All', questions: [{ text: 'Did it', points: 100 }] }],
    });
    const short = extra.json<Card>();
    const made = (
      await call('POST', '/api/reviews', 'admin', await entry({ scorecardId: short.id, answers: [[{ answer: 'y' }]] }))
    ).json<Review>();
    expect((await call('DELETE', `/api/scorecards/${short.id}`, 'admin')).statusCode).toBe(204);
    const kept = (await call('GET', `/api/reviews/${made.id}`, 'admin')).json<Review>();
    expect(kept).toMatchObject({ scorecardId: null, scorecardName: 'Short', score: 100 });
  });

  it('lets staff remind the agent, and admins and reviewers delete', async () => {
    const review = (await call('GET', '/api/reviews', 'admin')).json<Review[]>()[0] as Review;
    expect((await call('POST', `/api/reviews/${review.id}/remind`, 'reviewer')).statusCode).toBe(204);
    expect((await call('GET', '/api/notifications', 'agent')).json<{ kind: string }[]>()[0]?.kind).toBe(
      'reviewReminder',
    );
    expect((await call('DELETE', `/api/reviews/${review.id}`, 'agent')).statusCode).toBe(403);
    expect((await call('DELETE', `/api/reviews/${review.id}`, 'admin')).statusCode).toBe(204);
    expect((await call('GET', `/api/reviews/${review.id}`, 'admin')).statusCode).toBe(404);
  });

  it("never reaches another company's reviews", async () => {
    const review = (await call('GET', '/api/reviews', 'admin')).json<Review[]>()[0] as Review;
    expect((await call('GET', `/api/reviews/${review.id}`, 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(404);
    expect((await call('GET', '/api/reviews', 'admin', undefined, SECOND_COMPANY)).json<Review[]>()).toEqual([]);
  });
});
