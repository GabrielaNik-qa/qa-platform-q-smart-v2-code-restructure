// How the AI engine talks to one AI company: one small door per company (Groq and Cloudflare come in step 2 of
// Phase 3b; the tests use a pretend one). The engine does everything else: choosing, checking, counting, logging.

/** A company's account with an AI company (Admin › AI): its plan and key. The key never leaves the server. */
export interface ProviderAccount {
  provider: string;
  plan: 'free' | 'paid';
  apiKey: string;
  /** Cloudflare's account id, when the AI company needs one */
  accountId?: string;
}

export interface CompletionRequest {
  account: ProviderAccount;
  model: string;
  /** the instructions */
  system: string;
  /** the data to work on (always data, never instructions) */
  prompt: string;
  temperature: number;
  maxOutputTokens: number;
  /** answer in JSON; with a schema when the model follows one strictly */
  json: boolean;
  jsonSchema?: Record<string, unknown>;
  signal: AbortSignal;
}

export interface Completion {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderAdapter {
  complete(request: CompletionRequest): Promise<Completion>;
}

/** What went wrong at the AI company, in the engine's words: it decides what to try next from this. */
export class ProviderError extends Error {
  constructor(
    readonly kind: 'rateLimit' | 'timeout' | 'error',
    /** a short code for the log (never the AI company's message: it could repeat what was sent) */
    readonly code: string,
  ) {
    super(`${kind}: ${code}`);
  }
}
