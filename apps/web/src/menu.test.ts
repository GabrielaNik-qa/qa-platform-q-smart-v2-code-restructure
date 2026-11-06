// The menu as apps: who sees which app and page, as in today's app, and every name in the three languages.
import { LANGUAGES } from '@qsmart/shared';
import { describe, expect, it } from 'vitest';
import { appNameKey, BUILT, findPage, menuFor } from './menu';
import { MENU, MENU_TEXTS } from './menu-data';

const appsOf = (role: Parameters<typeof menuFor>[0]) => menuFor(role).map((a) => a.id);

describe('the menu as apps', () => {
  it('gives admins every app, and Admin is called Settings for everyone else (as today)', () => {
    expect(appsOf('admin')).toEqual(['quality', 'workforce', 'learning', 'trainer', 'ai', 'admin']);
    expect(appNameKey('admin', 'admin')).toBe('admin');
    expect(appNameKey('admin', 'agent')).toBe('settings');
  });

  it('keeps Users, Teams, Workspaces and Skills for admins, as today', () => {
    for (const page of ['users', 'teams', 'workspaces', 'skills']) {
      expect(findPage(menuFor('admin'), 'admin', page), page).toBeDefined();
      for (const role of ['reviewer', 'lead', 'trainer', 'agent'] as const)
        expect(findPage(menuFor(role), 'admin', page), `${role} ${page}`).toBeUndefined();
    }
  });

  it('gives everyone My account', () => {
    for (const role of ['admin', 'reviewer', 'lead', 'trainer', 'agent'] as const)
      expect(findPage(menuFor(role), 'admin', 'profile'), role).toBeDefined();
  });

  it('hides staff pages from agents (QA Entry, Quick Flags, Team Review, Ask Quinn)', () => {
    const agent = menuFor('agent');
    expect(findPage(agent, 'quality', 'qa-entry')).toBeUndefined();
    expect(findPage(agent, 'quality', 'quick-flags')).toBeUndefined();
    expect(findPage(agent, 'quality', 'team-review')).toBeUndefined();
    expect(findPage(agent, 'ai', 'ask-quinn')).toBeUndefined();
    expect(findPage(agent, 'quality', 'reviews')).toBeDefined();
    expect(findPage(menuFor('reviewer'), 'quality', 'qa-entry')).toBeDefined();
  });

  it('follows Roles & permissions: the company’s choice for a role, and a person’s own choice first', () => {
    const rules = { roles: { calls: ['admin' as const] }, people: { calls: { 'm-1': true } } };
    expect(findPage(menuFor('agent', rules, 'm-2'), 'quality', 'reviews')).toBeUndefined();
    expect(findPage(menuFor('agent', rules, 'm-1'), 'quality', 'reviews')).toBeDefined();
    // admins always keep the Admin pages, whatever was chosen
    const lockedOut = { roles: { users: [] }, people: {} };
    expect(findPage(menuFor('admin', lockedOut, null), 'admin', 'users')).toBeDefined();
  });

  it('has a name for every app, section, group and page in English, Bulgarian and French', () => {
    for (const lang of LANGUAGES) {
      const texts = MENU_TEXTS[lang];
      for (const app of MENU) {
        expect(texts.apps[app.id], `${lang} ${app.id}`).toBeTruthy();
        for (const s of app.sections) expect(texts.sections[s], `${lang} ${s}`).toBeTruthy();
        for (const g of app.groups) {
          expect(texts.groups[g.id], `${lang} ${g.id}`).toBeTruthy();
          for (const p of g.pages) expect(texts.pages[p.key], `${lang} ${p.key}`).toBeTruthy();
        }
      }
    }
  });

  it('gives every page its own address, and every built page exists in the menu', () => {
    for (const app of MENU) {
      const ids = app.groups.flatMap((g) => g.pages.map((p) => p.id));
      expect(new Set(ids).size, app.id).toBe(ids.length);
    }
    for (const built of BUILT) {
      const [app, page] = built.split('/');
      expect(findPage(MENU, app ?? '', page ?? ''), built).toBeDefined();
    }
  });
});
