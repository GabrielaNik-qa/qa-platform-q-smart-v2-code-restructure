// Quality set-up: scorecards, the categories library, root causes and pass rates, always behind the company wall
// (inside withCompany). The rules (who may, what is allowed) are checked by the server.
import type { Scope, ScorecardCategory, ScorecardQuestion } from '@qsmart/shared';
import { asc, eq, isNotNull, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { grouped } from './group.js';
import { membershipOfUser } from './people.js';
import {
  categoryLibrary,
  companies,
  rootCauses,
  scorecards,
  teams,
  workspaces,
  workspaceScorecards,
} from './schema.js';
import { ownWorkspaces } from './teams.js';

const thisCompany = sql<string>`app_company()`;

// ------------------------------------------------------------------------------------------------ scorecards

export interface Scorecard {
  id: string;
  name: string;
  description: string;
  tags: string[];
  categories: ScorecardCategory[];
  updatedAt: Date;
  /** the workspaces that use it */
  workspaceIds: string[];
}
export type ScorecardChange = Pick<Scorecard, 'name' | 'description' | 'tags' | 'categories'>;

export async function listScorecards(tx: Tx): Promise<Scorecard[]> {
  const rows = await tx
    .select({
      id: scorecards.id,
      name: scorecards.name,
      description: scorecards.description,
      tags: scorecards.tags,
      categories: scorecards.categories,
      updatedAt: scorecards.updatedAt,
    })
    .from(scorecards)
    .orderBy(asc(scorecards.createdAt), asc(scorecards.name));
  const links = grouped(
    await tx
      .select({ owner: workspaceScorecards.scorecardId, id: workspaceScorecards.workspaceId })
      .from(workspaceScorecards),
  );
  return rows.map((s) => ({ ...s, workspaceIds: links.get(s.id) ?? [] }));
}

/**
 * The scorecards a member may use, as today: all of them for admins and while the company has no workspaces;
 * otherwise those of their own workspaces (staff by name, agents through their team).
 */
export async function visibleScorecards(tx: Tx, userId: string, scope: Scope): Promise<Scorecard[]> {
  const all = await listScorecards(tx);
  if (scope === 'all') return all;
  const [anyWorkspace] = await tx.select({ id: workspaces.id }).from(workspaces).limit(1);
  if (!anyWorkspace) return all;
  const me = await membershipOfUser(tx, userId);
  const own = new Set(me ? await ownWorkspaces(tx, me) : []);
  return all.filter((s) => s.workspaceIds.some((w) => own.has(w)));
}

export async function addScorecard(tx: Tx, card: ScorecardChange, workspaceId?: string): Promise<string> {
  const [row] = await tx
    .insert(scorecards)
    .values({ companyId: thisCompany, ...card })
    .returning({ id: scorecards.id });
  if (!row) throw new Error('The scorecard was not saved.');
  if (workspaceId)
    await tx.insert(workspaceScorecards).values({ companyId: thisCompany, workspaceId, scorecardId: row.id });
  return row.id;
}

export async function updateScorecard(tx: Tx, id: string, card: ScorecardChange): Promise<void> {
  await tx
    .update(scorecards)
    .set({ ...card, updatedAt: sql`now()` })
    .where(eq(scorecards.id, id));
}

/** Reviews made with it keep their copy of it (as today). */
export async function deleteScorecard(tx: Tx, id: string): Promise<void> {
  await tx.delete(scorecards).where(eq(scorecards.id, id));
}

// ------------------------------------------------------------------------------------------------ the library

export interface LibraryCategory {
  id: string;
  name: string;
  description: string;
  critical: boolean;
  questions: ScorecardQuestion[];
  active: boolean;
}
export type LibraryChange = Omit<LibraryCategory, 'id'>;

export async function listLibrary(tx: Tx): Promise<LibraryCategory[]> {
  return tx
    .select({
      id: categoryLibrary.id,
      name: categoryLibrary.name,
      description: categoryLibrary.description,
      critical: categoryLibrary.critical,
      questions: categoryLibrary.questions,
      active: categoryLibrary.active,
    })
    .from(categoryLibrary)
    .orderBy(asc(categoryLibrary.createdAt));
}

export async function addLibraryCategory(tx: Tx, category: LibraryChange): Promise<string> {
  const [row] = await tx
    .insert(categoryLibrary)
    .values({ companyId: thisCompany, ...category })
    .returning({ id: categoryLibrary.id });
  if (!row) throw new Error('The category was not saved.');
  return row.id;
}

export async function updateLibraryCategory(tx: Tx, id: string, category: LibraryChange): Promise<void> {
  await tx.update(categoryLibrary).set(category).where(eq(categoryLibrary.id, id));
}

/** Scorecards that already use a copy of it keep it (as today). */
export async function deleteLibraryCategory(tx: Tx, id: string): Promise<void> {
  await tx.delete(categoryLibrary).where(eq(categoryLibrary.id, id));
}

// ------------------------------------------------------------------------------------------------ root causes

export interface RootCause {
  id: string;
  name: string;
  description: string;
  active: boolean;
}
export type RootCauseChange = Omit<RootCause, 'id'>;

export async function listRootCauses(tx: Tx): Promise<RootCause[]> {
  return tx
    .select({
      id: rootCauses.id,
      name: rootCauses.name,
      description: rootCauses.description,
      active: rootCauses.active,
    })
    .from(rootCauses)
    .orderBy(asc(rootCauses.createdAt));
}

export async function addRootCause(tx: Tx, cause: RootCauseChange): Promise<string> {
  const [row] = await tx
    .insert(rootCauses)
    .values({ companyId: thisCompany, ...cause })
    .returning({ id: rootCauses.id });
  if (!row) throw new Error('The root cause was not saved.');
  return row.id;
}

export async function updateRootCause(tx: Tx, id: string, cause: RootCauseChange): Promise<void> {
  await tx.update(rootCauses).set(cause).where(eq(rootCauses.id, id));
}

/** Reviews that used it keep the text (as today). */
export async function deleteRootCause(tx: Tx, id: string): Promise<void> {
  await tx.delete(rootCauses).where(eq(rootCauses.id, id));
}

// ------------------------------------------------------------------------------------------------ pass rates

export interface PassRates {
  /** the company's: a review passes at this score or above */
  general: number;
  /** a team's own, where it has one */
  teams: Record<string, number>;
}

export async function passRates(tx: Tx): Promise<PassRates> {
  const [company] = await tx.select({ passRate: companies.passRate }).from(companies);
  const own = await tx.select({ id: teams.id, passRate: teams.passRate }).from(teams).where(isNotNull(teams.passRate));
  return {
    general: company?.passRate ?? 85,
    teams: Object.fromEntries(own.map((t) => [t.id, t.passRate ?? 0])),
  };
}

/** The teams not named get no pass rate of their own (they follow the company's). */
export async function setPassRates(tx: Tx, rates: PassRates): Promise<void> {
  await tx.update(companies).set({ passRate: rates.general }).where(eq(companies.id, thisCompany));
  await tx.update(teams).set({ passRate: null }).where(isNotNull(teams.passRate));
  for (const [teamId, rate] of Object.entries(rates.teams))
    await tx.update(teams).set({ passRate: rate }).where(eq(teams.id, teamId));
}
