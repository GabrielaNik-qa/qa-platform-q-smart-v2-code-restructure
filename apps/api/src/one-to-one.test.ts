// One-to-ones through the server: form templates (written by admins, reviewers and team leads), the monthly target
// (set by an admin), a one-to-one as a draft (hidden from the agent), sent (the agent is told, reads and signs) or
// completed in person, its objectives given as tasks, the coaching routes never changing it, and the company wall.
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
let team = '';
const today = new Date().toLocaleDateString('sv-SE');

interface OneToOne {
  id: string;
  kind: string;
  state: string;
  status: string;
  title: string;
  templateId: string | null;
  sections: { id: string; type: string; title: string }[];
  answers: Record<string, unknown>;
  actions: { text: string; ownerId: string; taskId: string | null; dueOn: string | null }[];
  signatures: Record<string, { comment: string; inPerson?: boolean }>;
  leadSignature: { name: string } | null;
  sentAt: string | null;
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
const SECTIONS = [
  { id: 'wins', type: 'text', title: 'What went well' },
  { id: 'kpi', type: 'metrics', title: 'Numbers', items: ['Quality', 'Calls'], units: ['%', ''] },
  { id: 'goals', type: 'objectives', title: 'Objectives' },
  { id: 'ok', type: 'agree', title: 'Agreed' },
];
const body = (over: object = {}) => ({
  agentId: agent,
  heldOn: today,
  title: 'Monthly one-to-one',
  period: 'month',
  sections: SECTIONS,
  answers: {
    wins: 'Calmer on difficult calls.',
    kpi: { Quality: '86' },
    goals: [{ text: 'Use the customer’s name twice per call', dueOn: '2026-12-31' }],
  },
  state: 'draft',
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
    { membershipId: string; email: string; teamId: string | null }[]
  >();
  const alex = people.find((p) => p.email === 'agent@demo.test');
  agent = alex?.membershipId ?? '';
  team = alex?.teamId ?? '';
}, 180_000);

afterAll(async () => {
  await app?.close();
  await owner?.$client.end();
  await db?.$client.end();
  await server?.stop();
});

describe('one-to-one templates and the target', () => {
  it('templates are written by admins, reviewers and team leads, and read by trainers', async () => {
    const out = await call('POST', '/one-to-ones/templates', 'lead', {
      name: 'Team form',
      teamIds: [team],
      sections: SECTIONS,
    });
    expect(out.statusCode, out.body).toBe(201);
    const t = out.json<{ id: string; name: string; sections: unknown[] }>();
    expect(t.sections).toHaveLength(4);
    expect(
      (await call('GET', '/one-to-ones/templates', 'trainer')).json<{ id: string }[]>().map((x) => x.id),
    ).toContain(t.id);
    expect(
      (await call('POST', '/one-to-ones/templates', 'trainer', { name: 'X', sections: SECTIONS })).statusCode,
    ).toBe(403);
    expect((await call('POST', '/one-to-ones/templates', 'agent', { name: 'X', sections: SECTIONS })).statusCode).toBe(
      403,
    );
    expect((await call('POST', '/one-to-ones/templates', 'admin', { name: 'X', sections: [] })).json()).toMatchObject({
      code: 'oneToOneTemplateInvalid',
    });
    const changed = await call('PUT', `/one-to-ones/templates/${t.id}`, 'reviewer', {
      name: 'Team form 2',
      sections: SECTIONS.slice(0, 2),
    });
    expect(changed.json()).toMatchObject({ name: 'Team form 2', teamIds: [] });
    // another company never sees it
    expect((await call('GET', '/one-to-ones/templates', 'admin', undefined, SECOND_COMPANY)).json()).toEqual([]);
    expect(
      (await call('DELETE', `/one-to-ones/templates/${t.id}`, 'admin', undefined, SECOND_COMPANY)).statusCode,
    ).toBe(404);
  });

  it('the monthly target is 1 until an admin sets it, per team where it differs', async () => {
    expect((await call('GET', '/one-to-ones/target', 'agent')).json()).toEqual({ target: 1, teams: {} });
    expect((await call('PUT', '/one-to-ones/target', 'lead', { target: 2 })).statusCode).toBe(403);
    expect((await call('PUT', '/one-to-ones/target', 'admin', { target: 0 })).json()).toMatchObject({
      code: 'oneToOneTarget',
    });
    const other = '00000000-0000-4000-8000-000000000000';
    const out = await call('PUT', '/one-to-ones/target', 'admin', { target: 2, teams: { [team]: 3, [other]: 4 } });
    expect(out.json()).toEqual({ target: 2, teams: { [team]: 3 } }); // a team of no company is dropped
    expect((await call('GET', '/one-to-ones/target', 'admin', undefined, SECOND_COMPANY)).json()).toEqual({
      target: 1,
      teams: {},
    });
  });
});

describe('one-to-ones', () => {
  let id = '';

  it('stay hidden from the agent as a draft, and are written by team leads, reviewers and admins', async () => {
    const out = await call('POST', '/one-to-ones', 'lead', body());
    expect(out.statusCode, out.body).toBe(201);
    const s = out.json<OneToOne>();
    id = s.id;
    expect(s).toMatchObject({ kind: 'o2o', state: 'draft', status: 'planned', leadSignature: null, sentAt: null });
    expect(s.actions).toEqual([
      expect.objectContaining({ text: 'Use the customer’s name twice per call', ownerId: agent, dueOn: '2026-12-31' }),
    ]);
    expect((await call('GET', '/coaching-sessions', 'agent')).json<OneToOne[]>().map((x) => x.id)).not.toContain(id);
    expect((await call('GET', `/coaching-sessions/${id}`, 'agent')).statusCode).toBe(404);
    expect((await call('POST', `/coaching-sessions/${id}/sign`, 'agent', {})).statusCode).toBe(404);
    expect((await call('GET', `/coaching-sessions/${id}`, 'trainer')).statusCode).toBe(200);
    // who may write
    expect((await call('POST', '/one-to-ones', 'trainer', body())).statusCode).toBe(403);
    expect((await call('POST', '/one-to-ones', 'agent', body())).statusCode).toBe(403);
    expect((await call('POST', '/one-to-ones', 'admin', body({ title: '' }))).json()).toMatchObject({
      code: 'oneToOneInvalid',
    });
    // the coaching routes never change or delete a one-to-one
    expect((await call('PUT', `/coaching-sessions/${id}`, 'admin', { kind: 'coaching' })).statusCode).toBe(400);
    expect((await call('DELETE', `/coaching-sessions/${id}`, 'admin')).statusCode).toBe(403);
  });

  it('are sent to the agent, who is told, reads and signs; objectives become tasks once', async () => {
    const out = await call('PUT', `/one-to-ones/${id}`, 'lead', body({ state: 'sent', makeTasks: true }));
    expect(out.statusCode, out.body).toBe(200);
    const s = out.json<OneToOne>();
    expect(s).toMatchObject({ state: 'sent', status: 'done' });
    expect(s.leadSignature?.name).toBeTruthy();
    expect(s.sentAt).toBeTruthy();
    const taskId = s.actions[0]?.taskId;
    expect(taskId).toBeTruthy();
    expect((await call('GET', '/tasks', 'agent')).json<{ id: string }[]>().map((t) => t.id)).toContain(taskId);
    expect(
      (await bell('agent')).some((n) => n.kind === 'oneToOneToSign' && n.link === `/quality/one-to-one?session=${id}`),
    ).toBe(true);
    // sent again: no second note, no second task
    const again = (
      await call('PUT', `/one-to-ones/${id}`, 'lead', body({ state: 'sent', makeTasks: true }))
    ).json<OneToOne>();
    expect(again.actions[0]?.taskId).toBe(taskId);
    expect((await bell('agent')).filter((n) => n.kind === 'oneToOneToSign')).toHaveLength(1);
    // the agent signs: it is complete
    const signed = await call('POST', `/coaching-sessions/${id}/sign`, 'agent', { comment: 'Agreed.' });
    expect(signed.statusCode, signed.body).toBe(200);
    expect(signed.json()).toMatchObject({ state: 'signed', signatures: { [agent]: { comment: 'Agreed.' } } });
    // changed later, it stays signed
    expect((await call('PUT', `/one-to-ones/${id}`, 'lead', body({ state: 'draft' }))).json()).toMatchObject({
      state: 'signed',
    });
  });

  it('are completed in person only when the agent signs there', async () => {
    expect((await call('POST', '/one-to-ones', 'reviewer', body({ state: 'signed' }))).json()).toMatchObject({
      code: 'oneToOneSign',
    });
    const out = await call('POST', '/one-to-ones', 'reviewer', body({ state: 'signed', inPerson: true }));
    expect(out.statusCode, out.body).toBe(201);
    const s = out.json<OneToOne>();
    expect(s).toMatchObject({ state: 'signed', status: 'done', signatures: { [agent]: { inPerson: true } } });
    expect(s.leadSignature?.name).toBe('Rita Reviewer');
    expect((await call('GET', `/coaching-sessions/${s.id}`, 'agent')).statusCode).toBe(200);
  });

  it('refuse agents out of reach, never reach another company, and are deleted by those who write them', async () => {
    const stranger = (await call('GET', '/people', 'admin', undefined, SECOND_COMPANY)).json<
      { membershipId: string }[]
    >()[0];
    expect(
      (await call('POST', '/one-to-ones', 'admin', body({ agentId: stranger?.membershipId }))).json(),
    ).toMatchObject({ code: 'sessionAgents' });
    expect((await call('GET', `/coaching-sessions/${id}`, 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(404);
    expect((await call('PUT', `/one-to-ones/${id}`, 'admin', body(), SECOND_COMPANY)).statusCode).toBe(404);
    expect((await call('DELETE', `/one-to-ones/${id}`, 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(404);
    expect((await call('DELETE', `/one-to-ones/${id}`, 'trainer')).statusCode).toBe(403);
    expect((await call('DELETE', `/one-to-ones/${id}`, 'lead')).statusCode).toBe(204);
    expect((await call('GET', `/coaching-sessions/${id}`, 'admin')).statusCode).toBe(404);
    const log = (await call('GET', '/activity', 'admin')).json<{ action: string }[]>();
    expect(log.map((e) => e.action)).toEqual(
      expect.arrayContaining(['oneToOneSaved', 'oneToOneDeleted', 'oneToOneTemplateSaved', 'oneToOneTargetSaved']),
    );
  });
});
