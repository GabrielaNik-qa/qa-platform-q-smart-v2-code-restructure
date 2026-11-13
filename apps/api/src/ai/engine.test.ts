// The AI engine with a real database and a pretend AI company: fallbacks, retries, time limits, the circuit breaker,
// the company's switch and monthly limits, the log of every call (without what was sent), and the company wall.
import {
  aiUseThisMonth,
  createDb,
  type Db,
  DEFAULT_AI_RULES,
  DEMO_COMPANY,
  listAiCalls,
  type LocalPostgres,
  runMigrations,
  saveAiRules,
  type AiRules,
  schema,
  SECOND_COMPANY,
  seedDemo,
  startLocalPostgres,
  withCompany,
} from '@qsmart/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PROVIDERS, type Catalogue, type ModelInfo } from './catalogue.js';
import { AiEngine, AiError, type AiJob } from './engine.js';
import type { JobType } from './jobs.js';
import { type CompletionRequest, type ProviderAccount, type ProviderAdapter, ProviderError } from './provider.js';

let server: LocalPostgres;
let owner: Db;
let db: Db;
const company: Record<string, string> = {};
let teamId = '';
let otherTeamId = '';

beforeAll(async () => {
  server = await startLocalPostgres();
  await runMigrations(server.ownerUrl);
  owner = createDb(server.ownerUrl);
  await seedDemo(owner);
  for (const c of await owner.select().from(schema.companies)) company[c.name] = c.id;
  const demoTeams = await owner
    .select()
    .from(schema.teams)
    .where(and(eq(schema.teams.companyId, company[DEMO_COMPANY] ?? ''), eq(schema.teams.isAdministration, false)));
  teamId = demoTeams[0]?.id ?? '';
  otherTeamId = demoTeams[1]?.id ?? '';
  db = createDb(server.appUrl);
}, 180_000);

afterAll(async () => {
  await owner?.$client.end();
  await db?.$client.end();
  await server?.stop();
});

// A pretend catalogue: two AI companies that don't train (one in the EU), and one that may train.
const model = (provider: string, name: string, priceIn: number): ModelInfo => ({
  id: `${provider}/${name}`,
  provider: provider as ModelInfo['provider'],
  model: name,
  priceIn,
  priceOut: priceIn * 2,
  context: 100_000,
  structured: 'json',
  languages: null,
  checked: '2026-11-11',
  source: 'test',
});
const catalogue: Catalogue = {
  providers: {
    alpha: { ...PROVIDERS.groq, id: 'groq', name: 'Alpha' },
    beta: { ...PROVIDERS.groq, id: 'groq', name: 'Beta', euProcessing: true },
    trains: { ...PROVIDERS.groq, id: 'groq', name: 'Trains', terms: 'may-train' },
  },
  models: [model('alpha', 'a1', 0.1), model('alpha', 'a2', 0.2), model('beta', 'b1', 0.5), model('trains', 't1', 0)],
};
const SECRET = 'Customer card ending 4242, agent Ivan';
const job: JobType<{ reply: string }> = {
  feature: 'test.reply',
  schema: z.object({ reply: z.string() }),
  structured: true,
  temperature: 0,
  maxOutputTokens: 20,
  maxWaitMs: 300,
  candidates: ['trains/t1', 'alpha/a1', 'alpha/a2', 'beta/b1'],
};

/** The pretend AI company: each model answers from a script (ok, bad JSON, error, too many requests, no answer). */
type Step = 'ok' | 'bad' | 'error' | 'rate' | 'rate25' | 'hang';
class Pretend implements ProviderAdapter {
  calls: string[] = [];
  requests: CompletionRequest[] = [];
  constructor(private readonly script: Record<string, Step[]>) {}
  complete(r: CompletionRequest) {
    this.calls.push(r.model);
    this.requests.push(r);
    const step = this.script[r.model]?.shift() ?? 'ok';
    if (step === 'error') return Promise.reject(new ProviderError('error', 'http500'));
    if (step === 'rate') return Promise.reject(new ProviderError('rateLimit', 'http429'));
    if (step === 'rate25')
      return Promise.reject(new ProviderError('rateLimit', 'http429', { 'x-ratelimit-reset-tokens': '25.5s' }));
    if (step === 'hang')
      return new Promise<never>((_, reject) => r.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    const text = step === 'bad' ? 'I think it is fine.' : `{"reply":"${r.model} says OK"}`;
    return Promise.resolve({ text, inputTokens: 1000, outputTokens: 10 });
  }
}

const accounts: ProviderAccount[] = [
  { provider: 'alpha', plan: 'paid', apiKey: 'test-key' },
  { provider: 'beta', plan: 'free', apiKey: 'test-key' },
  { provider: 'trains', plan: 'free', apiKey: 'test-key' },
];
const engineWith = (script: Record<string, Step[]> = {}) => {
  const pretend = new Pretend(script);
  const engine = new AiEngine({
    db,
    adapters: { alpha: pretend, beta: pretend, trains: pretend },
    accounts: async () => accounts,
    catalogue,
  });
  return { engine, pretend };
};
const demo = (over: Partial<AiJob<{ reply: string }>> = {}): AiJob<{ reply: string }> => ({
  type: job,
  companyId: company[DEMO_COMPANY] ?? '',
  dataClass: 'client',
  teamId,
  system: 'Reply OK.',
  prompt: SECRET,
  ...over,
});
const setRules = (change: Partial<AiRules>, at = DEMO_COMPANY) =>
  withCompany(db, company[at] ?? '', (tx) => saveAiRules(tx, { ...DEFAULT_AI_RULES, allowPaid: true, ...change }));
const lastCalls = async (n: number, at = DEMO_COMPANY) =>
  (await withCompany(db, company[at] ?? '', (tx) => listAiCalls(tx, n))).reverse();
const failsWith = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    // the database's own reason is one level down in a failed query
    return e instanceof AiError ? e.code : `${String(e)} ${String((e as { cause?: unknown }).cause ?? '')}`;
  }
  return 'no error';
};

beforeEach(async () => {
  await setRules({});
});

describe('the AI engine', () => {
  it('answers with the cheapest allowed model, never one that may train, and records the call', async () => {
    const { engine, pretend } = engineWith();
    const result = await engine.run(demo());
    // "trains" is free but may train on the data; the free EU model and the paid ones cost more or less:
    // b1 is free (0), so it goes first
    expect(result).toEqual({ data: { reply: 'b1 says OK' }, provider: 'beta', model: 'b1', attempt: 1 });
    expect(pretend.calls).toEqual(['b1']);
    expect(pretend.requests[0]).toMatchObject({ temperature: 0, json: true, prompt: SECRET });
    expect(pretend.requests[0]?.system).toContain('Answer with JSON only.');
    const [call] = await lastCalls(1);
    expect(call).toMatchObject({
      feature: 'test.reply',
      dataClass: 'client',
      teamId,
      provider: 'beta',
      model: 'b1',
      inputTokens: 1000,
      outputTokens: 10,
      costMicroUsd: 0,
      status: 'ok',
      attempt: 1,
      error: null,
    });
  });

  it('counts the cost on a paid plan, and falls back to the next model when one fails', async () => {
    await setRules({ allowedProviders: ['alpha'] });
    const { engine, pretend } = engineWith({ a1: ['error'] });
    const result = await engine.run(demo());
    expect(result).toMatchObject({ model: 'a2', attempt: 2 });
    expect(pretend.calls).toEqual(['a1', 'a2']);
    const calls = await lastCalls(2);
    expect(calls.map((c) => [c.model, c.status, c.attempt, c.error])).toEqual([
      ['a1', 'error', 1, 'http500'],
      ['a2', 'ok', 2, null],
    ]);
    // 1000 tokens in × $0.2 + 10 out × $0.4 per million
    expect(calls[1]?.costMicroUsd).toBe(204);
  });

  it('asks once more when the answer does not fit, then moves to the next model', async () => {
    await setRules({ allowedProviders: ['alpha'] });
    const { engine, pretend } = engineWith({ a1: ['bad', 'bad'], a2: ['bad', 'ok'] });
    const result = await engine.run(demo());
    expect(result).toMatchObject({ model: 'a2', attempt: 4 });
    expect(pretend.calls).toEqual(['a1', 'a1', 'a2', 'a2']);
    expect((await lastCalls(4)).map((c) => c.status)).toEqual(['invalid', 'invalid', 'invalid', 'ok']);
  });

  it('gives up on a model that takes too long, and tries the next', async () => {
    await setRules({ allowedProviders: ['alpha'] });
    const { engine } = engineWith({ a1: ['hang'] });
    expect(await engine.run(demo())).toMatchObject({ model: 'a2' });
    const [slow] = await lastCalls(2);
    expect(slow).toMatchObject({ model: 'a1', status: 'timeout' });
    expect(slow?.waitMs).toBeGreaterThanOrEqual(250);
  });

  it('rests an AI company that says "too many requests", so the next job goes elsewhere at once', async () => {
    const { engine, pretend } = engineWith({ b1: ['rate'] });
    expect(await engine.run(demo())).toMatchObject({ model: 'a1', attempt: 2 });
    expect(await engine.run(demo())).toMatchObject({ model: 'a1', attempt: 1 });
    expect(pretend.calls).toEqual(['b1', 'a1', 'a1']);
  });

  it('rests it as long as it asked, and says how long until it is free again', async () => {
    const { engine } = engineWith({ b1: ['rate25'] });
    const job = demo({ onlyModel: 'beta/b1', dataClass: 'test' });
    const wait = async () => {
      try {
        await engine.run(job);
      } catch (e) {
        return e instanceof AiError ? { detail: e.detail, ms: e.retryAfterMs ?? 0 } : null;
      }
      return null;
    };
    const first = await wait();
    expect(first?.detail).toBe('http429');
    expect(first?.ms).toBeGreaterThan(24_000);
    expect(first?.ms).toBeLessThanOrEqual(25_500);
    // asked again at once: still resting, with the time left
    const again = await wait();
    expect(again?.detail).toBe('resting');
    expect(again?.ms).toBeGreaterThan(24_000);
    expect(again?.ms).toBeLessThanOrEqual(25_500);
  });

  it('counts an answer that did not fit as the model’s failure, also when its second chance is refused as busy', async () => {
    const { engine } = engineWith({ b1: ['bad', 'rate25'] });
    try {
      await engine.run(demo({ onlyModel: 'beta/b1', dataClass: 'test' }));
      expect.unreachable();
    } catch (e) {
      expect(e instanceof AiError ? e.detail : e).toBe('schema');
    }
  });

  it('checks a free plan’s limits before sending: over them, nothing is sent and it says how long to wait', async () => {
    const pretend = new Pretend({});
    const paced = new AiEngine({
      db,
      adapters: { alpha: pretend, beta: pretend, trains: pretend },
      accounts: async () => accounts,
      catalogue: {
        ...catalogue,
        models: [
          ...catalogue.models,
          { ...model('beta', 'b9', 0.5), freeLimits: { rpm: 1, checked: '2026-11-13', source: 'test' } },
        ],
      },
    });
    const job9 = demo({ type: { ...job, candidates: ['beta/b9'] }, dataClass: 'test' });
    expect(await paced.run(job9)).toMatchObject({ model: 'b9' });
    try {
      await paced.run(job9);
      expect.unreachable();
    } catch (e) {
      expect(e instanceof AiError ? [e.code, e.detail] : e).toEqual(['aiUnavailable', 'paced']);
      expect(e instanceof AiError ? e.retryAfterMs : 0).toBeGreaterThan(50_000);
      expect(e instanceof AiError ? e.retryAfterMs : 0).toBeLessThanOrEqual(60_000);
    }
    expect(pretend.calls).toEqual(['b9']); // the second was never sent
    expect((await lastCalls(1))[0]).toMatchObject({ status: 'unavailable', error: 'paced' });
  });

  it('says the AI is not available when every model fails, and records each try', async () => {
    const { engine } = engineWith({ a1: ['error'], a2: ['error'], b1: ['error'] });
    expect(await failsWith(engine.run(demo()))).toBe('aiUnavailable');
    expect((await lastCalls(3)).map((c) => [c.model, c.status])).toEqual([
      ['b1', 'error'],
      ['a1', 'error'],
      ['a2', 'error'],
    ]);
  });

  it("follows the company's rules for clients' data: EU only leaves only the EU model; no model left is said clearly", async () => {
    await setRules({ euOnly: true });
    const { engine } = engineWith();
    expect(await engine.run(demo())).toMatchObject({ provider: 'beta' });
    await setRules({ euOnly: true, allowedProviders: ['alpha'] });
    expect(await failsWith(engine.run(demo()))).toBe('aiNoModel');
    expect((await lastCalls(1))[0]).toMatchObject({ status: 'noModel', provider: null });
    // demo data isn't a client's: the company's list doesn't apply to it (the no-training rule always does)
    expect(await engine.run(demo({ dataClass: 'test' }))).toMatchObject({ provider: 'beta' });
  });

  it('uses no paid AI until the company allows it', async () => {
    await setRules({ allowPaid: false, allowedProviders: ['alpha'] });
    const { engine, pretend } = engineWith();
    expect(await failsWith(engine.run(demo()))).toBe('aiNoModel');
    expect(pretend.calls).toEqual([]);
  });

  it("stops when the company switched its AI off, or when this month's limit is reached", async () => {
    const { engine, pretend } = engineWith();
    await setRules({ enabled: false });
    expect(await failsWith(engine.run(demo()))).toBe('aiOff');
    expect((await lastCalls(1))[0]).toMatchObject({ status: 'off' });

    const used = await withCompany(db, company[DEMO_COMPANY] ?? '', (tx) => aiUseThisMonth(tx));
    await setRules({ limits: { company: { calls: used.calls + 1 } } });
    await engine.run(demo());
    expect(await failsWith(engine.run(demo()))).toBe('aiLimit');
    expect((await lastCalls(1))[0]).toMatchObject({ status: 'limit' });

    // a team's own limit stops only that team
    const teamUse = await withCompany(db, company[DEMO_COMPANY] ?? '', (tx) => aiUseThisMonth(tx, teamId));
    await setRules({ limits: { teams: { [teamId]: { calls: teamUse.calls } } } });
    expect(await failsWith(engine.run(demo()))).toBe('aiLimit');
    expect(await engine.run(demo({ teamId: otherTeamId }))).toMatchObject({ provider: 'beta' });
    // and a limit in money: one paid answer (204 millionths of a dollar) more is allowed, then it stops
    await setRules({ allowedProviders: ['alpha'], limits: { company: { microUsd: used.microUsd + 100 } } });
    expect(await engine.run(demo())).toMatchObject({ provider: 'alpha' });
    expect(await failsWith(engine.run(demo()))).toBe('aiLimit');
    const spent = await withCompany(db, company[DEMO_COMPANY] ?? '', (tx) => aiUseThisMonth(tx));
    expect(spent.microUsd).toBeGreaterThanOrEqual(used.microUsd + 100);
    expect(pretend.calls.at(-1)).toBe('a1');
  });

  it('never records what was sent to the AI or what it answered', async () => {
    const { engine } = engineWith();
    await engine.run(demo());
    const all = await withCompany(db, company[DEMO_COMPANY] ?? '', (tx) => listAiCalls(tx, 1000));
    const text = JSON.stringify(all);
    // words a random record id (letters a-f and digits) can never contain
    expect(text).not.toContain('card ending');
    expect(text).not.toContain('Ivan');
    expect(text).not.toContain('says OK');
  });

  it("keeps each company's AI log behind its wall, and the log can't be changed or deleted", async () => {
    const { engine } = engineWith();
    await engine.run(demo());
    expect(await lastCalls(10, SECOND_COMPANY)).toEqual([]);
    await withCompany(db, company[SECOND_COMPANY] ?? '', async (tx) => {
      expect(await aiUseThisMonth(tx)).toEqual({ microUsd: 0, calls: 0 });
    });
    // the second company's rules are its own (no row: the defaults)
    await setRules({ enabled: false });
    expect(
      await engineWith()
        .engine.run(demo({ companyId: company[SECOND_COMPANY] ?? '', teamId: null }))
        .then((r) => r.provider),
    ).toBe('beta');
    // a team of another company can't be written into this company's log
    expect(await failsWith(engine.run(demo({ companyId: company[SECOND_COMPANY] ?? '', teamId })))).toMatch(
      /team is not in the company/,
    );
    for (const change of ["UPDATE ai_calls SET status = 'ok'", 'DELETE FROM ai_calls'])
      expect(await failsWith(withCompany(db, company[DEMO_COMPANY] ?? '', (tx) => tx.execute(change)))).toMatch(
        /permission denied/,
      );
  });
});
