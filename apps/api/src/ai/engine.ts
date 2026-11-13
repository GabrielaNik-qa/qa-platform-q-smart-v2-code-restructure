// The AI engine: the one entrance for all AI in Q-smart, `ai.run(job)` (V2_PLAN §7 and §17 "AI engine").
// For each job it:
// 1. checks the company's AI is on and the monthly limits (the company's and the team's) are not reached;
// 2. chooses the models that pass every rule (router.ts), cheapest first;
// 3. calls the first, with a time limit; an answer that doesn't match the job's schema is asked once more, then the
//    next model is tried; an error, a time-out or "too many requests" moves on to the next model at once, and the
//    circuit breaker rests a failing AI company;
// 4. records every call and every refusal (never what was sent or answered).
// Before a call goes out on a free plan, its limits are checked (pacing.ts): a model whose requests or tokens per
// minute or per day would go over is skipped, and when every model must wait, the job says how long.
// When no model can answer, the job fails with a clear code and everything else in Q-smart keeps working.
import {
  type AiCall,
  type AiLimit,
  type AiUse,
  aiUseThisMonth,
  aiUseWindow,
  listSeenLimits,
  type Db,
  getAiRules,
  teamExists,
  logAiCall,
  saveSeenLimits,
  type Tx,
  withCompany,
} from '@qsmart/db';
import type { ErrorCode, Language } from '@qsmart/shared';
import { z } from 'zod';
import { CATALOGUE, type Catalogue } from './catalogue.js';
import type { JobType } from './jobs.js';
import { type ProviderAccount, type ProviderAdapter, ProviderError, type Transcription } from './provider.js';
import { expectedTokens, paceOf } from './pacing.js';
import { CircuitBreaker, costMicroUsd, estimateTokens, route, waitFromLimits } from './router.js';

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
  /** only this model (AutoQA's test set: each model is measured on its own, so its quality bar doesn't apply) */
  onlyModel?: string;
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
    /** when the AI companies are resting after "too many requests": how long until one is free again */
    readonly retryAfterMs?: number,
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
  /**
   * The models' test-set scores for a job type (AutoQA's test set): only models tested on enough of the expert's
   * conversations are in it. Empty: no model is qualified yet, so the quality bar doesn't apply.
   */
  qualities?: (tx: Tx, feature: string) => Promise<Map<string, number>>;
  now?: () => number;
}

const reached = (use: AiUse, limit: AiLimit | undefined) =>
  !!limit &&
  ((limit.microUsd !== undefined && use.microUsd >= limit.microUsd) ||
    (limit.calls !== undefined && use.calls >= limit.calls));

/** The answer as JSON, checked against the job's schema (a ```json fence around it is accepted). */
export function readAnswer<T>(
  text: string,
  schema: z.ZodType<T>,
): { ok: true; data: T } | { ok: false; problem: string } {
  const bare = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(bare);
  } catch {
    return { ok: false, problem: bare ? 'not JSON' : 'empty answer' };
  }
  const checked = schema.safeParse(parsed);
  if (checked.success) return { ok: true, data: checked.data };
  // the first check that failed, in the job's own words (they name question ids, never the conversation's text)
  const issue = checked.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  return { ok: false, problem: issue?.code === 'custom' ? issue.message : `${where}${issue?.code ?? 'check'}` };
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

  /** What every log line of a job starts from, and how it is written. */
  private logging(job: Omit<AiJob<unknown>, 'system' | 'prompt'>) {
    const blank = {
      teamId: job.teamId ?? null,
      byId: job.byId ?? null,
      feature: job.type.feature,
      dataClass: job.dataClass,
      provider: null,
      model: null,
      inputTokens: 0,
      outputTokens: 0,
      costMicroUsd: 0,
      waitMs: 0,
      attempt: 1,
      error: null,
    } satisfies Omit<AiCall, 'status'>;
    const log = (call: AiCall) => withCompany(this.parts.db, job.companyId, (tx) => logAiCall(tx, call));
    return { blank, log };
  }

  /**
   * Steps 1-2, the same for every job: the company's rules, its limits and its accounts; then the models that pass
   * every rule, best first. A refusal is logged and thrown.
   */
  private async choose(job: Omit<AiJob<unknown>, 'system' | 'prompt'>, inputTokens: number) {
    const { db } = this.parts;
    const { blank, log } = this.logging(job);
    const breakerKey = (provider: string) => `${job.companyId}:${provider}`;
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
      const qualities =
        job.type.minQuality !== undefined && !job.onlyModel && this.parts.qualities
          ? await this.parts.qualities(tx, job.type.feature)
          : new Map<string, number>();
      return { rules, accounts, qualities };
    });
    if (ready === 'off' || ready === 'limit') {
      await log({ ...blank, status: ready });
      throw new AiError(ready === 'off' ? 'aiOff' : 'aiLimit');
    }
    // the quality bar applies once a model is qualified on the test set; one chosen model is measured as it is
    const type = {
      ...job.type,
      candidates: job.onlyModel ? job.type.candidates.filter((c) => c === job.onlyModel) : job.type.candidates,
      ...(ready.qualities.size ? {} : { minQuality: undefined }),
    };
    const routing = route({
      job: type,
      dataClass: job.dataClass,
      ...(job.language ? { language: job.language } : {}),
      inputTokens,
      rules: ready.rules,
      accounts: ready.accounts,
      catalogue: this.catalogue,
      quality: (modelId) => ready.qualities.get(modelId),
      resting: (provider) => this.breaker.resting(breakerKey(provider)),
    });
    if (!routing.choices.length) {
      const resting = Object.values(routing.skipped).includes('resting');
      await log({ ...blank, status: resting ? 'unavailable' : 'noModel' });
      // resting: how long until the company's first AI company is free again
      throw resting
        ? new AiError('aiUnavailable', 'resting', this.breaker.restLeft(this.breaker.restingKeys(`${job.companyId}:`)))
        : new AiError('aiNoModel');
    }
    // a free plan's limits, checked before anything is sent (its own figures first, else its published ones)
    const paced = await withCompany(db, job.companyId, async (tx) => {
      const seen = await listSeenLimits(tx);
      return Promise.all(
        routing.choices.map(async (c) => {
          if (c.account.plan !== 'free' || !c.model.freeLimits) return 0;
          const use = await aiUseWindow(tx, c.model.provider, c.model.model);
          return paceOf({
            limits: c.model.freeLimits,
            use,
            seen: seen.find((x) => x.provider === c.model.provider && x.model === c.model.model),
            tokens:
              c.model.kind === 'speech' ? 0 : expectedTokens(inputTokens, use.outputTokens, job.type.maxOutputTokens),
            now: this.now(),
          }).waitMs;
        }),
      );
    });
    const free = routing.choices.filter((_, i) => paced[i] === 0);
    if (!free.length) {
      await log({ ...blank, status: 'unavailable', error: 'paced' });
      throw new AiError('aiUnavailable', 'paced', Math.min(...paced));
    }
    return free;
  }

  async run<T>(job: AiJob<T>): Promise<AiResult<T>> {
    const { db } = this.parts;
    const { blank, log } = this.logging(job);
    const breakerKey = (provider: string) => `${job.companyId}:${provider}`;
    const inputTokens = estimateTokens(job.system) + estimateTokens(job.prompt);
    const choices = await this.choose(job, inputTokens);

    // 3-4. Each model in turn; an answer that doesn't fit is asked once more before moving on.
    const jsonSchema = job.type.structured ? (z.toJSONSchema(job.type.schema) as Record<string, unknown>) : undefined;
    const system = job.type.structured ? `${job.system}\n\nAnswer with JSON only.` : job.system;
    let attempt = 0;
    let lastProblem: string | undefined;
    for (const { model, account } of choices) {
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
            ...(job.type.effort ? { effort: job.type.effort } : {}),
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
        // the AI company's own figures about its limits (Groq sends them with every answer and every refusal)
        const limits = 'answer' in outcome ? outcome.answer.limits : outcome.failure.limits;
        if (limits)
          await withCompany(db, job.companyId, (tx) => saveSeenLimits(tx, model.provider, model.model, limits)).catch(
            () => undefined,
          );
        if ('failure' in outcome) {
          this.breaker.failed(breakerKey(model.provider), outcome.failure.kind, waitFromLimits(outcome.failure.limits));
          // a model that already gave an answer that doesn't fit, then "too many requests" on its second chance: its
          // own failure counts (the answer that didn't fit), not the busy free plan
          lastProblem =
            outcome.failure.kind === 'rateLimit' && tryOnModel === 2 && lastProblem === 'schema'
              ? 'schema'
              : outcome.failure.code;
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
        await log({ ...call, ...used, status: 'invalid', error: `schema: ${read.problem}`.slice(0, 60) });
        lastProblem = 'schema';
      }
    }
    const providers = [...new Set(choices.map((c) => c.model.provider))];
    throw new AiError('aiUnavailable', lastProblem, this.breaker.restLeft(providers.map(breakerKey)) || undefined);
  }

  /**
   * Speech-to-text, with the same rules as every job (steps 1-2) and the same fallbacks: each speech model in turn,
   * once. The recording stays in memory for the call and is never written anywhere; the log keeps only its length.
   */
  async transcribe(job: AiSpeechJob): Promise<AiSpeechResult> {
    const { db } = this.parts;
    const { blank, log } = this.logging(job);
    const breakerKey = (provider: string) => `${job.companyId}:${provider}`;
    const choices = await this.choose(job, 0);
    let attempt = 0;
    let lastProblem: string | undefined;
    for (const { model, account } of choices) {
      const adapter = this.parts.adapters[model.provider];
      if (!adapter?.transcribe || this.breaker.resting(breakerKey(model.provider))) continue;
      attempt++;
      const started = this.now();
      const call = { ...blank, provider: model.provider, model: model.model, attempt };
      const ctrl = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const outcome = await Promise.race([
        adapter.transcribe({
          account,
          model: model.model,
          audio: job.audio,
          ...(job.speechLanguage ? { language: job.speechLanguage } : {}),
          signal: ctrl.signal,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new ProviderError('timeout', 'timeout'));
            ctrl.abort();
          }, job.type.maxWaitMs);
        }),
      ]).then(
        (answer) => ({ answer }),
        (e: unknown) => ({ failure: e instanceof ProviderError ? e : new ProviderError('error', 'failed') }),
      );
      clearTimeout(timer);
      const waitMs = Math.max(0, this.now() - started);
      const limits = 'answer' in outcome ? outcome.answer.limits : outcome.failure.limits;
      if (limits)
        await withCompany(db, job.companyId, (tx) => saveSeenLimits(tx, model.provider, model.model, limits)).catch(
          () => undefined,
        );
      if ('failure' in outcome) {
        this.breaker.failed(breakerKey(model.provider), outcome.failure.kind, waitFromLimits(outcome.failure.limits));
        lastProblem = outcome.failure.code;
        await log({ ...call, waitMs, status: outcome.failure.kind, error: outcome.failure.code.slice(0, 60) });
        continue;
      }
      const { answer } = outcome;
      this.breaker.succeeded(breakerKey(model.provider));
      const seconds = Math.min(86_400, Math.max(0, answer.seconds));
      // a paid plan bills at least 10 seconds (Groq); a free plan costs nothing
      const costMicroUsd =
        account.plan === 'free' ? 0 : Math.round((Math.max(10, seconds) / 3600) * (model.pricePerHour ?? 0) * 1e6);
      await log({ ...call, audioSeconds: seconds, costMicroUsd, waitMs, status: 'ok' });
      return { ...answer, seconds, provider: model.provider, model: model.model, attempt };
    }
    throw new AiError('aiUnavailable', lastProblem);
  }
}

export interface AiSpeechJob extends Omit<AiJob<null>, 'system' | 'prompt'> {
  audio: Uint8Array;
  /** the call's language (ISO 639-1), when known */
  speechLanguage?: string;
}

export interface AiSpeechResult extends Transcription {
  provider: string;
  model: string;
  attempt: number;
}
