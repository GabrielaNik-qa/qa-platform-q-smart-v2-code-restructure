// The AI engine's rules and log, always behind the company wall (inside withCompany). The log never keeps what was
// sent to the AI or what it answered: only who, what for, which model, how much and how it went.
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { aiAccounts, aiCalls, type AiLimits, aiSettings, teams } from './schema.js';

const thisCompany = sql<string>`app_company()`;

export interface AiRules {
  enabled: boolean;
  euOnly: boolean;
  allowedProviders: string[];
  allowPaid: boolean;
  limits: AiLimits;
}
/** A company that never changed them: AI on, any allowed AI company, free plans only, no monthly limit. */
export const DEFAULT_AI_RULES: AiRules = {
  enabled: true,
  euOnly: false,
  allowedProviders: [],
  allowPaid: false,
  limits: {},
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
