// Tasks' Library (today's Library): templates, sequences and the rounds of sequences given, always behind the company
// wall (inside withCompany). Who may make or give them is decided by the server (those who give tasks).
import { asc, desc, eq, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { type SequenceStep, type TemplateStep, taskSequenceRuns, taskSequences, taskTemplates } from './schema.js';

const thisCompany = sql<string>`app_company()`;

export type TemplateKind = 'task' | 'checklist' | 'target';
export type TemplateFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'quarterly';
export interface TaskTemplate {
  id: string;
  title: string;
  description: string;
  kind: TemplateKind;
  priority: 'low' | 'med' | 'high';
  points: number;
  steps: TemplateStep[];
  labels: string[];
  colour: string;
  category: string;
  needsReview: boolean;
  freq: TemplateFreq;
  weekday: number;
  monthday: number;
  untilOn: string | null;
  userIds: string[];
  teamIds: string[];
  byId: string | null;
  byName: string;
  createdAt: Date;
  updatedAt: Date;
}
export type TemplateInput = Omit<TaskTemplate, 'id' | 'byId' | 'byName' | 'createdAt' | 'updatedAt'>;

export interface TaskSequence {
  id: string;
  name: string;
  description: string;
  steps: SequenceStep[];
  byId: string | null;
  byName: string;
  createdAt: Date;
  updatedAt: Date;
}
export type SequenceInput = Pick<TaskSequence, 'name' | 'description' | 'steps'>;

export interface SequenceRun {
  id: string;
  sequenceId: string;
  startOn: string;
  repeat: 'none' | 'monthly' | 'quarterly';
  untilOn: string | null;
  userIds: string[];
  teamIds: string[];
  cycles: string[];
  active: boolean;
  byId: string | null;
  byName: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------------------------- templates

const template = ({ companyId: _c, ...t }: typeof taskTemplates.$inferSelect): TaskTemplate =>
  ({ ...t, kind: t.kind as TemplateKind, freq: t.freq as TemplateFreq }) as TaskTemplate;

export async function listTaskTemplates(tx: Tx): Promise<TaskTemplate[]> {
  return (await tx.select().from(taskTemplates).orderBy(asc(taskTemplates.title))).map(template);
}
export async function getTaskTemplate(tx: Tx, id: string): Promise<TaskTemplate | undefined> {
  const [row] = await tx.select().from(taskTemplates).where(eq(taskTemplates.id, id));
  return row ? template(row) : undefined;
}
export async function addTaskTemplate(
  tx: Tx,
  input: TemplateInput,
  by: { id: string | null; name: string },
): Promise<string> {
  const [row] = await tx
    .insert(taskTemplates)
    .values({ companyId: thisCompany, ...input, byId: by.id, byName: by.name })
    .returning({ id: taskTemplates.id });
  if (!row) throw new Error('The template was not saved.');
  return row.id;
}
export async function updateTaskTemplate(tx: Tx, id: string, input: TemplateInput): Promise<void> {
  await tx
    .update(taskTemplates)
    .set({ ...input, updatedAt: sql`now()` })
    .where(eq(taskTemplates.id, id));
}
export async function deleteTaskTemplate(tx: Tx, id: string): Promise<void> {
  await tx.delete(taskTemplates).where(eq(taskTemplates.id, id));
}

// ---------------------------------------------------------------------------------------------- sequences

const sequence = ({ companyId: _c, ...s }: typeof taskSequences.$inferSelect): TaskSequence => s;

export async function listTaskSequences(tx: Tx): Promise<TaskSequence[]> {
  return (await tx.select().from(taskSequences).orderBy(asc(taskSequences.name))).map(sequence);
}
export async function getTaskSequence(tx: Tx, id: string): Promise<TaskSequence | undefined> {
  const [row] = await tx.select().from(taskSequences).where(eq(taskSequences.id, id));
  return row ? sequence(row) : undefined;
}
export async function addTaskSequence(
  tx: Tx,
  input: SequenceInput,
  by: { id: string | null; name: string },
): Promise<string> {
  const [row] = await tx
    .insert(taskSequences)
    .values({ companyId: thisCompany, ...input, byId: by.id, byName: by.name })
    .returning({ id: taskSequences.id });
  if (!row) throw new Error('The sequence was not saved.');
  return row.id;
}
export async function updateTaskSequence(tx: Tx, id: string, input: SequenceInput): Promise<void> {
  await tx
    .update(taskSequences)
    .set({ ...input, updatedAt: sql`now()` })
    .where(eq(taskSequences.id, id));
}
/** Deletes a sequence and its rounds (their cards stay, with the sequence's name). */
export async function deleteTaskSequence(tx: Tx, id: string): Promise<void> {
  await tx.delete(taskSequences).where(eq(taskSequences.id, id));
}

// ---------------------------------------------------------------------------------------------- rounds

const run = ({ companyId: _c, ...r }: typeof taskSequenceRuns.$inferSelect): SequenceRun =>
  ({ ...r, repeat: r.repeat as SequenceRun['repeat'] }) as SequenceRun;

export async function listSequenceRuns(tx: Tx): Promise<SequenceRun[]> {
  return (await tx.select().from(taskSequenceRuns).orderBy(desc(taskSequenceRuns.createdAt))).map(run);
}
export async function addSequenceRun(
  tx: Tx,
  input: Omit<SequenceRun, 'id' | 'createdAt' | 'cycles' | 'active'>,
): Promise<SequenceRun> {
  const [row] = await tx
    .insert(taskSequenceRuns)
    .values({ companyId: thisCompany, ...input })
    .returning();
  if (!row) throw new Error('The sequence was not given.');
  return run(row);
}
export async function updateSequenceRun(tx: Tx, id: string, change: Partial<Pick<SequenceRun, 'cycles' | 'active'>>) {
  await tx.update(taskSequenceRuns).set(change).where(eq(taskSequenceRuns.id, id));
}
