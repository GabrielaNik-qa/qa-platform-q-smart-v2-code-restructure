// AutoQA's test set (V2_PLAN §7, "the quality check"; Phase 3b, step 6): a QA expert scores made-up conversations
// once, and their answers become the yardstick. Each AI model runs on them; per model the page shows how often it gave
// the expert's answer (overall and per language), how far its scores are from the expert's, how long it takes and how
// often it fails. A model is used for AI reviews only if it agrees on at least 75% of the questions once tested on at
// least 20 scored conversations (until a model is, the bar doesn't apply).
// Since Phase 5 the models run on the server (test-set.runner.ts): the page starts a run, follows it and can stop it.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  addTestJob,
  type Db,
  getTestItem,
  latestTestJob,
  latestTestRuns,
  listScorecards,
  listTestItems,
  logActivity,
  type Membership,
  runningTestJob,
  setExpected,
  type TestItem,
  type TestJob,
  type TestRun,
  type Tx,
  updateTestJob,
  withCompany,
} from '@qsmart/db';
import { ANSWERS, comparedQuestions, scoreReview, ScoringError } from '@qsmart/shared';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { AUTOQA_MODELS } from './ai/autoqa.js';
import { CATALOGUE } from './ai/catalogue.js';
import type { AiEngine } from './ai/engine.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership } from './decorators.js';
import { badRequest, notFound } from './errors.js';
import { reviewTestItem, snapshot, TestSetRunner } from './test-set.runner.js';
import { AI_ENGINE, DB } from './tokens.js';

/** A model must be tested on this many of the expert's conversations before its result counts. */
export const TEST_SET_MIN_ITEMS = 20;
export const TEST_SET_BAR = 75;

interface ModelResult {
  id: string;
  name: string;
  provider: string;
  items: number;
  failed: number;
  score: number | null;
  byLanguage: Record<string, number | null>;
  /** how far its review scores are from the expert's, on average (percentage points) */
  scoreGap: number | null;
  waitMs: number | null;
  passes: boolean;
}

/** Each model's agreement with the expert, from its latest run on each scored conversation. */
export function testResults(items: TestItem[], runs: TestRun[]): ModelResult[] {
  return AUTOQA_MODELS.map((id) => {
    const model = CATALOGUE.models.find((m) => m.id === id);
    const mine = runs.filter((r) => r.modelId === id);
    const scored = mine.flatMap((r) => {
      const item = items.find((i) => i.id === r.itemId);
      return item?.expected && r.status === 'ok' && r.answers ? [{ item, run: r }] : [];
    });
    const tally = (list: typeof scored) => {
      let same = 0;
      let compared = 0;
      for (const { item, run } of list) {
        const qs = comparedQuestions({
          conversationId: item.id,
          scorecardId: item.scorecardId,
          scorecardName: '',
          model: id,
          language: item.language,
          day: '',
          ai: run.answers ?? [],
          human: item.expected ?? [],
        });
        compared += qs.length;
        same += qs.filter((q) => q.same).length;
      }
      return compared ? Math.round((same / compared) * 1000) / 10 : null;
    };
    const gaps = scored
      .filter(({ item, run }) => item.expectedScore !== null && run.score !== null)
      .map(({ item, run }) => Math.abs((run.score ?? 0) - (item.expectedScore ?? 0)));
    const waits = mine.filter((r) => r.status === 'ok').map((r) => r.waitMs);
    const score = tally(scored);
    return {
      id,
      name: model?.model ?? id,
      provider: model?.provider ?? '',
      items: scored.length,
      failed: mine.filter((r) => r.status === 'failed').length,
      score,
      byLanguage: Object.fromEntries(
        ['en', 'bg', 'fr'].map((l) => [l, tally(scored.filter((x) => x.item.language === l))]),
      ),
      scoreGap: gaps.length ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10 : null,
      waitMs: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
      passes: scored.length >= TEST_SET_MIN_ITEMS && score !== null && score >= TEST_SET_BAR,
    };
  });
}

/** For the AI engine: the models tested on enough of the expert's conversations, with their agreement. */
export async function autoqaQualities(tx: Tx, feature: string): Promise<Map<string, number>> {
  if (feature !== 'autoqa.score') return new Map();
  const results = testResults(await listTestItems(tx), await latestTestRuns(tx));
  return new Map(
    results.filter((r) => r.items >= TEST_SET_MIN_ITEMS && r.score !== null).map((r) => [r.id, r.score ?? 0]),
  );
}

const answersInput = z.object({ answers: z.array(z.array(z.enum(ANSWERS)).max(30)).max(20) }).strict();

@Controller('autoqa/test-set')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class TestSetController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AI_ENGINE) private readonly engine: AiEngine,
    @Inject(TestSetRunner) private readonly runner: TestSetRunner,
  ) {}

  @Get()
  @Allow('conversations.write')
  overview(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const items = await listTestItems(tx);
      const runs = await latestTestRuns(tx);
      const cards = await listScorecards(tx);
      return {
        minItems: TEST_SET_MIN_ITEMS,
        bar: TEST_SET_BAR,
        scored: items.filter((i) => i.expected).length,
        scorecards: cards
          .filter((c) => items.some((i) => i.scorecardId === c.id))
          .map((c) => ({ id: c.id, name: c.name, categories: c.categories })),
        items: items.map((i) => ({
          id: i.id,
          key: i.key,
          language: i.language,
          industry: i.industry,
          title: i.title,
          channel: i.channel,
          text: i.text,
          scorecardId: i.scorecardId,
          expected: i.expected,
          expectedScore: i.expectedScore,
          expectedBy: i.expectedBy,
          runs: Object.fromEntries(
            runs.filter((r) => r.itemId === i.id).map((r) => [r.modelId, r.status === 'ok' ? r.score : null]),
          ),
        })),
        models: testResults(items, runs),
      };
    });
  }

  /** The expert's answers for one conversation (the yardstick). */
  @Put(':id/expected')
  @Allow('conversations.write')
  async expected(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const input = answersInput.safeParse(body);
    if (!input.success || !z.uuid().safeParse(id).success) throw badRequest('reviewAnswers');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const item = await getTestItem(tx, id);
      if (!item) throw notFound('conversationNotFound');
      const card = (await listScorecards(tx)).find((c) => c.id === item.scorecardId);
      if (!card) throw badRequest('reviewScorecard');
      let score: number | null;
      try {
        score = scoreReview(
          card.categories,
          input.data.answers.map((row) => row.map((answer) => ({ answer }))),
        ).score;
      } catch (e) {
        if (e instanceof ScoringError) throw badRequest('reviewAnswers');
        throw e;
      }
      await setExpected(tx, id, snapshot(card.categories, input.data.answers), score, membership.userName);
      await logActivity(tx, actorOf(membership), { action: 'testSetScored', targetName: item.title });
      return { id, expectedScore: score };
    });
  }

  /** One model reviews one test conversation (as test data); the run is kept, good or failed. */
  @Post(':id/run')
  @Allow('conversations.write')
  async run(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const input = z
      .object({ modelId: z.enum(AUTOQA_MODELS as [string, ...string[]]) })
      .strict()
      .safeParse(body);
    if (!input.success || !z.uuid().safeParse(id).success) throw badRequest('aiRulesInvalid');
    const out = await reviewTestItem(this.db, this.engine, membership.companyId, id, input.data.modelId);
    if (!out) throw notFound('conversationNotFound');
    return out;
  }

  // ---------------------------------------------------------------------------------------------- runs (Phase 5)

  /**
   * Starts a run on the server: each chosen model reviews up to `perModel` of the scored conversations it hasn't
   * reviewed well yet (in the chosen language, or all), one model after another. It goes on when the page is closed.
   */
  @Post('jobs')
  @Allow('conversations.write')
  async start(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = z
      .object({
        modelIds: z
          .array(z.enum(AUTOQA_MODELS as [string, ...string[]]))
          .min(1)
          .max(AUTOQA_MODELS.length),
        language: z.enum(['', 'en', 'bg', 'fr']).default(''),
        perModel: z.number().int().min(1).max(200),
      })
      .strict()
      .safeParse(body);
    if (!input.success) throw badRequest('testJobInvalid');
    const out = await withCompany(this.db, membership.companyId, async (tx) => {
      if (await runningTestJob(tx)) throw badRequest('testJobRunning');
      const items = (await listTestItems(tx)).filter(
        (i) => i.expected && (!input.data.language || i.language === input.data.language),
      );
      const runs = await latestTestRuns(tx);
      const good = new Set(runs.filter((r) => r.status === 'ok').map((r) => `${r.itemId}|${r.modelId}`));
      const steps = [...new Set(input.data.modelIds)].flatMap((modelId) =>
        items
          .filter((i) => !good.has(`${i.id}|${modelId}`))
          .slice(0, input.data.perModel)
          .map((i) => ({ itemId: i.id, modelId, tries: 0, result: '' as const })),
      );
      if (!steps.length) throw badRequest('testJobNothing');
      const id = await addTestJob(tx, steps, membership.userName);
      await logActivity(tx, actorOf(membership), {
        action: 'testSetRunStarted',
        targetName: '',
        details: { reviews: String(steps.length) },
      });
      return { id, reviews: steps.length };
    });
    this.runner.kick(membership.companyId);
    return out;
  }

  /** Stops the running run (the reviews already done are kept). */
  @Post('jobs/stop')
  @HttpCode(200)
  @Allow('conversations.write')
  async stop(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const job = await runningTestJob(tx);
      if (job) await updateTestJob(tx, job.id, { state: 'stopped', finishedAt: new Date(), waitingUntil: null });
      return { stopped: !!job };
    });
  }

  /** The newest run, as the page shows it: how far it is, per model, and what it waits for. */
  private summary(job: TestJob | undefined) {
    if (!job) return null;
    const count = (list: TestJob['steps']) => ({
      total: list.length,
      done: list.filter((s) => s.result !== '').length,
      ok: list.filter((s) => s.result === 'ok').length,
      failed: list.filter((s) => s.result === 'failed').length,
      /** failed once, waiting for their second try */
      retry: list.filter((s) => s.result === 'failed' && s.tries === 1).length,
    });
    const models = [...new Set(job.steps.map((s) => s.modelId))];
    return {
      id: job.id,
      state: job.state,
      ...count(job.steps),
      models: models.map((m) => ({ id: m, ...count(job.steps.filter((s) => s.modelId === m)) })),
      waitingUntil: job.state === 'running' ? job.waitingUntil : null,
      waitingFor: job.state === 'running' ? job.waitingFor : '',
      waitingOn: Object.entries(job.busy)
        .filter(([, n]) => n > 0)
        .map(([p]) => CATALOGUE.providers[p as keyof typeof CATALOGUE.providers]?.name ?? p),
      byName: job.byName,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
    };
  }

  /** The newest run only (the page asks every few seconds while it runs). */
  @Get('jobs/latest')
  @Allow('conversations.write')
  async latest(@CurrentMembership() membership: Membership) {
    const job = await withCompany(this.db, membership.companyId, (tx) => latestTestJob(tx));
    if (job?.state === 'running') this.runner.kick(membership.companyId);
    return this.summary(job);
  }
}
