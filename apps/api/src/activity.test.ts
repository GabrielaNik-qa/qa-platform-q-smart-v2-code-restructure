// The activity log, the notification bell, Roles & permissions and Notifications & Confirmations.
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
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { TokenVerifier, VerifiedPerson } from './auth/token-verifier.js';

const signedIn: Record<string, number> = { admin: 1000, reviewer: 1000, agent: 1000 };
const person = (role: string): VerifiedPerson => ({
  uid: `demo-${role}`,
  email: `${role}@demo.test`,
  emailVerified: true,
  signedInAt: signedIn[role],
});
const verifier: TokenVerifier = {
  async verify(token) {
    if (!(token in signedIn)) throw new Error('invalid token');
    return person(token);
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
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  who: string,
  payload?: object,
  at: string | null = DEMO_COMPANY,
) =>
  app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${who}`, ...(at ? { 'x-company-id': company[at] ?? '' } : {}) },
    ...(payload ? { payload } : {}),
  });
type Entry = { action: string; actorName: string; targetName: string; details: Record<string, string> };
type Note = { id: string; kind: string; details: Record<string, string>; read: boolean };
const log = async (kind = 'all') => (await call('GET', `/api/activity?kind=${kind}`, 'admin')).json<Entry[]>();
const notes = async (who: string) => (await call('GET', '/api/notifications', who)).json<Note[]>();

describe('the activity log', () => {
  it('records each sign-in once, in every company of the person', async () => {
    await call('GET', '/api/me', 'admin', undefined, null);
    await call('GET', '/api/me', 'admin', undefined, null);
    expect((await log('signins')).filter((e) => e.actorName === 'Ada Admin')).toHaveLength(1);
    signedIn['admin'] = 2000; // a new sign-in
    await call('GET', '/api/me', 'admin', undefined, null);
    expect((await log('signins')).filter((e) => e.actorName === 'Ada Admin')).toHaveLength(2);
    const second = (await call('GET', '/api/activity?kind=signins', 'admin', undefined, SECOND_COMPANY)).json<
      Entry[]
    >();
    expect(second.map((e) => e.actorName)).toEqual(['Ada Admin', 'Ada Admin']);
  });

  it('records changes to people, with a notification for the person', async () => {
    const people = (await call('GET', '/api/people', 'admin')).json<{ membershipId: string; email: string }[]>();
    const rita = people.find((p) => p.email === 'reviewer@demo.test');
    const changed = await call('PATCH', `/api/people/${rita?.membershipId}`, 'admin', { role: 'lead' });
    expect(changed.statusCode).toBe(200);
    expect((await log()).find((e) => e.action === 'personRole')).toMatchObject({
      actorName: 'Ada Admin',
      targetName: 'Rita Reviewer',
      details: { from: 'reviewer', to: 'lead' },
    });
    const ritas = await notes('reviewer');
    expect(ritas.map((n) => n.kind)).toContain('roleChanged');
    // nobody else sees Rita's notification
    expect((await notes('agent')).some((n) => n.kind === 'roleChanged')).toBe(false);
  });

  it('is for admins; everyone sees their own activity', async () => {
    expect((await call('GET', '/api/activity', 'reviewer')).statusCode).toBe(403);
    expect((await call('GET', '/api/activity', 'agent')).statusCode).toBe(403);
    await call('GET', '/api/me', 'agent', undefined, null);
    const mine = (await call('GET', '/api/activity/mine', 'agent')).json<Entry[]>();
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((e) => e.actorName === 'Alex Agent' || e.targetName === 'Alex Agent')).toBe(true);
  });

  it('can never be changed or deleted, even by the server', async () => {
    const change = withCompany(db, company[DEMO_COMPANY] ?? '', (tx) =>
      tx.execute(sql`update activity set action = 'x'`),
    );
    await expect(change).rejects.toThrow();
    const remove = withCompany(db, company[DEMO_COMPANY] ?? '', (tx) => tx.execute(sql`delete from activity`));
    await expect(remove).rejects.toThrow();
  });
});

describe('the notification bell', () => {
  it('marks my notifications read and lets me delete only mine', async () => {
    const [first] = await notes('reviewer');
    expect(first?.read).toBe(false);
    expect((await call('POST', '/api/notifications/read', 'reviewer', {})).statusCode).toBe(204);
    expect((await notes('reviewer')).every((n) => n.read)).toBe(true);
    expect((await call('DELETE', `/api/notifications/${first?.id}`, 'agent')).statusCode).toBe(404);
    expect((await call('DELETE', `/api/notifications/${first?.id}`, 'reviewer')).statusCode).toBe(204);
    expect((await notes('reviewer')).some((n) => n.id === first?.id)).toBe(false);
  });
});

describe('Roles & permissions', () => {
  it('lets only admins choose who sees which page, and gives everyone the choice in their menu', async () => {
    const rules = { roles: { kudos: ['admin', 'lead'] }, people: {} };
    expect((await call('PUT', '/api/page-rules', 'agent', rules)).statusCode).toBe(403);
    expect((await call('PUT', '/api/page-rules', 'admin', { roles: { kudos: ['boss'] } })).statusCode).toBe(400);
    expect((await call('PUT', '/api/page-rules', 'admin', rules)).statusCode).toBe(200);
    const me = (await call('GET', '/api/me', 'agent', undefined, null)).json<{
      companies: { pageRules: unknown; membershipId: string }[];
    }>();
    expect(me.companies[0]?.pageRules).toEqual(rules);
    expect(me.companies[0]?.membershipId).toBeTruthy();
    expect((await log()).some((e) => e.action === 'pageRules')).toBe(true);
  });
});

describe('Notifications & Confirmations', () => {
  it('saves my choices with my account', async () => {
    expect((await call('PUT', '/api/me/prefs', 'agent', { info: false, confirm: true }, null)).statusCode).toBe(204);
    const me = (await call('GET', '/api/me', 'agent', undefined, null)).json<{ prefs: unknown }>();
    expect(me.prefs).toEqual({ info: false, confirm: true });
    expect((await call('PUT', '/api/me/prefs', 'agent', { info: 'yes' }, null)).statusCode).toBe(400);
  });
});
