// The AI engine's rules and log, always behind the company wall (inside withCompany). The log never keeps what was
// sent to the AI or what it answered: only who, what for, which model, how much and how it went.
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { aiAccounts, aiCalls, type AiLimits, aiLimitsSeen, type AiReviewRules, aiSettings, teams } from './schema.js';

const thisCompany = sql<string>`app_company()`;

export interface AiRules {
  enabled: boolean;
  euOnly: boolean;
  allowedProviders: string[];
  allowPaid: boolean;
  limits: AiLimits;
  /** AI reviews (AutoQA): when the agents were told, and the channels */
  reviews: AiReviewRules;
}
/** A company that never changed them: AI on, any allowed AI company, free plans only, no monthly limit. */
export const DEFAULT_AI_RULES: AiRules = {
  enabled: true,
  euOnly: false,
  allowedProviders: [],
  allowPaid: false,
  limits: {},
  reviews: {},
};

export async function getAiRules(tx: Tx): Promise<AiRules> {
  const [row] = await tx.select().from(aiSettings);
  if (!row) return { ...DEFAULT_AI_RULES };
  const { companyId: _c, updatedAt: _u, ...rules } = row;
  return rules;
}

export async function saveAiRules(tx: Tx, change: Partial<AiRules>): Promise<void> {
  await tx
    .insert(aiSettings)
    .values({ companyId: thisCompany, ...DEFAULT_AI_RULES, ...change })
    .onConflictDoUpdate({ target: aiSettings.companyId, set: { ...change, updatedAt: sql`now()` } });
}

export type AiCallStatus =
  'ok' | 'invalid' | 'error' | 'timeout' | 'rateLimit' | 'off' | 'limit' | 'noModel' | 'unavailable';

export interface AiCall {
  teamId: string | null;
  byId: string | null;
  feature: string;
  dataClass: 'test' | 'client';
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  /** speech-to-text: the recording's length in seconds (optional: 0 for text jobs) */
  audioSeconds?: number;
  costMicroUsd: number;
  waitMs: number;
  status: AiCallStatus;
  attempt: number;
  error: string | null;
}
export interface AiCallRow extends AiCall {
  id: string;
  createdAt: Date;
}

export async function logAiCall(tx: Tx, call: AiCall): Promise<void> {
  await tx.insert(aiCalls).values({ companyId: thisCompany, ...call });
}

export async function listAiCalls(tx: Tx, limit = 200): Promise<AiCallRow[]> {
  const rows = await tx.select().from(aiCalls).orderBy(desc(aiCalls.createdAt)).limit(limit);
  return rows.map(({ companyId: _c, ...r }) => ({ ...r, dataClass: r.dataClass as AiCall['dataClass'] }) as AiCallRow);
}

export interface AiUse {
  microUsd: number;
  /** the calls that reached an AI model (answers, good or not) */
  calls: number;
}

/** What the company (or one team) used this calendar month (UTC), for the monthly limits. */
export async function aiUseThisMonth(tx: Tx, teamId?: string): Promise<AiUse> {
  const [row] = await tx
    .select({
      microUsd: sql<number>`coalesce(sum(${aiCalls.costMicroUsd}), 0)::float8`,
      calls: sql<number>`count(*) filter (where ${aiCalls.status} in ('ok', 'invalid'))::int`,
    })
    .from(aiCalls)
    .where(
      and(
        gte(aiCalls.createdAt, sql`date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'`),
        teamId ? eq(aiCalls.teamId, teamId) : undefined,
      ),
    );
  return { microUsd: row?.microUsd ?? 0, calls: row?.calls ?? 0 };
}

/** The team is this company's (behind the wall, another company's team is simply not there). */
export async function teamExists(tx: Tx, teamId: string): Promise<boolean> {
  const [row] = await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId));
  return !!row;
}

/** A company's account with an AI company, as stored: the key only encrypted, plus its last 4 characters. */
export interface StoredAiAccount {
  provider: string;
  plan: 'free' | 'paid';
  keyCipher: string;
  keyHint: string;
  accountId: string | null;
  enabled: boolean;
  byId: string | null;
  byName: string;
  updatedAt: Date;
}

export async function listAiAccounts(tx: Tx): Promise<StoredAiAccount[]> {
  const rows = await tx.select().from(aiAccounts).orderBy(aiAccounts.provider);
  return rows.map(({ companyId: _c, ...r }) => ({ ...r, plan: r.plan === 'paid' ? 'paid' : 'free' }));
}

export async function saveAiAccount(tx: Tx, account: Omit<StoredAiAccount, 'updatedAt'>): Promise<void> {
  const { provider: _p, ...change } = account;
  await tx
    .insert(aiAccounts)
    .values({ companyId: thisCompany, ...account })
    .onConflictDoUpdate({
      target: [aiAccounts.companyId, aiAccounts.provider],
      set: { ...change, updatedAt: sql`now()` },
    });
}

export async function deleteAiAccount(tx: Tx, provider: string): Promise<boolean> {
  const gone = await tx
    .delete(aiAccounts)
    .where(eq(aiAccounts.provider, provider))
    .returning({ provider: aiAccounts.provider });
  return gone.length > 0;
}

export interface AiUseRow extends AiUse {
  feature: string;
  teamId: string | null;
  provider: string | null;
}

/** This calendar month's use (UTC), per job type, team and AI company, for Admin › AI › AI usage limits. */
export async function aiUseSummary(tx: Tx): Promise<AiUseRow[]> {
  return tx
    .select({
      feature: aiCalls.feature,
      teamId: aiCalls.teamId,
      provider: aiCalls.provider,
      microUsd: sql<number>`coalesce(sum(${aiCalls.costMicroUsd}), 0)::float8`,
      calls: sql<number>`count(*) filter (where ${aiCalls.status} in ('ok', 'invalid'))::int`,
    })
    .from(aiCalls)
    .where(gte(aiCalls.createdAt, sql`date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'`))
    .groupBy(aiCalls.feature, aiCalls.teamId, aiCalls.provider);
}

export interface SeenLimits {
  provider: string;
  model: string;
  limits: Record<string, string>;
  seenAt: Date;
}

/** Keeps the latest figures an AI company sent about its limits for one model. */
export async function saveSeenLimits(
  tx: Tx,
  provider: string,
  model: string,
  limits: Record<string, string>,
): Promise<void> {
  await tx
    .insert(aiLimitsSeen)
    .values({ companyId: thisCompany, provider, model, limits })
    .onConflictDoUpdate({
      target: [aiLimitsSeen.companyId, aiLimitsSeen.provider, aiLimitsSeen.model],
      set: { limits, seenAt: sql`now()` },
    });
}

export async function listSeenLimits(tx: Tx): Promise<SeenLimits[]> {
  const rows = await tx.select().from(aiLimitsSeen).orderBy(aiLimitsSeen.provider, aiLimitsSeen.model);
  return rows.map(({ companyId: _c, ...r }) => r);
}

export interface AiUseToday {
  provider: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  audioSeconds: number;
}

/** What each model did since 00:00 UTC today (the AI companies' free days start then). */
export async function aiUseToday(tx: Tx): Promise<AiUseToday[]> {
  return tx
    .select({
      provider: sql<string>`coalesce(${aiCalls.provider}, '')`,
      model: sql<string>`coalesce(${aiCalls.model}, '')`,
      calls: sql<number>`count(*) filter (where ${aiCalls.status} in ('ok', 'invalid'))::int`,
      inputTokens: sql<number>`coalesce(sum(${aiCalls.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiCalls.outputTokens}), 0)::int`,
      audioSeconds: sql<number>`coalesce(sum(${aiCalls.audioSeconds}), 0)::int`,
    })
    .from(aiCalls)
    .where(
      and(
        gte(aiCalls.createdAt, sql`date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'`),
        sql`${aiCalls.provider} is not null`,
      ),
    )
    .groupBy(aiCalls.provider, aiCalls.model);
}

/** A model's use in the last minute, hour and 24 hours (for its free plan's limits), and its usual answer length. */
export interface AiUseWindow {
  minute: { requests: number; tokens: number; since: Date | null };
  hour: { audioSeconds: number; since: Date | null };
  day: { requests: number; tokens: number; audioSeconds: number; since: Date | null };
  /** the average answer length of its last good calls (null: none yet) */
  outputTokens: number | null;
}

/**
 * Counts the calls that reached the AI company (answered, unusable, failed or timed out; not the ones it refused as
 * "too many requests", nor the ones never sent). `since` is the oldest such call in each window: the window frees up
 * when it is a minute (an hour, a day) old.
 */
export async function aiUseWindow(tx: Tx, provider: string, model: string): Promise<AiUseWindow> {
  const sent = sql`${aiCalls.status} in ('ok', 'invalid', 'error', 'timeout')`;
  const inLast = (interval: string) => sql`${aiCalls.createdAt} > now() - ${sql.raw(`interval '${interval}'`)}`;
  const [row] = await tx
    .select({
      mReq: sql<number>`count(*) filter (where ${inLast('1 minute')})::int`,
      mTok: sql<number>`coalesce(sum(${aiCalls.inputTokens} + ${aiCalls.outputTokens}) filter (where ${inLast('1 minute')}), 0)::int`,
      mSince: sql<string | null>`min(${aiCalls.createdAt}) filter (where ${inLast('1 minute')})`,
      hAudio: sql<number>`coalesce(sum(${aiCalls.audioSeconds}) filter (where ${inLast('1 hour')}), 0)::int`,
      hSince: sql<string | null>`min(${aiCalls.createdAt}) filter (where ${inLast('1 hour')})`,
      dReq: sql<number>`count(*)::int`,
      dTok: sql<number>`coalesce(sum(${aiCalls.inputTokens} + ${aiCalls.outputTokens}), 0)::int`,
      dAudio: sql<number>`coalesce(sum(${aiCalls.audioSeconds}), 0)::int`,
      dSince: sql<string | null>`min(${aiCalls.createdAt})`,
    })
    .from(aiCalls)
    .where(and(eq(aiCalls.provider, provider), eq(aiCalls.model, model), sent, inLast('1 day')));
  const [out] = await tx
    .select({ avg: sql<number | null>`avg(t.output_tokens)::float8` })
    .from(
      sql`(select ${aiCalls.outputTokens} as output_tokens from ${aiCalls} where ${aiCalls.provider} = ${provider} and ${aiCalls.model} = ${model} and ${aiCalls.status} = 'ok' order by ${aiCalls.createdAt} desc limit 20) t`,
    );
  const date = (v: string | null | undefined) => (v ? new Date(v) : null);
  return {
    minute: { requests: row?.mReq ?? 0, tokens: row?.mTok ?? 0, since: date(row?.mSince) },
    hour: { audioSeconds: row?.hAudio ?? 0, since: date(row?.hSince) },
    day: {
      requests: row?.dReq ?? 0,
      tokens: row?.dTok ?? 0,
      audioSeconds: row?.dAudio ?? 0,
      since: date(row?.dSince),
    },
    outputTokens: out?.avg === null || out?.avg === undefined ? null : Math.round(out.avg),
  };
}

/** One AI task's use today (since 00:00 UTC): calls answered, calls that failed or were refused, tokens and cost. */
export interface AiTaskToday {
  feature: string;
  calls: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  audioSeconds: number;
  microUsd: number;
}
export async function aiUseByTaskToday(tx: Tx): Promise<AiTaskToday[]> {
  return tx
    .select({
      feature: aiCalls.feature,
      calls: sql<number>`count(*) filter (where ${aiCalls.status} in ('ok', 'invalid'))::int`,
      failed: sql<number>`count(*) filter (where ${aiCalls.status} not in ('ok', 'invalid'))::int`,
      inputTokens: sql<number>`coalesce(sum(${aiCalls.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiCalls.outputTokens}), 0)::int`,
      audioSeconds: sql<number>`coalesce(sum(${aiCalls.audioSeconds}), 0)::int`,
      microUsd: sql<number>`coalesce(sum(${aiCalls.costMicroUsd}), 0)::float8`,
    })
    .from(aiCalls)
    .where(gte(aiCalls.createdAt, sql`date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'`))
    .groupBy(aiCalls.feature)
    .orderBy(aiCalls.feature);
}

/** The latest calls that did not give a usable answer (errors, time-outs, refusals, limits), newest first. */
export async function listAiErrors(tx: Tx, limit = 20): Promise<AiCallRow[]> {
  const rows = await tx
    .select()
    .from(aiCalls)
    .where(sql`${aiCalls.status} <> 'ok'`)
    .orderBy(desc(aiCalls.createdAt))
    .limit(limit);
  return rows.map(({ companyId: _c, ...r }) => ({ ...r, dataClass: r.dataClass as AiCall['dataClass'] }) as AiCallRow);
}
