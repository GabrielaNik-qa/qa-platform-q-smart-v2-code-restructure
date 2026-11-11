// The menu as apps (plan, section 16, question 4): which apps and pages each role sees, as in today's app, and where
// each page lives. The names, icons and pages come from today's menu (menu-data.ts).
import type { Role } from '@qsmart/shared';
import { type AppId, MENU, type MenuApp, type MenuGroup, type MenuPage } from './menu-data';

export type { AppId, MenuApp, MenuGroup, MenuPage };

/** The pages v2 has built so far (the others say "Soon" and which phase builds them). */
export const BUILT = new Set([
  'admin/profile',
  'admin/password',
  'admin/appearance',
  'admin/language',
  'admin/users',
  'admin/teams',
  'admin/workspaces',
  'admin/skills',
  'admin/notifications-and-confirmations',
  'admin/scorecards',
  'quality/dashboard',
  'quality/personalize',
  'quality/getting-started',
  'quality/qa-entry',
  'quality/reviews',
  'quality/disputes',
  'quality/quick-flags',
  'quality/calibration',
  'quality/reviewer-qa',
  'quality/pins',
  'quality/agents',
  'quality/team-review',
  'quality/category-stats',
  'quality/topic-dashboards',
  'quality/goals-and-kpis',
  'quality/improvement-plans',
  'quality/recognition',
  'quality/review-planner',
  'quality/qa-workload',
  'quality/calendar',
  'quality/report-builder',
  'quality/saved-and-scheduled',
  'quality/export-centre',
  'admin/categories',
  'admin/root-causes',
  'admin/system-settings',
  'admin/all-roles',
  'admin/agent',
  'admin/trainer',
  'admin/team-lead',
  'admin/reviewer',
  'admin/admin',
  'quality/all-activity',
  'quality/my-activity',
  'quality/sign-ins',
  'quality/exports-and-downloads',
]);

export const pathOf = (app: AppId, page: MenuPage) => `/${app}/${page.id}`;
export const isBuilt = (app: AppId, page: MenuPage) => BUILT.has(`${app}/${page.id}`);
/** Admin › Roles & permissions (the company's choices): page → roles, and page → membership → a person's own. */
export interface PageRules {
  roles?: Record<string, readonly Role[]>;
  people?: Record<string, Record<string, boolean>>;
}

/** Admins always keep the Admin pages and the activity log, so nobody can lock the company out (as today). */
export const lockedFor = (app: AppId, page: MenuPage, role: Role) =>
  role === 'admin' && (app === 'admin' || page.key === 'audit');

/** Today's rule for a page, before any choice of the company. */
export const defaultSees = (page: MenuPage, role: Role) => !page.roles || page.roles.includes(role);

/** Does a role see a page: the company's choice for the role if there is one, else today's rule. */
export function roleSees(app: AppId, page: MenuPage, role: Role, rules: PageRules = {}): boolean {
  if (lockedFor(app, page, role)) return true;
  const chosen = rules.roles?.[page.key];
  return chosen ? chosen.includes(role) : defaultSees(page, role);
}

/** Does a person see a page: their own choice comes before their role's (today's Roles & permissions). */
export function personSees(app: AppId, page: MenuPage, role: Role, rules: PageRules, membershipId: string | null) {
  if (lockedFor(app, page, role)) return true;
  const own = membershipId ? rules.people?.[page.key]?.[membershipId] : undefined;
  return own ?? roleSees(app, page, role, rules);
}

/** The apps and pages a person sees; a group or an app with nothing left is hidden. This only shapes the menu: what
 *  a person may read or change is decided by the server's rules. */
export function menuFor(role: Role, rules: PageRules = {}, membershipId: string | null = null): MenuApp[] {
  return MENU.map((app) => ({
    ...app,
    groups: app.groups
      .map((g) => ({ ...g, pages: g.pages.filter((p) => personSees(app.id, p, role, rules, membershipId)) }))
      .filter((g) => g.pages.length > 0),
  })).filter((app) => app.groups.length > 0);
}

/** The menu of the person in the company of the pages. */
export const menuOf = (company: { role: Role; pageRules: PageRules; membershipId: string | null }) =>
  menuFor(company.role, company.pageRules, company.membershipId);

export interface Found {
  app: MenuApp;
  group: MenuGroup;
  page: MenuPage;
}

export function findPage(apps: MenuApp[], appId: string, pageId: string): Found | undefined {
  const app = apps.find((a) => a.id === appId);
  for (const group of app?.groups ?? []) {
    const page = group.pages.find((p) => p.id === pageId);
    if (app && page) return { app, group, page };
  }
  return undefined;
}

export const firstPage = (app: MenuApp): string => {
  const page = app.groups[0]?.pages[0];
  return page ? pathOf(app.id, page) : '/';
};

/** The Admin app is "Settings" for everyone but admins, as today. */
export const appNameKey = (app: AppId, role: Role | undefined): string =>
  app === 'admin' && role !== 'admin' ? 'settings' : app;

/** A group whose pages are all still to come shows greyed, as today's "Soon" groups. */
export const allSoon = (app: AppId, group: MenuGroup) => group.pages.every((p) => !isBuilt(app, p));
