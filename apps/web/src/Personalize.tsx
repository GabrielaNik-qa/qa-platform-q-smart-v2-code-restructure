// Home › Personalize, as today (current-app: personalize.js): the Dashboard page only shows; everything you choose about
// it is here.
// - The gallery: your home dashboard, your own dashboards and the ones shared with you, and today's ready-made ones.
// - The dashboard picked in the gallery, shown as a live preview, with its buttons: Display, Use as my home, Make my own
//   copy, Rename, Delete, and for admins "View as" another role.
// - Display settings: which date the data counts by, how the charts over time group dates, the widgets switched on or
//   off (each keeps its preset size and place), who sees the dashboard (admins and reviewers share), and for admins
//   "Make it the home dashboard of …" a role.
// Your own choices are saved with your account (per company); the shared dashboards and a role's home with the company.
// Today's "Arrange" (an admin moving and resizing widgets by hand) and the AutoQA and Tasks tabs come later.
import { can, ROLE_LABELS, ROLES, type Role } from '@qsmart/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import {
  ALL_WIDGETS,
  Board,
  type CompanyDashboards,
  DEFAULTS,
  groupOf,
  homeOf,
  ordered,
  pack,
  TEMPLATES,
} from './Dashboard';
import { currentLanguage } from './i18n';
import { type MyDashboards, useSession } from './session';
import { card, type CompanyRef, dangerButton, field, Notice, primaryButton, smallButton, useAction } from './ui';

type Kind = 'home' | 'mine' | 'shared' | 'template';
interface View {
  id: string;
  kind: Kind;
  name: string;
  items: string[];
  /** shared ones: the roles that see them */
  roles?: string[];
  byId?: string | null;
}
const GROUPS = ['Numbers', 'Charts', 'Categories', 'People', 'Lists', 'Work', 'Performance', 'Customers', 'More'];

export function Personalize({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const { me, reloadMe } = useSession();
  const [companyViews, setCompanyViews] = useState<CompanyDashboards | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [selected, setSelected] = useState('home');
  const [display, setDisplay] = useState(false);
  const [viewAs, setViewAs] = useState<Role | ''>('');
  const [naming, setNaming] = useState<{ mode: 'new' | 'copy' | 'rename'; name: string; from?: View } | null>(null);
  const { message, run, fail } = useAction();

  const load = useCallback(() => {
    void Promise.all([
      api<CompanyDashboards>('/dashboards', company.id),
      api<{ membershipId: string; email: string }[]>('/people', company.id).catch(() => []),
    ]).then(([d, people]) => {
      setCompanyViews(d);
      setMyId(people.find((p) => p.email === me.email)?.membershipId ?? null);
    }, fail);
  }, [company.id, me.email, fail]);
  useEffect(load, [load]);

  const mine: MyDashboards = me.prefs.dashboards?.[company.id] ?? {};
  const admin = company.role === 'admin';
  const sharer = can(company.role, 'dashboards.shareViews');
  const roleHome = (role: string) => companyViews?.roles[role] ?? DEFAULTS[role] ?? [];
  const views: View[] = [
    {
      id: 'home',
      kind: 'home',
      name: t('pers.home'),
      items: viewAs ? roleHome(viewAs) : homeOf(mine, company.role, companyViews),
    },
    ...(mine.views ?? []).map((v) => ({ ...v, kind: 'mine' as const })),
    ...(companyViews?.shared ?? []).map((v) => ({ ...v, kind: 'shared' as const })),
    ...TEMPLATES.map((x) => ({
      id: x.id,
      kind: 'template' as const,
      name: t(`pers.templates.${x.id}.name`),
      items: x.items,
    })),
  ];
  const view = views.find((v) => v.id === selected) ?? (views[0] as View);
  const editable =
    (view.kind === 'home' && !viewAs) ||
    view.kind === 'mine' ||
    (view.kind === 'shared' && sharer && (admin || view.byId === myId));

  /** saves my own choices for this company, with my account */
  const saveMine = (next: MyDashboards, done = t('pers.saved')) =>
    run(
      () =>
        api('/me/prefs', undefined, {
          method: 'PUT',
          body: { ...me.prefs, dashboards: { ...me.prefs.dashboards, [company.id]: next } },
        }),
      done,
      reloadMe,
    );
  const share = (v: { id: string; name: string; items: string[]; roles: string[] }) =>
    run(() => api(`/dashboards/shared/${v.id}`, company.id, { method: 'PUT', body: v }), t('pers.saved'), load);

  /** a view's widgets changed (switched on or off) */
  const setItems = (items: string[]) => {
    if (view.kind === 'home') return saveMine({ ...mine, home: items });
    if (view.kind === 'mine')
      return saveMine({ ...mine, views: (mine.views ?? []).map((v) => (v.id === view.id ? { ...v, items } : v)) });
    if (view.kind === 'shared') return share({ id: view.id, name: view.name, items, roles: view.roles ?? [] });
    return Promise.resolve(false);
  };
  /** who sees a dashboard: a role added to my own dashboard shares it; no role left makes it mine again */
  const toggleRole = async (role: string) => {
    const roles = view.roles?.includes(role) ? view.roles.filter((r) => r !== role) : [...(view.roles ?? []), role];
    if (view.kind === 'mine') {
      const ok = await share({ id: view.id, name: view.name, items: view.items, roles });
      if (ok) await saveMine({ ...mine, views: (mine.views ?? []).filter((v) => v.id !== view.id) });
      return;
    }
    if (view.kind !== 'shared') return;
    if (roles.length) return void (await share({ id: view.id, name: view.name, items: view.items, roles }));
    // nobody else sees it any more: it becomes the sharer's own dashboard again
    const ok = await run(
      () => api(`/dashboards/shared/${view.id}`, company.id, { method: 'DELETE' }),
      t('pers.saved'),
      load,
    );
    if (ok && view.byId === myId)
      await saveMine({ ...mine, views: [...(mine.views ?? []), { id: view.id, name: view.name, items: view.items }] });
  };
  const remove = async () => {
    if (!window.confirm(t('pers.confirmDelete'))) return;
    if (view.kind === 'mine')
      await saveMine({ ...mine, views: (mine.views ?? []).filter((v) => v.id !== view.id) }, t('pers.deleted'));
    else if (view.kind === 'shared')
      await run(() => api(`/dashboards/shared/${view.id}`, company.id, { method: 'DELETE' }), t('pers.deleted'), load);
    setSelected('home');
  };
  const nameSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!naming) return;
    const name = naming.name.trim().slice(0, 40);
    if (!name) return;
    if (naming.mode === 'rename') {
      if (view.kind === 'mine')
        await saveMine({ ...mine, views: (mine.views ?? []).map((v) => (v.id === view.id ? { ...v, name } : v)) });
      else if (view.kind === 'shared') await share({ id: view.id, name, items: view.items, roles: view.roles ?? [] });
    } else {
      const id = `v-${Date.now().toString(36)}`;
      const items = naming.from?.items ?? homeOf(mine, company.role, companyViews);
      const ok = await saveMine({ ...mine, views: [...(mine.views ?? []), { id, name, items: ordered(items) }] });
      if (ok) setSelected(id);
    }
    setNaming(null);
  };

  const who = (v: View) =>
    v.kind === 'home'
      ? t('pers.shownOnDashboard')
      : v.kind === 'template'
        ? t(`pers.templates.${v.id}.desc`)
        : v.kind === 'shared'
          ? t('pers.sharedWith', {
              roles: (v.roles ?? [])
                .map((r) => (r === 'all' ? t('pers.everyone') : ROLE_LABELS[lang][r as Role]))
                .join(', '),
            })
          : t('pers.onlyYou');
  const note =
    view.kind === 'home'
      ? viewAs
        ? t('pers.viewingAs', { role: ROLE_LABELS[lang][viewAs] })
        : t('pers.thisIsYours')
      : view.kind === 'template'
        ? t('pers.templateNote')
        : who(view);

  const tileButton = (v: View, sub: string) => (
    <button
      key={v.id}
      type="button"
      aria-pressed={selected === v.id}
      onClick={() => {
        setSelected(v.id);
        setDisplay(false);
      }}
      className={`${card} !p-3 grid gap-1.5 text-left hover:border-tx ${selected === v.id ? 'ring-2 ring-brand' : ''}`}
    >
      <b>{v.name}</b>
      <small className="text-mu">{sub}</small>
      <Thumbnail items={v.items} />
    </button>
  );
  const own = views.filter((v) => v.kind === 'mine' || v.kind === 'shared');

  return (
    <section className="grid gap-4" aria-labelledby="pers-title">
      <div className="grid gap-1">
        <h1 id="pers-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
          {t('menu.pages.pers')}
        </h1>
        <p className="text-sm text-mu">{t('pers.intro')}</p>
      </div>
      <Notice message={message} />

      <h2 className="font-semibold">{t('pers.yourHome')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tileButton(views[0] as View, who(views[0] as View))}
      </div>
      <h2 className="font-semibold">{t('pers.yours')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {own.map((v) => tileButton(v, who(v)))}
        <button
          type="button"
          className={`${card} !p-3 grid gap-1.5 border-dashed text-left hover:border-tx`}
          onClick={() => setNaming({ mode: 'new', name: '' })}
        >
          <b>+ {t('pers.newDashboard')}</b>
          <small className="text-mu">{t('pers.newHelp')}</small>
        </button>
      </div>
      <h2 className="font-semibold">{t('pers.readyMade')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {views.filter((v) => v.kind === 'template').map((v) => tileButton(v, who(v)))}
      </div>

      {naming && (
        <form className={`${card} flex flex-wrap items-end gap-2`} onSubmit={(e) => void nameSave(e)}>
          <label className="grid flex-1 gap-1 text-sm font-medium">
            {naming.mode === 'rename' ? t('pers.renameTitle') : t('pers.nameTitle')}
            <input
              className={field}
              required
              maxLength={40}
              autoFocus
              value={naming.name}
              onChange={(e) => setNaming({ ...naming, name: e.target.value })}
            />
          </label>
          <button type="button" className={smallButton} onClick={() => setNaming(null)}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={primaryButton}>
            {t('common.save')}
          </button>
        </form>
      )}

      <section className={`${card} grid gap-3`} aria-labelledby="pers-view">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="pers-view" className="font-display text-xl font-bold">
              {view.name}
            </h2>
            <small className="text-mu">{note}</small>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={primaryButton} onClick={() => setDisplay(true)}>
              {t('pers.display')}
            </button>
            {view.kind !== 'home' && (
              <button
                type="button"
                className={smallButton}
                onClick={() => void saveMine({ ...mine, home: ordered(view.items) }, t('pers.isHome'))}
              >
                {t('pers.useAsHome')}
              </button>
            )}
            {!editable && view.kind !== 'home' && (
              <button
                type="button"
                className={smallButton}
                onClick={() =>
                  setNaming({ mode: 'copy', name: `${view.name} · ${t('pers.myCopy')}`.slice(0, 40), from: view })
                }
              >
                + {t('pers.makeCopy')}
              </button>
            )}
            {editable && view.kind !== 'home' && (
              <>
                <button
                  type="button"
                  className={smallButton}
                  onClick={() => setNaming({ mode: 'rename', name: view.name })}
                >
                  {t('pers.rename')}
                </button>
                <button type="button" className={dangerButton} onClick={() => void remove()}>
                  {t('common.delete')}
                </button>
              </>
            )}
            {admin && view.kind === 'home' && (
              <select
                className={field}
                aria-label={t('pers.viewAs')}
                value={viewAs}
                onChange={(e) => setViewAs(e.target.value as Role | '')}
              >
                <option value="">{t('pers.viewAsMe')}</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t('pers.viewAsRole', { role: ROLE_LABELS[lang][r] })}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <Board
          company={company}
          ids={ordered(view.items)}
          base={mine.base ?? 'conversation'}
          grouping={mine.grouping ?? 'week'}
          personalize={false}
        />
      </section>

      {display && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setDisplay(false)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="display-title"
            className="grid h-full w-full max-w-md content-start gap-5 overflow-auto border-l border-bd bg-pn p-5 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="display-title" className="font-display text-xl font-bold">
                  {t('pers.displayTitle')}
                </h2>
                <small className="text-mu">{view.name}</small>
              </div>
              <button
                type="button"
                className="text-xl text-mu hover:text-tx"
                aria-label={t('pers.close')}
                onClick={() => setDisplay(false)}
              >
                ×
              </button>
            </div>
            <fieldset className="grid gap-1.5">
              <legend className="mb-1 font-semibold">{t('pers.countBy')}</legend>
              {(['conversation', 'review'] as const).map((b) => (
                <label key={b} className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="base"
                    className="accent-[var(--brand)]"
                    checked={(mine.base ?? 'conversation') === b}
                    onChange={() => void saveMine({ ...mine, base: b })}
                  />
                  {t(`pers.bases.${b}`)}
                </label>
              ))}
              <small className="text-mu">{t('pers.baseNote')}</small>
            </fieldset>
            <fieldset className="grid gap-1.5">
              <legend className="mb-1 font-semibold">{t('pers.chartsBy')}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {(['day', 'week', 'month', 'quarter'] as const).map((g) => (
                  <label key={g} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="grouping"
                      className="accent-[var(--brand)]"
                      checked={(mine.grouping ?? 'week') === g}
                      onChange={() => void saveMine({ ...mine, grouping: g })}
                    />
                    {t(`pers.groupings.${g}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="grid gap-1.5">
              <legend className="mb-1 font-semibold">{t('pers.showHide')}</legend>
              <small className="text-mu">{editable ? t('pers.showHideNote') : t('pers.readOnlyNote')}</small>
              {GROUPS.filter((g) => ALL_WIDGETS.some((id) => groupOf(id) === g)).map((g) => (
                <div key={g} className="grid gap-1">
                  <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-mu">
                    {t(`pers.groups.${g}`)}
                  </div>
                  {ALL_WIDGETS.filter((id) => groupOf(id) === g).map((id) => (
                    <label key={id} className="inline-flex items-center gap-2 text-sm" title={widgetHelp(t, id)}>
                      <input
                        type="checkbox"
                        role="switch"
                        className="accent-[var(--brand)]"
                        disabled={!editable}
                        checked={view.items.includes(id)}
                        onChange={(e) =>
                          void setItems(
                            ordered(e.target.checked ? [...view.items, id] : view.items.filter((x) => x !== id)),
                          )
                        }
                      />
                      {widgetTitle(t, id)}
                    </label>
                  ))}
                </div>
              ))}
            </fieldset>
            {(view.kind === 'mine' || view.kind === 'shared') && sharer && editable && (
              <fieldset className="grid gap-1.5">
                <legend className="mb-1 font-semibold">{t('pers.whoSees')}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {['all', ...ROLES].map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={view.roles?.includes(r) ?? false}
                      className={`rounded-full border px-3 py-1 text-sm ${view.roles?.includes(r) ? 'border-brand bg-pn2 font-semibold' : 'border-bd'}`}
                      onClick={() => void toggleRole(r)}
                    >
                      {r === 'all' ? t('pers.everyone') : ROLE_LABELS[lang][r as Role]}
                    </button>
                  ))}
                </div>
                {!view.roles?.length && <small className="text-mu">{t('pers.onlyYouPersonal')}</small>}
              </fieldset>
            )}
            <div className="grid gap-2 border-t border-bd pt-3">
              {view.kind === 'home' && !viewAs && mine.home && (
                <button
                  type="button"
                  className={smallButton}
                  onClick={() => {
                    const { home: _home, ...rest } = mine;
                    void saveMine(rest);
                  }}
                >
                  {t('pers.backToRole')}
                </button>
              )}
              {admin && (
                <select
                  className={field}
                  value=""
                  aria-label={t('pers.makeRoleHome')}
                  onChange={(e) => {
                    const role = e.target.value;
                    if (role)
                      void run(
                        () =>
                          api(`/dashboards/roles/${role}`, company.id, {
                            method: 'PUT',
                            body: { items: ordered(view.items) },
                          }),
                        t('pers.roleHomeSaved'),
                        load,
                      );
                  }}
                >
                  <option value="">{t('pers.makeRoleHome')}</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t('pers.everyoneWho', { role: ROLE_LABELS[lang][r] })}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

/** A dashboard in miniature: one bar per widget, at its width (today's thumbnail). */
function Thumbnail({ items }: { items: string[] }) {
  const parts = pack(ordered(items)).slice(0, 12);
  return (
    <div className="flex flex-wrap gap-[3px]" aria-hidden="true">
      {parts.map((p) => (
        <i
          key={p.id}
          className="block h-2 rounded-sm bg-mu/25"
          style={{ width: `calc(${((p.span / 60) * 100).toFixed(1)}% - 3px)` }}
        />
      ))}
    </div>
  );
}

type T = (key: string, options?: Record<string, unknown>) => string;
/** A widget's name and explanation: the number tiles and charts of step 1 keep theirs under "dash", the others under "widgets". */
const widgetTitle = (t: T, id: string) =>
  id.startsWith('kpi_')
    ? t(`dash.tiles.${id}.title`)
    : id === 'qtime' || id === 'cattime'
      ? t(`dash.charts.${id}`)
      : t(`widgets.${id}.title`);
const widgetHelp = (t: T, id: string) =>
  id.startsWith('kpi_')
    ? t(`dash.tiles.${id}.help`)
    : id === 'qtime' || id === 'cattime'
      ? t(`dash.charts.${id}Help`)
      : t(`widgets.${id}.help`);
