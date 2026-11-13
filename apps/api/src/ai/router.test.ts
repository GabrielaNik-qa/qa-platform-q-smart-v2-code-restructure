// The AI engine's choice of model and its circuit breaker, without a database: the data rules (no-train-dpa always;
// a company's own rules for clients' data), what a model can do, and cheapest first.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CATALOGUE, type Catalogue, type ModelInfo, PROVIDERS } from './catalogue.js';
import { readAnswer } from './engine.js';
import { AI_TEST, type JobType } from './jobs.js';
import type { ProviderAccount } from './provider.js';
import { CircuitBreaker, costMicroUsd, type RouteInput, route, waitFromLimits } from './router.js';

const model = (id: string, provider: string, over: Partial<ModelInfo> = {}): ModelInfo => ({
  id,
  provider: provider as ModelInfo['provider'],
  model: id,
  priceIn: 1,
  priceOut: 2,
  context: 10_000,
  structured: 'json',
  languages: null,
  checked: '2026-11-11',
  source: 'test',
  ...over,
});
const provider = (id: string, terms: 'may-train' | 'no-train-dpa', euProcessing = false) => ({
  ...PROVIDERS.groq,
  id: id as 'groq',
  name: id,
  terms,
  euProcessing,
});
const catalogue: Catalogue = {
  providers: {
    usa: provider('usa', 'no-train-dpa'),
    eu: provider('eu', 'no-train-dpa', true),
    trains: provider('trains', 'may-train'),
  },
  models: [
    model('usa-big', 'usa', { priceIn: 3, priceOut: 3 }),
    model('usa-small', 'usa', { priceIn: 0.1, priceOut: 0.2 }),
    model('eu-mid', 'eu'),
    model('trains-cheap', 'trains', { priceIn: 0, priceOut: 0 }),
    model('usa-text', 'usa', { structured: 'none' }),
    model('usa-tiny', 'usa', { context: 100 }),
    model('usa-en', 'usa', { languages: ['en'] }),
  ],
};
const job: JobType = {
  ...AI_TEST,
  feature: 'test.job',
  maxOutputTokens: 10,
  candidates: ['usa-big', 'usa-small', 'eu-mid', 'trains-cheap', 'usa-text', 'usa-tiny', 'usa-en', 'nowhere'],
};
const paid = (p: string): ProviderAccount => ({ provider: p, plan: 'paid', apiKey: 'k' });
const free = (p: string): ProviderAccount => ({ provider: p, plan: 'free', apiKey: 'k' });
const input = (over: Partial<RouteInput> = {}): RouteInput => ({
  job,
  dataClass: 'client',
  inputTokens: 200,
  rules: { euOnly: false, allowedProviders: [], allowPaid: true },
  accounts: [paid('usa'), paid('eu'), paid('trains')],
  catalogue,
  quality: () => undefined,
  resting: () => false,
  ...over,
});
const ids = (over: Partial<RouteInput> = {}) => route(input(over)).choices.map((c) => c.model.id);

describe('choosing the model', () => {
  it('never uses an AI company that may train on what it gets, for clients or for the demo', () => {
    for (const dataClass of ['client', 'test'] as const) {
      const r = route(input({ dataClass }));
      expect(r.choices.map((c) => c.model.provider)).not.toContain('trains');
      expect(r.skipped['trains-cheap']).toBe('terms');
    }
  });

  it('picks the cheapest model that can do the job, and says why the others are left out', () => {
    const r = route(input());
    expect(r.choices.map((c) => c.model.id)).toEqual(['usa-small', 'eu-mid', 'usa-en', 'usa-big']);
    expect(r.skipped).toEqual({
      'trains-cheap': 'terms',
      'usa-text': 'noJson',
      'usa-tiny': 'tooLong',
      nowhere: 'unknown',
    });
    // 200 tokens in × $0.1 + 10 out × $0.2 per million = 22 millionths of a dollar
    expect(r.choices[0]?.estimateMicroUsd).toBe(22);
  });

  it('prefers a free plan, and uses paid plans only when the company allows paid AI', () => {
    expect(ids({ accounts: [paid('usa'), free('eu')] })[0]).toBe('eu-mid');
    const r = route(input({ rules: { euOnly: false, allowedProviders: [], allowPaid: false } }));
    expect(r.choices).toEqual([]);
    expect(r.skipped['usa-small']).toBe('paid');
    // on a free plan every model costs 0: the job's own order (best first) decides
    expect(ids({ rules: { euOnly: false, allowedProviders: [], allowPaid: false }, accounts: [free('usa')] })).toEqual([
      'usa-big',
      'usa-small',
      'usa-en',
    ]);
  });

  it('only uses AI companies the company has an account with', () => {
    const r = route(input({ accounts: [paid('eu')] }));
    expect(r.choices.map((c) => c.model.id)).toEqual(['eu-mid']);
    expect(r.skipped['usa-small']).toBe('noAccount');
  });

  it("follows the company's own rules for clients' data: the allowed AI companies, and EU only", () => {
    const euOnly = { euOnly: true, allowedProviders: [], allowPaid: true };
    expect(ids({ rules: euOnly })).toEqual(['eu-mid']);
    expect(route(input({ rules: euOnly })).skipped['usa-small']).toBe('notEu');
    const onlyUsa = { euOnly: false, allowedProviders: ['usa'], allowPaid: true };
    expect(ids({ rules: onlyUsa })).toEqual(['usa-small', 'usa-en', 'usa-big']);
    // the demo and the tests hold no client data: the company's list doesn't apply, the data terms still do
    expect(ids({ rules: euOnly, dataClass: 'test' })).toEqual(['usa-small', 'eu-mid', 'usa-en', 'usa-big']);
  });

  it('checks the language (when the AI company states its languages) and the quality bar', () => {
    expect(ids({ language: 'bg' })).not.toContain('usa-en');
    expect(ids({ language: 'en' })).toContain('usa-en');
    const strict = { ...job, minQuality: 80 };
    const scores: Record<string, number> = { 'usa-big': 92, 'usa-small': 79 };
    expect(ids({ job: strict, quality: (id) => scores[id] })).toEqual(['usa-big']);
  });

  it('leaves out an AI company that is resting after failures', () => {
    const r = route(input({ resting: (p) => p === 'usa' }));
    expect(r.choices.map((c) => c.model.id)).toEqual(['eu-mid']);
    expect(r.skipped['usa-small']).toBe('resting');
  });

  it("starts the Test button's job with Groq's smallest model on free accounts", () => {
    const r = route({
      ...input(),
      job: AI_TEST,
      catalogue: CATALOGUE,
      rules: { euOnly: false, allowedProviders: [], allowPaid: false },
      accounts: [free('groq'), free('cloudflare')],
    });
    expect(r.choices[0]?.model.id).toBe('groq/openai/gpt-oss-20b');
    expect(r.choices).toHaveLength(5);
    expect(r.choices.every((c) => c.estimateMicroUsd === 0)).toBe(true);
  });
});

describe('the catalogue', () => {
  it('holds only AI companies whose terms forbid training, each checked with its sources', () => {
    for (const p of Object.values(PROVIDERS)) {
      expect(p.terms).toBe('no-train-dpa');
      expect(p.sources.length).toBeGreaterThan(0);
    }
    const seen = new Set<string>();
    for (const m of CATALOGUE.models) {
      expect(PROVIDERS[m.provider]).toBeDefined();
      expect(m.id).toBe(`${m.provider}/${m.model}`);
      expect(seen.has(m.id)).toBe(false);
      seen.add(m.id);
    }
    for (const id of AI_TEST.candidates) expect(seen.has(id)).toBe(true);
  });

  it('counts the cost in millionths of a dollar, and nothing on a free plan', () => {
    const m = model('x', 'usa', { priceIn: 0.15, priceOut: 0.6 });
    expect(costMicroUsd(m, 'paid', 1000, 100)).toBe(210);
    expect(costMicroUsd(m, 'free', 1000, 100)).toBe(0);
  });
});

describe('the circuit breaker', () => {
  it('rests an AI company after 3 failures in a row, for a minute, then gives it one more try', () => {
    let now = 0;
    const b = new CircuitBreaker(() => now);
    b.failed('a', 'error');
    b.failed('a', 'timeout');
    expect(b.resting('a')).toBe(false);
    b.failed('a', 'error');
    expect(b.resting('a')).toBe(true);
    expect(b.resting('b')).toBe(false);
    now = 60_001;
    expect(b.resting('a')).toBe(false);
    b.failed('a', 'error'); // failed again at once: rests again
    expect(b.resting('a')).toBe(true);
    now = 130_000;
    b.succeeded('a');
    b.failed('a', 'error');
    expect(b.resting('a')).toBe(false);
  });

  it('rests it at once when it says "too many requests"', () => {
    const b = new CircuitBreaker(() => 0);
    b.failed('a', 'rateLimit');
    expect(b.resting('a')).toBe(true);
  });

  it('after "too many requests", rests exactly as long as the AI company asked (1 second to 15 minutes)', () => {
    let now = 0;
    const b = new CircuitBreaker(() => now);
    b.failed('company:groq', 'rateLimit', 25_500);
    b.failed('company:other', 'rateLimit'); // didn't say: a minute
    expect(b.restingKeys('company:')).toEqual(['company:groq', 'company:other']);
    expect(b.restLeft(b.restingKeys('company:'))).toBe(25_500);
    now = 25_501;
    expect(b.resting('company:groq')).toBe(false);
    expect(b.resting('company:other')).toBe(true);
    b.failed('x', 'rateLimit', 10); // never less than a second
    expect(b.restLeft(['x'])).toBe(1000);
    b.failed('y', 'rateLimit', 86_400_000); // never more than 15 minutes
    expect(b.restLeft(['y'])).toBe(900_000);
  });
});

describe("the AI company's own wait", () => {
  it('reads retry-after first, else when the per-minute token limit is free again', () => {
    expect(waitFromLimits({ 'retry-after': '7' })).toBe(7000);
    expect(waitFromLimits({ 'retry-after': '2', 'x-ratelimit-reset-tokens': '25.5s' })).toBe(2000);
    expect(waitFromLimits({ 'x-ratelimit-reset-tokens': '25.5s' })).toBe(25_500);
    expect(waitFromLimits({ 'x-ratelimit-reset-tokens': '1m2.5s' })).toBe(62_500);
    expect(waitFromLimits({ 'x-ratelimit-reset-tokens': '450ms' })).toBe(450);
    expect(waitFromLimits({ 'x-ratelimit-reset-tokens': 'soon' })).toBeNull();
    expect(waitFromLimits({ 'x-ratelimit-reset-requests': '4m19.2s' })).toBeNull();
    expect(waitFromLimits(undefined)).toBeNull();
  });
});

describe('reading the answer', () => {
  const schema = z.object({ reply: z.string() });
  it('accepts JSON, also inside a ```json fence, and refuses anything that does not fit', () => {
    expect(readAnswer('{"reply":"OK"}', schema)).toEqual({ ok: true, data: { reply: 'OK' } });
    expect(readAnswer('```json\n{"reply":"OK"}\n```', schema)).toEqual({ ok: true, data: { reply: 'OK' } });
    expect(readAnswer('Sure! {"reply":"OK"}', schema)).toEqual({ ok: false, problem: 'not JSON' });
    expect(readAnswer('{"answer":"OK"}', schema)).toEqual({ ok: false, problem: 'reply: invalid_type' });
  });
});
