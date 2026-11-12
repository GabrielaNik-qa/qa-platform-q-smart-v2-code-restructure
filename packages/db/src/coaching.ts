// Coaching sessions and one-to-ones, always behind the company wall (inside withCompany). Who may see, write or sign
// which session is decided by the server (today's rules: staff the sessions of their workspaces' agents, admins all,
// an agent their own).
import { desc, eq, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import type { ReviewScope } from './reviews.js';
import { coachingSessions, type SessionAction, type SessionAgent, type SessionSignature } from './schema.js';

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
  byId: string | null;
  byName: string;
  createdAt: Date;
  updatedAt: Date;
}
export type SessionInput = Omit<CoachingSession, 'id' | 'signatures' | 'byId' | 'byName' | 'createdAt' | 'updatedAt'>;

const strip = ({ companyId: _c, ...s }: typeof coachingSessions.$inferSelect): CoachingSession => s;

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
