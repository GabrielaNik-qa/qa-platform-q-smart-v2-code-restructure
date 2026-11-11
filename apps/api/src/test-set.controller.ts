// AutoQA's test set (V2_PLAN §7, "the quality check"; Phase 3b, step 6): a QA expert scores made-up conversations
// once, and their answers become the yardstick. Each AI model runs on them; per model the page shows how often it gave
// the expert's answer (overall and per language), how far its scores are from the expert's, how long it takes and how
// often it fails. A model is used for AI reviews only if it agrees on at least 75% of the questions once tested on at
// least 20 scored conversations (until a model is, the bar doesn't apply).
import { Body, Controller, Get, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  addTestRun,
  type AnsweredCategory,
  type Db,
  getTestItem,
  latestTestRuns,
  listScorecards,
  listTestItems,
  logActivity,
  type Membership,
  setExpected,
  type TestItem,
  type TestRun,
  type Tx,
  withCompany,
} from '@qsmart/db';
import { ANSWERS, comparedQuestions, type ScorecardCategory, scoreReview, ScoringError } from '@qsmart/shared';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { AUTOQA_MODELS, autoqaJob } from './ai/autoqa.js';
import { CATALOGUE } from './ai/catalogue.js';
import { AiError, type AiEngine } from './ai/engine.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership } from './decorators.js';
import { badRequest, notFound } from './errors.js';
import { AI_ENGINE, DB } from './tokens.js';

/** A model must be tested on this many of the expert's conversations before its result counts. */
export const TEST_SET_MIN_ITEMS = 20;
export const TEST_SET_BAR = 75;
const ANSWER = { yes: 'y', no: 'n', na: 'na' } as const;

const snapshot = (categories: ScorecardCategory[], answers: ('y' | 'n' | 'na')[][]): AnsweredCategory[] =>
  categories.map((c, ci) => ({
    name: c.name,
    questions: c.questions.map((q, qi) => ({ text: q.text, answer: answers[ci]?.[qi] ?? 'na' })),
  }));

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
    const ready = await withCompany(this.db, membership.companyId, async (tx) => {
      const item = await getTestItem(tx, id);
      if (!item) throw notFound('conversationNotFound');
      const card = (await listScorecards(tx)).find((c) => c.id === item.scorecardId);
      if (!card) throw badRequest('reviewScorecard');
      return { item, card };
    });
    const job = autoqaJob({
      categories: ready.card.categories,
      transcript: ready.item.text,
      details: [{ name: 'channel', value: ready.item.channel }],
      language: 'en',
    });
    const started = Date.now();
    let run: Omit<TestRun, 'createdAt'>;
    try {
      const result = await this.engine.run({
        type: job.type,
        companyId: membership.companyId,
        dataClass: 'test',
        onlyModel: input.data.modelId,
        system: job.system,
        prompt: job.prompt,
      });
      const byId = new Map(result.data.answers.map((a) => [a.id, a]));
      const answers = ready.card.categories.map((c, ci) =>
        c.questions.map((_, qi) => ANSWER[byId.get(`c${ci + 1}q${qi + 1}`)?.answer ?? 'no']),
      );
      const scored = scoreReview(
        ready.card.categories,
        answers.map((row) => row.map((answer) => ({ answer }))),
      );
      run = {
        itemId: id,
        modelId: input.data.modelId,
        status: 'ok',
        answers: snapshot(ready.card.categories, answers),
        score: scored.score,
        waitMs: Date.now() - started,
        problem: result.data.injection ? 'injection' : null,
      };
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      // the free plan's limit for now ("too many requests", or resting after it): not the model's fault, nothing
      // is kept; the page waits and tries again
      if (e.code === 'aiUnavailable' && (e.detail === 'http429' || e.detail === 'resting')) return { status: 'busy' };
      run = {
        itemId: id,
        modelId: input.data.modelId,
        status: 'failed',
        answers: null,
        score: null,
        waitMs: Date.now() - started,
        problem: `${e.code}${e.detail ? `: ${e.detail}` : ''}`.slice(0, 120),
      };
    }
    await withCompany(this.db, membership.companyId, (tx) => addTestRun(tx, run));
    return { status: run.status, score: run.score, problem: run.problem };
  }
}
