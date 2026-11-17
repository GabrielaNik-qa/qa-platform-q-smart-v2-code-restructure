// The owner area's AI choices (17 November): which AI companies' models Q-smart offers to client companies, and the
// owner's recommended one. A model switched off here is never used by any company and isn't listed in their choices.
// Changed only through the database function platform_set_ai_offer, which checks again that this is the owner.
import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';
import { type Db, listAiOffers, platformSetAiOffer } from '@qsmart/db';
import { z } from 'zod';
import { CATALOGUE } from './ai/catalogue.js';
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

@Controller('platform/ai-models')
@UseGuards(SignedInGuard, PlatformGuard)
export class PlatformAiController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Every AI company and model in Q-smart's catalogue, with the owner's switches. */
  @Get()
  async list() {
    const offers = await listAiOffers(this.db);
    return {
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
}
