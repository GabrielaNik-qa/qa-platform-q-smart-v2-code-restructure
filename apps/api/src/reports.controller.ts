// Reports (today's reports.js and rpt-engine.js), with today's rules:
// - Saved & scheduled: staff save the reports they build; they see their own and the shared ones (admins all), and only
//   the person who saved one, or an admin, changes, schedules or deletes it. A scheduled report arrives in the app as a
//   notification at the chosen hour (in the chooser's time zone); "also by e-mail" is kept and starts once Q-smart sends
//   e-mails (Brevo, Phase 7).
// - The report as Excel is counted here with the same engine as the page, from what the person may see.
// - Export centre: every Excel file made in the app (reviews, quick flags, reports), each made again with today's data
//   and only what the person may still see (a copy of the rows is never kept). Your own, admins all.
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  addReport,
  type Db,
  deleteExport,
  deleteReport,
  findMembership,
  getExport,
  getReport,
  listDisputes,
  listExports,
  listQuickFlags,
  listReports,
  listReviews,
  logActivity,
  type Membership,
  membershipOfUser,
  notify,
  passRates,
  type QuickFlag,
  type Review,
  scheduledReportCompanies,
  type Tx,
  updateReport,
  withCompany,
} from '@qsmart/db';
import {
  passRateOf,
  REPORT_PERIODS,
  REPORT_SOURCES,
  type ReportConfig,
  type ReportData,
  reportDue,
  reportTable,
  runReport,
  scopeOf,
} from '@qsmart/shared';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership } from './decorators.js';
import { badRequest, forbidden, notFound } from './errors.js';
import { type FlagRow, flagsWorkbook, reviewsWorkbook, tableWorkbook } from './excel.js';
import { logExport } from './exports-log.js';
import { reachOf } from './reviews.controller.js';
import { DB } from './tokens.js';

const idParam = z.uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dim = z.enum([
  'none',
  'agent',
  'team',
  'reviewer',
  'type',
  'scorecard',
  'category',
  'campaign',
  'flagger',
  'week',
  'month',
  'quarter',
]);
const filterValue = z.string().max(40).optional();
export const reportConfig = z.object({
  src: z.enum(Object.keys(REPORT_SOURCES) as ['reviews', 'flags']),
  metrics: z.array(z.string().max(20)).max(12),
  rows: dim,
  cols: dim,
  period: z.object({
    p: z.enum(REPORT_PERIODS),
    f: day.optional().or(z.literal('')),
    t: day.optional().or(z.literal('')),
  }),
  filters: z.object({ team: filterValue, agent: filterValue, ch: filterValue, sc: filterValue }).optional(),
  chart: z.enum(['bars', 'line', 'table']).optional(),
  sort: z.enum(['desc', 'asc', 'az']).optional(),
});
const name = z.string().trim().min(1).max(80);
const schedule = z.object({
  freq: z.enum(['none', 'daily', 'weekly', 'monthly']),
  weekday: z.number().int().min(0).max(6).optional(),
  day: z.number().int().min(1).max(28).optional(),
  hour: z.number().int().min(0).max(23).optional(),
  timeZone: z.string().max(60).optional(),
  email: z.boolean().optional(),
  to: z.string().max(500).optional(),
});
const newReport = z.object({ name, cfg: reportConfig, shared: z.boolean().default(false) });
const reportChange = z
  .object({
    name: name.optional(),
    cfg: reportConfig.optional(),
    shared: z.boolean().optional(),
    schedule: schedule.optional(),
  })
  .refine((c) => Object.values(c).some((v) => v !== undefined));

const sendFile = (reply: FastifyReply, file: Buffer, fileName: string) => {
  reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  reply.header(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(`${fileName.replace(/[^\p{L}\p{N}]+/gu, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`)}"`,
  );
  return new StreamableFile(file);
};

/** What a person's reports count: the reviews and quick flags they may see, with names and disputes. */
export async function reportData(tx: Tx, membership: Membership): Promise<ReportData> {
  const reviewScope = scopeOf(membership.role, 'reviews.read');
  const flagScope = scopeOf(membership.role, 'flags.read');
  const reach = reviewScope
    ? await reachOf(tx, membership, reviewScope)
    : { agentId: '00000000-0000-0000-0000-000000000000' };
  // one question at a time: a transaction is one connection
  const reviews = reviewScope ? await listReviews(tx, reach) : [];
  const disputes = reviewScope ? await listDisputes(tx, reach) : [];
  const flags = flagScope ? await listQuickFlags(tx, await reachOf(tx, membership, flagScope)) : [];
  const rates = await passRates(tx);
  const disputed = new Set(disputes.map((d) => d.reviewId));
  return {
    reviews: reviews.map((r) => ({ ...r, disputed: disputed.has(r.id), reviewerName: r.reviewerName ?? '' })),
    flags: flags.map((f) => ({
      flaggedOn: f.flaggedOn,
      agentId: f.agentId,
      agentName: f.agentName,
      teamId: f.teamId,
      teamName: f.teamName,
      channel: f.channel,
      type: f.type,
      byName: f.byName,
    })),
    passRate: (teamId) => passRateOf(rates, teamId),
  };
}

/** The reviews of an export that the person may still see, in the export's order. */
export async function reviewsOf(tx: Tx, membership: Membership, ids: string[]): Promise<Review[]> {
  const scope = scopeOf(membership.role, 'reviews.read');
  if (!scope) return [];
  const byId = new Map((await listReviews(tx, await reachOf(tx, membership, scope))).map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is Review => Boolean(r));
}

/** The conversations of a quick flags export that the person may still see. */
export async function flagRowsOf(
  tx: Tx,
  membership: Membership,
  rows: { reviewId: string | null; flagIds: string[] }[],
): Promise<FlagRow[]> {
  const reviewScope = scopeOf(membership.role, 'reviews.read');
  const flagScope = scopeOf(membership.role, 'flags.read');
  const reviews = new Map<string, Review>(
    reviewScope ? (await listReviews(tx, await reachOf(tx, membership, reviewScope))).map((r) => [r.id, r]) : [],
  );
  const flags = new Map<string, QuickFlag>(
    flagScope ? (await listQuickFlags(tx, await reachOf(tx, membership, flagScope))).map((f) => [f.id, f]) : [],
  );
  return rows
    .map((r) => ({
      review: r.reviewId ? reviews.get(r.reviewId) : undefined,
      flags: r.flagIds.map((id) => flags.get(id)).filter((f): f is QuickFlag => Boolean(f)),
    }))
    .filter((r) => r.review || r.flags.length);
}

@Controller('reports')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class ReportsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** My reports and the shared ones (admins: all). */
  @Get()
  @Allow('reports.read')
  list(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const me = (await membershipOfUser(tx, membership.userId))?.id;
      return (await listReports(tx)).filter((r) => membership.role === 'admin' || r.byId === me || r.shared);
    });
  }

  /** What a report counts, for the page: the data the person may see (the page runs the shared engine on it). */
  @Get('data')
  @Allow('reports.read')
  data(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const d = await reportData(tx, membership);
      const rates = await passRates(tx);
      return { reviews: d.reviews, flags: d.flags, rates };
    });
  }

  @Post()
  @Allow('reports.write')
  async add(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = newReport.safeParse(body);
    if (!input.success) throw badRequest('reportInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const me = await membershipOfUser(tx, membership.userId);
      const id = await addReport(tx, { ...input.data, byId: me?.id ?? null, byName: membership.userName });
      return getReport(tx, id);
    });
  }

  @Put(':id')
  @Allow('reports.write')
  async change(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const target = idParam.safeParse(id);
    const input = reportChange.safeParse(body);
    if (!target.success || !input.success) throw badRequest('reportInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const report = await this.mine(tx, membership, target.data);
      await updateReport(tx, report.id, input.data);
      return getReport(tx, report.id);
    });
  }

  @Delete(':id')
  @Allow('reports.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('reportNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const report = await this.mine(tx, membership, target.data);
      await deleteReport(tx, report.id);
    });
  }

  /** A report as Excel (today's "Excel" button), counted here from what the person may see. */
  @Post('export')
  @Allow('reports.read')
  @HttpCode(200)
  async export(
    @CurrentMembership() membership: Membership,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = z.object({ name: name.default('Report'), cfg: reportConfig }).safeParse(body);
    if (!input.success) throw badRequest('reportInvalid');
    const { cfg } = input.data;
    const table = await withCompany(this.db, membership.companyId, async (tx) => {
      const res = runReport(cfg as ReportConfig, await reportData(tx, membership), Date.now());
      await logExport(tx, membership, {
        kind: 'report',
        name: input.data.name,
        request: { cfg },
        rows: res.rows.length,
      });
      await logActivity(tx, actorOf(membership), {
        action: 'exportReport',
        targetName: input.data.name,
        details: { rows: String(res.rows.length) },
      });
      return reportTable(res);
    });
    return sendFile(reply, await tableWorkbook(input.data.name, table), input.data.name);
  }

  /** A report the person may change: their own, or any for an admin; one they only see is "not yours". */
  private async mine(tx: Tx, membership: Membership, id: string) {
    const report = await getReport(tx, id);
    const me = (await membershipOfUser(tx, membership.userId))?.id;
    if (!report || (membership.role !== 'admin' && report.byId !== me && !report.shared))
      throw notFound('reportNotFound');
    if (membership.role !== 'admin' && report.byId !== me) throw forbidden('reportNotYours');
    return report;
  }
}

@Controller('exports')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class ExportsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** My Excel files (admins: everyone's), newest first; what is needed to make one again stays on the server. */
  @Get()
  @Allow('reports.read')
  list(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const me = (await membershipOfUser(tx, membership.userId))?.id;
      return (await listExports(tx))
        .filter((x) => membership.role === 'admin' || x.byId === me)
        .map(({ request, ...x }) => ({ ...x, again: request !== null }));
    });
  }

  /** The same Excel file again, with today's data and only what the person may still see. */
  @Post(':id/download')
  @Allow('reports.read')
  @HttpCode(200)
  async again(
    @CurrentMembership() membership: Membership,
    @Param('id') id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('exportNotFound');
    const made = await withCompany(this.db, membership.companyId, async (tx) => {
      const x = await this.mine(tx, membership, target.data);
      if (!x.request) throw badRequest('exportTooBig');
      let file: Buffer;
      let rows: number;
      if (x.kind === 'reviews') {
        const ids = z.array(z.uuid()).parse(x.request['ids'] ?? []);
        const list = await reviewsOf(tx, membership, ids);
        file = await reviewsWorkbook(list, x.name);
        rows = list.length;
      } else if (x.kind === 'flags') {
        const input = z
          .array(z.object({ reviewId: z.uuid().nullable(), flagIds: z.array(z.uuid()) }))
          .parse(x.request['rows'] ?? []);
        const list = await flagRowsOf(tx, membership, input);
        file = await flagsWorkbook(list);
        rows = list.length;
      } else {
        const cfg = reportConfig.parse(x.request['cfg']);
        const res = runReport(cfg as ReportConfig, await reportData(tx, membership), Date.now());
        file = await tableWorkbook(x.name, reportTable(res));
        rows = res.rows.length;
      }
      await logActivity(tx, actorOf(membership), {
        action: 'exportAgain',
        targetName: x.name,
        details: { rows: String(rows) },
      });
      return { file, name: x.name };
    });
    return sendFile(reply, made.file, made.name);
  }

  @Delete(':id')
  @Allow('reports.read')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('exportNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const x = await this.mine(tx, membership, target.data);
      await deleteExport(tx, x.id);
    });
  }

  private async mine(tx: Tx, membership: Membership, id: string) {
    const x = await getExport(tx, id);
    const me = (await membershipOfUser(tx, membership.userId))?.id;
    if (!x || (membership.role !== 'admin' && x.byId !== me)) throw notFound('exportNotFound');
    return x;
  }
}

/**
 * The timed job (today's scheduler): every scheduled report that is due arrives in its owner's bell (if they are
 * still an active member), once a day at most. On your PC the server runs it every 10 minutes; online, Cloud
 * Scheduler calls POST /api/jobs/scheduled-reports with the job key.
 */
export async function runScheduledReports(db: Db, now: number): Promise<number> {
  let sent = 0;
  for (const companyId of await scheduledReportCompanies(db))
    await withCompany(db, companyId, async (tx) => {
      for (const r of await listReports(tx)) {
        if (!reportDue(r.schedule, r.lastSentAt, now)) continue;
        const owner = r.byId ? await findMembership(tx, r.byId) : undefined;
        if (owner?.active) await notify(tx, owner.id, 'reportReady', { name: r.name }, '/quality/saved-and-scheduled');
        await updateReport(tx, r.id, { lastSentAt: new Date(now) });
        sent++;
      }
    });
  return sent;
}

@Controller('jobs')
export class JobsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Post('scheduled-reports')
  @HttpCode(200)
  async scheduledReports(@Headers('x-job-key') key?: string) {
    const expected = process.env['QSMART_JOB_KEY'];
    if (!expected || key !== expected) throw forbidden('notAllowed');
    return { sent: await runScheduledReports(this.db, Date.now()) };
  }
}
