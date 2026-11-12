// Coaching sessions and one-to-ones, always behind the company wall (inside withCompany). Who may see, write or sign
// which session is decided by the server (today's rules: staff the sessions of their workspaces' agents, admins all,
// an agent their own).
import { desc, eq, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import type { ReviewScope } from './reviews.js';
import {
  coachingSessions,
  type LeadSignature,
  type OneToOneSection,
  oneToOneTargets,
  oneToOneTemplates,
  type SessionAction,
  type SessionAgent,
  type SessionSignature,
} from './schema.js';

const thisCompany = sql<string>`app_company()`;

export type SessionKind = 'coaching' | 'group' | 'training' | 'o2o';
export interface CoachingSession {
  id: string;
  kind: SessionKind;
  heldOn: string;
  title: string;
  status: 'planned' | 'done';
  agents: SessionAgent[];
  focus: string[];
  topics: string[];
  goals: string;
  notes: string;
  followUpOn: string | null;
  actions: SessionAction[];
  signatures: Record<string, SessionSignature>;
  /** a one-to-one's own parts (empty for coaching sessions) */
  templateId: string | null;
  period: 'week' | 'month' | 'year' | 'custom';
  periodFrom: string | null;
  periodTo: string | null;
  sections: OneToOneSection[];
  answers: Record<string, unknown>;
  state: '' | 'draft' | 'sent' | 'signed';
  leadSignature: LeadSignature | null;
  sentAt: Date | null;
  byId: string | null;
  byName: string;
  createdAt: Date;
  updatedAt: Date;
}
type OneToOneParts =
  'templateId' | 'period' | 'periodFrom' | 'periodTo' | 'sections' | 'answers' | 'state' | 'leadSignature' | 'sentAt';
export type SessionInput = Omit<
  CoachingSession,
  'id' | 'signatures' | 'byId' | 'byName' | 'createdAt' | 'updatedAt' | OneToOneParts
> &
  Partial<Pick<CoachingSession, OneToOneParts | 'signatures'>>;

const strip = ({ companyId: _c, ...s }: typeof coachingSessions.$inferSelect): CoachingSession =>
  ({
    ...s,
    period: s.period as CoachingSession['period'],
    state: s.state as CoachingSession['state'],
  }) as CoachingSession;

/** Whether a scope reaches a session: one of its agents in the scope's teams, or (an agent) one of its agents. */
export const sessionInReach = (s: Pick<CoachingSession, 'agents'>, scope: ReviewScope) =>
  'all' in scope ||
  ('agentId' in scope
    ? s.agents.some((a) => a.id === scope.agentId)
    : s.agents.some((a) => !!a.teamId && scope.teamIds.includes(a.teamId)));

/** The sessions a person reaches, the newest first. */
export async function listSessions(tx: Tx, scope: ReviewScope): Promise<CoachingSession[]> {
  const rows = await tx
    .select()
    .from(coachingSessions)
    .orderBy(desc(coachingSessions.heldOn), desc(coachingSessions.createdAt));
  return rows.map(strip).filter((s) => sessionInReach(s, scope));
}

export async function getSession(tx: Tx, id: string, scope: ReviewScope): Promise<CoachingSession | undefined> {
  const [row] = await tx.select().from(coachingSessions).where(eq(coachingSessions.id, id));
  const s = row ? strip(row) : undefined;
  return s && sessionInReach(s, scope) ? s : undefined;
}

export async function addSession(tx: Tx, input: SessionInput, by: { id: string | null; name: string }) {
  const [row] = await tx
    .insert(coachingSessions)
    .values({ companyId: thisCompany, ...input, byId: by.id, byName: by.name })
    .returning({ id: coachingSessions.id });
  if (!row) throw new Error('The session was not saved.');
  return row.id;
}

export async function updateSession(
  tx: Tx,
  id: string,
  change: Partial<Omit<CoachingSession, 'id' | 'byId' | 'byName' | 'createdAt' | 'updatedAt'>>,
) {
  await tx
    .update(coachingSessions)
    .set({ ...change, updatedAt: sql`now()` })
    .where(eq(coachingSessions.id, id));
}

export async function deleteSession(tx: Tx, id: string) {
  await tx.delete(coachingSessions).where(eq(coachingSessions.id, id));
}

// ---------------------------------------------------------------------------------------------- one-to-ones

export interface OneToOneTemplate {
  id: string;
  name: string;
  teamIds: string[];
  sections: OneToOneSection[];
  byId: string | null;
  byName: string;
  createdAt: Date;
  updatedAt: Date;
}
export type OneToOneTemplateInput = Pick<OneToOneTemplate, 'name' | 'teamIds' | 'sections'>;

const template = ({ companyId: _c, ...t }: typeof oneToOneTemplates.$inferSelect): OneToOneTemplate => t;

export async function listOneToOneTemplates(tx: Tx): Promise<OneToOneTemplate[]> {
  return (await tx.select().from(oneToOneTemplates).orderBy(oneToOneTemplates.name)).map(template);
}
export async function getOneToOneTemplate(tx: Tx, id: string): Promise<OneToOneTemplate | undefined> {
  const [row] = await tx.select().from(oneToOneTemplates).where(eq(oneToOneTemplates.id, id));
  return row ? template(row) : undefined;
}
export async function addOneToOneTemplate(
  tx: Tx,
  input: OneToOneTemplateInput,
  by: { id: string | null; name: string },
) {
  const [row] = await tx
    .insert(oneToOneTemplates)
    .values({ companyId: thisCompany, ...input, byId: by.id, byName: by.name })
    .returning({ id: oneToOneTemplates.id });
  if (!row) throw new Error('The template was not saved.');
  return row.id;
}
export async function updateOneToOneTemplate(tx: Tx, id: string, input: OneToOneTemplateInput) {
  await tx
    .update(oneToOneTemplates)
    .set({ ...input, updatedAt: sql`now()` })
    .where(eq(oneToOneTemplates.id, id));
}
export async function deleteOneToOneTemplate(tx: Tx, id: string) {
  await tx.delete(oneToOneTemplates).where(eq(oneToOneTemplates.id, id));
}

/** How many one-to-ones each person should have per month (1 when never set), and per team where it differs. */
export async function getOneToOneTarget(tx: Tx): Promise<{ target: number; teams: Record<string, number> }> {
  const [row] = await tx.select().from(oneToOneTargets);
  return { target: row?.target ?? 1, teams: row?.teams ?? {} };
}
export async function saveOneToOneTarget(tx: Tx, target: number, teams: Record<string, number>) {
  await tx
    .insert(oneToOneTargets)
    .values({ companyId: thisCompany, target, teams })
    .onConflictDoUpdate({ target: oneToOneTargets.companyId, set: { target, teams, updatedAt: sql`now()` } });
}
