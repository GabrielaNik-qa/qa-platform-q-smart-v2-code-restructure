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
  /** how much a model that thinks before answering may think */
  effort?: 'low' | 'medium' | 'high';
  signal: AbortSignal;
}

export interface Completion {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** the AI company's own figures about its limits, when it sends them (Groq: x-ratelimit-… with every answer) */
  limits?: Record<string, string>;
}

/** A recording to turn into text. It lives only in memory for this call: it is never written anywhere. */
export interface TranscriptionRequest {
  account: ProviderAccount;
  model: string;
  audio: Uint8Array;
  /** the call's language (ISO 639-1), when known: it helps accuracy */
  language?: string;
  signal: AbortSignal;
}

export interface Transcription {
  text: string;
  /** the parts of the recording, with their times in seconds */
  segments: { start: number; end: number; text: string }[];
  /** the language heard, when the AI company says */
  language?: string;
  /** the recording's length in seconds (0 when unknown) */
  seconds: number;
  limits?: Record<string, string>;
}

export interface ProviderAdapter {
  complete(request: CompletionRequest): Promise<Completion>;
  /** speech-to-text, for the AI companies that offer it */
  transcribe?(request: TranscriptionRequest): Promise<Transcription>;
}

/** What went wrong at the AI company, in the engine's words: it decides what to try next from this. */
export class ProviderError extends Error {
  constructor(
    readonly kind: 'rateLimit' | 'timeout' | 'error',
    /** a short code for the log (never the AI company's message: it could repeat what was sent) */
    readonly code: string,
    /** the AI company's limit figures sent with the refusal ("too many requests" says when it resets) */
    readonly limits?: Record<string, string>,
  ) {
    super(`${kind}: ${code}`);
  }
}
