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
]);

export const pathOf = (app: AppId, page: MenuPage) => `/${app}/${page.id}`;
export const isBuilt = (app: AppId, page: MenuPage) => BUILT.has(`${app}/${page.id}`);
const canSee = (page: MenuPage, role: Role) => !page.roles || page.roles.includes(role);

/** The apps and pages a role sees (today's rules); a group or an app with nothing left is hidden. */
export function menuFor(role: Role): MenuApp[] {
  return MENU.map((app) => ({
    ...app,
    groups: app.groups
      .map((g) => ({ ...g, pages: g.pages.filter((p) => canSee(p, role)) }))
      .filter((g) => g.pages.length > 0),
  })).filter((app) => app.groups.length > 0);
}

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
