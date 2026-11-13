// The AI engine's model catalogue (V2_PLAN §7 and §17 "AI engine"): every model the engine may use, with its price,
// size, structured-output support, where it runs and the data terms of its AI company. The engine only ever sends data
// to models whose terms are `no-train-dpa` (no training on what we send, and a data processing agreement), for the demo
// and for clients alike (Gabriela's decision, 5 November, evening). Terms change: re-check before switching a model on.
import type { Language } from '@qsmart/shared';

export type ProviderId = 'groq' | 'cloudflare';
/** may-train: the AI company may use what is sent for itself. no-train-dpa: it may not, and a DPA applies. */
export type DataTerms = 'may-train' | 'no-train-dpa';

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  terms: DataTerms;
  /** the AI company processes data only in the EU */
  euProcessing: boolean;
  /** a free plan that keeps the same data terms */
  freePlan: boolean;
  /** when the terms were checked, and where */
  checked: string;
  sources: string[];
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  // "Groq is not permitted to use Inputs or Outputs for training" (services agreement 4.2); accepting the agreement
  // signs the DPA too; no exception for free accounts; runs in the USA. Checked 11 November 2026.
  groq: {
    id: 'groq',
    name: 'Groq',
    terms: 'no-train-dpa',
    euProcessing: false,
    freePlan: true,
    checked: '2026-11-11',
    sources: [
      'https://console.groq.com/docs/legal/services-agreement',
      'https://console.groq.com/docs/legal/customer-data-processing-addendum',
      'https://console.groq.com/docs/your-data',
    ],
  },
  // "Cloudflare does not use Customer Content processed by Workers AI to train AI models"; the DPA is incorporated
  // into the self-serve agreement; no exception for the free plan; no EU-only option stated. Checked 11 November 2026.
  cloudflare: {
    id: 'cloudflare',
    name: 'Cloudflare Workers AI',
    terms: 'no-train-dpa',
    euProcessing: false,
    freePlan: true,
    checked: '2026-11-11',
    sources: [
      'https://developers.cloudflare.com/workers-ai/platform/data-usage/',
      'https://www.cloudflare.com/terms/',
      'https://www.cloudflare.com/cloudflare-customer-dpa/',
    ],
  },
};

export interface ModelInfo {
  /** provider/model, e.g. groq/openai/gpt-oss-20b */
  id: string;
  provider: ProviderId;
  /** the AI company's own name for the model (a fixed version) */
  model: string;
  /** US dollars per million tokens on a paid plan (a free plan costs 0) */
  priceIn: number;
  priceOut: number;
  /** tokens the model can read and write in one call */
  context: number;
  /** strict: follows a JSON schema; json: answers in JSON; none: plain text only */
  structured: 'strict' | 'json' | 'none';
  /** the languages the AI company states; null when it states none (then the test sets decide) */
  languages: Language[] | null;
  checked: string;
  source: string;
  /** speech: turns a recording into text (Whisper); text models are the default */
  kind?: 'text' | 'speech';
  /** speech: US dollars per hour of audio on a paid plan */
  pricePerHour?: number;
  /** speech on Cloudflare: Neurons per minute of audio (counted against the free 10,000 a day) */
  neuronsPerMinute?: number;
  /**
   * The free plan's limits as the AI company publishes them for this model (never taken for granted: the figures an
   * AI company sends for the account itself come first, see pacing.ts). Missing: not published.
   */
  freeLimits?: FreeLimits;
}

/** Requests and tokens per minute and per day; audio seconds per hour and per day (speech). */
export interface FreeLimits {
  rpm?: number;
  rpd?: number;
  tpm?: number;
  tpd?: number;
  ash?: number;
  asd?: number;
  /** when they were read, and where */
  checked: string;
  source: string;
}
/** Groq's free plan (https://console.groq.com/docs/rate-limits, read on 13 November 2026; per organisation and per
 * model). Groq also sends its requests-per-day and tokens-per-minute for the account with every answer. */
const GROQ_LIMITS = 'https://console.groq.com/docs/rate-limits';
const GROQ_TEXT_FREE: FreeLimits = {
  rpm: 30,
  rpd: 1000,
  tpm: 8000,
  tpd: 200_000,
  checked: '2026-11-13',
  source: GROQ_LIMITS,
};
const GROQ_SPEECH_FREE: FreeLimits = {
  rpm: 20,
  rpd: 2000,
  ash: 7200,
  asd: 28_800,
  checked: '2026-11-13',
  source: GROQ_LIMITS,
};

const GROQ_MODELS = 'https://console.groq.com/docs/models';
const CF_PRICES = 'https://developers.cloudflare.com/workers-ai/platform/pricing/';
const GROQ_SPEECH = 'https://console.groq.com/docs/speech-to-text';

/** Checked on 11 November 2026 (prices, sizes and JSON support from the AI companies' own pages). */
export const MODELS: ModelInfo[] = [
  {
    id: 'groq/openai/gpt-oss-20b',
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    priceIn: 0.075,
    priceOut: 0.3,
    context: 131_072,
    structured: 'strict',
    languages: null,
    checked: '2026-11-11',
    source: GROQ_MODELS,
    freeLimits: GROQ_TEXT_FREE,
  },
  {
    id: 'groq/openai/gpt-oss-120b',
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    priceIn: 0.15,
    priceOut: 0.6,
    context: 131_072,
    structured: 'strict',
    languages: null,
    checked: '2026-11-11',
    source: GROQ_MODELS,
    freeLimits: GROQ_TEXT_FREE,
  },
  {
    id: 'cloudflare/@cf/openai/gpt-oss-120b',
    provider: 'cloudflare',
    model: '@cf/openai/gpt-oss-120b',
    priceIn: 0.35,
    priceOut: 0.75,
    context: 128_000,
    structured: 'json',
    languages: null,
    checked: '2026-11-11',
    source: CF_PRICES,
  },
  {
    id: 'cloudflare/@cf/mistralai/mistral-small-3.1-24b-instruct',
    provider: 'cloudflare',
    model: '@cf/mistralai/mistral-small-3.1-24b-instruct',
    priceIn: 0.351,
    priceOut: 0.555,
    context: 128_000,
    structured: 'json',
    languages: null,
    checked: '2026-11-11',
    source: CF_PRICES,
  },
  {
    id: 'cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    provider: 'cloudflare',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    priceIn: 0.293,
    priceOut: 2.253,
    context: 24_000,
    structured: 'json',
    languages: null,
    checked: '2026-11-11',
    source: CF_PRICES,
  },
  // Speech-to-text (Whisper), checked on 12 November 2026: Groq takes up to 25 MB on its free plan (flac, mp3, mp4,
  // mpeg, mpga, m4a, ogg, wav, webm), bills at least 10 seconds, and keeps no inference data by default (logs for
  // abuse checks up to 30 days, `your-data` page); Cloudflare's turbo model costs 46.63 Neurons a minute. Same
  // data terms as their text models (no training, a DPA).
  {
    id: 'groq/whisper-large-v3',
    provider: 'groq',
    model: 'whisper-large-v3',
    priceIn: 0,
    priceOut: 0,
    context: 0,
    structured: 'none',
    languages: null,
    checked: '2026-11-12',
    source: GROQ_SPEECH,
    kind: 'speech',
    pricePerHour: 0.111,
    freeLimits: GROQ_SPEECH_FREE,
  },
  {
    id: 'groq/whisper-large-v3-turbo',
    provider: 'groq',
    model: 'whisper-large-v3-turbo',
    priceIn: 0,
    priceOut: 0,
    context: 0,
    structured: 'none',
    languages: null,
    checked: '2026-11-12',
    source: GROQ_SPEECH,
    kind: 'speech',
    pricePerHour: 0.04,
    freeLimits: GROQ_SPEECH_FREE,
  },
  {
    id: 'cloudflare/@cf/openai/whisper-large-v3-turbo',
    provider: 'cloudflare',
    model: '@cf/openai/whisper-large-v3-turbo',
    priceIn: 0,
    priceOut: 0,
    context: 0,
    structured: 'none',
    languages: null,
    checked: '2026-11-12',
    source: CF_PRICES,
    kind: 'speech',
    pricePerHour: 0.0308,
    neuronsPerMinute: 46.63,
  },
];

/** The engine's view of the catalogue (the tests give it their own). */
export interface Catalogue {
  providers: Record<string, ProviderInfo>;
  models: ModelInfo[];
}
export const CATALOGUE: Catalogue = { providers: PROVIDERS, models: MODELS };

/**
 * The free plans' daily allowance, as each AI company states it. Groq sends its own figures with every answer (read
 * from them, never guessed); Cloudflare counts "Neurons": 10,000 free a day, reset at 00:00 UTC, $0.011 per 1,000
 * above that (https://developers.cloudflare.com/workers-ai/platform/pricing/, checked 11 November 2026). Q-smart
 * estimates the Neurons used from its own log, at Cloudflare's token prices.
 */
export const CLOUDFLARE_FREE_NEURONS = 10_000;
export const CLOUDFLARE_USD_PER_1000_NEURONS = 0.011;
export function cloudflareNeurons(
  model: ModelInfo | undefined,
  inputTokens: number,
  outputTokens: number,
  audioSeconds = 0,
): number {
  if (!model) return 0;
  if (model.neuronsPerMinute) return (audioSeconds / 60) * model.neuronsPerMinute;
  const usd = (inputTokens * model.priceIn + outputTokens * model.priceOut) / 1_000_000;
  return (usd / CLOUDFLARE_USD_PER_1000_NEURONS) * 1000;
}
