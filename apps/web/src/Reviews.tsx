// Quality › Reviews, as today: the reviews a person may see (agents their own, staff their workspaces, admins all),
// with search, filters, the review types as chips, columns to choose (saved with the account), sorting, pages of
// 10/20/50/100, and Export to Excel (always in English, as today).
import { can, passes } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiFile } from './api';
import { Icon } from './icon';
import { type Channel, type PassRates, passRateFor, type ReviewRow } from './QAEntry';
import { Pager, pageOf } from './Pager';
import { useSession } from './session';
import { card, type CompanyRef, field, Notice, type PersonRow, smallButton, type TeamRow, useAction } from './ui';

type Period = 'week' | 'month' | 'all' | 'custom';
type Column =
  | 'leadId'
  | 'type'
  | 'date'
  | 'agent'
  | 'team'
  | 'campaign'
  | 'reviewer'
  | 'score'
  | 'result'
  | 'flag'
  | 'status'
  | 'seen'
  | 'scorecard'
  | 'subject';
const COLUMNS: Column[] = [
  'leadId',
  'type',
  'date',
  'agent',
  'team',
  'campaign',
  'reviewer',
  'score',
  'result',
  'flag',
  'status',
  'seen',
  'scorecard',
  'subject',
];
/** today's default: everything except Result, Scorecard and Subject (the lead ID always shows) */
const DEFAULT_COLUMNS = COLUMNS.filter((c) => !['result', 'scorecard', 'subject'].includes(c));
const CHANNELS: Channel[] = ['call', 'chat', 'email', 'other'];

interface Filters {
  period: Period;
  from: string;
  to: string;
  team: string;
  agent: string;
  channel: '' | Channel;
  result: '' | 'pass' | 'fail';
  status: '' | 'disputed' | 'ok';
  flag: '' | 'red' | 'green' | 'none';
  seen: '' | 'seen' | 'unseen';
  reviewer: string;
  scorecard: string;
}
const NO_FILTERS: Filters = {
  period: 'month',
  from: '',
  to: '',
  team: '',
  agent: '',
  channel: '',
  result: '',
  status: '',
  flag: '',
  seen: '',
  reviewer: '',
  scorecard: '',
};
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toLocaleDateString('sv-SE');

export function Reviews({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const { me } = useSession();
  const staff = can(company.role, 'reviews.write');
  const agentView = company.role === 'agent';
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [rates, setRates] = useState<PassRates | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [panel, setPanel] = useState<'' | 'filters' | 'columns'>('');
  const [columns, setColumns] = useState<Column[]>(() => {
    const saved = me.prefs.columns?.['reviews'];
    return saved?.length ? COLUMNS.filter((c) => c === 'leadId' || saved.includes(c)) : DEFAULT_COLUMNS;
  });
  const [sort, setSort] = useState<{ key: Column; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [exporting, setExporting] = useState(false);
  const { message, run, fail } = useAction();

  const load = useCallback(() => {
    void Promise.all([
      api<ReviewRow[]>('/reviews', company.id),
      api<PassRates>('/pass-rates', company.id),
      agentView ? Promise.resolve([]) : api<TeamRow[]>('/teams', company.id),
      agentView ? Promise.resolve([]) : api<PersonRow[]>('/people', company.id),
    ]).then(([rows, r, tm, ppl]) => {
      setReviews(rows);
      setRates(r);
      setTeams(tm.filter((x) => !x.isAdministration));
      setPeople(ppl);
    }, fail);
  }, [company.id, agentView, fail]);
  useEffect(load, [load]);

  const passed = useCallback((r: ReviewRow) => passes(r.score, passRateFor(rates, r.teamId)), [rates]);
  const campaignOf = (r: ReviewRow) => `${r.reviewedOn} ${r.campaign || 'general'}`; // today's campaign column
  const set = (change: Partial<Filters>) => {
    setFilters({ ...filters, ...change });
    setPage(1);
  };

  /** every filter but the type: the chips count within the other filters (as today) */
  const inFilters = useCallback(
    (r: ReviewRow, ignoreChannel = false) => {
      const f = filters;
      if (f.period === 'week' && r.reviewedOn < daysAgo(6)) return false;
      if (f.period === 'month' && r.reviewedOn < daysAgo(29)) return false;
      if (f.period === 'custom' && ((f.from && r.reviewedOn < f.from) || (f.to && r.reviewedOn > f.to))) return false;
      if (f.team && r.teamId !== f.team) return false;
      if (f.agent && r.agentId !== f.agent) return false;
      if (!ignoreChannel && f.channel && r.channel !== f.channel) return false;
      if (f.result === 'pass' && !passed(r)) return false;
      if (f.result === 'fail' && (r.notScored || passed(r))) return false;
      if (f.status && (f.status === 'disputed') !== (r.status === 'disputed')) return false;
      if (f.flag === 'none' ? r.flag !== '' : f.flag && r.flag !== f.flag) return false;
      if (f.seen && (f.seen === 'seen') !== Boolean(r.seenAt)) return false;
      if (f.reviewer && r.reviewerName !== f.reviewer) return false;
      if (f.scorecard && r.scorecardName !== f.scorecard) return false;
      const q = query.trim().toLowerCase();
      if (q) {
        const text = `${r.leadId} ${r.agentName} ${campaignOf(r)} ${r.emailSubject} ${r.channelName}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    },
    [filters, query, passed],
  );

  const shown = useMemo(() => {
    const value: Record<Column, (r: ReviewRow) => string | number> = {
      leadId: (r) => r.leadId.toLowerCase(),
      type: (r) => r.channel,
      date: (r) => `${r.reviewedOn} ${r.createdAt}`,
      agent: (r) => r.agentName,
      team: (r) => r.teamName,
      campaign: (r) => campaignOf(r),
      reviewer: (r) => r.reviewerName,
      score: (r) => r.score ?? -1,
      result: (r) => (passed(r) ? 1 : 0),
      flag: (r) => ({ red: 2, green: 1, '': 0 })[r.flag],
      status: (r) => r.status,
      seen: (r) => (r.seenAt ? 1 : 0),
      scorecard: (r) => r.scorecardName.toLowerCase(),
      subject: (r) => r.emailSubject.toLowerCase(),
    };
    const get = value[sort.key];
    return (reviews ?? [])
      .filter((r) => inFilters(r))
      .sort((a, b) => {
        const x = get(a);
        const y = get(b);
        return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
      });
  }, [reviews, inFilters, sort, passed]);

  const { current, slice } = pageOf(shown, page, perPage);
  const active = Object.entries(filters).filter(([k, v]) => v && !(k === 'period' && v === 'month')).length;

  const saveColumns = (next: Column[]) => {
    setColumns(next);
    // saved with the account, so the same on every browser (My account › Notifications & Confirmations restores them)
    void api('/me/prefs', undefined, {
      method: 'PUT',
      body: { ...me.prefs, columns: { ...me.prefs.columns, reviews: next } },
    }).catch(() => undefined);
  };

  async function exportExcel() {
    setExporting(true);
    const ok = await run(async () => {
      const file = await apiFile('/reviews/export', company.id, { ids: shown.map((r) => r.id), name: 'Reviews' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = `Reviews_${new Date().toLocaleDateString('sv-SE')}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    }, t('list.export'));
    setExporting(false);
    return ok;
  }

  const agents = people.filter((p) => p.role === 'agent' && (!filters.team || p.teamId === filters.team));
  const reviewers = [...new Set((reviews ?? []).map((r) => r.reviewerName))].sort();
  const scorecards = [...new Set((reviews ?? []).map((r) => r.scorecardName))].sort();
  const select = (label: string, value: string, options: [string, string][], change: (v: string) => void) => (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <select className={field} value={value} onChange={(e) => change(e.target.value)}>
        <option value="">{t('list.all')}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );

  const cell: Record<Column, (r: ReviewRow) => ReactNode> = {
    leadId: (r) => (
      <Link to="/review/$id" params={{ id: r.id }} className="font-mono font-semibold text-ac hover:underline">
        {r.leadId}
      </Link>
    ),
    type: (r) => t(`reviews.channels.${r.channel}`),
    date: (r) => <span className="whitespace-nowrap">{r.reviewedOn}</span>,
    agent: (r) => r.agentName,
    team: (r) => r.teamName || '-',
    campaign: (r) => campaignOf(r),
    reviewer: (r) => r.reviewerName || '-',
    score: (r) =>
      r.notScored ? (
        <span className="text-mu" title={t('list.notScoredHelp')}>
          {t('list.notScored')}
        </span>
      ) : (
        <div className="grid gap-1 min-w-20">
          <b className={`font-mono ${passed(r) ? 'text-ok' : 'text-bad'}`}>{r.score}%</b>
          <div className="h-1.5 rounded-full bg-sunk overflow-hidden">
            <div className={`h-full ${passed(r) ? 'bg-ok' : 'bg-bad'}`} style={{ width: `${r.score ?? 0}%` }} />
          </div>
        </div>
      ),
    result: (r) =>
      r.notScored ? (
        '-'
      ) : (
        <span className={passed(r) ? 'text-ok font-semibold' : 'text-bad font-semibold'}>
          {passed(r) ? t('reviews.passed') : t('reviews.failed')}
        </span>
      ),
    flag: (r) =>
      r.flag ? (
        <span className={r.flag === 'red' ? 'text-bad' : 'text-ok'} title={t(`list.flags.${r.flag}`)}>
          ⚑ <span className="sr-only">{t(`list.flags.${r.flag}`)}</span>
        </span>
      ) : (
        <span className="text-mu" title={t('list.flags.none')}>
          -
        </span>
      ),
    status: (r) => (
      <span
        className={`rounded-full px-2 text-xs font-semibold ${r.status === 'disputed' ? 'bg-wn/15 text-wn' : 'bg-ok/15 text-ok'}`}
      >
        {t(`list.statuses.${r.status === 'disputed' ? 'disputed' : 'ok'}`)}
      </span>
    ),
    seen: (r) => (
      <span className={`rounded-full px-2 text-xs font-semibold ${r.seenAt ? 'bg-ok/15 text-ok' : 'bg-wn/15 text-wn'}`}>
        {r.seenAt ? t('list.seen') : t('list.notSeen')}
      </span>
    ),
    scorecard: (r) => r.scorecardName,
    subject: (r) => r.emailSubject || '-',
  };

  return (
    <section className="grid gap-4" aria-labelledby="reviews-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="reviews-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('menu.pages.calls')}
          </h1>
          <p className="text-sm text-mu">{t('list.intro')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${field} w-72`}
            type="search"
            aria-label={t('list.search')}
            placeholder={t('list.search')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          <button
            type="button"
            className={smallButton}
            aria-expanded={panel === 'filters'}
            onClick={() => setPanel(panel === 'filters' ? '' : 'filters')}
          >
            {t('list.filters')}
            {active > 0 ? ` (${active})` : ''}
          </button>
          <button
            type="button"
            className={smallButton}
            aria-expanded={panel === 'columns'}
            onClick={() => setPanel(panel === 'columns' ? '' : 'columns')}
          >
            {t('list.columns')}
          </button>
          <button
            type="button"
            className={smallButton}
            disabled={exporting || shown.length === 0}
            onClick={() => void exportExcel()}
          >
            {exporting ? t('list.exporting') : t('list.export')}
          </button>
        </div>
      </div>
      <Notice message={message} />

      {panel === 'filters' && (
        <div className={`${card} grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
          <label className="grid gap-1 text-sm font-medium">
            {t('list.period')}
            <select
              className={field}
              value={filters.period}
              onChange={(e) => set({ period: e.target.value as Period })}
            >
              {(['week', 'month', 'all', 'custom'] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`list.periods.${p}`)}
                </option>
              ))}
            </select>
          </label>
          {filters.period === 'custom' && (
            <div className="flex gap-2">
              <label className="grid gap-1 text-sm font-medium">
                {t('list.from')}
                <input
                  type="date"
                  className={field}
                  value={filters.from}
                  onChange={(e) => set({ from: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                {t('list.to')}
                <input type="date" className={field} value={filters.to} onChange={(e) => set({ to: e.target.value })} />
              </label>
            </div>
          )}
          {!agentView &&
            select(
              t('reviews.team'),
              filters.team,
              teams.map((x) => [x.id, x.name]),
              (v) => set({ team: v, agent: '' }),
            )}
          {!agentView &&
            select(
              t('reviews.agent'),
              filters.agent,
              agents.map((p) => [p.membershipId, p.name]),
              (v) => set({ agent: v }),
            )}
          {select(
            t('list.result'),
            filters.result,
            [
              ['pass', t('reviews.passed')],
              ['fail', t('reviews.failed')],
            ],
            (v) => set({ result: v as Filters['result'] }),
          )}
          {select(
            t('list.status'),
            filters.status,
            [
              ['disputed', t('list.statuses.disputed')],
              ['ok', t('list.statuses.ok')],
            ],
            (v) => set({ status: v as Filters['status'] }),
          )}
          {select(
            t('list.flag'),
            filters.flag,
            (['red', 'green', 'none'] as const).map((f) => [f, t(`list.flags.${f}`)]),
            (v) => set({ flag: v as Filters['flag'] }),
          )}
          {select(
            t('list.seenBy'),
            filters.seen,
            [
              ['seen', t('list.seen')],
              ['unseen', t('list.notSeen')],
            ],
            (v) => set({ seen: v as Filters['seen'] }),
          )}
          {!agentView &&
            select(
              t('reviews.reviewer'),
              filters.reviewer,
              reviewers.map((n) => [n, n]),
              (v) => set({ reviewer: v }),
            )}
          {select(
            t('reviews.scorecard'),
            filters.scorecard,
            scorecards.map((n) => [n, n]),
            (v) => set({ scorecard: v }),
          )}
          <div className="self-end">
            <button
              type="button"
              className={smallButton}
              onClick={() => {
                setFilters(NO_FILTERS);
                setPage(1);
              }}
            >
              {t('list.clear')}
            </button>
          </div>
        </div>
      )}

      {panel === 'columns' && (
        <fieldset className={`${card} flex flex-wrap gap-x-4 gap-y-2`}>
          <legend className="sr-only">{t('list.columns')}</legend>
          {COLUMNS.map((c) => (
            <label key={c} className="inline-flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                className="accent-[var(--brand)]"
                checked={columns.includes(c)}
                disabled={c === 'leadId'}
                onChange={(e) => saveColumns(COLUMNS.filter((x) => (x === c ? e.target.checked : columns.includes(x))))}
              />
              {t(`list.cols.${c}`)}
            </label>
          ))}
        </fieldset>
      )}

      <div className={`${card} grid gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            {filters.channel ? t(`reviews.channels.${filters.channel}`) : t('menu.pages.calls')}
            <span className="rounded-full bg-pn2 border border-bd px-2 text-sm font-normal">{shown.length}</span>
          </h2>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('list.type')}>
            {(['', ...CHANNELS] as const).map((c) => (
              <button
                key={c || 'all'}
                type="button"
                aria-pressed={filters.channel === c}
                className={`rounded-full border px-3 py-1 text-sm ${filters.channel === c ? 'border-brand bg-pn2 font-semibold' : 'border-bd'}`}
                onClick={() => set({ channel: c })}
              >
                {c ? t(`reviews.channels.${c}`) : t('list.all')} (
                {(reviews ?? []).filter((r) => inFilters(r, true) && (!c || r.channel === c)).length})
              </button>
            ))}
          </div>
        </div>
        {!reviews && <p className="text-mu">{t('common.loading')}</p>}
        {reviews && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-mu">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c}
                      className="py-1 pr-3 font-semibold uppercase text-xs tracking-wide"
                      aria-sort={sort.key === c ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}
                    >
                      <button
                        type="button"
                        title={t('list.sortBy', { column: t(`list.cols.${c}`) })}
                        onClick={() => {
                          setSort(
                            sort.key === c
                              ? { key: c, dir: sort.dir > 0 ? -1 : 1 }
                              : { key: c, dir: c === 'date' || c === 'score' ? -1 : 1 },
                          );
                          setPage(1);
                        }}
                      >
                        {t(`list.cols.${c}`)}{' '}
                        <span aria-hidden="true" className={sort.key === c ? '' : 'opacity-40'}>
                          {sort.key === c ? (sort.dir > 0 ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th className="py-1 font-semibold uppercase text-xs tracking-wide">{t('list.cols.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => (
                  <tr key={r.id} className="border-t border-bd align-middle">
                    {columns.map((c) => (
                      <td key={c} className="py-2 pr-3">
                        {cell[c](r)}
                      </td>
                    ))}
                    <td className="py-2 whitespace-nowrap">
                      <Link
                        to="/review/$id"
                        params={{ id: r.id }}
                        className="inline-grid place-items-center size-8 rounded-s hover:bg-pn2"
                        title={t('list.view')}
                        aria-label={`${t('list.view')}: ${r.leadId}`}
                      >
                        <Icon name="eye" />
                      </Link>
                      {staff && !r.seenAt && r.agentId && (
                        <button
                          type="button"
                          className="inline-grid place-items-center size-8 rounded-s hover:bg-pn2"
                          title={t('reviews.remind')}
                          aria-label={`${t('reviews.remind')}: ${r.leadId}`}
                          onClick={() =>
                            void run(
                              () => api(`/reviews/${r.id}/remind`, company.id, { method: 'POST', body: {} }),
                              t('reviews.reminded'),
                            )
                          }
                        >
                          <Icon name="bell" />
                        </button>
                      )}
                      {staff && (
                        <button
                          type="button"
                          className="inline-grid place-items-center size-8 rounded-s text-bad hover:bg-pn2"
                          title={t('common.delete')}
                          aria-label={`${t('common.delete')}: ${r.leadId}`}
                          onClick={() => {
                            if (window.confirm(t('reviews.confirmDelete')))
                              void run(
                                () => api(`/reviews/${r.id}`, company.id, { method: 'DELETE' }),
                                t('reviews.deleted'),
                                load,
                              );
                          }}
                        >
                          <Icon name="bin" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {slice.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 1} className="py-8 text-center text-mu">
                      {t('list.none')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <Pager count={shown.length} page={current} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
      </div>
    </section>
  );
}
