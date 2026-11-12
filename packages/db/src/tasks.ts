// Tasks, always behind the company wall (inside withCompany). Who may see, give, change or move which task is decided by
// the server (today's rules: staff the people of their workspaces, admins all, everyone their own tasks).
import { and, desc, eq, or, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { type ReviewScope, scopeWhere } from './reviews.js';
import { type TaskEvent, type TaskStep, tasks } from './schema.js';

const thisCompany = sql<string>`app_company()`;

export type TaskStatus = 'todo' | 'doing' | 'review' | 'done';
export interface Task {
  id: string;
  groupId: string;
  title: string;
  description: string;
  kind: 'task' | 'target';
  priority: 'low' | 'med' | 'high';
  points: number;
  startOn: string | null;
  dueOn: string | null;
  status: TaskStatus;
  needsReview: boolean;
  assigneeId: string | null;
  assigneeName: string;
  teamId: string | null;
  teamName: string;
  steps: TaskStep[];
  labels: string[];
  colour: string;
  category: string;
  pinned: boolean;
  archivedAt: Date | null;
  startedAt: Date | null;
  sentAt: Date | null;
  completedAt: Date | null;
  history: TaskEvent[];
  /** a repeating template's card */
  templateId: string | null;
  recurKey: string | null;
  /** a sequence's card: its round, step number of how many, and the sequence's name */
  runId: string | null;
  stepNo: number | null;
  stepCount: number | null;
  sequenceName: string;
  byId: string | null;
  byName: string;
  createdAt: Date;
  updatedAt: Date;
}
type LibraryLinks = 'templateId' | 'recurKey' | 'runId' | 'stepNo' | 'stepCount' | 'sequenceName';
export type NewTask = Omit<
  Task,
  'id' | 'createdAt' | 'updatedAt' | 'archivedAt' | 'startedAt' | 'sentAt' | 'completedAt' | 'pinned' | LibraryLinks
> &
  Partial<Pick<Task, LibraryLinks>>;
export type TaskChange = Partial<
  Omit<Task, 'id' | 'groupId' | 'byId' | 'byName' | 'createdAt' | 'updatedAt' | LibraryLinks>
>;

/** The history keeps the last 60 events (today's rule). */
export const MAX_TASK_EVENTS = 60;
export const withEvent = (history: TaskEvent[], event: TaskEvent): TaskEvent[] =>
  [...history, event].slice(-MAX_TASK_EVENTS);

const strip = ({ companyId: _company, ...task }: typeof tasks.$inferSelect): Task => task;
const reach = (scope: ReviewScope, me: string | null) => {
  const inScope = scopeWhere(scope, { agentId: tasks.assigneeId, teamId: tasks.teamId });
  // everyone always reaches their own tasks (a reviewer's own task is in Administration, outside their workspaces)
  return me && inScope ? or(inScope, eq(tasks.assigneeId, me)) : inScope;
};

/** The tasks a person reaches (their own always), the newest first. */
export async function listTasks(tx: Tx, scope: ReviewScope, me: string | null): Promise<Task[]> {
  const rows = await tx.select().from(tasks).where(reach(scope, me)).orderBy(desc(tasks.createdAt));
  return rows.map(strip);
}

export async function getTask(tx: Tx, id: string, scope: ReviewScope, me: string | null): Promise<Task | undefined> {
  const filter = reach(scope, me);
  const [row] = await tx
    .select()
    .from(tasks)
    .where(filter ? and(eq(tasks.id, id), filter) : eq(tasks.id, id));
  return row ? strip(row) : undefined;
}

/** Gives the same task to several people at once (one row each); returns their ids, in the same order. */
export async function addTasks(tx: Tx, list: NewTask[]): Promise<string[]> {
  if (!list.length) return [];
  const rows = await tx
    .insert(tasks)
    .values(list.map((t) => ({ companyId: thisCompany, ...t })))
    .returning({ id: tasks.id });
  return rows.map((r) => r.id);
}

/** A repeating template's card, once per template, period and person: false when it was already there. */
export async function addRepeatingTask(tx: Tx, task: NewTask & { recurKey: string }): Promise<boolean> {
  const rows = await tx
    .insert(tasks)
    .values({ companyId: thisCompany, ...task })
    .onConflictDoNothing({ target: [tasks.companyId, tasks.recurKey] })
    .returning({ id: tasks.id });
  return rows.length > 0;
}

export async function updateTask(tx: Tx, id: string, change: TaskChange): Promise<void> {
  await tx
    .update(tasks)
    .set({ ...change, updatedAt: sql`now()` })
    .where(eq(tasks.id, id));
}

export async function deleteTask(tx: Tx, id: string): Promise<void> {
  await tx.delete(tasks).where(eq(tasks.id, id));
}
