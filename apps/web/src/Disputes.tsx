// Disputes, as today:
// - on a review's page, the agent disputes it (once) with a reason; the agent and the reviewers talk in its
//   conversation; an admin or reviewer resolves it (score kept, changed or partly changed, with a closing note);
// - Quality › Disputes: the tiles (Total, Disputed, In progress, Resolved), search and filters, the table with columns
//   to choose (saved with the account), Export to Excel, and for staff what the disputes say (how they end, which
//   categories, who disputes, whose reviews are disputed).
import { can, passes } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { when } from './Activity';
import { api, apiFile } from './api';
import { currentLanguage } from './i18n';
import { Icon } from './icon';
import { Pager, pageOf } from './Pager';
import { type Channel, type PassRates, passRateFor, type ReviewRow } from './QAEntry';
import { useSession } from './session';
import {
  card,
  type CompanyRef,
  field,
  Notice,
  type PersonRow,
  primaryButton,
  smallButton,
  type TeamRow,
  useAction,
} from './ui';

export type Outcome = 'kept' | 'changed' | 'partly';
type State = 'disputed' | 'progress' | 'resolved';
interface Message {
  id: string;
  authorName: string;
  authorRole: string;
  system: boolean;
  text: string;
  at: string;
  mine: boolean;
}
export interface Dispute {
  id: string;
  reviewId: string;
  openedAt: string;
  state: State;
  outcome: Outcome | null;
  note: string;
  resolvedByName: string;
  resolvedAt: string | null;
  /** "Not what I said": the answers of an AI review the agent marked, and the person's decision on each */
  marks: Mark[];
  messages: Message[];
}
type Answer = 'y' | 'n' | 'na';
export interface Mark {
  ci: number;
  qi: number;
  category: string;
  question: string;
  ai: Answer;
  right: Answer | null;
}
const ANSWERS: Answer[] = ['y', 'n', 'na'];
const OUTCOMES: Outcome[] = ['kept', 'changed', 'partly'];
const STATE_STYLE: Record<State, string> = {
  disputed: 'bg-bad/15 text-bad',
  progress: 'bg-ac/15 text-ac',
  resolved: 'bg-ok/15 text-ok',
};
const OUTCOME_STYLE: Record<Outcome, string> = {
  kept: 'bg-ac/15 text-ac',
  changed: 'bg-ok/15 text-ok',
  partly: 'bg-wn/15 text-wn',
};
const pill = 'rounded-full px-2 text-xs font-semibold whitespace-nowrap';

// ------------------------------------------------------------------------------------------- on the review's page

/** The review's dispute (loaded by the review's page, which also shows the "not what I said" marks on its answers). */
export function DisputeBox({
  company,
  review,
  dispute,
  setDispute,
  onChange,
}: {
  company: CompanyRef;
  review: ReviewRow;
  dispute: Dispute | null | undefined;
  setDispute: (next: Dispute) => void;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const [draft, setDraft] = useState('');
  const [resolving, setResolving] = useState<{
    outcome: Outcome;
    note: string;
    marks: { ci: number; qi: number; right: Answer }[];
  } | null>(null);
  const { message, run } = useAction();

  const after = (next: unknown) => {
    setDispute(next as Dispute);
    setDraft('');
    onChange();
  };

  if (dispute === undefined) return null;
  if (!dispute) {
    if (company.role !== 'agent') return null;
    return (
      <form
        className={`${card} grid gap-2`}
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            async () =>
              after(await api(`/disputes/${review.id}`, company.id, { method: 'POST', body: { text: draft } })),
            t('disputes.sent'),
          );
        }}
      >
        <label className="grid gap-2 font-semibold">
          {t('disputes.ask')}
          <textarea
            className={`${field} font-normal`}
            rows={3}
            maxLength={1000}
            placeholder={t('disputes.reasonPlaceholder')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <Notice message={message} />
        <button type="submit" className={`${primaryButton} justify-self-start`} disabled={!draft.trim()}>
          {t('disputes.disputeIt')}
        </button>
      </form>
    );
  }

  const open = dispute.state !== 'resolved';
  const outcomeText = (o: string) => t(`disputes.outcomes.${o}`);
  const answerText = (a: Answer) => t(`reviews.${a === 'y' ? 'yes' : a === 'n' ? 'no' : 'na'}`);
  return (
    <section className={`${card} grid gap-3`} aria-labelledby="dispute-title">
      <div className="flex items-center gap-2">
        <h2 id="dispute-title" className="font-semibold">
          {t('disputes.dispute')}
        </h2>
        <span className={`${pill} ${open ? 'bg-wn/15 text-wn' : 'bg-ok/15 text-ok'}`}>
          {open ? t('disputes.open') : t('disputes.states.resolved')}
        </span>
      </div>
      <ol className="grid gap-1.5 max-h-80 overflow-y-auto p-1" aria-label={t('disputes.dispute')}>
        {dispute.messages.map((m) =>
          m.system ? (
            <li key={m.id} className="rounded-xl bg-ok/15 text-ok text-sm text-center px-3 py-2">
              <small className="block opacity-80">
                {m.authorName} · {when(m.at, lang)}
              </small>
              {t('disputes.closing', { outcome: outcomeText(m.text) })}
              {dispute.note && `: ${dispute.note}`}
            </li>
          ) : (
            <li
              key={m.id}
              className={`rounded-xl px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap ${m.mine ? 'ml-auto bg-tx text-pn' : 'bg-sunk'}`}
            >
              <small className={`block ${m.mine ? 'opacity-70' : 'text-mu'}`}>
                {m.authorName} · {when(m.at, lang)}
              </small>
              {m.text}
            </li>
          ),
        )}
      </ol>
      {open && can(company.role, 'disputes.write') && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            void run(
              async () =>
                after(
                  await api(`/disputes/${review.id}/messages`, company.id, { method: 'POST', body: { text: draft } }),
                ),
              '',
            );
          }}
        >
          <textarea
            className={`${field} flex-1`}
            rows={2}
            maxLength={1000}
            aria-label={t('disputes.message')}
            placeholder={t('disputes.writeMessage')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className={primaryButton} disabled={!draft.trim()}>
            {t('disputes.send')}
          </button>
        </form>
      )}
      <Notice message={message?.text ? message : null} />
      {open && can(company.role, 'disputes.resolve') && !resolving && (
        <button
          type="button"
          className={`${smallButton} justify-self-start inline-flex items-center gap-1`}
          onClick={() =>
            setResolving({
              outcome: 'kept',
              note: '',
              marks: dispute.marks.map((m) => ({ ci: m.ci, qi: m.qi, right: m.ai })),
            })
          }
        >
          <Icon name="check" /> {t('disputes.resolve')}
        </button>
      )}
      {resolving && (
        <fieldset className="grid gap-2 border-t border-bd pt-3">
          <legend className="font-semibold">{t('disputes.resolve')}</legend>
          <p className="text-sm text-mu">{t('disputes.settle')}</p>
          {OUTCOMES.map((o) => (
            <label key={o} className="flex gap-2 items-start text-sm">
              <input
                type="radio"
                name="outcome"
                className="mt-1 accent-[var(--brand)]"
                checked={resolving.outcome === o}
                onChange={() => setResolving({ ...resolving, outcome: o })}
              />
              <span>
                <b>{outcomeText(o)}</b>
                <br />
                <small className="text-mu">{t(`disputes.outcomeHelp.${o}`)}</small>
              </span>
            </label>
          ))}
          {dispute.marks.length > 0 && (
            <div className="grid gap-2 border-t border-bd pt-2">
              <p className="font-semibold text-sm">{t('disputes.marksTitle')}</p>
              <p className="text-sm text-mu">{t('disputes.marksHelp')}</p>
              {dispute.marks.map((m, i) => (
                <fieldset key={`${m.ci}-${m.qi}`} className="grid gap-1 text-sm rounded-xl bg-sunk px-3 py-2">
                  <legend className="sr-only">{m.question}</legend>
                  <span className="font-medium">
                    {m.category} › {m.question}
                  </span>
                  <small className="text-mu">{t('disputes.aiAnswered', { answer: answerText(m.ai) })}</small>
                  <span className="flex flex-wrap items-center gap-3">
                    <span className="text-mu">{t('disputes.rightAnswer')}:</span>
                    {ANSWERS.map((a) => (
                      <label key={a} className="inline-flex items-center gap-1">
                        <input
                          type="radio"
                          name={`mark-${i}`}
                          className="accent-[var(--brand)]"
                          checked={resolving.marks[i]?.right === a}
                          onChange={() =>
                            setResolving({
                              ...resolving,
                              marks: resolving.marks.map((x, j) => (j === i ? { ...x, right: a } : x)),
                            })
                          }
                        />
                        {answerText(a)}
                      </label>
                    ))}
                  </span>
                </fieldset>
              ))}
            </div>
          )}
          <label className="grid gap-1 text-sm font-medium">
            <span>
              {t('disputes.note')} <span className="text-mu font-normal">{t('disputes.optional')}</span>
            </span>
            <textarea
              className={field}
              rows={3}
              maxLength={500}
              value={resolving.note}
              onChange={(e) => setResolving({ ...resolving, note: e.target.value })}
            />
          </label>
          <div className="flex gap-2 justify-end">
            <button type="button" className={smallButton} onClick={() => setResolving(null)}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                // a safeguard: resolving cannot be undone and the agent is told, so this question is always asked
                if (!window.confirm(t('disputes.confirm'))) return;
                void run(async () => {
                  after(await api(`/disputes/${review.id}/resolve`, company.id, { method: 'POST', body: resolving }));
                  setResolving(null);
                }, t('disputes.resolved'));
              }}
            >
              {t('disputes.resolve')}
            </button>
          </div>
        </fieldset>
      )}
      {!open && dispute.outcome && (
        <p className="text-sm text-mu">
          {t('disputes.resolvedBy', {
            name: dispute.resolvedByName,
            date: dispute.resolvedAt ? when(dispute.resolvedAt, lang) : '',
            outcome: outcomeText(dispute.outcome),
          })}
          {dispute.note && `: ${dispute.note}`}
        </p>
      )}
    </section>
  );
}

// ------------------------------------------------------------------------------------------- Quality › Disputes

type Period = 'week' | 'month' | 'all' | 'custom';
type Column =
  | 'leadId'
  | 'type'
  | 'disputedOn'
  | 'agent'
  | 'team'
  | 'score'
  | 'status'
  | 'lastMessage'
  | 'outcome'
  | 'reviewer'
  | 'resolvedOn';
const COLUMNS: Column[] = [
  'leadId',
  'type',
  'disputedOn',
  'agent',
  'team',
  'score',
  'status',
  'lastMessage',
  'outcome',
  'reviewer',
  'resolvedOn',
];
/** today's default: everything except Reviewer and Resolved on (the lead ID always shows) */
const DEFAULT_COLUMNS = COLUMNS.filter((c) => c !== 'reviewer' && c !== 'resolvedOn');
const CHANNELS: Channel[] = ['call', 'chat', 'email', 'other'];
interface Filters {
  period: Period;
  from: string;
  to: string;
  team: string;
  agent: string;
  channel: '' | Channel;
  state: '' | State;
}
const NO_FILTERS: Filters = { period: 'month', from: '', to: '', team: '', agent: '', channel: '', state: '' };
const dayOf = (at: string) => new Date(at).toLocaleDateString('sv-SE');
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toLocaleDateString('sv-SE');
type Row = { dispute: Dispute; review: ReviewRow };

export function Disputes({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const { me } = useSession();
  const staff = can(company.role, 'reviews.write');
  const agentView = company.role === 'agent';
  const [disputes, setDisputes] = useState<Dispute[] | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [rates, setRates] = useState<PassRates | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [showColumns, setShowColumns] = useState(false);
  const [columns, setColumns] = useState<Column[]>(() => {
    const saved = me.prefs.columns?.['disputes'];
    return saved?.length ? COLUMNS.filter((c) => c === 'leadId' || saved.includes(c)) : DEFAULT_COLUMNS;
  });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [exporting, setExporting] = useState(false);
  const { message, run, fail } = useAction();

  useEffect(() => {
    void Promise.all([
      api<Dispute[]>('/disputes', company.id),
      api<ReviewRow[]>('/reviews', company.id),
      api<PassRates>('/pass-rates', company.id),
      agentView ? Promise.resolve([]) : api<TeamRow[]>('/teams', company.id),
      agentView ? Promise.resolve([]) : api<PersonRow[]>('/people', company.id),
    ]).then(([d, r, pr, tm, ppl]) => {
      setDisputes(d);
      setReviews(r);
      setRates(pr);
      setTeams(tm.filter((x) => !x.isAdministration));
      setPeople(ppl);
    }, fail);
  }, [company.id, agentView, fail]);

  const set = (change: Partial<Filters>) => {
    setFilters({ ...filters, ...change });
    setPage(1);
  };
  const inPeriod = useCallback(
    (at: string) => {
      const day = dayOf(at);
      const f = filters;
      if (f.period === 'week') return day >= daysAgo(6);
      if (f.period === 'month') return day >= daysAgo(29);
      if (f.period === 'custom') return (!f.from || day >= f.from) && (!f.to || day <= f.to);
      return true;
    },
    [filters],
  );
  /** the review filters (type, team, agent) that the insights also use */
  const reviewFits = useCallback(
    (r: ReviewRow) =>
      (!filters.channel || r.channel === filters.channel) &&
      (!filters.team || r.teamId === filters.team) &&
      (!filters.agent || r.agentId === filters.agent),
    [filters],
  );
  const lastMessage = (d: Dispute) => d.messages.filter((m) => !m.system).at(-1);

  /** every filter but the status: the tiles count within them (as today) */
  const base = useMemo<Row[]>(() => {
    const byId = new Map(reviews.map((r) => [r.id, r]));
    const q = query.trim().toLowerCase();
    return (disputes ?? [])
      .map((dispute) => ({ dispute, review: byId.get(dispute.reviewId) }))
      .filter((x): x is Row => Boolean(x.review))
      .filter(
        ({ dispute, review }) =>
          reviewFits(review) &&
          inPeriod(dispute.openedAt) &&
          (!q ||
            `${review.leadId} ${review.agentName} ${review.campaign} ${dispute.messages.map((m) => m.text).join(' ')}`
              .toLowerCase()
              .includes(q)),
      );
  }, [disputes, reviews, query, reviewFits, inPeriod]);
  const shown = base.filter((x) => !filters.state || x.dispute.state === filters.state);
  const { current, slice } = pageOf(shown, page, perPage);
  const count = (s: State) => base.filter((x) => x.dispute.state === s).length;

  const saveColumns = (next: Column[]) => {
    setColumns(next);
    void api('/me/prefs', undefined, {
      method: 'PUT',
      body: { ...me.prefs, columns: { ...me.prefs.columns, disputes: next } },
    }).catch(() => undefined);
  };
  async function exportExcel() {
    setExporting(true);
    await run(async () => {
      const file = await apiFile('/reviews/export', company.id, {
        ids: shown.map((x) => x.review.id),
        name: 'Disputes',
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = `Disputes_${new Date().toLocaleDateString('sv-SE')}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    }, t('list.export'));
    setExporting(false);
  }

  const agents = people.filter((p) => p.role === 'agent' && (!filters.team || p.teamId === filters.team));
  const cell: Record<Column, (x: Row) => ReactNode> = {
    leadId: ({ review }) => (
      <Link to="/review/$id" params={{ id: review.id }} className="font-mono font-semibold text-ac hover:underline">
        {review.leadId}
      </Link>
    ),
    type: ({ review }) => t(`reviews.channels.${review.channel}`),
    disputedOn: ({ dispute }) => <span className="whitespace-nowrap">{dayOf(dispute.openedAt)}</span>,
    agent: ({ review }) => review.agentName,
    team: ({ review }) => review.teamName || '-',
    score: ({ review }) =>
      review.notScored ? (
        <span className="text-mu">{t('list.notScored')}</span>
      ) : (
        <b className={`font-mono ${passes(review.score, passRateFor(rates, review.teamId)) ? 'text-ok' : 'text-bad'}`}>
          {review.score}%
        </b>
      ),
    status: ({ dispute }) => (
      <span className={`${pill} ${STATE_STYLE[dispute.state]}`}>{t(`disputes.states.${dispute.state}`)}</span>
    ),
    lastMessage: ({ dispute, review }) => {
      const m = lastMessage(dispute);
      return (
        <Link
          to="/review/$id"
          params={{ id: review.id }}
          title={m?.text}
          className="block max-w-72 truncate hover:underline"
        >
          <small className="text-mu">{m?.authorName}</small> {m?.text}
        </Link>
      );
    },
    outcome: ({ dispute }) =>
      dispute.outcome ? (
        <span className={`${pill} ${OUTCOME_STYLE[dispute.outcome]}`}>
          {t(`disputes.outcomesShort.${dispute.outcome}`)}
        </span>
      ) : (
        <span className="text-mu">-</span>
      ),
    reviewer: ({ review }) => review.reviewerName || '-',
    resolvedOn: ({ dispute }) => (dispute.resolvedAt ? dayOf(dispute.resolvedAt) : '-'),
  };
  const tile = (key: '' | State, label: string, value: number, color: string) => (
    <button
      key={key || 'all'}
      type="button"
      aria-pressed={filters.state === key}
      onClick={() => set({ state: key })}
      className={`${card} text-left grid gap-1 ${filters.state === key ? 'ring-2 ring-brand' : ''}`}
    >
      <span className="text-sm text-mu inline-flex items-center gap-2">
        {key && <i className={`inline-block size-2.5 rounded-full ${color}`} />}
        {label}
      </span>
      <b className="font-display text-3xl">{value}</b>
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

  return (
    <section className="grid gap-4" aria-labelledby="disputes-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="disputes-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('menu.pages.disputes')}
          </h1>
          <p className="text-sm text-mu">{agentView ? t('disputes.introAgent') : t('disputes.introStaff')}</p>
        </div>
        {staff && (
          <button
            type="button"
            className={smallButton}
            disabled={exporting || shown.length === 0}
            onClick={() => void exportExcel()}
          >
            {exporting ? t('list.exporting') : t('list.export')}
          </button>
        )}
      </div>
      <Notice message={message} />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {tile('', t('disputes.total'), base.length, '')}
        {tile('disputed', t('disputes.states.disputed'), count('disputed'), 'bg-bad')}
        {tile('progress', t('disputes.states.progress'), count('progress'), 'bg-ac')}
        {tile('resolved', t('disputes.states.resolved'), count('resolved'), 'bg-ok')}
      </div>

      <div className={`${card} grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
        <label className="grid gap-1 text-sm font-medium">
          {t('disputes.search')}
          <input
            placeholder={t('list.search')}
            className={field}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
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
          t('list.type'),
          filters.channel,
          CHANNELS.map((c) => [c, t(`reviews.channels.${c}`)]),
          (v) => set({ channel: v as Filters['channel'] }),
        )}
        <label className="grid gap-1 text-sm font-medium">
          {t('list.period')}
          <select className={field} value={filters.period} onChange={(e) => set({ period: e.target.value as Period })}>
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
        <div className="self-end">
          <button
            type="button"
            className={smallButton}
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
            {t('disputes.table')}
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
                {t(`disputes.cols.${c}`)}
              </label>
            ))}
          </fieldset>
        )}
        {!disputes && <p className="text-mu">{t('common.loading')}</p>}
        {disputes && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-mu">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="py-1 pr-3 font-semibold uppercase text-xs tracking-wide">
                      {t(`disputes.cols.${c}`)}
                    </th>
                  ))}
                  <th className="py-1 font-semibold uppercase text-xs tracking-wide">{t('list.cols.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((x) => (
                  <tr key={x.dispute.id} className="border-t border-bd align-middle">
                    {columns.map((c) => (
                      <td key={c} className="py-2 pr-3">
                        {cell[c](x)}
                      </td>
                    ))}
                    <td className="py-2">
                      <Link
                        to="/review/$id"
                        params={{ id: x.review.id }}
                        className="inline-grid place-items-center size-8 rounded-s hover:bg-pn2"
                        title={t('disputes.openReview')}
                        aria-label={`${t('disputes.openReview')}: ${x.review.leadId}`}
                      >
                        <Icon name="eye" />
                      </Link>
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

      {staff && disputes && (
        <Insights rows={base} reviews={reviews.filter(reviewFits)} disputes={disputes} inPeriod={inPeriod} />
      )}
    </section>
  );
}

/** What the disputes say (ideas from the Zendesk QA disputes dashboard); the filters above apply. */
function Insights({
  rows,
  reviews,
  disputes,
  inPeriod,
}: {
  rows: Row[];
  reviews: ReviewRow[];
  disputes: Dispute[];
  inPeriod: (at: string) => boolean;
}) {
  const { t } = useTranslation();
  const resolved = rows.filter((x) => x.dispute.resolvedAt && x.dispute.outcome);
  const days = resolved
    .map((x) => (Date.parse(x.dispute.resolvedAt ?? '') - Date.parse(x.dispute.openedAt)) / 864e5)
    .filter((d) => d >= 0);
  const average = days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;
  const ended = (o: Outcome) => resolved.filter((x) => x.dispute.outcome === o).length;
  const most = Math.max(1, ...OUTCOMES.map(ended));
  const BAR: Record<Outcome, string> = { changed: 'bg-ok', partly: 'bg-wn', kept: 'bg-ac' };

  // which categories lost points in the disputed reviews
  const cats = new Map<string, { total: number; changed: number; kept: number }>();
  for (const { dispute, review } of rows)
    for (const c of review.categories.filter((c) => c.possible && c.earned < c.possible)) {
      const x = cats.get(c.name) ?? { total: 0, changed: 0, kept: 0 };
      x.total++;
      if (dispute.outcome === 'kept') x.kept++;
      else if (dispute.outcome) x.changed++;
      cats.set(c.name, x);
    }
  const catRows = [...cats.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8);

  // per agent and per reviewer: their reviews, how many were seen, disputed, and how the disputes ended
  const byReview = new Map(disputes.map((d) => [d.reviewId, d]));
  const scope = reviews.filter((r) => {
    const d = byReview.get(r.id);
    return !d || inPeriod(d.openedAt);
  });
  const per = (key: (r: ReviewRow) => string) => {
    const m = new Map<string, number[]>();
    for (const r of scope) {
      const k = key(r);
      if (!k) continue;
      const d = byReview.get(r.id);
      // reviews, seen, disputes, open, changed, partly, kept
      const add = [
        1,
        r.seenAt ? 1 : 0,
        d ? 1 : 0,
        d && !d.outcome ? 1 : 0,
        ...(['changed', 'partly', 'kept'] as const).map((o) => (d?.outcome === o ? 1 : 0)),
      ];
      const x = m.get(k) ?? [0, 0, 0, 0, 0, 0, 0];
      m.set(
        k,
        x.map((v, i) => v + (add[i] ?? 0)),
      );
    }
    return [...m.entries()]
      .filter(([, x]) => x[2])
      .sort((a, b) => (b[1][2] ?? 0) - (a[1][2] ?? 0))
      .slice(0, 10);
  };
  const H = ['reviews', 'seen', 'disputes', 'open', 'changed', 'partly', 'kept'] as const;
  const th = 'py-1 pr-3 font-semibold uppercase text-xs tracking-wide';
  const table = (first: string, data: [string, number[]][]) =>
    data.length ? (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-mu">
            <tr>
              <th className={th}>{first}</th>
              {H.map((h) => (
                <th key={h} className={th}>
                  {t(`disputes.h.${h}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(([name, x]) => (
              <tr key={name} className="border-t border-bd">
                <td className="py-1.5 pr-3">{name}</td>
                {x.map((v, i) => (
                  <td key={i} className="py-1.5 pr-3 font-mono">
                    {i === 2 ? <b>{v}</b> : i >= 3 ? v || '-' : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="text-mu">-</p>
    );
  const heading = 'font-display text-lg font-bold';

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${card} grid gap-3 content-start`}>
          <h2 className={heading}>{t('disputes.howEnd')}</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-m bg-sunk p-3">
              <div className="text-sm text-mu">{t('disputes.avgTime')}</div>
              <b className="font-display text-2xl">
                {average === null
                  ? '-'
                  : average < 1
                    ? t('disputes.hours', { n: Math.round(average * 24) })
                    : t('disputes.days', { n: average.toFixed(1) })}
              </b>
              <div className="text-xs text-mu">{t('disputes.resolvedCount', { count: resolved.length })}</div>
            </div>
            <div className="rounded-m bg-sunk p-3">
              <div className="text-sm text-mu">{t('disputes.agentRight')}</div>
              <b className="font-display text-2xl">
                {resolved.length
                  ? `${Math.round(((ended('changed') + ended('partly')) / resolved.length) * 100)}%`
                  : '-'}
              </b>
              <div className="text-xs text-mu">{t('disputes.agentRightHelp')}</div>
            </div>
          </div>
          {(['changed', 'partly', 'kept'] as const).map((o) => (
            <div key={o} className="grid gap-1">
              <div className="flex justify-between text-sm">
                <span>{t(`disputes.outcomesShort.${o}`)}</span>
                <b className="font-mono">{ended(o)}</b>
              </div>
              <div className="h-2 rounded-full bg-sunk overflow-hidden">
                <div className={`h-full ${BAR[o]}`} style={{ width: `${(ended(o) / most) * 100}%` }} />
              </div>
            </div>
          ))}
        </section>
        <section className={`${card} grid gap-3 content-start`}>
          <h2 className={heading}>{t('disputes.categories')}</h2>
          {catRows.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-mu">
                <tr>
                  <th className={th}>{t('disputes.category')}</th>
                  <th className={th}>{t('disputes.h.disputes')}</th>
                  <th className={th}>{t('disputes.outcomesShort.changed')}</th>
                  <th className={th}>{t('disputes.outcomesShort.kept')}</th>
                </tr>
              </thead>
              <tbody>
                {catRows.map(([name, x]) => (
                  <tr key={name} className="border-t border-bd">
                    <td className="py-1.5 pr-3">{name}</td>
                    <td className="py-1.5 pr-3 font-mono">
                      <b>{x.total}</b>
                    </td>
                    <td className="py-1.5 pr-3 font-mono">{x.changed || '-'}</td>
                    <td className="py-1.5 pr-3 font-mono">{x.kept || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-mu">{t('disputes.noCategory')}</p>
          )}
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${card} grid gap-3 content-start`}>
          <h2 className={heading}>{t('disputes.who')}</h2>
          {table(
            t('reviews.agent'),
            per((r) => r.agentName),
          )}
        </section>
        <section className={`${card} grid gap-3 content-start`}>
          <h2 className={heading}>{t('disputes.whose')}</h2>
          {table(
            t('reviews.reviewer'),
            per((r) => r.reviewerName),
          )}
        </section>
      </div>
    </>
  );
}
