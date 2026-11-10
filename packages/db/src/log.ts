// The activity log, the notification bell and the page rules of a company: always behind the company wall (inside
// withCompany). The log only ever grows: the server can add and read entries, never change or delete them.
import { and, desc, eq, isNull, like, or, sql } from 'drizzle-orm';
import type { PlannerSettings } from '@qsmart/shared';
import type { Tx } from './company.js';
import { activity, companies, type CompanyDashboards, notifications, type PageRules } from './schema.js';

const thisCompany = sql<string>`app_company()`;

/** Who did it: kept as name and role too, in case the person leaves the company later. */
export interface Actor {
  userId: string | null;
  name: string;
  role: string | null;
}

export interface NewEntry {
  /** a code the pages show in the person's language (apps/web/src/messages.ts, "activity.actions") */
  action: string;
  targetId?: string | null;
  targetName?: string;
  details?: Record<string, string>;
  ip?: string | null;
  /** sign-ins: one entry per sign-in session */
  sessionKey?: string;
  /** when it happened, if not now (a sign-in: the moment Firebase signed the person in) */
  at?: Date;
}

export async function logActivity(tx: Tx, actor: Actor, entry: NewEntry): Promise<void> {
  await tx
    .insert(activity)
    .values({
      companyId: thisCompany,
      actorId: actor.userId,
      actorName: actor.name,
      actorRole: actor.role,
      action: entry.action,
      targetId: entry.targetId ?? null,
      targetName: entry.targetName ?? '',
      details: entry.details ?? {},
      ip: entry.ip ?? null,
      sessionKey: entry.sessionKey ?? null,
      ...(entry.at ? { at: entry.at } : {}),
    })
    .onConflictDoNothing();
}

export type ActivityKind = 'all' | 'mine' | 'signins' | 'exports';

export interface ActivityRow {
  id: string;
  at: Date;
  actorName: string;
  actorRole: string | null;
  action: string;
  targetName: string;
  details: Record<string, string>;
  ip: string | null;
}

/** Newest first, the last 1000 entries (as today). "mine": what I did, and what was done to my account. */
export async function listActivity(tx: Tx, kind: ActivityKind, userId: string): Promise<ActivityRow[]> {
  const where =
    kind === 'signins'
      ? eq(activity.action, 'signIn')
      : kind === 'exports'
        ? like(activity.action, 'export%')
        : kind === 'mine'
          ? or(eq(activity.actorId, userId), eq(activity.targetId, userId))
          : undefined;
  return tx
    .select({
      id: activity.id,
      at: activity.at,
      actorName: activity.actorName,
      actorRole: activity.actorRole,
      action: activity.action,
      targetName: activity.targetName,
      details: activity.details,
      ip: activity.ip,
    })
    .from(activity)
    .where(where)
    .orderBy(desc(activity.at))
    .limit(1000);
}

// ------------------------------------------------------------------------------------------------ the bell

export async function notify(
  tx: Tx,
  membershipId: string,
  kind: string,
  details: Record<string, string> = {},
  link: string | null = null,
): Promise<void> {
  await tx.insert(notifications).values({ companyId: thisCompany, membershipId, kind, details, link });
}

export interface NotificationRow {
  id: string;
  at: Date;
  kind: string;
  details: Record<string, string>;
  link: string | null;
  read: boolean;
}

export async function myNotifications(tx: Tx, membershipId: string): Promise<NotificationRow[]> {
  const rows = await tx
    .select({
      id: notifications.id,
      at: notifications.at,
      kind: notifications.kind,
      details: notifications.details,
      link: notifications.link,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .where(eq(notifications.membershipId, membershipId))
    .orderBy(desc(notifications.at))
    .limit(200);
  return rows.map(({ readAt, ...n }) => ({ ...n, read: readAt !== null }));
}

export async function markAllRead(tx: Tx, membershipId: string): Promise<void> {
  await tx
    .update(notifications)
    .set({ readAt: sql`now()` })
    .where(and(eq(notifications.membershipId, membershipId), isNull(notifications.readAt)));
}

/** Only the person's own notification; true when one was deleted. */
export async function deleteNotification(tx: Tx, membershipId: string, id: string): Promise<boolean> {
  const gone = await tx
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.membershipId, membershipId)))
    .returning({ id: notifications.id });
  return gone.length > 0;
}

// ------------------------------------------------------------------------------------------------ page rules

/** Admin › Roles & permissions: who sees which page in the menu (the company wall shows only this company). */
export async function pageRules(tx: Tx): Promise<PageRules> {
  const [row] = await tx.select({ rules: companies.pageRules }).from(companies);
  return row?.rules ?? {};
}

export async function setPageRules(tx: Tx, rules: PageRules): Promise<void> {
  await tx.update(companies).set({ pageRules: rules }).where(eq(companies.id, thisCompany));
}

/** Home › Personalize: the company's shared dashboards and each role's home dashboard. */
export async function companyDashboards(tx: Tx): Promise<CompanyDashboards> {
  const [row] = await tx.select({ dashboards: companies.dashboards }).from(companies);
  return row?.dashboards ?? {};
}

export async function setCompanyDashboards(tx: Tx, dashboards: CompanyDashboards): Promise<void> {
  await tx.update(companies).set({ dashboards }).where(eq(companies.id, thisCompany));
}

/** Planning › Review planner: the company's plan. */
export async function companyPlanner(tx: Tx): Promise<PlannerSettings> {
  const [row] = await tx.select({ planner: companies.planner }).from(companies);
  return row?.planner ?? {};
}

export async function setCompanyPlanner(tx: Tx, planner: PlannerSettings): Promise<void> {
  await tx.update(companies).set({ planner }).where(eq(companies.id, thisCompany));
}
