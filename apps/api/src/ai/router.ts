// The AI engine's choice of model (V2_PLAN §17 "AI engine"): from a job's ranked candidates, only those that pass
// every rule, cheapest first. The rules, in order:
// - the data terms: only `no-train-dpa` AI companies, for `test` and `client` jobs alike (5 November, evening);
// - the company has an account with that AI company (a paid one only when the company allows paid AI);
// - `client` jobs also follow the company's own rules: the allowed AI companies, and EU only;
// - the model can do the job: JSON answers, the size, the language (when the AI company states its languages), and
//   the quality bar from the test sets;
// - the AI company is not resting after failures (the circuit breaker).
import type { Language } from '@qsmart/shared';
import type { Catalogue, ModelInfo } from './catalogue.js';
import type { JobType } from './jobs.js';
import type { ProviderAccount } from './provider.js';

export interface CompanyAiRules {
  euOnly: boolean;
  allowedProviders: string[];
  allowPaid: boolean;
}

export interface Choice {
  model: ModelInfo;
  account: ProviderAccount;
  /** what this call is expected to cost, in millionths of a US dollar (0 on a free plan) */
  estimateMicroUsd: number;
}

export type Skip =
  | 'unknown'
  | 'terms'
  | 'noAccount'
  | 'paid'
  | 'notAllowed'
  | 'notEu'
  | 'noJson'
  | 'tooLong'
  | 'language'
  | 'quality'
  | 'resting';

export interface Routing {
  choices: Choice[];
  /** why each other candidate was left out (for the tests and, later, the AI Hub) */
  skipped: Record<string, Skip>;
}

/** A rough count of tokens: about 3.5 characters each (enough to rank by price and check the size). */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3.5);

/** Millionths of a dollar: prices are per million tokens, so tokens × price gives it directly. */
export const costMicroUsd = (model: ModelInfo, plan: 'free' | 'paid', inTokens: number, outTokens: number) =>
  plan === 'free' ? 0 : Math.round(inTokens * model.priceIn + outTokens * model.priceOut);

export interface RouteInput {
  job: JobType;
  dataClass: 'test' | 'client';
  language?: Language;
  inputTokens: number;
  rules: CompanyAiRules;
  accounts: ProviderAccount[];
  catalogue: Catalogue;
  /** a model's test-set score for a job type (0-100), when it has one */
  quality: (modelId: string, feature: string) => number | undefined;
  resting: (provider: string) => boolean;
}

export function route(input: RouteInput): Routing {
  const { job, rules, catalogue } = input;
  const choices: (Choice & { rank: number })[] = [];
  const skipped: Record<string, Skip> = {};
  job.candidates.forEach((id, rank) => {
    const model = catalogue.models.find((m) => m.id === id);
    const provider = model && catalogue.providers[model.provider];
    const account = model && input.accounts.find((a) => a.provider === model.provider);
    const why = ((): Skip | null => {
      if (!model || !provider) return 'unknown';
      if (provider.terms !== 'no-train-dpa') return 'terms';
      if (!account) return 'noAccount';
      if (account.plan === 'paid' && !rules.allowPaid) return 'paid';
      if (input.dataClass === 'client') {
        if (rules.allowedProviders.length && !rules.allowedProviders.includes(model.provider)) return 'notAllowed';
        if (rules.euOnly && !provider.euProcessing) return 'notEu';
      }
      if (job.structured && model.structured === 'none') return 'noJson';
      if (input.inputTokens + job.maxOutputTokens > model.context) return 'tooLong';
      if (input.language && model.languages && !model.languages.includes(input.language)) return 'language';
      if (job.minQuality !== undefined && (input.quality(model.id, job.feature) ?? -1) < job.minQuality)
        return 'quality';
      if (input.resting(model.provider)) return 'resting';
      return null;
    })();
    if (why) skipped[id] = why;
    else if (model && account)
      choices.push({
        model,
        account,
        rank,
        estimateMicroUsd: costMicroUsd(model, account.plan, input.inputTokens, job.maxOutputTokens),
      });
  });
  choices.sort((a, b) => a.estimateMicroUsd - b.estimateMicroUsd || a.rank - b.rank);
  return { choices: choices.map(({ rank: _r, ...c }) => c), skipped };
}

/**
 * How long an AI company asks us to wait after "too many requests", in milliseconds, from its own headers: retry-after
 * (seconds), or else when its per-minute token limit is free again (Groq: x-ratelimit-reset-tokens, such as "25.5s",
 * "1m2s" or "450ms"). Null when it doesn't say.
 */
export function waitFromLimits(limits: Record<string, string> | undefined): number | null {
  const after = limits?.['retry-after'];
  if (after && /^\d+(\.\d+)?$/.test(after.trim())) return Math.round(Number(after) * 1000);
  const reset = limits?.['x-ratelimit-reset-tokens']?.trim();
  if (!reset) return null;
  const parts = [...reset.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)];
  if (!parts.length || parts.map((p) => p[0]).join('') !== reset) return null;
  const unit = { h: 3_600_000, m: 60_000, s: 1000, ms: 1 } as const;
  return Math.round(parts.reduce((sum, p) => sum + Number(p[1]) * unit[p[2] as keyof typeof unit], 0));
}

/**
 * The circuit breaker: an AI company that fails 3 times in a row rests for a minute, so the next model is tried at once
 * instead of waiting for another failure. After "too many requests" it rests as long as the AI company asked (between
 * 1 second and 15 minutes; a minute when it didn't say). Kept per company account, since free plans' limits are per
 * account. After its rest, the AI company gets one try again.
 */
export class CircuitBreaker {
  private readonly state = new Map<string, { failures: number; until: number }>();

  constructor(
    private readonly now: () => number = Date.now,
    readonly threshold = 3,
    readonly restMs = 60_000,
  ) {}

  resting(key: string): boolean {
    const s = this.state.get(key);
    return !!s && s.until > this.now();
  }

  /** The keys resting now that start with this (a company's AI companies). */
  restingKeys(prefix: string): string[] {
    return [...this.state.keys()].filter((k) => k.startsWith(prefix) && this.resting(k));
  }

  /** How long until the soonest of these keys' rests ends (0: one of them isn't resting). */
  restLeft(keys: string[]): number {
    const left = keys.map((k) => Math.max(0, (this.state.get(k)?.until ?? 0) - this.now()));
    return left.length ? Math.min(...left) : 0;
  }

  /** a failure; after "too many requests", `waitMs` is how long the AI company asked us to wait (if it said) */
  failed(key: string, kind: 'rateLimit' | 'timeout' | 'error', waitMs: number | null = null): void {
    const s = this.state.get(key) ?? { failures: 0, until: 0 };
    s.failures = kind === 'rateLimit' ? this.threshold : s.failures + 1;
    if (s.failures >= this.threshold) {
      const rest = kind === 'rateLimit' && waitMs !== null ? Math.min(900_000, Math.max(1000, waitMs)) : this.restMs;
      s.until = this.now() + rest;
      s.failures = this.threshold - 1; // after the rest, one more failure rests it again
    }
    this.state.set(key, s);
  }

  succeeded(key: string): void {
    this.state.delete(key);
  }
}
