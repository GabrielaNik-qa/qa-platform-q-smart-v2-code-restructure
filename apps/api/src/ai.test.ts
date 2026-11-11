// Admin › AI: only admins; keys stored encrypted and never sent back; the Test button with the stored key; the
// company's AI rules and limits; this month's use; the activity log; and the company wall.
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
import type { CompletionRequest, ProviderAdapter } from './ai/provider.js';
import { ProviderError } from './ai/provider.js';
import { newMasterKey, readMasterKey } from './ai/secrets.js';
import { createApp } from './app.js';
import type { TokenVerifier } from './auth/token-verifier.js';

const verifier: TokenVerifier = {
  async verify(token) {
    if (!['admin', 'reviewer', 'lead', 'trainer', 'agent'].includes(token)) throw new Error('invalid token');
    return { uid: `demo-${token}`, email: `${token}@demo.test`, emailVerified: true };
  },
};

/** The pretend AI company: remembers the key it was called with; answers OK unless told to refuse the key. */
const seenKeys: string[] = [];
let refuseKey = false;
const pretend: ProviderAdapter = {
  complete(r: CompletionRequest) {
    seenKeys.push(r.account.apiKey);
    if (refuseKey) return Promise.reject(new ProviderError('error', 'auth401'));
    return Promise.resolve({ text: '{"reply":"OK"}', inputTokens: 30, outputTokens: 5 });
  },
};

let server: LocalPostgres;
let owner: Db;
let db: Db;
let app: NestFastifyApplication;
let noKeyApp: NestFastifyApplication;
const company: Record<string, string> = {};
const GROQ_KEY = 'gsk_pretend_key_never_real_AB12';

beforeAll(async () => {
  server = await startLocalPostgres();
  await runMigrations(server.ownerUrl);
  owner = createDb(server.ownerUrl);
  await seedDemo(owner);
  for (const c of await owner.select().from(schema.companies)) company[c.name] = c.id;
  db = createDb(server.appUrl);
  const ai = { adapters: { groq: pretend, cloudflare: pretend } };
  app = await createApp({ db, verifier, masterKey: readMasterKey(newMasterKey()), ai });
  noKeyApp = await createApp({ db, verifier, masterKey: null, ai });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await noKeyApp?.close();
  await owner?.$client.end();
  await db?.$client.end();
  await server?.stop();
});

const call = (
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
  url: string,
  who: string,
  payload?: object,
  at = DEMO_COMPANY,
  on = app,
) =>
  on.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${who}`, 'x-company-id': company[at] ?? '' },
    ...(payload ? { payload } : {}),
  });
interface Overview {
  rules: { enabled: boolean; euOnly: boolean; allowedProviders: string[]; allowPaid: boolean; limits: object };
  accounts: { provider: string; plan: string; keyHint: string; accountId: string | null; enabled: boolean }[];
  providers: { id: string; terms: string }[];
  canStoreKeys: boolean;
  use: { feature: string; provider: string | null; calls: number }[];
  teams: { id: string; name: string }[];
  recent: { feature: string; status: string; provider: string | null }[];
}
const overview = async (at = DEMO_COMPANY) => (await call('GET', '/ai', 'admin', undefined, at)).json<Overview>();

describe('Admin › AI', () => {
  it('is for admins only', async () => {
    for (const who of ['reviewer', 'lead', 'trainer', 'agent']) {
      expect((await call('GET', '/ai', who)).statusCode, who).toBe(403);
      expect(
        (await call('PUT', '/ai/accounts/groq', who, { apiKey: GROQ_KEY, plan: 'free', enabled: true })).statusCode,
      ).toBe(403);
      expect((await call('PUT', '/ai/rules', who, { enabled: false })).statusCode).toBe(403);
      expect((await call('POST', '/ai/accounts/groq/test', who)).statusCode).toBe(403);
    }
    const first = await overview();
    expect(first.accounts).toEqual([]);
    expect(first.canStoreKeys).toBe(true);
    expect(first.providers.map((p) => p.id)).toEqual(['groq', 'cloudflare']);
    expect(first.providers.every((p) => p.terms === 'no-train-dpa')).toBe(true);
  });

  it('stores a key encrypted, never sends it back, and shows only its last 4 characters', async () => {
    const saved = await call('PUT', '/ai/accounts/groq', 'admin', { apiKey: GROQ_KEY, plan: 'free', enabled: true });
    expect(saved.statusCode).toBe(200);
    expect(saved.body).not.toContain(GROQ_KEY);
    expect(saved.json()).toMatchObject({ provider: 'groq', keyHint: 'AB12', plan: 'free', enabled: true });
    const page = await call('GET', '/ai', 'admin');
    expect(page.body).not.toContain(GROQ_KEY);
    expect(page.body).not.toContain('keyCipher');
    // in the database only encrypted
    const [row] = await owner.select().from(schema.aiAccounts);
    expect(row?.keyCipher.startsWith('v1:')).toBe(true);
    expect(row?.keyCipher).not.toContain('gsk_');
    expect(JSON.stringify(row)).not.toContain(GROQ_KEY);
  });

  it('checks what is entered: a whole key, and an account id for Cloudflare', async () => {
    const bad = [
      ['groq', { apiKey: 'has space in it', plan: 'free', enabled: true }],
      ['groq', { apiKey: 'short', plan: 'free', enabled: true }],
      ['cloudflare', { apiKey: 'cf_pretend_key_1234', plan: 'free', enabled: true }],
      ['cloudflare', { plan: 'free', enabled: true, accountId: 'abc123' }],
      ['openai', { apiKey: 'sk_pretend_key_1234', plan: 'free', enabled: true }],
      ['groq', { apiKey: GROQ_KEY, plan: 'gold', enabled: true }],
    ] as const;
    for (const [provider, body] of bad)
      expect((await call('PUT', `/ai/accounts/${provider}`, 'admin', body)).json(), provider).toMatchObject({
        code: 'aiAccountInvalid',
      });
    const cf = await call('PUT', '/ai/accounts/cloudflare', 'admin', {
      apiKey: 'cf_pretend_key_5678',
      accountId: 'abc123',
      plan: 'free',
      enabled: true,
    });
    expect(cf.json()).toMatchObject({ provider: 'cloudflare', accountId: 'abc123', keyHint: '5678' });
  });

  it('tests a connection with the stored key, and keeps the key when only the settings change', async () => {
    const ok = await call('POST', '/ai/accounts/groq/test', 'admin');
    expect(ok.json()).toEqual({ ok: true, provider: 'groq', model: 'openai/gpt-oss-20b' });
    expect(seenKeys.at(-1)).toBe(GROQ_KEY);
    // switch it off: the test then finds no model; switch it on without a new key: the old key still works
    await call('PUT', '/ai/accounts/groq', 'admin', { plan: 'free', enabled: false });
    expect((await call('POST', '/ai/accounts/groq/test', 'admin')).json()).toMatchObject({
      ok: false,
      code: 'aiNoModel',
    });
    await call('PUT', '/ai/accounts/groq', 'admin', { plan: 'free', enabled: true });
    expect((await call('POST', '/ai/accounts/groq/test', 'admin')).json()).toMatchObject({ ok: true });
    expect(seenKeys.at(-1)).toBe(GROQ_KEY);
    // a key the AI company refuses: said clearly
    refuseKey = true;
    expect((await call('POST', '/ai/accounts/cloudflare/test', 'admin')).json()).toEqual({
      ok: false,
      code: 'aiUnavailable',
      detail: 'auth401',
    });
    refuseKey = false;
    // the tests count as tests, in this month's use and the recent calls
    const page = await overview();
    expect(page.use.find((u) => u.feature === 'ai.test' && u.provider === 'groq')?.calls).toBeGreaterThanOrEqual(2);
    expect(page.recent[0]).toMatchObject({ feature: 'ai.test', status: 'error', provider: 'cloudflare' });
  });

  it("saves the company's AI rules and limits, and refuses limits for another company's team", async () => {
    const { teams } = await overview();
    const team = teams[0]?.id ?? '';
    const rules = {
      euOnly: true,
      allowedProviders: ['groq'],
      allowPaid: false,
      limits: { company: { calls: 1000, microUsd: 5_000_000 }, teams: { [team]: { calls: 100 } } },
    };
    const saved = await call('PUT', '/ai/rules', 'admin', rules);
    expect(saved.json()).toMatchObject({ ...rules, enabled: true });
    expect((await overview()).rules).toMatchObject(rules);
    const otherTeams = await owner.select().from(schema.teams);
    const foreign = otherTeams.find((t) => t.companyId === company[SECOND_COMPANY])?.id ?? '';
    for (const bad of [
      { limits: { teams: { [foreign]: { calls: 5 } } } },
      { limits: { company: { calls: -1 } } },
      { limits: { company: { calls: 1.5 } } },
      { allowedProviders: ['gemini'] },
      { enabled: 'yes' },
      { extra: true },
    ])
      expect((await call('PUT', '/ai/rules', 'admin', bad)).json(), JSON.stringify(bad)).toMatchObject({
        code: 'aiRulesInvalid',
      });
    // switching the AI off stops the test too
    await call('PUT', '/ai/rules', 'admin', { enabled: false });
    expect((await call('POST', '/ai/accounts/groq/test', 'admin')).json()).toMatchObject({ ok: false, code: 'aiOff' });
    await call('PUT', '/ai/rules', 'admin', { enabled: true, euOnly: false, allowedProviders: [], limits: {} });
  });

  it('removes an account, and records the changes in the activity log', async () => {
    expect((await call('DELETE', '/ai/accounts/cloudflare', 'admin')).statusCode).toBe(204);
    expect((await call('DELETE', '/ai/accounts/cloudflare', 'admin')).json()).toMatchObject({
      code: 'aiAccountNotFound',
    });
    expect((await call('POST', '/ai/accounts/cloudflare/test', 'admin')).statusCode).toBe(404);
    expect((await overview()).accounts.map((a) => a.provider)).toEqual(['groq']);
    const log = (await call('GET', '/activity', 'admin')).json<{ action: string; targetName: string }[]>();
    expect(log.map((e) => e.action)).toEqual(
      expect.arrayContaining(['aiAccountSaved', 'aiAccountRemoved', 'aiRulesChanged']),
    );
    expect(JSON.stringify(log)).not.toContain(GROQ_KEY);
  });

  it('cannot store a key without the master key, but still shows and switches what is there', async () => {
    const page = (await call('GET', '/ai', 'admin', undefined, DEMO_COMPANY, noKeyApp)).json<Overview>();
    expect(page.canStoreKeys).toBe(false);
    const body = { apiKey: 'gsk_another_pretend_key_99', plan: 'free', enabled: true };
    expect((await call('PUT', '/ai/accounts/groq', 'admin', body, DEMO_COMPANY, noKeyApp)).json()).toMatchObject({
      code: 'aiNoMasterKey',
    });
    expect(
      (await call('PUT', '/ai/accounts/groq', 'admin', { plan: 'free', enabled: true }, DEMO_COMPANY, noKeyApp))
        .statusCode,
    ).toBe(200);
  });

  it("never shows or uses another company's AI accounts", async () => {
    const other = await overview(SECOND_COMPANY);
    expect(other.accounts).toEqual([]);
    expect(other.recent).toEqual([]);
    expect((await call('POST', '/ai/accounts/groq/test', 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(404);
    // the second company's own key can't be opened as the demo company's (each key is bound to its company)
    await call(
      'PUT',
      '/ai/accounts/groq',
      'admin',
      { apiKey: 'gsk_second_company_key_77', plan: 'free', enabled: true },
      SECOND_COMPANY,
    );
    await call('POST', '/ai/accounts/groq/test', 'admin', undefined, SECOND_COMPANY);
    expect(seenKeys.at(-1)).toBe('gsk_second_company_key_77');
    await call('POST', '/ai/accounts/groq/test', 'admin');
    expect(seenKeys.at(-1)).toBe(GROQ_KEY);
  });
});
