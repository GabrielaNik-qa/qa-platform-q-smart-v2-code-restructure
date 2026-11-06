// Quality set-up: scorecards, the categories library, root causes and pass rates, with today's rules.
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
    if (!['admin', 'reviewer', 'lead', 'agent'].includes(token)) throw new Error('invalid token');
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
type Card = { id: string; name: string; workspaceIds: string[]; categories: unknown[] };
const cards = async (who = 'admin') => (await call('GET', '/api/scorecards', who)).json<Card[]>();
const q = (text: string, points: number) => ({ text, points, critical: false, compliance: false });
const scorecard = (name: string, points = [60, 40]) => ({
  name,
  tags: ['Calls', 'calls', 'B2C'],
  categories: [{ name: 'Opening', critical: false, questions: points.map((p, i) => q(`Question ${i + 1}`, p)) }],
});

describe('the demo company', () => {
  it('starts with today’s scorecards, categories library and root causes', async () => {
    expect((await cards()).map((c) => c.name)).toEqual([
      'Standard Scorecard - 7 categories',
      'Written Conversations - Chat, Email & Messaging',
    ]);
    expect((await call('GET', '/api/category-library', 'admin')).json<unknown[]>()).toHaveLength(7);
    expect((await call('GET', '/api/root-causes', 'agent')).json<unknown[]>()).toHaveLength(6);
    expect((await call('GET', '/api/pass-rates', 'agent')).json()).toEqual({ general: 85, teams: {} });
  });
});

describe('scorecards', () => {
  it('are changed only by admins; everyone reads those of their workspaces', async () => {
    for (const who of ['reviewer', 'lead', 'agent']) {
      expect((await call('GET', '/api/scorecards', who)).statusCode).toBe(200);
      expect((await call('POST', '/api/scorecards', who, scorecard('Mine'))).statusCode).toBe(403);
    }
  });

  it('need points that add up to exactly 100, and today’s limits', async () => {
    const wrong = await call('POST', '/api/scorecards', 'admin', scorecard('Short', [60, 30]));
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json()).toMatchObject({ code: 'scorecardTotal' });
    const many = { ...scorecard('Many'), categories: Array.from({ length: 21 }, () => scorecard('x').categories[0]) };
    expect((await call('POST', '/api/scorecards', 'admin', many)).json()).toMatchObject({ code: 'scorecardInvalid' });
    const made = await call('POST', '/api/scorecards', 'admin', scorecard('Retention'));
    expect(made.statusCode).toBe(201);
    // repeated tags count once, whatever their capitals
    expect(made.json<{ tags: string[]; workspaceIds: string[] }>()).toMatchObject({ tags: ['Calls', 'B2C'] });
    expect(made.json<Card>().workspaceIds).toHaveLength(1);
    const id = made.json<Card>().id;
    const edited = await call('PUT', `/api/scorecards/${id}`, 'admin', scorecard('Retention v2', [50, 50]));
    expect(edited.json<Card>().name).toBe('Retention v2');
  });

  it('show staff only the scorecards of their own workspaces', async () => {
    const night = (await call('POST', '/api/workspaces', 'admin', { name: 'Night shift' })).json<{ id: string }>();
    const made = await call('POST', '/api/scorecards', 'admin', { ...scorecard('Night only'), workspaceId: night.id });
    expect(made.json<Card>().workspaceIds).toEqual([night.id]);
    expect((await cards('admin')).map((c) => c.name)).toContain('Night only');
    for (const who of ['reviewer', 'lead', 'agent'])
      expect((await cards(who)).map((c) => c.name)).not.toContain('Night only');
  });

  it('keep at least one', async () => {
    const all = await cards();
    for (const card of all.slice(1))
      expect((await call('DELETE', `/api/scorecards/${card.id}`, 'admin')).statusCode).toBe(204);
    const last = await call('DELETE', `/api/scorecards/${all[0]?.id}`, 'admin');
    expect(last.json()).toMatchObject({ code: 'lastScorecard' });
  });

  it("never reaches another company's scorecards", async () => {
    const theirs = await call('POST', '/api/scorecards', 'admin', scorecard('Theirs'), SECOND_COMPANY);
    const id = theirs.json<Card>().id;
    expect((await call('PUT', `/api/scorecards/${id}`, 'admin', scorecard('Taken'))).statusCode).toBe(404);
    const workspace = (await call('GET', '/api/workspaces', 'admin')).json<{ id: string; name: string }[]>()[0];
    const saved = await call('PUT', `/api/workspaces/${workspace?.id}`, 'admin', {
      name: workspace?.name,
      scorecardIds: [id],
    });
    expect(saved.json<{ scorecardIds: string[] }>().scorecardIds).toEqual([]);
  });
});

describe('the categories library and root causes', () => {
  it('lets only admins change the library', async () => {
    const category = { name: 'Closing', questions: [q('Recapped the next step', 10)] };
    expect((await call('POST', '/api/category-library', 'reviewer', category)).statusCode).toBe(403);
    const made = await call('POST', '/api/category-library', 'admin', category);
    expect(made.statusCode).toBe(201);
    const id = made.json<{ id: string }>().id;
    expect((await call('DELETE', `/api/category-library/${id}`, 'admin')).statusCode).toBe(204);
    expect((await call('POST', '/api/category-library', 'admin', { name: 'Empty', questions: [] })).statusCode).toBe(
      400,
    );
  });

  it('lets admins and reviewers change root causes, each name once', async () => {
    expect((await call('POST', '/api/root-causes', 'agent', { name: 'Training' })).statusCode).toBe(403);
    const made = await call('POST', '/api/root-causes', 'reviewer', {
      name: 'Training',
      description: 'Not trained yet',
    });
    expect(made.statusCode).toBe(201);
    expect((await call('POST', '/api/root-causes', 'admin', { name: 'training' })).statusCode).toBe(409);
    const id = made.json<{ id: string }>().id;
    expect(
      (await call('PUT', `/api/root-causes/${id}`, 'reviewer', { name: 'Training', active: false })).statusCode,
    ).toBe(200);
    expect((await call('DELETE', `/api/root-causes/${id}`, 'admin')).statusCode).toBe(204);
  });
});

describe('pass rates', () => {
  it('are read by everyone and set by admins: the company’s and a working team’s own', async () => {
    const teams = (await call('GET', '/api/teams', 'admin')).json<{ id: string; name: string }[]>();
    const b2c = teams.find((t) => t.name === 'B2C')?.id ?? '';
    const administration = teams.find((t) => t.name === 'Administration')?.id ?? '';
    expect((await call('PUT', '/api/pass-rates', 'reviewer', { general: 90 })).statusCode).toBe(403);
    expect((await call('PUT', '/api/pass-rates', 'admin', { general: 0 })).json()).toMatchObject({
      code: 'passRateInvalid',
    });
    const saved = await call('PUT', '/api/pass-rates', 'admin', {
      general: 90,
      teams: { [b2c]: 80, [administration]: 50 },
    });
    expect(saved.json()).toEqual({ general: 90, teams: { [b2c]: 80 } });
    expect((await call('GET', '/api/pass-rates', 'agent')).json()).toEqual({ general: 90, teams: { [b2c]: 80 } });
  });

  it('go into the activity log, with every other change', async () => {
    const log = (await call('GET', '/api/activity', 'admin')).json<{ action: string }[]>().map((e) => e.action);
    for (const action of [
      'scorecardAdded',
      'scorecardEdited',
      'scorecardDeleted',
      'libraryAdded',
      'rootCauseAdded',
      'passRates',
    ])
      expect(log, action).toContain(action);
  });
});
