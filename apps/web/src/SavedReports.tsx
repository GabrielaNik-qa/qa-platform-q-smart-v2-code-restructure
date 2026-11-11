// Quality › Reports › Saved & scheduled (today's reports.js `PG.rsaved`): my reports and the shared ones, each with its
// first numbers, and its schedule: every day, week or month at an hour (in my time zone), arriving in my bell. The
// "also by e-mail" choice is kept; the e-mails start once Q-smart sends e-mails (Phase 7). Only the person who saved a
// report, or an admin, schedules or deletes it.
import { runReport } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { formatValue, type SavedReport, useReportData, useReportWords } from './ReportBuilder';
import { useSession } from './session';
import { card, type CompanyRef, field, Notice, primaryButton, smallButton, useAction } from './ui';

type Schedule = SavedReport['schedule'];
const LOCALES = { en: 'en-GB', bg: 'bg-BG', fr: 'fr-FR' } as const;

export function SavedReports({ company }: { company: CompanyRef }) {
  const { t, i18n } = useTranslation();
  const w = useReportWords();
  const { company: session } = useSession();
  const { message, run, fail } = useAction();
  const data = useReportData(company.id);
  const [reports, setReports] = useState<SavedReport[] | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; s: Schedule } | null>(null);
  const me = session?.membershipId ?? '';
  const locale = LOCALES[(i18n.language as keyof typeof LOCALES) || 'en'] ?? 'en-GB';

  const load = useCallback(() => {
    api<SavedReport[]>('/reports', company.id).then(setReports, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);

  const mineList = (reports ?? []).filter((r) => r.byId === me);
  const others = (reports ?? []).filter((r) => r.byId !== me);
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 10, 1 + i).toLocaleDateString(locale, { weekday: 'long' }),
  );
  const describe = (s: Schedule) =>
    s.freq === 'none'
      ? t('saved.notScheduled')
      : `${t(`saved.freqs.${s.freq}`)}${s.freq === 'weekly' ? ` · ${weekdays[s.weekday ?? 1]}` : s.freq === 'monthly' ? ` · ${t('saved.onDay', { day: s.day ?? 1 })}` : ''} · ${String(s.hour ?? 8).padStart(2, '0')}:00`;

  const one = (r: SavedReport) => {
    const res = data ? runReport(r.cfg, data, Date.now()) : null;
    const owner = r.byId === me || company.role === 'admin';
    return (
      <div key={r.id} className={`${card} grid content-start gap-2`}>
        <div className="flex items-start justify-between gap-2">
          <b className="text-lg">{r.name}</b>
          {r.shared && (
            <span className="rounded-full bg-ac/15 px-2 text-xs font-semibold text-ac">{t('saved.shared')}</span>
          )}
        </div>
        <small className="text-mu">
          {w.source(r.cfg.src)} · {w.period(r.cfg.period.p)} · {t('plans.by', { name: r.byName })}
        </small>
        {res && (
          <div className="flex flex-wrap gap-2">
            {res.metrics.slice(0, 3).map((m) => (
              <div key={m} className="rounded-s bg-pn2 px-3 py-1.5">
                <small className="block text-xs text-mu">{w.metric(res.src, m)}</small>
                <b className="font-mono">{formatValue(m, res.grand[m])}</b>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`rounded-full px-2 text-xs ${r.schedule.freq === 'none' ? 'bg-bd/60' : 'bg-ok/12 text-ok'}`}>
            {r.schedule.freq === 'none' ? '' : '⏰ '}
            {describe(r.schedule)}
          </span>
          {r.lastSentAt && (
            <small className="text-mu">
              {t('saved.lastSent', { date: new Date(r.lastSentAt).toLocaleString(locale) })}
            </small>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link
            to="/$app/$page"
            params={{ app: 'quality', page: 'report-builder' }}
            search={{ report: r.id }}
            className={primaryButton}
          >
            {t('saved.open')}
          </Link>
          {owner && (
            <>
              <button
                type="button"
                className={smallButton}
                onClick={() =>
                  setEditing({ id: r.id, name: r.name, s: { hour: 8, weekday: 1, day: 1, ...r.schedule } })
                }
              >
                ⏰ {t('saved.schedule')}
              </button>
              <button
                type="button"
                className={`${smallButton} text-bad`}
                onClick={() => {
                  if (!window.confirm(t('saved.confirmDelete'))) return;
                  void run(() => api(`/reports/${r.id}`, company.id, { method: 'DELETE' }), t('saved.deleted'), load);
                }}
              >
                {t('goals.delete')}
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const label = 'grid gap-1 text-sm font-medium';
  return (
    <section className="grid gap-4" aria-labelledby="saved-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="saved-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('menu.pages.rsaved')}
          </h1>
          <p className="text-sm text-mu">{t('saved.intro')}</p>
        </div>
        <Link to="/$app/$page" params={{ app: 'quality', page: 'report-builder' }} className={primaryButton}>
          + {t('reports.new')}
        </Link>
      </div>
      <Notice message={message} />
      {!reports ? (
        <p className="text-mu">{t('common.loading')}</p>
      ) : !reports.length ? (
        <p className={`${card} text-mu`}>{t('saved.none')}</p>
      ) : (
        <>
          {mineList.length > 0 && (
            <div className="grid gap-2">
              <h2 className="font-semibold">{t('saved.mine')}</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{mineList.map(one)}</div>
            </div>
          )}
          {others.length > 0 && (
            <div className="grid gap-2">
              <h2 className="font-semibold">{t('saved.others')}</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{others.map(one)}</div>
            </div>
          )}
        </>
      )}
      <p className="text-sm text-mu">{t('saved.note')}</p>
      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="sched-title"
            className="grid w-full max-w-[520px] gap-3 rounded-l border border-bd bg-pn p-5 shadow-card"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const s = editing.s;
              const schedule = {
                freq: s.freq,
                weekday: s.weekday ?? 1,
                day: Math.min(28, Math.max(1, s.day ?? 1)),
                hour: Math.min(23, Math.max(0, s.hour ?? 8)),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                email: Boolean(s.email),
                to: s.to ?? '',
              };
              void run(
                () => api(`/reports/${editing.id}`, company.id, { method: 'PUT', body: { schedule } }),
                s.freq === 'none' ? t('saved.unscheduled') : t('saved.scheduled'),
                () => {
                  setEditing(null);
                  load();
                },
              );
            }}
          >
            <h2 id="sched-title" className="font-display text-xl font-bold">
              {t('saved.scheduleTitle', { name: editing.name })}
            </h2>
            <label className={label}>
              {t('saved.send')}
              <select
                className={field}
                value={editing.s.freq}
                onChange={(e) =>
                  setEditing({ ...editing, s: { ...editing.s, freq: e.target.value as Schedule['freq'] } })
                }
              >
                {(['none', 'daily', 'weekly', 'monthly'] as const).map((f) => (
                  <option key={f} value={f}>
                    {f === 'none' ? t('saved.notScheduled') : t(`saved.freqs.${f}`)}
                  </option>
                ))}
              </select>
            </label>
            {editing.s.freq === 'weekly' && (
              <label className={label}>
                {t('saved.on')}
                <select
                  className={field}
                  value={editing.s.weekday ?? 1}
                  onChange={(e) => setEditing({ ...editing, s: { ...editing.s, weekday: Number(e.target.value) } })}
                >
                  {weekdays.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {editing.s.freq === 'monthly' && (
              <label className={label}>
                {t('saved.dayOfMonth')}
                <input
                  className={field}
                  type="number"
                  min={1}
                  max={28}
                  value={editing.s.day ?? 1}
                  onChange={(e) => setEditing({ ...editing, s: { ...editing.s, day: Number(e.target.value) } })}
                />
              </label>
            )}
            {editing.s.freq !== 'none' && (
              <>
                <label className={label}>
                  {t('saved.hour')}
                  <input
                    className={field}
                    type="number"
                    min={0}
                    max={23}
                    value={editing.s.hour ?? 8}
                    onChange={(e) => setEditing({ ...editing, s: { ...editing.s, hour: Number(e.target.value) } })}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-[var(--brand)]"
                    checked={Boolean(editing.s.email)}
                    onChange={(e) => setEditing({ ...editing, s: { ...editing.s, email: e.target.checked } })}
                  />
                  {t('saved.email')}
                </label>
                {editing.s.email && (
                  <label className={label}>
                    {t('saved.to')}
                    <input
                      className={field}
                      maxLength={500}
                      value={editing.s.to ?? ''}
                      onChange={(e) => setEditing({ ...editing, s: { ...editing.s, to: e.target.value } })}
                    />
                    <small className="font-normal text-mu">{t('saved.emailLater')}</small>
                  </label>
                )}
              </>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className={smallButton} onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </button>
              <button type="submit" className={primaryButton}>
                {t('saved.saveSchedule')}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
