// The owner area's AI choices (17 November): which AI companies' models Q-smart offers to client companies, and the
// owner's recommended one. A model switched off here is never used by any company and isn't listed in their choices.
// Changed only through the database function platform_set_ai_offer, which checks again that this is the owner.
import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';
import {
  type Db,
  listAiLevels,
  listAiOffers,
  platformSetAiLevel,
  platformSetAiOffer,
  platformSetAiTaskLevel,
} from '@qsmart/db';
import { z } from 'zod';
import { CATALOGUE } from './ai/catalogue.js';
import { AI_TASKS, DEFAULT_LEVELS, LEVELS, modelsFor } from './ai/levels.js';
import { PlatformGuard } from './auth/platform.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import type { VerifiedPerson } from './auth/token-verifier.js';
import { Person } from './decorators.js';
import { badRequest } from './errors.js';
import { DB } from './tokens.js';

const offerInput = z
  .object({
    modelId: z.enum(CATALOGUE.models.map((m) => m.id) as [string, ...string[]]),
    offered: z.boolean(),
    recommended: z.boolean().default(false),
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
  constructor(@Inject(DB) private readonly db: Db) {}

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
