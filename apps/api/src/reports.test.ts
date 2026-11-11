// Reports: saved reports (mine and the shared ones, only the owner or an admin changes them), the scheduled ones
// arriving in the bell, the timed job and its key, the export centre (made again for its maker only), and the wall.
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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { runScheduledReports } from './reports.controller.js';
import type { TokenVerifier } from './auth/token-verifier.js';

const verifier: TokenVerifier = {
  async verify(token) {
    if (!['admin', 'reviewer', 'lead', 'trainer', 'agent', 'bo'].includes(token)) throw new Error('invalid token');
    return { uid: `demo-${token}`, email: `${token}@demo.test`, emailVerified: true };
  },
};

const MONTH = new Date().toISOString().slice(0, 7);
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
    reviewedOn: `${MONTH}-01`,
    answers: card?.categories.map((c) => c.questions.map(() => ({ answer: 'y' }))),
  });
  expect(made.statusCode).toBe(201);
  return made.json<{ id: string }>().id;
}

type Report = {
  id: string;
  name: string;
  shared: boolean;
  byName: string;
  schedule: { freq: string };
  lastSentAt: string | null;
};
type Exported = { id: string; kind: string; name: string; rows: number; byName: string; again: boolean };
const cfg = { src: 'reviews', metrics: ['count', 'avg'], rows: 'agent', cols: 'none', period: { p: 'all' } };

describe('Saved reports', () => {
  let ritas: Report;

  it('lets staff save reports, never agents', async () => {
    await review('R-1');
    const made = await call('POST', '/api/reports', 'reviewer', { name: 'Agents this month', cfg });
    expect(made.statusCode).toBe(201);
    ritas = made.json<Report>();
    expect(ritas).toMatchObject({
      name: 'Agents this month',
      shared: false,
      byName: 'Rita Reviewer',
      schedule: { freq: 'none' },
    });
    expect((await call('POST', '/api/reports', 'agent', { name: 'Mine', cfg })).statusCode).toBe(403);
    expect((await call('GET', '/api/reports/data', 'agent')).statusCode).toBe(403);
  });

  it('refuses a report without a name or with unknown settings', async () => {
    expect((await call('POST', '/api/reports', 'reviewer', { name: '', cfg })).statusCode).toBe(400);
    expect(
      (await call('POST', '/api/reports', 'reviewer', { name: 'X', cfg: { ...cfg, rows: 'salary' } })).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/api/reports', 'reviewer', { name: 'X', cfg: { ...cfg, src: 'payroll' } })).statusCode,
    ).toBe(400);
  });

  it('shows my reports and the shared ones; only the owner or an admin changes them', async () => {
    expect((await call('GET', '/api/reports', 'lead')).json<Report[]>()).toEqual([]);
    expect((await call('GET', '/api/reports', 'admin')).json<Report[]>().map((r) => r.id)).toContain(ritas.id);
    expect((await call('PUT', `/api/reports/${ritas.id}`, 'lead', { name: 'Mine now' })).statusCode).toBe(404);
    await call('PUT', `/api/reports/${ritas.id}`, 'reviewer', { shared: true });
    expect((await call('GET', '/api/reports', 'lead')).json<Report[]>().map((r) => r.id)).toEqual([ritas.id]);
    expect((await call('PUT', `/api/reports/${ritas.id}`, 'lead', { name: 'Mine now' })).statusCode).toBe(403);
    expect((await call('DELETE', `/api/reports/${ritas.id}`, 'lead')).statusCode).toBe(403);
    expect(
      (await call('PUT', `/api/reports/${ritas.id}`, 'admin', { name: 'Agents, all time' })).json<Report>().name,
    ).toBe('Agents, all time');
  });

  it('arrives in the owner’s bell when its schedule is due, once a day', async () => {
    await call('PUT', `/api/reports/${ritas.id}`, 'reviewer', {
      schedule: { freq: 'daily', hour: 0, timeZone: 'UTC' },
    });
    const now = Date.now();
    expect(await runScheduledReports(db, now)).toBe(1);
    expect(await runScheduledReports(db, now + 60_000)).toBe(0);
    const bell = (await call('GET', '/api/notifications', 'reviewer')).json<
      { kind: string; details: { name: string } }[]
    >();
    expect(bell.find((n) => n.kind === 'reportReady')?.details.name).toBe('Agents, all time');
    expect((await call('GET', '/api/reports', 'reviewer')).json<Report[]>()[0]?.lastSentAt).not.toBeNull();
  });

  it('runs the timed job only with the job key', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/jobs/scheduled-reports' })).statusCode).toBe(403);
    process.env['QSMART_JOB_KEY'] = 'test-key';
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/jobs/scheduled-reports',
        headers: { 'x-job-key': 'test-key' },
      });
      expect(res.json<{ sent: number }>()).toEqual({ sent: 0 });
      expect(
        (await app.inject({ method: 'POST', url: '/api/jobs/scheduled-reports', headers: { 'x-job-key': 'wrong' } }))
          .statusCode,
      ).toBe(403);
    } finally {
      delete process.env['QSMART_JOB_KEY'];
    }
  });
});

describe('Export centre', () => {
  it('lists every Excel file: a report, reviews and quick flags, each only for its maker (admins: all)', async () => {
    const report = await call('POST', '/api/reports/export', 'reviewer', { name: 'Agents', cfg });
    expect(report.statusCode).toBe(200);
    expect(report.headers['content-type']).toContain('spreadsheetml');
    const reviews = (await call('GET', '/api/reviews', 'reviewer')).json<{ id: string }[]>();
    expect(
      (await call('POST', '/api/reviews/export', 'reviewer', { ids: reviews.map((r) => r.id), name: 'Reviews' }))
        .statusCode,
    ).toBe(200);
    const mine = (await call('GET', '/api/exports', 'reviewer')).json<Exported[]>();
    expect(mine.map((x) => [x.kind, x.name, x.again]).sort()).toEqual([
      ['report', 'Agents', true],
      ['reviews', 'Reviews', true],
    ]);
    expect(mine.every((x) => !('request' in x))).toBe(true);
    expect((await call('GET', '/api/exports', 'lead')).json<Exported[]>()).toEqual([]);
    expect((await call('GET', '/api/exports', 'admin')).json<Exported[]>()).toHaveLength(2);
  });

  it('makes a file again for its maker only, and lets them remove it from the list', async () => {
    const [first] = (await call('GET', '/api/exports', 'reviewer')).json<Exported[]>();
    expect((await call('POST', `/api/exports/${first?.id}/download`, 'reviewer')).statusCode).toBe(200);
    expect((await call('POST', `/api/exports/${first?.id}/download`, 'lead')).statusCode).toBe(404);
    expect((await call('DELETE', `/api/exports/${first?.id}`, 'lead')).statusCode).toBe(404);
    expect((await call('DELETE', `/api/exports/${first?.id}`, 'reviewer')).statusCode).toBe(204);
    expect((await call('GET', '/api/exports', 'reviewer')).json<Exported[]>()).toHaveLength(1);
  });
});

describe('the company wall', () => {
  it('never shows another company’s reports or exports', async () => {
    expect((await call('GET', '/api/reports', 'admin', undefined, SECOND_COMPANY)).json<Report[]>()).toEqual([]);
    expect((await call('GET', '/api/exports', 'admin', undefined, SECOND_COMPANY)).json<Exported[]>()).toEqual([]);
    const theirs = (await call('GET', '/api/reports', 'admin')).json<Report[]>()[0]?.id ?? '';
    expect((await call('DELETE', `/api/reports/${theirs}`, 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(404);
  });
});
