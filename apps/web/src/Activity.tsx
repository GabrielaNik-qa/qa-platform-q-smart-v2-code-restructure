// The activity log (Quality › Activity Log), as today: All activity, Sign-ins and Exports & downloads for admins,
// My activity for everyone. Newest first, the last 1000 entries; passwords are never recorded.
import { type Language, ROLE_LABELS, type Role, ROLES } from '@qsmart/shared';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { currentLanguage } from './i18n';
import { card, type CompanyRef, field, Notice, smallButton, useAction } from './ui';

export type ActivityKind = 'all' | 'mine' | 'signins' | 'exports';

interface Entry {
  id: string;
  at: string;
  actorName: string;
  actorRole: string | null;
  action: string;
  targetName: string;
  details: Record<string, string>;
  ip: string | null;
}

const LOCALES: Record<Language, string> = { en: 'en-GB', bg: 'bg-BG', fr: 'fr-FR' };
export const when = (at: string, lang: Language) =>
  new Intl.DateTimeFormat(LOCALES[lang], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(at));
const isRole = (value: string | null | undefined): value is Role => ROLES.includes(value as Role);
const roleName = (value: string | null | undefined, lang: Language) => (isRole(value) ? ROLE_LABELS[lang][value] : '-');

/** The entry as a sentence in the person's language (roles and "skill"/"language" translated too). */
export function describe(entry: Entry, t: TFunction, lang: Language): string {
  const d = entry.details;
  return t(`activity.actions.${entry.action}`, {
    target: entry.targetName,
    ...d,
    role: roleName(d['role'], lang),
    from: isRole(d['from']) ? roleName(d['from'], lang) : (d['from'] ?? ''),
    to: roleName(d['to'], lang),
    kind: d['kind'] === 'language' ? t('activity.language') : t('activity.skill'),
    outcome: d['outcome'] ? t(`disputes.outcomes.${d['outcome']}`) : '',
    defaultValue: entry.action,
  });
}

const TITLE: Record<ActivityKind, string> = {
  all: 'audit',
  mine: 'cs_myact',
  signins: 'cs_actsign',
  exports: 'cs_actexp',
};
const INTRO: Record<ActivityKind, string> = {
  all: 'activity.allIntro',
  mine: 'activity.mineIntro',
  signins: 'activity.signInsIntro',
  exports: 'activity.exportsIntro',
};

export function Activity({ kind, company }: { kind: ActivityKind; company: CompanyRef }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [query, setQuery] = useState('');
  const [person, setPerson] = useState('');
  const { message, fail } = useAction();

  const load = useCallback(() => {
    const path = kind === 'mine' ? '/activity/mine' : `/activity?kind=${kind}`;
    api<Entry[]>(path, company.id).then(setEntries, fail);
  }, [kind, company.id, fail]);
  useEffect(load, [load]);

  const q = query.trim().toLowerCase();
  const shown = (entries ?? []).filter(
    (e) =>
      (!person || e.actorName === person) &&
      (!q || `${describe(e, t, lang)} ${e.actorName} ${e.targetName}`.toLowerCase().includes(q)),
  );
  const people = [...new Set((entries ?? []).map((e) => e.actorName).filter(Boolean))].sort();
  const today = new Date().toDateString();
  const signInsToday = (entries ?? []).filter((e) => new Date(e.at).toDateString() === today).length;

  const th = 'py-1 pr-3 font-semibold';
  return (
    <section className="grid gap-4" aria-labelledby="activity-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="activity-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t(`menu.pages.${TITLE[kind]}`)}
          </h1>
          <p className="text-sm text-mu max-w-3xl">{t(INTRO[kind])}</p>
        </div>
        <button type="button" className={smallButton} onClick={load}>
          {t('activity.refresh')}
        </button>
      </div>
      <Notice message={message} />

      {kind === 'signins' && entries && (
        <div className="flex flex-wrap gap-3">
          {[
            [t('activity.signInsToday'), signInsToday],
            [t('activity.people'), new Set(entries.map((e) => e.actorName)).size],
          ].map(([label, value]) => (
            <div key={String(label)} className={`${card} min-w-40`}>
              <div className="text-sm text-mu">{label}</div>
              <div className="font-display text-3xl font-bold">{value}</div>
            </div>
          ))}
        </div>
      )}

      {kind !== 'exports' && (
        <div className="flex flex-wrap gap-2">
          <input
            className={`${field} min-w-60`}
            aria-label={t('activity.search')}
            placeholder={t('activity.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {kind !== 'mine' && (
            <select
              className={field}
              aria-label={t('activity.allPeople')}
              value={person}
              onChange={(e) => setPerson(e.target.value)}
            >
              <option value="">{t('activity.allPeople')}</option>
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className={card}>
        {!entries && <p className="text-mu">{t('common.loading')}</p>}
        {entries && shown.length === 0 && (
          <p className="text-mu m-0">{kind === 'exports' ? t('activity.nothingHere') : t('activity.nothing')}</p>
        )}
        {shown.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-mu">
                <tr>
                  <th className={th}>{t('activity.when')}</th>
                  <th className={th}>{t('activity.who')}</th>
                  {kind === 'all' && <th className={th}>{t('activity.role')}</th>}
                  <th className={th}>{t('activity.action')}</th>
                  {kind === 'signins' && <th className={th}>{t('activity.from')}</th>}
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 300).map((e) => (
                  <tr key={e.id} className="border-t border-bd align-top">
                    <td className="py-2 pr-3 whitespace-nowrap font-mono text-xs">{when(e.at, lang)}</td>
                    <td className="py-2 pr-3 font-semibold">{e.actorName || t('activity.owner')}</td>
                    {kind === 'all' && <td className="py-2 pr-3">{roleName(e.actorRole, lang)}</td>}
                    <td className="py-2 pr-3">{describe(e, t, lang)}</td>
                    {kind === 'signins' && <td className="py-2 pr-3 font-mono text-xs">{e.ip ?? '-'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
