// The frame of every page: today's sidebar (brand, menu search, groups with their pages, sections that fold into a
// row of icons, the Apps of the main menu, light/dark/system, and the person at the bottom), with the plan's app
// switcher beside the brand. Pages still to come are greyed with "Soon", as today.
import { ROLE_LABELS } from '@qsmart/shared';
import { Link, Outlet, useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mark, type ThemeMode, useThemeMode } from './chrome';
import { currentLanguage } from './i18n';
import {
  allSoon,
  type AppId,
  appNameKey,
  firstPage,
  isBuilt,
  type MenuApp,
  type MenuGroup,
  menuFor,
  pathOf,
} from './menu';
import { ICONS, type IconName, MENU_TEXTS } from './menu-data';

import { signOutAndClear, useSession } from './session';
import './shell.css';

/** One of today's line icons. */
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      // today's icon drawings, from our own code (menu-data.ts): never text typed by anyone
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}

const FOLD_KEY = 'qsmart.menu.folded'; // folded sections: a setting kept in the browser (plan, section 13)
const readFolded = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(FOLD_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
/** Today's name under the photo: G.Georgieva (the first name's initial and the last name). */
const shortName = (name: string) => {
  const words = name.trim().split(/\s+/);
  return words.length > 1 ? `${words[0]?.[0] ?? ''}.${words[words.length - 1]}` : name;
};
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function Shell() {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const navigate = useNavigate();
  const routerInstance = useRouter();
  const { pathname } = useLocation();
  const { company, me, setCompany } = useSession();
  const role = company?.role;
  const apps = useMemo(() => (role ? menuFor(role) : []), [role]);
  const [, appPart, pagePart] = pathname.split('/');
  const onOwner = pathname === '/owner';
  const current = apps.find((a) => a.id === appPart) ?? (onOwner ? undefined : apps[0]);
  const activeGroup = current?.groups.find((g) => g.pages.some((p) => p.id === pagePart));

  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [folded, setFolded] = useState<Record<string, boolean>>(readFolded);
  const [switcher, setSwitcher] = useState(false);
  const theme = useThemeMode();
  const name = me.name ?? me.email ?? '';

  const fold = (key: string) => {
    // at sign-in every section starts folded into its row of icons, as today (Gabriela, 29 October)
    const next = { ...folded, [key]: !(folded[key] ?? true) };
    setFolded(next);
    try {
      localStorage.setItem(FOLD_KEY, JSON.stringify(next));
    } catch {
      // private window
    }
  };
  const isFolded = (key: string) => folded[key] ?? true;
  const appName = (id: AppId) => t(`menu.apps.${appNameKey(id, role)}`);
  const go = (to: string) => void navigate({ to });

  const groupRow = (app: MenuApp, g: MenuGroup) => {
    const one = g.pages.length === 1;
    const active = activeGroup?.id === g.id && current?.id === app.id;
    const open = !one && (opened[g.id] ?? active);
    const first = g.pages[0];
    return (
      <div
        key={g.id}
        className={`grp g-${g.id} ${allSoon(app.id, g) ? 'soon' : ''} ${open ? 'open' : ''} ${active ? 'act' : ''}`}
      >
        <button
          type="button"
          className="gh"
          aria-expanded={one ? undefined : open}
          onClick={() => {
            // a second click on the group shown folds it; otherwise it opens with its first page (as today)
            if (active && open) setOpened({ ...opened, [g.id]: false });
            else {
              setOpened({ ...opened, [g.id]: true });
              if (first && !active) go(pathOf(app.id, first));
            }
          }}
        >
          <i>
            <Icon name={g.icon} size={22} />
          </i>
          <span>{t(`menu.groups.${g.id}`)}</span>
          {!one && <em aria-hidden="true">›</em>}
        </button>
        {open && (
          <div className="sub">
            {g.pages.map((p) => {
              const soon = !isBuilt(app.id, p);
              return (
                <Link
                  key={p.id}
                  to={pathOf(app.id, p)}
                  className={`${current?.id === app.id && pagePart === p.id ? 'on' : ''} ${soon ? 'soon' : ''}`}
                  aria-current={current?.id === app.id && pagePart === p.id ? 'page' : undefined}
                >
                  {t(`menu.pages.${p.key}`)}
                  {soon && <small>{t('shell.soon')}</small>}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  /** Groups, in today's sections (main menu: Operations, Manage; Admin: Account, People, Setup, Governance, Platform). */
  const groupsOf = (app: MenuApp) => {
    if (!app.sections.length) return app.groups.map((g) => groupRow(app, g));
    return app.sections.map((key, i) => {
      const inSection = app.groups.filter((g) => g.section === key);
      if (!inSection.length) return null;
      return (
        <div key={key}>
          <button
            type="button"
            className={`apph sech ${i === 0 ? 'first' : ''}`}
            aria-expanded={!isFolded(key)}
            title={t('shell.showHide')}
            onClick={() => fold(key)}
          >
            <span>{t(`menu.sections.${key}`)}</span>
            <em aria-hidden="true">{isFolded(key) ? '›' : '⌄'}</em>
          </button>
          {isFolded(key) ? (
            <div className="appsr">
              {inSection.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`appi g-${g.id} ${allSoon(app.id, g) ? 'soon' : ''} ${activeGroup?.id === g.id ? 'on' : ''}`}
                  title={t(`menu.groups.${g.id}`)}
                  aria-label={t(`menu.groups.${g.id}`)}
                  onClick={() => g.pages[0] && go(pathOf(app.id, g.pages[0]))}
                >
                  <Icon name={g.icon} size={22} />
                </button>
              ))}
            </div>
          ) : (
            inSection.map((g) => groupRow(app, g))
          )}
        </div>
      );
    });
  };

  // the Apps of the main menu (today: the panels under the line), folded into a row of icons or one row each
  const others = apps.filter((a) => a.id !== 'quality' && a.id !== 'admin');
  const appsSection = (
    <>
      <button
        type="button"
        className="apph"
        aria-expanded={!isFolded('apps')}
        title={t('shell.showHide')}
        onClick={() => fold('apps')}
      >
        <span>{t('menu.sections.apps')}</span>
        <em aria-hidden="true">{isFolded('apps') ? '›' : '⌄'}</em>
      </button>
      {isFolded('apps') ? (
        <div className="appsr">
          {others.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`appi app-${a.id}`}
              title={appName(a.id)}
              aria-label={appName(a.id)}
              onClick={() => go(firstPage(a))}
            >
              <Icon name={a.icon} size={22} />
            </button>
          ))}
        </div>
      ) : (
        others.map((a) => (
          <div key={a.id} className={`grp spc sp-${a.id}`}>
            <button type="button" className="gh" onClick={() => go(firstPage(a))}>
              <i>
                <Icon name={a.icon} size={22} />
              </i>
              <span>{appName(a.id)}</span>
              <em aria-hidden="true">↗</em>
            </button>
          </div>
        ))
      )}
    </>
  );

  const main = apps.find((a) => a.id === 'quality');
  const home = main ? firstPage(main) : '/owner';
  const modes: [ThemeMode, IconName, string][] = [
    ['light', 'sun', t('common.lightMode')],
    ['dark', 'moon', t('common.darkMode')],
    ['system', 'mon', t('shell.systemMode')],
  ];
  const admin = apps.find((a) => a.id === 'admin');

  return (
    <div className="shell">
      <nav className="sb" aria-label={t('shell.mainMenu')}>
        <div className="brandrow">
          <button type="button" className="brand" onClick={() => go(home)}>
            <Mark size={34} />
            <div>
              <b>Q-SMART</b>
              <small>{company?.name ?? t('shell.owner')}</small>
            </div>
          </button>
          <AppSwitcher
            open={switcher}
            setOpen={setSwitcher}
            apps={apps}
            owner={me.platformAdmin}
            current={onOwner ? 'owner' : current?.id}
            appName={appName}
          />
        </div>
        {me.companies.length > 1 && company && (
          <select
            className="cosel"
            aria-label={t('shell.company')}
            value={company.id}
            onChange={(e) => {
              setCompany(e.target.value);
              go('/');
            }}
          >
            {me.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <MenuSearch apps={apps} appName={appName} />
        {current && current.id !== 'quality' && (
          <>
            <div className="grp spb">
              <button type="button" className="gh" onClick={() => go(home)}>
                <i>
                  <Icon name="back" size={20} />
                </i>
                <span>{t('shell.back')}</span>
              </button>
            </div>
            {current.id !== 'admin' && <div className="spt">{appName(current.id)}</div>}
          </>
        )}
        {current && groupsOf(current)}
        {current?.id === 'quality' && others.length > 0 && appsSection}
        {onOwner && !company && (
          <div className="grp act">
            <button type="button" className="gh">
              <i>
                <Icon name="g_admin" size={22} />
              </i>
              <span>{t('shell.owner')}</span>
            </button>
          </div>
        )}

        <div className="ft">
          <div className="thm" role="group" aria-label={t('common.lightDark')}>
            {modes.map(([mode, icon, label]) => (
              <button
                key={mode}
                type="button"
                data-m={mode}
                className={theme.mode === mode ? 'on' : ''}
                aria-pressed={theme.mode === mode}
                title={label}
                aria-label={label}
                onClick={() => theme.choose(mode)}
              >
                <span className="ti">
                  <Icon name={icon} />
                </span>
              </button>
            ))}
          </div>
          <div className="usr">
            <button
              type="button"
              className="av2"
              title={t('shell.myAccount')}
              aria-label={t('shell.myAccount')}
              onClick={() => go('/admin/profile')}
            >
              {initials(name)}
            </button>
            <button type="button" className="un" title={t('shell.myAccount')} onClick={() => go('/admin/profile')}>
              <b>{shortName(name)}</b>
              <small>{role ? ROLE_LABELS[lang][role] : t('shell.owner')}</small>
            </button>
            {admin && (
              <button
                type="button"
                title={appName('admin')}
                aria-label={appName('admin')}
                onClick={() => go(firstPage(admin))}
              >
                <Icon name="gear" />
              </button>
            )}
            <button
              type="button"
              title={t('shell.signOut')}
              aria-label={t('shell.signOut')}
              onClick={() => {
                // the next person starts on the first page, with nothing of this person left in the browser
                void signOutAndClear().then(() => routerInstance.navigate({ to: '/', replace: true }));
              }}
            >
              <Icon name="out" />
            </button>
          </div>
        </div>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

/** The plan's app switcher (like Google's or Atlassian's): every app the person has, and the owner area for you. */
function AppSwitcher({
  open,
  setOpen,
  apps,
  owner,
  current,
  appName,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  apps: MenuApp[];
  owner: boolean;
  current: string | undefined;
  appName: (id: AppId) => string;
}) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open, setOpen]);
  return (
    <div ref={box}>
      <button
        type="button"
        className="swb"
        aria-expanded={open}
        aria-controls="app-switcher"
        title={t('shell.switchApp')}
        aria-label={t('shell.switchApp')}
        onClick={() => setOpen(!open)}
      >
        <Icon name="grid" size={20} />
      </button>
      {open && (
        <div className="swl" id="app-switcher">
          <b>{t('shell.switchApp')}</b>
          {apps.map((a) => (
            <Link
              key={a.id}
              to={firstPage(a)}
              className={`app-${a.id} ${current === a.id ? 'on' : ''}`}
              onClick={() => setOpen(false)}
            >
              <i>
                <Icon name={a.icon} size={22} />
              </i>
              {appName(a.id)}
            </Link>
          ))}
          {owner && (
            <Link to="/owner" className={current === 'owner' ? 'on' : ''} onClick={() => setOpen(false)}>
              <i>
                <Icon name="g_admin" size={22} />
              </i>
              {t('shell.owner')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** Today's "Search the menu…": page names in the chosen language or in English; Enter or a click opens one. */
function MenuSearch({ apps, appName }: { apps: MenuApp[]; appName: (id: AppId) => string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState(0);
  const [shown, setShown] = useState(false);
  const all = useMemo(
    () =>
      apps.flatMap((app) =>
        app.groups.flatMap((group) =>
          group.pages.map((page) => ({
            app,
            group,
            page,
            name: t(`menu.pages.${page.key}`),
            english: MENU_TEXTS.en.pages[page.key] ?? '',
          })),
        ),
      ),
    [apps, t],
  );
  const q = plain(query.trim());
  const found = q ? all.filter((it) => plain(it.name).includes(q) || plain(it.english).includes(q)).slice(0, 8) : [];
  const open = (i: number) => {
    const it = found[i];
    setQuery('');
    setShown(false);
    if (it) void navigate({ to: pathOf(it.app.id, it.page) });
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setQuery('');
      event.currentTarget.blur();
    } else if (event.key === 'ArrowDown' && found.length) {
      event.preventDefault();
      setChosen((chosen + 1) % found.length);
    } else if (event.key === 'ArrowUp' && found.length) {
      event.preventDefault();
      setChosen((chosen - 1 + found.length) % found.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      open(chosen);
    }
  };
  return (
    <div className="sbw">
      <label className="sbs">
        <Icon name="search" />
        <input
          placeholder={t('shell.searchMenu')}
          aria-label={t('shell.searchMenu')}
          autoComplete="off"
          role="combobox"
          aria-expanded={shown && found.length > 0}
          aria-controls="menu-search-list"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setChosen(0);
            setShown(true);
          }}
          onFocus={() => setShown(true)}
          onBlur={() => setTimeout(() => setShown(false), 150)}
          onKeyDown={onKey}
        />
      </label>
      {shown && q && (
        <div className="sbl" id="menu-search-list" role="listbox">
          {found.length === 0 && <p>{t('shell.nothingFound')}</p>}
          {found.map((it, i) => (
            <button
              key={`${it.app.id}/${it.page.id}`}
              type="button"
              role="option"
              aria-selected={i === chosen}
              className={`palr ${i === chosen ? 'on' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                open(i);
              }}
            >
              <span className="pali">
                <Icon name={it.group.icon} />
              </span>
              <span>
                <b>{it.name}</b>
                <small>
                  {appName(it.app.id)} › {t(`menu.groups.${it.group.id}`)}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
