// Tasks' Library through the server: templates (by hand or repeating: once per person and period, never on a
// Saturday or Sunday, only for periods after it was made), sequences (each step on its own days, the latest round of a
// repeating one, stopping), deleting (the cards stay), who may do it, and the company wall.
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
  withCompany,
} from '@qsmart/db';
import { addDays, addMonths, isWorkingDay, localDay, mondayOf } from '@qsmart/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { TokenVerifier } from './auth/token-verifier.js';
import { giveRepeats } from './task-library.controller.js';

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
let agent = { membershipId: '', teamId: '' };
const TODAY = localDay(new Date());
const nextMonday = addDays(mondayOf(TODAY), 7);
const nextSaturday = addDays(nextMonday, -2);

interface Card {
  id: string;
  title: string;
  assigneeId: string;
  dueOn: string | null;
  startOn: string | null;
  templateId: string | null;
  runId: string | null;
  stepNo: number | null;
  stepCount: number | null;
  sequenceName: string;
  steps: { text: string; done: boolean }[];
}

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  who: string,
  payload?: object,
  at = DEMO_COMPANY,
) =>
  app.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${who}`, 'x-company-id': company[at] ?? '' },
    ...(payload ? { payload } : {}),
  });
const repeatOn = (day: string) => withCompany(db, company[DEMO_COMPANY] ?? '', (tx) => giveRepeats(tx, day));
const cardsOf = async (who = 'agent') => (await call('GET', '/tasks', who)).json<Card[]>();

beforeAll(async () => {
  server = await startLocalPostgres();
  await runMigrations(server.ownerUrl);
  owner = createDb(server.ownerUrl);
  await seedDemo(owner);
  for (const c of await owner.select().from(schema.companies)) company[c.name] = c.id;
  db = createDb(server.appUrl);
  app = await createApp({ db, verifier });
  const people = (await call('GET', '/people', 'admin')).json<
    { membershipId: string; email: string; teamId: string }[]
  >();
  agent = people.find((p) => p.email === 'agent@demo.test') ?? agent;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await owner?.$client.end();
  await db?.$client.end();
  await server?.stop();
});

describe('task templates', () => {
  let daily = '';

  it('are saved by those who give tasks; a repeating one needs people', async () => {
    const byHand = await call('POST', '/task-templates', 'reviewer', {
      title: 'End of shift wrap-up',
      steps: [{ text: 'Close the cases worked today', minutes: 15 }, { text: 'Hand over anything urgent' }],
      labels: ['daily', 'daily'],
    });
    expect(byHand.statusCode, byHand.body).toBe(201);
    expect(byHand.json()).toMatchObject({
      freq: 'none',
      kind: 'checklist',
      labels: ['daily'],
      byName: 'Rita Reviewer',
    });
    expect((await call('GET', '/task-templates', 'lead')).json<unknown[]>()).toHaveLength(1);
    expect((await call('GET', '/task-templates', 'agent')).statusCode).toBe(403);
    expect((await call('POST', '/task-templates', 'agent', { title: 'x' })).statusCode).toBe(403);
    expect((await call('POST', '/task-templates', 'reviewer', { title: 'x', freq: 'daily' })).json()).toMatchObject({
      code: 'templateNobody',
    });
    expect((await call('POST', '/task-templates', 'reviewer', { title: 'x', monthday: 31 })).json()).toMatchObject({
      code: 'templateInvalid',
    });
    const created = await call('POST', '/task-templates', 'reviewer', {
      title: 'Start of shift',
      kind: 'checklist',
      points: 5,
      freq: 'daily',
      steps: [{ text: 'Check work e-mail', minutes: 5 }],
      userIds: [agent.membershipId],
    });
    expect(created.statusCode, created.body).toBe(201);
    daily = created.json<{ id: string }>().id;
  });

  it('give a repeating card once per person and period, on working days only', async () => {
    const before = (await cardsOf()).filter((c) => c.templateId === daily).length;
    // a Saturday: nothing (it waits for the next working day)
    expect(await repeatOn(nextSaturday)).toBe(0);
    // the Monday: one card, due that day, with the template's checklist
    expect(await repeatOn(nextMonday)).toBe(1);
    expect(await repeatOn(nextMonday)).toBe(0); // once
    const mine = (await cardsOf()).filter((c) => c.templateId === daily);
    expect(mine.length - before).toBe(1);
    const card = mine.find((c) => c.dueOn === nextMonday);
    expect(card).toMatchObject({ title: 'Start of shift', steps: [{ text: 'Check work e-mail', done: false }] });
    // today, through the task list itself: a card only on a working day
    const today = (await cardsOf()).filter((c) => c.templateId === daily && c.dueOn === TODAY).length;
    expect(today).toBe(isWorkingDay(TODAY) ? 1 : 0);
  });

  it('wait for their day of the week, and give whole teams a card each', async () => {
    const weekly = (
      await call('POST', '/task-templates', 'admin', {
        title: 'Weekly self-review',
        freq: 'weekly',
        weekday: 3,
        teamIds: [agent.teamId],
      })
    ).json<{ id: string }>().id;
    const wednesday = addDays(nextMonday, 2);
    expect(await repeatOn(nextMonday)).toBe(0 + 0); // its Wednesday hasn't come (the daily one is already there)
    const added = await repeatOn(wednesday);
    const team = (await call('GET', '/people', 'admin'))
      .json<{ role: string; teamId: string; active: boolean }[]>()
      .filter((p) => p.role === 'agent' && p.active && p.teamId === agent.teamId).length;
    // the daily card for Wednesday, and the weekly one for each agent of the team
    expect(added).toBe(1 + team);
    const cards = (await cardsOf('admin')).filter((c) => c.templateId === weekly);
    expect(cards).toHaveLength(team);
    expect(cards.every((c) => c.dueOn === wednesday)).toBe(true);
  });

  it('can be changed and deleted; the cards already given stay', async () => {
    const changed = await call('PUT', `/task-templates/${daily}`, 'lead', {
      title: 'Start of shift (new)',
      freq: 'daily',
      userIds: [agent.membershipId],
    });
    expect(changed.json()).toMatchObject({ title: 'Start of shift (new)' });
    expect((await call('DELETE', `/task-templates/${daily}`, 'reviewer')).statusCode).toBe(204);
    const left = (await cardsOf()).filter((c) => c.title === 'Start of shift');
    expect(left.length).toBeGreaterThan(0);
    expect(left.every((c) => c.templateId === null)).toBe(true);
    expect((await call('DELETE', `/task-templates/${daily}`, 'reviewer')).statusCode).toBe(404);
  });
});

describe('task sequences', () => {
  let seq = '';

  it('give each step on its own days, to each person, and tell them', async () => {
    const made = await call('POST', '/task-sequences', 'reviewer', {
      name: 'New agent: first week',
      steps: [
        { title: 'Read the product guide', day: 3, days: 1 },
        { title: 'Shadow a colleague', day: 0, days: 2, steps: [{ text: 'Morning' }, { text: 'Afternoon' }] },
      ],
    });
    expect(made.statusCode, made.body).toBe(201);
    // the steps are kept in the order of their days
    expect(made.json<{ steps: { title: string }[] }>().steps.map((s) => s.title)).toEqual([
      'Shadow a colleague',
      'Read the product guide',
    ]);
    seq = made.json<{ id: string }>().id;
    const given = await call('POST', `/task-sequences/${seq}/give`, 'reviewer', {
      startOn: nextMonday,
      userIds: [agent.membershipId],
    });
    expect(given.statusCode, given.body).toBe(201);
    expect(given.json()).toMatchObject({ people: 1, tasks: 2 });
    const cards = (await cardsOf()).filter((c) => c.sequenceName === 'New agent: first week');
    expect(cards.map((c) => [c.stepNo, c.stepCount, c.startOn, c.dueOn]).sort()).toEqual([
      [1, 2, nextMonday, addDays(nextMonday, 1)],
      [2, 2, addDays(nextMonday, 3), addDays(nextMonday, 3)],
    ]);
    const bell = (await call('GET', '/notifications', 'agent')).json<{ kind: string }[]>();
    expect(bell.some((n) => n.kind === 'sequenceGiven')).toBe(true);
    expect((await call('GET', '/task-sequences', 'agent')).statusCode).toBe(403);
  });

  it('give only the latest round of a repeating one, never twice, until it is stopped', async () => {
    const start = addMonths(TODAY, -2);
    const run = (
      await call('POST', `/task-sequences/${seq}/give`, 'admin', {
        startOn: start,
        repeat: 'monthly',
        userIds: [agent.membershipId],
      })
    ).json<{ run: { id: string } }>().run.id;
    // the first round now (its start), then the latest one when anybody opens their tasks: never the missed one
    await repeatOn(TODAY);
    await repeatOn(TODAY);
    const rounds = (await call('GET', '/task-sequences', 'admin')).json<{
      runs: { id: string; cycles: string[]; active: boolean }[];
    }>();
    expect(rounds.runs.find((r) => r.id === run)?.cycles).toEqual([start, addMonths(start, 2)]);
    const cards = (await cardsOf()).filter((c) => c.runId === run);
    expect(cards).toHaveLength(4);
    // stopped: no more rounds
    expect((await call('PUT', `/task-sequences/runs/${run}`, 'reviewer')).json()).toMatchObject({ active: false });
    await repeatOn(addMonths(TODAY, 1));
    expect((await cardsOf()).filter((c) => c.runId === run)).toHaveLength(4);
  });

  it('give a weekly pack (several tasks on the same day) every week, only the latest round', async () => {
    const pack = (
      await call('POST', '/task-sequences', 'reviewer', {
        name: 'Monday routine',
        steps: [
          { title: 'Plan the week', day: 0, priority: 'high', points: 5, steps: [{ text: 'List 3 goals' }] },
          { title: 'Read the announcements', day: 0, needsReview: true },
        ],
      })
    ).json<{ id: string }>().id;
    const start = addDays(TODAY, -14);
    const run = (
      await call('POST', `/task-sequences/${pack}/give`, 'reviewer', {
        startOn: start,
        repeat: 'weekly',
        userIds: [agent.membershipId],
      })
    ).json<{ run: { id: string }; tasks: number }>();
    expect(run.tasks).toBe(2);
    await repeatOn(TODAY);
    const rounds = (await call('GET', '/task-sequences', 'admin'))
      .json<{ runs: { id: string; cycles: string[] }[] }>()
      .runs.find((r) => r.id === run.run.id);
    // the first round now, then this week's: never the missed week in between
    expect(rounds?.cycles).toEqual([start, TODAY]);
    const cards = (await cardsOf()).filter((c) => c.runId === run.run.id);
    expect(cards).toHaveLength(4);
    expect(
      cards
        .filter((c) => c.startOn === TODAY)
        .map((c) => c.title)
        .sort(),
    ).toEqual(['Plan the week', 'Read the announcements']);
  });

  it('refuse people out of reach, and keep the cards when deleted', async () => {
    const stranger = (await call('GET', '/people', 'admin', undefined, SECOND_COMPANY)).json<
      { membershipId: string }[]
    >()[0];
    expect(
      (
        await call('POST', `/task-sequences/${seq}/give`, 'reviewer', {
          startOn: TODAY,
          userIds: [stranger?.membershipId],
        })
      ).json(),
    ).toMatchObject({ code: 'taskNobody' });
    expect(
      (
        await call('POST', `/task-sequences/${seq}/give`, 'reviewer', {
          startOn: TODAY,
          untilOn: addDays(TODAY, -1),
          userIds: [agent.membershipId],
        })
      ).json(),
    ).toMatchObject({ code: 'sequenceInvalid' });
    expect((await call('DELETE', `/task-sequences/${seq}`, 'lead')).statusCode).toBe(204);
    const left = (await cardsOf()).filter((c) => c.sequenceName === 'New agent: first week');
    expect(left.length).toBe(6);
    expect(left.every((c) => c.runId === null)).toBe(true);
  });

  it("never reaches another company's library", async () => {
    const tpl = (await call('POST', '/task-templates', 'admin', { title: 'Ours' })).json<{ id: string }>().id;
    expect((await call('GET', '/task-templates', 'admin', undefined, SECOND_COMPANY)).json<unknown[]>()).toHaveLength(
      0,
    );
    expect((await call('PUT', `/task-templates/${tpl}`, 'admin', { title: 'Theirs' }, SECOND_COMPANY)).statusCode).toBe(
      404,
    );
    expect((await call('DELETE', `/task-templates/${tpl}`, 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(404);
    expect((await call('GET', '/task-sequences', 'admin', undefined, SECOND_COMPANY)).json()).toEqual({
      sequences: [],
      runs: [],
    });
  });
});
