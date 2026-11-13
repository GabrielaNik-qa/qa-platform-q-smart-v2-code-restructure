// The test-set run on the server (Phase 5, fixed from Phase 3b): the chosen models review the chosen conversations one
// at a time, so the run goes on when the page is closed. The rules:
// - each planned review is tried once; a failed one gets one more try at the end (its latest run counts);
// - a busy free plan ("too many requests") is waited for as long as the AI company asked, never skipped; meanwhile the
//   models of the other AI companies go on;
// - its daily limit: when the AI company asks for a wait of 10 minutes or more, or says "too many requests" 3 times in
//   a row without saying how long to wait, it is left alone that long (or 30 minutes, then an hour) and the page says
//   so; a short wait it asks for (Groq's per-minute limit) is never taken for the daily limit;
// - one run at a time per company. Each step happens behind the company's wall. After a server restart the run goes
//   on as soon as someone opens the test set again (the server never looks across companies' walls on its own).
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  addTestRun,
  type AnsweredCategory,
  type Db,
  getTestItem,
  listScorecards,
  runningTestJob,
  type TestRun,
  updateTestJob,
  withCompany,
} from '@qsmart/db';
import { type ScorecardCategory, scoreReview } from '@qsmart/shared';
import { autoqaJob } from './ai/autoqa.js';
import { CATALOGUE } from './ai/catalogue.js';
import { AiError, type AiEngine } from './ai/engine.js';
import { AI_ENGINE, DB } from './tokens.js';

const ANSWER = { yes: 'y', no: 'n', na: 'na' } as const;
const DAILY_AFTER = 3;
/** a wait the AI company asks for that is this long or longer: its daily limit */
const LONG_WAIT = 10 * 60_000;
export const providerOf = (modelId: string) => CATALOGUE.models.find((m) => m.id === modelId)?.provider ?? modelId;

export const snapshot = (categories: ScorecardCategory[], answers: ('y' | 'n' | 'na')[][]): AnsweredCategory[] =>
  categories.map((c, ci) => ({
    name: c.name,
    questions: c.questions.map((q, qi) => ({ text: q.text, answer: answers[ci]?.[qi] ?? 'na' })),
  }));

export type ReviewOutcome =
  | { status: 'ok' | 'failed'; score: number | null; problem: string | null }
  | {
      status: 'busy';
      retryMs: number | null;
    };

/** One model reviews one test conversation (as test data). A good or failed run is kept; a busy free plan isn't. */
export async function reviewTestItem(
  db: Db,
  engine: AiEngine,
  companyId: string,
  itemId: string,
  modelId: string,
): Promise<ReviewOutcome | null> {
  const ready = await withCompany(db, companyId, async (tx) => {
    const item = await getTestItem(tx, itemId);
    const card = item && (await listScorecards(tx)).find((c) => c.id === item.scorecardId);
    return item && card ? { item, card } : null;
  });
  if (!ready) return null;
  const job = autoqaJob({
    categories: ready.card.categories,
    transcript: ready.item.text,
    details: [{ name: 'channel', value: ready.item.channel }],
    language: 'en',
  });
  const started = Date.now();
  let run: Omit<TestRun, 'createdAt'>;
  try {
    const result = await engine.run({
      type: job.type,
      companyId,
      dataClass: 'test',
      onlyModel: modelId,
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
      itemId,
      modelId,
      status: 'ok',
      answers: snapshot(ready.card.categories, answers),
      score: scored.score,
      waitMs: Date.now() - started,
      problem: result.data.injection ? 'injection' : null,
    };
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    // the free plan's limit ("too many requests", or resting after it): not the model's fault, nothing is kept
    if (e.code === 'aiUnavailable' && (e.detail === 'http429' || e.detail === 'resting'))
      return { status: 'busy', retryMs: e.retryAfterMs ?? null };
    run = {
      itemId,
      modelId,
      status: 'failed',
      answers: null,
      score: null,
      waitMs: Date.now() - started,
      problem: `${e.code}${e.detail ? `: ${e.detail}` : ''}`.slice(0, 120),
    };
  }
  await withCompany(db, companyId, (tx) => addTestRun(tx, run));
  return { status: run.status, score: run.score, problem: run.problem };
}

@Injectable()
export class TestSetRunner implements OnModuleDestroy {
  /** the companies whose run is going on in this server now */
  private readonly going = new Set<string>();
  /** an AI company left alone after its daily limit seemed reached: company:provider → until (ms) */
  private readonly holds = new Map<string, number>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private closed = false;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AI_ENGINE) private readonly engine: AiEngine,
  ) {}

  onModuleDestroy() {
    this.closed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  /** Makes sure the company's running run goes on (after a start, or a server restart). */
  kick(companyId: string) {
    if (this.closed || this.going.has(companyId)) return;
    this.going.add(companyId);
    void this.loop(companyId).finally(() => this.going.delete(companyId));
  }

  /** How long until an AI company may be asked again (its rest after "too many requests", or the daily hold). */
  restLeft(companyId: string, provider: string) {
    const key = `${companyId}:${provider}`;
    return Math.max(this.engine.breaker.restLeft([key]), (this.holds.get(key) ?? 0) - Date.now(), 0);
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        this.timers.delete(t);
        resolve();
      }, ms);
      this.timers.add(t);
    });
  }

  private async loop(companyId: string) {
    let errors = 0;
    while (!this.closed) {
      let wait: number | null;
      try {
        wait = await this.step(companyId);
        errors = 0;
      } catch (e) {
        // a problem of ours (the database, say): wait and try again; after 5 in a row the run waits for the page
        console.error('The test-set run stopped for a moment:', e);
        if (++errors >= 5) return;
        wait = 30_000;
      }
      if (wait === null) return;
      await this.sleep(wait);
    }
  }

  /** One step of the company's run: one review, or the wait for a busy free plan. Null: nothing left to do. */
  async step(companyId: string): Promise<number | null> {
    const job = await withCompany(this.db, companyId, (tx) => runningTestJob(tx));
    if (!job) return null;
    // first every review not tried yet, then each failed one once more
    const order = [
      ...job.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.result === '' && s.tries === 0),
      ...job.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.result === 'failed' && s.tries === 1),
    ];
    if (!order.length) {
      await withCompany(this.db, companyId, (tx) =>
        updateTestJob(tx, job.id, { state: 'done', finishedAt: new Date(), waitingUntil: null, waitingFor: '' }),
      );
      return null;
    }
    const next = order.find(({ s }) => this.restLeft(companyId, providerOf(s.modelId)) === 0);
    if (!next) {
      // every AI company still needed is resting: wait for the first one to be free
      const waits = [...new Set(order.map(({ s }) => providerOf(s.modelId)))].map((p) => this.restLeft(companyId, p));
      const ms = Math.min(...waits);
      const daily = Object.values(job.busy).some((n) => n >= DAILY_AFTER);
      await withCompany(this.db, companyId, (tx) =>
        updateTestJob(tx, job.id, {
          waitingUntil: new Date(Date.now() + ms),
          waitingFor: daily ? 'daily' : 'busy',
        }),
      );
      return ms + 500;
    }
    const provider = providerOf(next.s.modelId);
    const outcome = await reviewTestItem(this.db, this.engine, companyId, next.s.itemId, next.s.modelId);
    // the run may have been stopped meanwhile: the review is kept, the run stays stopped
    const now = await withCompany(this.db, companyId, (tx) => runningTestJob(tx));
    if (!now || now.id !== job.id) return null;
    const steps = [...now.steps];
    const busy = { ...now.busy };
    const step = steps[next.i];
    if (!step) return 300;
    if (!outcome) {
      // the conversation or its scorecard is gone: nothing to try again
      steps[next.i] = { ...step, tries: 2, result: 'failed' };
    } else if (outcome.status === 'busy') {
      const key = `${companyId}:${provider}`;
      if (outcome.retryMs !== null && outcome.retryMs >= LONG_WAIT) {
        // it asked for a long wait itself: its daily limit
        busy[provider] = Math.max(busy[provider] ?? 0, DAILY_AFTER);
        this.holds.set(key, Date.now() + outcome.retryMs);
      } else if (outcome.retryMs === null) {
        // it didn't say how long: 3 in a row look like its daily limit
        busy[provider] = (busy[provider] ?? 0) + 1;
        if (busy[provider] >= DAILY_AFTER)
          this.holds.set(key, Date.now() + (busy[provider] > DAILY_AFTER ? 60 : 30) * 60_000);
      } else busy[provider] = 0; // a short wait it asked for: its per-minute limit, waited for
    } else {
      busy[provider] = 0;
      this.holds.delete(`${companyId}:${provider}`);
      steps[next.i] = { ...step, tries: step.tries + 1, result: outcome.status };
    }
    await withCompany(this.db, companyId, (tx) =>
      updateTestJob(tx, job.id, { steps, busy, waitingUntil: null, waitingFor: '' }),
    );
    return 300;
  }
}
