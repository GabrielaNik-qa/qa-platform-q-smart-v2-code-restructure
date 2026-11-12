// Tasks through the server: who gives them (staff, for their workspaces' people; agents never), one card per person
// (a team: its active agents), the bell; a card's life (the checklist moves it; "needs review" waits In review until
// it is approved or sent back with a comment); what the person may change on their own card; the history; deleting;
// and the company wall.
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
let reviewerId = '';

interface Card {
  id: string;
  groupId: string;
  status: string;
  assigneeId: string;
  assigneeName: string;
  title: string;
  steps: { text: string; minutes: number; done: boolean }[];
  pinned: boolean;
  archivedAt: string | null;
  startedAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  history: { action: string; byName: string; note?: string }[];
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
const move = (id: string, who: string, body: object) => call('PUT', `/tasks/${id}`, who, body);
const bell = async (who: string) => (await call('GET', '/notifications', who)).json<{ kind: string; link: string }[]>();

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
  reviewerId = people.find((p) => p.email === 'reviewer@demo.test')?.membershipId ?? '';
}, 180_000);

afterAll(async () => {
  await app?.close();
  await owner?.$client.end();
  await db?.$client.end();
  await server?.stop();
});

const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

describe('tasks', () => {
  let card = '';

  it('are given by staff to people of their workspaces, one card each, and the person is told', async () => {
    const out = await call('POST', '/tasks', 'reviewer', {
      title: 'Listen to 3 calls of the best agent',
      description: 'Note two phrases you like.',
      priority: 'high',
      points: 20,
      startOn: day(0),
      dueOn: day(3),
      needsReview: true,
      steps: [
        { text: 'Call 1', minutes: 10 },
        { text: 'Call 2', minutes: 10 },
      ],
      labels: ['listening', 'listening', 'week 1'],
      colour: '#2f80ed',
      assigneeIds: [agent.membershipId],
    });
    expect(out.statusCode, out.body).toBe(201);
    const [t] = out.json<Card[]>();
    expect(t).toMatchObject({
      status: 'todo',
      assigneeId: agent.membershipId,
      assigneeName: 'Alex Agent',
      history: [{ action: 'given', byName: 'Rita Reviewer' }],
    });
    card = t?.id ?? '';
    expect((await call('GET', '/tasks', 'agent')).json<Card[]>().map((c) => c.id)).toContain(card);
    expect((await bell('agent')).some((n) => n.kind === 'taskGiven' && n.link === `/quality/tasks?task=${card}`)).toBe(
      true,
    );
    // labels are kept once each
    expect((await call('GET', '/tasks', 'agent')).json<{ labels: string[] }[]>()[0]?.labels).toEqual([
      'listening',
      'week 1',
    ]);
    // the activity log says it
    const log = (await call('GET', '/activity', 'admin')).json<{ action: string }[]>();
    expect(log.some((e) => e.action === 'tasksGiven')).toBe(true);
  });

  it('given to a team: a card for each of its active agents; never by an agent', async () => {
    const out = await call('POST', '/tasks', 'lead', { title: 'Read the new price list', teamIds: [agent.teamId] });
    expect(out.statusCode, out.body).toBe(201);
    const cards = out.json<Card[]>();
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(new Set(cards.map((c) => c.groupId)).size).toBe(1);
    expect(cards.map((c) => c.assigneeId)).toContain(agent.membershipId);
    expect(
      (await call('POST', '/tasks', 'trainer', { title: 'Quiz', assigneeIds: [agent.membershipId] })).statusCode,
    ).toBe(201);
    expect((await call('POST', '/tasks', 'agent', { title: 'Me', assigneeIds: [agent.membershipId] })).statusCode).toBe(
      403,
    );
  });

  it('refuses a task without a title, with dates in the wrong order, or for nobody it may reach', async () => {
    const bad = async (body: object) => (await call('POST', '/tasks', 'reviewer', body)).json<{ code: string }>().code;
    expect(await bad({ title: '', assigneeIds: [agent.membershipId] })).toBe('taskInvalid');
    expect(await bad({ title: 'X', startOn: day(5), dueOn: day(1), assigneeIds: [agent.membershipId] })).toBe(
      'taskInvalid',
    );
    expect(await bad({ title: 'X' })).toBe('taskNobody');
    const stranger = (await call('GET', '/people', 'admin', undefined, SECOND_COMPANY)).json<
      { membershipId: string }[]
    >()[0];
    expect(await bad({ title: 'X', assigneeIds: [stranger?.membershipId] })).toBe('taskNobody');
  });

  it('moves with its checklist; "needs review" waits In review, is sent back with a comment, then approved', async () => {
    // the first tick starts it
    let t = (await move(card, 'agent', { steps: [{ text: 'Call 1', done: true }, { text: 'Call 2' }] })).json<Card>();
    expect(t.status).toBe('doing');
    expect(t.startedAt).not.toBeNull();
    // the person only ticks: the words of the lines stay
    expect(t.steps.map((s) => s.text)).toEqual(['Call 1', 'Call 2']);
    // the last tick finishes it: with "needs review" it waits for a check, and the giver is told
    t = (
      await move(card, 'agent', {
        steps: [
          { text: 'x', done: true },
          { text: 'y', done: true },
        ],
      })
    ).json<Card>();
    expect(t.status).toBe('review');
    expect(t.sentAt).not.toBeNull();
    expect((await bell('reviewer')).some((n) => n.kind === 'taskReview')).toBe(true);
    // sent back with a comment
    t = (await move(card, 'reviewer', { status: 'doing', note: 'Add the second phrase' })).json<Card>();
    expect(t.status).toBe('doing');
    expect(t.history.at(-1)).toMatchObject({ action: 'returned', note: 'Add the second phrase' });
    expect((await bell('agent')).some((n) => n.kind === 'taskReturned')).toBe(true);
    // "done" by the person: In review again; approved by the reviewer: Done
    expect((await move(card, 'agent', { status: 'done' })).json<Card>().status).toBe('review');
    t = (await move(card, 'reviewer', { status: 'done' })).json<Card>();
    expect(t.status).toBe('done');
    expect(t.completedAt).not.toBeNull();
    expect((await bell('agent')).some((n) => n.kind === 'taskApproved')).toBe(true);
    expect(t.history.map((h) => h.action)).toEqual(['given', 'started', 'review', 'returned', 'review', 'approved']);
  });

  it('lets the person pin and archive their own card, but nothing else', async () => {
    const t = (await move(card, 'agent', { pinned: true, archived: true })).json<Card>();
    expect(t.pinned).toBe(true);
    expect(t.archivedAt).not.toBeNull();
    expect((await move(card, 'agent', { title: 'Mine now' })).statusCode).toBe(403);
    expect((await move(card, 'agent', { steps: [{ text: 'only one', done: true }] })).json()).toMatchObject({
      code: 'taskInvalid',
    });
    expect((await move(card, 'agent', { archived: false })).json<Card>().archivedAt).toBeNull();
  });

  it('lets the ones who give tasks change it, move the deadline (kept in the history) and give it to someone else', async () => {
    let t = (await move(card, 'lead', { dueOn: day(10), title: 'Listen to 3 calls' })).json<Card>();
    expect(t.title).toBe('Listen to 3 calls');
    // a change carries only what it changes: the labels and colour stay
    expect(t).toMatchObject({ labels: ['listening', 'week 1'], colour: '#2f80ed' });
    expect(t.history.at(-1)).toMatchObject({ action: 'due' });
    expect((await move(card, 'lead', { startOn: day(30) })).json()).toMatchObject({ code: 'taskInvalid' });
    t = (await move(card, 'admin', { assigneeId: reviewerId })).json<Card>();
    expect(t).toMatchObject({ assigneeId: reviewerId, assigneeName: 'Rita Reviewer' });
    expect(t.history.at(-1)).toMatchObject({ action: 'assigned', note: 'Rita Reviewer' });
    // the reviewer reaches their own card, and the agent no longer does
    expect((await call('GET', '/tasks', 'reviewer')).json<Card[]>().some((c) => c.id === card)).toBe(true);
    expect((await call('GET', '/tasks', 'agent')).json<Card[]>().some((c) => c.id === card)).toBe(false);
    expect((await move(card, 'agent', { pinned: false })).statusCode).toBe(404);
  });

  it("never reaches another company's tasks; deleting is for the ones who give tasks", async () => {
    expect((await call('GET', '/tasks', 'admin', undefined, SECOND_COMPANY)).json<Card[]>()).toHaveLength(0);
    expect((await call('PUT', `/tasks/${card}`, 'admin', { pinned: true }, SECOND_COMPANY)).statusCode).toBe(404);
    expect((await call('DELETE', `/tasks/${card}`, 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(404);
    const other = (await call('POST', '/tasks', 'admin', { title: 'Mine', assigneeIds: [agent.membershipId] })).json<
      Card[]
    >()[0];
    expect((await call('DELETE', `/tasks/${other?.id}`, 'agent')).statusCode).toBe(403);
    expect((await call('DELETE', `/tasks/${other?.id}`, 'reviewer')).statusCode).toBe(204);
    expect((await call('GET', '/tasks', 'agent')).json<Card[]>().some((c) => c.id === other?.id)).toBe(false);
  });
});
