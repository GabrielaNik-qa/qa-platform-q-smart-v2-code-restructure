// Admin › AI (admins only): the AI companies and their keys (AI provider), the monthly limits and this month's use
// (AI usage limits), and the company's switch (AI on or off). Keys are stored encrypted and never sent back to a page:
// a page sees only their last 4 characters. "Test" asks the AI company for one short answer, with no company data.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  aiUseSummary,
  type Db,
  deleteAiAccount,
  getAiRules,
  listAiAccounts,
  aiUseToday,
  listAiCalls,
  listSeenLimits,
  aiUseWindow,
  type Tx,
  listTeams,
  logActivity,
  type Membership,
  membershipOfUser,
  saveAiAccount,
  saveAiRules,
  type StoredAiAccount,
  withCompany,
} from '@qsmart/db';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { CATALOGUE, CLOUDFLARE_FREE_NEURONS, cloudflareNeurons, type ProviderId, PROVIDERS } from './ai/catalogue.js';
import { AiError, type AiEngine } from './ai/engine.js';
import { expectedTokens, paceOf } from './ai/pacing.js';
import { AI_TEST } from './ai/jobs.js';
import { encryptKey, keyHint } from './ai/secrets.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership } from './decorators.js';
import { badRequest, notFound } from './errors.js';
import { AI_ENGINE, DB, MASTER_KEY } from './tokens.js';

const PROVIDER_IDS = Object.keys(PROVIDERS) as [ProviderId, ...ProviderId[]];
const providerParam = z.enum(PROVIDER_IDS);
const limit = z
  .object({
    microUsd: z.number().int().min(0).max(10_000_000_000).optional(),
    calls: z.number().int().min(0).max(100_000_000).optional(),
  })
  .strict();
const rulesInput = z
  .object({
    enabled: z.boolean(),
    euOnly: z.boolean(),
    allowedProviders: z.array(providerParam).max(20),
    allowPaid: z.boolean(),
    limits: z.object({ company: limit.optional(), teams: z.record(z.uuid(), limit).optional() }).strict(),
  })
  .partial()
  .strict();
const accountInput = z
  .object({
    /** empty: keep the key already stored */
    apiKey: z
      .string()
      .trim()
      .regex(/^[\x21-\x7e]{8,300}$/)
      .optional(),
    accountId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .nullable()
      .optional(),
    plan: z.enum(['free', 'paid']),
    enabled: z.boolean(),
  })
  .strict();

/**
 * The free plans' allowance today: Groq's own latest figures per model (what is left and when it resets), Cloudflare's
 * Neurons counted from Q-smart's log, and what each model did since 00:00 UTC.
 */
/**
 * Each free-plan model's limits as the engine checks them (pacing.ts): requests and tokens per minute and per day
 * (audio per hour and per day for speech), each with its source (the AI company's own figure for the account, or its
 * published limit with Q-smart's own count), and its status. "Unavailable": its AI company is resting after failures.
 */
async function limitsOf(tx: Tx, companyId: string, engine: AiEngine) {
  const accounts = (await listAiAccounts(tx)).filter((a) => a.enabled && a.plan === 'free');
  const seen = await listSeenLimits(tx);
  const now = Date.now();
  return Promise.all(
    CATALOGUE.models
      .filter((m) => m.freeLimits && accounts.some((a) => a.provider === m.provider))
      .map(async (m) => {
        const use = await aiUseWindow(tx, m.provider, m.model);
        const pace = paceOf({
          limits: m.freeLimits,
          use,
          seen: seen.find((x) => x.provider === m.provider && x.model === m.model),
          tokens: m.kind === 'speech' ? 0 : expectedTokens(3000, use.outputTokens, 4000),
          now,
        });
        const resting = engine.breaker.restLeft([`${companyId}:${m.provider}`]);
        return {
          provider: m.provider,
          model: m.model,
          status: resting > 0 ? ('unavailable' as const) : pace.status,
          waitMs: Math.max(resting, pace.waitMs),
          rows: pace.rows,
          checked: m.freeLimits?.checked ?? '',
          source: m.freeLimits?.source ?? '',
        };
      }),
  );
}

async function allowanceOf(tx: Tx) {
  const today = await aiUseToday(tx);
  const neurons = today
    .filter((u) => u.provider === 'cloudflare')
    .reduce(
      (sum, u) =>
        sum +
        cloudflareNeurons(
          CATALOGUE.models.find((m) => m.model === u.model),
          u.inputTokens,
          u.outputTokens,
          u.audioSeconds,
        ),
      0,
    );
  const midnight = new Date();
  midnight.setUTCHours(24, 0, 0, 0);
  return {
    now: new Date().toISOString(),
    nextUtcMidnight: midnight.toISOString(),
    seen: await listSeenLimits(tx),
    today,
    cloudflare: { neuronsUsed: Math.round(neurons), neuronsFree: CLOUDFLARE_FREE_NEURONS },
  };
}

/** What a page may see of an account: never the key, only its last 4 characters. */
const shown = ({ keyCipher: _k, ...a }: StoredAiAccount) => a;

@Controller('ai')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class AiController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AI_ENGINE) private readonly engine: AiEngine,
    @Inject(MASTER_KEY) private readonly masterKey: Buffer | null,
  ) {}

  /** Everything Admin › AI shows: the rules, the accounts, the AI companies and models, and this month's use. */
  @Get()
  @Allow('ai.manage')
  overview(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, async (tx) => ({
      rules: await getAiRules(tx),
      accounts: (await listAiAccounts(tx)).map(shown),
      providers: Object.values(CATALOGUE.providers),
      models: CATALOGUE.models,
      canStoreKeys: !!this.masterKey,
      use: await aiUseSummary(tx),
      teams: (await listTeams(tx)).map((t) => ({ id: t.id, name: t.name })),
      recent: await listAiCalls(tx, 50),
      allowance: await allowanceOf(tx),
      limits: await limitsOf(tx, membership.companyId, this.engine),
    }));
  }

  @Put('rules')
  @Allow('ai.manage')
  async saveRules(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = rulesInput.safeParse(body);
    if (!input.success) throw badRequest('aiRulesInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const teams = new Set((await listTeams(tx)).map((t) => t.id));
      if (Object.keys(input.data.limits?.teams ?? {}).some((id) => !teams.has(id))) throw badRequest('aiRulesInvalid');
      await saveAiRules(tx, input.data);
      await logActivity(tx, actorOf(membership), { action: 'aiRulesChanged' });
      return getAiRules(tx);
    });
  }

  /**
   * AI reviews (AutoQA): the admin confirms the agents were told (they start only then; the date and who confirmed
   * are kept), and chooses the channels they run on (none ticked: all).
   */
  @Put('reviews')
  @Allow('ai.manage')
  async saveReviewRules(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = z
      .object({ announced: z.boolean(), channels: z.array(z.enum(['call', 'chat', 'email', 'other'])).max(4) })
      .strict()
      .safeParse(body);
    if (!input.success) throw badRequest('aiRulesInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const before = (await getAiRules(tx)).reviews;
      const reviews = {
        ...(input.data.announced
          ? {
              announcedAt: before.announcedAt ?? new Date().toISOString(),
              announcedBy: before.announcedBy ?? membership.userName,
            }
          : {}),
        channels: [...new Set(input.data.channels)],
      };
      await saveAiRules(tx, { reviews });
      await logActivity(tx, actorOf(membership), { action: 'aiReviewsChanged' });
      return (await getAiRules(tx)).reviews;
    });
  }

  /** Connect an AI company, or change its plan, account id, switch or key. */
  @Put('accounts/:provider')
  @Allow('ai.manage')
  async saveAccount(
    @CurrentMembership() membership: Membership,
    @Param('provider') provider: string,
    @Body() body: unknown,
  ) {
    const id = providerParam.safeParse(provider);
    const input = accountInput.safeParse(body);
    if (!id.success || !input.success) throw badRequest('aiAccountInvalid');
    const { apiKey, accountId, plan, enabled } = input.data;
    if (apiKey && !this.masterKey) throw badRequest('aiNoMasterKey');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const existing = (await listAiAccounts(tx)).find((a) => a.provider === id.data);
      if (!existing && !apiKey) throw badRequest('aiAccountInvalid');
      const account = accountId === undefined ? (existing?.accountId ?? null) : accountId;
      if (id.data === 'cloudflare' && !account) throw badRequest('aiAccountInvalid');
      const keyCipher =
        apiKey && this.masterKey
          ? encryptKey(this.masterKey, membership.companyId, id.data, apiKey)
          : (existing?.keyCipher ?? '');
      const saved: StoredAiAccount = {
        provider: id.data,
        plan,
        keyCipher,
        keyHint: apiKey ? keyHint(apiKey) : (existing?.keyHint ?? ''),
        accountId: account,
        enabled,
        byId: (await membershipOfUser(tx, membership.userId))?.id ?? null,
        byName: membership.userName,
        updatedAt: new Date(),
      };
      await saveAiAccount(tx, saved);
      await logActivity(tx, actorOf(membership), {
        action: 'aiAccountSaved',
        targetName: PROVIDERS[id.data].name,
        details: { change: apiKey ? 'key' : 'settings' },
      });
      return shown(saved);
    });
  }

  @Delete('accounts/:provider')
  @Allow('ai.manage')
  @HttpCode(204)
  async removeAccount(@CurrentMembership() membership: Membership, @Param('provider') provider: string) {
    const id = providerParam.safeParse(provider);
    if (!id.success) throw notFound('aiAccountNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      if (!(await deleteAiAccount(tx, id.data))) throw notFound('aiAccountNotFound');
      await logActivity(tx, actorOf(membership), { action: 'aiAccountRemoved', targetName: PROVIDERS[id.data].name });
    });
  }

  /** "Test": one short answer from this AI company, with no company data (counted as a test, like the demo). */
  @Post('accounts/:provider/test')
  @Allow('ai.manage')
  @HttpCode(200)
  async test(@CurrentMembership() membership: Membership, @Param('provider') provider: string) {
    const id = providerParam.safeParse(provider);
    if (!id.success) throw notFound('aiAccountNotFound');
    const byId = await withCompany(this.db, membership.companyId, async (tx) => {
      if (!(await listAiAccounts(tx)).some((a) => a.provider === id.data)) throw notFound('aiAccountNotFound');
      return (await membershipOfUser(tx, membership.userId))?.id ?? null;
    });
    try {
      const result = await this.engine.run({
        type: AI_TEST,
        companyId: membership.companyId,
        dataClass: 'test',
        byId,
        onlyProvider: id.data,
        system: 'This is a connection test from Q-smart. Follow the instruction exactly.',
        prompt: 'Reply with the JSON object {"reply":"OK"}.',
      });
      return { ok: true, provider: result.provider, model: result.model };
    } catch (e) {
      if (e instanceof AiError) return { ok: false, code: e.code, detail: e.detail ?? null };
      throw e;
    }
  }
}
