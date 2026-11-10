// The activity log (Admin › Activity Log, and My activity for everyone), the notification bell, Roles & permissions
// (who sees which page in the menu) and My account › Notifications & Confirmations.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  type Actor,
  type Db,
  deleteNotification,
  listActivity,
  logActivity,
  markAllRead,
  type Membership,
  membershipOfUser,
  myNotifications,
  pageRules,
  setPageRules,
  updateMyPrefs,
  withCompany,
} from '@qsmart/db';
import { ROLES } from '@qsmart/shared';
import { z } from 'zod';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import type { VerifiedPerson } from './auth/token-verifier.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, Person } from './decorators.js';
import { badRequest, notFound } from './errors.js';
import { dashboardItems } from './dashboard-items.js';
import { DB } from './tokens.js';

/** Who did it, for the activity log. */
export const actorOf = (m: Membership): Actor => ({ userId: m.userId, name: m.userName, role: m.role });

const kindParam = z.enum(['all', 'signins', 'exports']).catch('all');

@Controller('activity')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class ActivityController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** All activity, sign-ins, or exports & downloads: admins only, as today. */
  @Get()
  @Allow('activity.readAll')
  list(@CurrentMembership() membership: Membership, @Query('kind') kind: unknown) {
    return withCompany(this.db, membership.companyId, (tx) =>
      listActivity(tx, kindParam.parse(kind), membership.userId),
    );
  }

  /** My activity: what I did, and what was done to my account. */
  @Get('mine')
  @Allow('activity.readOwn')
  mine(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, (tx) => listActivity(tx, 'mine', membership.userId));
  }
}

@Controller('notifications')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class NotificationsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** My notifications in this company, newest first (each person sees only their own). */
  @Get()
  @Allow('account.edit')
  list(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const me = await membershipOfUser(tx, membership.userId);
      return me ? myNotifications(tx, me.id) : [];
    });
  }

  @Post('read')
  @Allow('account.edit')
  @HttpCode(204)
  async read(@CurrentMembership() membership: Membership) {
    await withCompany(this.db, membership.companyId, async (tx) => {
      const me = await membershipOfUser(tx, membership.userId);
      if (me) await markAllRead(tx, me.id);
    });
  }

  @Delete(':id')
  @Allow('account.edit')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = z.uuid().safeParse(id);
    if (!target.success) throw badRequest('nothingToDelete');
    const gone = await withCompany(this.db, membership.companyId, async (tx) => {
      const me = await membershipOfUser(tx, membership.userId);
      return me ? deleteNotification(tx, me.id, target.data) : false;
    });
    if (!gone) throw notFound('notificationNotFound');
  }
}

const pageRulesInput = z.object({
  roles: z.record(z.string().max(40), z.array(z.enum(ROLES)).max(5)).optional(),
  people: z.record(z.string().max(40), z.record(z.uuid(), z.boolean())).optional(),
});

/** Admin › Roles & permissions: which roles (and which people) see which page in the menu. It only changes the
 *  menu, as today: what a person may read or change is still decided by the server's rules. */
@Controller('page-rules')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class PageRulesController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('people.manage')
  get(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, (tx) => pageRules(tx));
  }

  @Put()
  @Allow('people.manage')
  async set(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = pageRulesInput.safeParse(body);
    if (!input.success || JSON.stringify(input.data).length > 50_000) throw badRequest('nothingToChange');
    return withCompany(this.db, membership.companyId, async (tx) => {
      await setPageRules(tx, input.data);
      await logActivity(tx, actorOf(membership), { action: 'pageRules' });
      return pageRules(tx);
    });
  }
}

const prefsInput = z.object({
  info: z.boolean().optional(),
  confirm: z.boolean().optional(),
  dismissed: z.record(z.string().max(80), z.string().max(40)).optional(),
  /** the columns each table shows (e.g. the Reviews list) */
  columns: z.record(z.string().max(40), z.array(z.string().max(40)).max(40)).optional(),
  /** small choices of a page, e.g. Team Review's view */
  choices: z
    .record(z.string().regex(/^[a-z]{1,20}\.[a-z]{1,20}$/), z.string().max(20))
    .refine((c) => Object.keys(c).length <= 40)
    .optional(),
  /** Home › Personalize, per company: my home dashboard, my own dashboards, how the data is counted */
  dashboards: z
    .record(
      z.uuid(),
      z.object({
        home: dashboardItems.optional(),
        views: z
          .array(
            z.object({
              id: z.string().regex(/^[a-z0-9-]{1,40}$/),
              name: z.string().trim().min(1).max(40),
              items: dashboardItems,
            }),
          )
          .max(10)
          .optional(),
        base: z.enum(['conversation', 'review']).optional(),
        grouping: z.enum(['day', 'week', 'month', 'quarter']).optional(),
      }),
    )
    .optional(),
});

/** My account › Notifications & Confirmations, saved with the account (the same on every browser). */
@Controller('me/prefs')
@UseGuards(SignedInGuard)
export class MyPrefsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Put()
  @HttpCode(204)
  async set(@Person() person: VerifiedPerson, @Body() body: unknown) {
    const input = prefsInput.safeParse(body);
    if (!input.success) throw badRequest('nothingToChange');
    await updateMyPrefs(this.db, person.uid, input.data);
  }
}
