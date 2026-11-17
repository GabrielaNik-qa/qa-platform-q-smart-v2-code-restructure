// The doors to Anthropic, Mistral, Microsoft Azure Speech and ElevenLabs (Phase 6), against a pretend AI company on
// this PC (no account, no key, no cost): what they send (never a temperature for Claude), what they read back, and how
// failures are named. Also the data-terms rules of the catalogue and the router for these companies.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anthropicAdapter,
  anthropicSchema,
  audioName,
  azureAdapter,
  elevenSegments,
  elevenlabsAdapter,
  mistralAdapter,
} from './adapters.js';
import { CATALOGUE, MODELS, PROVIDERS } from './catalogue.js';
import type { CompletionRequest, ProviderAdapter, TranscriptionRequest } from './provider.js';
import { ProviderError } from './provider.js';
import { route } from './router.js';
import type { JobType } from './jobs.js';

interface Seen {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}
const seen: Seen[] = [];
let status = 200;
let server: Server;
let base = '';

const answer = (url: string): unknown => {
  if (url.startsWith('/v1/messages'))
    return {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: [{ type: 'text', text: '{"reply":"OK"}' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 40, output_tokens: 9 },
    };
  if (url.startsWith('/mistral/audio/transcriptions'))
    return {
      text: 'Hello. Goodbye.',
      language: 'en',
      segments: [
        { start: 0, end: 1.5, text: 'Hello.' },
        { start: 2, end: 3, text: 'Goodbye.' },
      ],
      usage: { prompt_audio_seconds: 4 },
    };
  if (url.startsWith('/mistral/chat/completions'))
    return {
      id: 'x',
      object: 'chat.completion',
      created: 1,
      model: 'm',
      choices: [{ index: 0, message: { role: 'assistant', content: '{"reply":"OK"}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 42, completion_tokens: 7, total_tokens: 49 },
    };
  if (url.startsWith('/azure/'))
    return {
      durationMilliseconds: 5200,
      combinedPhrases: [{ text: 'Добър ден. Как да помогна?' }],
      phrases: [
        { offsetMilliseconds: 500, durationMilliseconds: 1000, text: 'Добър ден.' },
        { offsetMilliseconds: 2000, durationMilliseconds: 1500, text: 'Как да помогна?' },
      ],
    };
  return {
    language_code: 'fr',
    text: 'Bonjour. Merci.',
    words: [
      { text: 'Bonjour.', type: 'word', start: 0, end: 1 },
      { text: ' ', type: 'spacing', start: 1, end: 1.1 },
      { text: 'Merci.', type: 'word', start: 1.2, end: 2 },
    ],
  };
};

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (d: Buffer) => (body += d.toString('latin1')));
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      res.writeHead(status, { 'content-type': 'application/json', 'retry-after': '7' });
      res.end(
        status === 200
          ? JSON.stringify(answer(req.url ?? ''))
          : JSON.stringify({ error: { message: 'Pretend failure' } }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const stt = (adapter: ProviderAdapter, r: TranscriptionRequest) => {
  if (!adapter.transcribe) throw new Error('no speech to text');
  return adapter.transcribe(r);
};
const request = (provider: string, over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  account: { provider, plan: 'paid', apiKey: 'sk-test-key-1234', accountId: 'westeurope' },
  model: 'claude-haiku-5-5',
  system: 'Be brief.',
  prompt: 'Hello',
  temperature: 0,
  maxOutputTokens: 100,
  json: true,
  signal: new AbortController().signal,
  ...over,
});
const speech = (provider: string, language?: string): TranscriptionRequest => ({
  account: { provider, plan: 'paid', apiKey: 'sk-test-key-1234', accountId: 'westeurope' },
  model: 'm',
  audio: new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 5, 6]),
  ...(language ? { language } : {}),
  signal: new AbortController().signal,
});

describe('Anthropic', () => {
  it('sends the key and the request, never a temperature, and reads the answer and its tokens', async () => {
    seen.length = 0;
    status = 200;
    const r = await anthropicAdapter({ anthropic: base }).complete(
      request('anthropic', { jsonSchema: { type: 'object', properties: { reply: { type: 'string', maxLength: 5 } } } }),
    );
    expect(r).toMatchObject({ text: '{"reply":"OK"}', inputTokens: 40, outputTokens: 9 });
    const call = seen[0] as Seen;
    expect(JSON.stringify(call.headers)).toContain('sk-test-key-1234');
    const body = JSON.parse(call.body) as Record<string, unknown>;
    expect(body).not.toHaveProperty('temperature');
    expect(body).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 100, system: 'Be brief.' });
    // the schema is closed and loses the keywords Anthropic does not take
    expect(body.output_config).toMatchObject({
      format: {
        type: 'json_schema',
        schema: { additionalProperties: false, properties: { reply: { type: 'string' } } },
      },
    });
  });

  it('names failures in the engine words, never keeping the AI company message', async () => {
    status = 429;
    const rate = await anthropicAdapter({ anthropic: base })
      .complete(request('anthropic'))
      .catch((e: unknown) => e);
    expect(rate).toBeInstanceOf(ProviderError);
    expect(rate).toMatchObject({ kind: 'rateLimit', code: 'http429', limits: { 'retry-after': '7' } });
    status = 401;
    const auth = await anthropicAdapter({ anthropic: base })
      .complete(request('anthropic'))
      .catch((e: unknown) => e);
    expect(auth).toMatchObject({ kind: 'error', code: 'auth401' });
    expect(String((auth as Error).message)).not.toContain('Pretend');
    status = 200;
  });

  it('closes objects and drops keywords it does not take', () => {
    expect(
      anthropicSchema({
        type: 'object',
        properties: { a: { type: 'array', items: { type: 'number', minimum: 1 }, minItems: 3 } },
      }),
    ).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: { a: { type: 'array', items: { type: 'number' } } },
    });
  });
});

describe('Mistral', () => {
  it('answers text through its OpenAI-compatible address', async () => {
    seen.length = 0;
    const r = await mistralAdapter({ mistral: `${base}/mistral` }).complete(
      request('mistral', { model: 'mistral-small-2603' }),
    );
    expect(r).toMatchObject({ text: '{"reply":"OK"}', inputTokens: 42, outputTokens: 7 });
    expect((seen[0] as Seen).headers.authorization).toBe('Bearer sk-test-key-1234');
  });

  it('transcribes with Voxtral: the timings are kept, and no language is sent with them', async () => {
    seen.length = 0;
    const t = await stt(mistralAdapter({ mistral: `${base}/mistral` }), {
      ...speech('mistral', 'en'),
      model: 'voxtral-mini-latest',
    });
    expect(t).toMatchObject({ text: 'Hello. Goodbye.', language: 'en', seconds: 4 });
    expect(t.segments).toHaveLength(2);
    const body = (seen[0] as Seen).body;
    expect(body).toContain('voxtral-mini-latest');
    expect(body).toContain('timestamp_granularities');
    expect(body).not.toContain('name="language"');
    expect(body).toContain('recording.wav');
  });
});

describe('Microsoft Azure Speech', () => {
  it('sends the key to its region, asks for the language heard and reads the parts', async () => {
    seen.length = 0;
    const t = await stt(azureAdapter({ azure: `${base}/azure` }), speech('azure', 'bg'));
    expect(t.text).toBe('Добър ден. Как да помогна?');
    expect(t.segments[1]).toEqual({ start: 2, end: 3.5, text: 'Как да помогна?' });
    expect(t).toMatchObject({ seconds: 5, language: 'bg' });
    expect((seen[0] as Seen).headers['ocp-apim-subscription-key']).toBe('sk-test-key-1234');
    expect((seen[0] as Seen).body).toContain('bg-BG');
  });

  it('needs a region, and only a plain one (nothing that could change the address)', async () => {
    const bad = speech('azure');
    bad.account.accountId = 'evil.example.com/x';
    await expect(stt(azureAdapter({ azure: `${base}/azure` }), bad)).rejects.toMatchObject({ code: 'noRegion' });
    const none = speech('azure');
    delete none.account.accountId;
    await expect(stt(azureAdapter(), none)).rejects.toMatchObject({ code: 'noRegion' });
  });
});

describe('ElevenLabs', () => {
  it('sends the key, asks for the model, and cuts the words into timed parts', async () => {
    seen.length = 0;
    const t = await stt(elevenlabsAdapter({ elevenlabs: `${base}/eleven` }), {
      ...speech('elevenlabs', 'fr'),
      model: 'scribe_v2',
    });
    expect(t).toMatchObject({ text: 'Bonjour. Merci.', language: 'fr', seconds: 2 });
    expect(t.segments).toEqual([
      { start: 0, end: 1, text: 'Bonjour.' },
      { start: 1.2, end: 2, text: 'Merci.' },
    ]);
    expect((seen[0] as Seen).headers['xi-api-key']).toBe('sk-test-key-1234');
    expect((seen[0] as Seen).body).toContain('scribe_v2');
  });

  it('cuts a part at a pause of more than a second', () => {
    expect(
      elevenSegments([
        { text: 'a', type: 'word', start: 0, end: 1 },
        { text: 'b', type: 'word', start: 3, end: 4 },
      ]),
    ).toHaveLength(2);
  });
});

it('tells the kind of a recording from its first bytes', () => {
  expect(audioName(new Uint8Array([0x4f, 0x67, 0x67, 0x53]))).toBe('recording.ogg');
  expect(audioName(new Uint8Array([0x49, 0x44, 0x33, 4]))).toBe('recording.mp3');
  expect(audioName(new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]))).toBe('recording.m4a');
});

describe('data terms of the new AI companies (read 17 November 2026)', () => {
  const job: JobType = {
    feature: 'x',
    schema: undefined as never,
    structured: false,
    temperature: 0,
    maxOutputTokens: 100,
    maxWaitMs: 1000,
    candidates: MODELS.filter((m) => ['anthropic', 'mistral', 'azure', 'elevenlabs'].includes(m.provider)).map(
      (m) => m.id,
    ),
  };
  const accounts = (plan: 'free' | 'paid') =>
    ['anthropic', 'mistral', 'azure', 'elevenlabs'].map((provider) => ({
      provider,
      plan,
      apiKey: 'k',
      accountId: 'westeurope',
    }));
  const run = (plan: 'free' | 'paid') =>
    route({
      job,
      dataClass: 'client',
      inputTokens: 100,
      rules: { euOnly: false, allowedProviders: [], allowPaid: true },
      accounts: accounts(plan),
      catalogue: CATALOGUE,
      quality: () => undefined,
      resting: () => false,
    }).skipped;

  it('lists every one with its sources, and says honestly which plan has which terms', () => {
    for (const id of ['anthropic', 'mistral', 'azure', 'elevenlabs'] as const) {
      expect(PROVIDERS[id].sources.length).toBeGreaterThan(0);
      expect(PROVIDERS[id].checked).toBe('2026-11-17');
    }
    expect(PROVIDERS.anthropic).toMatchObject({ terms: 'no-train-dpa', freePlan: false });
    expect(PROVIDERS.mistral).toMatchObject({ terms: 'no-train-dpa', freePlan: false, euProcessing: true });
    expect(PROVIDERS.azure).toMatchObject({ terms: 'no-train-dpa', freePlan: true, extra: 'region' });
    expect(PROVIDERS.elevenlabs.terms).toBe('may-train');
  });

  it('never uses ElevenLabs (its terms are not confirmed), on any plan', () => {
    expect(run('paid')['elevenlabs/scribe_v2']).toBe('terms');
    expect(run('free')['elevenlabs/scribe_v2']).toBe('terms');
  });

  it('never uses a paid-only AI company on a free account, but uses it on a paid one', () => {
    const free = run('free');
    expect(free['anthropic/claude-haiku-5-5']).toBe('paidOnly');
    expect(free['mistral/mistral-small-2603']).toBe('paidOnly');
    expect(free['azure/fast-transcription']).not.toBe('paidOnly');
    const paid = run('paid');
    expect(paid['anthropic/claude-haiku-5-5']).toBeUndefined();
    expect(paid['mistral/mistral-small-2603']).toBeUndefined();
  });
});
