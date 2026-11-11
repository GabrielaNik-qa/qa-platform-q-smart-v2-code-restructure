// The AutoQA page through the server: the accuracy score against people's reviews of the same conversations, staff
// only; the brake after 20 compared conversations (admins told once) and pausing a category; the random sample for
// reviewers, which a person's review (QA Entry, linked to the conversation) takes out; the company wall.
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
import type { ProviderAdapter } from './ai/provider.js';
import { createApp } from './app.js';
import type { TokenVerifier } from './auth/token-verifier.js';

const verifier: TokenVerifier = {
  async verify(token) {
    if (!['admin', 'reviewer', 'lead', 'trainer', 'agent'].includes(token)) throw new Error('invalid token');
    return { uid: `demo-${token}`, email: `${token}@demo.test`, emailVerified: true };
  },
};

/** The pretend AI answers Yes to everything, quoting the conversation's first words. */
const pretend: ProviderAdapter = {
  complete(r) {
    const ids = [...r.prompt.matchAll(/id (c\d+q\d+):/g)].map((m) => m[1]);
    const quote = (/<conversation>\n(.*)\n/.exec(r.prompt)?.[1] ?? '').split(' ').slice(1, 5).join(' ');
    const answers = ids.map((id) => ({ id, answer: 'yes', quote, why: 'Seen.', tip: '' }));
    return Promise.resolve({
      text: JSON.stringify({ injection: false, answers, summary: 'Fine.' }),
      inputTokens: 1,
      outputTokens: 1,
    });
  },
};

let server: LocalPostgres;
let owner: Db;
let db: Db;
let app: NestFastifyApplication;
const company: Record<string, string> = {};
let agentId = '';
let card: { id: string; categories: { name: string; questions: unknown[] }[] };

const call = (method: 'GET' | 'PUT' | 'POST', url: string, who: string, payload?: object, at = DEMO_COMPANY) =>
  app.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${who}`, 'x-company-id': company[at] ?? '' },
    ...(payload ? { payload } : {}),
  });

beforeAll(async () => {
  server = await startLocalPostgres();
  await runMigrations(server.ownerUrl);
  owner = createDb(server.ownerUrl);
  await seedDemo(owner);
  for (const c of await owner.select().from(schema.companies)) company[c.name] = c.id;
  db = createDb(server.appUrl);
  app = await createApp({
    db,
    verifier,
    ai: { adapters: { groq: pretend }, accounts: async () => [{ provider: 'groq', plan: 'free', apiKey: 'test' }] },
  });
  const people = (await call('GET', '/people', 'admin')).json<{ membershipId: string; email: string }[]>();
  agentId = people.find((p) => p.email === 'agent@demo.test')?.membershipId ?? '';
  card = (await call('GET', '/scorecards', 'admin')).json<(typeof card)[]>()[0] as typeof card;
  await call('PUT', '/ai/reviews', 'admin', { announced: true, channels: [] });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await owner?.$client.end();
  await db?.$client.end();
  await server?.stop();
});

/** A conversation reviewed by AutoQA (all Yes); with `person`, also by a person who answers No to the first question. */
async function reviewed(person: boolean, lead: string) {
  const id = (
    await call('POST', '/conversations', 'admin', {
      channel: 'chat',
      startedAt: new Date().toISOString(),
      agentId,
      transcript: 'Customer: Hello there, I need some help please.\nAgent: Of course, happy to help.',
      values: { language: 'en' },
    })
  ).json<{ id: string }>().id;
  const ai = await call('POST', `/conversations/${id}/ai-review`, 'reviewer', { scorecardId: card.id });
  expect(ai.json()).toMatchObject({ status: 'reviewed' });
  if (person) {
    const answers = card.categories.map((c, ci) =>
      c.questions.map((_, qi) => ({ answer: ci === 0 && qi === 0 ? 'n' : 'y' })),
    );
    const saved = await call('POST', '/reviews', 'reviewer', {
      leadId: lead,
      agentId,
      reviewedOn: new Date().toISOString().slice(0, 10),
      channel: 'chat',
      scorecardId: card.id,
      answers,
      conversationId: id,
    });
    expect(saved.statusCode, saved.body).toBe(201);
  }
  return id;
}

interface Page {
  tiles: { aiReviews: number; average: number | null };
  accuracy?: {
    overall: { score: number | null; conversations: number };
    byCategory: {
      key: string;
      category: string;
      score: number | null;
      conversations: number;
      braked: boolean;
      paused: boolean;
    }[];
    byModel: { key: string }[];
    disagreements: { question: string }[];
  };
}
const page = async (who = 'admin', at = DEMO_COMPANY) =>
  (await call('GET', '/autoqa', who, undefined, at)).json<Page>();

describe('the AutoQA page', () => {
  it('measures how often AutoQA agrees with people, for staff only', async () => {
    await reviewed(true, 'L-1');
    await reviewed(true, 'L-2');
    const lone = await reviewed(false, 'L-3');
    const p = await page();
    expect(p.tiles.aiReviews).toBe(3);
    expect(p.accuracy?.overall.conversations).toBe(2);
    expect(p.accuracy?.overall.score).toBeLessThan(100);
    const first = p.accuracy?.byCategory.find((c) => c.category === card.categories[0]?.name);
    expect(first?.score).toBeLessThan(100);
    expect(first?.braked).toBe(false); // fewer than 20 conversations
    expect(p.accuracy?.byModel.map((m) => m.key)).toEqual(['openai/gpt-oss-120b']);
    expect(p.accuracy?.disagreements[0]?.question).toBeTruthy();
    expect((await page('agent')).accuracy).toBeUndefined();
    expect((await page('agent')).tiles.aiReviews).toBe(3); // the demo agent's own
    // the sample: AI-reviewed, no person yet
    const sample = (await call('GET', '/autoqa/sample?n=5', 'reviewer')).json<{ id: string }[]>();
    expect(sample.map((s) => s.id)).toEqual([lone]);
    expect((await call('GET', '/autoqa/sample', 'lead')).statusCode).toBe(403);
  });

  it('brakes a category after 20 compared conversations under the bar, and tells the admins once', async () => {
    for (let i = 0; i < 18; i++) await reviewed(true, `B-${i}`);
    const p = await page();
    const first = p.accuracy?.byCategory.find((c) => c.category === card.categories[0]?.name);
    expect(first?.conversations).toBe(20);
    expect(first?.braked).toBe(true);
    const told = (await call('GET', '/notifications', 'admin')).json<{ kind: string }[]>();
    expect(told.filter((n) => n.kind === 'aiAccuracyLow')).toHaveLength(1);
    await reviewed(true, 'B-more');
    expect(
      (await call('GET', '/notifications', 'admin'))
        .json<{ kind: string }[]>()
        .filter((n) => n.kind === 'aiAccuracyLow'),
    ).toHaveLength(1);
  });

  it('lets an admin pause AI reviews for a category, and set the bar', async () => {
    const key = (await page()).accuracy?.byCategory.find((c) => c.braked)?.key ?? '';
    expect((await call('PUT', '/autoqa/brake', 'reviewer', { bar: 75, paused: [key] })).statusCode).toBe(403);
    expect((await call('PUT', '/autoqa/brake', 'admin', { bar: 75, paused: [key] })).json()).toMatchObject({
      paused: [key],
    });
    const id = (
      await call('POST', '/conversations', 'admin', {
        channel: 'chat',
        startedAt: new Date().toISOString(),
        agentId,
        transcript: 'Customer: Hi.\nAgent: Hello!',
      })
    ).json<{ id: string }>().id;
    expect(
      (await call('POST', `/conversations/${id}/ai-review`, 'reviewer', { scorecardId: card.id })).json(),
    ).toMatchObject({
      code: 'aiCategoryPaused',
    });
    expect((await page()).accuracy?.byCategory.find((c) => c.key === key)?.paused).toBe(true);
    // a low bar: nothing braked any more
    await call('PUT', '/autoqa/brake', 'admin', { bar: 10, paused: [] });
    expect((await page()).accuracy?.byCategory.some((c) => c.braked)).toBe(false);
    expect((await call('PUT', '/autoqa/brake', 'admin', { bar: 0, paused: [] })).statusCode).toBe(400);
  });

  it("never mixes in another company's reviews or conversations", async () => {
    const other = await page('admin', SECOND_COMPANY);
    expect(other.tiles.aiReviews).toBe(0);
    expect(other.accuracy?.overall.conversations).toBe(0);
    const someone = (await call('GET', '/conversations', 'admin')).json<{ id: string }[]>()[0]?.id;
    const foreign = await call(
      'POST',
      '/reviews',
      'admin',
      {
        leadId: 'X',
        agentId,
        reviewedOn: '2026-11-11',
        channel: 'chat',
        scorecardId: card.id,
        answers: [],
        conversationId: someone,
      },
      SECOND_COMPANY,
    );
    expect(foreign.statusCode).toBe(400);
  });
});
