// The doors to the real AI companies, through the open-source AI SDK (V2_PLAN §17: the common layer for every AI
// company). Each door only sends the request and says how it went; the engine does the choosing, checking, retrying
// and counting. The SDK's own retries are off, so a failure moves straight to the engine's next model.
import { createGroq } from '@ai-sdk/groq';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  APICallError,
  transcribe,
  generateText,
  jsonSchema,
  type LanguageModel,
  NoObjectGeneratedError,
  Output,
} from 'ai';
import type { CompletionRequest, ProviderAdapter, Transcription, TranscriptionRequest } from './provider.js';
import { z } from 'zod';
import { ProviderError } from './provider.js';

/** Where each AI company answers (the tests point them at a pretend server on this PC). */
export interface AdapterUrls {
  groq?: string;
  /** with {accountId} in it */
  cloudflare?: string;
}
const CLOUDFLARE = 'https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1';

/** The AI company's figures about its limits, from an answer's headers (only those: nothing else is kept). */
export const limitHeaders = (headers: Record<string, string> | undefined): Record<string, string> | undefined => {
  const found = Object.entries(headers ?? {}).filter(
    ([k]) => k.toLowerCase().startsWith('x-ratelimit-') || k.toLowerCase() === 'retry-after',
  );
  return found.length
    ? Object.fromEntries(found.map(([k, v]) => [k.toLowerCase(), String(v).slice(0, 40)]))
    : undefined;
};

/** What went wrong, in the engine's words, with a short code for the log (never the AI company's message). */
export function toProviderError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  if (APICallError.isInstance(e)) {
    const status = e.statusCode ?? 0;
    if (status === 429) return new ProviderError('rateLimit', 'http429', limitHeaders(e.responseHeaders));
    if (status === 408 || status === 504) return new ProviderError('timeout', `http${status}`);
    if (status === 401 || status === 403) return new ProviderError('error', `auth${status}`);
    return new ProviderError('error', status ? `http${status}` : 'network');
  }
  if (e instanceof Error && e.name === 'AbortError') return new ProviderError('timeout', 'aborted');
  return new ProviderError('error', 'failed');
}

function sdkDoor(
  model: (r: CompletionRequest) => LanguageModel,
  options: (r: CompletionRequest) => Record<string, Record<string, string | boolean>> = () => ({}),
): ProviderAdapter {
  return {
    async complete(r) {
      try {
        const result = await generateText({
          model: model(r),
          system: r.system,
          prompt: r.prompt,
          temperature: r.temperature,
          maxOutputTokens: r.maxOutputTokens,
          maxRetries: 0,
          abortSignal: r.signal,
          providerOptions: options(r),
          ...(r.json
            ? { output: r.jsonSchema ? Output.object({ schema: jsonSchema(r.jsonSchema) }) : Output.json() }
            : {}),
        });
        const limits = limitHeaders(result.response.headers);
        return {
          text: result.text,
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
          ...(limits ? { limits } : {}),
        };
      } catch (e) {
        // an answer that isn't the JSON asked for: the engine decides (it asks once more, then moves on)
        if (NoObjectGeneratedError.isInstance(e))
          return {
            text: e.text ?? '',
            inputTokens: e.usage?.inputTokens ?? 0,
            outputTokens: e.usage?.outputTokens ?? 0,
            ...(limitHeaders(e.response?.headers) ? { limits: limitHeaders(e.response?.headers) } : {}),
          };
        throw toProviderError(e);
      }
    },
  };
}

/** Groq's Whisper, through the AI SDK: the text, with the time of each part. */
async function groqTranscribe(urls: AdapterUrls, r: TranscriptionRequest): Promise<Transcription> {
  try {
    const groq = createGroq({ apiKey: r.account.apiKey, ...(urls.groq ? { baseURL: urls.groq } : {}) });
    const result = await transcribe({
      model: groq.transcription(r.model),
      audio: r.audio,
      maxRetries: 0,
      abortSignal: r.signal,
      providerOptions: {
        groq: {
          responseFormat: 'verbose_json',
          timestampGranularities: ['segment'],
          temperature: 0,
          ...(r.language ? { language: r.language } : {}),
        },
      },
    });
    const limits = limitHeaders(result.responses[0]?.headers);
    return {
      text: result.text,
      segments: result.segments.map((s) => ({ start: s.startSecond, end: s.endSecond, text: s.text })),
      ...(result.language ? { language: result.language } : {}),
      seconds: Math.round(result.durationInSeconds ?? result.segments.at(-1)?.endSecond ?? 0),
      ...(limits ? { limits } : {}),
    };
  } catch (e) {
    throw toProviderError(e);
  }
}

/** Groq: its gpt-oss models think before answering; "low" keeps that short (and the free allowance longer). */
export const groqAdapter = (urls: AdapterUrls = {}): ProviderAdapter => ({
  ...sdkDoor(
    (r) => createGroq({ apiKey: r.account.apiKey, ...(urls.groq ? { baseURL: urls.groq } : {}) })(r.model),
    (r) => ({
      groq: {
        ...(r.jsonSchema ? { structuredOutputs: true } : {}),
        ...(r.model.startsWith('openai/gpt-oss') ? { reasoningEffort: r.effort ?? 'low' } : {}),
      },
    }),
  ),
  transcribe: (r) => groqTranscribe(urls, r),
});

const cloudflareResult = z.object({
  result: z.object({
    text: z.string(),
    segments: z.array(z.object({ start: z.number(), end: z.number(), text: z.string().default('') })).default([]),
    transcription_info: z.object({ language: z.string().optional(), duration: z.number().optional() }).optional(),
  }),
});

/** Cloudflare's Whisper, through its own address (the AI SDK has no door for it): the audio goes as base64. */
async function cloudflareTranscribe(urls: AdapterUrls, r: TranscriptionRequest): Promise<Transcription> {
  if (!r.account.accountId) throw new ProviderError('error', 'noAccountId');
  const base = (urls.cloudflare ?? CLOUDFLARE).replace('{accountId}', encodeURIComponent(r.account.accountId));
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/v1$/, '')}/run/${r.model}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${r.account.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        audio: Buffer.from(r.audio).toString('base64'),
        vad_filter: true,
        ...(r.language ? { language: r.language } : {}),
      }),
      signal: r.signal,
    });
  } catch (e) {
    throw toProviderError(e);
  }
  const headers = Object.fromEntries(response.headers.entries());
  if (response.status === 429) throw new ProviderError('rateLimit', 'http429', limitHeaders(headers));
  if (response.status === 401 || response.status === 403) throw new ProviderError('error', `auth${response.status}`);
  if (!response.ok) throw new ProviderError('error', `http${response.status}`);
  const read = cloudflareResult.safeParse(await response.json().catch(() => null));
  if (!read.success) throw new ProviderError('error', 'badAnswer');
  const { text, segments, transcription_info: info } = read.data.result;
  return {
    text,
    segments,
    ...(info?.language ? { language: info.language } : {}),
    seconds: Math.round(info?.duration ?? segments.at(-1)?.end ?? 0),
  };
}

/** Cloudflare Workers AI, through its OpenAI-compatible address (it needs the account id). */
export const cloudflareAdapter = (urls: AdapterUrls = {}): ProviderAdapter => ({
  ...sdkDoor((r) => {
    if (!r.account.accountId) throw new ProviderError('error', 'noAccountId');
    return createOpenAICompatible({
      name: 'cloudflare',
      baseURL: (urls.cloudflare ?? CLOUDFLARE).replace('{accountId}', encodeURIComponent(r.account.accountId)),
      apiKey: r.account.apiKey,
      includeUsage: true,
      supportsStructuredOutputs: true,
    }).chatModel(r.model);
  }),
  transcribe: (r) => cloudflareTranscribe(urls, r),
});

export const realAdapters = (urls: AdapterUrls = {}): Record<string, ProviderAdapter> => ({
  groq: groqAdapter(urls),
  cloudflare: cloudflareAdapter(urls),
});
