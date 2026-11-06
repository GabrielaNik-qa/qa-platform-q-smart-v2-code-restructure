// Disputes: the agent disputes their own review once, the agent and the reviewers talk, an admin or reviewer resolves
// it; who is told, who may do what, what the database refuses, and the company wall.
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
import type { ScorecardCategory } from '@qsmart/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { TokenVerifier } from './auth/token-verifier.js';

const verifier: TokenVerifier = {
  async verify(token) {
    if (!['admin', 'reviewer', 'lead', 'trainer', 'agent', 'nora'].includes(token)) throw new Error('invalid token');
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

const call = (method: 'GET' | 'POST' | 'DELETE', url: string, who: string, payload?: object, at = DEMO_COMPANY) =>
  app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${who}`, 'x-company-id': company[at] ?? '' },
    ...(payload ? { payload } : {}),
  });
type Card = { id: string; categories: ScorecardCategory[] };
type Message = { authorName: string; authorRole: string; system: boolean; text: string; mine: boolean };
type Dispute = {
  id: string;
  reviewId: string;
  state: string;
  outcome: string | null;
  note: string;
  resolvedByName: string;
  messages: Message[];
};
const idOf = async (email: string) =>
  (await call('GET', '/api/people', 'admin'))
    .json<{ membershipId: string; email: string }[]>()
    .find((p) => p.email === email)?.membershipId ?? '';
const kinds = async (who: string) =>
  (await call('GET', '/api/notifications', who)).json<{ kind: string; details: Record<string, string> }[]>();

/** A new review of Alex (or another agent), by the admin. */
async function review(leadId: string, agentEmail = 'agent@demo.test'): Promise<string> {
  const card = (await call('GET', '/api/scorecards', 'admin')).json<Card[]>()[0] as Card;
  const made = await call('POST', '/api/reviews', 'admin', {
    scorecardId: card.id,
    agentId: await idOf(agentEmail),
    leadId,
    reviewedOn: '2026-11-05',
    answers: card.categories.map((c) => c.questions.map(() => ({ answer: 'y' }))),
  });
  expect(made.statusCode).toBe(201);
  return made.json<{ id: string }>().id;
}

describe('Disputes', () => {
  let first = '';

  it('lets the agent dispute their own review, once, and tells the admins and reviewers', async () => {
    first = await review('D-1');
    expect((await call('POST', `/api/disputes/${first}`, 'agent', { text: '  ' })).json()).toMatchObject({
      code: 'disputeReason',
    });
    const made = await call('POST', `/api/disputes/${first}`, 'agent', { text: 'I did offer the refund.' });
    expect(made.statusCode).toBe(201);
    expect(made.json<Dispute>()).toMatchObject({
      state: 'disputed',
      outcome: null,
      messages: [{ authorName: 'Alex Agent', authorRole: 'agent', text: 'I did offer the refund.', mine: true }],
    });
    // once per review
    expect((await call('POST', `/api/disputes/${first}`, 'agent', { text: 'Again' })).json()).toMatchObject({
      code: 'disputeExists',
    });
    // the review shows as disputed
    expect((await call('GET', `/api/reviews/${first}`, 'agent')).json()).toMatchObject({ status: 'disputed' });
    for (const who of ['admin', 'reviewer'])
      expect((await kinds(who)).find((n) => n.kind === 'disputeOpened')).toMatchObject({
        details: { name: 'Alex Agent', lead: 'D-1' },
      });
    // team leads and trainers don't answer disputes, so they aren't told
    for (const who of ['lead', 'trainer'])
      expect((await kinds(who)).some((n) => n.kind === 'disputeOpened')).toBe(false);
    const log = (await call('GET', '/api/activity', 'admin')).json<{ action: string }[]>();
    expect(log.some((e) => e.action === 'disputeOpened')).toBe(true);
  });

  it('is only for the agent of the review', async () => {
    const other = await review('D-2');
    for (const who of ['admin', 'reviewer', 'lead', 'trainer'])
      expect((await call('POST', `/api/disputes/${other}`, who, { text: 'No' })).statusCode).toBe(403);
  });

  it('lets the agent and the reviewers talk while it is open, and tells the other side', async () => {
    const answer = await call('POST', `/api/disputes/${first}/messages`, 'reviewer', { text: 'Let me listen again.' });
    expect(answer.statusCode).toBe(201);
    const dispute = answer.json<Dispute>();
    expect(dispute.state).toBe('progress');
    expect(dispute.messages.map((m) => [m.authorRole, m.mine])).toEqual([
      ['agent', false],
      ['reviewer', true],
    ]);
    expect((await kinds('agent')).find((n) => n.kind === 'disputeMessage')).toMatchObject({
      details: { name: 'Rita Reviewer', lead: 'D-1', text: 'Let me listen again.' },
    });
    expect((await call('POST', `/api/disputes/${first}/messages`, 'agent', { text: 'Thanks!' })).statusCode).toBe(201);
    expect((await kinds('admin')).some((n) => n.kind === 'disputeMessage')).toBe(true);
    // team leads and trainers read it, but don't write in it
    for (const who of ['lead', 'trainer']) {
      expect((await call('GET', `/api/disputes/${first}`, who)).json<Dispute>().messages).toHaveLength(3);
      expect((await call('POST', `/api/disputes/${first}/messages`, who, { text: 'Hi' })).statusCode).toBe(403);
    }
    expect((await call('POST', `/api/disputes/${first}/messages`, 'agent', { text: '' })).json()).toMatchObject({
      code: 'disputeMessage',
    });
  });

  it('is resolved by an admin or reviewer, once, and the agent is told', async () => {
    for (const who of ['lead', 'trainer', 'agent'])
      expect((await call('POST', `/api/disputes/${first}/resolve`, who, { outcome: 'kept' })).statusCode).toBe(403);
    expect((await call('POST', `/api/disputes/${first}/resolve`, 'admin', { outcome: 'maybe' })).json()).toMatchObject({
      code: 'disputeResolveInvalid',
    });
    const done = await call('POST', `/api/disputes/${first}/resolve`, 'reviewer', {
      outcome: 'partly',
      note: 'The greeting point is back.',
    });
    expect(done.statusCode).toBe(200);
    expect(done.json<Dispute>()).toMatchObject({
      state: 'resolved',
      outcome: 'partly',
      note: 'The greeting point is back.',
      resolvedByName: 'Rita Reviewer',
    });
    expect(done.json<Dispute>().messages.at(-1)).toMatchObject({ system: true, text: 'partly' });
    expect((await call('GET', `/api/reviews/${first}`, 'agent')).json()).toMatchObject({ status: 'ok' });
    expect((await kinds('agent')).find((n) => n.kind === 'disputeResolved')).toMatchObject({
      details: { lead: 'D-1', outcome: 'partly' },
    });
    // closed: no second resolution, no more messages, no new dispute
    expect((await call('POST', `/api/disputes/${first}/resolve`, 'admin', { outcome: 'kept' })).json()).toMatchObject({
      code: 'disputeClosed',
    });
    expect((await call('POST', `/api/disputes/${first}/messages`, 'agent', { text: 'But…' })).json()).toMatchObject({
      code: 'disputeClosed',
    });
    expect((await call('POST', `/api/disputes/${first}`, 'agent', { text: 'Again' })).json()).toMatchObject({
      code: 'disputeExists',
    });
  });

  it('lists the disputes each person may see', async () => {
    expect((await call('GET', '/api/disputes', 'agent')).json<Dispute[]>().map((d) => d.reviewId)).toEqual([first]);
    // an agent of a team outside the reviewer's workspaces
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
    await owner.update(schema.users).set({ firebaseUid: 'demo-nora' }).where(eq(schema.users.email, 'nora@demo.test'));
    const hers = await review('NIGHT-1', 'nora@demo.test');
    expect((await call('POST', `/api/disputes/${hers}`, 'nora', { text: 'Not fair' })).statusCode).toBe(201);
    // the reviewer doesn't reach Nora's team: not told, not listed, can't answer or resolve
    expect((await kinds('reviewer')).some((n) => n.details['name'] === 'Nora Night')).toBe(false);
    expect((await call('GET', '/api/disputes', 'reviewer')).json<Dispute[]>().some((d) => d.reviewId === hers)).toBe(
      false,
    );
    expect((await call('POST', `/api/disputes/${hers}/messages`, 'reviewer', { text: 'Hm' })).statusCode).toBe(404);
    expect((await call('POST', `/api/disputes/${hers}/resolve`, 'reviewer', { outcome: 'kept' })).statusCode).toBe(404);
    // Alex doesn't see Nora's either; the admin sees both
    expect((await call('GET', `/api/disputes/${hers}`, 'agent')).statusCode).toBe(404);
    expect((await call('GET', '/api/disputes', 'admin')).json<Dispute[]>().map((d) => d.reviewId)).toEqual([
      hers,
      first,
    ]);
  });

  it('goes with its review when the review is deleted', async () => {
    const gone = await review('D-3');
    await call('POST', `/api/disputes/${gone}`, 'agent', { text: 'Wrong agent' });
    expect((await call('DELETE', `/api/reviews/${gone}`, 'admin')).statusCode).toBe(204);
    expect((await call('GET', '/api/disputes', 'admin')).json<Dispute[]>().some((d) => d.reviewId === gone)).toBe(
      false,
    );
  });

  it('never lets the server change or delete a message', async () => {
    const tries = [
      sql`update dispute_messages set text = 'changed'`,
      sql`delete from dispute_messages`,
      sql`delete from disputes`,
      sql`update disputes set review_id = review_id`,
    ];
    // 42501: PostgreSQL's "not allowed"
    for (const statement of tries) {
      const refused = await withCompany(db, company[DEMO_COMPANY] ?? '', (tx) => tx.execute(statement)).then(
        () => 'accepted',
        (error: { cause?: { code?: string } }) => error.cause?.code,
      );
      expect(refused).toBe('42501');
    }
  });

  it("never reaches another company's disputes", async () => {
    expect((await call('GET', '/api/disputes', 'admin', undefined, SECOND_COMPANY)).json()).toEqual([]);
    expect((await call('GET', `/api/disputes/${first}`, 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(404);
    expect(
      (await call('POST', `/api/disputes/${first}/resolve`, 'admin', { outcome: 'kept' }, SECOND_COMPANY)).statusCode,
    ).toBe(404);
    // and in the database: no company, no rows
    const rows = await db.execute(sql`select count(*)::int as n from disputes`);
    expect(rows.rows[0]).toEqual({ n: 0 });
  });
});
