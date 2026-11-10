// Goals, improvement plans and kudos, always behind the company wall (inside withCompany). Who may see or change which
// is decided by the server (today's rules: staff read all; an agent their own goals and plans; everyone reads kudos).
import { and, desc, eq, or, type SQL, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { goals, improvementPlans, kudos, type PlanCheckIn, type PlanGoal } from './schema.js';

const thisCompany = sql<string>`app_company()`;

// ---- goals

export interface Goal {
  id: string;
  title: string;
  scope: 'all' | 'team' | 'agent';
  teamId: string | null;
  agentId: string | null;
  targetName: string;
  metric: 'avg' | 'pass' | 'reviews' | 'tasks' | 'csat' | 'kudos';
  value: number;
  channel: string;
  month: string;
  byId: string | null;
  byName: string;
  createdAt: Date;
  updatedAt: Date;
}
export type GoalInput = Pick<
  Goal,
  'title' | 'scope' | 'teamId' | 'agentId' | 'targetName' | 'metric' | 'value' | 'channel' | 'month'
>;
const stripGoal = ({ companyId: _c, ...g }: typeof goals.$inferSelect): Goal => g;

/** The goals an agent sees (the company's, their team's and their own), or every goal (null). */
export interface GoalReach {
  agentId: string;
  teamId: string | null;
}
const goalWhere = (reach: GoalReach | null): SQL | undefined =>
  reach
    ? or(
        eq(goals.scope, 'all'),
        reach.teamId ? and(eq(goals.scope, 'team'), eq(goals.teamId, reach.teamId)) : sql`false`,
        and(eq(goals.scope, 'agent'), eq(goals.agentId, reach.agentId)),
      )
    : undefined;

export async function listGoals(tx: Tx, reach: GoalReach | null, month?: string): Promise<Goal[]> {
  const rows = await tx
    .select()
    .from(goals)
    .where(and(goalWhere(reach), month ? eq(goals.month, month) : undefined))
    .orderBy(goals.month, goals.createdAt);
  return rows.map(stripGoal);
}

export async function getGoal(tx: Tx, id: string): Promise<Goal | undefined> {
  const [row] = await tx.select().from(goals).where(eq(goals.id, id));
  return row ? stripGoal(row) : undefined;
}

export async function addGoals(
  tx: Tx,
  list: GoalInput[],
  by: { byId: string | null; byName: string },
): Promise<string[]> {
  if (!list.length) return [];
  const rows = await tx
    .insert(goals)
    .values(list.map((g) => ({ companyId: thisCompany, ...g, ...by })))
    .returning({ id: goals.id });
  return rows.map((r) => r.id);
}

export async function updateGoal(tx: Tx, id: string, change: GoalInput): Promise<void> {
  await tx
    .update(goals)
    .set({ ...change, updatedAt: sql`now()` })
    .where(eq(goals.id, id));
}

export async function deleteGoal(tx: Tx, id: string): Promise<void> {
  await tx.delete(goals).where(eq(goals.id, id));
}

// ---- improvement plans

export interface ImprovementPlan {
  id: string;
  agentId: string | null;
  agentName: string;
  title: string;
  reason: string;
  startOn: string;
  endOn: string;
  goals: PlanGoal[];
  checkIns: PlanCheckIn[];
  status: 'active' | 'extended' | 'passed' | 'failed' | 'cancelled';
  signedAt: Date | null;
  agentNote: string;
  byId: string | null;
  byName: string;
  createdAt: Date;
  updatedAt: Date;
}
export type PlanInput = Pick<ImprovementPlan, 'title' | 'reason' | 'startOn' | 'endOn' | 'goals' | 'status'>;
export type PlanChange = Partial<PlanInput & Pick<ImprovementPlan, 'checkIns' | 'signedAt' | 'agentNote'>>;
const stripPlan = ({ companyId: _c, ...p }: typeof improvementPlans.$inferSelect): ImprovementPlan => p;

/** An agent's own plans (their membership), or every plan (null). */
export async function listPlans(tx: Tx, agentId: string | null): Promise<ImprovementPlan[]> {
  const rows = await tx
    .select()
    .from(improvementPlans)
    .where(agentId ? eq(improvementPlans.agentId, agentId) : undefined)
    .orderBy(desc(improvementPlans.createdAt));
  return rows.map(stripPlan);
}

export async function getPlan(tx: Tx, id: string): Promise<ImprovementPlan | undefined> {
  const [row] = await tx.select().from(improvementPlans).where(eq(improvementPlans.id, id));
  return row ? stripPlan(row) : undefined;
}

export async function addPlan(
  tx: Tx,
  plan: PlanInput & { agentId: string; agentName: string; byId: string | null; byName: string },
): Promise<string> {
  const [row] = await tx
    .insert(improvementPlans)
    .values({ companyId: thisCompany, ...plan })
    .returning({ id: improvementPlans.id });
  if (!row) throw new Error('The plan was not saved.');
  return row.id;
}

export async function updatePlan(tx: Tx, id: string, change: PlanChange): Promise<void> {
  await tx
    .update(improvementPlans)
    .set({ ...change, updatedAt: sql`now()` })
    .where(eq(improvementPlans.id, id));
}

export async function deletePlan(tx: Tx, id: string): Promise<void> {
  await tx.delete(improvementPlans).where(eq(improvementPlans.id, id));
}

// ---- kudos

export interface Kudos {
  id: string;
  toId: string | null;
  toName: string;
  badge: string;
  text: string;
  byId: string | null;
  byName: string;
  createdAt: Date;
}
const stripKudos = ({ companyId: _c, ...k }: typeof kudos.$inferSelect): Kudos => k;

/** Newest first; everyone in the company reads them (as today). */
export async function listKudos(tx: Tx): Promise<Kudos[]> {
  const rows = await tx.select().from(kudos).orderBy(desc(kudos.createdAt));
  return rows.map(stripKudos);
}

export async function getKudos(tx: Tx, id: string): Promise<Kudos | undefined> {
  const [row] = await tx.select().from(kudos).where(eq(kudos.id, id));
  return row ? stripKudos(row) : undefined;
}

export async function addKudos(tx: Tx, k: Omit<Kudos, 'id' | 'createdAt'>): Promise<string> {
  const [row] = await tx
    .insert(kudos)
    .values({ companyId: thisCompany, ...k })
    .returning({ id: kudos.id });
  if (!row) throw new Error('The kudos were not saved.');
  return row.id;
}

export async function deleteKudos(tx: Tx, id: string): Promise<void> {
  await tx.delete(kudos).where(eq(kudos.id, id));
}
