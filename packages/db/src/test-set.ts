// AutoQA's test set, behind the company wall (inside withCompany): the made-up conversations, the expert's answers
// (the yardstick) and each AI model's runs. The demo company gets Q-smart's 36 conversations in English, Bulgarian and
// French, scored with its "Written Conversations" scorecard.
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import type { Db } from './client.js';
import type { Tx } from './company.js';
import { DEMO_COMPANY } from './seed.js';
import {
  aiTestItems,
  aiTestJobs,
  aiTestRuns,
  type AnsweredCategory,
  companies,
  scorecards,
  type TestJobStep,
} from './schema.js';

const thisCompany = sql<string>`app_company()`;

export interface TestItem {
  id: string;
  key: string;
  language: string;
  industry: string;
  title: string;
  channel: 'call' | 'chat' | 'email' | 'other';
  text: string;
  scorecardId: string;
  expected: AnsweredCategory[] | null;
  expectedScore: number | null;
  expectedBy: string | null;
  expectedAt: Date | null;
}
export interface TestRun {
  itemId: string;
  modelId: string;
  status: 'ok' | 'failed';
  answers: AnsweredCategory[] | null;
  score: number | null;
  waitMs: number;
  problem: string | null;
  createdAt: Date;
}

export async function listTestItems(tx: Tx): Promise<TestItem[]> {
  const rows = await tx.select().from(aiTestItems).orderBy(aiTestItems.key);
  return rows.map(({ companyId: _c, createdAt: _a, ...r }) => r as TestItem);
}

export async function getTestItem(tx: Tx, id: string): Promise<TestItem | undefined> {
  return (await listTestItems(tx)).find((i) => i.id === id);
}

export async function setExpected(
  tx: Tx,
  id: string,
  expected: AnsweredCategory[],
  score: number | null,
  by: string,
): Promise<void> {
  await tx
    .update(aiTestItems)
    .set({ expected, expectedScore: score, expectedBy: by, expectedAt: sql`now()` })
    .where(eq(aiTestItems.id, id));
}

export async function addTestRun(tx: Tx, run: Omit<TestRun, 'createdAt'>): Promise<void> {
  await tx.insert(aiTestRuns).values({ companyId: thisCompany, ...run });
}

/** The latest run of each model on each item. */
export async function latestTestRuns(tx: Tx): Promise<TestRun[]> {
  const rows = await tx
    .selectDistinctOn([aiTestRuns.itemId, aiTestRuns.modelId])
    .from(aiTestRuns)
    .orderBy(aiTestRuns.itemId, aiTestRuns.modelId, desc(aiTestRuns.createdAt));
  return rows.map(({ companyId: _c, id: _i, ...r }) => r as TestRun);
}

// ---------------------------------------------------------------------------------------------- runs (Phase 5)

export interface TestJob {
  id: string;
  state: 'running' | 'done' | 'stopped';
  steps: TestJobStep[];
  waitingUntil: Date | null;
  waitingFor: '' | 'busy' | 'daily';
  busy: Record<string, number>;
  byName: string;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
}
const job = ({ companyId: _c, ...j }: typeof aiTestJobs.$inferSelect): TestJob => j as TestJob;

/** The company's newest run (running or not), or undefined. */
export async function latestTestJob(tx: Tx): Promise<TestJob | undefined> {
  const [row] = await tx.select().from(aiTestJobs).orderBy(desc(aiTestJobs.createdAt)).limit(1);
  return row ? job(row) : undefined;
}
export async function runningTestJob(tx: Tx): Promise<TestJob | undefined> {
  const [row] = await tx.select().from(aiTestJobs).where(eq(aiTestJobs.state, 'running')).limit(1);
  return row ? job(row) : undefined;
}
export async function addTestJob(tx: Tx, steps: TestJobStep[], byName: string): Promise<string> {
  const [row] = await tx
    .insert(aiTestJobs)
    .values({ companyId: thisCompany, steps, byName })
    .returning({ id: aiTestJobs.id });
  if (!row) throw new Error('The run was not saved.');
  return row.id;
}
export async function updateTestJob(
  tx: Tx,
  id: string,
  change: Partial<Pick<TestJob, 'state' | 'steps' | 'waitingUntil' | 'waitingFor' | 'busy' | 'finishedAt'>>,
): Promise<void> {
  await tx
    .update(aiTestJobs)
    .set({ ...change, updatedAt: sql`now()` })
    .where(eq(aiTestJobs.id, id));
}

interface DemoTestItem {
  key: string;
  language: string;
  industry: string;
  title: string;
  channel: TestItem['channel'];
  text: string;
}
/** The file with Q-smart's test set (packages/db/demo/autoqa-test-set.json). */
export const demoTestSet = (): DemoTestItem[] =>
  JSON.parse(readFileSync(new URL('../demo/autoqa-test-set.json', import.meta.url), 'utf8')) as DemoTestItem[];

/**
 * Adds Q-smart's test set to the demo company, once per conversation (by its key), with the demo's "Written
 * Conversations" scorecard. Returns how many were added. Runs as qsmart_owner, like the rest of the demo seed.
 */
export async function seedAutoqaTestSet(owner: Db): Promise<number> {
  return owner.transaction(async (tx) => {
    const [demo] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.name, DEMO_COMPANY));
    if (!demo) return 0;
    const [card] = await tx
      .select({ id: scorecards.id })
      .from(scorecards)
      .where(
        and(eq(scorecards.companyId, demo.id), eq(scorecards.name, 'Written Conversations - Chat, Email & Messaging')),
      );
    if (!card) return 0;
    const items = demoTestSet();
    const added = await tx
      .insert(aiTestItems)
      .values(items.map((i) => ({ companyId: demo.id, scorecardId: card.id, ...i })))
      .onConflictDoNothing()
      .returning({ id: aiTestItems.id });
    // a conversation nobody has scored yet follows the file (a better title or wording); a scored one never changes
    for (const i of items)
      await tx
        .update(aiTestItems)
        .set({ title: i.title, industry: i.industry, text: i.text, channel: i.channel })
        .where(and(eq(aiTestItems.companyId, demo.id), eq(aiTestItems.key, i.key), isNull(aiTestItems.expected)));
    return added.length;
  });
}
