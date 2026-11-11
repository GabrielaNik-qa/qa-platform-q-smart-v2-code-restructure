// The AI engine: the one entrance for all AI in Q-smart, `ai.run(job)` (V2_PLAN §7 and §17 "AI engine").
// For each job it:
// 1. checks the company's AI is on and the monthly limits (the company's and the team's) are not reached;
// 2. chooses the models that pass every rule (router.ts), cheapest first;
// 3. calls the first, with a time limit; an answer that doesn't match the job's schema is asked once more, then the
//    next model is tried; an error, a time-out or "too many requests" moves on to the next model at once, and the
//    circuit breaker rests a failing AI company;
// 4. records every call and every refusal (never what was sent or answered).
// When no model can answer, the job fails with a clear code and everything else in Q-smart keeps working.
import {
  type AiCall,
  type AiLimit,
  type AiUse,
  aiUseThisMonth,
  type Db,
  getAiRules,
  teamExists,
  logAiCall,
  type Tx,
  withCompany,
} from '@qsmart/db';
import type { ErrorCode, Language } from '@qsmart/shared';
import { z } from 'zod';
import { CATALOGUE, type Catalogue } from './catalogue.js';
import type { JobType } from './jobs.js';
import { type ProviderAccount, type ProviderAdapter, ProviderError } from './provider.js';
import { CircuitBreaker, costMicroUsd, estimateTokens, route } from './router.js';

export interface AiJob<T> {
  type: JobType<T>;
  companyId: string;
  /** test: the demo and the tests; client: anything with a client's data in it */
  dataClass: 'test' | 'client';
  teamId?: string | null;
  /** the membership that asked (empty for timed jobs) */
  byId?: string | null;
  language?: Language;
  /** the instructions */
  system: string;
  /** the data to work on */
  prompt: string;
  /** only this AI company (Admin › AI's Test button) */
  onlyProvider?: string;
}

export interface AiResult<T> {
  data: T;
  provider: string;
  model: string;
  /** 1 when the first choice answered */
  attempt: number;
}

type AiErrorCode = Extract<ErrorCode, 'aiOff' | 'aiLimit' | 'aiNoModel' | 'aiUnavailable'>;
export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    /** the last AI company's short reason (e.g. auth401: the key was refused), for Admin › AI */
    readonly detail?: string,
  ) {
    super(code);
  }
}

export interface AiEngineParts {
  db: Db;
  /** one door per AI company (step 2 brings Groq's and Cloudflare's) */
  adapters: Record<string, ProviderAdapter>;
  /** the company's accounts with AI companies, read behind its wall (step 2: Admin › AI, keys stored encrypted) */
  accounts: (tx: Tx, companyId: string) => Promise<ProviderAccount[]>;
  catalogue?: Catalogue;
  /** a model's test-set score for a job type (step 6: the AutoQA test set) */
  quality?: (modelId: string, feature: string) => number | undefined;
  now?: () => number;
}

const reached = (use: AiUse, limit: AiLimit | undefined) =>
  !!limit &&
  ((limit.microUsd !== undefined && use.microUsd >= limit.microUsd) ||
    (limit.calls !== undefined && use.calls >= limit.calls));

/** The answer as JSON, checked against the job's schema (a ```json fence around it is accepted). */
export function readAnswer<T>(text: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false } {
  const bare = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const checked = schema.safeParse(JSON.parse(bare));
    return checked.success ? { ok: true, data: checked.data } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export class AiEngine {
  private readonly catalogue: Catalogue;
  private readonly now: () => number;
  readonly breaker: CircuitBreaker;

  constructor(private readonly parts: AiEngineParts) {
    this.catalogue = parts.catalogue ?? CATALOGUE;
    this.now = parts.now ?? Date.now;
    this.breaker = new CircuitBreaker(this.now);
  }

  async run<T>(job: AiJob<T>): Promise<AiResult<T>> {
    const { db } = this.parts;
    const base = {
      teamId: job.teamId ?? null,
      byId: job.byId ?? null,
      feature: job.type.feature,
      dataClass: job.dataClass,
    };
    const blank = {
      ...base,
      provider: null,
      model: null,
      inputTokens: 0,
      outputTokens: 0,
      costMicroUsd: 0,
      waitMs: 0,
      attempt: 1,
      error: null,
    } satisfies Omit<AiCall, 'status'>;
    const log = (call: AiCall) => withCompany(db, job.companyId, (tx) => logAiCall(tx, call));
    const breakerKey = (provider: string) => `${job.companyId}:${provider}`;
    const inputTokens = estimateTokens(job.system) + estimateTokens(job.prompt);

    // 1-2. The company's rules, its limits and its accounts; then the models that pass every rule.
    const ready = await withCompany(db, job.companyId, async (tx) => {
      // a team of this company only (the log could not record another company's team anyway)
      if (job.teamId && !(await teamExists(tx, job.teamId))) throw new Error('This team is not in the company.');
      const rules = await getAiRules(tx);
      if (!rules.enabled) return 'off' as const;
      if (reached(await aiUseThisMonth(tx), rules.limits.company)) return 'limit' as const;
      if (job.teamId && reached(await aiUseThisMonth(tx, job.teamId), rules.limits.teams?.[job.teamId]))
        return 'limit' as const;
      const accounts = (await this.parts.accounts(tx, job.companyId)).filter(
        (a) => this.parts.adapters[a.provider] && (!job.onlyProvider || a.provider === job.onlyProvider),
      );
      return { rules, accounts };
    });
    if (ready === 'off' || ready === 'limit') {
      await log({ ...blank, status: ready });
      throw new AiError(ready === 'off' ? 'aiOff' : 'aiLimit');
    }
    const routing = route({
      job: job.type,
      dataClass: job.dataClass,
      ...(job.language ? { language: job.language } : {}),
      inputTokens,
      rules: ready.rules,
      accounts: ready.accounts,
      catalogue: this.catalogue,
      quality: this.parts.quality ?? (() => undefined),
      resting: (provider) => this.breaker.resting(breakerKey(provider)),
    });
    if (!routing.choices.length) {
      const resting = Object.values(routing.skipped).includes('resting');
      await log({ ...blank, status: resting ? 'unavailable' : 'noModel' });
      throw resting ? new AiError('aiUnavailable', 'resting') : new AiError('aiNoModel');
    }

    // 3-4. Each model in turn; an answer that doesn't fit is asked once more before moving on.
    const jsonSchema = job.type.structured ? (z.toJSONSchema(job.type.schema) as Record<string, unknown>) : undefined;
    const system = job.type.structured ? `${job.system}\n\nAnswer with JSON only.` : job.system;
    let attempt = 0;
    let lastProblem: string | undefined;
    for (const { model, account } of routing.choices) {
      const adapter = this.parts.adapters[model.provider];
      if (!adapter) continue;
      for (let tryOnModel = 1; tryOnModel <= 2; tryOnModel++) {
        if (this.breaker.resting(breakerKey(model.provider))) break;
        attempt++;
        const started = this.now();
        const call = { ...blank, provider: model.provider, model: model.model, attempt };
        const ctrl = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        // only the AI company's own answer (or failure) is judged here; writing the log is not its fault
        const outcome = await Promise.race([
          adapter.complete({
            account,
            model: model.model,
            system,
            prompt: job.prompt,
            temperature: job.type.temperature,
            maxOutputTokens: job.type.maxOutputTokens,
            json: job.type.structured,
            ...(jsonSchema ? { jsonSchema } : {}),
            signal: ctrl.signal,
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new ProviderError('timeout', 'timeout')); // first the reason, then stop the call
              ctrl.abort();
            }, job.type.maxWaitMs);
          }),
        ]).then(
          (answer) => ({ answer }),
          (e: unknown) => ({ failure: e instanceof ProviderError ? e : new ProviderError('error', 'failed') }),
        );
        clearTimeout(timer);
        const waitMs = Math.max(0, this.now() - started);
        if ('failure' in outcome) {
          this.breaker.failed(breakerKey(model.provider), outcome.failure.kind);
          lastProblem = outcome.failure.code;
          await log({ ...call, waitMs, status: outcome.failure.kind, error: outcome.failure.code.slice(0, 60) });
          break; // an AI company that failed: straight to the next model
        }
        const { answer } = outcome;
        this.breaker.succeeded(breakerKey(model.provider));
        const used = {
          inputTokens: answer.inputTokens,
          outputTokens: answer.outputTokens,
          costMicroUsd: costMicroUsd(model, account.plan, answer.inputTokens, answer.outputTokens),
          waitMs,
        };
        const read = readAnswer(answer.text, job.type.schema);
        if (read.ok) {
          await log({ ...call, ...used, status: 'ok' });
          return { data: read.data, provider: model.provider, model: model.model, attempt };
        }
        await log({ ...call, ...used, status: 'invalid', error: 'schema' });
        lastProblem = 'schema';
      }
    }
    throw new AiError('aiUnavailable', lastProblem);
  }
}
