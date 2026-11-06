// Calibration: who makes, sees and changes a session, each participant's own part, blind scoring, the reference,
// decisions, and the company wall.
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
import { sql } from 'drizzle-orm';
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
type Session = {
  id: string;
  title: string;
  status: string;
  owner: boolean;
  myParticipantId: string | null;
  participants: { id: string; membershipId: string; name: string; impression: string }[];
  reviews: { id: string; leadId: string }[];
  scores: { reviewId: string; participantId: string; score: number }[];
  scoredCount: Record<string, number>;
  teamNames: string[];
  decisions: { text: string; ownerId: string; done: boolean }[];
  reference: Record<string, string>;
};
const idOf = async (email: string) =>
  (await call('GET', '/api/people', 'admin'))
    .json<{ membershipId: string; email: string }[]>()
    .find((p) => p.email === email)?.membershipId ?? '';
const get = async (id: string, who: string) => (await call('GET', `/api/calibrations/${id}`, who)).json<Session>();

describe('Calibration', () => {
  let session: Session;
  let reviewId = '';

  it('lets staff make a session; the participants are invited, and the maker is always in it', async () => {
    expect((await call('POST', '/api/calibrations', 'agent', { heldOn: '2026-11-10' })).statusCode).toBe(403);
    expect((await call('POST', '/api/calibrations', 'reviewer', { heldOn: 'soon' })).json()).toMatchObject({
      code: 'calibrationInvalid',
    });
    const made = await call('POST', '/api/calibrations', 'reviewer', {
      title: 'November calibration',
      heldOn: '2026-11-10',
      teamIds: (await call('GET', '/api/teams', 'admin'))
        .json<{ id: string; name: string }[]>()
        .filter((x) => x.name === 'B2B')
        .map((x) => x.id),
      participantIds: [await idOf('lead@demo.test'), await idOf('trainer@demo.test'), await idOf('agent@demo.test')],
    });
    expect(made.statusCode).toBe(201);
    session = made.json<Session>();
    // agents can't take part
    expect(session.participants.map((p) => p.name)).toEqual(['Leo Lead', 'Rita Reviewer', 'Tina Trainer']);
    expect(session.owner).toBe(true);
    expect(session.teamNames).toEqual(['B2B']);
    for (const who of ['lead', 'trainer']) {
      const notes = (await call('GET', '/api/notifications', who)).json<
        { kind: string; details: object; link: string }[]
      >();
      expect(notes[0]).toMatchObject({
        kind: 'calibrationInvite',
        details: { name: 'Rita Reviewer', title: 'November calibration', date: '2026-11-10' },
        link: `/calibration/${session.id}`,
      });
    }
  });

  it('is seen only by its participants and admins', async () => {
    const other = (
      await call('POST', '/api/calibrations', 'lead', { title: 'Leads only', heldOn: '2026-11-11' })
    ).json<Session>();
    expect((await call('GET', '/api/calibrations', 'trainer')).json<Session[]>().map((c) => c.title)).toEqual([
      'November calibration',
    ]);
    expect((await call('GET', `/api/calibrations/${other.id}`, 'trainer')).statusCode).toBe(404);
    expect((await call('GET', '/api/calibrations', 'admin')).json<Session[]>()).toHaveLength(2);
    expect((await call('GET', '/api/calibrations', 'agent')).statusCode).toBe(403);
  });

  it('is changed and deleted only by its maker or an admin', async () => {
    const change = { title: 'November calibration', heldOn: '2026-11-12', status: 'held' };
    expect((await call('PUT', `/api/calibrations/${session.id}`, 'lead', change)).json()).toMatchObject({
      code: 'calibrationOwner',
    });
    expect((await call('DELETE', `/api/calibrations/${session.id}`, 'trainer')).statusCode).toBe(403);
    const same = session.participants.map((p) => p.membershipId);
    const changed = await call('PUT', `/api/calibrations/${session.id}`, 'reviewer', {
      ...change,
      participantIds: same,
    });
    expect(changed.json<Session>()).toMatchObject({ status: 'held' });
  });

  it('lets each participant write only their own part', async () => {
    const saved = await call('PUT', `/api/calibrations/${session.id}/my-part`, 'lead', {
      impression: 'B2B is strong on greetings',
      done: 'Coached two agents',
    });
    const parts = saved.json<Session>().participants;
    expect(parts.find((p) => p.name === 'Leo Lead')?.impression).toBe('B2B is strong on greetings');
    expect(parts.filter((p) => p.impression)).toHaveLength(1);
  });

  it('scores blind: the others’ scores show only after you score', async () => {
    const card = (await call('GET', '/api/scorecards', 'admin')).json<
      { id: string; categories: ScorecardCategory[] }[]
    >()[0];
    reviewId = (
      await call('POST', '/api/reviews', 'admin', {
        scorecardId: card?.id,
        agentId: await idOf('agent@demo.test'),
        leadId: 'CAL-1',
        reviewedOn: '2026-11-05',
        answers: card?.categories.map((c) => c.questions.map(() => ({ answer: 'y' }))),
      })
    ).json<{ id: string }>().id;
    expect((await call('POST', `/api/calibrations/${session.id}/reviews`, 'trainer', { reviewId })).statusCode).toBe(
      201,
    );
    expect(
      (await call('PUT', `/api/calibrations/${session.id}/scores/${reviewId}`, 'lead', { score: 101 })).json(),
    ).toMatchObject({
      code: 'calibrationScore',
    });
    await call('PUT', `/api/calibrations/${session.id}/scores/${reviewId}`, 'lead', {
      score: 80,
      note: 'Missed the offer',
    });
    // the trainer hasn't scored yet: only how many have
    const before = await get(session.id, 'trainer');
    expect(before.scores).toEqual([]);
    expect(before.scoredCount[reviewId]).toBe(1);
    // the maker and admins see every score
    expect((await get(session.id, 'reviewer')).scores).toHaveLength(1);
    expect((await get(session.id, 'admin')).scores).toHaveLength(1);
    // after scoring, the trainer sees both
    const after = (
      await call('PUT', `/api/calibrations/${session.id}/scores/${reviewId}`, 'trainer', { score: 90 })
    ).json<Session>();
    expect(after.scores.map((s) => s.score).sort()).toEqual([80, 90]);
    // admins who don't take part don't score
    expect(
      (await call('PUT', `/api/calibrations/${session.id}/scores/${reviewId}`, 'admin', { score: 70 })).statusCode,
    ).toBe(403);
  });

  it('lets the maker choose the reference score', async () => {
    const lead = session.participants.find((p) => p.name === 'Leo Lead')?.id ?? '';
    expect(
      (await call('PUT', `/api/calibrations/${session.id}/reference/${reviewId}`, 'lead', { who: lead })).statusCode,
    ).toBe(403);
    const set = await call('PUT', `/api/calibrations/${session.id}/reference/${reviewId}`, 'reviewer', { who: lead });
    expect(set.json<Session>().reference).toEqual({ [reviewId]: lead });
  });

  it('keeps the decisions, with a participant as owner', async () => {
    const lead = await idOf('lead@demo.test');
    const saved = await call('PUT', `/api/calibrations/${session.id}/decisions`, 'trainer', {
      decisions: [
        { text: 'Retrain on offers', ownerId: lead, due: '2026-11-20' },
        { text: 'Share the notes', ownerId: await idOf('agent@demo.test') },
      ],
    });
    expect(saved.json<Session>().decisions).toEqual([
      { text: 'Retrain on offers', ownerId: lead, due: '2026-11-20', done: false },
      // the agent isn't a participant, so the decision has no owner
      { text: 'Share the notes', ownerId: '', due: '', done: false },
    ]);
  });

  it('shows everyone every score once closed, and no score changes after that', async () => {
    await call('PUT', `/api/calibrations/${session.id}`, 'reviewer', {
      title: 'November calibration',
      heldOn: '2026-11-12',
      status: 'closed',
      participantIds: session.participants.map((p) => p.membershipId),
    });
    expect(
      (await call('PUT', `/api/calibrations/${session.id}/scores/${reviewId}`, 'lead', { score: 85 })).json(),
    ).toMatchObject({ code: 'calibrationClosed' });
  });

  it('drops the scores of people taken off, and the reviews that are deleted', async () => {
    const lead = await idOf('lead@demo.test');
    const kept = session.participants.map((p) => p.membershipId).filter((m) => m !== lead);
    const changed = (
      await call('PUT', `/api/calibrations/${session.id}`, 'reviewer', {
        title: 'November calibration',
        heldOn: '2026-11-12',
        status: 'held',
        participantIds: kept,
      })
    ).json<Session>();
    expect(changed.participants.map((p) => p.name)).toEqual(['Rita Reviewer', 'Tina Trainer']);
    expect(changed.scores.map((s) => s.score)).toEqual([90]);
    // Leo no longer sees it
    expect((await call('GET', `/api/calibrations/${session.id}`, 'lead')).statusCode).toBe(404);
    await call('DELETE', `/api/reviews/${reviewId}`, 'admin');
    expect((await get(session.id, 'reviewer')).reviews).toEqual([]);
  });

  it("never reaches another company's sessions", async () => {
    expect((await call('GET', '/api/calibrations', 'admin', undefined, SECOND_COMPANY)).json()).toEqual([]);
    expect((await call('GET', `/api/calibrations/${session.id}`, 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(
      404,
    );
    for (const table of ['calibrations', 'calibration_participants', 'calibration_reviews', 'calibration_scores']) {
      const rows = await db.execute(sql.raw(`select count(*)::int as n from ${table}`));
      expect(rows.rows[0]).toEqual({ n: 0 });
    }
  });

  it('is deleted by its maker', async () => {
    expect((await call('DELETE', `/api/calibrations/${session.id}`, 'reviewer')).statusCode).toBe(204);
    const log = (await call('GET', '/api/activity', 'admin')).json<{ action: string }[]>();
    expect(log.filter((e) => e.action.startsWith('calibration')).map((e) => e.action)).toEqual([
      'calibrationDeleted',
      'calibrationAdded',
      'calibrationAdded',
    ]);
  });
});
