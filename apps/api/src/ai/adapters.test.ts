// The doors to Groq and Cloudflare, against a pretend AI company on this PC (no account, no key, no cost): what they
// send, what they read back, and how failures are named for the engine. Also the encryption of the stored keys.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { cloudflareAdapter, groqAdapter } from './adapters.js';
import type { CompletionRequest } from './provider.js';
import { ProviderError } from './provider.js';
import { decryptKey, encryptKey, keyHint, newMasterKey, readMasterKey } from './secrets.js';

interface Seen {
  url: string;
  auth: string;
  body: Record<string, unknown>;
}
const seen: Seen[] = [];
/** What the pretend AI company does next: answer with this text, or fail with this HTTP status. */
let next: { text?: string; status?: number } = {};
let server: Server;
let base = '';

const read = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let s = '';
    req.on('data', (d: Buffer) => (s += d.toString()));
    req.on('end', () => resolve(s));
  });

beforeAll(async () => {
  server = createServer((req, res) => {
    void read(req).then((text) => {
      seen.push({ url: req.url ?? '', auth: req.headers.authorization ?? '', body: JSON.parse(text) as Seen['body'] });
      const status = next.status ?? 200;
      res.writeHead(status, { 'content-type': 'application/json' });
      if (status !== 200) {
        res.end(JSON.stringify({ error: { message: 'Pretend failure: should never reach the log', type: 'x' } }));
        return;
      }
      res.end(
        JSON.stringify({
          id: 'x',
          object: 'chat.completion',
          created: 1,
          model: 'm',
          choices: [
            { index: 0, message: { role: 'assistant', content: next.text ?? '{"reply":"OK"}' }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 42, completion_tokens: 7, total_tokens: 49 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const request = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  account: { provider: 'groq', plan: 'free', apiKey: 'gsk_test_1234' },
  model: 'openai/gpt-oss-20b',
  system: 'Reply OK.',
  prompt: 'Test',
  temperature: 0,
  maxOutputTokens: 400,
  json: true,
  jsonSchema: z.toJSONSchema(z.object({ reply: z.string() })) as Record<string, unknown>,
  signal: new AbortController().signal,
  ...over,
});
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof ProviderError ? `${e.kind}:${e.code}` : `other:${String(e)}`;
  }
  return 'no error';
};

describe('the Groq door', () => {
  const groq = () => groqAdapter({ groq: `${base}/groq/v1` });

  it('sends the key, the model, temperature 0, the JSON schema and short thinking; reads the answer and tokens', async () => {
    next = {};
    const answer = await groq().complete(request());
    expect(answer).toEqual({ text: '{"reply":"OK"}', inputTokens: 42, outputTokens: 7 });
    const sent = seen.at(-1);
    expect(sent?.url).toBe('/groq/v1/chat/completions');
    expect(sent?.auth).toBe('Bearer gsk_test_1234');
    expect(sent?.body).toMatchObject({ model: 'openai/gpt-oss-20b', temperature: 0, reasoning_effort: 'low' });
    expect(sent?.body.response_format).toMatchObject({ type: 'json_schema' });
    expect(JSON.stringify(sent?.body.messages)).toContain('Reply OK.');
  });

  it('hands back an answer that is not the JSON asked for, so the engine can ask again', async () => {
    next = { text: 'Sure, here you go: OK' };
    expect((await groq().complete(request())).text).toBe('Sure, here you go: OK');
  });

  it('names failures for the engine, never with the AI company message', async () => {
    next = { status: 429 };
    expect(await failure(groq().complete(request()))).toBe('rateLimit:http429');
    next = { status: 401 };
    expect(await failure(groq().complete(request()))).toBe('error:auth401');
    next = { status: 500 };
    expect(await failure(groq().complete(request()))).toBe('error:http500');
    next = {};
  });

  it('says "network" when the AI company cannot be reached', async () => {
    const nowhere = groqAdapter({ groq: 'http://127.0.0.1:1/v1' });
    expect(await failure(nowhere.complete(request()))).toBe('error:network');
  });
});

describe('the Cloudflare door', () => {
  const cloudflare = () => cloudflareAdapter({ cloudflare: `${base}/cf/{accountId}/ai/v1` });
  const account = { provider: 'cloudflare', plan: 'free' as const, apiKey: 'cf_test_5678', accountId: 'abc123' };

  it("uses the company's account id in the address, and asks for JSON with the schema", async () => {
    next = {};
    const answer = await cloudflare().complete(request({ account, model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' }));
    expect(answer.text).toBe('{"reply":"OK"}');
    const sent = seen.at(-1);
    expect(sent?.url).toBe('/cf/abc123/ai/v1/chat/completions');
    expect(sent?.auth).toBe('Bearer cf_test_5678');
    expect(sent?.body).toMatchObject({ model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', temperature: 0 });
    expect(sent?.body.response_format).toMatchObject({ type: 'json_schema' });
  });

  it('refuses to call without an account id', async () => {
    const { accountId: _a, ...noId } = account;
    expect(await failure(cloudflare().complete(request({ account: noId })))).toBe('error:noAccountId');
  });
});

describe('the stored keys', () => {
  const master = readMasterKey(newMasterKey());
  const company = '7d0b5b8e-3f1f-4c55-9a43-0f3b3a1c2d4e';
  const other = '0e4a6f0b-1d62-4f0b-8a8e-5c3b7d9a1e2f';

  it('encrypts a key so only the same company and AI company can open it, with the same master key', () => {
    if (!master) throw new Error('no master key');
    const stored = encryptKey(master, company, 'groq', 'gsk_secret_value_9876');
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toContain('gsk_secret');
    expect(encryptKey(master, company, 'groq', 'gsk_secret_value_9876')).not.toBe(stored); // a fresh nonce each time
    expect(decryptKey(master, company, 'groq', stored)).toBe('gsk_secret_value_9876');
    expect(decryptKey(master, other, 'groq', stored)).toBeNull();
    expect(decryptKey(master, company, 'cloudflare', stored)).toBeNull();
    const otherMaster = readMasterKey(newMasterKey());
    if (otherMaster) expect(decryptKey(otherMaster, company, 'groq', stored)).toBeNull();
    const [v, iv, tag, data] = stored.split(':');
    const changed = [v, iv, tag, `${data?.startsWith('A') ? 'B' : 'A'}${data?.slice(1)}`].join(':');
    expect(decryptKey(master, company, 'groq', changed)).toBeNull();
  });

  it('accepts only a 32-byte master key, and shows only the last 4 characters of a key', () => {
    expect(readMasterKey(undefined)).toBeNull();
    expect(readMasterKey('too-short')).toBeNull();
    expect(readMasterKey(Buffer.alloc(32, 1).toString('base64'))?.length).toBe(32);
    expect(keyHint('gsk_secret_value_9876')).toBe('9876');
  });
});
