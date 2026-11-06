// Quality › Quick Flags, as today: a red or green flag on a call, chat or e-mail, kept apart from QA reviews (scores
// never change). One row per conversation: every review, plus the conversations that only have quick flags (matched on
// lead ID and agent). The tiles, search and filters, the flag filter, columns to choose (saved with the account),
// Export to Excel, and the "New Quick Flag" window (also to change or delete a flag).
import { passes } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiFile } from './api';
import { Icon } from './icon';
import { Pager, pageOf } from './Pager';
import { type Channel, type PassRates, passRateFor, type ReviewRow } from './QAEntry';
import { useSession } from './session';
import {
  card,
  type CompanyRef,
  dangerButton,
  field,
  Notice,
  type PersonRow,
  smallButton,
  type TeamRow,
  useAction,
} from './ui';

type FlagType = 'red' | 'green';
export interface QuickFlag {
  id: string;
  type: FlagType;
  channel: Channel;
  agentId: string | null;
  agentName: string;
  teamId: string | null;
  teamName: string;
  leadId: string;
  flaggedOn: string;
  campaign: string;
  leadLink: string;
  conversationLink: string;
  comment: string;
  byName: string;
}
interface Row {
  key: string;
  leadId: string;
  agentId: string | null;
  agentName: string;
  teamId: string | null;
  teamName: string;
  day: string;
  campaign: string;
  channel: Channel;
  review: ReviewRow | undefined;
  flags: QuickFlag[];
  red: boolean;
  green: boolean;
}
type FlagFilter = 'all' | 'flagged' | 'red' | 'green' | 'none';
const FLAG_FILTERS: Record<FlagFilter, (r: Row) => boolean> = {
  all: () => true,
  flagged: (r) => r.red || r.green,
  red: (r) => r.red,
  green: (r) => r.green,
  none: (r) => !r.red && !r.green,
};
type Period = 'week' | 'month' | 'all' | 'custom';
type Column = 'leadId' | 'type' | 'date' | 'agent' | 'team' | 'campaign' | 'score' | 'flags' | 'comments' | 'by';
const COLUMNS: Column[] = ['leadId', 'type', 'date', 'agent', 'team', 'campaign', 'score', 'flags', 'comments', 'by'];
/** today's default: everything except Comments and Flagged by (the lead ID always shows) */
const DEFAULT_COLUMNS = COLUMNS.filter((c) => c !== 'comments' && c !== 'by');
const CHANNELS: Channel[] = ['call', 'chat', 'email', 'other'];
interface Filters {
  period: Period;
  from: string;
  to: string;
  team: string;
  agent: string;
  channel: '' | Channel;
  flag: FlagFilter;
}
const NO_FILTERS: Filters = { period: 'month', from: '', to: '', team: '', agent: '', channel: '', flag: 'all' };
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toLocaleDateString('sv-SE');
const today = () => new Date().toLocaleDateString('sv-SE');
const keyOf = (leadId: string, agentId: string | null, agentName: string) =>
  `${leadId.trim().toLowerCase()}|${agentId ?? agentName}`;
const flagColor = (type: FlagType) => (type === 'red' ? 'text-bad' : 'text-ok');

/** The form of the "New Quick Flag" window (id when changing one). */
interface Draft {
  id?: string;
  byName?: string;
  type: FlagType;
  channel: Channel;
  teamId: string;
  agentId: string;
  leadId: string;
  flaggedOn: string;
  campaign: string;
  leadLink: string;
  conversationLink: string;
  comment: string;
}

export function QuickFlags({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const { me } = useSession();
  const [flags, setFlags] = useState<QuickFlag[] | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [rates, setRates] = useState<PassRates | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [showColumns, setShowColumns] = useState(false);
  const [columns, setColumns] = useState<Column[]>(() => {
    const saved = me.prefs.columns?.['flags'];
    return saved?.length ? COLUMNS.filter((c) => c === 'leadId' || saved.includes(c)) : DEFAULT_COLUMNS;
  });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [exporting, setExporting] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const { message, run, fail } = useAction();

  const load = useCallback(() => {
    void Promise.all([
      api<QuickFlag[]>('/flags', company.id),
      api<ReviewRow[]>('/reviews', company.id),
      api<PassRates>('/pass-rates', company.id),
      api<TeamRow[]>('/teams', company.id),
      api<PersonRow[]>('/people', company.id),
    ]).then(([f, r, pr, tm, ppl]) => {
      setFlags(f);
      setReviews(r);
      setRates(pr);
      setTeams(tm.filter((x) => !x.isAdministration));
      setPeople(ppl);
    }, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);

  const set = (change: Partial<Filters>) => {
    setFilters({ ...filters, ...change });
    setPage(1);
  };

  /** one row per conversation: the reviews, then the flags matched to them on lead ID and agent (as today) */
  const all = useMemo<Row[]>(() => {
    const rows = new Map<string, Row>();
    for (const r of reviews)
      rows.set(keyOf(r.leadId, r.agentId, r.agentName), {
        key: keyOf(r.leadId, r.agentId, r.agentName),
        leadId: r.leadId,
        agentId: r.agentId,
        agentName: r.agentName,
        teamId: r.teamId,
        teamName: r.teamName,
        day: r.reviewedOn,
        campaign: `${r.reviewedOn} ${r.campaign || 'general'}`,
        channel: r.channel,
        review: r,
        flags: [],
        red: false,
        green: false,
      });
    for (const f of flags ?? []) {
      const key = keyOf(f.leadId, f.agentId, f.agentName);
      const row = rows.get(key) ?? {
        key,
        leadId: f.leadId,
        agentId: f.agentId,
        agentName: f.agentName,
        teamId: f.teamId,
        teamName: f.teamName,
        day: f.flaggedOn,
        campaign: `${f.flaggedOn} ${f.campaign || 'general'}`,
        channel: f.channel,
        review: undefined,
        flags: [],
        red: false,
        green: false,
      };
      row.flags.push(f);
      rows.set(key, row);
    }
    return [...rows.values()].map((r) => ({
      ...r,
      red: r.review?.flag === 'red' || r.flags.some((f) => f.type === 'red'),
      green: r.review?.flag === 'green' || r.flags.some((f) => f.type === 'green'),
    }));
  }, [reviews, flags]);

  /** every filter but the flag filter: the tiles and the flag filter count within them (as today) */
  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    const f = filters;
    return all
      .filter(
        (r) =>
          (!f.channel || r.channel === f.channel) &&
          (!f.team || r.teamId === f.team) &&
          (!f.agent || r.agentId === f.agent) &&
          (f.period === 'all' ||
            (f.period === 'week' && r.day >= daysAgo(6)) ||
            (f.period === 'month' && r.day >= daysAgo(29)) ||
            (f.period === 'custom' && (!f.from || r.day >= f.from) && (!f.to || r.day <= f.to))) &&
          (!q ||
            `${r.leadId} ${r.agentName} ${r.campaign} ${r.flags.map((x) => x.comment).join(' ')}`
              .toLowerCase()
              .includes(q)),
      )
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  }, [all, filters, query]);
  const shown = base.filter(FLAG_FILTERS[filters.flag]);
  const { current, slice } = pageOf(shown, page, perPage);
  const count = (k: FlagFilter) => base.filter(FLAG_FILTERS[k]).length;

  const saveColumns = (next: Column[]) => {
    setColumns(next);
    void api('/me/prefs', undefined, {
      method: 'PUT',
      body: { ...me.prefs, columns: { ...me.prefs.columns, flags: next } },
    }).catch(() => undefined);
  };
  async function exportExcel() {
    setExporting(true);
    await run(async () => {
      const file = await apiFile('/flags/export', company.id, {
        rows: shown.map((r) => ({ reviewId: r.review?.id ?? null, flagIds: r.flags.map((f) => f.id) })),
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = `Quick_Flags_${today()}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    }, t('list.export'));
    setExporting(false);
  }

  const newFlag = (type: FlagType, row?: Row) =>
    setDraft({
      type,
      channel: row?.channel ?? (filters.channel || 'call'),
      teamId: row?.teamId ?? filters.team,
      agentId: row?.agentId ?? filters.agent,
      leadId: row?.leadId ?? '',
      flaggedOn: row?.day ?? today(),
      campaign: row?.review?.campaign ?? row?.flags[0]?.campaign ?? '',
      leadLink: '',
      conversationLink: '',
      comment: '',
    });
  const editFlag = (f: QuickFlag) =>
    setDraft({
      id: f.id,
      byName: f.byName,
      type: f.type,
      channel: f.channel,
      teamId: f.teamId ?? '',
      agentId: f.agentId ?? '',
      leadId: f.leadId,
      flaggedOn: f.flaggedOn,
      campaign: f.campaign,
      leadLink: f.leadLink,
      conversationLink: f.conversationLink,
      comment: f.comment,
    });

  const agents = people.filter((p) => p.role === 'agent' && (!filters.team || p.teamId === filters.team));
  const badge = (type: FlagType, label: string, title: string, onClick?: () => void) => {
    const look = `inline-flex items-center gap-1 rounded-full border px-2 text-xs font-semibold whitespace-nowrap ${type === 'red' ? 'border-bad/40 bg-bad/10 text-bad' : 'border-ok/40 bg-ok/10 text-ok'}`;
    return onClick ? (
      <button type="button" className={`${look} hover:brightness-95`} title={title} onClick={onClick}>
        ⚑ {label}
      </button>
    ) : (
      <span className={look} title={title}>
        ⚑ {label}
      </span>
    );
  };
  const cell: Record<Column, (r: Row) => ReactNode> = {
    leadId: (r) =>
      r.review ? (
        <Link to="/review/$id" params={{ id: r.review.id }} className="font-mono font-semibold text-ac hover:underline">
          {r.leadId}
        </Link>
      ) : (
        <button
          type="button"
          className="font-mono font-semibold text-ac hover:underline"
          onClick={() => r.flags[0] && editFlag(r.flags[0])}
        >
          {r.leadId}
        </button>
      ),
    type: (r) => t(`reviews.channels.${r.channel}`),
    date: (r) => <span className="whitespace-nowrap">{r.day}</span>,
    agent: (r) => r.agentName,
    team: (r) => r.teamName || '—',
    campaign: (r) => r.campaign,
    score: (r) =>
      !r.review ? (
        <small className="text-mu">{t('flags.noReview')}</small>
      ) : r.review.notScored ? (
        <small className="text-mu">{t('list.notScored')}</small>
      ) : (
        <b
          className={`font-mono ${passes(r.review.score, passRateFor(rates, r.review.teamId)) ? 'text-ok' : 'text-bad'}`}
        >
          {r.review.score}%
        </b>
      ),
    flags: (r) => {
      const qa = r.review?.flag;
      return qa || r.flags.length ? (
        <div className="flex flex-wrap gap-1">
          {qa && badge(qa, t('flags.qa', { flag: t(`flags.${qa}`) }), t('flags.qaFlag'))}
          {r.flags.map((f) => (
            <span key={f.id}>
              {badge(
                f.type,
                t(`flags.${f.type}`),
                t('flags.badge', {
                  comment: f.comment || t('flags.noComment'),
                  name: f.byName,
                  date: f.flaggedOn,
                }),
                () => editFlag(f),
              )}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-mu">—</span>
      );
    },
    comments: (r) =>
      r.flags
        .map((f) => f.comment)
        .filter(Boolean)
        .join(' | ') || '—',
    by: (r) => [...new Set(r.flags.map((f) => f.byName))].join(', ') || '—',
  };
  const tile = (key: FlagFilter, label: string, value: number, color: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={filters.flag === key}
      onClick={() => set({ flag: key })}
      className={`${card} text-left grid gap-1 ${filters.flag === key ? 'ring-2 ring-brand' : ''}`}
    >
      <span className="text-sm text-mu flex items-center justify-between gap-2">
        {label} <span className={color}>⚑</span>
      </span>
      <b className={`font-display text-3xl ${color}`}>{value}</b>
    </button>
  );
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
  const iconButton = 'inline-grid place-items-center size-8 rounded-s hover:bg-pn2';

  return (
    <section className="grid gap-4" aria-labelledby="flags-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="flags-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('menu.pages.flags')}
          </h1>
          <p className="text-sm text-mu">{t('flags.intro')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={smallButton}
            disabled={exporting || shown.length === 0}
            onClick={() => void exportExcel()}
          >
            {exporting ? t('list.exporting') : t('list.export')}
          </button>
          <button
            type="button"
            className="rounded-m bg-brand text-on-brand font-semibold px-3 py-1.5 text-sm"
            onClick={() => newFlag('red')}
          >
            + {t('flags.newFlag')}
          </button>
        </div>
      </div>
      <Notice message={message} />

      <div className="grid gap-3 sm:grid-cols-3">
        {tile('flagged', t('flags.total'), count('flagged'), 'text-tx')}
        {tile('red', t('flags.reds'), count('red'), 'text-bad')}
        {tile('green', t('flags.greens'), count('green'), 'text-ok')}
      </div>

      <div className={`${card} grid gap-3`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="grid gap-1 text-sm font-medium">
            {t('disputes.search')}
            <input
              className={field}
              type="search"
              placeholder={t('list.search')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>
          {select(
            t('reviews.team'),
            filters.team,
            teams.map((x) => [x.id, x.name]),
            (v) => set({ team: v, agent: '' }),
          )}
          {select(
            t('reviews.agent'),
            filters.agent,
            agents.map((p) => [p.membershipId, p.name]),
            (v) => set({ agent: v }),
          )}
          {select(
            t('list.type'),
            filters.channel,
            CHANNELS.map((c) => [c, t(`reviews.channels.${c}`)]),
            (v) => set({ channel: v as Filters['channel'] }),
          )}
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{t('flags.filter')}</span>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('flags.filter')}>
            {(['all', 'flagged', 'red', 'green', 'none'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={filters.flag === k}
                className={`rounded-full border px-3 py-1 text-sm ${filters.flag === k ? 'border-brand bg-pn2 font-semibold' : 'border-bd'}`}
                onClick={() => set({ flag: k })}
              >
                {k === 'red' && <span className="text-bad">● </span>}
                {k === 'green' && <span className="text-ok">● </span>}
                {t(`flags.filters.${k}`)} <small className="font-mono">{count(k)}</small>
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`${smallButton} ml-auto`}
            onClick={() => {
              setFilters(NO_FILTERS);
              setQuery('');
              setPage(1);
            }}
          >
            {t('list.clear')}
          </button>
        </div>
      </div>

      <div className={`${card} grid gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            {filters.channel ? t(`reviews.channels.${filters.channel}`) : t('flags.conversations')}
            <span className="rounded-full bg-pn2 border border-bd px-2 text-sm font-normal">{shown.length}</span>
          </h2>
          <button
            type="button"
            className={smallButton}
            aria-expanded={showColumns}
            onClick={() => setShowColumns(!showColumns)}
          >
            {t('list.columns')}
          </button>
        </div>
        {showColumns && (
          <fieldset className="flex flex-wrap gap-x-4 gap-y-2 border-y border-bd py-2">
            <legend className="sr-only">{t('list.columns')}</legend>
            {COLUMNS.map((c) => (
              <label key={c} className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="accent-[var(--brand)]"
                  checked={columns.includes(c)}
                  disabled={c === 'leadId'}
                  onChange={(e) =>
                    saveColumns(COLUMNS.filter((x) => (x === c ? e.target.checked : columns.includes(x))))
                  }
                />
                {t(`flags.cols.${c}`)}
              </label>
            ))}
          </fieldset>
        )}
        {!flags && <p className="text-mu">{t('common.loading')}</p>}
        {flags && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-mu">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="py-1 pr-3 font-semibold uppercase text-xs tracking-wide">
                      {t(`flags.cols.${c}`)}
                    </th>
                  ))}
                  <th className="py-1 font-semibold uppercase text-xs tracking-wide">{t('list.cols.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => (
                  <tr key={r.key} className="border-t border-bd align-middle">
                    {columns.map((c) => (
                      <td key={c} className="py-2 pr-3">
                        {cell[c](r)}
                      </td>
                    ))}
                    <td className="py-2 whitespace-nowrap">
                      <button
                        type="button"
                        className={`${iconButton} text-bad`}
                        title={t('flags.addRed')}
                        aria-label={`${t('flags.addRed')}: ${r.leadId}`}
                        onClick={() => newFlag('red', r)}
                      >
                        ⚑
                      </button>
                      <button
                        type="button"
                        className={`${iconButton} text-ok`}
                        title={t('flags.addGreen')}
                        aria-label={`${t('flags.addGreen')}: ${r.leadId}`}
                        onClick={() => newFlag('green', r)}
                      >
                        ⚑
                      </button>
                      {r.review ? (
                        <Link
                          to="/review/$id"
                          params={{ id: r.review.id }}
                          className={iconButton}
                          title={t('flags.view')}
                          aria-label={`${t('flags.view')}: ${r.leadId}`}
                        >
                          <Icon name="eye" />
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className={iconButton}
                          title={t('flags.view')}
                          aria-label={`${t('flags.view')}: ${r.leadId}`}
                          onClick={() => r.flags[0] && editFlag(r.flags[0])}
                        >
                          <Icon name="eye" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {slice.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 1} className="py-8 text-center text-mu">
                      {t('list.noResults')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <Pager count={shown.length} page={current} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
      </div>

      {draft && (
        <FlagWindow
          company={company}
          draft={draft}
          teams={teams}
          people={people}
          onClose={() => setDraft(null)}
          onDone={(text) => {
            setDraft(null);
            void run(async () => undefined, text, load);
          }}
        />
      )}
    </section>
  );
}

/** "New Quick Flag" / "Edit Quick Flag" (today's pop-up). */
function FlagWindow({
  company,
  draft,
  teams,
  people,
  onClose,
  onDone,
}: {
  company: CompanyRef;
  draft: Draft;
  teams: TeamRow[];
  people: PersonRow[];
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [d, setD] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const { message, fail } = useAction();
  const change = (c: Partial<Draft>) => setD((latest) => ({ ...latest, ...c }));
  const red = d.type === 'red';
  const agents = people.filter((p) => p.role === 'agent' && p.active && p.teamId === d.teamId);

  useEffect(() => {
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);

  async function save() {
    if (busy) return; // a double-click on Save must not add the flag twice
    setBusy(true);
    try {
      const { id, byName: _by, teamId: _team, ...body } = d;
      await api(id ? `/flags/${id}` : '/flags', company.id, { method: id ? 'PUT' : 'POST', body });
      onDone(id ? t('flags.saved') : red ? t('flags.addedRed') : t('flags.addedGreen'));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!d.id || !window.confirm(t('flags.confirmDelete'))) return;
    try {
      await api(`/flags/${d.id}`, company.id, { method: 'DELETE' });
      onDone(t('flags.deleted'));
    } catch (e) {
      fail(e);
    }
  }
  const optional = <span className="text-mu font-normal">{t('flags.optional')}</span>;
  const label = 'grid gap-1 text-sm font-medium';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="flag-window-title"
        className="w-full max-w-[560px] max-h-[90vh] overflow-auto rounded-l border border-bd bg-pn shadow-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex items-start gap-3 border-b border-bd px-5 py-4">
          <span className={`text-2xl ${flagColor(d.type)}`} aria-hidden="true">
            ⚑
          </span>
          <div className="grid">
            <h2 id="flag-window-title" className="font-display text-xl font-bold">
              {d.id ? t('flags.editTitle') : t('flags.newTitle')}
            </h2>
            <small className="text-mu">{t('flags.subtitle')}</small>
          </div>
          <button
            type="button"
            className="ml-auto text-xl text-mu hover:text-tx"
            aria-label={t('flags.close')}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="grid gap-4 px-5 py-4">
          <fieldset className="grid gap-1">
            <legend className="text-sm font-semibold mb-1">{t('flags.flagType')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(['red', 'green'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={d.type === type}
                  className={`rounded-m border px-3 py-2 font-semibold ${d.type === type ? (type === 'red' ? 'border-bad bg-bad/10 text-bad' : 'border-ok bg-ok/10 text-ok') : 'border-bd'}`}
                  onClick={() => change({ type })}
                >
                  ⚑ {type === 'red' ? t('flags.redFlag') : t('flags.greenFlag')}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="grid gap-1">
            <legend className="text-sm font-semibold mb-1">{t('flags.channel')}</legend>
            <div className="flex flex-wrap gap-1">
              {CHANNELS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={d.channel === c}
                  className={`rounded-full border px-3 py-1 text-sm ${d.channel === c ? 'border-brand bg-pn2 font-semibold' : 'border-bd'}`}
                  onClick={() => change({ channel: c })}
                >
                  {t(`reviews.channels.${c}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              <span>
                {t('reviews.team')} <i className="text-bad not-italic">*</i>
              </span>
              <select
                className={field}
                value={d.teamId}
                required
                onChange={(e) => change({ teamId: e.target.value, agentId: '' })}
              >
                <option value="">{t('flags.pickTeam')}</option>
                {teams.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              <span>
                {t('reviews.agent')} <i className="text-bad not-italic">*</i>
              </span>
              <select
                className={field}
                value={d.agentId}
                required
                disabled={!d.teamId}
                onChange={(e) => change({ agentId: e.target.value })}
              >
                <option value="">{d.teamId ? t('flags.pickAgent') : t('flags.teamFirst')}</option>
                {agents.map((p) => (
                  <option key={p.membershipId} value={p.membershipId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              <span>
                {t('flags.cols.leadId')} <i className="text-bad not-italic">*</i>
              </span>
              <input
                className={field}
                required
                maxLength={60}
                placeholder={t('flags.leadPlaceholder')}
                value={d.leadId}
                onChange={(e) => change({ leadId: e.target.value })}
              />
            </label>
            <label className={label}>
              {t('flags.cols.date')}
              <input
                type="date"
                className={field}
                required
                value={d.flaggedOn}
                onChange={(e) => change({ flaggedOn: e.target.value })}
              />
            </label>
          </div>
          <label className={label}>
            <span>
              {t('flags.cols.campaign')} {optional}
            </span>
            <input
              className={field}
              maxLength={80}
              placeholder={t('flags.campaignPlaceholder')}
              value={d.campaign}
              onChange={(e) => change({ campaign: e.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              <span>
                {t('flags.crmLink')} {optional}
              </span>
              <input
                type="url"
                className={field}
                placeholder="https://…"
                value={d.leadLink}
                onChange={(e) => change({ leadLink: e.target.value })}
              />
            </label>
            <label className={label}>
              <span>
                {t(`flags.links.${d.channel}`)} {optional}
              </span>
              <input
                type="url"
                className={field}
                placeholder="https://…"
                value={d.conversationLink}
                onChange={(e) => change({ conversationLink: e.target.value })}
              />
            </label>
          </div>
          <label className={label}>
            <span>
              {t('flags.comment')} {optional}
            </span>
            <textarea
              className={field}
              rows={3}
              maxLength={1000}
              placeholder={t('flags.commentPlaceholder')}
              value={d.comment}
              onChange={(e) => change({ comment: e.target.value })}
            />
          </label>
          <Notice message={message} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {d.id && (
              <>
                <button type="button" className={`${dangerButton} mr-auto`} onClick={() => void remove()}>
                  {t('common.delete')}
                </button>
                <small className="text-mu">{t('flags.by', { name: d.byName })}</small>
              </>
            )}
            <button type="button" className={smallButton} onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className={`rounded-m px-4 py-2 font-semibold text-white disabled:opacity-60 ${red ? 'bg-bad' : 'bg-ok'}`}
            >
              {d.id ? t('flags.save') : red ? t('flags.createRed') : t('flags.createGreen')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
