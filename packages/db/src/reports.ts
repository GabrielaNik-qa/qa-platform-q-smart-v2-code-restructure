// Saved reports and the export centre, always behind the company wall (inside withCompany). Who sees which is decided
// by the server (today's rules: your own reports and the shared ones, admins all; your own exports, admins all).
import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import type { Tx } from './company.js';
import { exportsLog, type ReportSchedule, reports } from './schema.js';

const thisCompany = sql<string>`app_company()`;

export interface SavedReport {
  id: string;
  name: string;
  cfg: Record<string, unknown>;
  shared: boolean;
  schedule: ReportSchedule;
  lastSentAt: Date | null;
  byId: string | null;
  byName: string;
  createdAt: Date;
  updatedAt: Date;
}
const stripReport = ({ companyId: _c, ...r }: typeof reports.$inferSelect): SavedReport => r;

export async function listReports(tx: Tx): Promise<SavedReport[]> {
  const rows = await tx.select().from(reports).orderBy(desc(reports.createdAt));
  return rows.map(stripReport);
}

export async function getReport(tx: Tx, id: string): Promise<SavedReport | undefined> {
  const [row] = await tx.select().from(reports).where(eq(reports.id, id));
  return row ? stripReport(row) : undefined;
}

export async function addReport(
  tx: Tx,
  r: Pick<SavedReport, 'name' | 'cfg' | 'shared' | 'byId' | 'byName'>,
): Promise<string> {
  const [row] = await tx
    .insert(reports)
    .values({ companyId: thisCompany, ...r })
    .returning({ id: reports.id });
  if (!row) throw new Error('The report was not saved.');
  return row.id;
}

export async function updateReport(
  tx: Tx,
  id: string,
  change: Partial<Pick<SavedReport, 'name' | 'cfg' | 'shared' | 'schedule' | 'lastSentAt'>>,
): Promise<void> {
  await tx
    .update(reports)
    .set({ ...change, updatedAt: sql`now()` })
    .where(eq(reports.id, id));
}

export async function deleteReport(tx: Tx, id: string): Promise<void> {
  await tx.delete(reports).where(eq(reports.id, id));
}

/** The companies with scheduled reports (only their ids: each is then read behind its own wall). */
export async function scheduledReportCompanies(db: Db): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`SELECT scheduled_report_companies() AS id`);
  return rows.rows.map((r) => r.id);
}

export interface ExportRow {
  id: string;
  kind: 'reviews' | 'flags' | 'report';
  name: string;
  request: Record<string, unknown> | null;
  rows: number;
  byId: string | null;
  byName: string;
  createdAt: Date;
}
const stripExport = ({ companyId: _c, ...x }: typeof exportsLog.$inferSelect): ExportRow =>
  ({ ...x, kind: x.kind === 'report' || x.kind === 'flags' ? x.kind : 'reviews' }) as ExportRow;

export async function addExport(tx: Tx, x: Omit<ExportRow, 'id' | 'createdAt'>): Promise<string> {
  const [row] = await tx
    .insert(exportsLog)
    .values({ companyId: thisCompany, ...x })
    .returning({ id: exportsLog.id });
  if (!row) throw new Error('The export was not saved.');
  return row.id;
}

export async function listExports(tx: Tx): Promise<ExportRow[]> {
  const rows = await tx.select().from(exportsLog).orderBy(desc(exportsLog.createdAt)).limit(500);
  return rows.map(stripExport);
}

export async function getExport(tx: Tx, id: string): Promise<ExportRow | undefined> {
  const [row] = await tx.select().from(exportsLog).where(eq(exportsLog.id, id));
  return row ? stripExport(row) : undefined;
}

export async function deleteExport(tx: Tx, id: string): Promise<void> {
  await tx.delete(exportsLog).where(eq(exportsLog.id, id));
}
