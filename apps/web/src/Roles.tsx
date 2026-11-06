// Admin › Roles & permissions, as today: which roles (All roles) and which people (one page per role) see which page
// in the menu. Admins always keep the Admin pages. It only changes the menu: the server's rules stay as they are.
import { ROLE_LABELS, type Role, ROLES } from '@qsmart/shared';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { currentLanguage } from './i18n';
import { appNameKey, lockedFor, type PageRules, personSees, roleSees } from './menu';
import { MENU } from './menu-data';
import { useSession } from './session';
import { card, type CompanyRef, Notice, type PersonRow, smallButton, useAction } from './ui';

const ROWS = MENU.flatMap((app) => app.groups.flatMap((group) => group.pages.map((page) => ({ app, group, page }))));

export function Roles({ company, role }: { company: CompanyRef; role?: Role }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const { reloadMe } = useSession();
  const [rules, setRules] = useState<PageRules | null>(null);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const { message, run, fail } = useAction();

  const load = useCallback(() => {
    void Promise.all([api<PageRules>('/page-rules', company.id), api<PersonRow[]>('/people', company.id)]).then(
      ([r, p]) => {
        setRules(r);
        setPeople(p);
      },
      fail,
    );
  }, [company.id, fail]);
  useEffect(load, [load]);

  /** Saves at once (as today), then the menu of this person follows. */
  const save = (next: PageRules) => {
    setRules(next);
    void run(() => api('/page-rules', company.id, { method: 'PUT', body: next }), t('roles.saved'), reloadMe);
  };

  const toggleRole = (key: string, appId: (typeof MENU)[number]['id'], r: Role, on: boolean) => {
    if (!rules) return;
    const row = ROWS.find((x) => x.page.key === key && x.app.id === appId);
    if (!row) return;
    const now = ROLES.filter((x) => roleSees(appId, row.page, x, rules));
    const roles = on ? [...new Set([...now, r])] : now.filter((x) => x !== r);
    save({ ...rules, roles: { ...rules.roles, [key]: roles } });
  };

  const togglePerson = (key: string, appId: (typeof MENU)[number]['id'], p: PersonRow, on: boolean) => {
    if (!rules) return;
    const row = ROWS.find((x) => x.page.key === key && x.app.id === appId);
    if (!row) return;
    // a choice equal to the role's isn't a choice of its own: the person follows the role again
    const others = Object.entries(rules.people?.[key] ?? {}).filter(([id]) => id !== p.membershipId);
    const own = Object.fromEntries(
      on === roleSees(appId, row.page, p.role, rules) ? others : [...others, [p.membershipId, on]],
    );
    save({ ...rules, people: { ...rules.people, [key]: own } });
  };

  const ofRole = role ? people.filter((p) => p.role === role) : [];
  const roles = role ? [role] : [...ROLES];
  const th = 'py-1 px-2 font-semibold';
  return (
    <section className="grid gap-4" aria-labelledby="roles-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="roles-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {role ? ROLE_LABELS[lang][role] : t('menu.pages.perms')}
          </h1>
          <p className="text-sm text-mu max-w-3xl">{role ? t('roles.roleIntro') : t('roles.intro')}</p>
        </div>
        {!role && (
          <button
            type="button"
            className={smallButton}
            onClick={() => {
              if (window.confirm(t('roles.confirmDefaults'))) save({});
            }}
          >
            {t('roles.defaults')}
          </button>
        )}
      </div>
      <p className="text-xs text-mu">{t('roles.note')}</p>
      <Notice message={message} />
      {!rules && <p className="text-mu">{t('common.loading')}</p>}
      {rules && role && ofRole.length === 0 && <p className="text-mu">{t('roles.nobody')}</p>}
      {rules && (!role || ofRole.length > 0) && (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="text-left text-mu">
              <tr>
                <th className={th}>{t('roles.panel')}</th>
                <th className={th}>{t('roles.category')}</th>
                <th className={th}>{t('roles.page')}</th>
                {roles.map((r) => (
                  <th key={r} className={`${th} text-center`}>
                    {ROLE_LABELS[lang][r]}
                    {role && <div className="text-xs font-normal">{t('roles.role')}</div>}
                  </th>
                ))}
                {ofRole.map((p) => (
                  <th key={p.membershipId} className={`${th} text-center`}>
                    {p.name}
                    <div className="text-xs font-normal">{p.teamName}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(({ app, group, page }) => {
                const name = t(`menu.pages.${page.key}`);
                return (
                  <tr key={`${app.id}/${page.id}`} className="border-t border-bd">
                    <td className="py-1.5 px-2 text-xs text-mu">{t(`menu.apps.${appNameKey(app.id, 'admin')}`)}</td>
                    <td className="py-1.5 px-2">{t(`menu.groups.${group.id}`)}</td>
                    <td className="py-1.5 px-2 font-semibold">{name}</td>
                    {roles.map((r) => (
                      <td key={r} className="py-1.5 px-2 text-center">
                        <input
                          type="checkbox"
                          className="accent-[var(--brand)]"
                          aria-label={`${name}: ${ROLE_LABELS[lang][r]}`}
                          checked={roleSees(app.id, page, r, rules)}
                          disabled={lockedFor(app.id, page, r)}
                          onChange={(e) => toggleRole(page.key, app.id, r, e.target.checked)}
                        />
                      </td>
                    ))}
                    {ofRole.map((p) => {
                      const own = rules.people?.[page.key]?.[p.membershipId] !== undefined;
                      return (
                        <td key={p.membershipId} className="py-1.5 px-2 text-center">
                          <input
                            type="checkbox"
                            className={`accent-[var(--brand)] ${own ? 'outline-2 outline-offset-1 outline-tx rounded-xs' : ''}`}
                            aria-label={`${name}: ${p.name}`}
                            checked={personSees(app.id, page, p.role, rules, p.membershipId)}
                            disabled={lockedFor(app.id, page, p.role)}
                            onChange={(e) => togglePerson(page.key, app.id, p, e.target.checked)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
