// Quality set-up (Admin › Setup › Quality set-up), with today's rules:
// - scorecards: everyone reads those of their own workspaces (admins: all); only admins change them; the points add up
//   to exactly 100; at least one scorecard remains; reviews keep their copy of a scorecard, so editing never changes them;
// - the categories library: only admins change it; scorecards that copied a category keep their copy;
// - root causes (why a question was answered No): admins and reviewers change them;
// - pass rates: the company's (85 by default) and a team's own; only admins change them.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  addLibraryCategory,
  addRootCause,
  addScorecard,
  type Db,
  deleteLibraryCategory,
  deleteRootCause,
  deleteScorecard,
  listLibrary,
  listRootCauses,
  listScorecards,
  listTeams,
  listWorkspaces,
  logActivity,
  type Membership,
  passRates,
  setPassRates,
  updateLibraryCategory,
  updateRootCause,
  updateScorecard,
  visibleScorecards,
  withCompany,
} from '@qsmart/db';
import { type Scope, totalPoints } from '@qsmart/shared';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, CurrentScope } from './decorators.js';
import { badRequest, conflict, notFound } from './errors.js';
import { DB } from './tokens.js';

const idParam = z.uuid();
const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;

const question = z.object({
  text: z.string().trim().min(1).max(300),
  points: z.number().int().min(0).max(100),
  critical: z.boolean().default(false),
  compliance: z.boolean().default(false),
  /** the company's guidance for AutoQA on how to judge this question */
  aiGuide: z.string().trim().max(500).optional(),
});
const category = z.object({
  name: z.string().trim().min(1).max(80),
  critical: z.boolean().default(false),
  questions: z.array(question).min(1).max(30),
});
const tags = z
  .array(z.string().trim().min(1).max(30))
  .max(12)
  .default([])
  .transform((list) => list.filter((t, i) => list.findIndex((x) => same(x, t)) === i));
const scorecardInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).default(''),
  tags,
  categories: z.array(category).min(1).max(20),
  /** for a new scorecard: the workspace it goes into (the first one when not given) */
  workspaceId: z.uuid().optional(),
});
const libraryInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(''),
  critical: z.boolean().default(false),
  questions: z.array(question).min(1).max(30),
  active: z.boolean().default(true),
});
const rootCauseInput = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).default(''),
  active: z.boolean().default(true),
});
const rate = z.number().int().min(1).max(100);
const passRatesInput = z.object({ general: rate, teams: z.record(z.uuid(), rate).default({}) });

/** Reads a scorecard and checks today's rule that its points add up to exactly 100. */
function checkScorecard(body: unknown) {
  const input = scorecardInput.safeParse(body);
  if (!input.success) throw badRequest('scorecardInvalid');
  if (totalPoints(input.data.categories) !== 100) throw badRequest('scorecardTotal');
  return input.data;
}

@Controller('scorecards')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class ScorecardsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('scorecards.read')
  list(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope) {
    return withCompany(this.db, membership.companyId, (tx) => visibleScorecards(tx, membership.userId, scope));
  }

  @Post()
  @Allow('scorecards.write')
  async add(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const { workspaceId, ...card } = checkScorecard(body);
    return withCompany(this.db, membership.companyId, async (tx) => {
      const workspaces = await listWorkspaces(tx);
      const into = workspaces.find((w) => w.id === workspaceId) ?? workspaces[0];
      const id = await addScorecard(tx, card, into?.id);
      await logActivity(tx, actorOf(membership), { action: 'scorecardAdded', targetName: card.name });
      return (await listScorecards(tx)).find((s) => s.id === id);
    });
  }

  @Put(':id')
  @Allow('scorecards.write')
  async change(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const target = idParam.safeParse(id);
    if (!target.success) throw badRequest('scorecardInvalid');
    const { workspaceId: _ignored, ...card } = checkScorecard(body);
    return withCompany(this.db, membership.companyId, async (tx) => {
      if (!(await listScorecards(tx)).some((s) => s.id === target.data)) throw notFound('scorecardNotFound');
      await updateScorecard(tx, target.data, card);
      await logActivity(tx, actorOf(membership), { action: 'scorecardEdited', targetName: card.name });
      return (await listScorecards(tx)).find((s) => s.id === target.data);
    });
  }

  @Delete(':id')
  @Allow('scorecards.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw badRequest('nothingToDelete');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const all = await listScorecards(tx);
      const card = all.find((s) => s.id === target.data);
      if (!card) throw notFound('scorecardNotFound');
      if (all.length <= 1) throw badRequest('lastScorecard');
      await deleteScorecard(tx, card.id);
      await logActivity(tx, actorOf(membership), { action: 'scorecardDeleted', targetName: card.name });
    });
  }
}

@Controller('category-library')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class LibraryController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('scorecards.read')
  list(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, (tx) => listLibrary(tx));
  }

  @Post()
  @Allow('scorecards.write')
  async add(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = libraryInput.safeParse(body);
    if (!input.success) throw badRequest('categoryInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const id = await addLibraryCategory(tx, input.data);
      await logActivity(tx, actorOf(membership), { action: 'libraryAdded', targetName: input.data.name });
      return (await listLibrary(tx)).find((c) => c.id === id);
    });
  }

  @Put(':id')
  @Allow('scorecards.write')
  async change(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const target = idParam.safeParse(id);
    const input = libraryInput.safeParse(body);
    if (!target.success || !input.success) throw badRequest('categoryInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      if (!(await listLibrary(tx)).some((c) => c.id === target.data)) throw notFound('categoryNotFound');
      await updateLibraryCategory(tx, target.data, input.data);
      await logActivity(tx, actorOf(membership), { action: 'libraryEdited', targetName: input.data.name });
      return (await listLibrary(tx)).find((c) => c.id === target.data);
    });
  }

  @Delete(':id')
  @Allow('scorecards.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw badRequest('nothingToDelete');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const category = (await listLibrary(tx)).find((c) => c.id === target.data);
      if (!category) throw notFound('categoryNotFound');
      await deleteLibraryCategory(tx, category.id);
      await logActivity(tx, actorOf(membership), { action: 'libraryDeleted', targetName: category.name });
    });
  }
}

@Controller('root-causes')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class RootCausesController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('scorecards.read')
  list(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, (tx) => listRootCauses(tx));
  }

  @Post()
  @Allow('rootCauses.write')
  async add(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = rootCauseInput.safeParse(body);
    if (!input.success) throw badRequest('rootCauseInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      if ((await listRootCauses(tx)).some((c) => same(c.name, input.data.name))) throw conflict('rootCauseExists');
      const id = await addRootCause(tx, input.data);
      await logActivity(tx, actorOf(membership), { action: 'rootCauseAdded', targetName: input.data.name });
      return (await listRootCauses(tx)).find((c) => c.id === id);
    });
  }

  @Put(':id')
  @Allow('rootCauses.write')
  async change(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const target = idParam.safeParse(id);
    const input = rootCauseInput.safeParse(body);
    if (!target.success || !input.success) throw badRequest('rootCauseInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const all = await listRootCauses(tx);
      if (!all.some((c) => c.id === target.data)) throw notFound('rootCauseNotFound');
      if (all.some((c) => c.id !== target.data && same(c.name, input.data.name))) throw conflict('rootCauseExists');
      await updateRootCause(tx, target.data, input.data);
      await logActivity(tx, actorOf(membership), { action: 'rootCauseEdited', targetName: input.data.name });
      return (await listRootCauses(tx)).find((c) => c.id === target.data);
    });
  }

  @Delete(':id')
  @Allow('rootCauses.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw badRequest('nothingToDelete');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const cause = (await listRootCauses(tx)).find((c) => c.id === target.data);
      if (!cause) throw notFound('rootCauseNotFound');
      await deleteRootCause(tx, cause.id);
      await logActivity(tx, actorOf(membership), { action: 'rootCauseDeleted', targetName: cause.name });
    });
  }
}

@Controller('pass-rates')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class PassRatesController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Everyone reads them: every review shows whether it passed. */
  @Get()
  @Allow('people.read')
  get(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, (tx) => passRates(tx));
  }

  @Put()
  @Allow('settings.write')
  async set(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = passRatesInput.safeParse(body);
    if (!input.success) throw badRequest('passRateInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const working = new Set((await listTeams(tx)).filter((t) => !t.isAdministration).map((t) => t.id));
      const teams = Object.fromEntries(Object.entries(input.data.teams).filter(([id]) => working.has(id)));
      await setPassRates(tx, { general: input.data.general, teams });
      await logActivity(tx, actorOf(membership), {
        action: 'passRates',
        details: { general: String(input.data.general) },
      });
      return passRates(tx);
    });
  }
}
