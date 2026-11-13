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
/** what the next calls do first: "too many requests" (free again in so many seconds), or a failure */
const queue: ({ rate: string } | 'fail' | 'ok')[] = [];
const pretend: ProviderAdapter = {
  complete(r: CompletionRequest) {
    asked.push(r.model);
    const next = queue.shift();
    if (next === 'fail') return Promise.reject(new ProviderError('error', 'http500'));
    if (next && next !== 'ok')
      return Promise.reject(new ProviderError('rateLimit', 'http429', { 'x-ratelimit-reset-tokens': next.rate }));
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

  it('runs on the server: waits for a busy free plan, tries a failed review once more, never skips', async () => {
    interface Job {
      state: string;
      total: number;
      done: number;
      ok: number;
      failed: number;
      retry: number;
      waitingFor: string;
      waitingUntil: string | null;
      models: { id: string; total: number }[];
    }
    const latest = async () => (await call('GET', '/autoqa/test-set/jobs/latest', 'reviewer')).json<Job | null>();
    const until = async (test: (j: Job | null) => boolean) => {
      for (let i = 0; i < 100; i++) {
        const j = await latest();
        if (test(j)) return j;
        await new Promise((r) => setTimeout(r, 200));
      }
      return latest();
    };
    expect(await latest()).toBeNull();
    // everything scored was reviewed well by 120b already: nothing to do
    expect(
      (await call('POST', '/autoqa/test-set/jobs', 'reviewer', { modelIds: [BIG], perModel: 36 })).json(),
    ).toMatchObject({ code: 'testJobNothing' });
    // three more conversations scored
    const o = await overview();
    const answers = (o.scorecards[0]?.categories ?? []).map((c) => c.questions.map(() => 'y'));
    for (const item of o.items.slice(21, 24))
      await call('PUT', `/autoqa/test-set/${item.id}/expected`, 'reviewer', { answers });
    // the first call: "too many requests, free again in 1s"; then a good review; then a failure
    queue.push({ rate: '1s' }, 'ok', 'fail');
    asked.length = 0;
    const started = await call('POST', '/autoqa/test-set/jobs', 'reviewer', { modelIds: [BIG], perModel: 36 });
    expect(started.json()).toMatchObject({ reviews: 3 });
    expect(
      (await call('POST', '/autoqa/test-set/jobs', 'reviewer', { modelIds: [SMALL], perModel: 1 })).json(),
    ).toMatchObject({ code: 'testJobRunning' });
    const done = await until((j) => j?.state === 'done');
    // the busy call was waited for (not skipped), the failed review got its second try: all 3 good
    expect(done).toMatchObject({ state: 'done', total: 3, done: 3, ok: 3, failed: 0, retry: 0 });
    expect(asked.length).toBe(5);
    expect((await overview()).models.find((m) => m.id === BIG)?.items).toBe(24);
    // short waits Groq asks for, three in a row, are its per-minute limit, never taken for the daily limit
    const more = o.items.slice(26, 27);
    for (const item of more) await call('PUT', `/autoqa/test-set/${item.id}/expected`, 'reviewer', { answers });
    queue.push({ rate: '1s' }, { rate: '1s' }, { rate: '1s' });
    await call('POST', '/autoqa/test-set/jobs', 'reviewer', { modelIds: [SMALL], perModel: 1 });
    const seen: string[] = [];
    const short = await until((j) => {
      if (j?.waitingFor) seen.push(j.waitingFor);
      return j?.state === 'done';
    });
    expect(short).toMatchObject({ state: 'done', ok: 1 });
    expect(seen).not.toContain('daily');
    // a run waiting for a long pause can be stopped; the people who don't score never start one
    for (const item of o.items.slice(24, 26))
      await call('PUT', `/autoqa/test-set/${item.id}/expected`, 'reviewer', { answers });
    queue.push({ rate: '30s' });
    await call('POST', '/autoqa/test-set/jobs', 'reviewer', { modelIds: [BIG], perModel: 36 });
    const waiting = await until((j) => j?.waitingFor === 'busy');
    expect(waiting).toMatchObject({ state: 'running', total: 3, done: 0, waitingFor: 'busy' });
    expect((await call('POST', '/autoqa/test-set/jobs/stop', 'reviewer')).json()).toEqual({ stopped: true });
    expect(await latest()).toMatchObject({ state: 'stopped', done: 0 });
    for (const who of ['lead', 'agent'])
      expect((await call('POST', '/autoqa/test-set/jobs', who, { modelIds: [BIG], perModel: 1 })).statusCode).toBe(403);
    // another company never sees it
    expect((await call('GET', '/autoqa/test-set/jobs/latest', 'admin', undefined, SECOND_COMPANY)).json()).toBeNull();
  }, 60_000);

  it("never shows another company's test set", async () => {
    const other = await overview('admin', SECOND_COMPANY);
    expect(other.items).toEqual([]);
    expect(other.models.every((m) => m.items === 0)).toBe(true);
  });
});
