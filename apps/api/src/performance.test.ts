// Performance: goals (who sets them, who sees which, the progress counted on the server), improvement plans (only the
// agent signs), kudos (never to yourself, only the giver or an admin deletes) and the leaderboard; and the company wall.
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

type Goal = { id: string; scope: string; targetName: string; progress: number | null; state: string; pct: number };
type Plan = {
  id: string;
  agentName: string;
  status: string;
  signedAt: string | null;
  agentNote: string;
  checkIns: unknown[];
  goals: { text: string; done: boolean }[];
};
type Kudos = { id: string; toName: string; byName: string; badge: string };
type Row = { name: string; kudos: number; green: number; average: number | null; points: number };
const teamId = async (name: string) =>
  (await call('GET', '/api/teams', 'admin')).json<{ id: string; name: string }[]>().find((t) => t.name === name)?.id ??
  '';
const goals = async (who: string, at = DEMO_COMPANY) =>
  (await call('GET', `/api/goals?month=${MONTH}`, who, undefined, at)).json<Goal[]>();

describe('Goals & KPIs', () => {
  it('lets admins, reviewers and team leads set goals, never trainers or agents', async () => {
    await call('POST', '/api/people', 'admin', {
      name: 'Bo Brown',
      email: 'bo@demo.test',
      role: 'agent',
      teamId: await teamId('B2C'),
    });
    await owner.update(schema.users).set({ firebaseUid: 'demo-bo' }).where(eq(schema.users.email, 'bo@demo.test'));
    const goal = { scope: 'team', teamId: await teamId('B2C'), metric: 'avg', value: 90, month: MONTH };
    expect((await call('POST', '/api/goals', 'reviewer', { ...goal, title: 'B2C above 90%' })).statusCode).toBe(201);
    expect(
      (await call('POST', '/api/goals', 'lead', { scope: 'all', metric: 'reviews', value: 50, month: MONTH }))
        .statusCode,
    ).toBe(201);
    expect((await call('POST', '/api/goals', 'trainer', goal)).statusCode).toBe(403);
    expect((await call('POST', '/api/goals', 'agent', goal)).statusCode).toBe(403);
  });

  it('refuses a goal without its team or agent, or for the Administration team', async () => {
    expect(
      (await call('POST', '/api/goals', 'admin', { scope: 'team', metric: 'avg', value: 90, month: MONTH })).statusCode,
    ).toBe(400);
    const admin = await teamId('Administration');
    expect(
      (
        await call('POST', '/api/goals', 'admin', {
          scope: 'team',
          teamId: admin,
          metric: 'avg',
          value: 90,
          month: MONTH,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/api/goals', 'admin', { scope: 'all', metric: 'avg', value: 0, month: MONTH })).statusCode,
    ).toBe(400);
  });

  it('counts the progress from every review of the team, also for an agent who sees only their own reviews', async () => {
    await review('G-1');
    await review('G-2', 'bo@demo.test');
    const mine = await goals('agent');
    const team = mine.find((g) => g.scope === 'team');
    expect(team).toMatchObject({ targetName: 'B2C', progress: 100, state: 'met', pct: 100 });
    expect(mine.find((g) => g.scope === 'all')).toMatchObject({ progress: 2, state: 'risk' });
  });

  it('shows an agent their own goals, their team’s and the company’s, never someone else’s', async () => {
    await call('POST', '/api/goals', 'admin', {
      scope: 'agent',
      agentId: await idOf('bo@demo.test'),
      metric: 'reviews',
      value: 5,
      month: MONTH,
    });
    await call('POST', '/api/goals', 'admin', {
      scope: 'team',
      teamId: await teamId('B2B'),
      metric: 'avg',
      value: 85,
      month: MONTH,
    });
    await call('POST', '/api/goals', 'admin', {
      scope: 'agent',
      agentId: await idOf('agent@demo.test'),
      metric: 'kudos',
      value: 1,
      month: MONTH,
    });
    const alex = await goals('agent');
    expect(alex.map((g) => g.scope).sort()).toEqual(['agent', 'all', 'team']);
    expect(alex.find((g) => g.scope === 'agent')?.targetName).toBe('Alex Agent');
    expect((await goals('bo')).find((g) => g.scope === 'agent')?.targetName).toBe('Bo Brown');
    expect((await goals('trainer')).length).toBe(5);
    const bell = (await call('GET', '/api/notifications', 'agent')).json<{ kind: string }[]>();
    expect(bell.some((n) => n.kind === 'goalNew')).toBe(true);
  });

  it('copies one month’s goals into another', async () => {
    const next = `${Number(MONTH.slice(0, 4)) + 1}-01`;
    const res = await call('POST', '/api/goals/copy', 'reviewer', { from: MONTH, to: next });
    expect(res.json<{ copied: number }>().copied).toBe(5);
    expect((await call('GET', `/api/goals?month=${next}`, 'admin')).json<Goal[]>().length).toBe(5);
  });
});

describe('Improvement plans', () => {
  let plan: Plan;

  it('lets staff start a plan for an agent, who is told and sees only their own', async () => {
    const made = await call('POST', '/api/improvement-plans', 'lead', {
      agentId: await idOf('agent@demo.test'),
      title: 'Objection handling',
      startOn: `${MONTH}-01`,
      endOn: `${MONTH}-28`,
      goals: ['Average above 85%', 'No red flag'],
    });
    expect(made.statusCode).toBe(201);
    plan = made.json<Plan>();
    expect(plan).toMatchObject({ agentName: 'Alex Agent', status: 'active', signedAt: null });
    expect((await call('GET', '/api/improvement-plans', 'agent')).json<Plan[]>().map((p) => p.id)).toEqual([plan.id]);
    expect((await call('GET', '/api/improvement-plans', 'bo')).json<Plan[]>()).toEqual([]);
    const bell = (await call('GET', '/api/notifications', 'agent')).json<{ kind: string }[]>();
    expect(bell.some((n) => n.kind === 'planNew')).toBe(true);
  });

  it('refuses an end before the start, or a plan for someone who is not an agent', async () => {
    const base = { title: 'X', startOn: `${MONTH}-10`, endOn: `${MONTH}-01` };
    expect(
      (await call('POST', '/api/improvement-plans', 'admin', { ...base, agentId: await idOf('agent@demo.test') }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await call('POST', '/api/improvement-plans', 'admin', {
          ...base,
          endOn: `${MONTH}-20`,
          agentId: await idOf('reviewer@demo.test'),
        })
      ).statusCode,
    ).toBe(400);
  });

  it('keeps goals, check-ins and the outcome for staff; only the agent signs', async () => {
    const goalsDone = plan.goals.map((g, i) => ({ ...g, done: i === 0 }));
    expect(
      (
        await call('PUT', `/api/improvement-plans/${plan.id}`, 'trainer', { goals: goalsDone, status: 'extended' })
      ).json<Plan>(),
    ).toMatchObject({ status: 'extended' });
    const checked = await call('POST', `/api/improvement-plans/${plan.id}/check-ins`, 'reviewer', {
      date: `${MONTH}-05`,
      note: 'Better openings',
    });
    expect(checked.json<Plan>().checkIns).toHaveLength(1);
    expect((await call('PUT', `/api/improvement-plans/${plan.id}`, 'agent', { status: 'passed' })).statusCode).toBe(
      403,
    );
    expect((await call('POST', `/api/improvement-plans/${plan.id}/sign`, 'reviewer', {})).statusCode).toBe(403);
    expect((await call('POST', `/api/improvement-plans/${plan.id}/sign`, 'bo', {})).statusCode).toBe(404);
    const signed = (
      await call('POST', `/api/improvement-plans/${plan.id}/sign`, 'agent', { note: 'I agree' })
    ).json<Plan>();
    expect(signed.signedAt).not.toBeNull();
    expect(signed.agentNote).toBe('I agree');
  });
});

describe('Recognition', () => {
  let given: Kudos;

  it('lets everyone give kudos, never to themselves, and tells the person', async () => {
    const res = await call('POST', '/api/kudos', 'agent', {
      toId: await idOf('bo@demo.test'),
      badge: '🏆',
      text: 'Great call',
    });
    expect(res.statusCode).toBe(201);
    given = res.json<Kudos>();
    expect(given).toMatchObject({ toName: 'Bo Brown', byName: 'Alex Agent', badge: '🏆' });
    expect(
      (await call('POST', '/api/kudos', 'agent', { toId: await idOf('agent@demo.test'), badge: '⭐', text: 'Me' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/api/kudos', 'agent', { toId: await idOf('bo@demo.test'), badge: 'x', text: 'Hi' }))
        .statusCode,
    ).toBe(400);
    const bell = (await call('GET', '/api/notifications', 'bo')).json<{ kind: string }[]>();
    expect(bell.some((n) => n.kind === 'kudosGiven')).toBe(true);
    expect((await call('GET', '/api/kudos', 'trainer')).json<Kudos[]>().map((k) => k.id)).toContain(given.id);
  });

  it('counts kudos, green flags and the average on this month’s leaderboard', async () => {
    const board = (await call('GET', `/api/kudos/board?month=${MONTH}`, 'agent')).json<Row[]>();
    const bo = board.find((r) => r.name === 'Bo Brown');
    expect(bo).toMatchObject({ kudos: 1, green: 0, average: null });
    expect(bo?.points).toBe(5);
    expect(board.every((r) => !('email' in r))).toBe(true);
  });

  it('lets only the person who gave kudos, or an admin, delete them', async () => {
    expect((await call('DELETE', `/api/kudos/${given.id}`, 'bo')).statusCode).toBe(403);
    expect((await call('DELETE', `/api/kudos/${given.id}`, 'agent')).statusCode).toBe(204);
  });
});

describe('the company wall', () => {
  it('never shows another company’s goals, plans or kudos', async () => {
    expect(await goals('admin', SECOND_COMPANY)).toEqual([]);
    expect((await call('GET', '/api/improvement-plans', 'admin', undefined, SECOND_COMPANY)).json<Plan[]>()).toEqual(
      [],
    );
    expect((await call('GET', '/api/kudos', 'admin', undefined, SECOND_COMPANY)).json<Kudos[]>()).toEqual([]);
    const theirs = (await goals('admin'))[0]?.id ?? '';
    expect((await call('DELETE', `/api/goals/${theirs}`, 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(404);
  });
});
