// The doors to the real AI companies, through the open-source AI SDK (V2_PLAN §17: the common layer for every AI
// company). Each door only sends the request and says how it went; the engine does the choosing, checking, retrying
// and counting. The SDK's own retries are off, so a failure moves straight to the engine's next model.
import Anthropic from '@anthropic-ai/sdk';
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
  anthropic?: string;
  mistral?: string;
  /** with {region} in it */
  azure?: string;
  elevenlabs?: string;
}
const MISTRAL = 'https://api.mistral.ai/v1';
const AZURE = 'https://{region}.api.cognitive.microsoft.com';
const ELEVENLABS = 'https://api.elevenlabs.io/v1';
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

// ---- Anthropic (17 November): the official SDK. Its models take no temperature setting, so none is sent; the model's
// own effort level is used unless the job asks for one. -------------------------------------------------------------

const DROPPED_KEYWORDS = new Set([
  '$schema',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'maxItems',
  'minProperties',
  'maxProperties',
  'uniqueItems',
]);
/** Anthropic's JSON schemas allow fewer keywords than the standard: drop the rest, and close every object. */
export function anthropicSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(anthropicSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (DROPPED_KEYWORDS.has(k)) continue;
    if (k === 'minItems' && typeof v === 'number' && v > 1) continue;
    out[k] =
      k === 'properties' && v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([name, sub]) => [name, anthropicSchema(sub)]))
        : anthropicSchema(v);
  }
  if (out.type === 'object') out.additionalProperties = false;
  return out;
}

function anthropicError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  if (e instanceof Anthropic.APIUserAbortError) return new ProviderError('timeout', 'aborted');
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError('timeout', 'timeout');
  if (e instanceof Anthropic.APIConnectionError) return new ProviderError('error', 'network');
  if (e instanceof Anthropic.APIError) {
    const status = e.status ?? 0;
    if (status === 429)
      return new ProviderError('rateLimit', 'http429', limitHeaders(Object.fromEntries(e.headers?.entries() ?? [])));
    if (status === 408 || status === 504) return new ProviderError('timeout', `http${status}`);
    if (status === 401 || status === 403) return new ProviderError('error', `auth${status}`);
    return new ProviderError('error', status ? `http${status}` : 'network');
  }
  return new ProviderError('error', 'failed');
}

export const anthropicAdapter = (urls: AdapterUrls = {}): ProviderAdapter => ({
  async complete(r) {
    try {
      const client = new Anthropic({
        apiKey: r.account.apiKey,
        maxRetries: 0,
        ...(urls.anthropic ? { baseURL: urls.anthropic } : {}),
      });
      const format = r.jsonSchema
        ? { type: 'json_schema' as const, schema: anthropicSchema(r.jsonSchema) as Record<string, unknown> }
        : undefined;
      const { data, response } = await client.messages
        .create(
          {
            model: r.model,
            max_tokens: r.maxOutputTokens,
            system: r.json && !r.jsonSchema ? `${r.system}\n\nAnswer with a JSON object only.` : r.system,
            messages: [{ role: 'user', content: r.prompt }],
            ...(format || r.effort
              ? { output_config: { ...(r.effort ? { effort: r.effort } : {}), ...(format ? { format } : {}) } }
              : {}),
          },
          { signal: r.signal },
        )
        .withResponse();
      // a refusal by Anthropic's safety checks is a failure of this model: the engine moves on to the next one
      if (data.stop_reason === 'refusal') throw new ProviderError('error', 'refusal');
      const u = data.usage;
      const limits = limitHeaders(Object.fromEntries(response.headers.entries()));
      return {
        text: data.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(''),
        inputTokens: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
        outputTokens: u.output_tokens,
        ...(limits ? { limits } : {}),
      };
    } catch (e) {
      throw anthropicError(e);
    }
  },
});

// ---- Speech to text at Mistral, Microsoft and ElevenLabs: one request with the recording, answered in JSON. ------------

/** The kind of a recording, from its first bytes, as a file name (the AI companies look at the name's ending). */
export function audioName(audio: Uint8Array): string {
  const at = (i: number, s: string) => [...s].every((c, j) => audio[i + j] === c.charCodeAt(0));
  if (at(0, 'RIFF')) return 'recording.wav';
  if (at(0, 'OggS')) return 'recording.ogg';
  if (at(0, 'fLaC')) return 'recording.flac';
  if (at(0, 'ID3') || (audio[0] === 0xff && ((audio[1] ?? 0) & 0xe0) === 0xe0)) return 'recording.mp3';
  if (at(4, 'ftyp')) return 'recording.m4a';
  if (audio[0] === 0x1a && audio[1] === 0x45 && audio[2] === 0xdf && audio[3] === 0xa3) return 'recording.webm';
  return 'recording.mp3';
}

async function postRecording(
  url: string,
  headers: Record<string, string>,
  form: FormData,
  signal: AbortSignal,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers, body: form, signal });
  } catch (e) {
    throw toProviderError(e);
  }
  if (response.status === 429)
    throw new ProviderError('rateLimit', 'http429', limitHeaders(Object.fromEntries(response.headers.entries())));
  if (response.status === 408 || response.status === 504) throw new ProviderError('timeout', `http${response.status}`);
  if (response.status === 401 || response.status === 403) throw new ProviderError('error', `auth${response.status}`);
  if (!response.ok) throw new ProviderError('error', `http${response.status}`);
  return response.json().catch(() => {
    throw new ProviderError('error', 'badAnswer');
  });
}
const recording = (audio: Uint8Array, field: string, form: FormData) =>
  form.append(field, new Blob([new Uint8Array(audio)]), audioName(audio));

const mistralResult = z.object({
  text: z.string(),
  segments: z.array(z.object({ start: z.number(), end: z.number(), text: z.string().default('') })).default([]),
  language: z.string().nullish(),
  usage: z.object({ prompt_audio_seconds: z.number().nullish() }).nullish(),
});
/** Mistral's Voxtral. It can't take the language together with the timings: the timings are kept, the language heard. */
async function mistralTranscribe(urls: AdapterUrls, r: TranscriptionRequest): Promise<Transcription> {
  const form = new FormData();
  recording(r.audio, 'file', form);
  form.append('model', r.model);
  form.append('timestamp_granularities', 'segment');
  const json = await postRecording(
    `${urls.mistral ?? MISTRAL}/audio/transcriptions`,
    { authorization: `Bearer ${r.account.apiKey}` },
    form,
    r.signal,
  );
  const read = mistralResult.safeParse(json);
  if (!read.success) throw new ProviderError('error', 'badAnswer');
  const { text, segments, language, usage } = read.data;
  return {
    text,
    segments,
    ...(language ? { language } : {}),
    seconds: Math.round(usage?.prompt_audio_seconds ?? segments.at(-1)?.end ?? 0),
  };
}

/** Mistral: text through its OpenAI-compatible address, speech through Voxtral. */
export const mistralAdapter = (urls: AdapterUrls = {}): ProviderAdapter => ({
  ...sdkDoor((r) =>
    createOpenAICompatible({
      name: 'mistral',
      baseURL: urls.mistral ?? MISTRAL,
      apiKey: r.account.apiKey,
      includeUsage: true,
      supportsStructuredOutputs: true,
    }).chatModel(r.model),
  ),
  transcribe: (r) => mistralTranscribe(urls, r),
});

const AZURE_LOCALES: Record<string, string> = { bg: 'bg-BG', fr: 'fr-FR', en: 'en-US' };
const azureResult = z.object({
  durationMilliseconds: z.number().default(0),
  combinedPhrases: z.array(z.object({ text: z.string().default('') })).default([]),
  phrases: z
    .array(z.object({ offsetMilliseconds: z.number(), durationMilliseconds: z.number(), text: z.string().default('') }))
    .default([]),
});
/** Microsoft Azure Speech, "fast transcription", in the region the owner chose (kept in the account's id field). */
async function azureTranscribe(urls: AdapterUrls, r: TranscriptionRequest): Promise<Transcription> {
  const region = r.account.accountId;
  if (!region || !/^[a-z0-9-]{3,30}$/.test(region)) throw new ProviderError('error', 'noRegion');
  const form = new FormData();
  recording(r.audio, 'audio', form);
  const locale = r.language ? AZURE_LOCALES[r.language] : undefined;
  form.append('definition', JSON.stringify(locale ? { locales: [locale] } : {}));
  const json = await postRecording(
    `${(urls.azure ?? AZURE).replace('{region}', region)}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`,
    { 'ocp-apim-subscription-key': r.account.apiKey },
    form,
    r.signal,
  );
  const read = azureResult.safeParse(json);
  if (!read.success) throw new ProviderError('error', 'badAnswer');
  const { durationMilliseconds, combinedPhrases, phrases } = read.data;
  const segments = phrases.map((p) => ({
    start: p.offsetMilliseconds / 1000,
    end: (p.offsetMilliseconds + p.durationMilliseconds) / 1000,
    text: p.text,
  }));
  return {
    text: combinedPhrases[0]?.text ?? segments.map((s) => s.text).join(' '),
    segments,
    ...(locale && r.language ? { language: r.language } : {}),
    seconds: Math.round(durationMilliseconds / 1000 || (segments.at(-1)?.end ?? 0)),
  };
}
export const azureAdapter = (urls: AdapterUrls = {}): ProviderAdapter => ({
  complete: () => Promise.reject(new ProviderError('error', 'speechOnly')),
  transcribe: (r) => azureTranscribe(urls, r),
});

const elevenResult = z.object({
  text: z.string(),
  language_code: z.string().nullish(),
  words: z
    .array(
      z.object({
        text: z.string().default(''),
        type: z.string().default('word'),
        start: z.number().nullish(),
        end: z.number().nullish(),
      }),
    )
    .default([]),
});
/** Scribe times every word: a part ends at a full stop, or at a pause of more than a second. */
export function elevenSegments(words: z.infer<typeof elevenResult>['words']): Transcription['segments'] {
  const segments: Transcription['segments'] = [];
  let cur: { start: number; end: number; text: string } | null = null;
  for (const w of words) {
    if (w.type !== 'word' || w.start == null || w.end == null) continue;
    if (cur && w.start - cur.end > 1) {
      segments.push(cur);
      cur = null;
    }
    cur = cur
      ? { start: cur.start, end: w.end, text: `${cur.text} ${w.text}` }
      : { start: w.start, end: w.end, text: w.text };
    if (/[.!?]$/.test(w.text)) {
      segments.push(cur);
      cur = null;
    }
  }
  if (cur) segments.push(cur);
  return segments;
}
/** ElevenLabs Scribe. */
async function elevenTranscribe(urls: AdapterUrls, r: TranscriptionRequest): Promise<Transcription> {
  const form = new FormData();
  recording(r.audio, 'file', form);
  form.append('model_id', r.model);
  form.append('timestamps_granularity', 'word');
  if (r.language) form.append('language_code', r.language);
  const json = await postRecording(
    `${urls.elevenlabs ?? ELEVENLABS}/speech-to-text`,
    { 'xi-api-key': r.account.apiKey },
    form,
    r.signal,
  );
  const read = elevenResult.safeParse(json);
  if (!read.success) throw new ProviderError('error', 'badAnswer');
  const segments = elevenSegments(read.data.words);
  return {
    text: read.data.text,
    segments,
    ...(read.data.language_code ? { language: read.data.language_code } : {}),
    seconds: Math.round(segments.at(-1)?.end ?? 0),
  };
}
export const elevenlabsAdapter = (urls: AdapterUrls = {}): ProviderAdapter => ({
  complete: () => Promise.reject(new ProviderError('error', 'speechOnly')),
  transcribe: (r) => elevenTranscribe(urls, r),
});

export const realAdapters = (urls: AdapterUrls = {}): Record<string, ProviderAdapter> => ({
  groq: groqAdapter(urls),
  cloudflare: cloudflareAdapter(urls),
  anthropic: anthropicAdapter(urls),
  mistral: mistralAdapter(urls),
  azure: azureAdapter(urls),
  elevenlabs: elevenlabsAdapter(urls),
});
