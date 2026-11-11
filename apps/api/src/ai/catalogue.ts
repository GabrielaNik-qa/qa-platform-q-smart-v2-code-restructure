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
}

const GROQ_MODELS = 'https://console.groq.com/docs/models';
const CF_PRICES = 'https://developers.cloudflare.com/workers-ai/platform/pricing/';

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
];

/** The engine's view of the catalogue (the tests give it their own). */
export interface Catalogue {
  providers: Record<string, ProviderInfo>;
  models: ModelInfo[];
}
export const CATALOGUE: Catalogue = { providers: PROVIDERS, models: MODELS };
