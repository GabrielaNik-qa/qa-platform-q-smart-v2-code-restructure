// Home › Personalize, the company's part (today's rules, personalize.js and widgets.js):
// - dashboards shared with roles: admins and reviewers share them (today's "admins and QA"); everyone sees the ones
//   shared with their role or with everyone; admins and reviewers see them all. Admins change or delete any; a reviewer
//   only the ones they shared;
// - a role's home dashboard, set by an admin ("Make it the home dashboard of …"), for everyone of that role who has not
//   chosen their own.
// Each person's own dashboards (their home, their named ones, how the data is counted) are saved with their account.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Put, UseGuards } from '@nestjs/common';
import {
  companyDashboards,
  type Db,
  logActivity,
  type Membership,
  membershipOfUser,
  setCompanyDashboards,
  type SharedDashboard,
  withCompany,
} from '@qsmart/db';
import { can, ROLES } from '@qsmart/shared';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { dashboardItems } from './dashboard-items.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership } from './decorators.js';
import { badRequest, forbidden, notFound } from './errors.js';
import { DB } from './tokens.js';

const viewId = z.string().regex(/^[a-z0-9-]{1,40}$/);
const sharedInput = z.object({
  name: z.string().trim().min(1).max(40),
  items: dashboardItems,
  roles: z.array(z.enum(['all', ...ROLES])).max(6),
});
const roleParam = z.enum(ROLES);

@Controller('dashboards')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class DashboardsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The shared dashboards a person sees, and each role's home dashboard. */
  @Get()
  @Allow('reviews.read')
  list(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const all = await companyDashboards(tx);
      const sharer = can(membership.role, 'dashboards.shareViews');
      return {
        shared: (all.shared ?? []).filter(
          (v) => sharer || v.roles.includes('all') || v.roles.includes(membership.role),
        ),
        roles: all.roles ?? {},
      };
    });
  }

  /** Share a dashboard (or change one already shared). */
  @Put('shared/:id')
  @Allow('dashboards.shareViews')
  async share(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const target = viewId.safeParse(id);
    const input = sharedInput.safeParse(body);
    if (!target.success || !input.success) throw badRequest('dashboardInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const all = await companyDashboards(tx);
      const shared = all.shared ?? [];
      const me = (await membershipOfUser(tx, membership.userId))?.id ?? null;
      const existing = shared.find((v) => v.id === target.data);
      if (existing && membership.role !== 'admin' && existing.byId !== me) throw forbidden('dashboardNotYours');
      if (!existing && shared.length >= 50) throw badRequest('dashboardInvalid');
      const view: SharedDashboard = {
        id: target.data,
        ...input.data,
        byId: existing?.byId ?? me,
        byName: existing?.byName ?? membership.userName,
      };
      await setCompanyDashboards(tx, {
        ...all,
        shared: existing ? shared.map((v) => (v.id === view.id ? view : v)) : [...shared, view],
      });
      await logActivity(tx, actorOf(membership), { action: 'dashboardShared', targetName: view.name });
      return view;
    });
  }

  @Delete('shared/:id')
  @Allow('dashboards.shareViews')
  @HttpCode(204)
  async unshare(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    await withCompany(this.db, membership.companyId, async (tx) => {
      const all = await companyDashboards(tx);
      const existing = (all.shared ?? []).find((v) => v.id === id);
      if (!existing) throw notFound('dashboardNotFound');
      const me = (await membershipOfUser(tx, membership.userId))?.id ?? null;
      if (membership.role !== 'admin' && existing.byId !== me) throw forbidden('dashboardNotYours');
      await setCompanyDashboards(tx, { ...all, shared: (all.shared ?? []).filter((v) => v.id !== id) });
      await logActivity(tx, actorOf(membership), { action: 'dashboardDeleted', targetName: existing.name });
    });
  }

  /** An admin makes a dashboard the home of everyone of a role who has not chosen their own. */
  @Put('roles/:role')
  @Allow('settings.write')
  async roleHome(@CurrentMembership() membership: Membership, @Param('role') role: string, @Body() body: unknown) {
    const target = roleParam.safeParse(role);
    const input = z.object({ items: dashboardItems }).safeParse(body);
    if (!target.success || !input.success) throw badRequest('dashboardInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const all = await companyDashboards(tx);
      const roles = { ...(all.roles ?? {}), [target.data]: input.data.items };
      await setCompanyDashboards(tx, { ...all, roles });
      await logActivity(tx, actorOf(membership), { action: 'dashboardRoleHome', details: { role: target.data } });
      return roles;
    });
  }

  /** Back to today's ready-made home dashboard for the role. */
  @Delete('roles/:role')
  @Allow('settings.write')
  @HttpCode(204)
  async roleReset(@CurrentMembership() membership: Membership, @Param('role') role: string) {
    const target = roleParam.safeParse(role);
    if (!target.success) throw badRequest('dashboardInvalid');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const all = await companyDashboards(tx);
      const { [target.data]: _gone, ...rest } = all.roles ?? {};
      await setCompanyDashboards(tx, { ...all, roles: rest });
      await logActivity(tx, actorOf(membership), { action: 'dashboardRoleReset', details: { role: target.data } });
    });
  }
}
