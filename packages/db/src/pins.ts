// Pins, always behind the company wall (inside withCompany). Who may see or make which pin is decided by the server
// (today's rules: staff the agents of their workspaces, admins all; an agent reads their own).
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { type ReviewScope, scopeWhere } from './reviews.js';
import { pins } from './schema.js';

const thisCompany = sql<string>`app_company()`;

export interface Pin {
  id: string;
  reviewId: string | null;
  leadId: string;
  reviewedOn: string;
  agentId: string | null;
  agentName: string;
  teamId: string | null;
  moment: string;
  note: string;
  status: 'todo' | 'done';
  byId: string | null;
  byName: string;
  createdAt: Date;
  updatedAt: Date;
}
export type NewPin = Omit<Pin, 'id' | 'createdAt' | 'updatedAt'>;
export type PinChange = Pick<Pin, 'moment' | 'note' | 'status'>;

const strip = ({ companyId: _company, ...pin }: typeof pins.$inferSelect): Pin => pin;

/** Newest first. */
export async function listPins(tx: Tx, scope: ReviewScope): Promise<Pin[]> {
  const rows = await tx.select().from(pins).where(scopeWhere(scope, pins)).orderBy(desc(pins.createdAt));
  return rows.map(strip);
}

export async function getPin(tx: Tx, id: string, scope: ReviewScope): Promise<Pin | undefined> {
  const [row] = await tx
    .select()
    .from(pins)
    .where(and(eq(pins.id, id), scopeWhere(scope, pins)));
  return row ? strip(row) : undefined;
}

export async function addPin(tx: Tx, pin: NewPin): Promise<string> {
  const [row] = await tx
    .insert(pins)
    .values({ companyId: thisCompany, ...pin })
    .returning({ id: pins.id });
  if (!row) throw new Error('The pin was not saved.');
  return row.id;
}

export async function updatePin(tx: Tx, id: string, change: Partial<PinChange>): Promise<void> {
  await tx
    .update(pins)
    .set({ ...change, updatedAt: sql`now()` })
    .where(eq(pins.id, id));
}

export async function deletePin(tx: Tx, id: string): Promise<void> {
  await tx.delete(pins).where(eq(pins.id, id));
}
