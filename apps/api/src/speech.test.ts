// Speech-to-text through the server, with a pretend AI company: admins and reviewers only; a recording in, a timed
// transcript out with the speakers named; the next AI company when the first fails; the log keeps the length only,
// never the recording or the words; the size limit; the company's AI switch.
import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  createDb,
  type Db,
  DEMO_COMPANY,
  type LocalPostgres,
  runMigrations,
  schema,
  SECOND_COMPANY,
  seedDemo,
  startLocalPostgres,
} from '@qsmart/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProviderAdapter } from './ai/provider.js';
import { ProviderError } from './ai/provider.js';
import { createApp } from './app.js';
import type { TokenVerifier } from './auth/token-verifier.js';

const verifier: TokenVerifier = {
  async verify(token) {
    if (!['admin', 'reviewer', 'lead', 'trainer', 'agent'].includes(token)) throw new Error('invalid token');
    return { uid: `demo-${token}`, email: `${token}@demo.test`, emailVerified: true };
  },
};

const heard = [
  { start: 0.5, end: 3, text: ' Good morning, Bright Parcels, this is Mira.' },
  { start: 3.2, end: 6.5, text: ' Hi, my parcel never arrived.' },
  { start: 7, end: 9, text: ' I am sorry, let me check it.' },
];
let groqFails = false;
let namesFail = false;
const received: { model: string; bytes: number; language?: string }[] = [];
const pretend = (provider: string): ProviderAdapter => ({
  complete() {
    if (namesFail) return Promise.reject(new ProviderError('error', 'http500'));
    return Promise.resolve({
      text: JSON.stringify({ speakers: ['agent', 'customer', 'agent'] }),
      inputTokens: 100,
      outputTokens: 20,
    });
  },
  transcribe(r) {
    received.push({ model: r.model, bytes: r.audio.length, ...(r.language ? { language: r.language } : {}) });
    if (provider === 'groq' && groqFails) return Promise.reject(new ProviderError('rateLimit', 'http429'));
    return Promise.resolve({ text: heard.map((h) => h.text).join(''), segments: heard, language: 'en', seconds: 9 });
  },
});

let server: LocalPostgres;
let owner: Db;
let db: Db;
let app: NestFastifyApplication;
const company: Record<string, string> = {};
const recording = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(4000, 7)]);

const upload = (who: string, body: Buffer | string = recording, type = 'audio/mpeg', at = DEMO_COMPANY, query = '') =>
  app.inject({
    method: 'POST',
    url: `/api/speech/transcribe${query}`,
    headers: { authorization: `Bearer ${who}`, 'x-company-id': company[at] ?? '', 'content-type': type },
    payload: body,
  });

beforeAll(async () => {
  server = await startLocalPostgres();
  await runMigrations(server.ownerUrl);
  owner = createDb(server.ownerUrl);
  await seedDemo(owner);
  for (const c of await owner.select().from(schema.companies)) company[c.name] = c.id;
  db = createDb(server.appUrl);
  app = await createApp({
    db,
    verifier,
    ai: {
      adapters: { groq: pretend('groq'), cloudflare: pretend('cloudflare') },
      accounts: async () => [
        { provider: 'groq', plan: 'free', apiKey: 'test' },
        { provider: 'cloudflare', plan: 'free', apiKey: 'test', accountId: 'a' },
      ],
    },
  });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await owner?.$client.end();
  await db?.$client.end();
  await server?.stop();
});

describe('speech-to-text', () => {
  it('turns a recording into a timed transcript with the speakers named, for admins and reviewers', async () => {
    const out = await upload('reviewer', recording, 'audio/mpeg', DEMO_COMPANY, '?language=bg');
    expect(out.statusCode, out.body).toBe(200);
    expect(out.json()).toMatchObject({
      transcript:
        '[0:00] Agent: Good morning, Bright Parcels, this is Mira.\n[0:03] Customer: Hi, my parcel never arrived.\n[0:07] Agent: I am sorry, let me check it.',
      language: 'en',
      seconds: 9,
      provider: 'groq',
      model: 'whisper-large-v3',
      speakers: true,
    });
    // the whole recording reached the AI company, with the call's language
    expect(received.at(-1)).toEqual({ model: 'whisper-large-v3', bytes: recording.length, language: 'bg' });
    expect((await upload('admin', recording, 'audio/wav')).statusCode).toBe(200);
    for (const who of ['lead', 'trainer', 'agent']) expect((await upload(who)).statusCode).toBe(403);
  });

  it('keeps only the length in the AI log: never the recording or its words', async () => {
    const rows = await owner.select().from(schema.aiCalls);
    const speech = rows.filter((r) => r.feature === 'speech.transcribe');
    expect(speech.length).toBeGreaterThanOrEqual(2);
    expect(speech[0]).toMatchObject({
      provider: 'groq',
      status: 'ok',
      audioSeconds: 9,
      costMicroUsd: 0,
      dataClass: 'test',
    });
    expect(rows.some((r) => r.feature === 'speech.speakers' && r.status === 'ok')).toBe(true);
    const everything = JSON.stringify(rows);
    expect(everything).not.toContain('parcel');
    expect(everything).not.toContain('Mira');
    // and nothing else holds it either: no table in the database has the words
    const tables = await owner.execute<{ t: string }>(
      "select table_name as t from information_schema.tables where table_schema = 'public'",
    );
    for (const { t } of tables.rows) {
      const found = await owner.execute(
        `select 1 from "${t}" where "${t}"::text ilike '%parcel never arrived%' limit 1`,
      );
      expect(found.rows, t).toHaveLength(0);
    }
  });

  it('moves to the next AI company when the first fails, and keeps the times when naming speakers fails', async () => {
    groqFails = true;
    namesFail = true;
    const out = (await upload('reviewer')).json<{ provider: string; transcript: string; speakers: boolean }>();
    expect(out.provider).toBe('cloudflare');
    expect(out.speakers).toBe(false);
    expect(out.transcript).toBe(
      '[0:00] Good morning, Bright Parcels, this is Mira.\n[0:03] Hi, my parcel never arrived.\n[0:07] I am sorry, let me check it.',
    );
    groqFails = false;
    namesFail = false;
  });

  it('refuses what is not a recording, too small or too big, and a wrong language', async () => {
    expect((await upload('reviewer', Buffer.from('x'))).json()).toMatchObject({ code: 'recordingInvalid' });
    expect((await upload('reviewer', '{"a":1}', 'application/json')).statusCode).toBe(400);
    expect(
      (await upload('reviewer', recording, 'audio/mpeg', DEMO_COMPANY, '?language=bulgarian')).json(),
    ).toMatchObject({
      code: 'recordingInvalid',
    });
    const big = Buffer.alloc(25 * 1024 * 1024 + 1, 1);
    expect((await upload('reviewer', big)).statusCode).toBe(413);
  });

  it("follows the company's AI switch, and logs in the company that asked", async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/ai/rules',
      headers: { authorization: 'Bearer admin', 'x-company-id': company[DEMO_COMPANY] ?? '' },
      payload: { enabled: false, euOnly: false, allowedProviders: [], allowPaid: false, limits: {} },
    });
    expect((await upload('reviewer')).json()).toMatchObject({ code: 'aiOff' });
    const before = (await owner.select().from(schema.aiCalls)).filter(
      (r) => r.companyId === company[SECOND_COMPANY],
    ).length;
    expect((await upload('admin', recording, 'audio/mpeg', SECOND_COMPANY)).statusCode).toBe(200);
    const mine = (await owner.select().from(schema.aiCalls)).filter((r) => r.companyId === company[SECOND_COMPANY]);
    expect(mine.length).toBeGreaterThan(before);
    expect(mine.every((r) => r.dataClass === 'client')).toBe(true);
  });
});
