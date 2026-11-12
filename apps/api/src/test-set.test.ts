// AutoQA's test set: Q-smart's 36 conversations in the demo company; the expert scores them; each model runs on them;
// the results per model and language; the quality bar taking over once a model is tested on 20 scored conversations
// (a model under the bar is then never used for AI reviews); the company wall.
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
  seedAutoqaTestSet,
  seedDemo,
  startLocalPostgres,
} from '@qsmart/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CompletionRequest, ProviderAdapter } from './ai/provider.js';
import { ProviderError } from './ai/provider.js';
import { createApp } from './app.js';
import type { TokenVerifier } from './auth/token-verifier.js';

const verifier: TokenVerifier = {
  async verify(token) {
    if (!['admin', 'reviewer', 'lead', 'trainer', 'agent'].includes(token)) throw new Error('invalid token');
    return { uid: `demo-${token}`, email: `${token}@demo.test`, emailVerified: true };
  },
};

/** The pretend AI: gpt-oss-120b answers Yes everywhere; gpt-oss-20b answers No everywhere; or it fails. */
let failing = false;
const asked: string[] = [];
const pretend: ProviderAdapter = {
  complete(r: CompletionRequest) {
    asked.push(r.model);
    if (failing) return Promise.reject(new ProviderError('error', 'http500'));
    const ids = [...r.prompt.matchAll(/id (c\d+q\d+):/g)].map((m) => m[1]);
    // a line of the conversation with real words (an e-mail starts with a heading)
    const lines = (r.prompt.split('<conversation>\n')[1] ?? '').split('\n');
    const quote = (lines.find((l) => l.split(' ').length >= 5) ?? '').split(' ').slice(1, 5).join(' ');
    const yes = r.model === 'openai/gpt-oss-120b';
    const answers = ids.map((id) => ({
      id,
      answer: yes ? 'yes' : 'no',
      quote,
      why: 'Seen.',
      tip: yes ? '' : 'Do better.',
    }));
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
}, 180_000);

afterAll(async () => {
  await app?.close();
  await owner?.$client.end();
  await db?.$client.end();
  await server?.stop();
});

interface Overview {
  scored: number;
  scorecards: { id: string; categories: { questions: unknown[] }[] }[];
  items: { id: string; language: string; expected: unknown; runs: Record<string, number | null> }[];
  models: {
    id: string;
    items: number;
    failed: number;
    score: number | null;
    byLanguage: Record<string, number | null>;
    passes: boolean;
    scoreGap: number | null;
  }[];
}
const overview = async (who = 'reviewer', at = DEMO_COMPANY) =>
  (await call('GET', '/autoqa/test-set', who, undefined, at)).json<Overview>();
const BIG = 'groq/openai/gpt-oss-120b';
const SMALL = 'groq/openai/gpt-oss-20b';

describe("AutoQA's test set", () => {
  it('holds 36 made-up conversations, 12 per language, added once', async () => {
    expect(await seedAutoqaTestSet(owner)).toBe(36);
    expect(await seedAutoqaTestSet(owner)).toBe(0);
    const o = await overview();
    expect(o.items).toHaveLength(36);
    expect(['en', 'bg', 'fr'].map((l) => o.items.filter((i) => i.language === l).length)).toEqual([12, 12, 12]);
    expect(o.scored).toBe(0);
    expect(o.models.map((m) => m.items)).toEqual([0, 0, 0, 0, 0]);
    for (const who of ['lead', 'trainer', 'agent'])
      expect((await call('GET', '/autoqa/test-set', who)).statusCode).toBe(403);
  });

  it("keeps the expert's answers as the yardstick", async () => {
    const o = await overview();
    const card = o.scorecards[0];
    // the expert answers No to the first question, Yes to the rest
    const answers = (card?.categories ?? []).map((c, ci) =>
      c.questions.map((_, qi) => (ci === 0 && qi === 0 ? 'n' : 'y')),
    );
    for (const item of o.items.slice(0, 21))
      expect((await call('PUT', `/autoqa/test-set/${item.id}/expected`, 'reviewer', { answers })).statusCode).toBe(200);
    expect(
      (await call('PUT', `/autoqa/test-set/${o.items[0]?.id}/expected`, 'reviewer', { answers: [['maybe']] }))
        .statusCode,
    ).toBe(400);
    expect((await overview()).scored).toBe(21);
  });

  it('measures each model against the expert, per language, and says which pass', async () => {
    const o = await overview();
    for (const item of o.items.slice(0, 21)) {
      const r = (await call('POST', `/autoqa/test-set/${item.id}/run`, 'reviewer', { modelId: BIG })).json<{
        status: string;
        problem: string;
      }>();
      expect(r, r.problem).toMatchObject({ status: 'ok' });
      await call('POST', `/autoqa/test-set/${item.id}/run`, 'reviewer', { modelId: SMALL });
    }
    const models = (await overview()).models;
    const big = models.find((m) => m.id === BIG);
    const small = models.find((m) => m.id === SMALL);
    // 120b answers Yes everywhere: it disagrees only on the first question (10 of 11 the same)
    expect(big).toMatchObject({ items: 21, failed: 0, score: 90.9, passes: true });
    expect(big?.byLanguage.en).toBe(90.9);
    expect(big?.scoreGap).toBeGreaterThan(0);
    // 20b answers No everywhere: 1 of 11 the same
    expect(small).toMatchObject({ items: 21, passes: false });
    expect(small?.score).toBeLessThan(75);
    expect(
      (await call('POST', `/autoqa/test-set/${o.items[0]?.id}/run`, 'reviewer', { modelId: 'someone/else' }))
        .statusCode,
    ).toBe(400);
  }, 30_000);

  it('then uses only the models that pass for AI reviews', async () => {
    await call('PUT', '/ai/reviews', 'admin', { announced: true, channels: [] });
    const people = (await call('GET', '/people', 'admin')).json<{ membershipId: string; email: string }[]>();
    const agentId = people.find((p) => p.email === 'agent@demo.test')?.membershipId;
    const scorecardId = (await overview()).scorecards[0]?.id;
    const conversation = (
      await call('POST', '/conversations', 'admin', {
        channel: 'chat',
        startedAt: new Date().toISOString(),
        agentId,
        transcript: 'Customer: Hello there, I need help with my order please.\nAgent: Of course, happy to help.',
      })
    ).json<{ id: string }>().id;
    failing = true;
    asked.length = 0;
    const out = await call('POST', `/conversations/${conversation}/ai-review`, 'reviewer', { scorecardId });
    // 120b fails, and 20b is never tried: it didn't pass the test set
    expect(out.json()).toMatchObject({ code: 'aiUnavailable' });
    expect(new Set(asked)).toEqual(new Set(['openai/gpt-oss-120b']));
    failing = false;
    // a failed run is kept and shown, and doesn't count in the agreement
    const item = (await overview()).items[30]?.id;
    failing = true;
    expect((await call('POST', `/autoqa/test-set/${item}/run`, 'reviewer', { modelId: BIG })).json()).toMatchObject({
      status: 'failed',
    });
    failing = false;
    expect((await overview()).models.find((m) => m.id === BIG)).toMatchObject({ failed: 1, items: 21 });
  });

  it("never shows another company's test set", async () => {
    const other = await overview('admin', SECOND_COMPANY);
    expect(other.items).toEqual([]);
    expect(other.models.every((m) => m.items === 0)).toBe(true);
  });
});
