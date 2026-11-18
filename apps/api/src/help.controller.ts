// Help inside the app and the Tools (Phase 6, piece 4; today's Help Center pages and Learning › Tools):
// - the FAQ, the glossary, the video tutorials, the guided tours and the call scripts: staff (admins, reviewers, team
//   leads, trainers) write them, everybody reads them; a tour can be for one role only;
// - Q-smart's own starter glossary and tours, in the language of the person who adds them;
// - the translator: a text into another language through the AI engine (counted in the AI allowance).
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  addHelp,
  type Db,
  deleteHelp,
  getHelp,
  type HelpInput,
  isDemoCompany,
  listHelp,
  logActivity,
  type Membership,
  membershipOfUser,
  updateHelp,
  withCompany,
} from '@qsmart/db';
import { can, HELP_KINDS, isSecureLink, LANGUAGES, starterGlossary, starterTours, TOUR_ROLES } from '@qsmart/shared';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { AiError, type AiEngine } from './ai/engine.js';
import { TRANSLATE, TRANSLATE_TO, type TranslateTo, translatePrompt } from './ai/learning.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership } from './decorators.js';
import { badRequest, notFound } from './errors.js';
import { AI_ENGINE, DB } from './tokens.js';

const id = z.uuid();
const step = z.object({
  title: z.string().trim().max(200).default(''),
  text: z.string().trim().max(1500).default(''),
  // a page of the menu, such as quality/reviews
  page: z
    .string()
    .trim()
    .regex(/^([a-z0-9-]+\/[a-z0-9-]+)?$/)
    .default(''),
});
const itemInput = z
  .object({
    kind: z.enum(HELP_KINDS),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().max(8000).default(''),
    topic: z.string().trim().max(60).default(''),
    link: z.string().trim().max(500).default(''),
    minutes: z.number().int().min(1).max(600).nullable().default(null),
    role: z.enum(TOUR_ROLES).default('all'),
    page: z
      .string()
      .trim()
      .regex(/^([a-z0-9-]+\/[a-z0-9-]+)?$/)
      .default(''),
    steps: z.array(step).max(40).default([]),
  })
  .strict();

/** What each kind needs, and what it does not use (so a stray field is never kept). */
function cleanItem(raw: z.infer<typeof itemInput>): HelpInput | null {
  const base: HelpInput = {
    kind: raw.kind,
    title: raw.title,
    body: '',
    topic: '',
    link: '',
    minutes: null,
    role: 'all',
    page: '',
    steps: [],
  };
  switch (raw.kind) {
    case 'faq':
      return raw.body ? { ...base, body: raw.body, topic: raw.topic, page: raw.page } : null;
    case 'glossary':
      return raw.body ? { ...base, body: raw.body } : null;
    case 'video':
      return isSecureLink(raw.link)
        ? { ...base, link: raw.link, topic: raw.topic, minutes: raw.minutes, body: raw.body }
        : null;
    case 'tour': {
      const steps = raw.steps.filter((s) => s.title && s.page);
      return steps.length ? { ...base, role: raw.role, steps } : null;
    }
    case 'script': {
      const steps = raw.steps.filter((s) => s.title).map((s) => ({ ...s, page: '' }));
      return { ...base, body: raw.body, steps };
    }
  }
}

@Controller('help')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class HelpController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Everything; a tour for one role is shown to that role and to staff (who write the tours). */
  @Get()
  @Allow('learning.read')
  list(@CurrentMembership() membership: Membership) {
    const staff = can(membership.role, 'learning.write');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const items = await listHelp(tx);
      return {
        staff,
        items: items.filter((x) => x.kind !== 'tour' || staff || x.role === 'all' || x.role === membership.role),
      };
    });
  }

  @Post()
  @Allow('learning.write')
  async add(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const parsed = itemInput.safeParse(body);
    const item = parsed.success ? cleanItem(parsed.data) : null;
    if (!item) throw badRequest('helpInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const itemId = await addHelp(tx, item, membership.userName);
      await logActivity(tx, actorOf(membership), { action: 'helpAdded', targetName: item.title });
      return { id: itemId };
    });
  }

  @Put(':id')
  @Allow('learning.write')
  async change(@CurrentMembership() membership: Membership, @Param('id') itemId: string, @Body() body: unknown) {
    const parsed = itemInput.safeParse(body);
    if (!parsed.success || !id.safeParse(itemId).success) throw badRequest('helpInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const before = await getHelp(tx, itemId);
      if (!before) throw notFound('helpNotFound');
      // the kind never changes: what was a FAQ stays one
      const item = cleanItem({ ...parsed.data, kind: before.kind as (typeof HELP_KINDS)[number] });
      if (!item) throw badRequest('helpInvalid');
      const { kind: _kind, ...changes } = item;
      await updateHelp(tx, itemId, changes);
      await logActivity(tx, actorOf(membership), { action: 'helpChanged', targetName: item.title });
      return { id: itemId };
    });
  }

  @Delete(':id')
  @Allow('learning.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') itemId: string) {
    if (!id.safeParse(itemId).success) throw notFound('helpNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const item = await getHelp(tx, itemId);
      if (!item) throw notFound('helpNotFound');
      await deleteHelp(tx, itemId);
      await logActivity(tx, actorOf(membership), { action: 'helpDeleted', targetName: item.title });
    });
  }

  /** Q-smart's own glossary or tours, added once (only while the company has none), in the asked language. */
  @Post('starter')
  @Allow('learning.write')
  @HttpCode(200)
  async starter(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const parsed = z
      .object({ kind: z.enum(['glossary', 'tour']), language: z.enum(LANGUAGES) })
      .strict()
      .safeParse(body);
    if (!parsed.success) throw badRequest('helpInvalid');
    const { kind, language } = parsed.data;
    return withCompany(this.db, membership.companyId, async (tx) => {
      if ((await listHelp(tx)).some((x) => x.kind === kind)) return { added: 0 };
      const base = { topic: '', link: '', minutes: null, page: '' };
      const list: HelpInput[] =
        kind === 'glossary'
          ? starterGlossary(language).map((g) => ({
              ...base,
              kind,
              title: g.title,
              body: g.body,
              role: 'all',
              steps: [],
            }))
          : starterTours(language).map((x) => ({
              ...base,
              kind,
              title: x.title,
              body: '',
              role: x.role,
              steps: x.steps,
            }));
      for (const x of list) await addHelp(tx, x, membership.userName);
      await logActivity(tx, actorOf(membership), { action: 'helpAdded', targetName: kind });
      return { added: list.length };
    });
  }
}

@Controller('tools')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class ToolsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AI_ENGINE) private readonly engine: AiEngine,
  ) {}

  /** Translates a text into another language through the AI engine (the transcript is only sent, never kept). */
  @Post('translate')
  @Allow('learning.read')
  @HttpCode(200)
  async translate(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = z
      .object({ text: z.string().trim().min(1).max(12_000), to: z.enum(Object.keys(TRANSLATE_TO) as [TranslateTo]) })
      .strict()
      .safeParse(body);
    if (!input.success) throw badRequest('translateInvalid');
    const { companyId } = membership;
    const prepared = await withCompany(this.db, companyId, async (tx) => ({
      dataClass: (await isDemoCompany(tx)) ? ('test' as const) : ('client' as const),
      byId: (await membershipOfUser(tx, membership.userId))?.id ?? null,
    }));
    try {
      const result = await this.engine.run({
        companyId,
        dataClass: prepared.dataClass,
        byId: prepared.byId,
        type: TRANSLATE,
        system: translatePrompt(input.data.to),
        prompt: `<text>\n${input.data.text}\n</text>`,
      });
      return { translation: result.data.translation, from: result.data.from };
    } catch (e) {
      if (e instanceof AiError) throw badRequest(e.code, e.detail ? [e.detail] : undefined);
      throw e;
    }
  }
}
