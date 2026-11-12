// Coaching sessions through the server: who writes them (admins, reviewers, trainers; team leads read; agents only their
// own), agents and action owners from the writer's workspaces, the bell (planned, ready to sign, signed), actions given
// as tasks, signing (only a held session, only its own agents), deleting, and the company wall.
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
let agent = '';
const today = new Date().toLocaleDateString('sv-SE');

interface Session {
  id: string;
  status: string;
  agents: { id: string; name: string }[];
  actions: { text: string; ownerId: string; taskId: string | null; done: boolean }[];
  signatures: Record<string, { comment: string }>;
  byName: string;
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
const bell = async (who: string) => (await call('GET', '/notifications', who)).json<{ kind: string; link: string }[]>();
const body = (over: object = {}) => ({
  kind: 'coaching',
  heldOn: today,
  title: 'Handling objections',
  status: 'done',
  agentIds: [agent],
  focus: ['Persuasion & Objection Handling'],
  topics: ['price'],
  goals: 'Answer the price question with value first.',
  notes: 'Listened to two calls together.',
  ...over,
});

beforeAll(async () => {
  server = await startLocalPostgres();
  await runMigrations(server.ownerUrl);
  owner = createDb(server.ownerUrl);
  await seedDemo(owner);
  for (const c of await owner.select().from(schema.companies)) company[c.name] = c.id;
  db = createDb(server.appUrl);
  app = await createApp({ db, verifier });
  const people = (await call('GET', '/people', 'admin')).json<
    { membershipId: string; email: string; role: string; teamId: string; active: boolean }[]
  >();
  agent = people.find((p) => p.email === 'agent@demo.test')?.membershipId ?? '';
}, 180_000);

afterAll(async () => {
  await app?.close();
  await owner?.$client.end();
  await db?.$client.end();
  await server?.stop();
});

describe('coaching sessions', () => {
  let held = '';

  it('are written by admins, reviewers and trainers; team leads read them; agents see their own', async () => {
    const out = await call(
      'POST',
      '/coaching-sessions',
      'reviewer',
      body({
        actions: [
          { text: 'Practise the value answer on 5 calls', ownerId: agent, dueOn: today },
          { text: 'Share the best call with the team' },
        ],
        makeTasks: true,
      }),
    );
    expect(out.statusCode, out.body).toBe(201);
    const s = out.json<Session>();
    held = s.id;
    expect(s).toMatchObject({ status: 'done', agents: [{ id: agent, name: 'Alex Agent' }], byName: 'Rita Reviewer' });
    // the action with a person became their task; the other stays a note
    expect(s.actions[0]?.taskId).toBeTruthy();
    expect(s.actions[1]?.taskId).toBeNull();
    const tasks = (await call('GET', '/tasks', 'agent')).json<{ id: string; title: string }[]>();
    expect(tasks.find((x) => x.id === s.actions[0]?.taskId)?.title).toBe('Practise the value answer on 5 calls');
    // the agent is told it's ready to read and sign, and reads it
    const notes = await bell('agent');
    expect(notes.some((n) => n.kind === 'sessionToSign' && n.link === `/session/${held}`)).toBe(true);
    expect(notes.some((n) => n.kind === 'taskGiven')).toBe(true);
    expect((await call('GET', `/coaching-sessions/${held}`, 'agent')).json()).toMatchObject({ id: held });
    expect((await call('GET', '/coaching-sessions', 'lead')).json<Session[]>().map((x) => x.id)).toContain(held);
    // who may write
    // trainers write too (with no workspaces in the company, they reach every agent)
    expect((await call('POST', '/coaching-sessions', 'trainer', body({ title: 'Trainer session' }))).statusCode).toBe(
      201,
    );
    expect((await call('POST', '/coaching-sessions', 'lead', body())).statusCode).toBe(403);
    expect((await call('POST', '/coaching-sessions', 'agent', body())).statusCode).toBe(403);
    expect((await call('POST', '/coaching-sessions', 'admin', body({ title: '' }))).json()).toMatchObject({
      code: 'sessionInvalid',
    });
    expect((await call('POST', '/coaching-sessions', 'admin', body({ kind: 'o2o' }))).statusCode).toBe(400);
  });

  it('tell the agents of a planned session, and are signed only once held, by their own agents', async () => {
    const planned = (
      await call(
        'POST',
        '/coaching-sessions',
        'admin',
        body({ status: 'planned', heldOn: '2026-12-01', title: 'Next week' }),
      )
    ).json<Session>();
    expect((await bell('agent')).some((n) => n.kind === 'sessionPlanned')).toBe(true);
    expect((await call('POST', `/coaching-sessions/${planned.id}/sign`, 'agent', {})).json()).toMatchObject({
      code: 'sessionNotHeld',
    });
    // held now: the agent is told it's ready
    const before = (await bell('agent')).filter((n) => n.kind === 'sessionToSign').length;
    await call('PUT', `/coaching-sessions/${planned.id}`, 'admin', body({ title: 'Next week', heldOn: today }));
    expect((await bell('agent')).filter((n) => n.kind === 'sessionToSign').length).toBe(before + 1);
    // signing
    const signed = await call('POST', `/coaching-sessions/${held}/sign`, 'agent', { comment: 'Clear, thank you.' });
    expect(signed.statusCode, signed.body).toBe(200);
    expect(signed.json<Session>().signatures[agent]).toMatchObject({ comment: 'Clear, thank you.' });
    expect((await bell('reviewer')).some((n) => n.kind === 'sessionSigned')).toBe(true);
    expect((await call('POST', `/coaching-sessions/${held}/sign`, 'reviewer', {})).statusCode).toBe(403);
  });

  it('keep the signatures and tasks when changed, and refuse agents out of reach', async () => {
    const s = (await call('GET', `/coaching-sessions/${held}`, 'admin')).json<Session>();
    const changed = (
      await call(
        'PUT',
        `/coaching-sessions/${held}`,
        'reviewer',
        body({
          notes: 'Updated notes.',
          actions: s.actions.map((a) => ({ ...a, done: true })),
          makeTasks: true,
        }),
      )
    ).json<Session>();
    expect(changed.signatures[agent]).toBeTruthy();
    expect(changed.actions[0]?.taskId).toBe(s.actions[0]?.taskId); // no second task
    const stranger = (await call('GET', '/people', 'admin', undefined, SECOND_COMPANY)).json<
      { membershipId: string }[]
    >()[0];
    expect(
      (await call('POST', '/coaching-sessions', 'admin', body({ agentIds: [stranger?.membershipId] }))).json(),
    ).toMatchObject({
      code: 'sessionAgents',
    });
  });

  it('are deleted by those who write them, and never reach another company', async () => {
    expect(
      (await call('GET', '/coaching-sessions', 'admin', undefined, SECOND_COMPANY)).json<unknown[]>(),
    ).toHaveLength(0);
    expect((await call('GET', `/coaching-sessions/${held}`, 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(404);
    expect((await call('DELETE', `/coaching-sessions/${held}`, 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(
      404,
    );
    expect((await call('DELETE', `/coaching-sessions/${held}`, 'lead')).statusCode).toBe(403);
    expect((await call('DELETE', `/coaching-sessions/${held}`, 'reviewer')).statusCode).toBe(204);
    expect((await call('GET', `/coaching-sessions/${held}`, 'agent')).statusCode).toBe(404);
    const log = (await call('GET', '/activity', 'admin')).json<{ action: string }[]>();
    expect(log.map((e) => e.action)).toEqual(expect.arrayContaining(['sessionSaved', 'sessionDeleted']));
  });
});
