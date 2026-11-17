// The owner area's AI choices (17 November): which AI companies' models Q-smart offers to client companies, and the
// owner's recommended one. A model switched off here is never used by any company and isn't listed in their choices.
// Changed only through the database function platform_set_ai_offer, which checks again that this is the owner.
import { Body, Controller, Delete, Get, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  type Db,
  listAiAccounts,
  listAiLevels,
  listAiOffers,
  listPlatformAiAccounts,
  platformCompanies,
  platformDeleteAiAccount,
  platformSaveAiAccount,
  withCompany,
  platformSetAiLevel,
  platformSetAiOffer,
  platformSetAiTaskLevel,
} from '@qsmart/db';
import { z } from 'zod';
import { PLATFORM } from './ai/accounts.js';
import { CATALOGUE } from './ai/catalogue.js';
import { decryptKey, encryptKey, keyHint } from './ai/secrets.js';
import { AI_TASKS, DEFAULT_LEVELS, LEVELS, modelsFor } from './ai/levels.js';
import { PlatformGuard } from './auth/platform.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import type { VerifiedPerson } from './auth/token-verifier.js';
import { Person } from './decorators.js';
import { badRequest } from './errors.js';
import { DB, MASTER_KEY } from './tokens.js';

const offerInput = z
  .object({
    modelId: z.enum(CATALOGUE.models.map((m) => m.id) as [string, ...string[]]),
    offered: z.boolean(),
    recommended: z.boolean().default(false),
  })
  .strict();
const providerId = z.enum(Object.keys(CATALOGUE.providers) as [string, ...string[]]);
const accountInput = z
  .object({
    /** empty: keep the key already stored */
    apiKey: z
      .string()
      .trim()
      .regex(/^[!-~]{8,300}$/)
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
const modelId = z.enum(CATALOGUE.models.map((m) => m.id) as [string, ...string[]]);
const level = z.enum(['light', 'standard', 'thorough']);
const levelInput = z.object({ level, models: z.array(modelId).max(40) }).strict();
const taskInput = z
  .object({ feature: z.enum(AI_TASKS.map((t) => t.feature) as [string, ...string[]]), level })
  .strict();

@Controller('platform/ai-models')
@UseGuards(SignedInGuard, PlatformGuard)
export class PlatformAiController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(MASTER_KEY) private readonly masterKey: Buffer | null,
  ) {}

  /** Every AI company and model in Q-smart's catalogue, with the owner's switches. */
  @Get()
  async list() {
    const offers = await listAiOffers(this.db);
    const owner = await listAiLevels(this.db);
    return {
      // behind each effort level: the owner's list of models (or the default), best first
      levels: LEVELS.map((l) => ({
        level: l,
        models: owner.levels.find((x) => x.level === l)?.models ?? DEFAULT_LEVELS[l],
        own: owner.levels.some((x) => x.level === l),
      })),
      // each AI task: its level and the models that level gives it
      tasks: AI_TASKS.map((t) => ({ ...t, ...modelsFor(t.feature, owner) })),
      providers: Object.values(CATALOGUE.providers),
      // Q-smart's own AI accounts: never the key, only its last 4 characters
      accounts: (await listPlatformAiAccounts(this.db)).map(({ keyCipher: _k, ...a }) => a),
      canStoreKeys: !!this.masterKey,
      models: CATALOGUE.models.map((m) => {
        const o = offers.find((x) => x.modelId === m.id);
        return { ...m, offered: o?.offered ?? true, recommended: o?.recommended ?? false };
      }),
    };
  }

  @Put()
  async set(@Person() person: VerifiedPerson, @Body() body: unknown) {
    const input = offerInput.safeParse(body);
    if (!input.success) throw badRequest('aiRulesInvalid');
    await platformSetAiOffer(this.db, person.uid, input.data);
    return this.list();
  }

  /** Connect one of Q-smart's AI accounts, or change its plan, account id, switch or key. */
  @Put('accounts/:provider')
  async saveAccount(@Person() person: VerifiedPerson, @Param('provider') provider: string, @Body() body: unknown) {
    const id = providerId.safeParse(provider);
    const input = accountInput.safeParse(body);
    if (!id.success || !input.success) throw badRequest('aiAccountInvalid');
    if (!this.masterKey) throw badRequest('aiNoMasterKey');
    const existing = (await listPlatformAiAccounts(this.db)).find((a) => a.provider === id.data);
    const { apiKey } = input.data;
    if (!apiKey && !existing) throw badRequest('aiAccountInvalid');
    await platformSaveAiAccount(this.db, person.uid, {
      provider: id.data,
      plan: input.data.plan,
      keyCipher: apiKey ? encryptKey(this.masterKey, PLATFORM, id.data, apiKey) : (existing?.keyCipher ?? ''),
      keyHint: apiKey ? keyHint(apiKey) : (existing?.keyHint ?? ''),
      accountId: input.data.accountId ?? existing?.accountId ?? null,
      enabled: input.data.enabled,
    });
    return this.list();
  }

  @Delete('accounts/:provider')
  async removeAccount(@Person() person: VerifiedPerson, @Param('provider') provider: string) {
    const id = providerId.safeParse(provider);
    if (!id.success) throw badRequest('aiAccountInvalid');
    await platformDeleteAiAccount(this.db, person.uid, id.data);
    return this.list();
  }

  /**
   * Moves the AI keys a company connected before (17 November: the demo's Groq and Cloudflare keys) into Q-smart's own
   * accounts, for the AI companies Q-smart has no account with yet. The keys are opened and encrypted again for Q-smart
   * on the server; they never leave it.
   */
  @Post('accounts/move-from-companies')
  async moveAccounts(@Person() person: VerifiedPerson) {
    const masterKey = this.masterKey;
    if (!masterKey) throw badRequest('aiNoMasterKey');
    let moved = 0;
    for (const company of await platformCompanies(this.db, person.uid)) {
      const theirs = await withCompany(this.db, company.id, (tx) => listAiAccounts(tx));
      for (const a of theirs) {
        if ((await listPlatformAiAccounts(this.db)).some((o) => o.provider === a.provider)) continue;
        const plain = decryptKey(masterKey, company.id, a.provider, a.keyCipher);
        if (!plain) continue;
        await platformSaveAiAccount(this.db, person.uid, {
          provider: a.provider,
          plan: a.plan,
          keyCipher: encryptKey(masterKey, PLATFORM, a.provider, plain),
          keyHint: keyHint(plain),
          accountId: a.accountId,
          enabled: a.enabled,
        });
        moved++;
      }
    }
    return { moved, ...(await this.list()) };
  }

  /** The models behind one effort level, best first. */
  @Put('levels')
  async setLevel(@Person() person: VerifiedPerson, @Body() body: unknown) {
    const input = levelInput.safeParse(body);
    if (!input.success) throw badRequest('aiRulesInvalid');
    await platformSetAiLevel(this.db, person.uid, input.data.level, [...new Set(input.data.models)]);
    return this.list();
  }

  /** One AI task's effort level. */
  @Put('tasks')
  async setTask(@Person() person: VerifiedPerson, @Body() body: unknown) {
    const input = taskInput.safeParse(body);
    if (!input.success) throw badRequest('aiRulesInvalid');
    await platformSetAiTaskLevel(this.db, person.uid, input.data.feature, input.data.level);
    return this.list();
  }
}
